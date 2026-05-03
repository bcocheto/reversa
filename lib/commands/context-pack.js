import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const CONTEXT_INDEX_REL_PATH = '.agentforge/harness/context-index.yaml';
const REPORT_DIR = '.agentforge/reports';
const REPORT_BASENAME = 'context-pack';
const EXCERPT_MAX_LINES = 24;
const DIRECTORY_ENTRY_LIMIT = 12;
const RELEVANT_DIRECTORY_FILE_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.json', '.txt', '.toml']);

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeInternalPath(relPath) {
  const normalized = toPosixPath(String(relPath ?? '').replace(/^\//, '').trim());
  if (!normalized) return '';
  if (normalized.startsWith(`${PRODUCT.internalDir}/`)) return normalized;
  if (normalized === PRODUCT.internalDir) return normalized;
  if (normalized.startsWith('.')) return normalized;
  if (!normalized.includes('/')) return normalized;
  return `${PRODUCT.internalDir}/${normalized}`;
}

function parseArgs(args = []) {
  const parsed = {
    help: false,
    json: false,
    write: false,
    task: '',
    mode: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--write') {
      parsed.write = true;
      continue;
    }
    if (arg === '--task') {
      parsed.task = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }
    if (!parsed.mode && !arg.startsWith('--')) {
      parsed.mode = normalizeString(arg);
    }
  }

  return parsed;
}

function readContextIndex(projectRoot) {
  const indexPath = join(projectRoot, CONTEXT_INDEX_REL_PATH);
  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const doc = YAML.parse(readFileSync(indexPath, 'utf8'));
    return isPlainObject(doc) ? doc : null;
  } catch {
    return null;
  }
}

function resolveMode(index, requestedMode, taskText) {
  const taskContexts = isPlainObject(index?.task_contexts) ? index.task_contexts : {};
  const normalizedMode = normalizeString(requestedMode);
  const recognizedMode = normalizedMode && Object.hasOwn(taskContexts, normalizedMode);

  if (recognizedMode) {
    return {
      mode: normalizedMode,
      generic: false,
      taskDescription: '',
    };
  }

  const availableModes = Object.keys(taskContexts);
  const taskDescription = normalizeString(taskText) || (!normalizedMode ? '' : normalizedMode);

  return {
    mode: 'generic',
    generic: true,
    taskDescription,
    availableModes,
  };
}

function resolvePackPaths(index, modeInfo) {
  const alwaysLoad = toArray(index?.always_load).map(normalizeInternalPath);
  const taskContexts = isPlainObject(index?.task_contexts) ? index.task_contexts : {};
  const taskSpec = !modeInfo.generic && isPlainObject(taskContexts[modeInfo.mode]) ? taskContexts[modeInfo.mode] : {};

  const resolved = {
    alwaysLoad: unique([...alwaysLoad, ...toArray(taskSpec.always_load).map(normalizeInternalPath)]),
    entrypoints: unique(toArray(taskSpec.entrypoints).map(normalizeInternalPath)),
    legacy: unique(toArray(taskSpec.legacy).map(normalizeInternalPath)),
    agents: unique(toArray(taskSpec.agents).map(normalizeInternalPath)),
    suggestions: unique(toArray(taskSpec.suggestions).map(normalizeInternalPath)),
    memory: unique(toArray(taskSpec.memory).map(normalizeInternalPath)),
    context: unique(toArray(taskSpec.context).map(normalizeInternalPath)),
    references: unique(toArray(taskSpec.references).map(normalizeInternalPath)),
    skills: unique(toArray(taskSpec.skills).map(normalizeInternalPath)),
    flows: unique(toArray(taskSpec.flows).map(normalizeInternalPath)),
    policies: unique(toArray(taskSpec.policies).map(normalizeInternalPath)),
    reports: unique(toArray(taskSpec.reports).map(normalizeInternalPath)),
  };

  const readOrder = unique([
    ...resolved.alwaysLoad,
    ...resolved.entrypoints,
    ...resolved.legacy,
    ...resolved.agents,
    ...resolved.suggestions,
    ...resolved.memory,
    ...resolved.context,
    ...resolved.references,
    ...resolved.skills,
    ...resolved.flows,
    ...resolved.policies,
    ...resolved.reports,
  ]);

  return { ...resolved, readOrder };
}

function resolveAvailableCatalog(index) {
  return {
    items: Array.isArray(index?.items) ? index.items.filter(isPlainObject) : [],
    skills: Array.isArray(index?.skills) ? index.skills.filter(isPlainObject) : [],
    flows: Array.isArray(index?.flows) ? index.flows.filter(isPlainObject) : [],
    taskModes: isPlainObject(index?.task_contexts) ? Object.keys(index.task_contexts) : [],
  };
}

function excerptText(content) {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const excerpt = lines.slice(0, EXCERPT_MAX_LINES).join('\n').trimEnd();
  return excerpt || '—';
}

function titleFromPath(relPath) {
  return basename(relPath, '.md')
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRelevantPackFile(relPath) {
  const extension = extname(relPath).toLowerCase();
  return RELEVANT_DIRECTORY_FILE_EXTENSIONS.has(extension) || basename(relPath).toLowerCase() === 'skill.md';
}

function readPackTarget(projectRoot, relPath) {
  const absPath = join(projectRoot, relPath);
  const exists = existsSync(absPath);
  const entry = {
    path: relPath,
    exists,
    kind: 'unknown',
    title: titleFromPath(relPath),
    excerpt: '',
    line_count: 0,
  };

  if (!exists) {
    return {
      entry,
      filesToRead: [relPath],
      warnings: [`Arquivo ou diretório ausente: ${relPath}`],
    };
  }

  const stats = statSync(absPath);
  if (stats.isDirectory()) {
    const relevantFiles = listFilesRecursive(absPath)
      .map((absChildPath) => rel(projectRoot, absChildPath))
      .filter(isRelevantPackFile)
      .sort((left, right) => left.localeCompare(right));
    const expandedPaths = relevantFiles.slice(0, DIRECTORY_ENTRY_LIMIT);
    const warnings = [];
    if (relevantFiles.length === 0) {
      warnings.push(`Diretório sem arquivos relevantes: ${relPath}`);
    } else if (relevantFiles.length > DIRECTORY_ENTRY_LIMIT) {
      warnings.push(`Diretório ${relPath} expandido parcialmente: ${expandedPaths.length}/${relevantFiles.length} arquivo(s) relevantes.`);
    } else {
      warnings.push(`Diretório ${relPath} expandido em ${expandedPaths.length} arquivo(s) relevantes.`);
    }

    return {
      entry: {
        ...entry,
        kind: 'directory',
        expanded_paths: expandedPaths,
        child_count: relevantFiles.length,
        truncated: relevantFiles.length > DIRECTORY_ENTRY_LIMIT,
      },
      filesToRead: expandedPaths,
      warnings,
    };
  }

  try {
    const content = readFileSync(absPath, 'utf8');
    entry.excerpt = excerptText(content);
    entry.line_count = content.replace(/\r\n/g, '\n').split('\n').filter((line, index, lines) => !(index === lines.length - 1 && line === '')).length;
  } catch {
    entry.excerpt = '';
  }

  if (relPath.startsWith('context/')) entry.kind = 'context';
  else if (relPath.startsWith('references/')) entry.kind = 'reference';
  else if (relPath.startsWith('skills/')) entry.kind = 'skill';
  else if (relPath.startsWith('flows/')) entry.kind = 'flow';
  else if (relPath.startsWith('policies/')) entry.kind = 'policy';
  else if (relPath.startsWith('harness/')) entry.kind = 'harness';
  else if (relPath.startsWith('ai/')) entry.kind = 'ai';

  return {
    entry,
    filesToRead: [relPath],
    warnings: [],
  };
}

function buildGenericSelection(index) {
  const catalog = resolveAvailableCatalog(index);
  return {
    task_mode: 'generic',
    selection_mode: 'manual',
    available_task_modes: catalog.taskModes,
    instructions: [
      'Selecione manualmente um task mode quando a tarefa for ampla ou ambígua.',
      'Use os task modes do índice como ponto de partida e ajuste o pacote conforme a tarefa real.',
    ],
  };
}

function buildPack(projectRoot, index, modeInfo) {
  const selection = modeInfo.generic
    ? buildGenericSelection(index)
    : { task_mode: modeInfo.mode, selection_mode: 'task-mode' };
  const resolved = resolvePackPaths(index, modeInfo);
  const catalog = resolveAvailableCatalog(index);

  const entries = [];
  const filesToRead = [];
  const warnings = [];
  const seen = new Set();

  const pushEntry = (relPath, section) => {
    const normalized = normalizeString(relPath);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);

    const resolvedTarget = readPackTarget(projectRoot, normalized);
    resolvedTarget.entry.section = section;
    entries.push(resolvedTarget.entry);
    filesToRead.push(...resolvedTarget.filesToRead);
    warnings.push(...resolvedTarget.warnings);
  };

  if (modeInfo.generic) {
    for (const alwaysLoad of resolved.alwaysLoad) {
      pushEntry(alwaysLoad, 'always_load');
    }
    for (const item of catalog.items) {
      pushEntry(normalizeInternalPath(item.path), 'catalog');
    }
    for (const skill of catalog.skills) {
      pushEntry(normalizeInternalPath(skill.path), 'catalog');
    }
    for (const flow of catalog.flows) {
      pushEntry(normalizeInternalPath(flow.path), 'catalog');
    }
  } else {
    for (const relPath of resolved.readOrder) {
      pushEntry(relPath, resolved.alwaysLoad.includes(relPath) ? 'always_load' : 'task');
    }
  }

  const uniqueFilesToRead = unique(filesToRead);
  const uniqueWarnings = unique(warnings);

  return {
    selection,
    filesToRead: uniqueFilesToRead,
    entries,
    warnings: uniqueWarnings,
    pack: {
      mode: modeInfo.mode,
      generic: modeInfo.generic,
      task_description: modeInfo.taskDescription || '',
      selection,
      files_to_read: uniqueFilesToRead,
      always_load: resolved.alwaysLoad,
      entrypoints: resolved.entrypoints,
      legacy: resolved.legacy,
      agents: resolved.agents,
      suggestions: resolved.suggestions,
      memory: resolved.memory,
      context: resolved.context,
      references: resolved.references,
      skills: resolved.skills,
      flows: resolved.flows,
      policies: resolved.policies,
      reports: resolved.reports,
      available_task_modes: catalog.taskModes,
      available_context_items: catalog.items.map((item) => ({
        id: item.id ?? null,
        path: normalizeInternalPath(item.path),
        purpose: item.purpose ?? '',
      })),
      entries,
      warnings: uniqueWarnings,
    },
  };
}

function renderMarkdown(pack) {
  const lines = [];
  lines.push('# AgentForge Context Pack');
  lines.push('');
  lines.push('## Task Mode');
  lines.push('');
  lines.push(`- Mode: ${pack.mode}`);
  lines.push(`- Generic: ${pack.generic ? 'yes' : 'no'}`);
  if (pack.task_description) {
    lines.push(`- Task: ${pack.task_description}`);
  }
  if (pack.generic) {
    lines.push('- Selection: manual');
  }
  lines.push('');

  if (pack.generic) {
    lines.push('## Manual Selection');
    lines.push('');
    lines.push('- Escolha um task mode conhecido quando a tarefa ficar mais específica.');
    lines.push('- Task modes disponíveis:');
    for (const mode of pack.available_task_modes) {
      lines.push(`  - ${mode}`);
    }
    lines.push('');
  }

  if (pack.warnings.length > 0) {
    lines.push('## Directory warnings');
    lines.push('');
    for (const warning of pack.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  const renderList = (title, items) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('- Nenhum item.');
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`### ${item.path}`);
      lines.push('');
      lines.push(`- Exists: ${item.exists ? 'yes' : 'no'}`);
      lines.push(`- Kind: ${item.kind}`);
      lines.push(`- Title: ${item.title}`);
      if (item.kind === 'directory') {
        lines.push(`- Directory: yes`);
        lines.push(`- Expanded files: ${item.expanded_paths?.length ?? 0}`);
        if (Array.isArray(item.expanded_paths) && item.expanded_paths.length > 0) {
          for (const child of item.expanded_paths) {
            lines.push(`  - ${child}`);
          }
        }
      } else if (item.exists && item.excerpt) {
        lines.push('');
        lines.push('```text');
        lines.push(item.excerpt);
        lines.push('```');
      }
      lines.push('');
    }
  };

  renderList('Files to read in order', pack.entries);

  const sectionItems = (section) => pack.entries.filter((item) => {
    if (!pack.generic) {
      if (section === 'always_load') return pack.always_load.includes(item.path);
      if (section === 'entrypoints') return pack.entrypoints.includes(item.path);
      if (section === 'legacy') return pack.legacy.includes(item.path);
      if (section === 'agents') return pack.agents.includes(item.path);
      if (section === 'suggestions') return pack.suggestions.includes(item.path);
      if (section === 'memory') return pack.memory.includes(item.path);
      if (section === 'reports') return pack.reports.includes(item.path);
      return pack[section].includes(item.path);
    }
    return section === 'catalog';
  });

  if (!pack.generic) {
    renderList('Always load', sectionItems('always_load'));
    renderList('Entrypoints', sectionItems('entrypoints'));
    renderList('Legacy', sectionItems('legacy'));
    renderList('Agents', sectionItems('agents'));
    renderList('Suggestions', sectionItems('suggestions'));
    renderList('Memory', sectionItems('memory'));
    renderList('Context', sectionItems('context'));
    renderList('References', sectionItems('references'));
    renderList('Skills', sectionItems('skills'));
    renderList('Flows', sectionItems('flows'));
    renderList('Policies', sectionItems('policies'));
    renderList('Reports', sectionItems('reports'));
  } else {
    renderList('Catalog', sectionItems('catalog'));
  }

  lines.push('## Warnings');
  lines.push('');
  if (pack.warnings.length === 0) {
    lines.push('- Nenhum warning.');
  } else {
    for (const warning of pack.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- Este comando não altera código do projeto.');
  lines.push('- Use `--write` para salvar este pack em `.agentforge/reports/`.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderJson(pack) {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Context Pack\n`));
  console.log('  Uso: npx agentforge context-pack <task-mode> [--json] [--write]');
  console.log('       npx agentforge context-pack --task "descrição da tarefa" [--json] [--write]\n');
  console.log('  Lê `.agentforge/harness/context-index.yaml` e monta um pacote ordenado de contexto.');
  console.log('  O resultado inclui arquivos, skills, flows e policies aplicáveis, com warnings para itens ausentes.');
  console.log('  Use --json para saída estruturada e --write para gravar o relatório em `.agentforge/reports/`.\n');
}

function ensureInstalled(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return { ok: false, errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'] };
  }
  return { ok: true };
}

function updateStateAndManifest(projectRoot, manifest, reportRelPath, pack) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    last_context_pack_at: new Date().toISOString(),
    last_context_pack_mode: pack.mode,
    context_pack: {
      mode: pack.mode,
      generic: pack.generic,
      report_path: reportRelPath,
      files_to_read: pack.files_to_read,
      warnings: pack.warnings.length,
    },
    created_files: unique([...createdFiles, reportRelPath, rel(projectRoot, statePath)]),
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [reportRelPath, rel(projectRoot, statePath)]),
  });

  return nextState;
}

export function buildContextPack(projectRoot, { mode = '', task = '' } = {}) {
  const index = readContextIndex(projectRoot);
  if (!index) {
    return { ok: false, errors: [`Não foi possível ler ${CONTEXT_INDEX_REL_PATH}.`] };
  }

  const modeInfo = resolveMode(index, mode, task);
  const packData = buildPack(projectRoot, index, modeInfo);

  return {
    ok: true,
    index,
    ...packData,
    markdown: renderMarkdown(packData.pack),
    json: renderJson(packData.pack),
  };
}

export function runContextPack(projectRoot, { mode = '', task = '', write = false } = {}) {
  const installation = ensureInstalled(projectRoot);
  if (!installation.ok) return installation;

  const result = buildContextPack(projectRoot, { mode, task });
  if (!result.ok) return result;

  if (write) {
    const reportName = `${REPORT_BASENAME}-${result.pack.mode}.md`;
    const reportRelPath = join(REPORT_DIR, reportName);
    const reportAbsPath = join(projectRoot, reportRelPath);
    mkdirSync(dirname(reportAbsPath), { recursive: true });
    writeFileSync(reportAbsPath, result.markdown, 'utf8');
    const writer = new Writer(projectRoot);
    writer.writeGeneratedFile(reportAbsPath, result.markdown, { force: true });
    writer.saveCreatedFiles();
    const manifest = loadManifest(projectRoot);
    result.state = updateStateAndManifest(projectRoot, manifest, reportRelPath, result.pack);
    result.reportPath = reportRelPath;
  }

  return result;
}

export default async function contextPack(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const result = runContextPack(process.cwd(), {
    mode: parsed.mode,
    task: parsed.task,
    write: parsed.write,
  });

  if (!result.ok) {
    console.log(chalk.red(`  ${result.errors?.[0] || 'Falha ao gerar o context pack.'}`));
    return 1;
  }

  if (parsed.json) {
    console.log(result.json.trimEnd());
  } else {
    console.log(result.markdown.trimEnd());
  }

  return 0;
}
