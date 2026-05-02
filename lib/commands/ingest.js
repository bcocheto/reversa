import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const IMPORTS_README_TEMPLATE = join(REPO_ROOT, 'templates', 'agentforge', 'imports', 'README.md');

const EXPLICIT_ROOT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.roorules',
  'CONVENTIONS.md',
  '.github/copilot-instructions.md',
];

const EXPLICIT_DIRS = [
  '.cursor/rules',
  '.github/agents',
  '.claude/agents',
  '.claude/skills',
];

const DOC_SCAN_ROOTS = ['README.md', 'docs'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KiB`;
}

function inferImportType(relPath) {
  if (relPath === 'AGENTS.md') return 'codex-entrypoint';
  if (relPath === 'CLAUDE.md') return 'claude-entrypoint';
  if (relPath === '.cursorrules' || relPath.startsWith('.cursor/rules/')) return 'cursor-rule';
  if (relPath === '.github/copilot-instructions.md') return 'copilot-instruction';
  if (relPath.startsWith('.github/agents/') || relPath.startsWith('.claude/agents/')) return 'agent-definition';
  if (relPath.startsWith('.claude/skills/')) return 'skill-definition';
  if (basename(relPath).toUpperCase() === 'CONVENTIONS.MD') return 'convention-doc';
  if (relPath === 'GEMINI.md' || relPath === '.windsurfrules' || relPath === '.clinerules' || relPath === '.roorules') {
    return 'unknown-agentic-doc';
  }
  return 'unknown-agentic-doc';
}

function isExplicitInstructionMarkdown(relPath, content) {
  const fileName = basename(relPath).toLowerCase();
  const lower = content.toLowerCase();

  if (!relPath.startsWith('docs/') && fileName !== 'readme.md') {
    return false;
  }

  if (
    /^#{1,3}\s*(instructions?|rules?|guidelines?|agent instructions?|agent rules?|for agents?)\b/im.test(content) ||
    /<!--\s*agentforge:start\s*-->/i.test(content)
  ) {
    return true;
  }

  const hasAgentSignals =
    /(agentforge|codex|claude|cursor|copilot|gemini|windsurf|cline|roo|agentic)/i.test(lower) &&
    /(instruction|instructions|rule|rules|guideline|guidelines|agent|assistant)/i.test(lower) &&
    /(must|should|do not|never|always|follow|use)/i.test(lower);

  if (!hasAgentSignals) {
    return false;
  }

  return /^(README|CONVENTIONS|INSTRUCTIONS?|RULES?|GUIDELINES?).*\.md$/i.test(basename(relPath));
}

function collectCandidates(projectRoot) {
  const candidates = [];
  const seen = new Set();

  const addFile = (absPath, sourceGroup = 'explicit') => {
    if (!existsSync(absPath) || !statSync(absPath).isFile()) return;
    const relPath = rel(projectRoot, absPath);
    if (seen.has(relPath)) return;
    seen.add(relPath);
    candidates.push({ absPath, relPath, sourceGroup });
  };

  for (const relPath of EXPLICIT_ROOT_FILES) {
    addFile(join(projectRoot, relPath));
  }

  for (const relDir of EXPLICIT_DIRS) {
    for (const filePath of listFilesRecursive(join(projectRoot, relDir))) {
      addFile(filePath);
    }
  }

  for (const relPath of DOC_SCAN_ROOTS) {
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath)) continue;
    if (statSync(absPath).isFile()) {
      const content = readFileSync(absPath, 'utf8');
      if (isExplicitInstructionMarkdown(relPath, content)) {
        addFile(absPath, 'explicit-doc');
      }
      continue;
    }

    for (const filePath of listFilesRecursive(absPath)) {
      if (extname(filePath).toLowerCase() !== '.md') continue;
      const relPathNested = rel(projectRoot, filePath);
      const content = readFileSync(filePath, 'utf8');
      if (isExplicitInstructionMarkdown(relPathNested, content)) {
        addFile(filePath, 'explicit-doc');
      }
    }
  }

  return candidates.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function ensureImportsStructure(projectRoot, internalDir) {
  const importsDir = join(internalDir, 'imports');
  const snapshotsDir = join(importsDir, 'snapshots');
  mkdirSync(snapshotsDir, { recursive: true });

  const readmePath = join(importsDir, 'README.md');
  let createdReadme = false;
  if (!existsSync(readmePath)) {
    const template = existsSync(IMPORTS_README_TEMPLATE)
      ? readFileSync(IMPORTS_README_TEMPLATE, 'utf8')
      : [
          '# Imports',
          '',
          'Esta pasta guarda snapshots de arquivos de instrução agentic encontrados no projeto.',
          '',
          '## Regras',
          '',
          '- Os arquivos originais nunca são alterados por `agentforge ingest`.',
          '- Os snapshots ficam em `snapshots/`.',
          '- Use estes arquivos como base para auditoria e refatoração.',
          '',
        ].join('\n');
    writeFileSync(readmePath, template.endsWith('\n') ? template : `${template}\n`, 'utf8');
    createdReadme = true;
  }

  return { importsDir, snapshotsDir, readmePath, createdReadme };
}

function buildSnapshotPath(snapshotsDir, sourceRelPath, contentHash) {
  const segments = sourceRelPath.split('/');
  return join(snapshotsDir, ...segments, `${contentHash}.json`);
}

function renderSnapshotDoc(sourceRelPath, sourceType, contentHash, contentBytes, content, capturedAt) {
  return `${JSON.stringify({
    snapshot_version: 1,
    source_path: sourceRelPath,
    source_type: sourceType,
    source_hash: contentHash,
    source_size_bytes: contentBytes,
    captured_at: capturedAt,
    content,
  }, null, 2)}\n`;
}

function updateState(projectRoot, updater) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const nextState = updater(state);
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

function updateManifest(projectRoot, relPaths) {
  const current = loadManifest(projectRoot);
  const next = {
    ...current,
    ...buildManifest(projectRoot, relPaths),
  };
  saveManifest(projectRoot, next);
}

function buildReport({
  projectRoot,
  internalDir,
  found,
  imported,
  skipped,
  state,
}) {
  const lines = [];
  const timestamp = new Date().toISOString();

  lines.push('# AgentForge Ingest Report');
  lines.push('');
  lines.push(`- Diretório: \`${rel(projectRoot, internalDir)}\``);
  lines.push(`- Executado em: ${timestamp}`);
  lines.push(`- Arquivos encontrados: ${found.length}`);
  lines.push(`- Arquivos importados: ${imported.length}`);
  lines.push(`- Arquivos ignorados: ${skipped.length}`);
  lines.push(`- Importações registradas no state: ${Array.isArray(state.imported_sources) ? state.imported_sources.length : 0}`);
  lines.push(`- Ingest count: ${state.ingest_count ?? 0}`);
  lines.push('');

  const appendSection = (title, items, emptyMessage, renderItem) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
    } else {
      for (const item of items) {
        lines.push(`- ${renderItem(item)}`);
      }
    }
    lines.push('');
  };

  appendSection(
    'Arquivos encontrados',
    found,
    'Nenhum arquivo agente explícito encontrado.',
    (item) => `\`${item.relPath}\` → \`${item.type}\` (${formatBytes(item.sizeBytes)}, sha256 ${item.hash.slice(0, 12)}...)`,
  );

  appendSection(
    'Arquivos importados',
    imported,
    'Nenhum snapshot novo foi necessário.',
    (item) => `\`${item.relPath}\` → \`${item.type}\` (${formatBytes(item.sizeBytes)}, sha256 ${item.hash.slice(0, 12)}...) → \`${item.snapshotPath}\``,
  );

  if (skipped.length > 0) {
    appendSection(
      'Arquivos ignorados',
      skipped,
      'Nenhum arquivo foi ignorado.',
      (item) => `\`${item.relPath}\` (${item.reason})`,
    );
  }

  lines.push('## Recomendações iniciais');
  lines.push('');
  lines.push('- Revise os snapshots importados antes de alterar qualquer instrução original.');
  lines.push('- Compare entradas redundantes ou conflitantes entre engines e diretórios legados.');
  lines.push('- Trate os docs importados como evidência, não como fonte de verdade definitiva.');
  lines.push('');
  lines.push('## Próximos comandos sugeridos');
  lines.push('');
  lines.push('- `agentforge audit-context`');
  lines.push('- `agentforge refactor-context`');
  lines.push('- `agentforge suggest-skills`');
  lines.push('');

  return lines.join('\n');
}

export function runIngest(projectRoot = process.cwd()) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const statePath = join(internalDir, 'state.json');

  if (!existsSync(internalDir) || !existsSync(statePath)) {
    return {
      ok: false,
      error: '.agentforge/ não encontrado ou instalação incompleta. Execute `agentforge install` ou `agentforge init` primeiro.',
    };
  }

  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      error: '.agentforge/ não encontrado ou instalação incompleta. Execute `agentforge install` ou `agentforge init` primeiro.',
    };
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const imports = ensureImportsStructure(projectRoot, internalDir);
  const candidates = collectCandidates(projectRoot);
  const now = new Date().toISOString();
  const existingImported = Array.isArray(state.imported_sources) ? state.imported_sources : [];
  const importedIndex = new Set(
    existingImported
      .filter(isPlainObject)
      .map((item) => `${item.source_path ?? ''}::${item.source_hash ?? ''}`),
  );
  const nextImportedSources = [...existingImported];
  const found = [];
  const imported = [];
  const skipped = [];
  const reportPath = join(internalDir, 'reports', 'ingest.md');
  const touchedPaths = new Set([
    rel(projectRoot, statePath),
    rel(projectRoot, imports.readmePath),
    rel(projectRoot, reportPath),
  ]);

  for (const candidate of candidates) {
    const content = readFileSync(candidate.absPath, 'utf8');
    const sourceType = inferImportType(candidate.relPath);
    const contentHash = hashContent(content);
    const contentBytes = Buffer.byteLength(content, 'utf8');
    const snapshotPath = buildSnapshotPath(imports.snapshotsDir, candidate.relPath, contentHash);
    const key = `${candidate.relPath}::${contentHash}`;

    found.push({
      relPath: candidate.relPath,
      type: sourceType,
      hash: contentHash,
      sizeBytes: contentBytes,
    });

    if (importedIndex.has(key)) {
      skipped.push({
        relPath: candidate.relPath,
        reason: 'snapshot já importado com o mesmo hash',
      });
      continue;
    }

    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, renderSnapshotDoc(
      candidate.relPath,
      sourceType,
      contentHash,
      contentBytes,
      content,
      now,
    ), 'utf8');

    nextImportedSources.push({
      source_path: candidate.relPath,
      source_type: sourceType,
      source_hash: contentHash,
      source_size_bytes: contentBytes,
      snapshot_path: rel(projectRoot, snapshotPath),
      captured_at: now,
    });
    importedIndex.add(key);
    imported.push({
      relPath: candidate.relPath,
      type: sourceType,
      hash: contentHash,
      sizeBytes: contentBytes,
      snapshotPath: rel(projectRoot, snapshotPath),
    });
    touchedPaths.add(rel(projectRoot, snapshotPath));
  }

  const nextState = updateState(projectRoot, (current) => {
    const createdFiles = Array.isArray(current.created_files) ? current.created_files : [];
    return {
      ...current,
      imported_sources: nextImportedSources,
      last_ingest_at: now,
      ingest_count: (current.ingest_count ?? 0) + 1,
      created_files: [...new Set([...createdFiles, ...touchedPaths])],
    };
  });

  mkdirSync(dirname(reportPath), { recursive: true });
  const report = buildReport({
    projectRoot,
    internalDir,
    found,
    imported,
    skipped,
    state: nextState,
  });
  writeFileSync(reportPath, `${report}\n`, 'utf8');
  touchedPaths.add(rel(projectRoot, reportPath));

  updateManifest(projectRoot, [...touchedPaths]);

  return {
    ok: true,
    reportPath,
    report,
    state: nextState,
    found,
    imported,
    skipped,
    imports,
    internalDir,
    projectRoot,
  };
}

export default async function ingest() {
  const { default: chalk } = await import('chalk');
  const result = runIngest(process.cwd());

  if (!result.ok) {
    console.log(chalk.red(`\n  ${result.error}\n`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`\n  AgentForge ingest concluído: ${result.imported.length} snapshot(s) novo(s), ${result.skipped.length} já conhecido(s).\n`));
  console.log(`  Relatório: ${result.reportPath}\n`);

  return 0;
}
