import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { getMinimumHumanReadableStructureRelPaths } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import {
  renderManagedEntrypoint,
  hasBootloaderBlock,
  replaceBootloaderBlock,
  ENTRYPOINT_MAX_LINES,
  countDocumentLines,
} from './bootloader.js';
import { buildManagedBootloaderLines } from './bootloader.js';
import { writeImportedSnapshot } from '../commands/snapshots.js';

const EXISTING_ENTRYPOINT_TARGETS = [
  {
    path: 'AGENTS.md',
    bootloader: {
      entryFile: 'AGENTS.md',
      activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
    },
  },
  {
    path: 'CLAUDE.md',
    bootloader: {
      entryFile: 'CLAUDE.md',
      activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
    },
  },
  {
    path: '.cursorrules',
    bootloader: {
      entryFile: '.cursorrules',
      activationText: 'Quando o usuário usar `agentforge` ou `/agentforge`, siga estas regras.',
    },
  },
  {
    path: '.cursor/rules/agentforge.md',
    bootloader: {
      entryFile: '.cursor/rules/agentforge.md',
      frontmatterLines: [
        '---',
        'description: AgentForge rules',
        'globs: "**/*"',
        'alwaysApply: true',
        '---',
      ],
      activationText: 'Quando o usuário usar `agentforge` ou `/agentforge`, siga estas regras.',
    },
  },
  {
    path: '.github/copilot-instructions.md',
    bootloader: {
      entryFile: '.github/copilot-instructions.md',
      activationText: 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.',
    },
  },
];

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

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function manifestHash(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    if (typeof entry.hash === 'string') return entry.hash;
    if (typeof entry.sha256 === 'string') return entry.sha256;
    if (typeof entry.value === 'string') return entry.value;
  }
  return null;
}

function listFilesRecursive(dirPath, predicate = () => true) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath, entry.name)) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readYamlFile(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(doc) ? doc : null;
  } catch {
    return null;
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
}

function normalizeEngineName(value) {
  return normalizeString(value).toLowerCase().replace(/[\s_]+/g, '-');
}

function summarizeList(list, mapper, emptyMessage) {
  if (list.length === 0) return `- ${emptyMessage}`;
  return list.map((item) => `- ${mapper(item)}`).join('\n');
}

function loadSourceOfTruth(projectRoot) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const errors = [];
  const warnings = [];

  const statePath = join(internalDir, 'state.json');
  const state = readJsonFile(statePath);
  if (!state) {
    errors.push(`Estado inválido ou ausente: ${rel(projectRoot, statePath)}`);
  }

  const scopePath = join(internalDir, 'scope.md');
  const scope = existsSync(scopePath) ? readFileSync(scopePath, 'utf8') : '';
  if (!scope) {
    warnings.push(`Escopo ausente ou vazio: ${rel(projectRoot, scopePath)}`);
  }

  for (const relPath of getMinimumHumanReadableStructureRelPaths(PRODUCT.internalDir)) {
    if (!existsSync(join(projectRoot, relPath))) {
      errors.push(`Arquivo ausente da estrutura mínima do harness: ${relPath}`);
    }
  }

  const readYamlCollection = (dirName, required = true) => {
    const dirPath = join(internalDir, dirName);
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
      if (required) {
        errors.push(`Diretório ausente: ${rel(projectRoot, dirPath)}`);
      } else {
        warnings.push(`Diretório ausente: ${rel(projectRoot, dirPath)}`);
      }
      return [];
    }

    const items = [];
    for (const filePath of listFilesRecursive(dirPath, (fullPath, name) => {
      const ext = extname(name).toLowerCase();
      return ext === '.yaml' || ext === '.yml';
    })) {
      const doc = readYamlFile(filePath);
      if (!doc) {
        errors.push(`YAML inválido: ${rel(projectRoot, filePath)}`);
        continue;
      }
      items.push({
        file: rel(projectRoot, filePath),
        path: filePath,
        doc,
      });
    }
    return items;
  };

  const agents = readYamlCollection('agents');
  const subagents = readYamlCollection('subagents', false);
  const flows = readYamlCollection('flows');
  const policies = readYamlCollection('policies');

  const memoryDir = join(internalDir, 'memory');
  const memory = existsSync(memoryDir) && statSync(memoryDir).isDirectory()
    ? listFilesRecursive(memoryDir, (fullPath, name) => extname(name).toLowerCase() === '.md')
        .map((filePath) => ({
          file: rel(projectRoot, filePath),
          name: basename(filePath),
          content: readFileSync(filePath, 'utf8'),
        }))
    : [];

  const engines = normalizeList(state?.engines).map(normalizeEngineName).filter(Boolean);

  return {
    projectRoot,
    internalDir,
    state,
    scope,
    agents,
    subagents,
    flows,
    policies,
    memory,
    engines,
    errors,
    warnings,
  };
}

function engineMatches(engine, aliases) {
  return aliases.some((alias) => engine === alias);
}

function detectTargets(engines) {
  const targets = [];
  const has = (aliases) => engines.some((engine) => engineMatches(engine, aliases));

  if (has(['codex'])) {
    targets.push({ kind: 'root', path: 'AGENTS.md', engine: 'codex' });
  }
  if (has(['claude', 'claude-code', 'claudecode'])) {
    targets.push({ kind: 'root', path: 'CLAUDE.md', engine: 'claude-code' });
    targets.push({ kind: 'agents-dir', path: '.claude/agents', engine: 'claude-code' });
  }
  if (has(['cursor'])) {
    targets.push({ kind: 'root', path: '.cursor/rules/agentforge.md', engine: 'cursor' });
  }
  if (has(['copilot', 'github-copilot', 'githubcopilot'])) {
    targets.push({ kind: 'root', path: '.github/copilot-instructions.md', engine: 'copilot' });
    targets.push({ kind: 'agents-dir', path: '.github/agents', engine: 'copilot' });
  }

  return targets;
}

function formatFlowSteps(flow) {
  const steps = Array.isArray(flow.doc.steps) ? flow.doc.steps : [];
  return steps
    .map((step) => {
      if (!isPlainObject(step)) return null;
      return normalizeString(step.agent) || normalizeString(step.agent_id) || normalizeString(step.subagent) || normalizeString(step.id);
    })
    .filter(Boolean)
    .join(' -> ');
}

function renderAgentSummary(item) {
  const doc = item.doc;
  const description = normalizeString(doc.description) || normalizeString(doc.mission) || 'Sem descrição.';
  const responsibilities = normalizeList(doc.responsibilities);
  const boundaries = normalizeList(doc.boundaries);
  const permissions = normalizeList(doc.permissions);

  const lines = [];
  lines.push(`### \`${normalizeString(doc.id) || basename(item.file, extname(item.file))}\``);
  lines.push('');
  lines.push(description);
  lines.push('');

  if (responsibilities.length > 0) {
    lines.push('Responsabilidades:');
    lines.push(responsibilities.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (boundaries.length > 0) {
    lines.push('Limites:');
    lines.push(boundaries.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (permissions.length > 0) {
    lines.push('Permissões:');
    lines.push(permissions.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function renderFlowSummary(item) {
  const doc = item.doc;
  const goal = normalizeString(doc.goal) || normalizeString(doc.description) || 'Fluxo operacional do AgentForge.';
  const steps = formatFlowSteps(item);

  const lines = [];
  lines.push(`- \`${normalizeString(doc.id) || basename(item.file, extname(item.file))}\` - ${normalizeString(doc.name) || 'Fluxo'}`);
  lines.push(`  - ${goal}`);
  if (steps) {
    lines.push(`  - Passos: ${steps}`);
  }
  return lines.join('\n');
}

function renderPolicySummary(item) {
  const doc = item.doc;
  const id = normalizeString(doc.id) || basename(item.file, extname(item.file));
  const description = normalizeString(doc.description) || 'Política operacional.';
  return `- \`${id}\` - ${description}`;
}

function renderMemorySummary(item) {
  const title = item.name;
  return `- \`${title}\``;
}

function renderRoleDoc(item) {
  const doc = item.doc;
  const id = normalizeString(doc.id) || basename(item.file, extname(item.file));
  const name = normalizeString(doc.name) || id;
  const description = normalizeString(doc.description) || normalizeString(doc.mission) || 'Sem descrição.';
  const responsibilities = normalizeList(doc.responsibilities);
  const boundaries = normalizeList(doc.boundaries);
  const inputs = normalizeList(doc.inputs);
  const outputs = normalizeList(doc.outputs);
  const rules = normalizeList(doc.rules);
  const activationCommand = normalizeString(doc?.activation?.command);
  const slashCommand = normalizeString(doc?.activation?.slash_command);
  const reads = normalizeList(doc.reads);
  const sequence = normalizeList(doc.sequence);
  const handoff = isPlainObject(doc.handoff) ? doc.handoff : null;

  const lines = [];
  lines.push(`# ${name}`);
  lines.push('');
  lines.push(description);
  lines.push('');
  lines.push(`- ID: \`${id}\``);
  lines.push(`- Fonte: \`${item.file}\``);
  if (activationCommand) lines.push(`- Ativação: \`${activationCommand}\``);
  if (slashCommand) lines.push(`- Slash command: \`${slashCommand}\``);
  lines.push('');

  if (responsibilities.length > 0) {
    lines.push('## Responsabilidades');
    lines.push('');
    lines.push(responsibilities.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (boundaries.length > 0) {
    lines.push('## Limites');
    lines.push('');
    lines.push(boundaries.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (inputs.length > 0) {
    lines.push('## Entradas');
    lines.push('');
    lines.push(inputs.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (outputs.length > 0) {
    lines.push('## Saídas');
    lines.push('');
    lines.push(outputs.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (rules.length > 0) {
    lines.push('## Regras');
    lines.push('');
    lines.push(rules.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (reads.length > 0) {
    lines.push('## Leituras');
    lines.push('');
    lines.push(reads.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (sequence.length > 0) {
    lines.push('## Sequência');
    lines.push('');
    lines.push(sequence.map((entry) => `- ${entry}`).join('\n'));
    lines.push('');
  }
  if (handoff) {
    lines.push('## Handoff');
    lines.push('');
    lines.push(`- Próximo padrão: ${normalizeString(handoff.next) || normalizeString(handoff.default_next) || 'não definido'}`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildExportTargets(context, rootPrefix = '', { includeExistingEntrypoints = false } = {}) {
  const targets = [];
  const { state, engines, agents } = context;
  const engineSet = new Set(engines);
  const prefix = rootPrefix ? rootPrefix.replace(/\\/g, '/') : '';
  const withPrefix = (relPath) => (prefix ? join(prefix, relPath) : relPath);
  const seenPaths = new Set();
  const addTarget = (target) => {
    if (!target?.path || seenPaths.has(target.path)) return;
    seenPaths.add(target.path);
    targets.push(target);
  };

  if (engineSet.has('codex')) {
    const bootloader = {
      entryFile: 'AGENTS.md',
      activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
    };
    addTarget({
      kind: 'entrypoint',
      path: withPrefix('AGENTS.md'),
      engine: bootloader,
      content: renderManagedEntrypoint(bootloader, state),
      managedLines: buildManagedBootloaderLines({
        activationText: bootloader.activationText,
      }),
    });
  }

  if (engineSet.has('claude') || engineSet.has('claude-code') || engineSet.has('claudecode')) {
    const bootloader = {
      entryFile: 'CLAUDE.md',
      activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
    };
    addTarget({
      kind: 'entrypoint',
      path: withPrefix('CLAUDE.md'),
      engine: bootloader,
      content: renderManagedEntrypoint(bootloader, state),
      managedLines: buildManagedBootloaderLines({
        activationText: bootloader.activationText,
      }),
    });
    for (const agent of agents) {
      addTarget({
        kind: 'document',
        path: withPrefix(join('.claude', 'agents', `${normalizeString(agent.doc.id) || basename(agent.file, extname(agent.file))}.md`)),
        content: renderRoleDoc(agent),
      });
    }
  }

  if (engineSet.has('cursor')) {
    const bootloader = {
      entryFile: '.cursor/rules/agentforge.md',
      frontmatterLines: [
        '---',
        'description: AgentForge rules',
        'globs: "**/*"',
        'alwaysApply: true',
        '---',
      ],
      activationText: 'Quando o usuário usar o comando `agentforge` ou `/agentforge`, siga estas regras.',
    };
    addTarget({
      kind: 'entrypoint',
      path: withPrefix(join('.cursor', 'rules', 'agentforge.md')),
      engine: bootloader,
      content: renderManagedEntrypoint(bootloader, state),
      managedLines: buildManagedBootloaderLines({
        activationText: bootloader.activationText,
      }),
    });
  }

  if (engineSet.has('copilot') || engineSet.has('github-copilot') || engineSet.has('githubcopilot')) {
    const bootloader = {
      entryFile: '.github/copilot-instructions.md',
      activationText: 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.',
    };
    addTarget({
      kind: 'entrypoint',
      path: withPrefix(join('.github', 'copilot-instructions.md')),
      engine: bootloader,
      content: renderManagedEntrypoint(bootloader, state),
      managedLines: buildManagedBootloaderLines({
        activationText: bootloader.activationText,
      }),
    });
    for (const agent of agents) {
      addTarget({
        kind: 'document',
        path: withPrefix(join('.github', 'agents', `${normalizeString(agent.doc.id) || basename(agent.file, extname(agent.file))}.md`)),
        content: renderRoleDoc(agent),
      });
    }
  }

  if (includeExistingEntrypoints) {
    for (const target of EXISTING_ENTRYPOINT_TARGETS) {
      const absPath = join(context.projectRoot, target.path);
      if (!existsSync(absPath)) continue;
      addTarget({
        kind: 'entrypoint',
        path: withPrefix(target.path),
        engine: target.bootloader,
        content: renderManagedEntrypoint(target.bootloader, state),
        managedLines: buildManagedBootloaderLines({
          activationText: target.bootloader.activationText,
        }),
      });
    }
  }

  return targets;
}

function buildPackageTargets(context) {
  const packageRoot = PRODUCT.outputDir;
  const targets = [];
  const internalDir = join(context.projectRoot, PRODUCT.internalDir);

  if (existsSync(internalDir) && statSync(internalDir).isDirectory()) {
    for (const filePath of listFilesRecursive(internalDir)) {
      targets.push({
        kind: 'package-copy',
        path: join(packageRoot, rel(context.projectRoot, filePath)),
        content: readFileSync(filePath, 'utf8'),
      });
    }
  }

  return [
    ...targets,
    ...buildExportTargets(context, packageRoot),
  ];
}

function targetStatus(projectRoot, manifest, targetPath) {
  const absPath = join(projectRoot, targetPath);
  if (!existsSync(absPath)) return 'missing';

  const manifestEntry = manifest[targetPath];
  if (!manifestEntry) return 'unmanaged';

  const currentHash = sha256File(absPath);
  const trackedHash = manifestHash(manifestEntry);
  if (!trackedHash) return 'unmanaged';

  return currentHash === trackedHash ? 'intact' : 'modified';
}

async function writeTarget(projectRoot, target, manifest, force, takeoverEntrypoints, output, { overwrite = false } = {}) {
  const absPath = join(projectRoot, target.path);

  if (overwrite) {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, target.content, 'utf8');
    output.written.push(target.path);
    if (target.kind === 'entrypoint') {
      output.entrypointWrites.push(target.path);
    }
    output.messages.push(`Escrito: ${target.path}`);
    return;
  }

  if (target.kind === 'entrypoint') {
    if (countDocumentLines(target.content) > ENTRYPOINT_MAX_LINES) {
      output.errors.push(`Entrypoint gerenciado excede o limite de ${ENTRYPOINT_MAX_LINES} linhas: ${target.path}.`);
      output.skipped.push(target.path);
      return;
    }

    const existing = existsSync(absPath) ? readFileSync(absPath, 'utf8') : null;
    if (!existing) {
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, target.content, 'utf8');
      output.written.push(target.path);
      output.entrypointWrites.push(target.path);
      output.messages.push(`Criado: ${target.path}`);
      return;
    }

    if (takeoverEntrypoints) {
      if (hasBootloaderBlock(existing)) {
        const nextContent = replaceBootloaderBlock(existing, target.managedLines ?? []);
        if (nextContent !== existing) {
          mkdirSync(dirname(absPath), { recursive: true });
          writeFileSync(absPath, nextContent, 'utf8');
          output.written.push(target.path);
          output.entrypointWrites.push(target.path);
          output.messages.push(`Atualizado: ${target.path}`);
          return;
        }

        output.skipped.push(target.path);
        return;
      }

      const sourceRelPath = target.path;
      const snapshot = writeImportedSnapshot(projectRoot, PRODUCT.internalDir, sourceRelPath, existing);
      output.preservedSnapshots.push(snapshot.snapshotPath);
      if (snapshot.created || !Object.hasOwn(manifest, snapshot.snapshotPath)) {
        output.written.push(snapshot.snapshotPath);
      }

      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, target.content, 'utf8');
      output.written.push(target.path);
      output.entrypointWrites.push(target.path);
      output.messages.push(`Original preservado em snapshot: ${snapshot.snapshotPath}`);
      output.messages.push(`Bootloader gerenciado aplicado: ${target.path}`);
      return;
    }

    if (hasBootloaderBlock(existing)) {
      const nextContent = replaceBootloaderBlock(existing, target.managedLines ?? []);
      if (nextContent !== existing) {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, nextContent, 'utf8');
        output.written.push(target.path);
        output.entrypointWrites.push(target.path);
        output.messages.push(`Atualizado: ${target.path}`);
        return;
      }

      output.skipped.push(target.path);
      return;
    }

    output.skipped.push(target.path);
    output.warnings.push(`AGENTS existente sem bloco gerenciado; use --takeover-entrypoints para substituir com snapshot: ${target.path}`);
    return;
  }

  const status = targetStatus(projectRoot, manifest, target.path);

  if (status === 'missing') {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, target.content, 'utf8');
    output.written.push(target.path);
    output.messages.push(`Criado: ${target.path}`);
    return;
  }

  if (status === 'intact' && force) {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, target.content, 'utf8');
    output.written.push(target.path);
    output.messages.push(`Atualizado: ${target.path}`);
    return;
  }

  if (status === 'modified') {
    output.skipped.push(target.path);
    output.warnings.push(`Ignorado por modificação do usuário: ${target.path}`);
    return;
  }

  if (status === 'unmanaged') {
    output.skipped.push(target.path);
    output.warnings.push(`Ignorado porque já existe fora do manifest: ${target.path}`);
    return;
  }

  output.skipped.push(target.path);
}

function renderExportReport(context, output, { takeoverEntrypoints = false, includeExistingEntrypoints = false, packageMode = false } = {}) {
  const lines = [];
  lines.push(packageMode ? '# AgentForge Export Package Report' : '# AgentForge Compile Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${normalizeString(context.state?.project) || 'não informado'}`);
  lines.push(`- Setup mode: ${normalizeString(context.state?.setup_mode) || 'bootstrap'}`);
  lines.push(`- Engines: ${context.engines.length > 0 ? context.engines.join(', ') : 'nenhuma'}`);
  lines.push(`- Files written: ${output.written.length}`);
  lines.push(`- Files skipped: ${output.skipped.length}`);
  lines.push(`- Errors: ${output.errors.length}`);
  lines.push(`- Warnings: ${output.warnings.length}`);
  lines.push(`- Takeover entrypoints: ${takeoverEntrypoints ? 'enabled' : 'disabled'}`);
  lines.push(`- Include existing entrypoints: ${includeExistingEntrypoints ? 'enabled' : 'disabled'}`);
  lines.push(`- Package export: ${packageMode ? 'enabled' : 'disabled'}`);
  lines.push('');

  lines.push('## Bootloader rules');
  lines.push('');
  lines.push('- `compile` atualiza os entrypoints reais do projeto em `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/agentforge.md` e `.github/copilot-instructions.md`.');
  lines.push('- `export-package` escreve uma cópia isolada em `_agentforge/` sem substituir os entrypoints reais do projeto.');
  lines.push('- AGENTS.md e CLAUDE.md usam o bloco `<!-- agentforge:start -->` / `<!-- agentforge:end -->`.');
  lines.push('- O conteúdo manual fora do bloco é preservado.');
  lines.push('- O bootloader aponta para `.agentforge/harness/router.md`, `context-index.yaml`, `policies/`, `skills/`, `flows/` e `references/`.');
  lines.push('- Com `--takeover-entrypoints`, entrypoints existentes sem bloco são preservados em `.agentforge/imports/snapshots/` e substituídos por bootloaders compactos.');
  lines.push('- Com `includeExistingEntrypoints`, os entrypoints já existentes conhecidos são recompilados mesmo se a engine correspondente não estiver selecionada.');
  lines.push('');

  lines.push('## Errors');
  lines.push('');
  lines.push(output.errors.length > 0 ? output.errors.map((entry) => `- ${entry}`).join('\n') : '- Nenhum erro encontrado.');
  lines.push('');

  lines.push('## Warnings');
  lines.push('');
  lines.push(output.warnings.length > 0 ? output.warnings.map((entry) => `- ${entry}`).join('\n') : '- Nenhum aviso encontrado.');
  lines.push('');

  lines.push('## Written files');
  lines.push('');
  lines.push(output.written.length > 0 ? output.written.map((entry) => `- ${entry}`).join('\n') : '- Nenhum arquivo escrito.');
  lines.push('');

  lines.push('## Skipped files');
  lines.push('');
  lines.push(output.skipped.length > 0 ? output.skipped.map((entry) => `- ${entry}`).join('\n') : '- Nenhum arquivo ignorado.');
  lines.push('');

  lines.push('## Preserved snapshots');
  lines.push('');
  lines.push(output.preservedSnapshots.length > 0 ? output.preservedSnapshots.map((entry) => `- ${entry}`).join('\n') : '- Nenhum snapshot novo foi necessário.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function persistExportState(projectRoot, { writtenPaths = [], exportReady = false, packageMode = false } = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  if (!existsSync(statePath)) return null;
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.created_files = [...new Set([...(state.created_files ?? []), ...writtenPaths, rel(projectRoot, statePath)])];
  state.checkpoints = {
    ...(state.checkpoints ?? {}),
  };

  if (packageMode) {
    state.checkpoints.export_package = {
      at: new Date().toISOString(),
      output_folder: state.output_folder ?? PRODUCT.outputDir,
      written: writtenPaths,
    };
  } else if (exportReady) {
    state.completed = [...new Set([...(state.completed ?? []), 'export'])];
    state.pending = (state.pending ?? []).filter((item) => item !== 'export');
    state.checkpoints.export = {
      at: new Date().toISOString(),
      mode: 'entrypoints',
      written: writtenPaths.filter((path) => !path.startsWith(`${PRODUCT.internalDir}/reports/`) && path !== `${PRODUCT.internalDir}/state.json`),
    };
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return statePath;
}

export async function compileAgentForge(projectRoot, { force = false, takeoverEntrypoints = false, includeExistingEntrypoints = false } = {}) {
  const context = loadSourceOfTruth(projectRoot);
  const manifest = loadManifest(projectRoot);
  const targets = buildExportTargets(context, '', { includeExistingEntrypoints });
  const output = {
    written: [],
    skipped: [],
    warnings: [...context.warnings],
    errors: [...context.errors],
    messages: [],
    preservedSnapshots: [],
    entrypointWrites: [],
  };

  for (const target of targets) {
    await writeTarget(projectRoot, target, manifest, force, takeoverEntrypoints, output);
  }

  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderExportReport(context, output, { takeoverEntrypoints, includeExistingEntrypoints }), 'utf8');
  output.written.push(rel(projectRoot, reportPath));

  const entrypointTargets = targets.filter((target) => target.kind === 'entrypoint');
  const exportReady = entrypointTargets.length > 0 && entrypointTargets.every((target) => {
    const absPath = join(projectRoot, target.path);
    if (!existsSync(absPath)) return false;
    return hasBootloaderBlock(readFileSync(absPath, 'utf8'));
  });

  const statePath = await persistExportState(projectRoot, {
    writtenPaths: output.written,
    exportReady,
    packageMode: false,
  });
  if (statePath) {
    output.written.push(rel(projectRoot, statePath));
  }

  if (output.written.length > 0) {
    const nextManifest = {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, output.written),
    };
    saveManifest(projectRoot, nextManifest);
  }

  return {
    ...output,
    valid: output.errors.length === 0,
    targets,
    context,
    reportPath,
  };
}

export async function exportPackageAgentForge(projectRoot, { force = false } = {}) {
  const context = loadSourceOfTruth(projectRoot);
  const manifest = loadManifest(projectRoot);
  const targets = buildPackageTargets(context);
  const output = {
    written: [],
    skipped: [],
    warnings: [...context.warnings],
    errors: [...context.errors],
    messages: [],
    preservedSnapshots: [],
    entrypointWrites: [],
  };

  for (const target of targets) {
    await writeTarget(projectRoot, target, manifest, force, false, output, { overwrite: true });
  }

  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'export-package.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderExportReport(context, output, { packageMode: true }), 'utf8');
  output.written.push(rel(projectRoot, reportPath));

  const statePath = await persistExportState(projectRoot, {
    writtenPaths: output.written,
    exportReady: false,
    packageMode: true,
  });
  if (statePath) {
    output.written.push(rel(projectRoot, statePath));
  }

  if (output.written.length > 0) {
    const nextManifest = {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, output.written),
    };
    saveManifest(projectRoot, nextManifest);
  }

  return {
    ...output,
    valid: output.errors.length === 0,
    targets,
    context,
    reportPath,
  };
}

export function buildCompileReport(projectRoot, output, context) {
  return renderExportReport(context, output);
}

export function buildExportPackageReport(projectRoot, output, context) {
  return renderExportReport(context, output, { packageMode: true });
}

export function hasManagedBootloaderBlock(content) {
  return hasBootloaderBlock(content);
}

export function renderManagedBootloaderDocument(options) {
  return renderManagedEntrypoint(options);
}

export function mergeManagedBootloaderDocument(content, document) {
  return `${String(content ?? '').trimEnd()}\n\n${String(document ?? '').trim()}\n`;
}

export function replaceManagedBootloaderBlock(content, blockLines = []) {
  return replaceBootloaderBlock(content, blockLines);
}
