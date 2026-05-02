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
import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';

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
