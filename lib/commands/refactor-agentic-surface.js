import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest, fileStatus } from '../installer/manifest.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { buildContextMapForProject } from './context-map.js';
import { getImportsStructure, writeImportedSnapshot } from './snapshots.js';

const REPORT_PLAN_REL_PATH = '.agentforge/reports/agentic-surface-refactor-plan.md';
const REPORT_APPLY_REL_PATH = '.agentforge/reports/agentic-surface-refactor.md';

const SUGGESTION_DIRS = {
  context: '.agentforge/suggestions/context',
  skills: '.agentforge/suggestions/skills',
  policies: '.agentforge/suggestions/policies',
  flows: '.agentforge/suggestions/flows',
};

const SOURCE_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];
const SOURCE_ROOT_DIRS = ['.agents'];
const CANDIDATE_CANONICAL_DIRS = ['context', 'references', 'policies', 'flows', 'skills'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function slugify(value) {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function parseYamlObject(filePath) {
  try {
    const doc = YAML.parse(readText(filePath));
    return isPlainObject(doc) ? doc : null;
  } catch {
    return null;
  }
}

function loadYamlObject(filePath, fallback) {
  const doc = parseYamlObject(filePath);
  return doc ?? fallback;
}

function collectExistingSnapshotIndex(projectRoot) {
  const snapshotsDir = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots');
  const entries = [];
  if (!existsSync(snapshotsDir) || !statSync(snapshotsDir).isDirectory()) {
    return entries;
  }

  for (const filePath of listFilesRecursive(snapshotsDir)) {
    if (extname(filePath).toLowerCase() !== '.json') continue;
    try {
      const doc = JSON.parse(readText(filePath));
      if (!isPlainObject(doc)) continue;
      if (typeof doc.source_path !== 'string' || typeof doc.source_hash !== 'string') continue;
      entries.push({
        snapshot_path: rel(projectRoot, filePath),
        source_path: doc.source_path,
        source_hash: doc.source_hash,
        source_type: normalizeString(doc.source_type),
      });
    } catch {
      // ignore unreadable snapshots
    }
  }

  return entries;
}

function parseMarkdownSections(content, fileRelPath) {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const headings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.*)$/);
    if (!match) continue;
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      line: index + 1,
    });
  }

  if (headings.length === 0) {
    return [{
      title: basename(fileRelPath, extname(fileRelPath)) || fileRelPath,
      level: 0,
      start_line: 1,
      end_line: Math.max(1, lines.filter(Boolean).length || lines.length),
      text: String(content ?? '').trim(),
    }];
  }

  return headings.map((heading, index) => {
    let endLine = lines.length;
    for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
      if (headings[cursor].level <= heading.level) {
        endLine = headings[cursor].line - 1;
        break;
      }
    }

    const text = lines.slice(heading.line, endLine).join('\n').trim();
    return {
      title: heading.title,
      level: heading.level,
      start_line: heading.line,
      end_line: Math.max(heading.line, endLine),
      text,
    };
  });
}

function scoreText(text, patterns) {
  const lower = String(text ?? '').toLowerCase();
  return patterns.reduce((score, pattern) => score + (pattern.test(lower) ? 1 : 0), 0);
}

function inferContextTarget(sectionText) {
  const text = String(sectionText ?? '');
  const scores = [
    ['project-overview', scoreText(text, [/project/, /overview/, /objective/, /audience/, /stack/, /summary/, /goal/])],
    ['architecture', scoreText(text, [/architecture/, /component/, /layer/, /flow/, /diagram/, /system/])],
    ['conventions', scoreText(text, [/convention/, /naming/, /structure/, /layout/, /organization/, /organisation/])],
    ['coding-standards', scoreText(text, [/coding/, /lint/, /format/, /style/, /typescript/, /eslint/, /review/])],
    ['testing', scoreText(text, [/test/, /qa/, /validation/, /vitest/, /jest/, /npm\s+test/])],
    ['deployment', scoreText(text, [/deploy/, /release/, /rollback/, /production/])],
    ['glossary', scoreText(text, [/glossary/, /glossário/, /term/, /definition/, /vocabulary/, /acronym/])],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : 'unclassified';
}

function inferPolicyTarget(sectionText) {
  const text = String(sectionText ?? '');
  if (scoreText(text, [/protected/, /never modify/, /do not modify/, /readonly/, /read only/, /protected files?/]) > 0) {
    return 'protected-files';
  }
  if (scoreText(text, [/approval/, /confirm before/, /ask before/, /human approval/, /permission/]) > 0) {
    return 'human-approval';
  }
  return 'safety';
}

function inferFlowTarget(sectionText) {
  const text = String(sectionText ?? '');
  if (scoreText(text, [/review/, /review changes/, /pull request/, /regression/]) > 0) {
    return 'review';
  }
  if (scoreText(text, [/release/, /publish/, /deploy/]) > 0) {
    return 'release';
  }
  if (scoreText(text, [/context/, /curation/, /import/, /adopt/, /migrate/, /refactor/]) > 0) {
    return 'context-curation';
  }
  return 'refactor';
}

function inferReferenceTarget(sectionText) {
  const text = String(sectionText ?? '');
  if (scoreText(text, [/https?:\/\//, /docs?/, /documentation/, /external/]) > 0) {
    return 'external-docs';
  }
  if (scoreText(text, [/file/, /path/, /important/, /agentforge\/|\.agentforge\/|ag[ea]nts?\.md|claude\.md/i]) > 0) {
    return 'important-files';
  }
  if (scoreText(text, [/tool/, /mcp/, /plugin/, /connector/, /context7/, /cli/]) > 0) {
    return 'tools';
  }
  return 'commands';
}

function classifySection(section, sourcePath) {
  const bodyText = `${section.title}\n${section.text}`.trim();
  const lowerSource = sourcePath.toLowerCase();

  if (lowerSource.startsWith('.agents/skills/') && lowerSource.endsWith('/skill.md')) {
    const skillId = basename(dirname(sourcePath));
    return {
      category: 'skills',
      targetPath: `.agentforge/skills/${skillId}/SKILL.md`,
      targetId: skillId,
      targetTitle: `${skillId} skill`,
      confidence: 'high',
      curation_status: 'curated',
    };
  }

  if (scoreText(bodyText, [/skill/, /procedure/, /procedure/, /when to use/, /workflow/, /steps?/]) > 0 && scoreText(bodyText, [/command/, /reference/]) === 0) {
    return {
      category: 'skills',
      targetPath: null,
      targetId: null,
      targetTitle: null,
      confidence: 'low',
      curation_status: 'needs-review',
    };
  }

  if (scoreText(bodyText, [/do not modify/, /never modify/, /protected/, /readonly/, /read only/]) > 0) {
    const targetId = inferPolicyTarget(bodyText);
    return {
      category: 'policies',
      targetPath: `.agentforge/policies/${targetId}.md`,
      targetId,
      targetTitle: targetId,
      confidence: 'high',
      curation_status: 'curated',
    };
  }

  if (scoreText(bodyText, [/ask before/, /approval/, /confirm before/, /permission/]) > 0) {
    const targetId = inferPolicyTarget(bodyText);
    return {
      category: 'policies',
      targetPath: `.agentforge/policies/${targetId}.md`,
      targetId,
      targetTitle: targetId,
      confidence: 'high',
      curation_status: 'curated',
    };
  }

  if (scoreText(bodyText, [/risk/, /safety/, /secret/, /token/, /danger/, /destructive/]) > 0) {
    const targetId = inferPolicyTarget(bodyText);
    return {
      category: 'policies',
      targetPath: `.agentforge/policies/${targetId}.md`,
      targetId,
      targetTitle: targetId,
      confidence: 'medium',
      curation_status: 'needs-review',
    };
  }

  if (scoreText(bodyText, [/step/, /phase/, /workflow/, /handoff/, /checkpoint/, /refactor/, /adopt/, /import/]) > 0) {
    const targetId = inferFlowTarget(bodyText);
    return {
      category: 'flows',
      targetPath: `.agentforge/flows/${targetId}.md`,
      targetId,
      targetTitle: targetId,
      confidence: 'medium',
      curation_status: 'needs-review',
    };
  }

  if (scoreText(bodyText, [/https?:\/\//, /command/, /npx/, /npm run/, /pnpm/, /yarn/, /tool/, /cli/, /path/, /file/]) > 0) {
    const targetId = inferReferenceTarget(bodyText);
    return {
      category: 'context',
      targetPath: `.agentforge/references/${targetId}.md`,
      targetId,
      targetTitle: targetId,
      confidence: 'medium',
      curation_status: 'needs-review',
    };
  }

  const targetId = inferContextTarget(bodyText);
  return {
    category: 'context',
    targetPath: `.agentforge/${targetId === 'unclassified' ? 'context/unclassified.md' : `context/${targetId}.md`}`,
    targetId,
    targetTitle: targetId,
    confidence: targetId === 'unclassified' ? 'low' : 'medium',
    curation_status: targetId === 'unclassified' ? 'needs-review' : 'curated',
  };
}

function buildSkillMigration(sourcePath) {
  const skillId = basename(dirname(sourcePath));
  return {
    category: 'skills',
    sourcePath,
    sourceType: 'legacy-skill',
    targetPath: `.agentforge/skills/${skillId}/SKILL.md`,
    targetId: skillId,
    targetTitle: `${skillId} skill`,
    sourceTitle: basename(sourcePath),
    confidence: 'high',
    curation_status: 'curated',
    sectionTitle: 'Skill definition',
    body: readText(join(process.cwd(), sourcePath)),
  };
}

function collectSources(projectRoot) {
  const sources = [];

  for (const relPath of SOURCE_ROOT_FILES) {
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) continue;
    sources.push({
      sourcePath: relPath,
      sourceType: relPath === 'AGENTS.md' ? 'codex-entrypoint' : 'claude-entrypoint',
      absPath,
      content: readText(absPath),
      kind: 'markdown',
    });
  }

  for (const relDir of SOURCE_ROOT_DIRS) {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const absPath of listFilesRecursive(absDir)) {
      const relPath = rel(projectRoot, absPath);
      if (statSync(absPath).isDirectory()) continue;
      sources.push({
        sourcePath: relPath,
        sourceType: relPath.startsWith('.agents/skills/') && basename(relPath).toUpperCase() === 'SKILL.MD'
          ? 'legacy-skill'
          : relPath.startsWith('.agents/') ? 'legacy-agentic-doc' : 'legacy-agentic-doc',
        absPath,
        content: readText(absPath),
        kind: extname(absPath).toLowerCase() === '.md' ? 'markdown' : 'file',
      });
    }
  }

  return sources.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

function buildFragmentsForSource(source) {
  if (source.sourceType === 'legacy-skill') {
    const skillId = basename(dirname(source.sourcePath));
    return [{
      category: 'skills',
      targetPath: `.agentforge/skills/${skillId}/SKILL.md`,
      targetId: skillId,
      targetTitle: `${skillId} skill`,
      sourcePath: source.sourcePath,
      sourceType: source.sourceType,
      sourceTitle: basename(source.sourcePath),
      sectionTitle: 'Skill definition',
      text: source.content.trim(),
      startLine: 1,
      endLine: Math.max(1, source.content.replace(/\r\n/g, '\n').split('\n').filter(Boolean).length || source.content.split('\n').length),
      confidence: 'high',
      curation_status: 'curated',
    }];
  }

  if (source.kind !== 'markdown') {
    return [];
  }

  const sections = parseMarkdownSections(source.content, source.sourcePath);
  return sections.map((section) => {
    const classification = classifySection(section, source.sourcePath);
    return {
      category: classification.category,
      targetPath: classification.targetPath,
      targetId: classification.targetId,
      targetTitle: classification.targetTitle,
      sourcePath: source.sourcePath,
      sourceType: source.sourceType,
      sourceTitle: section.title,
      sectionTitle: section.title,
      text: section.text,
      startLine: section.start_line,
      endLine: section.end_line,
      confidence: classification.confidence,
      curation_status: classification.curation_status,
    };
  });
}

function groupFragmentsByTarget(fragments) {
  const groups = new Map();
  for (const fragment of fragments) {
    if (!fragment.targetPath) continue;
    const next = groups.get(fragment.targetPath) ?? [];
    next.push(fragment);
    groups.set(fragment.targetPath, next);
  }

  return [...groups.entries()].map(([targetPath, groupFragments]) => ({
    targetPath,
    fragments: groupFragments.sort((a, b) => {
      if (a.sourcePath === b.sourcePath) return a.startLine - b.startLine || a.sectionTitle.localeCompare(b.sectionTitle);
      return a.sourcePath.localeCompare(b.sourcePath);
    }),
  })).sort((a, b) => a.targetPath.localeCompare(b.targetPath));
}

function humanizePathTitle(targetPath) {
  const stem = basename(targetPath, extname(targetPath));
  return stem
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function renderTargetDocument(targetPath, fragments) {
  const title = humanizePathTitle(targetPath);
  const lines = [
    `# ${title}`,
    '',
    'Migrado da superfície agentic legada.',
    '',
  ];

  const lineRanges = [];
  for (const fragment of fragments) {
    const sectionStartLine = lines.length + 1;
    lines.push(`## Source: ${fragment.sourcePath}`);
    lines.push('');
    if (fragment.sectionTitle && fragment.sectionTitle !== basename(fragment.sourcePath)) {
      lines.push(`### ${fragment.sectionTitle}`);
      lines.push('');
    }
    if (fragment.text.trim()) {
      lines.push(...fragment.text.replace(/\r\n/g, '\n').split('\n'));
    } else {
      lines.push('- Empty section.');
    }
    lines.push('');
    const sectionEndLine = lines.length - 1;
    lineRanges.push({
      fragment,
      start_line: sectionStartLine,
      end_line: sectionEndLine,
    });
  }

  return {
    title,
    content: `${lines.join('\n').trimEnd()}\n`,
    lineRanges,
  };
}

function targetKindFromPath(targetPath) {
  if (targetPath.startsWith('.agentforge/skills/')) return 'skills';
  if (targetPath.startsWith('.agentforge/policies/')) return 'policies';
  if (targetPath.startsWith('.agentforge/flows/')) return 'flows';
  if (targetPath.startsWith('.agentforge/references/')) return 'references';
  return 'context';
}

function targetPurposeFromFragments(fragments) {
  const first = fragments.find((fragment) => normalizeString(fragment.sectionTitle));
  return normalizeString(first?.sectionTitle) || 'Migrated legacy agentic content';
}

function buildSuggestionDoc(targetPath, fragments, { apply = false } = {}) {
  return {
    version: 1,
    generated_by: 'refactor-agentic-surface',
    mode: apply ? 'apply' : 'plan',
    target_path: targetPath,
    target_kind: targetKindFromPath(targetPath),
    purpose: targetPurposeFromFragments(fragments),
    source_paths: [...new Set(fragments.map((fragment) => fragment.sourcePath))],
    fragments: fragments.map((fragment) => ({
      source_path: fragment.sourcePath,
      source_type: fragment.sourceType,
      section_title: fragment.sectionTitle,
      summary: normalizeString(fragment.text).split(/\r?\n/)[0] ?? '',
      confidence: fragment.confidence,
      curation_status: fragment.curation_status,
      target_path: fragment.targetPath,
    })),
  };
}

function loadContextIndex(projectRoot) {
  const filePath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  const fallback = {
    version: 2,
    always_load: [],
    items: [],
    skills: [],
    flows: [],
    task_contexts: {},
  };
  const doc = loadYamlObject(filePath, fallback);
  return {
    filePath,
    relPath: rel(projectRoot, filePath),
    doc: {
      version: 2,
      always_load: Array.isArray(doc.always_load) ? doc.always_load : fallback.always_load,
      items: Array.isArray(doc.items) ? doc.items : [],
      skills: Array.isArray(doc.skills) ? doc.skills : [],
      flows: Array.isArray(doc.flows) ? doc.flows : [],
      task_contexts: isPlainObject(doc.task_contexts) ? doc.task_contexts : {},
    },
  };
}

function mergeById(items, entry) {
  const next = Array.isArray(items) ? [...items] : [];
  const id = normalizeString(entry?.id);
  if (!id) return next;
  const index = next.findIndex((item) => isPlainObject(item) && normalizeString(item.id) === id);
  if (index >= 0) {
    next[index] = { ...next[index], ...entry };
    return next;
  }
  next.push(entry);
  return next;
}

function ensureContextIndexEntry(indexDoc, targetPath, fragments) {
  const relPath = targetPath.replace(/^\.\//, '');
  const item = {
    id: slugify(relPath) || basename(relPath, extname(relPath)),
    path: relPath.replace(/^\.(\/|\\)agentforge\//, '').replace(/^\.\//, '').replace(/^\.agentforge\//, ''),
    purpose: targetPurposeFromFragments(fragments),
  };
  if (targetPath.startsWith('.agentforge/skills/')) {
    item.id = basename(dirname(targetPath));
    item.path = `skills/${item.id}/SKILL.md`;
    item.purpose = targetPurposeFromFragments(fragments);
    indexDoc.skills = mergeById(indexDoc.skills, item);
    return;
  }

  if (targetPath.startsWith('.agentforge/flows/')) {
    item.id = basename(targetPath, extname(targetPath));
    item.path = `flows/${item.id}.md`;
    indexDoc.flows = mergeById(indexDoc.flows, item);
    return;
  }

  if (targetPath.startsWith('.agentforge/context/')) {
    item.id = basename(targetPath, extname(targetPath));
    item.path = `context/${item.id}.md`;
  } else if (targetPath.startsWith('.agentforge/references/')) {
    item.id = basename(targetPath, extname(targetPath));
    item.path = `references/${item.id}.md`;
  } else if (targetPath.startsWith('.agentforge/policies/')) {
    item.id = basename(targetPath, extname(targetPath));
    item.path = `policies/${item.id}.md`;
  }

  indexDoc.items = mergeById(indexDoc.items, item);
}

function buildContextIndexUpdate(projectRoot, targetGroups) {
  const contextIndex = loadContextIndex(projectRoot);
  for (const { targetPath, fragments } of targetGroups) {
    ensureContextIndexEntry(contextIndex.doc, targetPath, fragments);
  }
  return contextIndex;
}

function loadContextMap(projectRoot) {
  const filePath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
  const fallback = {
    version: 1,
    generated_by: 'context-curator',
    updated_at: null,
    items: [],
  };
  const doc = loadYamlObject(filePath, fallback);
  return {
    filePath,
    relPath: rel(projectRoot, filePath),
    doc: {
      version: 1,
      generated_by: normalizeString(doc.generated_by) || 'context-curator',
      updated_at: doc.updated_at ?? null,
      items: Array.isArray(doc.items) ? doc.items : [],
    },
  };
}

function contextKindFromTargetPath(targetPath) {
  if (targetPath.includes('/project-overview.')) return 'project-overview';
  if (targetPath.includes('/architecture.')) return 'architecture';
  if (targetPath.includes('/conventions.')) return 'coding-standard';
  if (targetPath.includes('/coding-standards.')) return 'coding-standard';
  if (targetPath.includes('/testing.')) return 'testing';
  if (targetPath.includes('/deployment.')) return 'deployment';
  if (targetPath.includes('/glossary.')) return 'glossary-term';
  if (targetPath.includes('/protected-files.')) return 'policy';
  if (targetPath.includes('/human-approval.')) return 'policy';
  if (targetPath.includes('/safety.')) return 'policy';
  if (targetPath.includes('/review.')) return 'workflow';
  if (targetPath.includes('/release.')) return 'workflow';
  if (targetPath.includes('/context-curation.')) return 'workflow';
  if (targetPath.includes('/refactor.')) return 'workflow';
  if (targetPath.includes('/commands.')) return 'command';
  if (targetPath.includes('/important-files.')) return 'reference';
  if (targetPath.includes('/external-docs.')) return 'reference';
  if (targetPath.includes('/tools.')) return 'tooling';
  return 'unknown';
}

function renderContextMapItems(targetGroups, projectRoot) {
  const items = [];
  for (const { targetPath, fragments } of targetGroups) {
    const relPath = targetPath.replace(/^\.\//, '').replace(/^\.agentforge\//, '');
    const kind = contextKindFromTargetPath(targetPath);
    const rendered = renderTargetDocument(targetPath, fragments);
    for (const [index, lineRange] of rendered.lineRanges.entries()) {
      const fragment = lineRange.fragment;
      items.push({
        id: slugify(`${relPath}-${index + 1}-${fragment.sourcePath}`),
        title: fragment.sectionTitle || humanizePathTitle(targetPath),
        kind,
        file: relPath,
        start_line: lineRange.start_line,
        end_line: lineRange.end_line,
        summary: normalizeString(fragment.text).split(/\r?\n/)[0] || fragment.sectionTitle || humanizePathTitle(targetPath),
        confidence: fragment.confidence,
        curation_status: fragment.curation_status,
        owner_agent: 'context-curator',
        source: {
          type: 'legacy-agentic-surface',
          evidence: [
            fragment.sourcePath,
            `${fragment.sourcePath}:${fragment.startLine}-${fragment.endLine}`,
          ],
        },
      });
    }
  }

  return items;
}

function buildPlanArtifacts(projectRoot, { apply = false } = {}) {
  const sources = collectSources(projectRoot);
  const existingSnapshots = collectExistingSnapshotIndex(projectRoot);
  const fragments = sources.flatMap(buildFragmentsForSource).filter((fragment) => fragment.targetPath);
  const targetGroups = groupFragmentsByTarget(fragments);
  const targetDocs = targetGroups.map(({ targetPath, fragments: groupFragments }) => ({
    targetPath,
    ...renderTargetDocument(targetPath, groupFragments),
    groupFragments,
  }));
  const snapshotIndex = new Set(existingSnapshots.map((item) => `${item.source_path}::${item.source_hash}`));

  return {
    sources,
    fragments,
    targetGroups,
    targetDocs,
    snapshotIndex,
    planDoc: {
      version: 1,
      generated_by: 'refactor-agentic-surface',
      mode: apply ? 'apply' : 'plan',
      source_files: sources.map((source) => source.sourcePath),
      targets: targetDocs.map((doc) => ({
        path: doc.targetPath,
        title: doc.title,
        source_paths: [...new Set(doc.groupFragments.map((fragment) => fragment.sourcePath))],
        count: doc.groupFragments.length,
      })),
    },
    existingSnapshots,
  };
}

function updateState(projectRoot, { reportPath, summary, touchedPaths, force, mode }) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  if (!existsSync(statePath)) return null;
  const state = JSON.parse(readText(statePath));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];

  const nextState = {
    ...state,
    agentic_surface_refactor: {
      mode,
      force,
      report_path: reportPath,
      ...summary,
    },
    last_agentic_surface_refactor_at: new Date().toISOString(),
    created_files: [...new Set([...createdFiles, ...touchedPaths])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return { statePath, state: nextState };
}

function writeYaml(filePath, doc) {
  ensureDir(filePath);
  writeFileSync(filePath, `${YAML.stringify(doc).trim()}\n`, 'utf8');
}

function writeTextIfSafe(projectRoot, relPath, content, { force = false } = {}) {
  const absPath = join(projectRoot, relPath);
  const manifest = loadManifest(projectRoot);
  const status = manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : (existsSync(absPath) ? 'modified' : 'missing');

  if (status === 'modified' && !force) {
    return {
      written: false,
      status,
      relPath,
      absPath,
    };
  }

  ensureDir(absPath);
  writeFileSync(absPath, content, 'utf8');
  return {
    written: true,
    status,
    relPath,
    absPath,
  };
}

function writeManifestAndState(projectRoot, touchedPaths, stateSummary, { force, mode, reportPath }) {
  const manifest = loadManifest(projectRoot);
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, touchedPaths.filter(Boolean)),
  });
  const stateResult = updateState(projectRoot, {
    reportPath,
    summary: stateSummary,
    touchedPaths,
    force,
    mode,
  });
  return stateResult;
}

function renderReport({
  projectRoot,
  mode,
  planArtifacts,
  targetStatuses,
  snapshotResults,
  stateSummary,
  skipped,
  ignored,
  review,
  reportPath,
}) {
  const lines = [];
  lines.push('# Agentic Surface Refactor');
  lines.push('');
  lines.push(`- Mode: ${mode}`);
  lines.push(`- Report: \`${reportPath}\``);
  lines.push(`- Sources read: ${planArtifacts.sources.length}`);
  lines.push(`- Fragments classified: ${planArtifacts.fragments.length}`);
  lines.push(`- Targets planned: ${planArtifacts.targetDocs.length}`);
  lines.push(`- Snapshots preserved: ${snapshotResults.length}`);
  lines.push(`- Ignored: ${ignored.length}`);
  lines.push(`- Needs review: ${review.length}`);
  lines.push('');

  const appendList = (title, items, renderItem, emptyMessage = 'Nenhum item.') => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`- ${renderItem(item)}`);
    }
    lines.push('');
  };

  appendList(
    'Migrated',
    targetStatuses.filter((item) => item.written),
    (item) => `\`${item.relPath}\` (${item.status})${item.review ? ` - review: ${item.review}` : ''}`,
  );
  appendList(
    'Preserved',
    snapshotResults,
    (item) => `\`${item.source_path}\` -> \`${item.snapshot_path}\``,
    'Nenhum snapshot novo foi necessário.',
  );
  appendList(
    'Ignored',
    skipped,
    (item) => `\`${item.sourcePath}\` -> \`${item.targetPath ?? 'n/a'}\` (${item.reason})`,
  );
  appendList(
    'Needs Review',
    review,
    (item) => `\`${item.sourcePath}\` -> \`${item.targetPath}\` (${item.reason})`,
  );

  lines.push('## Target surface');
  lines.push('');
  if (planArtifacts.targetDocs.length === 0) {
    lines.push('- Nenhum destino canônico foi derivado.');
  } else {
    for (const target of planArtifacts.targetDocs) {
      const status = targetStatuses.find((entry) => entry.relPath === rel(projectRoot, join(projectRoot, target.targetPath)));
      lines.push(`- \`${target.targetPath}\` (${target.groupFragments.length} fragment(s))`);
      if (status?.status) {
        lines.push(`  - status: ${status.status}`);
      }
    }
  }
  lines.push('');

  lines.push('## State summary');
  lines.push('');
  lines.push(`- ${JSON.stringify(stateSummary)}`);
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildSuggestionPaths(projectRoot, planArtifacts) {
  const outputs = [];
  const byCategory = new Map();
  for (const fragment of planArtifacts.fragments) {
    const key = `${fragment.category}::${fragment.targetPath}`;
    const group = byCategory.get(key) ?? [];
    group.push(fragment);
    byCategory.set(key, group);
  }

  for (const [key, fragments] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [category, targetPath] = key.split('::');
    const doc = buildSuggestionDoc(targetPath, fragments, { apply: false });
    const relPath = join(SUGGESTION_DIRS[category] ?? SUGGESTION_DIRS.context, `${slugify(targetPath)}.yaml`);
    outputs.push({
      relPath,
      doc,
    });
  }

  return outputs;
}

function writeSuggestionFiles(projectRoot, planArtifacts) {
  const outputs = buildSuggestionPaths(projectRoot, planArtifacts);
  const written = [];
  const skipped = [];
  for (const output of outputs) {
    const rendered = `${YAML.stringify(output.doc).trim()}\n`;
    const result = writeTextIfSafe(projectRoot, output.relPath, rendered);
    if (result.written) {
      written.push(output.relPath);
    } else {
      skipped.push(output.relPath);
    }
  }
  return { written, skipped };
}

function writePlanReport(projectRoot, reportPath, planArtifacts, suggestionPaths, review, ignored, snapshotResults) {
  const summary = {
    mode: 'plan',
    sources: planArtifacts.sources.length,
    fragments: planArtifacts.fragments.length,
    targets: planArtifacts.targetDocs.length,
    suggestions: suggestionPaths.length,
    snapshots: snapshotResults.length,
    ignored: ignored.length,
    review: review.length,
  };
  const lines = [];
  lines.push('# Agentic Surface Refactor Plan');
  lines.push('');
  lines.push(`- Sources read: ${summary.sources}`);
  lines.push(`- Fragments classified: ${summary.fragments}`);
  lines.push(`- Targets planned: ${summary.targets}`);
  lines.push(`- Suggestions written: ${summary.suggestions}`);
  lines.push(`- Snapshots preserved: ${summary.snapshots}`);
  lines.push(`- Ignored: ${summary.ignored}`);
  lines.push(`- Needs review: ${summary.review}`);
  lines.push('');

  const renderSection = (title, items, renderItem) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('- Nenhum item.');
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`- ${renderItem(item)}`);
    }
    lines.push('');
  };

  renderSection('Sources', planArtifacts.sources, (item) => `\`${item.sourcePath}\``);
  renderSection('Suggestions', suggestionPaths.map((path) => ({ path })), (item) => `\`${item.path}\``);
  renderSection('Ignored', ignored, (item) => `\`${item.sourcePath}\` -> \`${item.targetPath ?? 'n/a'}\` (${item.reason})`);
  renderSection('Needs review', review, (item) => `\`${item.sourcePath}\` -> \`${item.targetPath}\` (${item.reason})`);

  return `${lines.join('\n').trimEnd()}\n`;
}

function determineTargetStatus(projectRoot, manifest, relPath, nextContent) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) {
    return { status: 'missing', writable: true, changed: true, relPath };
  }

  const currentStatus = manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'modified';
  if (currentStatus === 'modified') {
    return { status: 'modified', writable: false, changed: false, relPath };
  }

  const currentContent = readText(absPath);
  return {
    status: currentStatus,
    writable: true,
    changed: currentContent !== nextContent,
    relPath,
  };
}

function applyTargetDocuments(projectRoot, targetDocs, { force = false } = {}) {
  const manifest = loadManifest(projectRoot);
  const writtenTargets = [];
  const skippedTargets = [];

  for (const target of targetDocs) {
    const relPath = rel(projectRoot, join(projectRoot, target.targetPath));
    const status = determineTargetStatus(projectRoot, manifest, relPath, target.content);

    if (!status.writable && !force) {
      skippedTargets.push({
        relPath,
        status: status.status,
        written: false,
        review: 'target modified manually',
      });
      continue;
    }

    if (status.changed || force || status.status === 'missing') {
      writeYaml(join(projectRoot, relPath), { __text: target.content });
      writeFileSync(join(projectRoot, relPath), target.content, 'utf8');
      writtenTargets.push({
        relPath,
        status: status.status,
        written: true,
      });
      continue;
    }

    writtenTargets.push({
      relPath,
      status: status.status,
      written: true,
    });
  }

  return {
    writtenTargets,
    skippedTargets,
  };
}

function writeCanonicalFiles(projectRoot, planArtifacts, { force = false } = {}) {
  const manifest = loadManifest(projectRoot);
  const results = [];
  const skipped = [];
  const touchedPaths = new Set();

  for (const target of planArtifacts.targetDocs) {
    const relPath = rel(projectRoot, join(projectRoot, target.targetPath));
    const absPath = join(projectRoot, relPath);
    const status = manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : (existsSync(absPath) ? 'modified' : 'missing');
    const writable = status === 'missing' || status === 'intact' || force;

    if (!writable) {
      skipped.push({
        sourcePath: target.groupFragments[0]?.sourcePath ?? target.targetPath,
        targetPath: target.targetPath,
        reason: 'target file modified manually',
      });
      continue;
    }

    if (!existsSync(absPath) || readText(absPath) !== target.content || force) {
      ensureDir(absPath);
      writeFileSync(absPath, target.content, 'utf8');
      touchedPaths.add(relPath);
    }

    results.push({
      relPath,
      status,
      written: true,
      review: null,
      sourcePath: target.groupFragments[0]?.sourcePath ?? target.targetPath,
    });
  }

  return { results, skipped, touchedPaths };
}

function buildSnapshotResults(projectRoot, planArtifacts) {
  const snapshotResults = [];
  const seen = new Set();
  for (const source of planArtifacts.sources) {
    const content = source.content;
    if (!content.trim()) continue;
    const sourceType = source.sourceType;
    const snapshot = writeImportedSnapshot(projectRoot, PRODUCT.internalDir, source.sourcePath, content, {
      sourceType,
      capturedAt: new Date().toISOString(),
    });
    const key = `${source.sourcePath}::${snapshot.sourceHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    snapshotResults.push(snapshot);
  }
  return snapshotResults;
}

function collectIgnoredAndReview(planArtifacts, writtenTargets, skippedTargets) {
  const writtenSet = new Set(writtenTargets.map((item) => item.relPath));
  const review = [];
  const ignored = [];

  for (const fragment of planArtifacts.fragments) {
    if (fragment.curation_status === 'needs-review' || !fragment.targetPath) {
      review.push({
        sourcePath: fragment.sourcePath,
        targetPath: fragment.targetPath ?? 'n/a',
        reason: fragment.curation_status === 'needs-review' ? 'confidence or routing requires human review' : 'unclassified fragment',
      });
      continue;
    }

    const relPath = rel(process.cwd(), join(process.cwd(), fragment.targetPath));
    if (!writtenSet.has(relPath) && skippedTargets.some((item) => item.targetPath === fragment.targetPath)) {
      review.push({
        sourcePath: fragment.sourcePath,
        targetPath: fragment.targetPath,
        reason: 'target was preserved because it was modified manually',
      });
      continue;
    }

    if (!writtenSet.has(relPath) && fragment.confidence === 'low') {
      ignored.push({
        sourcePath: fragment.sourcePath,
        targetPath: fragment.targetPath,
        reason: 'low confidence',
      });
    }
  }

  return { ignored, review };
}

export function runRefactorAgenticSurface(projectRoot = process.cwd(), { plan = false, apply = false, force = false } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      error: '.agentforge/ não encontrado ou instalação incompleta. Execute `agentforge install` primeiro.',
    };
  }

  const planArtifacts = buildPlanArtifacts(projectRoot, { apply });
  const snapshotResults = apply ? buildSnapshotResults(projectRoot, planArtifacts) : [];
  const targetWriteResult = apply
    ? writeCanonicalFiles(projectRoot, planArtifacts, { force })
    : { results: [], skipped: [] };
  const targetGroups = planArtifacts.targetGroups;
  const contextIndexUpdate = buildContextIndexUpdate(projectRoot, targetGroups);
  const manifestTouchedPaths = new Set();

  const allFragments = planArtifacts.fragments;
  const review = [];
  const ignored = [];
  for (const fragment of allFragments) {
    if (!fragment.targetPath) {
      review.push({
        sourcePath: fragment.sourcePath,
        targetPath: 'n/a',
        reason: 'no target path was inferred',
      });
      continue;
    }
    if (fragment.curation_status === 'needs-review' && fragment.category !== 'skills') {
      review.push({
        sourcePath: fragment.sourcePath,
        targetPath: fragment.targetPath,
        reason: 'human review recommended',
      });
    }
  }

  const writtenTargets = targetWriteResult.results.map((item) => ({
    ...item,
    relPath: item.relPath,
  }));
  const skippedTargets = targetWriteResult.skipped;
  const ignoredTargets = skippedTargets;

  const stateSummary = {
    mode: apply ? 'apply' : 'plan',
    sources: planArtifacts.sources.length,
    fragments: planArtifacts.fragments.length,
    written_targets: writtenTargets.length,
    skipped_targets: skippedTargets.length,
    snapshots: snapshotResults.length,
    review_items: review.length,
  };

  const reportRelPath = apply ? REPORT_APPLY_REL_PATH : REPORT_PLAN_REL_PATH;
  const reportPath = join(projectRoot, reportRelPath);

  if (apply) {
    const contextMapDoc = buildContextMapForProject(projectRoot);
    const contextMapInfo = loadContextMap(projectRoot);
    const contextIndexPath = contextIndexUpdate.filePath;
    const contextMapPath = contextMapInfo.filePath;
    const contextMapRendered = {
      ...contextMapDoc.doc,
      updated_at: new Date().toISOString(),
    };
    const contextIndexRel = rel(projectRoot, contextIndexPath);
    const contextMapRel = rel(projectRoot, contextMapPath);

    const contextIndexResult = writeTextIfSafe(projectRoot, contextIndexRel, `${YAML.stringify(contextIndexUpdate.doc).trim()}\n`, { force });
    const contextMapResult = writeTextIfSafe(projectRoot, contextMapRel, `${YAML.stringify(contextMapRendered).trim()}\n`, { force });

    if (contextIndexResult.written) manifestTouchedPaths.add(contextIndexRel);
    if (contextMapResult.written) manifestTouchedPaths.add(contextMapRel);

    for (const target of planArtifacts.targetDocs) {
      manifestTouchedPaths.add(rel(projectRoot, join(projectRoot, target.targetPath)));
    }
    for (const snapshot of snapshotResults) {
      manifestTouchedPaths.add(snapshot.snapshot_path);
    }

    const reportText = renderReport({
      projectRoot,
      mode: 'apply',
      planArtifacts,
      targetStatuses: writtenTargets,
      snapshotResults,
      stateSummary,
      skipped: skippedTargets,
      ignored: ignoredTargets,
      review,
      reportPath: reportRelPath,
    });

    const reportResult = writeTextIfSafe(projectRoot, reportRelPath, reportText, { force });
    if (reportResult.written) manifestTouchedPaths.add(reportRelPath);
    writeManifestAndState(projectRoot, [...manifestTouchedPaths], stateSummary, {
      force,
      mode: 'apply',
      reportPath: reportRelPath,
    });

    return {
      ok: true,
      mode: 'apply',
      reportPath: reportRelPath,
      writtenTargets,
      skippedTargets,
      snapshotResults,
      contextIndexPath: rel(projectRoot, contextIndexPath),
      contextMapPath: rel(projectRoot, contextMapPath),
      stateSummary,
    };
  }

  const suggestionResult = writeSuggestionFiles(projectRoot, planArtifacts);
  const writtenSuggestionPaths = suggestionResult.written;
  const report = writePlanReport(projectRoot, reportRelPath, planArtifacts, writtenSuggestionPaths, review, ignored, snapshotResults);
  const reportResult = writeTextIfSafe(projectRoot, reportRelPath, report);
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, [...writtenSuggestionPaths, ...(reportResult.written ? [reportRelPath] : [])]),
  });

  return {
    ok: true,
    mode: 'plan',
    reportPath: reportRelPath,
    suggestionPaths: writtenSuggestionPaths,
    snapshotResults,
    stateSummary,
  };
}

export default async function refactorAgenticSurface(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();
  const plan = args.includes('--plan') || !args.includes('--apply');
  const apply = args.includes('--apply');
  const force = args.includes('--force');

  const result = runRefactorAgenticSurface(projectRoot, { plan, apply, force });
  if (!result.ok) {
    console.log(chalk.red(`\n  ${result.error}\n`));
    return 1;
  }

  if (result.mode === 'apply') {
    console.log(chalk.hex('#ffa203')(`\n  Agentic surface refactor applied: ${result.writtenTargets.length} target(s) written, ${result.skippedTargets.length} skipped.\n`));
    console.log(`  Report: ${result.reportPath}\n`);
    return 0;
  }

  console.log(chalk.hex('#ffa203')(`\n  Agentic surface refactor plan written with ${result.suggestionPaths.length} suggestion file(s).\n`));
  console.log(`  Report: ${result.reportPath}\n`);
  return 0;
}
