import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest, fileStatus } from '../installer/manifest.js';
import { detectEngines } from '../installer/detector.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { buildContextMapForProject } from './context-map.js';
import { runIngest } from './ingest.js';
import { runImprovementAnalysis } from './improve.js';
import { runContextAudit, writeContextAudit } from './audit-context.js';
import { runRefactorContext, applyRefactorContext } from './refactor-context.js';
import { runSkillSuggestions } from './suggest-skills.js';
import { writeCoreContextFiles } from './bootstrap.js';
import { compileAgentForge } from '../exporter/index.js';
import { renderManagedEntrypoint, hasBootloaderBlock, replaceBootloaderBlock } from '../exporter/bootloader.js';
import { validateAgentForgeStructure } from './validate.js';
import { repairPhaseState } from './phase-engine.js';
import { writeImportedSnapshot } from './snapshots.js';

const ENTRYPOINT_TARGETS = [
  { path: 'AGENTS.md', label: 'Codex' },
  { path: 'CLAUDE.md', label: 'Claude Code' },
  { path: '.cursor/rules/agentforge.md', label: 'Cursor rules' },
  { path: '.github/copilot-instructions.md', label: 'GitHub Copilot' },
  { path: '.cursorrules', label: 'Cursor legacy' },
  { path: '.windsurfrules', label: 'Windsurf' },
  { path: '.clinerules', label: 'Cline' },
  { path: '.roorules', label: 'Roo Code' },
  { path: 'GEMINI.md', label: 'Gemini CLI' },
  { path: 'CONVENTIONS.md', label: 'Aider' },
  { path: '.kiro/steering/agentforge.md', label: 'Kiro' },
  { path: '.amazonq/rules/agentforge.md', label: 'Amazon Q' },
];

const AGENT_DOC_DIRS = [
  { path: '.agents', label: 'Legacy agent docs' },
  { path: '.claude/agents', label: 'Claude agent docs' },
  { path: '.github/agents', label: 'GitHub agent docs' },
];

const PROJECT_SURFACE_TARGETS = [
  { path: 'README.md', label: 'README' },
  { path: 'package.json', label: 'package.json' },
  { path: 'docs', label: 'docs' },
  { path: 'src', label: 'src' },
  { path: 'lib', label: 'lib' },
  { path: 'app', label: 'app' },
  { path: 'test', label: 'test' },
  { path: 'tests', label: 'tests' },
];

const DATABASE_HINTS = ['prisma', 'knex', 'sequelize', 'typeorm', 'mongoose', 'mongodb', 'pg', 'mysql', 'sqlite', 'sqlite3', 'better-sqlite3'];
const API_HINTS = ['express', 'fastify', 'hono', 'nestjs', 'next', 'nuxt', 'openapi', 'swagger'];
const ADOPTION_ENTRYPOINT_BOOTLOADERS = {
  'AGENTS.md': {
    entryFile: 'AGENTS.md',
    activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
  },
  'CLAUDE.md': {
    entryFile: 'CLAUDE.md',
    activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
  },
};

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function listFilesRecursive(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatList(values = []) {
  const items = values.filter(Boolean);
  return items.length > 0 ? items.join(', ') : 'none';
}

function collectTopLevelSurface(projectRoot) {
  return PROJECT_SURFACE_TARGETS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => ({
      label: target.label,
      path: target.path,
      kind: statSync(join(projectRoot, target.path)).isDirectory() ? 'directory' : 'file',
    }));
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectPackageSignals(projectRoot) {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = existsSync(pkgPath) ? readJson(pkgPath) : null;
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const dependencies = {
    ...(pkg?.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
    ...(pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
  };

  return {
    packageName: normalizeString(pkg?.name),
    scripts,
    dependencyNames: Object.keys(dependencies),
    hasTestScript: Boolean(scripts.test),
    hasBuildScript: Boolean(scripts.build),
    hasLintScript: Boolean(scripts.lint),
  };
}

function collectEntrypoints(projectRoot, manifest) {
  return ENTRYPOINT_TARGETS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => {
      const status = fileStatus(projectRoot, target.path, manifest[target.path]);
      return {
        ...target,
        status,
        size: readFileSync(join(projectRoot, target.path), 'utf8').length,
      };
    });
}

function collectAgentDocs(projectRoot) {
  return AGENT_DOC_DIRS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => {
      const files = listFilesRecursive(join(projectRoot, target.path)).filter((filePath) => extname(filePath).toLowerCase() === '.md');
      return {
        ...target,
        files: files.map((filePath) => rel(projectRoot, filePath)),
      };
    });
}

function buildAuditSummary(audit) {
  const lines = [];
  lines.push('## 2. Audit context');
  lines.push('');
  lines.push(`- Large files: ${audit.largeFiles.length}`);
  lines.push(`- Missing READMEs: ${audit.missingReadmes.length}`);
  lines.push(`- Duplicate content groups: ${audit.duplicateGroups.length}`);
  lines.push(`- Skills without a clear trigger: ${audit.skillsWithoutTrigger.length}`);
  lines.push(`- Policies mixed into context: ${audit.policiesMixedInContexts.length}`);
  lines.push(`- Hard-to-read flows: ${audit.flowsHardToRead.length}`);
  lines.push(`- Generated files without a marker: ${audit.unmarkedGeneratedFiles.length}`);
  lines.push(`- Context-index issues: ${audit.contextIndexIssues.length}`);
  lines.push(`- Contexts without examples: ${audit.contextExamples.length}`);
  lines.push(`- Missing important references: ${audit.importantReferences.length}`);
  lines.push('');

  if (audit.largeFiles.length > 0) {
    lines.push('### Large files');
    lines.push('');
    for (const item of audit.largeFiles.slice(0, 5)) {
      lines.push(`- \`${item.file}\` (${item.reason})`);
    }
    lines.push('');
  }

  if (audit.missingReadmes.length > 0) {
    lines.push('### Missing READMEs');
    lines.push('');
    for (const item of audit.missingReadmes.slice(0, 5)) {
      lines.push(`- \`${item.readme}\` (${item.reason})`);
    }
    lines.push('');
  }

  if (audit.contextIndexIssues.length > 0) {
    lines.push('### Context index');
    lines.push('');
    for (const item of audit.contextIndexIssues) {
      lines.push(`- \`${item.file}\`: ${item.reason}`);
    }
    lines.push('');
  }

  return lines;
}

function buildRefactorContextSection(audit) {
  const lines = [];
  lines.push('## 3. Refactor context (dry run)');
  lines.push('');
  lines.push('- No files were changed.');

  const nextSteps = [];
  if (audit.missingReadmes.length > 0) {
    nextSteps.push('Create the missing READMEs in `.agentforge/` with `agentforge improve --apply` or `agentforge refactor-context --apply`.');
  }
  if (audit.contextIndexIssues.length > 0) {
    nextSteps.push('Split `harness/context-index.yaml` into a slimmer quick index and a fuller catalog.');
  }
  if (audit.contextExamples.length > 0) {
    nextSteps.push('Add concrete examples to the listed contexts so humans can edit them faster.');
  }
  if (audit.importantReferences.length > 0) {
    nextSteps.push('Update `references/important-files.md` so the essential files stay visible.');
  }
  if (audit.largeFiles.length > 0) {
    nextSteps.push('Break very large files into smaller sections before adding more context.');
  }
  if (nextSteps.length === 0) {
    nextSteps.push('The current context is already reasonably structured. Keep it that way as new files are added.');
  }

  lines.push('');
  lines.push(nextSteps.map((item) => `- ${item}`).join('\n'));
  lines.push('');

  return lines;
}

function buildSkillSuggestions(projectRoot, surface, packageSignals, audit) {
  const suggestions = [];
  const hasTests = packageSignals.hasTestScript || surface.some((item) => item.path === 'test' || item.path === 'tests');
  const hasCodeSurface = surface.some((item) => ['src', 'lib', 'app'].includes(item.path));
  const dependencyBlob = packageSignals.dependencyNames.join(' ').toLowerCase();

  if (hasTests) {
    suggestions.push({
      id: 'run-tests',
      reason: 'The project already has a test surface and should have a dedicated testing skill.',
    });
  }

  if (hasCodeSurface || audit.largeFiles.length > 0 || audit.duplicateGroups.length > 0) {
    suggestions.push({
      id: 'review-changes',
      reason: 'The project has enough moving parts to benefit from a structured review skill.',
    });
  }

  if (audit.missingReadmes.length > 0 || audit.contextExamples.length > 0 || audit.contextIndexIssues.length > 0) {
    suggestions.push({
      id: 'create-implementation-plan',
      reason: 'Adoption/refactor work is easier when a planning skill can break changes into steps.',
    });
  }

  if (DATABASE_HINTS.some((hint) => dependencyBlob.includes(hint))) {
    suggestions.push({
      id: 'database-specialist',
      reason: 'Database-related dependencies suggest a dedicated data specialist skill.',
    });
  }

  if (API_HINTS.some((hint) => dependencyBlob.includes(hint))) {
    suggestions.push({
      id: 'api-contract-reviewer',
      reason: 'API-related dependencies suggest a contract-review skill.',
    });
  }

  return [...new Map(suggestions.map((item) => [item.id, item])).values()];
}

const ADOPTION_SURFACE_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];
const ADOPTION_SURFACE_DIRS = ['.agents', '.claude', '.github/agents', '.agentforge/imports/snapshots'];

function hasAnyPattern(text, patterns = []) {
  const lower = String(text ?? '').toLowerCase();
  return patterns.some((pattern) => pattern.test(lower));
}

function rewriteTargetPath(itemPath, sourceSegment, targetSegment, fallbackName = null) {
  const normalized = normalizePathValue(itemPath);
  const lower = normalized.toLowerCase();
  const segment = sourceSegment.toLowerCase();
  const index = lower.indexOf(segment);
  if (index === -1) {
    return fallbackName ? `${targetSegment}/${fallbackName}` : targetSegment;
  }

  const suffix = normalized.slice(index + sourceSegment.length).replace(/^\/+/, '');
  if (!suffix) {
    return targetSegment;
  }

  return `${targetSegment}/${suffix}`;
}

function collectAdoptionSurface(projectRoot) {
  const entries = [];
  const seen = new Set();

  const addFile = (absPath, sourceRoot) => {
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) return;
    const path = rel(projectRoot, absPath);
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({
      path,
      sourceRoot,
      content: readFileSync(absPath, 'utf8'),
      size: readFileSync(absPath, 'utf8').length,
    });
  };

  for (const relPath of ADOPTION_SURFACE_ROOT_FILES) {
    addFile(join(projectRoot, relPath), 'entrypoint');
  }

  for (const relDir of ADOPTION_SURFACE_DIRS) {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const filePath of listFilesRecursive(absDir)) {
      addFile(filePath, relDir);
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyAdoptionSurfaceItem(item) {
  const lowerPath = item.path.toLowerCase();
  const content = item.content ?? '';
  const lowerContent = content.toLowerCase();

  if (lowerPath === 'agents.md' || lowerPath === 'claude.md') {
    return {
      classification: 'entrypoint',
      action: 'preserve',
      target: null,
      confidence: 'high',
      reason: 'root agent entrypoint',
    };
  }

  if (lowerPath.startsWith('.agentforge/imports/snapshots/')) {
    return {
      classification: 'memory',
      action: 'preserve',
      target: null,
      confidence: 'high',
      reason: 'imported snapshot evidence',
    };
  }

  if (
    hasAnyPattern(lowerContent, [/obsolete/, /deprecated/, /legacy/, /remove/, /do not use/, /migrate away/])
    || lowerPath.includes('/legacy/')
  ) {
    return {
      classification: 'obsolete',
      action: 'ignore',
      target: null,
      confidence: 'medium',
      reason: 'legacy or obsolete marker detected',
    };
  }

  if (lowerPath.includes('/skills/') && /skill\.md$/i.test(lowerPath)) {
    const skillTarget = rewriteTargetPath(item.path, '/skills/', '.agentforge/skills', 'SKILL.md');
    return {
      classification: 'skill',
      action: 'migrate',
      target: skillTarget,
      confidence: 'high',
      reason: 'skill definition',
    };
  }

  if (lowerPath.includes('/flows/')) {
    return {
      classification: 'flow',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/flows/', '.agentforge/flows', basename(item.path)),
      confidence: 'high',
      reason: 'workflow or flow surface',
    };
  }

  if (lowerPath.includes('/policies/')) {
    return {
      classification: 'policy',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/policies/', '.agentforge/policies', basename(item.path)),
      confidence: 'high',
      reason: 'policy surface',
    };
  }

  if (lowerPath.includes('/references/')) {
    return {
      classification: 'reference',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/references/', '.agentforge/references', basename(item.path)),
      confidence: 'high',
      reason: 'reference surface',
    };
  }

  if (lowerPath.includes('/memory/')) {
    const memoryId = basename(item.path, extname(item.path));
    return {
      classification: 'memory',
      action: 'preserve',
      target: `.agentforge/memory/${memoryId}.md`,
      confidence: 'high',
      reason: 'memory surface should remain evidence-oriented',
    };
  }

  if (lowerPath.includes('/context/')) {
    return {
      classification: 'durable-context',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/context/', '.agentforge/context', basename(item.path)),
      confidence: 'high',
      reason: 'durable context surface',
    };
  }

  if (lowerPath.includes('/agents/')) {
    const agentId = basename(item.path, extname(item.path));
    return {
      classification: 'agent',
      action: 'migrate',
      target: `.agentforge/agents/${agentId}.yaml`,
      confidence: 'medium',
      reason: 'agent definition surface',
    };
  }

  if (
    hasAnyPattern(lowerContent, [/approval/, /protected/, /do not modify/, /never modify/, /permission/, /confirm before/])
  ) {
    return {
      classification: 'policy',
      action: 'migrate',
      target: `.agentforge/policies/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'policy-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/workflow/, /handoff/, /checkpoint/, /phase/, /step/, /flow/])) {
    return {
      classification: 'flow',
      action: 'migrate',
      target: `.agentforge/flows/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'workflow-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/command/, /cli/, /tool/, /docs?/, /reference/, /link/, /path/])) {
    return {
      classification: 'reference',
      action: 'migrate',
      target: `.agentforge/references/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'reference-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/memory/, /lesson/, /glossary/, /decision/, /question/])) {
    return {
      classification: 'memory',
      action: 'preserve',
      target: `.agentforge/memory/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'memory-like instruction detected',
    };
  }

  return {
    classification: 'needs-review',
    action: 'review',
    target: null,
    confidence: 'low',
    reason: 'ambiguous agentic surface file',
  };
}

export function buildAdoptionSurfacePlan(projectRoot) {
  const surface = collectAdoptionSurface(projectRoot);
  const classified = surface.map((item) => ({
    ...item,
    ...classifyAdoptionSurfaceItem(item),
  }));

  const bySuggestionType = new Map();
  for (const item of classified) {
    if (item.action !== 'migrate' || !item.target) continue;
    const bucket = item.target.startsWith('.agentforge/skills/')
      ? 'skills'
      : item.target.startsWith('.agentforge/flows/')
        ? 'flows'
        : item.target.startsWith('.agentforge/policies/')
          ? 'policies'
          : 'context';
    const next = bySuggestionType.get(bucket) ?? [];
    next.push(item);
    bySuggestionType.set(bucket, next);
  }

  const suggestions = [...bySuggestionType.entries()].map(([kind, items]) => ({
    kind,
    path: `.agentforge/suggestions/${kind}/adoption-agentic-surface.yaml`,
    items,
  })).sort((a, b) => a.kind.localeCompare(b.kind));

  const summary = classified.reduce((acc, item) => {
    acc.total += 1;
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    acc[item.action] = (acc[item.action] ?? 0) + 1;
    return acc;
  }, {
    total: 0,
    entrypoint: 0,
    agent: 0,
    skill: 0,
    flow: 0,
    policy: 0,
    'durable-context': 0,
    reference: 0,
    memory: 0,
    obsolete: 0,
    'needs-review': 0,
    migrate: 0,
    preserve: 0,
    ignore: 0,
    review: 0,
  });

  return {
    surface,
    classified,
    suggestions,
    summary,
  };
}

function renderAdoptionSurfacePlan(projectRoot, plan) {
  const lines = [];
  lines.push('# AgentForge Adoption Plan');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Total agentic surface files: ${plan.summary.total}`);
  lines.push(`- Migrate candidates: ${plan.summary.migrate}`);
  lines.push(`- Preserved: ${plan.summary.preserve}`);
  lines.push(`- Ignored: ${plan.summary.ignore}`);
  lines.push(`- Needs review: ${plan.summary.review}`);
  lines.push('');

  lines.push('## Classification');
  lines.push('');
  lines.push('| File | Classification | Action | Target | Reason |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of plan.classified) {
    lines.push(
      `| \`${item.path}\` | ${item.classification} | ${item.action} | ${item.target ? `\`${item.target}\`` : '—'} | ${String(item.reason).replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');

  const renderSection = (title, predicate, emptyMessage) => {
    lines.push(`## ${title}`);
    lines.push('');
    const items = plan.classified.filter(predicate);
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`- \`${item.path}\` (${item.classification})${item.target ? ` → \`${item.target}\`` : ''}`);
    }
    lines.push('');
  };

  renderSection('What will be migrated', (item) => item.action === 'migrate', 'No migration candidates were identified.');
  renderSection('What will be preserved', (item) => item.action === 'preserve', 'No preserved surfaces were identified.');
  renderSection('What will be ignored', (item) => item.action === 'ignore', 'No ignored surfaces were identified.');
  renderSection('What requires human review', (item) => item.action === 'review', 'No review items were identified.');

  lines.push('## Suggestions');
  lines.push('');
  if (plan.suggestions.length === 0) {
    lines.push('- No suggestion files were written.');
  } else {
    for (const suggestion of plan.suggestions) {
      lines.push(`- \`${suggestion.path}\` (${suggestion.items.length} item(s))`);
    }
  }
  lines.push('');

  lines.push('## Guarantees');
  lines.push('');
  lines.push('- No files outside `.agentforge/reports/` and `.agentforge/suggestions/` were modified.');
  lines.push('- AGENTS.md and CLAUDE.md remain untouched in this mode.');
  lines.push('- Existing snapshots under `.agentforge/imports/snapshots/` are preserved as evidence.');

  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeAdoptionSurfaceOutputs(projectRoot, plan) {
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderAdoptionSurfacePlan(projectRoot, plan), 'utf8');

  for (const suggestion of plan.suggestions) {
    const absPath = join(projectRoot, suggestion.path);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, `${YAML.stringify({
      version: 1,
      generated_by: 'adopt',
      kind: suggestion.kind,
      items: suggestion.items.map((item) => ({
        source_path: item.path,
        classification: item.classification,
        action: item.action,
        target_path: item.target,
        confidence: item.confidence,
        reason: item.reason,
      })),
    }).trim()}\n`, 'utf8');
  }

  return {
    reportPath: rel(projectRoot, reportPath),
    suggestionPaths: plan.suggestions.map((suggestion) => suggestion.path),
  };
}

function readYamlObject(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

function normalizePathValue(value) {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function normalizeEntryId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstMarkdownHeading(content, fallback) {
  const match = String(content ?? '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function buildPathEntry(relPath, {
  id = null,
  title = null,
  purpose = null,
} = {}) {
  const entry = {
    path: normalizePathValue(relPath),
  };
  if (normalizeEntryId(id)) entry.id = normalizeEntryId(id);
  if (normalizeEntryId(title)) entry.title = normalizeEntryId(title);
  if (normalizeEntryId(purpose)) entry.purpose = normalizeEntryId(purpose);
  return entry;
}

function mergePathObjects(existing = [], additions = []) {
  const result = [];
  const index = new Map();
  const keyFor = (entry) => normalizeEntryId(entry?.id) || normalizePathValue(entry?.path);

  for (const entry of Array.isArray(existing) ? existing : []) {
    const key = keyFor(entry);
    if (!key) continue;
    const clone = { ...entry };
    index.set(key, result.length);
    result.push(clone);
  }

  for (const entry of Array.isArray(additions) ? additions : []) {
    const key = keyFor(entry);
    if (!key) continue;
    const clone = { ...entry };
    if (index.has(key)) {
      const currentIndex = index.get(key);
      result[currentIndex] = {
        ...result[currentIndex],
        ...clone,
      };
      continue;
    }
    index.set(key, result.length);
    result.push(clone);
  }

  return result;
}

function loadContextIndexDoc(projectRoot) {
  const indexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  if (!existsSync(indexPath)) return null;
  return readYamlObject(indexPath);
}

function buildDefaultContextIndexDoc(projectRoot, state = {}) {
  const projectName = normalizeEntryId(state.project) || basename(projectRoot);
  const userName = normalizeEntryId(state.user_name) || normalizeEntryId(state.user) || '';
  const projectType = normalizeEntryId(state.project_type) || '';
  const stack = normalizeEntryId(state.stack) || '';
  const goals = Array.isArray(state.primary_goals)
    ? state.primary_goals.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const workflow = normalizeEntryId(state.preferred_workflow) || normalizeEntryId(state.setup_mode) || 'feature-development';
  const qualityLevel = normalizeEntryId(state.quality_level) || 'balanced';
  const engines = Array.isArray(state.engines) ? state.engines.filter((entry) => typeof entry === 'string' && entry.trim()) : [];

  return {
    version: 2,
    always_load: [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ],
    bootstrap: {
      project_name: projectName,
      user_name: userName || null,
      project_type: projectType || null,
      stack: stack || null,
      primary_goals: goals,
      preferred_workflow: workflow,
      quality_level: qualityLevel,
      engines,
      setup_mode: normalizeEntryId(state.setup_mode) || 'bootstrap',
      last_bootstrap_at: normalizeEntryId(state.last_bootstrap_at) || null,
    },
    items: [
      buildPathEntry('context/project-overview.md', {
        id: 'project-overview',
        purpose: 'Project summary, goals, and operating constraints.',
      }),
      buildPathEntry('context/architecture.md', {
        id: 'architecture',
        purpose: 'Architecture map and main delivery flow.',
      }),
      buildPathEntry('context/conventions.md', {
        id: 'conventions',
        purpose: 'Naming, structure, and team conventions.',
      }),
      buildPathEntry('context/coding-standards.md', {
        id: 'coding-standards',
        purpose: 'Code quality expectations and review baseline.',
      }),
      buildPathEntry('context/testing.md', {
        id: 'testing',
        purpose: 'Testing strategy and validation commands.',
      }),
      buildPathEntry('context/deployment.md', {
        id: 'deployment',
        purpose: 'Deployment and rollback notes.',
      }),
      buildPathEntry('context/glossary.md', {
        id: 'glossary',
        purpose: 'Project terminology and recurring terms.',
      }),
      buildPathEntry('harness/context-map.yaml', {
        id: 'context-map',
        purpose: 'Granular context map with file paths and line ranges.',
      }),
    ],
    skills: [
      buildPathEntry('skills/run-tests/SKILL.md', {
        id: 'run-tests',
        purpose: 'Execute and interpret the suite when validating generated changes.',
      }),
      buildPathEntry('skills/review-changes/SKILL.md', {
        id: 'review-changes',
        purpose: 'Review changes with focus on safety, regression, and clarity.',
      }),
      buildPathEntry('skills/create-implementation-plan/SKILL.md', {
        id: 'create-implementation-plan',
        purpose: 'Turn a request into a small, sequenced implementation plan.',
      }),
    ],
    flows: [
      buildPathEntry('flows/feature-development.md', {
        id: 'feature-development',
        purpose: 'Deliver a new capability with discovery, design, implementation, and review.',
      }),
      buildPathEntry('flows/bugfix.md', {
        id: 'bugfix',
        purpose: 'Resolve a reproducible problem with minimal scope.',
      }),
      buildPathEntry('flows/refactor.md', {
        id: 'refactor',
        purpose: 'Improve structure without changing expected behavior.',
      }),
      buildPathEntry('flows/review.md', {
        id: 'review',
        purpose: 'Review change sets before integration.',
      }),
      buildPathEntry('flows/context-curation.md', {
        id: 'context-curation',
        purpose: 'Organize, review, and index durable project context.',
      }),
      buildPathEntry('flows/release.md', {
        id: 'release',
        purpose: 'Promote a safe release-ready delivery.',
      }),
    ],
    task_contexts: {
      discovery: {
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/conventions.md',
        ],
        references: [
          'references/commands.md',
          'references/important-files.md',
        ],
        reports: [
          'reports/',
        ],
      },
      'agent-design': {
        agents: [
          'agents/',
        ],
        suggestions: [
          'suggestions/agents/',
        ],
        memory: [
          'memory/',
        ],
        reports: [
          'reports/',
        ],
      },
      'flow-design': {
        flows: [
          'flows/',
        ],
        always_load: [
          'harness/context-index.yaml',
        ],
        memory: [
          'memory/',
        ],
        reports: [
          'reports/',
        ],
      },
      policies: {
        policies: [
          'policies/',
        ],
        always_load: [
          'harness/context-index.yaml',
        ],
        reports: [
          'reports/',
        ],
      },
      export: {
        entrypoints: [
          'AGENTS.md',
          'CLAUDE.md',
          '.cursor/rules/agentforge.md',
          '.github/copilot-instructions.md',
        ],
        reports: [
          'reports/',
        ],
      },
      review: {
        reports: [
          'reports/',
        ],
      },
      adopt: {
        entrypoints: [
          'AGENTS.md',
          'CLAUDE.md',
        ],
        legacy: [
          '.agents/',
        ],
        context: [
          '.agentforge/context/',
        ],
        skills: [
          '.agentforge/skills/',
        ],
        flows: [
          '.agentforge/flows/',
        ],
        policies: [
          '.agentforge/policies/',
        ],
        references: [
          '.agentforge/references/',
        ],
        always_load: [
          'harness/context-index.yaml',
          'harness/context-map.yaml',
        ],
        reports: [
          'reports/',
        ],
      },
      feature: {
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/coding-standards.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/feature-development.md',
        ],
        policies: [
          'policies/protected-files.md',
          'policies/human-approval.md',
        ],
      },
      bugfix: {
        context: [
          'context/project-overview.md',
          'context/testing.md',
        ],
        skills: [
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/bugfix.md',
        ],
        policies: [
          'policies/protected-files.md',
        ],
      },
      refactor: {
        context: [
          'context/architecture.md',
          'context/conventions.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
        ],
        flows: [
          'flows/refactor.md',
        ],
        policies: [
          'policies/protected-files.md',
        ],
      },
      'context-curation': {
        always_load: [
          'harness/context-index.yaml',
          'harness/context-map.yaml',
        ],
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/domain.md',
          'context/content-flow.md',
          'context/conventions.md',
          'context/coding-standards.md',
          'context/testing.md',
          'context/worker.md',
          'context/deployment.md',
          'context/glossary.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
          'skills/review-changes/SKILL.md',
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/context-curation.md',
          'flows/review.md',
        ],
        policies: [
          'policies/protected-files.md',
          'policies/human-approval.md',
          'policies/safety.md',
        ],
        references: [
          'references/commands.md',
          'references/important-files.md',
          'references/domain.md',
          'references/external-docs.md',
          'references/tools.md',
        ],
      },
    },
  };
}

function buildAdoptionIndexEntry(item, content) {
  const baseName = basename(item.target, extname(item.target));
  const entryId = item.classification === 'skill'
    ? basename(dirname(item.target))
    : baseName;
  return buildPathEntry(item.target.replace(/^\.agentforge\//, ''), {
    id: entryId,
    title: firstMarkdownHeading(content, item.classification === 'skill' ? entryId : baseName),
    purpose: `Migrated from ${item.path}.`,
  });
}

function mergeContextIndexDoc(projectRoot, baseDoc, migrations) {
  const doc = baseDoc ?? buildDefaultContextIndexDoc(projectRoot, {});
  const nextDoc = {
    ...doc,
    always_load: Array.isArray(doc.always_load) ? [...doc.always_load] : [],
    bootstrap: doc.bootstrap && typeof doc.bootstrap === 'object' ? { ...doc.bootstrap } : {},
    items: Array.isArray(doc.items) ? [...doc.items] : [],
    skills: Array.isArray(doc.skills) ? [...doc.skills] : [],
    flows: Array.isArray(doc.flows) ? [...doc.flows] : [],
    task_contexts: doc.task_contexts && typeof doc.task_contexts === 'object' ? { ...doc.task_contexts } : {},
  };

  const skillEntries = [];
  const flowEntries = [];
  const itemEntries = [];

  for (const migration of migrations) {
    const entry = buildAdoptionIndexEntry(migration, migration.content);
    if (migration.classification === 'skill') {
      skillEntries.push(entry);
      continue;
    }
    if (migration.classification === 'flow') {
      flowEntries.push(entry);
      continue;
    }
    itemEntries.push(entry);
  }

  nextDoc.items = mergePathObjects(nextDoc.items, itemEntries);
  nextDoc.skills = mergePathObjects(nextDoc.skills, skillEntries);
  nextDoc.flows = mergePathObjects(nextDoc.flows, flowEntries);

  if (!Array.isArray(nextDoc.always_load) || nextDoc.always_load.length === 0) {
    nextDoc.always_load = [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ];
  }

  return nextDoc;
}

function writeTextIfAllowed(projectRoot, manifest, relPath, content) {
  const absPath = join(projectRoot, relPath);
  const status = existsSync(absPath)
    ? (manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'modified')
    : 'missing';

  if (status === 'modified') {
    return { written: false, skipped: true, reason: 'modified', path: relPath };
  }

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf8');
  return { written: true, skipped: false, reason: null, path: relPath, status };
}

function renderContextMapApplyReport(projectRoot, doc, { migratedCount = 0, skippedCount = 0 } = {}) {
  const lines = [];
  lines.push('# Context Map');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Mode: apply`);
  lines.push(`- Items: ${Array.isArray(doc?.items) ? doc.items.length : 0}`);
  lines.push(`- Generated items: ${Array.isArray(doc?.items) ? doc.items.length : 0}`);
  lines.push(`- Migrated files observed: ${migratedCount}`);
  lines.push(`- Skipped files: ${skippedCount}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- The context map was refreshed from the canonical `.agentforge/` context, references, policies, and flows.');
  return `${lines.join('\n').trimEnd()}\n`;
}

function extractBootloaderBlockLines(content) {
  if (!hasBootloaderBlock(content)) return null;
  const match = String(content).match(/<!-- agentforge:start -->\n([\s\S]*?)\n<!-- agentforge:end -->/);
  if (!match) return null;
  return match[1].split(/\r?\n/);
}

function writeAdoptionEntrypoint(projectRoot, manifest, entrypointPath, state) {
  const bootloader = ADOPTION_ENTRYPOINT_BOOTLOADERS[entrypointPath];
  if (!bootloader) {
    return { written: false, skipped: false, reason: 'unsupported-entrypoint', path: entrypointPath };
  }

  const absPath = join(projectRoot, entrypointPath);
  const existing = existsSync(absPath) ? readFileSync(absPath, 'utf8') : null;
  const nextContent = renderManagedEntrypoint(bootloader, state);

  if (!existing) {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, nextContent, 'utf8');
    return { written: true, skipped: false, reason: null, path: entrypointPath, snapshotPath: null, takeover: 'created' };
  }

  const nextBlockLines = extractBootloaderBlockLines(nextContent);
  if (hasBootloaderBlock(existing)) {
    const writtenContent = nextBlockLines ? replaceBootloaderBlock(existing, nextBlockLines) ?? nextContent : nextContent;
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, writtenContent, 'utf8');
    return {
      written: true,
      skipped: false,
      reason: null,
      path: entrypointPath,
      snapshotPath: null,
      takeover: 'updated',
    };
  }

  const snapshot = writeImportedSnapshot(projectRoot, PRODUCT.internalDir, entrypointPath, existing, {
    sourceType: entrypointPath === 'AGENTS.md' ? 'codex-entrypoint' : 'claude-entrypoint',
  });

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, nextContent, 'utf8');
  return {
    written: true,
    skipped: false,
    reason: null,
    path: entrypointPath,
    snapshotPath: snapshot.snapshotPath,
    takeover: 'taken-over',
  };
}

function applyLegacyMigration(projectRoot, manifest, plan, state) {
  const result = {
    migrated: [],
    snapshots: [],
    skipped: [],
    entrypoints: [],
    contextIndexPath: null,
    contextMapPath: null,
  };
  const writtenMigrationItems = [];

  for (const targetPath of ['AGENTS.md', 'CLAUDE.md']) {
    const entrypointResult = writeAdoptionEntrypoint(projectRoot, manifest, targetPath, state);
    if (entrypointResult.snapshotPath) result.snapshots.push(entrypointResult.snapshotPath);
    if (entrypointResult.written) result.entrypoints.push(entrypointResult.path);
  }

  for (const item of plan.classified) {
    if (item.action !== 'migrate' || !item.target) continue;
    const writeResult = writeTextIfAllowed(projectRoot, manifest, item.target, item.content);
    if (writeResult.written) {
      result.migrated.push(item.target);
      writtenMigrationItems.push(item);
      continue;
    }
    if (writeResult.skipped) {
      result.skipped.push({
        source: item.path,
        target: item.target,
        reason: writeResult.reason,
      });
    }
  }

  const contextIndexTarget = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  const contextIndexDoc = loadContextIndexDoc(projectRoot) ?? buildDefaultContextIndexDoc(projectRoot, state);
  const nextContextIndexDoc = mergeContextIndexDoc(projectRoot, contextIndexDoc, writtenMigrationItems);
  const contextIndexText = `${YAML.stringify(nextContextIndexDoc).trim()}\n`;
  const contextIndexResult = writeTextIfAllowed(projectRoot, manifest, rel(projectRoot, contextIndexTarget), contextIndexText);
  if (contextIndexResult.written) {
    result.contextIndexPath = contextIndexResult.path;
  } else if (contextIndexResult.skipped) {
    result.skipped.push({
      source: 'context-index',
      target: rel(projectRoot, contextIndexTarget),
      reason: contextIndexResult.reason,
    });
  }

  const nextContextMapDoc = buildContextMapForProject(projectRoot);
  const contextMapTarget = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
  const contextMapText = `${YAML.stringify(nextContextMapDoc.doc).trim()}\n`;
  const contextMapResult = writeTextIfAllowed(projectRoot, manifest, rel(projectRoot, contextMapTarget), contextMapText);
  if (contextMapResult.written) {
    result.contextMapPath = contextMapResult.path;
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-map.md');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, renderContextMapApplyReport(projectRoot, nextContextMapDoc.doc, {
      migratedCount: writtenMigrationItems.length,
      skippedCount: result.skipped.length,
    }), 'utf8');
    result.contextMapReport = rel(projectRoot, reportPath);
  } else if (contextMapResult.skipped) {
    result.skipped.push({
      source: 'context-map',
      target: rel(projectRoot, contextMapTarget),
      reason: contextMapResult.reason,
    });
  }

  return result;
}

function renderAdoptionPlan({
  projectRoot,
  state,
  ingestResult,
  surface,
  entrypoints,
  agentDocs,
  packageSignals,
  detectedEngines,
  audit,
  skillSuggestions,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Plan');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${normalizeString(state.project) || basename(projectRoot)}`);
  lines.push(`- Setup mode: ${normalizeString(state.setup_mode) || 'bootstrap'}`);
  lines.push(`- Adoption status: ${normalizeString(state.adoption_status) || 'planned'}`);
  lines.push(`- Refactor applied: no`);
  lines.push(`- Detected engines: ${formatList(detectedEngines.map((engine) => engine.id))}`);
  lines.push(`- Original files modified by this command: none`);
  lines.push('');

  lines.push('## 1. Ingest');
  lines.push('');
  lines.push(`- Agentic sources found: ${ingestResult.found.length}`);
  lines.push(`- Snapshots imported: ${ingestResult.imported.length}`);
  lines.push(`- Sources already known: ${ingestResult.skipped.length}`);
  lines.push(`- Ingest report: .agentforge/reports/ingest.md`);
  lines.push('');
  if (ingestResult.imported.length > 0) {
    lines.push('### Imported snapshots');
    lines.push('');
    for (const item of ingestResult.imported.slice(0, 10)) {
      lines.push(`- \`${item.relPath}\` → \`${item.snapshotPath}\` (${item.type}, ${item.hash.slice(0, 12)}...)`);
    }
    if (ingestResult.imported.length > 10) {
      lines.push(`- ...and ${ingestResult.imported.length - 10} more`);
    }
    lines.push('');
  }

  lines.push('### Project surface');
  lines.push('');
  if (surface.length === 0) {
    lines.push('- No top-level project surface files or folders were found.');
  } else {
    for (const item of surface) {
      lines.push(`- \`${item.path}\` (${item.kind})`);
    }
  }
  lines.push('');

  lines.push('### Entry files');
  lines.push('');
  if (entrypoints.length === 0) {
    lines.push('- No known entry files were found.');
  } else {
    for (const item of entrypoints) {
      lines.push(`- \`${item.path}\` (${item.label}) - ${item.status}`);
    }
  }
  lines.push('');

  if (agentDocs.length > 0) {
    lines.push('### Agent docs');
    lines.push('');
    for (const dir of agentDocs) {
      lines.push(`- \`${dir.path}/\`: ${dir.files.length} file(s)`);
    }
    lines.push('');
  }

  lines.push('### Package signals');
  lines.push('');
  lines.push(`- package.json: ${packageSignals.packageName || 'not set'}`);
  lines.push(`- test script: ${packageSignals.hasTestScript ? 'present' : 'missing'}`);
  lines.push(`- build script: ${packageSignals.hasBuildScript ? 'present' : 'missing'}`);
  lines.push(`- lint script: ${packageSignals.hasLintScript ? 'present' : 'missing'}`);
  lines.push('');

  lines.push(...buildAuditSummary(audit));
  lines.push(...buildRefactorContextSection(audit));

  lines.push('## 4. Suggest skills');
  lines.push('');
  if (skillSuggestions.length === 0) {
    lines.push('- No new skill is strongly suggested yet.');
  } else {
    for (const skill of skillSuggestions) {
      lines.push(`- \`agentforge create-skill ${skill.id}\`: ${skill.reason}`);
    }
  }
  lines.push('');

  lines.push('## 5. Next commands');
  lines.push('');
  lines.push('- `agentforge audit-context`');
  lines.push('- `agentforge refactor-context`');
  lines.push('- `agentforge refactor-context --apply`');
  lines.push('- `agentforge suggest-skills`');
  lines.push('- `agentforge adopt --apply`');
  lines.push('- `agentforge compile`');
  lines.push('- `agentforge compile --takeover-entrypoints`');
  lines.push('- `agentforge validate`');
  lines.push('');

  lines.push('## Read-only guarantee');
  lines.push('');
  lines.push('- No original project files were modified.');
  lines.push('- Files under `.agentforge/` may have been created or updated to record the plan and imported evidence.');

  return lines.join('\n');
}

export function buildAdoptionPlan(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const ingestResult = runIngest(projectRoot);
  if (!ingestResult.ok) {
    return {
      ok: false,
      errors: [ingestResult.error],
    };
  }

  const manifest = loadManifest(projectRoot);
  const detectedEngines = detectEngines(projectRoot).filter((engine) => engine.detected);
  const surface = collectTopLevelSurface(projectRoot);
  const entrypoints = collectEntrypoints(projectRoot, manifest);
  const agentDocs = collectAgentDocs(projectRoot);
  const packageSignals = collectPackageSignals(projectRoot);
  const auditResult = runImprovementAnalysis(projectRoot);
  if (!auditResult.ok) {
    return auditResult;
  }

  const skillSuggestions = buildSkillSuggestions(projectRoot, surface, packageSignals, auditResult.analysis);
  const report = renderAdoptionPlan({
    projectRoot,
    state: ingestResult.state ?? installation.state ?? {},
    ingestResult,
    surface,
    entrypoints,
    agentDocs,
    packageSignals,
    detectedEngines,
    audit: auditResult.analysis,
    skillSuggestions,
  });

  return {
    ok: true,
    report,
    detectedEngines,
    surface,
    entrypoints,
    agentDocs,
    packageSignals,
    audit: auditResult.analysis,
    skillSuggestions,
  };
}

export function writeAdoptionPlan(projectRoot, report) {
  const writer = new Writer(projectRoot);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, writer.manifestPaths),
  });
  return rel(projectRoot, reportPath);
}

function normalizeErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  return String(error).trim();
}

function uniquePaths(paths = []) {
  return [...new Set(paths.filter((entry) => typeof entry === 'string' && entry.length > 0))];
}

function renderAdoptionApplyReport({
  projectRoot,
  status,
  completedSteps,
  failedStep,
  errors,
  writtenPaths,
  migratedPaths = [],
  snapshotPaths = [],
  skippedPaths = [],
  entrypoints = [],
  contextIndexPath = null,
  contextMapPath = null,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Apply Report');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Status: ${status}`);
  lines.push(`- Completed steps: ${completedSteps.length}`);
  lines.push(`- Failed step: ${failedStep ?? 'none'}`);
  lines.push(`- Migrated files: ${migratedPaths.length}`);
  lines.push(`- Snapshots preserved: ${snapshotPaths.length}`);
  lines.push(`- Skipped files: ${skippedPaths.length}`);
  lines.push(`- Entry points taken over: ${entrypoints.length}`);
  lines.push(`- Context index updated: ${contextIndexPath ? 'yes' : 'no'}`);
  lines.push(`- Context map updated: ${contextMapPath ? 'yes' : 'no'}`);
  lines.push('');

  lines.push('## Completed steps');
  lines.push('');
  if (completedSteps.length === 0) {
    lines.push('- None');
  } else {
    for (const step of completedSteps) {
      lines.push(`- ${step}`);
    }
  }
  lines.push('');

  lines.push('## Migrated files');
  lines.push('');
  if (migratedPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of migratedPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Snapshots preserved');
  lines.push('');
  if (snapshotPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of snapshotPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Skipped files');
  lines.push('');
  if (skippedPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const item of skippedPaths) {
      lines.push(`- \`${item.source}\` → \`${item.target}\` (${item.reason})`);
    }
  }
  lines.push('');

  lines.push('## Entrypoints');
  lines.push('');
  if (entrypoints.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of entrypoints) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Context files');
  lines.push('');
  lines.push(`- Context index: ${contextIndexPath ?? 'not updated'}`);
  lines.push(`- Context map: ${contextMapPath ?? 'not updated'}`);
  lines.push('');

  lines.push('## Failed step');
  lines.push('');
  lines.push(`- ${failedStep ?? 'none'}`);
  lines.push('');

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  lines.push('## Written files');
  lines.push('');
  if (writtenPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of writtenPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- This report records the partial apply trail for the latest adoption run.');

  return `${lines.join('\n').trimEnd()}\n`;
}

function writeAdoptionApplyReport(projectRoot, summary) {
  const writer = new Writer(projectRoot);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md');
  const report = renderAdoptionApplyReport({ projectRoot, ...summary });
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, writer.manifestPaths),
  });
  return rel(projectRoot, reportPath);
}

function updateAdoptionState(projectRoot, { status, failedStep = null, lastError = null } = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.last_adopt_at = new Date().toISOString();
  state.adoption_status = status;
  if (failedStep) state.adoption_failed_step = failedStep;
  else delete state.adoption_failed_step;
  if (lastError) state.last_adopt_error = lastError;
  else delete state.last_adopt_error;
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, [join(PRODUCT.internalDir, 'state.json')]),
  });
  return state;
}

export async function runAdoptApply(projectRoot) {
  const errors = [];
  const completedSteps = [];
  const writtenPaths = [];
  const migratedPaths = [];
  const snapshotPaths = [];
  const skippedPaths = [];
  const entrypoints = [];
  let contextIndexPath = null;
  let contextMapPath = null;
  let failedStep = null;
  let ingestResult = null;
  let applyResult = null;
  let planResult = null;
  let validationResult = null;
  let stateSnapshot = null;

  const finalizer = ({ status, failedStep: nextFailedStep = null, lastError = null } = {}) => {
    const reportRelPath = rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md'));
    writtenPaths.push(reportRelPath);
    updateAdoptionState(projectRoot, {
      status,
      failedStep: nextFailedStep,
      lastError,
    });
    const reportPath = writeAdoptionApplyReport(projectRoot, {
      status,
      completedSteps,
      failedStep: nextFailedStep,
      errors,
      writtenPaths: uniquePaths(writtenPaths),
      migratedPaths,
      snapshotPaths,
      skippedPaths,
      entrypoints,
      contextIndexPath,
      contextMapPath,
    });
    return reportPath;
  };

  const fail = (step, error) => {
    failedStep = step;
    const message = normalizeErrorMessage(error) || 'Adoption apply failed.';
    errors.push(message);
    const reportPath = finalizer({
      status: 'apply-failed',
      failedStep: step,
      lastError: message,
    });
    return {
      ok: false,
      errors,
      step,
      reportPath,
      completedSteps: [...completedSteps],
      writtenPaths: uniquePaths(writtenPaths),
    };
  };

  try {
    ingestResult = runIngest(projectRoot);
    if (!ingestResult.ok) {
      return fail('ingest', ingestResult.error);
    }
    completedSteps.push('ingest');
    writtenPaths.push(
      ...(Array.isArray(ingestResult.imported) ? ingestResult.imported.map((item) => item.snapshotPath).filter(Boolean) : []),
      ...(ingestResult.reportPath ? [rel(projectRoot, ingestResult.reportPath)] : []),
    );
    if (ingestResult.imports?.readmePath) {
      writtenPaths.push(rel(projectRoot, ingestResult.imports.readmePath));
    }

    stateSnapshot = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));

    planResult = buildAdoptionSurfacePlan(projectRoot);
    const planOutputs = writeAdoptionSurfaceOutputs(projectRoot, planResult);
    completedSteps.push('adoption-plan');
    writtenPaths.push(planOutputs.reportPath, ...planOutputs.suggestionPaths);

    applyResult = applyLegacyMigration(projectRoot, loadManifest(projectRoot), planResult, stateSnapshot);
    completedSteps.push('adoption-migration');
    migratedPaths.push(...applyResult.migrated);
    snapshotPaths.push(...applyResult.snapshots);
    skippedPaths.push(...applyResult.skipped);
    if (applyResult.entrypoints.length > 0) {
      entrypoints.push(...applyResult.entrypoints);
    }
    if (applyResult.contextIndexPath) {
      contextIndexPath = applyResult.contextIndexPath;
      writtenPaths.push(contextIndexPath);
    }
    if (applyResult.contextMapPath) {
      contextMapPath = applyResult.contextMapPath;
      writtenPaths.push(contextMapPath);
    }
    if (applyResult.contextMapReport) {
      writtenPaths.push(applyResult.contextMapReport);
    }
    writtenPaths.push(...migratedPaths, ...snapshotPaths);

    repairPhaseState(projectRoot);
    completedSteps.push('repair-phase-state');
    writtenPaths.push(
      rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'state.json')),
      rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'plan.md')),
    );

    validationResult = validateAgentForgeStructure(projectRoot);
    mkdirSync(dirname(validationResult.reportPath), { recursive: true });
    writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');
    writtenPaths.push(rel(projectRoot, validationResult.reportPath));
    saveManifest(projectRoot, {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, uniquePaths(writtenPaths)),
    });
    if (!validationResult.valid) {
      return fail('validate', validationResult.errors[0]?.message ?? 'Validation failed.');
    }
    completedSteps.push('validate');

    const reportPath = finalizer({
      status: 'applied',
      failedStep: null,
      lastError: null,
    });

    return {
      ok: true,
      ingestResult,
      planResult,
      applyResult,
      validationResult,
      reportPath,
      completedSteps: [...completedSteps],
      writtenPaths: uniquePaths(writtenPaths),
      migratedPaths: [...migratedPaths],
      snapshotPaths: [...snapshotPaths],
      skippedPaths: [...skippedPaths],
      entrypoints: [...entrypoints],
    };
  } catch (error) {
    return fail(failedStep ?? 'unknown', error);
  }
}

export default async function adopt(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const apply = args.includes('--apply');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Adopt\n`));
    console.log(`  Uso: npx ${PRODUCT.command} adopt [--apply]\n`);
    console.log('  Gera um plano da superfície agentic existente.');
    console.log('  Classifica AGENTS.md, CLAUDE.md, .agents/, .claude/, .github/agents/ e snapshots importados.');
    console.log('  Com --apply, o comando preserva snapshots, migra arquivos canônicos e atualiza context-index/context-map.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  if (apply) {
    const result = await runAdoptApply(projectRoot);
    if (!result.ok) {
      console.log(chalk.red(`\n  Adoption apply failed at ${result.step}: ${result.errors[0]}\n`));
      console.log(chalk.gray(`  Relatório: ${result.reportPath}`));
      return 1;
    }

    console.log(chalk.hex('#ffa203')(`\n  Adoption apply concluído: ${result.migratedPaths.length} arquivo(s) migrado(s), ${result.snapshotPaths.length} snapshot(s) preservado(s).\n`));
    console.log(chalk.gray(`  Relatório: ${result.reportPath}`));
    console.log(chalk.gray(`  Context index: ${result.applyResult?.contextIndexPath ?? 'not updated'}`));
    console.log(chalk.gray(`  Context map: ${result.applyResult?.contextMapPath ?? 'not updated'}`));
    return 0;
  }

  const plan = buildAdoptionSurfacePlan(projectRoot);
  const outputs = writeAdoptionSurfaceOutputs(projectRoot, plan);

  console.log(chalk.hex('#ffa203')(`  Plano de adoção gerado em ${outputs.reportPath}`));
  console.log(chalk.gray(`  Surface files classified: ${plan.summary.total}`));
  console.log(chalk.gray(`  Migrate candidates: ${plan.summary.migrate}`));
  console.log(chalk.gray(`  Preserved: ${plan.summary.preserve}`));
  console.log(chalk.gray(`  Ignored: ${plan.summary.ignore}`));
  console.log(chalk.gray(`  Needs review: ${plan.summary.review}`));
  if (outputs.suggestionPaths.length > 0) {
    console.log(chalk.gray('  Suggestion files:'));
    for (const path of outputs.suggestionPaths) {
      console.log(chalk.gray(`    - ${path}`));
    }
  }

  return 0;
}
