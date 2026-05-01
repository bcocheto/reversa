import inquirer from 'inquirer';
import { applyOrangeTheme, ORANGE_PREFIX } from './orange-prompts.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../product.js';

applyOrangeTheme();

const INITIAL_AGENT_CHOICES = [
  { name: 'Orchestrator', value: 'orchestrator', checked: true },
  { name: 'Product Owner', value: 'product-owner', checked: true },
  { name: 'Architect', value: 'architect', checked: true },
  { name: 'Engineer', value: 'engineer', checked: true },
  { name: 'Reviewer', value: 'reviewer', checked: true },
  { name: 'QA', value: 'qa', checked: true },
  { name: 'Security', value: 'security', checked: true },
  { name: 'DevOps', value: 'devops', checked: true },
];

const INITIAL_FLOW_CHOICES = [
  { name: 'Feature Development', value: 'feature-development', checked: true },
  { name: 'Bugfix', value: 'bugfix', checked: true },
  { name: 'Refactor', value: 'refactor', checked: true },
  { name: 'Release', value: 'release', checked: true },
];

const PROJECT_TYPE_CHOICES = [
  { name: 'SaaS/Web App', value: 'SaaS/Web App' },
  { name: 'API', value: 'API' },
  { name: 'CLI', value: 'CLI' },
  { name: 'Mobile', value: 'Mobile' },
  { name: 'Biblioteca', value: 'Biblioteca' },
  { name: 'Data/AI', value: 'Data/AI' },
  { name: 'Outro', value: 'Outro' },
];

const OBJECTIVE_CHOICES = [
  { name: 'Desenvolver features', value: 'develop-features' },
  { name: 'Corrigir bugs', value: 'fix-bugs' },
  { name: 'Revisar PRs', value: 'review-prs' },
  { name: 'Refatorar', value: 'refactor' },
  { name: 'Documentar', value: 'document' },
  { name: 'Outro', value: 'other' },
];

const GIT_STRATEGY_CHOICES = [
  { name: 'Commitar junto com o projeto', value: 'commit' },
  { name: 'Adicionar ao .gitignore', value: 'gitignore' },
];

const P = { prefix: ORANGE_PREFIX };

export async function runInstallPrompts(detectedEngines) {
  const engineChoices = detectedEngines.map(e => ({
    name: `${e.name}${e.star ? ' ⭐' : ''}`,
    value: e.id,
    checked: e.detected,
  }));

  const answers = await inquirer.prompt([
    {
      ...P,
      type: 'checkbox',
      name: 'engines',
      message: 'Quais engines você quer suportar?',
      choices: engineChoices,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Selecione ao menos uma engine.',
    },
    {
      ...P,
      type: 'checkbox',
      name: 'initial_agents',
      message: 'Quais agentes iniciais você quer criar?',
      choices: INITIAL_AGENT_CHOICES,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Selecione pelo menos um agente inicial.',
    },
    {
      ...P,
      type: 'input',
      name: 'project_name',
      message: 'Nome do projeto:',
      default: process.cwd().split(/[\\/]/).pop(),
      validate: (v) => v.trim().length > 0 || 'O nome não pode ficar vazio.',
    },
    {
      ...P,
      type: 'input',
      name: 'user_name',
      message: 'Como os agentes devem chamar você?',
      validate: (v) => v.trim().length > 0 || 'O nome não pode ficar vazio.',
    },
    {
      ...P,
      type: 'list',
      name: 'project_type',
      message: 'Tipo de projeto:',
      loop: false,
      choices: PROJECT_TYPE_CHOICES,
    },
    {
      ...P,
      type: 'input',
      name: 'stack',
      message: 'Stack principal:',
      validate: (v) => v.trim().length > 0 || 'A stack não pode ficar vazia.',
    },
    {
      ...P,
      type: 'list',
      name: 'objective',
      message: 'Objetivo principal dos agentes:',
      loop: false,
      choices: OBJECTIVE_CHOICES,
    },
    {
      ...P,
      type: 'checkbox',
      name: 'initial_flows',
      message: 'Quais fluxos iniciais você quer criar?',
      choices: INITIAL_FLOW_CHOICES,
      loop: false,
      validate: (selected) => selected.length > 0 || 'Selecione pelo menos um fluxo inicial.',
    },
    {
      ...P,
      type: 'list',
      name: 'git_strategy',
      message: 'Estratégia para artefatos no git:',
      loop: false,
      choices: GIT_STRATEGY_CHOICES,
    },
    {
      ...P,
      type: 'input',
      name: 'chat_language',
      message: 'Idioma do chat:',
      default: 'pt-br',
    },
    {
      ...P,
      type: 'input',
      name: 'doc_language',
      message: 'Idioma dos documentos:',
      default: 'pt-br',
    },
  ]);

  return {
    ...answers,
    project: answers.project_name,
    output_folder: PRODUCT.outputDir,
    internal_agents: AGENT_SKILL_IDS,
    generated_agents: answers.initial_agents,
    generated_subagents: [],
    flows: answers.initial_flows,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
    analysis_preferences: {
      project_type: answers.project_type,
      stack: answers.stack,
      objective: answers.objective,
      git_strategy: answers.git_strategy,
    },
  };
}

export async function askMergeStrategy(filePath) {
  const { strategy } = await inquirer.prompt([
    {
      ...P,
      type: 'list',
      name: 'strategy',
      message: `O arquivo "${filePath}" já existe. O que você quer fazer?`,
      loop: false,
      choices: [
        { name: `Mesclar: adicionar o conteúdo do ${PRODUCT.name} ao final`, value: 'merge' },
        { name: 'Pular: manter o arquivo como está', value: 'skip' },
      ],
    },
  ]);
  return strategy;
}
