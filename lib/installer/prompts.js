import inquirer from 'inquirer';
import { applyOrangeTheme, ORANGE_PREFIX } from './orange-prompts.js';
import {
  AGENT_SKILL_IDS,
  DEFAULT_GENERATED_SUBAGENT_IDS,
  PRODUCT,
  normalizeSetupMode,
} from '../product.js';
import { scanProjectSignals } from '../commands/project-signals.js';

applyOrangeTheme();

const GIT_STRATEGY_CHOICES = [
  { name: 'Commitar junto com o projeto', value: 'commit' },
  { name: 'Adicionar ao .gitignore', value: 'gitignore' },
];

const SETUP_MODE_CHOICES = [
  { name: 'Novo projeto — criar uma base agent-ready do zero', value: 'bootstrap' },
  { name: 'Projeto existente — importar, analisar e reorganizar o que já existe', value: 'adopt' },
];

const P = { prefix: ORANGE_PREFIX };

const STACK_DEFAULT = 'Não detectado ainda';
const OBJECTIVE_DEFAULTS = {
  bootstrap: 'develop-features',
  adopt: 'organize-existing-agentic-context',
  hybrid: 'organize-existing-agentic-context',
};

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function projectSignalsText(projectSignals = {}) {
  return normalizeText([
    projectSignals.readmeText,
    projectSignals.agentsText,
    projectSignals.claudeText,
    projectSignals.docsObjective,
    projectSignals.docsAudience,
    projectSignals.objectiveText,
    projectSignals.projectName,
    projectSignals.dependencyNames?.join(' '),
    projectSignals.packageJson?.name,
    projectSignals.packageJson?.description,
    projectSignals.projectCommands?.map((entry) => entry.command).join(' '),
    projectSignals.testingCommands?.map((entry) => entry.command).join(' '),
    projectSignals.docCommands?.map((entry) => entry.command).join(' '),
  ].filter(Boolean).join(' '));
}

function hasAny(projectSignals, needles = []) {
  const haystack = projectSignalsText(projectSignals);
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

function hasDependency(projectSignals, needles = []) {
  const dependencyNames = new Set((projectSignals.dependencyNames ?? []).map((value) => normalizeText(value)));
  return needles.some((needle) => dependencyNames.has(normalizeText(needle)));
}

function detectProjectType(projectSignals = {}) {
  const explicit = String(projectSignals.projectType ?? '').trim();
  if (explicit) return explicit;
  if (projectSignals.packageJson && (projectSignals.appExists || projectSignals.srcExists || (projectSignals.workflowFiles ?? []).length > 0 || projectSignals.workerExists)) {
    return 'SaaS/Web App';
  }
  if (projectSignals.pyproject || projectSignals.requirements) {
    return 'Data/AI';
  }
  if (projectSignals.composerJson) {
    return 'API';
  }
  if (projectSignals.readmeTitle) {
    return 'Outro';
  }
  return 'SaaS/Web App';
}

export function inferStack(projectSignals = {}) {
  const labels = [];
  const add = (label) => {
    if (label) labels.push(label);
  };
  const dependencyNames = new Set((projectSignals.dependencyNames ?? []).map((value) => normalizeText(value)));
  const hasPackageJson = Boolean(projectSignals.packageJson);
  const hasTypeScript = dependencyNames.has('typescript') || dependencyNames.has('ts-node') || (projectSignals.tsFiles ?? []).length > 0;
  const hasNest = hasDependency(projectSignals, ['@nestjs/core', '@nestjs/common', 'nestjs']);
  const hasNext = hasDependency(projectSignals, ['next', 'next.js', 'nextjs']);
  const hasReact = hasDependency(projectSignals, ['react', 'react-dom']) || hasNext;
  const hasVue = hasDependency(projectSignals, ['vue', '@vue/runtime-core', '@vue/runtime-dom']);
  const hasAngular = hasDependency(projectSignals, ['@angular/core', '@angular/cli']);
  const hasPython = Boolean(projectSignals.pyproject || projectSignals.requirements);
  const hasPHP = Boolean(projectSignals.composerJson);
  const hasDocker = Boolean(projectSignals.dockerfile || projectSignals.composeFile);
  const hasActions = (projectSignals.workflowFiles ?? []).length > 0;
  const hasPrisma = hasDependency(projectSignals, ['prisma', '@prisma/client']) || Boolean(projectSignals.prismaExists);
  const hasTypeORM = hasDependency(projectSignals, ['typeorm']);
  const hasKnex = hasDependency(projectSignals, ['knex']);
  const hasSequelize = hasDependency(projectSignals, ['sequelize']);
  const hasTests = Boolean(projectSignals.testsExists || (projectSignals.testFiles ?? []).length > 0);
  const hasDocs = Boolean(projectSignals.docsExists || (projectSignals.docsFiles ?? []).length > 0 || projectSignals.readmeExists);

  if (hasPackageJson) add('Node.js');
  if (hasTypeScript) add('TypeScript');
  if (hasNest) add('NestJS');
  if (hasNext) add('Next.js');
  if (hasReact) add('React');
  if (hasVue) add('Vue');
  if (hasAngular) add('Angular');
  if (hasPython) add('Python');
  if (hasPHP) add('PHP');
  if (hasDocker) add('Docker');
  if (hasActions) add('GitHub Actions');
  if (hasPrisma) add('Prisma');
  if (hasTypeORM) add('TypeORM');
  if (hasKnex) add('Knex');
  if (hasSequelize) add('Sequelize');
  if (hasTests) add('Tests');
  if (hasDocs) add('Docs');

  const normalized = unique(labels);
  return {
    value: normalized.length > 0 ? normalized.join(', ') : STACK_DEFAULT,
    detected: normalized.length > 0,
    labels: normalized,
    status: normalized.length > 0 ? 'detected' : 'A preencher',
  };
}

export function inferInitialAgents(projectSignals = {}, setupMode = 'bootstrap') {
  const agents = ['orchestrator', 'architect', 'engineer', 'reviewer'];
  const projectType = detectProjectType(projectSignals);
  const stack = inferStack(projectSignals);
  const hasContextSurfaces = Boolean(
    projectSignals.docsExists ||
    (projectSignals.agentsFiles ?? []).length > 0 ||
    (projectSignals.instructionDocs ?? []).length > 1
  );

  const hasTests = Boolean(
    projectSignals.testsExists ||
    (projectSignals.testFiles ?? []).length > 0 ||
    hasAny(projectSignals, ['test', 'tests', 'spec', 'specs', 'vitest', 'jest', 'mocha', 'playwright', 'cypress', 'ava', 'tap', 'pytest', 'unittest'])
  );

  const hasSecurity = hasAny(projectSignals, [
    'auth',
    'auth.js',
    'secret',
    'secrets',
    'env',
    '.env',
    'payment',
    'payments',
    'token',
    'tokens',
    'policy',
    'policies',
    'security',
    'backend',
    'server',
    'api',
    'oauth',
    'jwt',
    'sso',
    'permissions',
    'roles',
    'guard',
    'middleware',
  ]) || hasDependency(projectSignals, ['next-auth', '@auth/core', '@auth/nextjs', 'auth.js', 'passport', 'jsonwebtoken', 'jwt-decode', 'bcrypt', 'bcryptjs']);

  const hasDevops = Boolean(
    projectSignals.dockerfile ||
    projectSignals.composeFile ||
    (projectSignals.workflowFiles ?? []).length > 0 ||
    hasAny(projectSignals, ['infra', 'infrastructure', 'deployment', 'deploy', 'release', 'ci', 'cd', 'devops'])
  );

  const hasProductSignals = Boolean(
    projectSignals.readmeObjective ||
    projectSignals.readmeTitle ||
    hasAny(projectSignals, ['product', 'dashboard', 'saas']) ||
    ((projectSignals.readmeExists || projectSignals.srcExists || projectSignals.appExists || projectSignals.workerExists || (projectSignals.workflowFiles ?? []).length > 0 || projectSignals.docsExists) && projectType === 'SaaS/Web App') ||
    stack.detected
  );

  if (hasTests) agents.push('qa');
  if (hasSecurity) agents.push('security');
  if (hasDevops) agents.push('devops');
  if (hasProductSignals) agents.unshift('product-owner');
  if (setupMode !== 'bootstrap' && hasContextSurfaces) agents.push('context-curator');

  const normalized = unique(agents);
  if (normalized.length === 4) {
    normalized.push('qa', 'security');
  }

  if (!hasTests && setupMode === 'bootstrap') {
    normalized.push('qa');
  }

  if (!hasSecurity && setupMode === 'bootstrap') {
    normalized.push('security');
  }

  return unique(normalized);
}

export function inferInitialFlows(projectSignals = {}, setupMode = 'bootstrap') {
  const flows = ['feature-development', 'bugfix', 'refactor'];
  const hasReviewSignals = setupMode === 'bootstrap' || Boolean(
    projectSignals.testsExists ||
    (projectSignals.testFiles ?? []).length > 0 ||
    (projectSignals.workflowFiles ?? []).length > 0 ||
    hasAny(projectSignals, ['pr', 'pull request', 'review', 'reviews', 'ci', 'continuous integration', 'tests', 'testing', 'lint', 'validation'])
  );
  const hasReleaseSignals = Boolean(
    projectSignals.dockerfile ||
    projectSignals.composeFile ||
    (projectSignals.workflowFiles ?? []).length > 0 ||
    projectSignals.packageJson?.scripts?.build ||
    projectSignals.packageJson?.scripts?.release ||
    projectSignals.packageJson?.scripts?.publish ||
    hasAny(projectSignals, ['build', 'deploy', 'release', 'publish', 'docker', 'github actions'])
  );

  if (hasReviewSignals) flows.push('review');
  if (hasReleaseSignals) flows.push('release');

  return unique(flows);
}

export function inferObjective(setupMode = 'bootstrap') {
  return OBJECTIVE_DEFAULTS[normalizeSetupMode(setupMode)] ?? OBJECTIVE_DEFAULTS.bootstrap;
}

export async function runInstallPrompts(detectedEngines) {
  const projectSignals = scanProjectSignals(process.cwd());
  const engineChoices = detectedEngines.map(e => ({
    name: `${e.name}${e.star ? ' ⭐' : ''}`,
    value: e.id,
    checked: e.detected,
  }));
  const inferredStack = inferStack(projectSignals);
  const inferredProjectType = detectProjectType(projectSignals);
  const inferredProjectName = projectSignals.projectName || process.cwd().split(/[\\/]/).pop();

  const answers = await inquirer.prompt([
    {
      ...P,
      type: 'list',
      name: 'setup_mode',
      message: 'Qual modo de instalação você quer usar?',
      loop: false,
      choices: SETUP_MODE_CHOICES,
      default: 'bootstrap',
    },
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
      type: 'input',
      name: 'project_name',
      message: 'Nome do projeto:',
      default: inferredProjectName,
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

  const setupMode = normalizeSetupMode(answers.setup_mode);
  const objective = inferObjective(setupMode);
  const stack = inferredStack.value;
  const initialAgents = inferInitialAgents(projectSignals, setupMode);
  const initialFlows = inferInitialFlows(projectSignals, setupMode);

  return {
    ...answers,
    setup_mode: setupMode,
    project: answers.project_name,
    output_folder: PRODUCT.outputDir,
    internal_agents: AGENT_SKILL_IDS,
    generated_agents: initialAgents,
    generated_subagents: [...DEFAULT_GENERATED_SUBAGENT_IDS],
    flows: initialFlows,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
    analysis_preferences: {
      project_type: answers.project_type,
      stack,
      objective,
      git_strategy: answers.git_strategy,
    },
    stack,
    project_type: inferredProjectType,
    objective,
    initial_agents: initialAgents,
    initial_flows: initialFlows,
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
