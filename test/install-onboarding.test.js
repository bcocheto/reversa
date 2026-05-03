import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { tmpdir } from 'os';

import inquirer from 'inquirer';

import { runInstallPrompts } from '../lib/installer/prompts.js';
import { Writer } from '../lib/installer/writer.js';
import { ENGINES } from '../lib/installer/detector.js';
import { compileAgentForge } from '../lib/exporter/index.js';
import { buildManifest, loadManifest, saveManifest } from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';
import install from '../lib/commands/install.js';
import { resolveHandoffWritePolicy } from '../lib/commands/handoff.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function makeBaseAnswers(overrides = {}) {
  return {
    project_name: 'Onboarding Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript',
    objective: 'develop-features',
    initial_agents: ['orchestrator', 'architect', 'engineer', 'reviewer', 'qa', 'security'],
    initial_flows: ['feature-development', 'bugfix', 'refactor', 'review'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    setup_mode: 'bootstrap',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: [],
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
    ...overrides,
  };
}

function writeFeatureContextIndex(projectRoot) {
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'harness'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), [
    'always_load:',
    '  - harness/router.md',
    '  - harness/context-index.yaml',
    '  - harness/context-map.yaml',
    '  - ai/README.md',
    'task_contexts:',
    '  feature:',
    '    context:',
    '      - context/project-overview.md',
    '      - context/architecture.md',
    '      - context/coding-standards.md',
    '    skills:',
    '      - skills/create-implementation-plan/SKILL.md',
    '      - skills/run-tests/SKILL.md',
    '    flows:',
    '      - flows/feature-development.md',
    '    policies:',
    '      - policies/protected-files.md',
    '      - policies/human-approval.md',
    '',
  ].join('\n'), 'utf8');
}

async function runInstallWithAnswers(projectRoot, answers) {
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;
  const originalLog = console.log;
  const lines = [];

  try {
    process.chdir(projectRoot);
    console.log = (...args) => {
      lines.push(args.map((value) => String(value)).join(' '));
    };
    inquirer.prompt = async () => answers;
    const status = await install([]);
    return {
      status,
      output: lines.join('\n'),
    };
  } finally {
    console.log = originalLog;
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
  }
}

test('install prompt only asks for mode, engines, name, user, git strategy, and languages', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-prompts-'));
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;
  const captured = [];

  try {
    process.chdir(projectRoot);
    inquirer.prompt = async (questions) => {
      captured.push(questions);
      return {
        setup_mode: 'bootstrap',
        engines: ['codex'],
        project_name: 'Prompt Demo',
        user_name: 'Ana',
        git_strategy: 'commit',
        chat_language: 'pt-br',
        doc_language: 'pt-br',
      };
    };

    const answers = await runInstallPrompts([
      { id: 'codex', name: 'Codex', star: true, detected: true },
    ]);

    assert.equal(captured.length, 1);
    const questionNames = captured[0].map((question) => question.name);
    assert.deepEqual(questionNames, [
      'setup_mode',
      'engines',
      'project_name',
      'user_name',
      'git_strategy',
      'chat_language',
      'doc_language',
    ]);

    const setupChoices = captured[0][0].choices.map((choice) => choice.value);
    assert.deepEqual(setupChoices, ['bootstrap', 'adopt']);
    assert.doesNotMatch(JSON.stringify(captured[0]), /hybrid/);
    assert.doesNotMatch(questionNames.join(','), /project_type|stack|objective|initial_agents|initial_flows/);

    assert.equal(answers.setup_mode, 'bootstrap');
    assert.equal(answers.objective, 'develop-features');
    assert.equal(answers.stack, 'Não detectado ainda');
    assert.equal(answers.project_type, 'SaaS/Web App');
    assert.deepEqual(answers.initial_agents, ['orchestrator', 'architect', 'engineer', 'reviewer', 'qa', 'security']);
    assert.deepEqual(answers.initial_flows, ['feature-development', 'bugfix', 'refactor', 'review']);
  } finally {
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install prompts include context-curator for adopt projects with docs and agent docs', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-prompts-context-curator-'));
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;

  try {
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(join(projectRoot, 'docs', 'guide.md'), '# Guide\n\nContext docs.\n', 'utf8');
    mkdirSync(join(projectRoot, '.agents'), { recursive: true });
    writeFileSync(join(projectRoot, '.agents', 'legacy.md'), '# Legacy\n\nAgent docs.\n', 'utf8');
    writeFileSync(join(projectRoot, 'AGENTS.md'), '# AGENTS\n\nProtect docs and context.\n', 'utf8');

    process.chdir(projectRoot);
    inquirer.prompt = async () => ({
      setup_mode: 'adopt',
      engines: ['codex'],
      project_name: 'Context Curator Demo',
      user_name: 'Ana',
      git_strategy: 'commit',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
    });

    const answers = await runInstallPrompts([
      { id: 'codex', name: 'Codex', star: true, detected: true },
    ]);

    assert.ok(answers.initial_agents.includes('context-curator'));
    assert.ok(answers.initial_flows.includes('context-curation'));
  } finally {
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff discovery mentions context-curator and context-map commands', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-context-curator-'));

  try {
    const installResult = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
      engines: ['codex'],
      setup_mode: 'bootstrap',
    }));
    assert.equal(installResult.status, 0);

    const handoffResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(handoffResult.status, 0);
    assert.match(handoffResult.stdout, /context-curator/);
    assert.match(handoffResult.stdout, /context-map --check/);
    assert.match(handoffResult.stdout, /context-map --write/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff context-curation points to context-curator and the curation flow', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-context-curation-'));

  try {
    const installResult = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
      engines: ['codex'],
      setup_mode: 'bootstrap',
    }));
    assert.equal(installResult.status, 0);

    const handoffResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff', '--phase', 'context-curation'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(handoffResult.status, 0);
    assert.match(handoffResult.stdout, /context-curator/);
    assert.match(handoffResult.stdout, /context-curation/);
    assert.match(handoffResult.stdout, /context-map --check/);
    assert.match(handoffResult.stdout, /context-map --write/);
    assert.match(handoffResult.stdout, /context-curation-input\.md/);
    assert.match(handoffResult.stdout, /context-curation\.md/);
    assert.match(handoffResult.stdout, /Atualize `\.agentforge\/harness\/context-map\.yaml`/);
    assert.match(handoffResult.stdout, /agentforge validate/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff --mode feature points to context-pack and resolved project context', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-feature-mode-'));

  try {
    const installResult = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
      engines: ['codex'],
      setup_mode: 'bootstrap',
    }));
    assert.equal(installResult.status, 0);
    writeFeatureContextIndex(projectRoot);

    const handoffResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff', '--engine', 'codex', '--mode', 'feature'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(handoffResult.status, 0);
    assert.match(handoffResult.stdout, /agentforge context-pack feature --write/);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'handoff.md'), 'utf8');
    assert.match(report, /\.agentforge\/reports\/context-pack-feature\.md/);
    assert.match(report, /\.agentforge\/context\/project-overview\.md/);
    assert.match(report, /\.agentforge\/skills\/run-tests\/SKILL\.md/);
    assert.match(report, /\.agentforge\/flows\/feature-development\.md/);
    assert.match(report, /camada de roteamento/);
    assert.match(report, /aplicada nos arquivos reais do projeto/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff --task without mode asks for task-mode inference before editing', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-task-inference-'));

  try {
    const installResult = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
      engines: ['codex'],
      setup_mode: 'bootstrap',
    }));
    assert.equal(installResult.status, 0);

    const handoffResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff', '--task', 'corrigir bug no login'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(handoffResult.status, 0);
    assert.match(handoffResult.stdout, /agentforge context-pack --task "corrigir bug no login" --write/);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'handoff.md'), 'utf8');
    assert.match(report, /Inferência pendente/);
    assert.match(report, /corrigir bug no login/);
    assert.match(report, /Escolha o task mode mais provável antes de editar arquivos reais\./);
    assert.match(report, /Não altere arquivos reais até escolher o task mode mais provável\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff json exposes phase-specific and adoption write policy', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-write-policy-'));

  try {
    const installResult = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
      engines: ['codex'],
      setup_mode: 'adopt',
    }));
    assert.equal(installResult.status, 0);

    const runHandoffJson = (args) => {
      const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff', '--json', ...args], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };

    const agentDesign = resolveHandoffWritePolicy({ phase: 'agent-design' });
    assert.equal(agentDesign.direct_write_allowed.includes('.agentforge/agents/**'), false);
    assert.ok(agentDesign.command_write_allowed.includes('.agentforge/agents/**'));
    assert.ok(agentDesign.never_edit_manually.includes('.agentforge/state.json'));
    assert.ok(agentDesign.never_edit_manually.includes('.agentforge/plan.md'));
    assert.ok(agentDesign.never_edit_manually.includes('.agentforge/_config/**'));

    const exportPhase = resolveHandoffWritePolicy({ phase: 'export' });
    assert.equal(exportPhase.direct_write_allowed.includes('AGENTS.md'), false);
    assert.ok(exportPhase.command_write_allowed.includes('AGENTS.md'));
    assert.ok(exportPhase.command_write_allowed.includes('CLAUDE.md'));

    const adoptMode = runHandoffJson(projectRoot, ['--mode', 'adopt']);
    for (const surface of [
      '.agents/**',
      '.agentforge/context/**',
      '.agentforge/skills/**',
      '.agentforge/flows/**',
      '.agentforge/policies/**',
      '.agentforge/references/**',
      '.agentforge/harness/context-index.yaml',
      '.agentforge/harness/context-map.yaml',
    ]) {
      assert.ok(adoptMode.command_write_allowed.includes(surface), surface);
    }
    for (const entrypoint of ['AGENTS.md', 'CLAUDE.md']) {
      assert.equal(adoptMode.direct_write_allowed.includes(entrypoint), false, entrypoint);
      assert.equal(adoptMode.command_write_allowed.includes(entrypoint), false, entrypoint);
    }
    assert.ok(adoptMode.never_edit_manually.includes('.agentforge/state.json'));
    assert.ok(adoptMode.never_edit_manually.includes('.agentforge/plan.md'));
    assert.ok(adoptMode.never_edit_manually.includes('.agentforge/_config/**'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install output is engine-aware for Codex, Claude, and Gemini', async () => {
  const scenarios = [
    {
      label: 'Codex',
      engines: ['codex'],
      expected: /Codex:/,
      rejected: /Claude Code \/ Claude CLI:|Gemini CLI:/,
    },
    {
      label: 'Claude',
      engines: ['claude-code'],
      expected: /Claude Code \/ Claude CLI:/,
      rejected: /Codex:|Gemini CLI:/,
    },
    {
      label: 'Gemini',
      engines: ['gemini-cli'],
      expected: /Gemini CLI:/,
      rejected: /Codex:|Claude Code \/ Claude CLI:/,
    },
  ];

  for (const scenario of scenarios) {
    const projectRoot = mkdtempSync(join(tmpdir(), `agentforge-install-${scenario.label.toLowerCase()}-`));
    try {
      const result = await runInstallWithAnswers(projectRoot, makeBaseAnswers({
        engines: scenario.engines,
        setup_mode: 'bootstrap',
      }));

      assert.equal(result.status, 0);
      assert.match(result.output, scenario.expected);
      assert.doesNotMatch(result.output, scenario.rejected);
      assert.match(result.output, /Executor recomendado: sua IA ativa configurada\./);
      assert.match(result.output, /Próximo passo:/);
      assert.match(result.output, /agentforge/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }
});

test('installEntryFile defers an existing entrypoint without prompting or appending content', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-defer-'));
  const originalPrompt = inquirer.prompt;
  let promptCalls = 0;

  try {
    writeFileSync(join(projectRoot, 'AGENTS.md'), '# Legacy AGENTS\nLinha manual.\n', 'utf8');
    const writer = new Writer(projectRoot);
    const codex = ENGINES.find((engine) => engine.id === 'codex');
    assert.ok(codex, 'Codex engine definition must exist');

    inquirer.prompt = async () => {
      promptCalls += 1;
      return { strategy: 'merge' };
    };

    const result = await writer.installEntryFile(codex, { deferExistingEntrypoints: true });
    assert.equal(result.status, 'deferred');
    assert.equal(promptCalls, 0);
    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), '# Legacy AGENTS\nLinha manual.\n');
  } finally {
    inquirer.prompt = originalPrompt;
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile can take over entrypoints already present outside the selected engines', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-include-existing-'));

  try {
    const writer = new Writer(projectRoot);
    writer.createProductDir(makeBaseAnswers({ engines: ['codex'] }), '1.0.0');

    const codex = ENGINES.find((engine) => engine.id === 'codex');
    assert.ok(codex, 'Codex engine definition must exist');
    await writer.installEntryFile(codex, { force: true });

    mkdirSync(join(projectRoot, '.github'), { recursive: true });
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# Legacy Claude\n' + 'Linha legada.\n'.repeat(40), 'utf8');
    writeFileSync(join(projectRoot, '.github', 'copilot-instructions.md'), '# Legacy Copilot\n' + 'Linha legada.\n'.repeat(40), 'utf8');
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
      includeExistingEntrypoints: true,
    });

    assert.equal(result.errors.length, 0);
    assert.ok(result.preservedSnapshots.some((entry) => entry.includes('.agentforge/imports/snapshots/CLAUDE.md/')));
    assert.ok(result.preservedSnapshots.some((entry) => entry.includes('.agentforge/imports/snapshots/.github/copilot-instructions.md/')));
    assert.match(readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8'), /<!-- agentforge:start -->/);
    assert.match(readFileSync(join(projectRoot, '.github', 'copilot-instructions.md'), 'utf8'), /<!-- agentforge:start -->/);
    assert.equal(existsSync(join(projectRoot, '.claude', 'agents')), false);
    assert.equal(existsSync(join(projectRoot, '.github', 'agents')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('cli help and install banner use AgentForge branding instead of the legacy ASCII block', () => {
  const helpResult = spawnSync(process.execPath, [AGENTFORGE_BIN, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /AgentForge/);
  assert.match(helpResult.stdout, /Create, organize, evolve, and compile the agent-ready layer of your project\./);
  assert.doesNotMatch(helpResult.stdout, /______/);
  assert.doesNotMatch(helpResult.stdout, /Reversa/);

  const installProject = mkdtempSync(join(tmpdir(), 'agentforge-banner-'));
  try {
    const installResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'install'], {
      cwd: installProject,
      env: { ...process.env, CI: '1' },
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.match(installResult.stdout, /AgentForge/);
    assert.match(installResult.stdout, /Create, organize, evolve, and compile the agent-ready layer of your project\./);
    assert.doesNotMatch(installResult.stdout, /______/);
    assert.doesNotMatch(installResult.stdout, /Reversa/);
  } finally {
    rmSync(installProject, { recursive: true, force: true });
  }
});

test('install runs analysis first and can stop after generating reports and suggestions', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-preview-'));
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;

  const originalAgents = '# Legacy agent instructions\nKeep this file intact.\n';

  try {
    process.chdir(projectRoot);
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    mkdirSync(join(projectRoot, 'worker'), { recursive: true });
    writeFileSync(join(projectRoot, 'AGENTS.md'), originalAgents, 'utf8');
    writeFileSync(join(projectRoot, 'README.md'), [
      '# Preview Demo',
      '',
      'A SaaS dashboard for operations teams.',
      '',
      '## Audience',
      '',
      'Operators and product teams.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'docs', 'architecture.md'), [
      '# Architecture',
      '',
      '## Objective',
      '',
      'Document the system boundaries and workflows.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'preview-demo',
      private: true,
      scripts: {
        test: 'node --test',
        release: 'node scripts/release.js',
      },
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
        typescript: '^5.0.0',
        pg: '^8.11.0',
      },
    }, null, 2), 'utf8');
    writeFileSync(join(projectRoot, 'Dockerfile'), 'FROM node:20\n', 'utf8');
    writeFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
    writeFileSync(join(projectRoot, 'src', 'main.ts'), [
      'import { NestFactory } from "@nestjs/core";',
      'async function bootstrap() {',
      '  await NestFactory.createApplicationContext({} as any);',
      '}',
      'bootstrap();',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'worker', 'cron.ts'), [
      'export function runCronJob() {',
      '  return "cron";',
      '}',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'legacy-note.md'), 'Keep this note.\n', 'utf8');
    saveManifest(projectRoot, buildManifest(projectRoot, ['legacy-note.md']));

    const promptCalls = [];
    inquirer.prompt = async (questions) => {
      promptCalls.push(questions);
      if (promptCalls.length === 1) {
        return {
          setup_mode: 'adopt',
          engines: ['codex'],
          project_name: 'Preview Demo',
          user_name: 'Ana',
          git_strategy: 'commit',
          chat_language: 'pt-br',
          doc_language: 'pt-br',
        };
      }

      return { applyStructure: false };
    };

    const result = await install([]);
    assert.equal(result, 0);
    assert.equal(promptCalls.length, 2);
    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), originalAgents);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'agents')), false);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'project-analysis.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'analysis-plan.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'suggestions', 'agents', 'product-owner.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'suggestions', 'agents', 'architect.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'suggestions', 'agents', 'devops.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'context', 'project-overview.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'context', 'architecture.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'context', 'testing.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'context', 'deployment.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'context', 'glossary.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'references', 'commands.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'references', 'external-docs.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'README.md')), true);

    const overview = readFileSync(join(projectRoot, '.agentforge', 'context', 'project-overview.md'), 'utf8');
    assert.match(overview, /Preview Demo/);
    assert.match(overview, /## A confirmar/);
    assert.doesNotMatch(overview, /A preencher|<[^>]+>|TBD/);

    const architecture = readFileSync(join(projectRoot, '.agentforge', 'context', 'architecture.md'), 'utf8');
    assert.match(architecture, /## Arquitetura provável/);
    assert.match(architecture, /src\//);
    assert.doesNotMatch(architecture, /A preencher|<[^>]+>|TBD/);

    const testing = readFileSync(join(projectRoot, '.agentforge', 'context', 'testing.md'), 'utf8');
    assert.match(testing, /## Comandos detectados/);
    assert.match(testing, /node --test/);
    assert.doesNotMatch(testing, /A preencher|<[^>]+>|TBD/);

    const commands = readFileSync(join(projectRoot, '.agentforge', 'references', 'commands.md'), 'utf8');
    assert.match(commands, /## AgentForge commands/);
    assert.match(commands, /## Project commands/);
    assert.match(commands, /`test`/);
    assert.match(commands, /`release`/);
    assert.match(commands, /analyze \[--write-context\]/);
    assert.match(commands, /npx @bcocheto\/agentforge <command>/);
    assert.doesNotMatch(commands, /A preencher|TBD/);

    const readme = readFileSync(join(projectRoot, '.agentforge', 'README.md'), 'utf8');
    assert.match(readme, /Use `agentforge next` para determinar a próxima fase\./);
    assert.match(readme, /## A confirmar/);
    assert.match(readme, /Preview Demo/);
    assert.doesNotMatch(readme, /A preencher|TBD/);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['legacy-note.md']);
    assert.ok(manifest['.agentforge/reports/project-analysis.md']);
    assert.ok(manifest['.agentforge/reports/analysis-plan.md']);
    assert.ok(manifest['.agentforge/context/project-overview.md']);
    assert.ok(manifest['.agentforge/context/architecture.md']);
    assert.ok(manifest['.agentforge/context/testing.md']);
    assert.ok(manifest['.agentforge/context/deployment.md']);
    assert.ok(manifest['.agentforge/context/glossary.md']);
    assert.ok(manifest['.agentforge/references/commands.md']);
    assert.ok(manifest['.agentforge/references/external-docs.md']);
    assert.ok(manifest['.agentforge/README.md']);
    const state = JSON.parse(readFileSync(join(projectRoot, '.agentforge', 'state.json'), 'utf8'));
    assert.ok(Array.isArray(state.suggested_agents));
    assert.ok(state.suggested_agents.some((entry) => entry.id === 'product-owner'));
    assert.ok(state.suggested_agents.some((entry) => entry.id === 'architect'));
    assert.ok(state.suggested_agents.some((entry) => entry.id === 'devops'));
    assert.equal(state.last_analysis_at.length > 0, true);
    assert.equal(typeof state.last_context_synthesis_at, 'string');
    assert.ok(Array.isArray(state.synthesized_context_files));
    assert.ok(state.synthesized_context_files.includes('.agentforge/context/project-overview.md'));
  } finally {
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install applies structure on an existing project and keeps the manifest complete', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-apply-'));
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;
  const originalAgents = '# Legacy agent instructions\nKeep this file intact.\n';
  const originalClaude = '# Legacy Claude instructions\nKeep this file intact.\n';

  try {
    process.chdir(projectRoot);
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    mkdirSync(join(projectRoot, 'worker'), { recursive: true });
    writeFileSync(join(projectRoot, 'AGENTS.md'), originalAgents, 'utf8');
    writeFileSync(join(projectRoot, 'CLAUDE.md'), originalClaude, 'utf8');
    writeFileSync(join(projectRoot, 'README.md'), [
      '# Apply Demo',
      '',
      'A SaaS dashboard for operations teams.',
      '',
      '## Audience',
      '',
      'Operators and product teams.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'docs', 'architecture.md'), [
      '# Architecture',
      '',
      '## Objective',
      '',
      'Document the system boundaries and workflows.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'apply-demo',
      private: true,
      scripts: {
        test: 'node --test',
        release: 'node scripts/release.js',
      },
      dependencies: {
        '@nestjs/core': '^10.0.0',
        '@nestjs/common': '^10.0.0',
        typescript: '^5.0.0',
        pg: '^8.11.0',
      },
    }, null, 2), 'utf8');
    writeFileSync(join(projectRoot, 'Dockerfile'), 'FROM node:20\n', 'utf8');
    writeFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
    writeFileSync(join(projectRoot, 'src', 'main.ts'), [
      'import { NestFactory } from "@nestjs/core";',
      'async function bootstrap() {',
      '  await NestFactory.createApplicationContext({} as any);',
      '}',
      'bootstrap();',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'worker', 'cron.ts'), [
      'export function runCronJob() {',
      '  return "cron";',
      '}',
    ].join('\n'), 'utf8');

    const promptCalls = [];
    inquirer.prompt = async (questions) => {
      promptCalls.push(questions);
      if (promptCalls.length === 1) {
        return {
          setup_mode: 'adopt',
          engines: ['codex'],
          project_name: 'Apply Demo',
          user_name: 'Ana',
          git_strategy: 'commit',
          chat_language: 'pt-br',
          doc_language: 'pt-br',
        };
      }

      if (promptCalls.length === 2) {
        return { applyStructure: true };
      }

      return {};
    };

    const result = await install([]);
    assert.equal(result, 0);
    assert.equal(promptCalls.length, 2);

    const manifest = loadManifest(projectRoot);
    for (const relPath of [
      '.agentforge/harness/README.md',
      '.agentforge/harness/router.md',
      '.agentforge/harness/context-index.yaml',
      '.agentforge/harness/task-modes.yaml',
      '.agentforge/harness/load-order.yaml',
      '.agentforge/harness/engine-map.yaml',
      '.agentforge/reports/README.md',
    ]) {
      assert.ok(manifest[relPath], `missing manifest entry for ${relPath}`);
    }

    assert.equal(existsSync(join(projectRoot, '.agentforge', 'flows', 'review.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'flows', 'context-curation.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'handoff.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'advance.md')), false);

    const state = JSON.parse(readFileSync(join(projectRoot, '.agentforge', 'state.json'), 'utf8'));
    assert.ok(state.flows.includes('review'));
    assert.ok(state.flows.includes('context-curation'));
    assert.equal(state.flows.every((flowId) => existsSync(join(projectRoot, '.agentforge', 'flows', `${flowId}.yaml`))), true);
    assert.equal(state.adoption_status, 'applied');
    assert.equal(state.adoption?.verification_status, 'verified');
    assert.equal(state.workflow.current_phase, 'review');
    assert.deepEqual(state.workflow.completed_phases, [
      'agent-design',
      'flow-design',
      'policies',
      'export',
    ]);
    assert.deepEqual(state.workflow.pending_phases, ['review']);

    const agents = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agents, /<!-- agentforge:start -->/);
    assert.match(agents, /A pasta `\.agentforge\/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto\./);
    assert.match(agents, /Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação\./);
    assert.match(agents, /Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento\./);
    assert.doesNotMatch(agents, /Keep this file intact\./);
    const claude = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(claude, /<!-- agentforge:start -->/);
    assert.match(claude, /A pasta `\.agentforge\/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto\./);
    assert.match(claude, /Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação\./);
    assert.match(claude, /Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento\./);
    assert.doesNotMatch(claude, /Keep this file intact\./);

    const validation = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validation.status, 0);
  } finally {
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install leaves the workflow pending and prepares handoff artifacts', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-pending-'));
  const cwd = process.cwd();
  const originalPrompt = inquirer.prompt;

  try {
    process.chdir(projectRoot);
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'README.md'), [
      '# Full Cycle Demo',
      '',
      'A SaaS dashboard for operations teams.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'docs', 'architecture.md'), [
      '# Architecture',
      '',
      '## Objective',
      '',
      'Document the system boundaries and workflows.',
    ].join('\n'), 'utf8');
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'full-cycle-demo',
      private: true,
      scripts: {
        test: 'node --test',
      },
      dependencies: {
        typescript: '^5.0.0',
      },
    }, null, 2), 'utf8');
    writeFileSync(join(projectRoot, 'src', 'main.ts'), 'export const ready = true;\n', 'utf8');

    const promptCalls = [];
    inquirer.prompt = async (questions) => {
      promptCalls.push(questions);
      if (promptCalls.length === 1) {
        return {
          setup_mode: 'adopt',
          engines: ['codex'],
          project_name: 'Full Cycle Demo',
          user_name: 'Ana',
          git_strategy: 'commit',
          chat_language: 'pt-br',
          doc_language: 'pt-br',
        };
      }

      if (promptCalls.length === 2) {
        return { applyStructure: true };
      }

      return {};
    };

    const result = await install([]);
    assert.equal(result, 0);
    assert.equal(promptCalls.length, 2);

    const state = JSON.parse(readFileSync(join(projectRoot, '.agentforge', 'state.json'), 'utf8'));
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'handoff.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'advance.md')), false);
    assert.equal(state.adoption_status, 'applied');
    assert.equal(state.adoption?.status, 'applied');
    assert.equal(state.adoption?.apply_status, 'applied');
    assert.equal(state.adoption?.verification_status, 'verified');
    assert.ok(state.adoption?.verified_at);
    assert.equal(state.workflow.current_phase, 'review');
    assert.deepEqual(state.workflow.completed_phases, [
      'agent-design',
      'flow-design',
      'policies',
      'export',
    ]);
    assert.deepEqual(state.workflow.pending_phases, ['review']);

    const agents = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agents, /<!-- agentforge:start -->/);
    assert.match(agents, /A pasta `\.agentforge\/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto\./);
    assert.match(agents, /Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação\./);
    assert.match(agents, /Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento\./);
    assert.match(agents, /Ao concluir, rode `agentforge checkpoint <phase> --status done` e depois `agentforge validate`\./);
    assert.doesNotMatch(agents, /O ciclo AgentForge já está concluído neste projeto\./);

    const nextResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'next'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(nextResult.status, 0);
    assert.match(nextResult.stdout, /Activation mode: adoption-complete/);
    assert.match(nextResult.stdout, /Current phase: adoption-complete/);
    assert.match(nextResult.stdout, /Next phase: none/);
    assert.match(nextResult.stdout, /ask-for-real-task/);
    assert.doesNotMatch(nextResult.stdout, /checkpoint discovery/);
    assert.doesNotMatch(nextResult.stdout, /agent-design/);

    const validation = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validation.status, 0);
  } finally {
    inquirer.prompt = originalPrompt;
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
