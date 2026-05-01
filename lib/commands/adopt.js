import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';

import { buildManifest, loadManifest, saveManifest, fileStatus } from '../installer/manifest.js';
import { detectEngines } from '../installer/detector.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { runImprovementAnalysis } from './improve.js';

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

function renderAdoptionPlan({
  projectRoot,
  state,
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
  lines.push(`- Detected engines: ${formatList(detectedEngines.map((engine) => engine.id))}`);
  lines.push(`- Original files modified by this command: none`);
  lines.push('');

  lines.push('## 1. Ingest');
  lines.push('');
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
  lines.push('- `agentforge refactor-context --apply`');
  lines.push('- `agentforge create-skill <id>`');
  lines.push('- `agentforge compile`');
  lines.push('- `agentforge validate`');
  lines.push('');

  lines.push('## Read-only guarantee');
  lines.push('');
  lines.push('- No original project files were modified.');
  lines.push('- Only `.agentforge/reports/adoption-plan.md` was generated.');

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
    state: installation.state ?? {},
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

export default async function adopt(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Adopt\n`));
    console.log(`  Uso: npx ${PRODUCT.command} adopt\n`);
    console.log('  Faz a ingestão e a auditoria read-only de um projeto já existente.');
    console.log('  Gera `.agentforge/reports/adoption-plan.md` com próximos passos sugeridos.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  const result = buildAdoptionPlan(projectRoot);

  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  const reportPath = writeAdoptionPlan(projectRoot, result.report);

  console.log(chalk.hex('#ffa203')(`  Plano de adoção gerado em ${reportPath}`));
  console.log(chalk.hex('#ffa203')('  Próximos comandos sugeridos:'));
  console.log(chalk.gray('    - agentforge refactor-context --apply'));
  console.log(chalk.gray('    - agentforge create-skill <id>'));
  console.log(chalk.gray('    - agentforge compile'));
  console.log(chalk.gray('    - agentforge validate'));

  return 0;
}
