import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';
import inquirer from 'inquirer';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function parseYamlFile(filePath) {
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

function splitListInput(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(list) {
  return [...new Set(list)];
}

function toTitleCase(value) {
  return value
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ');
}

function ensureAgentForgeInstalled(projectRoot) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const statePath = join(internalDir, 'state.json');
  return existsSync(internalDir) && existsSync(statePath);
}

function scanExistingAgentIds(projectRoot) {
  const ids = new Map();
  const agentsDir = join(projectRoot, PRODUCT.internalDir, 'agents');
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) return ids;

  for (const filePath of listYamlFiles(agentsDir)) {
    const doc = parseYamlFile(filePath);
    if (!doc) continue;
    const id = normalizeString(doc.id) || basename(filePath, extname(filePath));
    if (id) {
      ids.set(id, rel(projectRoot, filePath));
    }
  }

  return ids;
}

function buildAgentDoc(answers) {
  const id = normalizeString(answers.id);
  const name = normalizeString(answers.name);
  const mission = normalizeString(answers.mission);
  const responsibilities = splitListInput(answers.responsibilities);
  const canChange = splitListInput(answers.can_change);
  const cannotChange = splitListInput(answers.cannot_change);
  const humanApproval = splitListInput(answers.human_approval);
  const activationCommands = unique(splitListInput(answers.activation_commands));

  return {
    id,
    name,
    description: mission,
    mission,
    responsibilities,
    permissions: canChange,
    boundaries: cannotChange,
    human_approval: humanApproval,
    activation: activationCommands.length > 0 ? { commands: activationCommands } : undefined,
    generated_by: 'agentforge add-agent',
    generated_subagents: [],
  };
}

function suggestSubagents(agentDoc) {
  const haystack = [
    agentDoc.id,
    agentDoc.name,
    agentDoc.description,
    agentDoc.mission,
    ...(agentDoc.responsibilities || []),
    ...(agentDoc.permissions || []),
    ...(agentDoc.boundaries || []),
    ...(agentDoc.human_approval || []),
  ].join(' ').toLowerCase();

  const suggestions = [];
  if (/(db|database|sql|schema|migration|migrat|persist|storage)/.test(haystack)) {
    suggestions.push('database-specialist');
  }
  if (/(security|auth|permission|secret|vulnerability|threat|csrf|xss|sso|oauth|jwt)/.test(haystack)) {
    suggestions.push('security-reviewer');
  }
  if (/(api|endpoint|contract|route|request|response|graphql|rest|openapi|swagger)/.test(haystack)) {
    suggestions.push('api-contract-reviewer');
  }
  return unique(suggestions);
}

function buildSubagentDoc(agentDoc, role) {
  const roleTitles = {
    'database-specialist': {
      name: 'Database Specialist',
      description: `Especialista em dados para o agente ${agentDoc.name}.`,
      responsibilities: [
        'Avaliar modelos de dados, consultas e migrações.',
        'Sinalizar riscos de persistência e compatibilidade.',
      ],
      boundaries: [
        'Não alterar esquemas ou migrations sem revisão.',
        'Não modificar dados de produção sem aprovação humana.',
      ],
      permissions: ['.agentforge/', 'db/', 'database/', 'migrations/', 'schemas/'],
    },
    'security-reviewer': {
      name: 'Security Reviewer',
      description: `Revisa segurança e aprovações humanas para o agente ${agentDoc.name}.`,
      responsibilities: [
        'Identificar riscos de segurança e exposição de segredos.',
        'Validar aprovações humanas necessárias.',
      ],
      boundaries: [
        'Não permitir escrita fora do escopo autorizado.',
        'Não aprovar mudanças que exponham segredos.',
      ],
      permissions: ['.agentforge/', 'security/', 'auth/', 'permissions/'],
    },
    'api-contract-reviewer': {
      name: 'API Contract Reviewer',
      description: `Revisa contratos de API para o agente ${agentDoc.name}.`,
      responsibilities: [
        'Validar contratos de entrada e saída.',
        'Detectar quebras de compatibilidade e regressões.',
      ],
      boundaries: [
        'Não aprovar alterações que quebrem o contrato sem registro.',
        'Não alterar integrações sem revisão.',
      ],
      permissions: ['.agentforge/', 'api/', 'routes/', 'contracts/', 'schemas/'],
    },
  };

  const config = roleTitles[role];
  return {
    id: `${agentDoc.id}-${role}`,
    name: `${agentDoc.name} ${config.name}`,
    description: config.description,
    responsibilities: config.responsibilities,
    boundaries: config.boundaries,
    permissions: config.permissions,
    parent_agent: agentDoc.id,
    generated_by: 'agentforge add-agent',
  };
}

function renderYaml(doc) {
  return `${YAML.stringify(doc).trim()}\n`;
}

function validateGeneratedAgent(agentDoc, existingIds) {
  const errors = [];

  if (!AGENT_ID_PATTERN.test(agentDoc.id)) {
    errors.push('O id do agente deve estar em kebab-case.');
  }
  if (existingIds.has(agentDoc.id)) {
    errors.push(`Já existe um agente com o id "${agentDoc.id}" em ${existingIds.get(agentDoc.id)}.`);
  }
  if (!normalizeString(agentDoc.name)) {
    errors.push('O nome do agente é obrigatório.');
  }
  if (!normalizeString(agentDoc.description) && !normalizeString(agentDoc.mission)) {
    errors.push('A descrição/missão do agente é obrigatória.');
  }
  if (!Array.isArray(agentDoc.responsibilities) || agentDoc.responsibilities.length === 0) {
    errors.push('As responsabilidades principais são obrigatórias.');
  }
  if (
    (!Array.isArray(agentDoc.permissions) || agentDoc.permissions.length === 0) &&
    (!Array.isArray(agentDoc.boundaries) || agentDoc.boundaries.length === 0)
  ) {
    errors.push('É necessário informar arquivos/pastas permitidos ou bloqueados.');
  }

  return errors;
}

function updateManifest(projectRoot, paths) {
  const current = loadManifest(projectRoot);
  const next = {
    ...current,
    ...buildManifest(projectRoot, paths),
  };
  saveManifest(projectRoot, next);
}

function updateState(projectRoot, updater) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const nextState = updater(state);
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

function createSubagentFiles(projectRoot, agentDoc, suggestedRoles) {
  const subagentsDir = join(projectRoot, PRODUCT.internalDir, 'subagents');
  mkdirSync(subagentsDir, { recursive: true });

  const created = [];
  for (const role of suggestedRoles) {
    const subagentDoc = buildSubagentDoc(agentDoc, role);
    const subagentPath = join(subagentsDir, `${subagentDoc.id}.yaml`);
    if (existsSync(subagentPath)) {
      continue;
    }
    writeFileSync(subagentPath, renderYaml(subagentDoc), 'utf8');
    created.push({
      path: rel(projectRoot, subagentPath),
      id: subagentDoc.id,
    });
  }

  return created;
}

function renderSummary(agentDoc, subagentsCreated) {
  const lines = [];
  lines.push(`Agent criado: ${agentDoc.id}`);
  if (subagentsCreated.length > 0) {
    lines.push(`Subagentes criados: ${subagentsCreated.map((item) => item.id).join(', ')}`);
  }
  return lines.join('\n');
}

export function createProjectAgent(projectRoot, answers) {
  const agentDoc = buildAgentDoc(answers);
  const existingIds = scanExistingAgentIds(projectRoot);
  const errors = validateGeneratedAgent(agentDoc, existingIds);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const agentPath = join(projectRoot, PRODUCT.internalDir, 'agents', `${agentDoc.id}.yaml`);
  if (existsSync(agentPath)) {
    return { ok: false, errors: [`Já existe um arquivo para o agente "${agentDoc.id}".`] };
  }

  mkdirSync(dirname(agentPath), { recursive: true });
  writeFileSync(agentPath, renderYaml(agentDoc), 'utf8');

  const suggestedRoles = answers.create_suggested_subagents ? suggestSubagents(agentDoc) : [];
  const subagentsCreated = createSubagentFiles(projectRoot, agentDoc, suggestedRoles);

  updateState(projectRoot, (state) => {
    const generatedAgents = Array.isArray(state.generated_agents) ? state.generated_agents : [];
    const generatedSubagents = Array.isArray(state.generated_subagents) ? state.generated_subagents : [];
    const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];

    return {
      ...state,
      generated_agents: unique([...generatedAgents, agentDoc.id]),
      generated_subagents: unique([...generatedSubagents, ...subagentsCreated.map((item) => item.id)]),
      created_files: unique([
        ...createdFiles,
        rel(projectRoot, agentPath),
        ...subagentsCreated.map((item) => item.path),
      ]),
    };
  });

  const manifestPaths = [
    rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'state.json')),
    rel(projectRoot, agentPath),
    ...subagentsCreated.map((item) => item.path),
  ];
  updateManifest(projectRoot, manifestPaths);

  return {
    ok: true,
    agent: {
      id: agentDoc.id,
      path: rel(projectRoot, agentPath),
    },
    subagents: subagentsCreated,
    summary: renderSummary(agentDoc, subagentsCreated),
  };
}

async function promptForAgent(projectRoot) {
  if (!ensureAgentForgeInstalled(projectRoot)) {
    return { cancelled: false, error: 'Instale o AgentForge primeiro com `agentforge install`.' };
  }

  const existingIds = scanExistingAgentIds(projectRoot);

  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'ID do agente (kebab-case):',
        validate: (value) => {
          const id = normalizeString(value);
          if (!id) return 'O id é obrigatório.';
          if (!AGENT_ID_PATTERN.test(id)) return 'Use kebab-case, por exemplo: backend-engineer.';
          if (existingIds.has(id)) return `Já existe um agente com o id "${id}".`;
          return true;
        },
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nome do agente:',
        validate: (value) => (normalizeString(value) ? true : 'O nome é obrigatório.'),
      },
      {
        type: 'editor',
        name: 'mission',
        message: 'Descrição/missão do agente:',
        default: 'Descreva a missão do agente em uma ou mais linhas.',
      },
      {
        type: 'editor',
        name: 'responsibilities',
        message: 'Responsabilidades principais:',
        default: 'Liste as responsabilidades, uma por linha ou separadas por vírgula.',
      },
      {
        type: 'editor',
        name: 'can_change',
        message: 'Arquivos/pastas que pode alterar:',
        default: 'Liste caminhos ou padrões permitidos.',
      },
      {
        type: 'editor',
        name: 'cannot_change',
        message: 'Arquivos/pastas que não pode alterar:',
        default: 'Liste caminhos ou padrões proibidos.',
      },
      {
        type: 'editor',
        name: 'human_approval',
        message: 'Situações que exigem aprovação humana:',
        default: 'Liste situações de aprovação, uma por linha.',
      },
      {
        type: 'editor',
        name: 'activation_commands',
        message: 'Comandos de ativação opcionais:',
        default: 'Exemplo: agentforge backend-engineer, /backend-engineer',
      },
      {
        type: 'confirm',
        name: 'create_suggested_subagents',
        message: 'Criar subagentes sugeridos?',
        default: true,
      },
    ]);

    return { cancelled: false, answers };
  } catch (error) {
    return { cancelled: true, error };
  }
}

export default async function addAgent() {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();

  const promptResult = await promptForAgent(projectRoot);
  if (promptResult.cancelled) {
    console.log(chalk.hex('#ffa203')('\n  Operação cancelada. Nenhum arquivo foi alterado.\n'));
    return 0;
  }
  if (promptResult.error) {
    console.log(chalk.red(`\n  ${promptResult.error}\n`));
    return 1;
  }

  const result = createProjectAgent(projectRoot, promptResult.answers);
  if (!result.ok) {
    for (const error of result.errors) {
      console.log(chalk.red(`  ${error}`));
    }
    console.log('');
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`\n  ${result.summary}\n`));
  return 0;
}
