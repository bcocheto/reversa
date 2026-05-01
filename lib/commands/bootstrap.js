import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import inquirer from 'inquirer';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { ENGINES } from '../installer/detector.js';
import { PRODUCT, normalizeSetupMode } from '../product.js';

const PROJECT_TYPE_CHOICES = [
  { name: 'SaaS/Web App', value: 'SaaS/Web App' },
  { name: 'API', value: 'API' },
  { name: 'CLI', value: 'CLI' },
  { name: 'Mobile', value: 'Mobile' },
  { name: 'Biblioteca', value: 'Biblioteca' },
  { name: 'Data/AI', value: 'Data/AI' },
  { name: 'Outro', value: 'Outro' },
];

const PRIMARY_GOAL_CHOICES = [
  { name: 'Desenvolver features', value: 'develop-features' },
  { name: 'Corrigir bugs', value: 'fix-bugs' },
  { name: 'Revisar PRs', value: 'review-prs' },
  { name: 'Refatorar', value: 'refactor' },
  { name: 'Documentar', value: 'document' },
  { name: 'Outro', value: 'other' },
];

const WORKFLOW_CHOICES = [
  { name: 'Feature development', value: 'feature-development' },
  { name: 'Bugfix', value: 'bugfix' },
  { name: 'Refactor', value: 'refactor' },
  { name: 'Review', value: 'review' },
  { name: 'Release', value: 'release' },
];

const QUALITY_LEVEL_CHOICES = [
  { name: 'Balanced', value: 'balanced' },
  { name: 'Strict', value: 'strict' },
  { name: 'Fast', value: 'fast' },
  { name: 'High', value: 'high' },
  { name: 'Minimal', value: 'minimal' },
];

const PRIMARY_GOAL_LABELS = {
  'develop-features': 'Desenvolver features',
  'fix-bugs': 'Corrigir bugs',
  'review-prs': 'Revisar PRs',
  refactor: 'Refatorar',
  document: 'Documentar',
  other: 'Outro',
};

const WORKFLOW_LABELS = {
  'feature-development': 'Feature Development',
  bugfix: 'Bugfix',
  refactor: 'Refactor',
  review: 'Review',
  release: 'Release',
};

const QUALITY_LABELS = {
  balanced: 'Balanced',
  strict: 'Strict',
  fast: 'Fast',
  high: 'High',
  minimal: 'Minimal',
};

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function splitListInput(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }

  if (typeof value !== 'string') return [];
  return value
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toTitleCase(value) {
  return value
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function normalizeEngineId(value) {
  const needle = normalizeString(value).toLowerCase().replace(/[\s_]+/g, '-');
  const matched = ENGINES.find((engine) => {
    const id = normalizeString(engine.id).toLowerCase();
    const name = normalizeString(engine.name).toLowerCase().replace(/[\s_]+/g, '-');
    return id === needle || name === needle;
  });
  return matched ? matched.id : needle;
}

function normalizeGoalId(value) {
  const needle = normalizeString(value).toLowerCase().replace(/[\s_]+/g, '-');
  const matched = PRIMARY_GOAL_CHOICES.find((entry) => entry.value === needle);
  return matched ? matched.value : needle;
}

function labelPrimaryGoal(value) {
  return PRIMARY_GOAL_LABELS[value] ?? toTitleCase(value);
}

function labelWorkflow(value) {
  return WORKFLOW_LABELS[value] ?? toTitleCase(value);
}

function labelQualityLevel(value) {
  return QUALITY_LABELS[value] ?? toTitleCase(value);
}

function getConfigSnapshot(projectRoot) {
  const configCandidates = [
    join(projectRoot, PRODUCT.internalDir, 'config.toml'),
    join(projectRoot, PRODUCT.internalDir, 'config.yaml'),
  ];

  for (const configPath of configCandidates) {
    if (existsSync(configPath)) {
      return {
        path: configPath,
        content: readFileSync(configPath, 'utf8'),
      };
    }
  }

  return {
    path: null,
    content: '',
  };
}

function parseBootstrapArgs(args) {
  const flags = {
    primary_goals: [],
    engines: [],
  };

  const getNextValue = (index) => {
    const next = args[index + 1];
    if (typeof next === 'undefined' || String(next).startsWith('-')) return null;
    return next;
  };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].replace(/-/g, '_');
      const value = match[2];
      if (key === 'project_type') flags.project_type = value;
      else if (key === 'stack') flags.stack = value;
      else if (key === 'primary_goals') flags.primary_goals.push(...splitListInput(value));
      else if (key === 'preferred_workflow') flags.preferred_workflow = value;
      else if (key === 'quality_level') flags.quality_level = value;
      else if (key === 'engines') flags.engines.push(...splitListInput(value));
      continue;
    }

    const normalized = arg.replace(/^--/, '').replace(/-/g, '_');
    if (normalized === 'project_type') {
      const value = getNextValue(index);
      if (value !== null) flags.project_type = value;
      index++;
    } else if (normalized === 'stack') {
      const value = getNextValue(index);
      if (value !== null) flags.stack = value;
      index++;
    } else if (normalized === 'primary_goals') {
      const value = getNextValue(index);
      if (value !== null) flags.primary_goals.push(...splitListInput(value));
      index++;
    } else if (normalized === 'preferred_workflow') {
      const value = getNextValue(index);
      if (value !== null) flags.preferred_workflow = value;
      index++;
    } else if (normalized === 'quality_level') {
      const value = getNextValue(index);
      if (value !== null) flags.quality_level = value;
      index++;
    } else if (normalized === 'engines') {
      const value = getNextValue(index);
      if (value !== null) flags.engines.push(...splitListInput(value));
      index++;
    }
  }

  flags.primary_goals = unique(flags.primary_goals.map(normalizeGoalId));
  flags.engines = unique(flags.engines.map(normalizeEngineId));
  flags.project_type = normalizeString(flags.project_type);
  flags.stack = normalizeString(flags.stack);
  flags.preferred_workflow = normalizeString(flags.preferred_workflow);
  flags.quality_level = normalizeString(flags.quality_level);

  return flags;
}

function renderProjectOverview(context) {
  const lines = [];
  lines.push('# Project Overview');
  lines.push('');
  lines.push('## Name');
  lines.push('');
  lines.push(context.projectName || '<nome do projeto>');
  lines.push('');
  lines.push('## User');
  lines.push('');
  lines.push(context.userName || '<nome de contato>');
  lines.push('');
  lines.push('## Project type');
  lines.push('');
  lines.push(context.projectType || '<tipo de projeto>');
  lines.push('');
  lines.push('## Stack');
  lines.push('');
  lines.push(context.stack || '<stack principal>');
  lines.push('');
  lines.push('## Primary goals');
  lines.push('');
  if (context.primaryGoals.length === 0) {
    lines.push('- <descreva os objetivos principais>');
  } else {
    for (const goal of context.primaryGoals) {
      lines.push(`- ${labelPrimaryGoal(goal)}`);
    }
  }
  lines.push('');
  lines.push('## Preferred workflow');
  lines.push('');
  lines.push(labelWorkflow(context.preferredWorkflow));
  lines.push('');
  lines.push('## Quality level');
  lines.push('');
  lines.push(labelQualityLevel(context.qualityLevel));
  lines.push('');
  lines.push('## Engines');
  lines.push('');
  if (context.engines.length === 0) {
    lines.push('- <selecione as engines>');
  } else {
    for (const engine of context.engines) {
      lines.push(`- ${engine}`);
    }
  }
  lines.push('');
  lines.push('## Current state');
  lines.push('');
  lines.push(`- Setup mode: ${context.setupMode}`);
  lines.push(`- Current phase: ${context.phase ?? 'n/a'}`);
  lines.push(`- Output folder: ${context.outputFolder}`);
  lines.push(`- Last bootstrap: ${context.lastBootstrapAt}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Keep this file short, current, and easy for humans to review.');
  lines.push('- Update it whenever the project direction changes.');
  return lines.join('\n');
}

function renderArchitecture(context) {
  const lines = [];
  lines.push('# Architecture');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(
    `This project is a ${context.projectType || 'project'} built on ${context.stack || 'the selected stack'}. ` +
    `AgentForge should optimize for the ${labelWorkflow(context.preferredWorkflow)} workflow at ${labelQualityLevel(context.qualityLevel)} quality.`,
  );
  lines.push('');
  lines.push('## Layers');
  lines.push('');
  lines.push('- Interface: entry points, UI, CLI, or API surface.');
  lines.push('- Application: orchestration, use cases, and workflows.');
  lines.push('- Domain: core rules, models, and project-specific constraints.');
  lines.push('- Infrastructure: persistence, integrations, deployment, and tools.');
  lines.push('');
  lines.push('## Main flow');
  lines.push('');
  lines.push('1. Discover the task and align on scope.');
  lines.push('2. Pick the right agent or subagent.');
  lines.push('3. Design the change in small steps.');
  lines.push('4. Implement and validate.');
  lines.push('5. Review the result and record learning.');
  lines.push('');
  lines.push('## Project context');
  lines.push('');
  lines.push(`- Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set yet'}`);
  lines.push(`- Engines: ${context.engines.length > 0 ? context.engines.join(', ') : 'not set yet'}`);
  lines.push(`- Setup mode: ${context.setupMode}`);
  lines.push('');
  lines.push('## Decisions to keep explicit');
  lines.push('');
  lines.push('- What is protected from automatic changes.');
  lines.push('- Which files require human approval.');
  lines.push('- Which flows are mandatory for the current project type.');
  return lines.join('\n');
}

function renderCommands(context) {
  const lines = [];
  lines.push('# Commands');
  lines.push('');
  lines.push('## Available commands');
  lines.push('');
  lines.push('- `agentforge install`');
  lines.push('- `agentforge bootstrap`');
  lines.push('- `agentforge status`');
  lines.push('- `agentforge add-agent`');
  lines.push('- `agentforge add-flow`');
  lines.push('- `agentforge add-engine`');
  lines.push('- `agentforge validate`');
  lines.push('- `agentforge compile`');
  lines.push('- `agentforge update`');
  lines.push('- `agentforge uninstall`');
  lines.push('');
  lines.push('## Current bootstrap focus');
  lines.push('');
  lines.push(`- Project type: ${context.projectType || 'not set'}`);
  lines.push(`- Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set'}`);
  lines.push(`- Preferred workflow: ${labelWorkflow(context.preferredWorkflow)}`);
  lines.push(`- Quality level: ${labelQualityLevel(context.qualityLevel)}`);
  return lines.join('\n');
}

function renderHumanApproval(context) {
  const lines = [];
  lines.push('# Human Approval');
  lines.push('');
  lines.push('## When to ask for approval');
  lines.push('');
  lines.push('- Changes in protected files.');
  lines.push('- Changes outside the area authorized by the policies.');
  lines.push('- Removal of generated files that were edited manually.');
  lines.push('- Changes that affect deployment, secrets, or data shape.');
  if (context.qualityLevel === 'strict' || context.qualityLevel === 'high') {
    lines.push('- Any change that could affect stability, testing, or release readiness.');
  }
  lines.push('');
  lines.push('## Suggested approval format');
  lines.push('');
  lines.push('- What changes.');
  lines.push('- Why it is needed.');
  lines.push('- What could break.');
  lines.push('- What the safer alternative is.');
  lines.push('');
  lines.push('## Rule');
  lines.push('');
  lines.push('- Do not proceed without explicit approval when a policy requires it.');
  return lines.join('\n');
}

function renderContextIndex(context) {
  const items = [
    { id: 'project-overview', path: 'context/project-overview.md', purpose: 'Project summary, goals, and operating constraints.' },
    { id: 'architecture', path: 'context/architecture.md', purpose: 'Architecture map and main delivery flow.' },
    { id: 'conventions', path: 'context/conventions.md', purpose: 'Naming, structure, and team conventions.' },
    { id: 'coding-standards', path: 'context/coding-standards.md', purpose: 'Code quality expectations and review baseline.' },
    { id: 'testing', path: 'context/testing.md', purpose: 'Testing strategy and validation commands.' },
    { id: 'deployment', path: 'context/deployment.md', purpose: 'Deployment and rollback notes.' },
    { id: 'glossary', path: 'context/glossary.md', purpose: 'Project terminology and recurring terms.' },
  ];

  const doc = {
    version: 2,
    bootstrap: {
      project_name: context.projectName,
      user_name: context.userName,
      project_type: context.projectType,
      stack: context.stack,
      primary_goals: context.primaryGoals,
      preferred_workflow: context.preferredWorkflow,
      quality_level: context.qualityLevel,
      engines: context.engines,
      setup_mode: context.setupMode,
      last_bootstrap_at: context.lastBootstrapAt,
    },
    items,
    skills: [
      {
        id: 'run-tests',
        path: 'skills/run-tests/SKILL.md',
        purpose: 'Execute and interpret the suite when validating generated changes.',
      },
      {
        id: 'review-changes',
        path: 'skills/review-changes/SKILL.md',
        purpose: 'Review changes with focus on safety, regression, and clarity.',
      },
      {
        id: 'create-implementation-plan',
        path: 'skills/create-implementation-plan/SKILL.md',
        purpose: 'Turn a request into a small, sequenced implementation plan.',
      },
    ],
    flows: [
      { id: 'feature-development', path: 'flows/feature-development.md', purpose: 'Deliver a new capability with discovery, design, implementation, and review.' },
      { id: 'bugfix', path: 'flows/bugfix.md', purpose: 'Resolve a reproducible problem with minimal scope.' },
      { id: 'refactor', path: 'flows/refactor.md', purpose: 'Improve structure without changing expected behavior.' },
      { id: 'review', path: 'flows/review.md', purpose: 'Review change sets before integration.' },
    ],
  };

  return `${YAML.stringify(doc).trim()}\n`;
}

function renderFlowDoc(flowId, context) {
  const projectContext = [
    `Project type: ${context.projectType || 'not set'}`,
    `Stack: ${context.stack || 'not set'}`,
    `Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set'}`,
    `Preferred workflow: ${labelWorkflow(context.preferredWorkflow)}`,
    `Quality level: ${labelQualityLevel(context.qualityLevel)}`,
  ];

  if (flowId === 'feature-development') {
    return [
      '# Feature Development',
      '',
      '## Objective',
      '',
      'Deliver a new capability with a small, explicit sequence of steps.',
      '',
      '## When to use',
      '',
      '- The user asked for a new feature.',
      '- The work needs discovery, design, implementation, and review.',
      '',
      '## Project context',
      '',
      ...projectContext.map((line) => `- ${line}`),
      '',
      '## Steps',
      '',
      '1. Discover the problem and confirm scope.',
      '2. Design the approach and record trade-offs.',
      '3. Implement in small, reviewable increments.',
      '4. Validate behavior with tests or checks.',
      '5. Review the result and capture follow-up work.',
      '',
      '## Checkpoints',
      '',
      '- Scope understood.',
      '- Design approved.',
      '- Implementation validated.',
      '- Review completed.',
    ].join('\n');
  }

  if (flowId === 'bugfix') {
    return [
      '# Bugfix',
      '',
      '## Objective',
      '',
      'Fix a reproducible issue with the smallest safe change.',
      '',
      '## When to use',
      '',
      '- The behavior is broken or inconsistent.',
      '- The root cause can be isolated.',
      '',
      '## Project context',
      '',
      ...projectContext.map((line) => `- ${line}`),
      '',
      '## Steps',
      '',
      '1. Reproduce the problem.',
      '2. Find the cause.',
      '3. Patch the issue.',
      '4. Validate the fix.',
      '5. Review the impact.',
      '',
      '## Checkpoints',
      '',
      '- Reproduced.',
      '- Fixed.',
      '- Tested.',
      '- Reviewed.',
    ].join('\n');
  }

  if (flowId === 'refactor') {
    return [
      '# Refactor',
      '',
      '## Objective',
      '',
      'Improve structure without changing expected behavior.',
      '',
      '## When to use',
      '',
      '- The code is hard to maintain.',
      '- The change should preserve the current contract.',
      '',
      '## Project context',
      '',
      ...projectContext.map((line) => `- ${line}`),
      '',
      '## Steps',
      '',
      '1. Understand the current behavior.',
      '2. Define what must not change.',
      '3. Refactor in small steps.',
      '4. Test.',
      '5. Review the result.',
      '',
      '## Checkpoints',
      '',
      '- Behavior preserved.',
      '- Readability improved.',
    ].join('\n');
  }

  return [
    '# Review',
    '',
    '## Objective',
    '',
    'Review a change set with attention to risk, safety, and clarity.',
    '',
    '## When to use',
    '',
    '- Before integrating an important change.',
    '- After feature, bugfix, or refactor flows.',
    '',
    '## Project context',
    '',
    ...projectContext.map((line) => `- ${line}`),
    '',
    '## Steps',
    '',
    '1. Read the change.',
    '2. Check impact.',
    '3. Verify policies.',
    '4. Flag risks.',
    '5. Approve or request adjustments.',
    '',
    '## Checkpoints',
    '',
    '- Risks identified.',
    '- Safety considered.',
    '- Next steps clear.',
  ].join('\n');
}

function renderSkillDoc(skillId, context) {
  const bootstrapSection = [
    '',
    '## Bootstrap context',
    '',
    `- Project: ${context.projectName}`,
    `- Type: ${context.projectType || 'not set'}`,
    `- Stack: ${context.stack || 'not set'}`,
    `- Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set'}`,
    `- Preferred workflow: ${labelWorkflow(context.preferredWorkflow)}`,
    `- Quality level: ${labelQualityLevel(context.qualityLevel)}`,
    `- Engines: ${context.engines.length > 0 ? context.engines.join(', ') : 'not set'}`,
  ].join('\n');

  if (skillId === 'run-tests') {
    return [
      '---',
      'name: run-tests',
      'description: Executes and interprets the test suite for AgentForge or the installed project.',
      'license: MIT',
      'compatibility: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot e demais agentes compatíveis com Agent Skills.',
      'metadata:',
      '  author: bcocheto',
      '  version: "1.0.0"',
      '  framework: agentforge',
      '  role: utility',
      '---',
      '',
      '# Run Tests',
      '',
      '## Mission',
      '',
      'Execute the relevant tests, interpret the result, and highlight the next step.',
      bootstrapSection,
      '',
      '## Expected output',
      '',
      '- Command executed.',
      '- Short result summary.',
      '- Relevant errors.',
      '- Recommended next step.',
    ].join('\n');
  }

  if (skillId === 'review-changes') {
    return [
      '---',
      'name: review-changes',
      'description: Reviews AgentForge changes with focus on safety, regressions, and clarity.',
      'license: MIT',
      'compatibility: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot e demais agentes compatíveis com Agent Skills.',
      'metadata:',
      '  author: bcocheto',
      '  version: "1.0.0"',
      '  framework: agentforge',
      '  role: reviewer',
      '---',
      '',
      '# Review Changes',
      '',
      '## Mission',
      '',
      'Read a change and point out real risks, inconsistencies, and attention points.',
      bootstrapSection,
      '',
      '## Checks',
      '',
      '- File safety.',
      '- Compatibility with older installations.',
      '- Template readability.',
      '- Test coverage.',
      '',
      '## Expected output',
      '',
      '- Problems found.',
      '- Severity.',
      '- Adjustment recommendation.',
    ].join('\n');
  }

  return [
    '---',
    'name: create-implementation-plan',
    'description: Converts a project request into a small, sequenced, and verifiable implementation plan.',
    'license: MIT',
    'compatibility: Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot e demais agentes compatíveis com Agent Skills.',
    'metadata:',
    '  author: bcocheto',
    '  version: "1.0.0"',
    '  framework: agentforge',
    '  role: planner',
    '---',
    '',
    '# Create Implementation Plan',
    '',
    '## Mission',
    '',
    'Turn an idea into small, ordered, and easy-to-validate steps.',
    bootstrapSection,
    '',
    '## Suggested structure',
    '',
    '1. Objective.',
    '2. Scope.',
    '3. Risks.',
    '4. Implementation steps.',
    '5. Validation.',
    '6. Rollback.',
    '',
    '## Expected output',
    '',
    '- Ordered plan.',
    '- Clear dependencies.',
    '- Explicit test points.',
  ].join('\n');
}

function renderSkillsReadme(context) {
  const lines = [];
  lines.push('# Skills');
  lines.push('');
  lines.push('As skills desta pasta são atalhos reutilizáveis para tarefas frequentes.');
  lines.push('Elas ajudam a manter instruções pequenas, legíveis e fáceis de revisar.');
  lines.push('');
  lines.push('## Skills incluídas');
  lines.push('');
  lines.push('- `run-tests`: executar e interpretar a suíte.');
  lines.push('- `review-changes`: revisar mudanças com foco em risco e regressão.');
  lines.push('- `create-implementation-plan`: transformar uma ideia em um plano de execução.');
  lines.push('');
  lines.push('## Bootstrap context');
  lines.push('');
  lines.push(`- Project: ${context.projectName}`);
  lines.push(`- Type: ${context.projectType || 'not set'}`);
  lines.push(`- Stack: ${context.stack || 'not set'}`);
  lines.push(`- Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set'}`);
  lines.push(`- Preferred workflow: ${labelWorkflow(context.preferredWorkflow)}`);
  lines.push(`- Quality level: ${labelQualityLevel(context.qualityLevel)}`);
  return lines.join('\n');
}

function renderBootstrapReport(context, written, skipped, warnings) {
  const lines = [];
  lines.push('# Bootstrap Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${context.projectName}`);
  lines.push(`- Mode: ${context.setupMode}`);
  lines.push(`- Project type: ${context.projectType || 'not set'}`);
  lines.push(`- Stack: ${context.stack || 'not set'}`);
  lines.push(`- Primary goals: ${context.primaryGoals.length > 0 ? context.primaryGoals.map(labelPrimaryGoal).join(', ') : 'not set'}`);
  lines.push(`- Preferred workflow: ${labelWorkflow(context.preferredWorkflow)}`);
  lines.push(`- Quality level: ${labelQualityLevel(context.qualityLevel)}`);
  lines.push(`- Engines: ${context.engines.length > 0 ? context.engines.join(', ') : 'not set'}`);
  lines.push(`- Last bootstrap: ${context.lastBootstrapAt}`);
  lines.push('');
  lines.push('## Files written');
  lines.push('');
  if (written.length === 0) {
    lines.push('- None.');
  } else {
    for (const file of written) {
      lines.push(`- ${file}`);
    }
  }
  lines.push('');
  lines.push('## Files preserved');
  lines.push('');
  if (skipped.length === 0) {
    lines.push('- None.');
  } else {
    for (const file of skipped) {
      lines.push(`- ${file}`);
    }
  }
  if (warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    lines.push('');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join('\n');
}

function ensureAgentForgeInstalled(projectRoot) {
  return existsSync(join(projectRoot, PRODUCT.internalDir, 'state.json'));
}

function shouldWriteFile(projectRoot, manifest, relPath) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return 'create';

  const hash = manifest[relPath];
  if (!hash) return 'skip';

  return fileStatus(projectRoot, relPath, hash) === 'intact' ? 'write' : 'skip';
}

function writeManagedFile(writer, projectRoot, manifest, relPath, content, { force = false } = {}) {
  const decision = force ? (existsSync(join(projectRoot, relPath)) ? 'write' : 'create') : shouldWriteFile(projectRoot, manifest, relPath);
  if (decision === 'skip') return 'skipped';

  writer.writeGeneratedFile(join(projectRoot, relPath), content, { force: true });
  return 'written';
}

export default async function bootstrap(args = []) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Bootstrap\n`));
    console.log(`  Uso: npx ${PRODUCT.command} bootstrap [--project-type <tipo>] [--stack <stack>] [--primary-goals <lista>] [--preferred-workflow <fluxo>] [--quality-level <nivel>] [--engines <lista>]\n`);
    return 0;
  }

  const projectRoot = process.cwd();
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  if (!ensureAgentForgeInstalled(projectRoot)) {
    console.log(chalk.yellow(`  ${PRODUCT.name} is not installed in this directory. Run npx ${PRODUCT.command} install.`));
    return 1;
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const configSnapshot = getConfigSnapshot(projectRoot);
  const parsedArgs = parseBootstrapArgs(args);

  const resolved = {
    projectName: normalizeString(state.project) || basename(projectRoot),
    userName: normalizeString(state.user_name) || 'Você',
    projectType: parsedArgs.project_type || normalizeString(state.project_type) || 'SaaS/Web App',
    stack: parsedArgs.stack || normalizeString(state.stack) || '',
    primaryGoals: parsedArgs.primary_goals.length > 0
      ? parsedArgs.primary_goals
      : splitListInput(state.primary_goals).map(normalizeGoalId).filter(Boolean),
    preferredWorkflow: parsedArgs.preferred_workflow || normalizeString(state.preferred_workflow) || normalizeString(state.initial_flows?.[0]) || 'feature-development',
    qualityLevel: parsedArgs.quality_level || normalizeString(state.quality_level) || 'balanced',
    engines: parsedArgs.engines.length > 0
      ? parsedArgs.engines
      : splitListInput(state.engines).map(normalizeEngineId).filter(Boolean),
  };

  if (resolved.primaryGoals.length === 0 && normalizeString(state.objective)) {
    resolved.primaryGoals = [normalizeGoalId(state.objective)];
  }

  const needsPrompt =
    !parsedArgs.project_type ||
    !parsedArgs.stack ||
    parsedArgs.primary_goals.length === 0 ||
    !parsedArgs.preferred_workflow ||
    !parsedArgs.quality_level ||
    parsedArgs.engines.length === 0;

  if (needsPrompt) {
    const answers = await inquirer.prompt([
      !parsedArgs.project_type ? {
        type: 'list',
        name: 'projectType',
        message: 'Tipo de projeto:',
        choices: PROJECT_TYPE_CHOICES,
        default: state.project_type || 'SaaS/Web App',
      } : null,
      !parsedArgs.stack ? {
        type: 'input',
        name: 'stack',
        message: 'Stack principal:',
        default: normalizeString(state.stack),
        validate: (value) => normalizeString(value).length > 0 || 'A stack não pode ficar vazia.',
      } : null,
      parsedArgs.primary_goals.length === 0 ? {
        type: 'checkbox',
        name: 'primaryGoals',
        message: 'Quais são os objetivos principais?',
        choices: PRIMARY_GOAL_CHOICES.map((entry) => ({
          name: entry.name,
          value: entry.value,
          checked: splitListInput(state.primary_goals).map(normalizeGoalId).includes(entry.value),
        })),
        validate: (selected) => selected.length > 0 || 'Selecione pelo menos um objetivo principal.',
      } : null,
      !parsedArgs.preferred_workflow ? {
        type: 'list',
        name: 'preferredWorkflow',
        message: 'Fluxo preferido:',
        choices: WORKFLOW_CHOICES,
        default: normalizeString(state.preferred_workflow) || normalizeString(state.initial_flows?.[0]) || 'feature-development',
      } : null,
      !parsedArgs.quality_level ? {
        type: 'list',
        name: 'qualityLevel',
        message: 'Nível de qualidade:',
        choices: QUALITY_LEVEL_CHOICES,
        default: normalizeString(state.quality_level) || 'balanced',
      } : null,
      parsedArgs.engines.length === 0 ? {
        type: 'checkbox',
        name: 'engines',
        message: 'Quais engines devem ser consideradas no bootstrap?',
        choices: ENGINES.map((engine) => ({
          name: engine.name,
          value: engine.id,
          checked: splitListInput(state.engines).map(normalizeEngineId).includes(engine.id),
        })),
        validate: (selected) => selected.length > 0 || 'Selecione ao menos uma engine.',
      } : null,
    ].filter(Boolean));

    resolved.projectType = parsedArgs.project_type || normalizeString(answers.projectType) || resolved.projectType;
    resolved.stack = parsedArgs.stack || normalizeString(answers.stack) || resolved.stack;
    resolved.primaryGoals = parsedArgs.primary_goals.length > 0
      ? parsedArgs.primary_goals
      : unique((answers.primaryGoals ?? []).map(normalizeGoalId));
    resolved.preferredWorkflow = parsedArgs.preferred_workflow || normalizeString(answers.preferredWorkflow) || resolved.preferredWorkflow;
    resolved.qualityLevel = parsedArgs.quality_level || normalizeString(answers.qualityLevel) || resolved.qualityLevel;
    resolved.engines = parsedArgs.engines.length > 0
      ? parsedArgs.engines
      : unique((answers.engines ?? []).map(normalizeEngineId));
  }

  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const manifest = loadManifest(projectRoot);
  const writer = new Writer(projectRoot);
  const now = new Date().toISOString();
  const humanContext = {
    projectName: resolved.projectName,
    userName: resolved.userName,
    projectType: resolved.projectType,
    stack: resolved.stack,
    primaryGoals: resolved.primaryGoals,
    preferredWorkflow: resolved.preferredWorkflow,
    qualityLevel: resolved.qualityLevel,
    engines: resolved.engines.map((engineId) => {
      const engine = ENGINES.find((entry) => entry.id === engineId);
      return engine ? engine.name : engineId;
    }),
    setupMode: normalizeSetupMode(state.setup_mode),
    phase: state.phase ?? null,
    outputFolder: normalizeString(state.output_folder) || PRODUCT.outputDir,
    lastBootstrapAt: now,
  };

  const written = [];
  const skipped = [];
  const warnings = [];

  const managedFiles = [
    { relPath: join(PRODUCT.internalDir, 'context', 'project-overview.md'), content: renderProjectOverview(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'context', 'architecture.md'), content: renderArchitecture(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'references', 'commands.md'), content: renderCommands(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'policies', 'human-approval.md'), content: renderHumanApproval(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'harness', 'context-index.yaml'), content: renderContextIndex(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'flows', 'feature-development.md'), content: renderFlowDoc('feature-development', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'flows', 'bugfix.md'), content: renderFlowDoc('bugfix', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'flows', 'refactor.md'), content: renderFlowDoc('refactor', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'flows', 'review.md'), content: renderFlowDoc('review', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'skills', 'README.md'), content: renderSkillsReadme(humanContext) },
    { relPath: join(PRODUCT.internalDir, 'skills', 'run-tests', 'SKILL.md'), content: renderSkillDoc('run-tests', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'skills', 'review-changes', 'SKILL.md'), content: renderSkillDoc('review-changes', humanContext) },
    { relPath: join(PRODUCT.internalDir, 'skills', 'create-implementation-plan', 'SKILL.md'), content: renderSkillDoc('create-implementation-plan', humanContext) },
  ];

  const spinner = ora({ text: 'Preparando contexto base...', color: 'cyan' }).start();

  try {
    for (const entry of managedFiles) {
      const result = writeManagedFile(writer, projectRoot, manifest, entry.relPath, entry.content);
      if (result === 'written') written.push(entry.relPath);
      else skipped.push(entry.relPath);
    }

    const bootstrapReportPath = join(PRODUCT.internalDir, 'reports', 'bootstrap.md');
    const reportContent = renderBootstrapReport(humanContext, written, skipped, warnings);
    const reportResult = writeManagedFile(writer, projectRoot, manifest, bootstrapReportPath, reportContent);
    if (reportResult === 'written') written.push(bootstrapReportPath);
    else skipped.push(bootstrapReportPath);

    const nextState = {
      ...state,
      project: humanContext.projectName,
      user_name: humanContext.userName,
      project_type: humanContext.projectType,
      stack: humanContext.stack,
      objective: humanContext.primaryGoals[0] ?? state.objective ?? '',
      primary_goals: humanContext.primaryGoals,
      preferred_workflow: humanContext.preferredWorkflow,
      quality_level: humanContext.qualityLevel,
      engines: resolved.engines,
      last_bootstrap_at: now,
      bootstrap: {
        project_type: humanContext.projectType,
        stack: humanContext.stack,
        primary_goals: humanContext.primaryGoals,
        preferred_workflow: humanContext.preferredWorkflow,
        quality_level: humanContext.qualityLevel,
        engines: resolved.engines,
        config_snapshot: configSnapshot.path ? basename(configSnapshot.path) : null,
        last_bootstrap_at: now,
      },
      checkpoints: {
        ...(state.checkpoints ?? {}),
        bootstrap: {
          at: now,
          written,
          skipped,
          config_snapshot: configSnapshot.path ? basename(configSnapshot.path) : null,
        },
      },
    };

    writer.writeGeneratedFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, { force: true });
    writer.saveCreatedFiles();

    const newManifest = buildManifest(projectRoot, writer.manifestPaths);
    saveManifest(projectRoot, { ...manifest, ...newManifest });

    spinner.succeed(chalk.hex('#ffa203')('Bootstrap concluído!'));

    console.log('');
    console.log(chalk.bold('  Resumo do bootstrap:'));
    console.log(`  ${chalk.cyan('Projeto:')} ${humanContext.projectName}`);
    console.log(`  ${chalk.cyan('Tipo:')} ${humanContext.projectType}`);
    console.log(`  ${chalk.cyan('Stack:')} ${humanContext.stack || 'n/a'}`);
    console.log(`  ${chalk.cyan('Objetivos:')} ${humanContext.primaryGoals.length > 0 ? humanContext.primaryGoals.map(labelPrimaryGoal).join(', ') : 'n/a'}`);
    console.log(`  ${chalk.cyan('Fluxo preferido:')} ${labelWorkflow(humanContext.preferredWorkflow)}`);
    console.log(`  ${chalk.cyan('Qualidade:')} ${labelQualityLevel(humanContext.qualityLevel)}`);
    console.log(`  ${chalk.cyan('Engines:')} ${humanContext.engines.length > 0 ? humanContext.engines.join(', ') : 'n/a'}`);
    console.log(`  ${chalk.cyan('Atualizados:')} ${written.length}`);
    console.log(`  ${chalk.cyan('Preservados:')} ${skipped.length}`);
    console.log(`  ${chalk.cyan('Relatório:')} ${join(PRODUCT.internalDir, 'reports', 'bootstrap.md')}`);
    console.log('');

    if (skipped.length > 0) {
      console.log(chalk.gray('  Arquivos modificados pelo usuário foram preservados.'));
    }
    if (configSnapshot.path) {
      console.log(chalk.gray(`  Configuração lida de: ${configSnapshot.path}`));
    }

    return 0;
  } catch (error) {
    spinner.fail(chalk.red('Erro durante o bootstrap.'));
    throw error;
  }
}
