import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import YAML from 'yaml';
import { PRODUCT } from '../product.js';

const REQUIRED_POLICY_FILES = [
  'permissions.yaml',
  'protected-files.yaml',
  'human-approval.yaml',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function listYamlFiles(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listYamlFiles(fullPath));
      continue;
    }

    const ext = extname(entry.name).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function rel(projectRoot, absPath) {
  const path = relative(projectRoot, absPath);
  return path || basename(absPath);
}

function pushError(errors, file, message) {
  errors.push({ file, message });
}

function pushWarning(warnings, file, message) {
  warnings.push({ file, message });
}

function parseYamlFile(filePath, errors, projectRoot) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const doc = YAML.parse(raw);
    if (!isPlainObject(doc)) {
      pushError(errors, rel(projectRoot, filePath), 'O arquivo YAML deve conter um objeto no topo.');
      return null;
    }
    return doc;
  } catch (error) {
    pushError(errors, rel(projectRoot, filePath), `YAML inválido: ${error.message}`);
    return null;
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
}

function registerDuplicate(id, file, registry, errors, kind) {
  if (!id) return false;

  if (registry.has(id)) {
    const previous = registry.get(id);
    pushError(errors, file, `ID duplicado de ${kind}: "${id}" também existe em ${previous.file}.`);
    return false;
  }

  registry.set(id, { file, kind });
  return true;
}

function validateAgent(doc, filePath, errors, registry, components, projectRoot, kind = 'agent') {
  const file = rel(projectRoot, filePath);
  const id = normalizeString(doc.id);
  const name = normalizeString(doc.name);
  const description = normalizeString(doc.description);
  const mission = normalizeString(doc.mission);
  const responsibilities = normalizeStringArray(doc.responsibilities);
  const boundaries = normalizeStringArray(doc.boundaries);
  const permissions = normalizeStringArray(doc.permissions);

  if (!id) pushError(errors, file, 'Campo obrigatório ausente: id.');
  if (!name) pushError(errors, file, 'Campo obrigatório ausente: name.');
  if (!description && !mission) {
    pushError(errors, file, 'Campo obrigatório ausente: description ou mission.');
  }
  if (responsibilities.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente ou vazio: responsibilities.');
  }
  if (boundaries.length === 0 && permissions.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente: boundaries ou permissions.');
  }

  if (!registerDuplicate(id, file, registry, errors, kind)) return;
  components.push({ id, file });
}

function validateFlow(doc, filePath, errors, agentRegistry, subagentRegistry, flowRegistry, components, projectRoot) {
  const file = rel(projectRoot, filePath);
  const id = normalizeString(doc.id);
  const name = normalizeString(doc.name);
  const steps = Array.isArray(doc.steps) ? doc.steps : null;

  if (!id) pushError(errors, file, 'Campo obrigatório ausente: id.');
  if (!name) pushError(errors, file, 'Campo obrigatório ausente: name.');
  if (!steps || steps.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente ou vazio: steps.');
    return;
  }

  for (const [index, step] of steps.entries()) {
    const stepFile = `${file}#steps[${index}]`;
    if (!isPlainObject(step)) {
      pushError(errors, stepFile, 'Cada step deve ser um objeto.');
      continue;
    }

    const stepId = normalizeString(step.id);
    const agentId =
      normalizeString(step.agent) ||
      normalizeString(step.agent_id) ||
      normalizeString(step.subagent);

    if (!stepId) {
      pushError(errors, stepFile, 'Cada step deve ter um id.');
    }
    if (!agentId) {
      pushError(errors, stepFile, 'Cada step deve referenciar um agent em "agent", "agent_id" ou "subagent".');
      continue;
    }
    if (!agentRegistry.has(agentId) && !subagentRegistry.has(agentId)) {
      pushError(errors, stepFile, `Agent inexistente referenciado: "${agentId}".`);
    }
  }

  if (!registerDuplicate(id, file, flowRegistry, errors, 'flow')) return;
  components.push({ id, file });
}

function validatePolicyFile(filePath, errors, components, projectRoot) {
  const relPath = rel(projectRoot, filePath);

  if (!existsSync(filePath)) {
    pushError(errors, relPath, 'Política obrigatória ausente.');
    return;
  }

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  components.push({
    id: basename(filePath, extname(filePath)),
    file: relPath,
  });
}

function buildReport(result) {
  const lines = [];
  lines.push('# AgentForge Validation Report');
  lines.push('');
  lines.push(`- Status: ${result.valid ? 'válido' : 'inválido'}`);
  lines.push(`- Diretório: \`${PRODUCT.internalDir}\``);
  lines.push(`- Agentes: ${result.stats.agents}`);
  lines.push(`- Subagentes: ${result.stats.subagents}`);
  lines.push(`- Fluxos: ${result.stats.flows}`);
  lines.push(`- Políticas verificadas: ${result.stats.policies}`);
  lines.push(`- Erros: ${result.errors.length}`);
  lines.push(`- Avisos: ${result.warnings.length}`);
  lines.push('');

  const appendSection = (title, items, emptyMessage) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
    } else {
      for (const item of items) {
        lines.push(`- \`${item.file}\`: ${item.message}`);
      }
    }
    lines.push('');
  };

  appendSection('Erros', result.errors, 'Nenhum erro encontrado.');
  appendSection('Avisos', result.warnings, 'Nenhum aviso encontrado.');

  lines.push('## Componentes validados');
  lines.push('');

  const appendComponents = (title, items) => {
    lines.push(`### ${title}`);
    if (items.length === 0) {
      lines.push('- Nenhum item encontrado.');
    } else {
      for (const item of items) {
        lines.push(`- \`${item.id}\` (${item.file})`);
      }
    }
    lines.push('');
  };

  appendComponents('Agentes', result.components.agents);
  appendComponents('Subagentes', result.components.subagents);
  appendComponents('Fluxos', result.components.flows);
  appendComponents('Políticas', result.components.policies);

  return lines.join('\n');
}

export function validateAgentForgeStructure(projectRoot) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const errors = [];
  const warnings = [];
  const components = {
    agents: [],
    subagents: [],
    flows: [],
    policies: [],
  };

  const statePath = join(internalDir, 'state.json');
  if (!existsSync(statePath)) {
    pushError(errors, rel(projectRoot, statePath), 'Arquivo ausente.');
  } else {
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      if (!isPlainObject(state)) {
        pushError(errors, rel(projectRoot, statePath), 'O state.json precisa conter um objeto JSON.');
      }
    } catch (error) {
      pushError(errors, rel(projectRoot, statePath), `JSON inválido: ${error.message}`);
    }
  }

  const agentsDir = join(internalDir, 'agents');
  const agentRegistry = new Map();
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) {
    pushError(errors, rel(projectRoot, agentsDir), 'Diretório ausente: agents.');
  } else {
    const agentFiles = listYamlFiles(agentsDir);
    if (agentFiles.length === 0) {
      pushError(errors, rel(projectRoot, agentsDir), 'Nenhum arquivo YAML de agente encontrado.');
    }

    for (const filePath of agentFiles) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;
      validateAgent(doc, filePath, errors, agentRegistry, components.agents, projectRoot, 'agent');
    }
  }

  const subagentsDir = join(internalDir, 'subagents');
  const subagentRegistry = new Map();
  if (existsSync(subagentsDir) && statSync(subagentsDir).isDirectory()) {
    for (const filePath of listYamlFiles(subagentsDir)) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;

      const id = normalizeString(doc.id) || basename(filePath, extname(filePath));
      const file = rel(projectRoot, filePath);
      if (agentRegistry.has(id) || subagentRegistry.has(id)) {
        const previous = agentRegistry.get(id) ?? subagentRegistry.get(id);
        pushError(errors, file, `ID duplicado de subagent: "${id}" também existe em ${previous.file}.`);
        continue;
      }

      subagentRegistry.set(id, { file, kind: 'subagent' });
      components.subagents.push({ id, file });
    }
  }

  const flowsDir = join(internalDir, 'flows');
  const flowRegistry = new Map();
  if (!existsSync(flowsDir) || !statSync(flowsDir).isDirectory()) {
    pushError(errors, rel(projectRoot, flowsDir), 'Diretório ausente: flows.');
  } else {
    const flowFiles = listYamlFiles(flowsDir);
    if (flowFiles.length === 0) {
      pushError(errors, rel(projectRoot, flowsDir), 'Nenhum arquivo YAML de flow encontrado.');
    }

    for (const filePath of flowFiles) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;
      validateFlow(doc, filePath, errors, agentRegistry, subagentRegistry, flowRegistry, components.flows, projectRoot);
    }
  }

  const policiesDir = join(internalDir, 'policies');
  if (!existsSync(policiesDir) || !statSync(policiesDir).isDirectory()) {
    pushError(errors, rel(projectRoot, policiesDir), 'Diretório ausente: policies.');
  } else {
    for (const fileName of REQUIRED_POLICY_FILES) {
      validatePolicyFile(join(policiesDir, fileName), errors, components.policies, projectRoot);
    }
  }

  if (existsSync(join(internalDir, 'reports')) && !statSync(join(internalDir, 'reports')).isDirectory()) {
    pushWarning(warnings, rel(projectRoot, join(internalDir, 'reports')), 'reports existe, mas não é um diretório.');
  }

  const report = {
    valid: errors.length === 0,
    errors,
    warnings,
    components,
    stats: {
      agents: components.agents.length,
      subagents: components.subagents.length,
      flows: components.flows.length,
      policies: components.policies.length,
    },
  };

  return {
    ...report,
    reportPath: join(internalDir, 'reports', 'validation.md'),
    reportContent: buildReport(report),
    internalDir,
  };
}

export default async function validate() {
  const { default: chalk } = await import('chalk');
  const { default: process } = await import('process');

  const projectRoot = process.cwd();
  const result = validateAgentForgeStructure(projectRoot);

  mkdirSync(dirname(result.reportPath), { recursive: true });
  writeFileSync(result.reportPath, result.reportContent, 'utf8');

  if (result.valid) {
    console.log(chalk.hex('#ffa203')(`\n  AgentForge: validação concluída com sucesso.`));
    console.log(`  Relatório: ${result.reportPath}\n`);
    return 0;
  }

  console.log(chalk.red(`\n  AgentForge: validação encontrou ${result.errors.length} erro(s).`));
  console.log(`  Relatório: ${result.reportPath}\n`);
  return 1;
}
