import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { getImportsStructure, getSnapshotImportType, writeImportedSnapshot } from './snapshots.js';

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

const LEGACY_AGENT_DIRS = ['.agents'];

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

  for (const relDir of LEGACY_AGENT_DIRS) {
    for (const filePath of listFilesRecursive(join(projectRoot, relDir))) {
      if (extname(filePath).toLowerCase() !== '.md') continue;
      addFile(filePath, 'legacy-agentic-doc');
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

function isLegacyAgentSource(relPath) {
  return relPath.startsWith('.agents/');
}

function buildLegacyAgentsReport({
  projectRoot,
  legacyFound,
  legacyImported,
  legacySkipped,
  state,
}) {
  const lines = [];
  const timestamp = new Date().toISOString();
  const typeCounts = legacyFound.reduce((counts, item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});

  lines.push('# Legacy Agents Import');
  lines.push('');
  lines.push(`- Diretório: \`${rel(projectRoot, join(projectRoot, '.agents'))}\``);
  lines.push(`- Executado em: ${timestamp}`);
  lines.push(`- Fontes legadas encontradas: ${legacyFound.length}`);
  lines.push(`- Fontes legadas importadas: ${legacyImported.length}`);
  lines.push(`- Fontes legadas já conhecidas: ${legacySkipped.length}`);
  lines.push(`- Importações registradas no state: ${Array.isArray(state.imported_sources) ? state.imported_sources.filter((item) => String(item?.source_path ?? '').startsWith('.agents/')).length : 0}`);
  lines.push('');

  lines.push('## Tipos detectados');
  lines.push('');
  if (Object.keys(typeCounts).length === 0) {
    lines.push('- Nenhuma fonte legada encontrada.');
  } else {
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- ${type}: ${count}`);
    }
  }
  lines.push('');

  const renderItem = (item) => `\`${item.relPath}\` → \`${item.type}\` (${formatBytes(item.sizeBytes)}, sha256 ${item.hash.slice(0, 12)}...)${item.snapshotPath ? ` → \`${item.snapshotPath}\`` : ''}`;

  lines.push('## Snapshots importados');
  lines.push('');
  if (legacyImported.length === 0) {
    lines.push('- Nenhum snapshot novo foi necessário.');
  } else {
    for (const item of legacyImported) {
      lines.push(`- ${renderItem(item)}`);
    }
  }
  lines.push('');

  if (legacySkipped.length > 0) {
    lines.push('## Já conhecidos');
    lines.push('');
    for (const item of legacySkipped) {
      lines.push(`- \`${item.relPath}\` (${item.reason})`);
    }
    lines.push('');
  }

  lines.push('## Próximos passos');
  lines.push('');
  lines.push('- Execute `agentforge refactor-context --apply` para separar o conteúdo em arquivos canônicos.');
  lines.push('- Revise `.agentforge/context/unclassified.md` se algo ainda não tiver confiança suficiente.');
  lines.push('');

  return lines.join('\n');
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
  const imports = getImportsStructure(projectRoot);
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
  const legacyReportPath = join(internalDir, 'reports', 'legacy-agents-import.md');
  const touchedPaths = new Set([
    rel(projectRoot, statePath),
    rel(projectRoot, imports.readmePath),
    rel(projectRoot, reportPath),
  ]);

  for (const candidate of candidates) {
    const content = readFileSync(candidate.absPath, 'utf8');
    const sourceType = getSnapshotImportType(candidate.relPath);
    const contentHash = hashContent(content);
    const contentBytes = Buffer.byteLength(content, 'utf8');
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

    const snapshot = writeImportedSnapshot(projectRoot, internalDir, candidate.relPath, content, {
      sourceType,
      capturedAt: now,
    });

    nextImportedSources.push({
      source_path: candidate.relPath,
      source_type: sourceType,
      source_hash: contentHash,
      source_size_bytes: contentBytes,
      snapshot_path: snapshot.snapshotPath,
      captured_at: now,
    });
    importedIndex.add(key);
    imported.push({
      relPath: candidate.relPath,
      type: sourceType,
      hash: contentHash,
      sizeBytes: contentBytes,
      snapshotPath: snapshot.snapshotPath,
    });
    touchedPaths.add(snapshot.snapshotPath);
  }

  const legacyFound = found.filter((item) => isLegacyAgentSource(item.relPath));
  if (legacyFound.length > 0) {
    const legacyImported = imported.filter((item) => isLegacyAgentSource(item.relPath));
    const legacySkipped = skipped.filter((item) => isLegacyAgentSource(item.relPath));
    mkdirSync(dirname(legacyReportPath), { recursive: true });
    const legacyReport = buildLegacyAgentsReport({
      projectRoot,
      legacyFound,
      legacyImported,
      legacySkipped,
      state: {
        ...state,
        imported_sources: nextImportedSources,
      },
    });
    writeFileSync(legacyReportPath, `${legacyReport}\n`, 'utf8');
    touchedPaths.add(rel(projectRoot, legacyReportPath));
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
