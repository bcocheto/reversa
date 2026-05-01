import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

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

function renderAgentForgeIndex({ state, scope, agents, subagents, flows, policies, memory, activationText }) {
  const lines = [];
  lines.push('# AgentForge');
  lines.push('');
  lines.push('Este projeto usa AgentForge para gerenciar agentes customizados, subagentes, fluxos, políticas e memória operacional.');
  lines.push('');
  lines.push('## Como ativar');
  lines.push('');
  lines.push(activationText);
  lines.push('');
  lines.push('## Ao ativar');
  lines.push('');
  lines.push('1. Leia `.agentforge/state.json`.');
  lines.push('2. Leia `.agentforge/scope.md`, se existir.');
  lines.push('3. Leia `.agentforge/agents/`.');
  lines.push('4. Leia `.agentforge/subagents/`, se existir.');
  lines.push('5. Leia `.agentforge/flows/`.');
  lines.push('6. Leia `.agentforge/policies/`.');
  lines.push('7. Leia `.agentforge/memory/`.');
  lines.push('8. Se o usuário pedir uma tarefa, escolha o fluxo apropriado.');
  lines.push('9. Se um agente específico for necessário, siga a definição desse agente.');
  lines.push('10. Nunca ignore as políticas em `.agentforge/policies/`.');
  lines.push('');
  lines.push('## Contexto do projeto');
  lines.push('');
  lines.push(`- Projeto: ${normalizeString(state?.project) || 'não informado'}`);
  lines.push(`- Usuário: ${normalizeString(state?.user_name) || 'não informado'}`);
  lines.push(`- Fase atual: ${state?.phase ?? 'não iniciada'}`);
  lines.push(`- Pasta de saída: ${normalizeString(state?.output_folder) || '_agentforge'}`);
  if (Array.isArray(state?.engines) && state.engines.length > 0) {
    lines.push(`- Engines configuradas: ${state.engines.join(', ')}`);
  }
  lines.push('');

  if (scope) {
    lines.push('## Escopo');
    lines.push('');
    lines.push(scope.trim());
    lines.push('');
  }

  lines.push('## Agentes');
  lines.push('');
  lines.push(summarizeList(
    agents,
    (item) => `\`${normalizeString(item.doc.id) || basename(item.file, extname(item.file))}\` - ${normalizeString(item.doc.name) || 'Agente'}: ${normalizeString(item.doc.description) || normalizeString(item.doc.mission) || 'Sem descrição.'}`,
    'Nenhum agente encontrado.'
  ));
  lines.push('');

  if (subagents.length > 0) {
    lines.push('## Subagentes');
    lines.push('');
    lines.push(summarizeList(
      subagents,
      (item) => `\`${normalizeString(item.doc.id) || basename(item.file, extname(item.file))}\` - ${normalizeString(item.doc.name) || 'Subagente'}: ${normalizeString(item.doc.description) || normalizeString(item.doc.mission) || 'Sem descrição.'}`,
      'Nenhum subagente encontrado.'
    ));
    lines.push('');
  }

  lines.push('## Fluxos');
  lines.push('');
  lines.push(flows.length === 0 ? '- Nenhum fluxo encontrado.' : flows.map(renderFlowSummary).join('\n'));
  lines.push('');

  lines.push('## Políticas');
  lines.push('');
  lines.push(policies.length === 0 ? '- Nenhuma política encontrada.' : policies.map(renderPolicySummary).join('\n'));
  lines.push('');

  lines.push('## Memória operacional');
  lines.push('');
  lines.push(memory.length === 0 ? '- Nenhum arquivo de memória encontrado.' : memory.map(renderMemorySummary).join('\n'));
  lines.push('');

  return lines.join('\n');
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

function buildExportTargets(context) {
  const targets = [];
  const { state, engines, agents } = context;
  const engineSet = new Set(engines);

  if (engineSet.has('codex')) {
    targets.push({
      path: 'AGENTS.md',
      content: renderAgentForgeIndex({
        ...context,
        activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
      }),
    });
  }

  if (engineSet.has('claude') || engineSet.has('claude-code') || engineSet.has('claudecode')) {
    targets.push({
      path: 'CLAUDE.md',
      content: renderAgentForgeIndex({
        ...context,
        activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
      }),
    });
    for (const agent of agents) {
      targets.push({
        path: join('.claude', 'agents', `${normalizeString(agent.doc.id) || basename(agent.file, extname(agent.file))}.md`),
        content: renderRoleDoc(agent),
      });
    }
  }

  if (engineSet.has('cursor')) {
    targets.push({
      path: join('.cursor', 'rules', 'agentforge.md'),
      content: [
        '---',
        'description: AgentForge rules',
        'globs: "**/*"',
        'alwaysApply: true',
        '---',
        '',
        renderAgentForgeIndex({
          ...context,
          activationText: 'Quando o usuário usar o comando `agentforge`, siga estas regras.',
        }),
      ].join('\n'),
    });
  }

  if (engineSet.has('copilot') || engineSet.has('github-copilot') || engineSet.has('githubcopilot')) {
    targets.push({
      path: join('.github', 'copilot-instructions.md'),
      content: renderAgentForgeIndex({
        ...context,
        activationText: 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.',
      }),
    });
    for (const agent of agents) {
      targets.push({
        path: join('.github', 'agents', `${normalizeString(agent.doc.id) || basename(agent.file, extname(agent.file))}.md`),
        content: renderRoleDoc(agent),
      });
    }
  }

  return targets;
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

function writeTarget(projectRoot, target, manifest, force, output) {
  const status = targetStatus(projectRoot, manifest, target.path);
  const absPath = join(projectRoot, target.path);

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

export function exportAgentForge(projectRoot, { force = false } = {}) {
  const context = loadSourceOfTruth(projectRoot);
  const manifest = loadManifest(projectRoot);
  const targets = buildExportTargets(context);
  const output = {
    written: [],
    skipped: [],
    warnings: [...context.warnings],
    errors: [...context.errors],
    messages: [],
  };

  for (const target of targets) {
    writeTarget(projectRoot, target, manifest, force, output);
  }

  if (output.written.length > 0) {
    const nextManifest = {
      ...manifest,
      ...buildManifest(projectRoot, output.written),
    };
    saveManifest(projectRoot, nextManifest);
  }

  return {
    ...output,
    valid: output.errors.length === 0,
    targets,
    context,
  };
}
