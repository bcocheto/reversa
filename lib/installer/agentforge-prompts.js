import inquirer from 'inquirer';
import { normalizeSetupMode } from '../product.js';

const ENGINE_CHOICES = [
  { name: 'Codex', value: 'codex' },
  { name: 'Claude Code', value: 'claude-code' },
  { name: 'Cursor', value: 'cursor' },
  { name: 'GitHub Copilot', value: 'copilot' },
];

const SETUP_MODE_CHOICES = [
  { name: 'Bootstrap - projeto novo, base agent-ready do zero', value: 'bootstrap' },
  { name: 'Adopt - projeto existente, ingestão e auditoria', value: 'adopt' },
  { name: 'Hybrid - base nova + importação do que já existe', value: 'hybrid' },
];

const PROJECT_TYPES = [
  'SaaS/Web App',
  'API',
  'CLI',
  'Mobile',
  'Biblioteca',
  'Data/AI',
  'Outro',
];

const GOALS = [
  'desenvolver features',
  'corrigir bugs',
  'revisar PRs',
  'refatorar',
  'documentar',
  'outro',
];

const INITIAL_AGENTS = [
  { name: 'Orchestrator', value: 'orchestrator' },
  { name: 'Product Owner', value: 'product-owner' },
  { name: 'Architect', value: 'architect' },
  { name: 'Engineer', value: 'engineer' },
  { name: 'Reviewer', value: 'reviewer' },
  { name: 'QA', value: 'qa' },
  { name: 'Security', value: 'security' },
  { name: 'DevOps', value: 'devops' },
];

const INITIAL_FLOWS = [
  { name: 'feature-development', value: 'feature-development' },
  { name: 'bugfix', value: 'bugfix' },
  { name: 'refactor', value: 'refactor' },
  { name: 'release', value: 'release' },
];

const LANGUAGES = [
  { name: 'pt-br', value: 'pt-br' },
  { name: 'en', value: 'en' },
  { name: 'es', value: 'es' },
];

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitList(value) {
  return String(value || '')
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function buildInstallAnswers(raw = {}) {
  const setupMode = normalizeSetupMode(raw.setup_mode);
  const extraEngines = splitList(raw.other_engines).map(normalizeSlug);
  const engines = unique([...(raw.engines || []), ...extraEngines]);
  const projectName = String(raw.project_name || '').trim();
  const userName = String(raw.user_name || '').trim();
  const projectType = String(raw.project_type || '').trim();
  const stack = String(raw.stack || '').trim();
  const objective = String(raw.agent_goal || '').trim();
  const selectedAgents = Array.isArray(raw.initial_agents) ? raw.initial_agents : [];
  const selectedFlows = Array.isArray(raw.initial_flows) ? raw.initial_flows : [];
  const gitStrategy = String(raw.git_strategy || 'add-to-gitignore').trim();

  return {
    engines,
    project_name: projectName,
    project: projectName,
    user_name: userName,
    project_type: projectType,
    stack,
    agent_goal: objective,
    objective,
    setup_mode: setupMode,
    initial_agents: selectedAgents,
    selected_agents: selectedAgents,
    internal_agents: selectedAgents,
    initial_flows: selectedFlows,
    selected_flows: selectedFlows,
    flows: selectedFlows,
    git_strategy: gitStrategy,
    chat_language: raw.chat_language || 'pt-br',
    doc_language: raw.doc_language || 'pt-br',
    output_folder: '_agentforge',
    answer_mode: 'agentforge',
    response_mode: 'agentforge',
    analysis_preferences: [
      projectType && `tipo:${projectType}`,
      stack && `stack:${stack}`,
      objective && `objetivo:${objective}`,
      gitStrategy && `git:${gitStrategy}`,
    ].filter(Boolean),
  };
}

async function promptAnswers() {
  const raw = await inquirer.prompt([
    {
      type: 'list',
      name: 'setup_mode',
      message: 'Qual modo de instalação você quer usar?',
      choices: SETUP_MODE_CHOICES,
      default: 'bootstrap',
    },
    {
      type: 'checkbox',
      name: 'engines',
      message: 'Quais engines deseja suportar?',
      choices: ENGINE_CHOICES,
      default: ['codex', 'claude-code', 'cursor', 'copilot'],
    },
    {
      type: 'input',
      name: 'other_engines',
      message: 'Outras engines já existentes (opcional, separe por vírgula):',
      default: '',
    },
    {
      type: 'input',
      name: 'project_name',
      message: 'Nome do projeto:',
      validate: (value) => (String(value || '').trim() ? true : 'O nome do projeto é obrigatório.'),
    },
    {
      type: 'input',
      name: 'user_name',
      message: 'Como os agentes devem chamar o usuário:',
      validate: (value) => (String(value || '').trim() ? true : 'Informe o nome ou tratamento do usuário.'),
    },
    {
      type: 'list',
      name: 'project_type',
      message: 'Tipo de projeto:',
      choices: PROJECT_TYPES,
      default: 'SaaS/Web App',
    },
    {
      type: 'input',
      name: 'stack',
      message: 'Stack principal:',
      validate: (value) => (String(value || '').trim() ? true : 'A stack principal é obrigatória.'),
    },
    {
      type: 'list',
      name: 'agent_goal',
      message: 'Objetivo principal dos agentes:',
      choices: GOALS,
      default: 'desenvolver features',
    },
    {
      type: 'checkbox',
      name: 'initial_agents',
      message: 'Agentes iniciais:',
      choices: INITIAL_AGENTS,
      default: INITIAL_AGENTS.map((item) => item.value),
    },
    {
      type: 'checkbox',
      name: 'initial_flows',
      message: 'Fluxos iniciais:',
      choices: INITIAL_FLOWS,
      default: INITIAL_FLOWS.map((item) => item.value),
    },
    {
      type: 'list',
      name: 'git_strategy',
      message: 'Estratégia para artefatos no git:',
      choices: [
        { name: 'Commit com o projeto', value: 'commit-with-project' },
        { name: 'Adicionar ao .gitignore', value: 'add-to-gitignore' },
      ],
      default: 'add-to-gitignore',
    },
    {
      type: 'list',
      name: 'chat_language',
      message: 'Idioma do chat:',
      choices: LANGUAGES,
      default: 'pt-br',
    },
    {
      type: 'list',
      name: 'doc_language',
      message: 'Idioma dos documentos:',
      choices: LANGUAGES,
      default: 'pt-br',
    },
  ]);

  return buildInstallAnswers(raw);
}

export async function askInstallQuestions() {
  return promptAnswers();
}

export async function promptInstall() {
  return promptAnswers();
}

export async function collectInstallAnswers() {
  return promptAnswers();
}

export default promptAnswers;
