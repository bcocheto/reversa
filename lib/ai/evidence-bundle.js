import { existsSync, openSync, readFileSync, readSync, readdirSync, closeSync, statSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';

import { scanProjectSignals } from '../commands/project-signals.js';

const DEFAULT_MAX_PREVIEW_BYTES = 4096;
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_ITEMS_PER_SECTION = 8;
const DEFAULT_MAX_SNIPPET_CHARS = 220;

const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.git']);
const EXCLUDED_FILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svgz',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.bz2',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.class',
  '.jar',
  '.war',
  '.wasm',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
]);

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function truncate(text, maxLength = DEFAULT_MAX_SNIPPET_CHARS) {
  const normalized = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function isBlockedPath(relPath) {
  const normalized = toPosixPath(relPath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => EXCLUDED_DIR_NAMES.has(part))) return true;
  const name = parts[parts.length - 1] ?? normalized;
  return EXCLUDED_FILE_NAMES.has(name.toLowerCase());
}

function isBinaryPath(relPath) {
  const ext = extname(relPath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function readPreviewText(filePath, { maxFileBytes = DEFAULT_MAX_FILE_BYTES, previewBytes = DEFAULT_MAX_PREVIEW_BYTES } = {}) {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return '';
    if (stats.size === 0) return '';
    if (stats.size > maxFileBytes) {
      const fd = openSync(filePath, 'r');
      try {
        const buffer = Buffer.alloc(Math.min(previewBytes, stats.size));
        const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
        if (bytesRead <= 0) return '';
        const text = buffer.subarray(0, bytesRead).toString('utf8');
        if (text.includes('\u0000')) return '';
        return text;
      } finally {
        closeSync(fd);
      }
    }

    const text = readFileSync(filePath, 'utf8');
    if (text.includes('\u0000')) return '';
    return text;
  } catch {
    return '';
  }
}

function splitSections(content) {
  return String(content ?? '')
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

function firstUsefulParagraph(content) {
  for (const block of splitSections(content)) {
    const cleaned = block.replace(/^#{1,6}\s+/gm, '').trim();
    if (!cleaned) continue;
    if (/^[-*+]\s+/m.test(cleaned)) continue;
    return truncate(cleaned);
  }
  return '';
}

function firstUsefulLine(content) {
  for (const line of String(content ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^---$/.test(trimmed)) continue;
    return truncate(trimmed);
  }
  return '';
}

function snippetFromText(content) {
  return firstUsefulParagraph(content) || firstUsefulLine(content) || truncate(content);
}

function readEvidenceSnippet(projectRoot, relPath, { kind, reason, maxFileBytes, previewBytes } = {}) {
  if (!relPath) return null;
  const normalized = toPosixPath(relPath);
  if (isBlockedPath(normalized) || isBinaryPath(normalized)) return null;

  const absPath = join(projectRoot, normalized);
  if (!existsSync(absPath) || !statSync(absPath).isFile()) return null;

  const text = readPreviewText(absPath, { maxFileBytes, previewBytes });
  if (!text.trim()) return null;

  return {
    path: rel(projectRoot, absPath),
    kind,
    reason,
    snippet: snippetFromText(text),
  };
}

function makeEvidence(path, kind, reason, snippet) {
  if (!path || !snippet) return null;
  return {
    path: toPosixPath(path),
    kind,
    reason,
    snippet: truncate(snippet),
  };
}

function dedupeEvidence(items = []) {
  const merged = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const key = [item.path, item.kind, item.reason, item.snippet].join('::');
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}

function parseArchitectureClue(clue) {
  const text = String(clue ?? '').trim();
  if (!text) return null;
  const index = text.indexOf(':');
  if (index <= 0) {
    return makeEvidence('analysis', 'architecture-clue', 'Arquitetura observada na análise de sinais.', text);
  }
  const path = text.slice(0, index).trim();
  const snippet = text.slice(index + 1).trim();
  return makeEvidence(path, 'architecture-clue', 'Arquitetura observada na análise de sinais.', snippet || text);
}

function inferFramework(signals) {
  const deps = new Set((signals.dependencyNames ?? []).map((item) => String(item).toLowerCase()));
  if (deps.has('next') || signals.appExists) return 'Next.js';
  if (deps.has('nestjs')) return 'NestJS';
  if (deps.has('express')) return 'Express';
  if (deps.has('fastify')) return 'Fastify';
  if (deps.has('hono')) return 'Hono';
  if (deps.has('react') || deps.has('react-dom')) return 'React';
  if (deps.has('vue')) return 'Vue';
  if (deps.has('svelte')) return 'Svelte';
  if (signals.pyproject || signals.requirements) return 'Python';
  if (signals.composerJson) return 'PHP';
  if (signals.packageJson) return 'Node.js';
  return 'Unknown';
}

function collectRepresentativePaths(projectRoot, relPath, maxItems = 2) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return [];
  if (statSync(absPath).isFile()) {
    return [rel(projectRoot, absPath)];
  }

  const files = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = join(absPath, entry.name);
    if (entry.isDirectory()) {
      const nested = collectRepresentativePaths(projectRoot, join(relPath, entry.name), maxItems);
      files.push(...nested);
      if (files.length >= maxItems) break;
      continue;
    }
    if (isBlockedPath(join(relPath, entry.name)) || isBinaryPath(entry.name)) continue;
    files.push(rel(projectRoot, fullPath));
    if (files.length >= maxItems) break;
  }
  return unique(files);
}

function collectEvidenceForPaths(projectRoot, paths, { kind, reason, maxItems = DEFAULT_MAX_ITEMS_PER_SECTION, maxFileBytes, previewBytes } = {}) {
  const items = [];
  for (const relPath of unique(paths)) {
    if (items.length >= maxItems) break;
    const evidence = readEvidenceSnippet(projectRoot, relPath, { kind, reason, maxFileBytes, previewBytes });
    if (evidence) items.push(evidence);
  }
  return items;
}

function collectDirectoryEvidence(projectRoot, directories, { kind, reason, maxItems = DEFAULT_MAX_ITEMS_PER_SECTION } = {}) {
  const items = [];
  for (const dir of unique(directories)) {
    if (items.length >= maxItems) break;
    const representativeFiles = collectRepresentativePaths(projectRoot, dir, 2);
    if (representativeFiles.length > 0) {
      for (const filePath of representativeFiles) {
        if (items.length >= maxItems) break;
        const evidence = readEvidenceSnippet(projectRoot, filePath, { kind, reason });
        if (evidence) items.push(evidence);
      }
      continue;
    }

    if (existsSync(join(projectRoot, dir))) {
      items.push({
        path: toPosixPath(dir),
        kind,
        reason,
        snippet: 'directory exists',
      });
    }
  }
  return items;
}

function buildProjectMetadata(signals, evidence) {
  return {
    name: signals.projectName,
    type: signals.projectType,
    packageManager: signals.packageManager,
    objective: signals.objectiveText,
    audience: signals.audienceText,
    evidence,
  };
}

function buildStackSummary(signals) {
  return {
    framework: inferFramework(signals),
    detectedStack: signals.stackDetails ?? [],
    architectureLayers: signals.architectureLayers ?? [],
  };
}

function collectPackageScripts(signals) {
  return (signals.packageScripts ?? []).map((script) => ({
    name: script.name,
    command: script.command,
    source: script.source,
  }));
}

function buildSectionEvidence({
  projectRoot,
  signals,
  analysis,
  maxFileBytes,
  previewBytes,
}) {
  const projectMetadataEvidence = [];
  if (signals.packageJson) {
    const scriptSummary = (signals.packageScripts ?? [])
      .slice(0, 4)
      .map((script) => `${script.name}: ${script.command}`)
      .join(' | ');
    const dependencySummary = unique((signals.dependencyNames ?? []).slice(0, 8)).join(', ');
    projectMetadataEvidence.push(makeEvidence(
      'package.json',
      'project-metadata',
      'Pacote e scripts do projeto.',
      [signals.projectName, signals.projectType, scriptSummary, dependencySummary].filter(Boolean).join(' | '),
    ));
  }

  if (signals.readmeExists) {
    projectMetadataEvidence.push(makeEvidence(
      'README.md',
      'project-metadata',
      'Resumo do projeto e intenção declarada.',
      truncate(signals.readmeTitle || signals.readmeObjective || signals.readmeText || 'README presente'),
    ));
  }

  const stackEvidence = [];
  if (signals.packageJson) {
    stackEvidence.push(makeEvidence(
      'package.json',
      'stack',
      'Dependências e scripts apontam para a stack detectada.',
      unique([
        ...(signals.stackDetails ?? []).slice(0, 6),
        ...(signals.dependencyNames ?? []).slice(0, 8),
      ]).join(' | '),
    ));
  }
  if (signals.dockerfile) {
    stackEvidence.push(readEvidenceSnippet(projectRoot, 'Dockerfile', {
      kind: 'stack',
      reason: 'Runtime de container detectado.',
      maxFileBytes,
      previewBytes,
    }));
  }
  if (signals.composeFile) {
    stackEvidence.push(readEvidenceSnippet(projectRoot, signals.composeFile, {
      kind: 'stack',
      reason: 'Orquestração local detectada.',
      maxFileBytes,
      previewBytes,
    }));
  }

  const packageScriptEvidence = (signals.packageScripts ?? []).map((script) => makeEvidence(
    'package.json',
    'package-script',
    `Script de pacote "${script.name}".`,
    `${script.name}: ${script.command}`,
  )).filter(Boolean);

  const mainAreaEvidence = collectDirectoryEvidence(projectRoot, (signals.mainAreas ?? []).map((item) => item.path), {
    kind: 'main-area',
    reason: 'Área principal detectada por sinais estruturais.',
  });

  const docsEvidence = [
    ...collectEvidenceForPaths(projectRoot, ['README.md'], {
      kind: 'doc',
      reason: 'Documentação principal do projeto.',
      maxFileBytes,
      previewBytes,
    }),
    ...collectEvidenceForPaths(projectRoot, (signals.docsFiles ?? []).map((item) => item.path), {
      kind: 'doc',
      reason: 'Arquivo de documentação detectado.',
      maxFileBytes,
      previewBytes,
    }),
  ];

  const agenticSurfacePaths = unique([
    signals.agentsPath,
    signals.claudePath,
    ...(signals.agentsFiles ?? []).map((item) => item.path),
    ...(signals.instructionDocs ?? [])
      .map((doc) => doc.path)
      .filter((path) => /^(AGENTS\.md|CLAUDE\.md|\.agents\/)/.test(path)),
  ]);
  const agenticSurfaceEvidence = [
    ...collectEvidenceForPaths(projectRoot, agenticSurfacePaths, {
      kind: 'agentic-surface',
      reason: 'Superfície agentic existente.',
      maxFileBytes,
      previewBytes,
    }),
  ];

  const workflowEvidence = collectEvidenceForPaths(projectRoot, signals.workflowFiles ?? [], {
    kind: 'workflow',
    reason: 'Fluxo de automação detectado.',
    maxFileBytes,
    previewBytes,
  });

  const testEvidence = collectEvidenceForPaths(projectRoot, signals.testFiles ?? [], {
    kind: 'test-file',
    reason: 'Arquivo de teste detectado.',
    maxItems: 10,
    maxFileBytes,
    previewBytes,
  });

  const migrationPaths = unique([
    ...(signals.migrationFiles ?? []),
    ...(signals.prismaExists ? ['prisma/schema.prisma'] : []),
  ]);
  const migrationEvidence = collectEvidenceForPaths(projectRoot, migrationPaths, {
    kind: 'migration-data',
    reason: 'Sinal de dados, schema ou migração.',
    maxFileBytes,
    previewBytes,
  });
  if (migrationEvidence.length === 0 && (signals.prismaExists || (signals.migrationFiles ?? []).length > 0)) {
    migrationEvidence.push({
      path: signals.prismaExists ? 'prisma/schema.prisma' : (signals.migrationFiles?.[0] ?? 'migrations/'),
      kind: 'migration-data',
      reason: 'Sinal de dados, schema ou migração.',
      snippet: signals.prismaExists ? 'schema Prisma detectado' : 'migration files detected',
    });
  }

  const architectureClueEvidence = (signals.architectureClues ?? [])
    .map((clue) => parseArchitectureClue(clue))
    .filter(Boolean);

  const riskEvidence = Array.isArray(analysis?.risks)
    ? analysis.risks.map((risk) => makeEvidence(
        analysis.reportPath || '.agentforge/reports/project-analysis.md',
        'analysis-risk',
        'Risco conhecido a partir da análise.',
        risk,
      )).filter(Boolean)
    : [];

  return {
    projectMetadataEvidence,
    stackEvidence,
    packageScriptEvidence,
    mainAreaEvidence,
    docsEvidence,
    agenticSurfaceEvidence,
    workflowEvidence,
    testEvidence,
    migrationEvidence,
    architectureClueEvidence,
    riskEvidence,
  };
}

export function buildAiEvidenceBundle(projectRoot, options = {}) {
  const analysis = options.analysis ?? null;
  const state = options.state ?? analysis?.state ?? {};
  const signals = scanProjectSignals(projectRoot, { state });
  const maxFileBytes = Number.isFinite(options.maxFileBytes) ? options.maxFileBytes : DEFAULT_MAX_FILE_BYTES;
  const previewBytes = Number.isFinite(options.previewBytes) ? options.previewBytes : DEFAULT_MAX_PREVIEW_BYTES;
  const knownRisks = Array.isArray(analysis?.risks)
    ? analysis.risks
    : Array.isArray(state.analysis_risks)
      ? state.analysis_risks
      : [];

  const sectionEvidence = buildSectionEvidence({
    projectRoot,
    signals,
    analysis,
    maxFileBytes,
    previewBytes,
  });
  const allEvidence = dedupeEvidence([
    ...sectionEvidence.projectMetadataEvidence,
    ...sectionEvidence.stackEvidence,
    ...sectionEvidence.packageScriptEvidence,
    ...sectionEvidence.mainAreaEvidence,
    ...sectionEvidence.docsEvidence,
    ...sectionEvidence.agenticSurfaceEvidence,
    ...sectionEvidence.workflowEvidence,
    ...sectionEvidence.testEvidence,
    ...sectionEvidence.migrationEvidence,
    ...sectionEvidence.architectureClueEvidence,
    ...sectionEvidence.riskEvidence,
  ]);

  return {
    projectRoot,
    generatedAt: new Date().toISOString(),
    project: buildProjectMetadata(signals, sectionEvidence.projectMetadataEvidence),
    stack: buildStackSummary(signals),
    packageScripts: collectPackageScripts(signals),
    mainAreas: signals.mainAreas ?? [],
    docsDetected: sectionEvidence.docsEvidence,
    agenticSurfaces: unique([
      ...(signals.agentsFiles ?? []).map((item) => item.path),
      ...(signals.instructionDocs ?? [])
        .map((doc) => doc.path)
        .filter((path) => /^(AGENTS\.md|CLAUDE\.md|\.agents\/)/.test(path)),
    ]),
    workflows: signals.workflowFiles ?? [],
    testFiles: signals.testFiles ?? [],
    migrationDataSignals: migrationSummary(signals),
    architectureClues: signals.architectureClues ?? [],
    risks: [...knownRisks],
    evidence: allEvidence,
  };
}

function migrationSummary(signals) {
  const items = [];
  if (signals.prismaExists) {
    items.push('Prisma schema');
  }
  if ((signals.migrationFiles ?? []).length > 0) {
    items.push('Migrations directory');
  }
  if ((signals.dependencyNames ?? []).some((name) => /^(pg|postgres|mysql|sqlite|sqlite3|better-sqlite3|mongodb|mongoose|prisma)/i.test(name))) {
    items.push('Database dependency');
  }
  return unique(items);
}

function renderEvidenceList(items = []) {
  if (!items || items.length === 0) return ['- Nenhuma evidência registrada.'];
  return items.map((item) => `- \`${item.path}\` [${item.kind}] ${item.reason}: ${item.snippet}`);
}

function renderSection(title, lines) {
  return [`## ${title}`, '', ...(lines.length > 0 ? lines : ['- Nenhuma evidência registrada.']), ''].join('\n');
}

export function renderAiEvidenceBrief(bundle) {
  const lines = [];
  lines.push('# AI Evidence Brief');
  lines.push('');
  lines.push(`- Project: ${bundle.project?.name || basename(bundle.projectRoot || '')}`);
  lines.push(`- Type: ${bundle.project?.type || 'unknown'}`);
  lines.push(`- Package manager: ${bundle.project?.packageManager || 'unknown'}`);
  lines.push(`- Framework: ${bundle.stack?.framework || 'unknown'}`);
  lines.push(`- Generated at: ${bundle.generatedAt || new Date().toISOString()}`);
  lines.push('');
  lines.push(renderSection('Project Metadata', renderEvidenceList(bundle.project?.evidence)));
  lines.push(renderSection('Stack and Framework', [
    `- Detected stack: ${(bundle.stack?.detectedStack ?? []).join(', ') || 'none'}`,
    `- Architecture layers: ${(bundle.stack?.architectureLayers ?? []).join(', ') || 'none'}`,
  ]));
  lines.push(renderSection('Package Scripts', (bundle.packageScripts ?? []).length === 0
    ? ['- Nenhum script de pacote detectado.']
    : (bundle.packageScripts ?? []).map((script) => `- \`${script.name}\`: \`${script.command}\``)));
  lines.push(renderSection('Main Areas', (bundle.mainAreas ?? []).length === 0
    ? ['- Nenhuma área principal detectada.']
    : (bundle.mainAreas ?? []).map((area) => `- \`${area.path}\` - ${area.reason}`)));
  lines.push(renderSection('Docs Detected', renderEvidenceList(bundle.docsDetected ?? [])));
  lines.push(renderSection('Agentic Surfaces', renderEvidenceList((bundle.agenticSurfaces ?? []).map((path) => ({
    path,
    kind: 'agentic-surface',
    reason: 'Superfície agentic existente.',
    snippet: 'detected',
  })))));
  lines.push(renderSection('Workflows', renderEvidenceList((bundle.workflows ?? []).map((path) => ({
    path,
    kind: 'workflow',
    reason: 'Fluxo de automação detectado.',
    snippet: 'workflow file',
  })))));
  lines.push(renderSection('Test Files', renderEvidenceList((bundle.testFiles ?? []).map((path) => ({
    path,
    kind: 'test-file',
    reason: 'Arquivo de teste detectado.',
    snippet: 'test file',
  })))));
  lines.push(renderSection('Migration and Data Signals', renderEvidenceList((bundle.migrationDataSignals ?? []).map((item) => ({
    path: item,
    kind: 'migration-data',
    reason: 'Sinal de dados, schema ou migração.',
    snippet: item,
  })))));
  lines.push(renderSection('Architecture Clues', renderEvidenceList((bundle.architectureClues ?? []).map((clue) => parseArchitectureClue(clue)).filter(Boolean))));
  lines.push(renderSection('Known Risks', (bundle.risks ?? []).length === 0
    ? ['- Nenhum risco conhecido informado.']
    : (bundle.risks ?? []).map((risk) => `- ${risk}`)));
  lines.push(renderSection('Evidence', renderEvidenceList(bundle.evidence)));
  return `${lines.join('\n').trimEnd()}\n`;
}

export default {
  buildAiEvidenceBundle,
  renderAiEvidenceBrief,
};
