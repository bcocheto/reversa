import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest, mergeUpdateManifest } from '../lib/installer/manifest.js';
import { exportAgentForge } from '../lib/exporter/index.js';
import { runUninstall } from '../lib/commands/uninstall.js';
import { detectEngines, ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function baseAnswers(overrides = {}) {
  return {
    project_name: 'AgentForge Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'develop-features',
    initial_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
    initial_flows: ['feature-development', 'release'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: AGENT_SKILL_IDS,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
    ...overrides,
  };
}

async function installFixture(projectRoot, { engines = ['codex'], exportTargets = false } = {}) {
  const writer = new Writer(projectRoot);
  const answers = baseAnswers({ engines });

  writer.createProductDir(answers, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  if (exportTargets) {
    exportAgentForge(projectRoot);
  }

  return answers;
}

test('install creates the AgentForge structure, state, Codex entry file, agents, and flows', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-'));

  try {
    const answers = await installFixture(projectRoot);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'state.json')), true);
    assert.equal(existsSync(join(projectRoot, 'AGENTS.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'reviewer.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'release.yaml')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.project, answers.project_name);
    assert.deepEqual(state.initial_agents, answers.initial_agents);
    assert.deepEqual(state.initial_flows, answers.initial_flows);
    assert.deepEqual(state.engines, answers.engines);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate succeeds on a fresh AgentForge installation', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-ok-'));

  try {
    await installFixture(projectRoot);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md')), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when a flow references a missing agent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-fail-'));

  try {
    await installFixture(projectRoot);

    const flowPath = join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml');
    const broken = readFileSync(flowPath, 'utf8').replace('agent: orchestrator', 'agent: ghost-agent');
    writeFileSync(flowPath, broken, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8'), /ghost-agent/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('manifest includes generated AgentForge files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-manifest-'));

  try {
    await installFixture(projectRoot);
    exportAgentForge(projectRoot);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/state.json']);
    assert.ok(manifest['.agentforge/agents/orchestrator.yaml']);
    assert.ok(manifest['.agentforge/flows/feature-development.yaml']);
    assert.ok(manifest['AGENTS.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('mergeUpdateManifest preserves modified entries', () => {
  const existingManifest = {
    'AGENTS.md': 'old-agents-hash',
    '.agentforge/agents/orchestrator.yaml': 'old-orchestrator-hash',
    '.agentforge/agents/legacy.yaml': 'legacy-hash',
  };

  const result = mergeUpdateManifest(
    existingManifest,
    ['.agentforge/agents/orchestrator.yaml'],
    ['AGENTS.md'],
    {
      '.agentforge/agents/orchestrator.yaml': 'new-orchestrator-hash',
      '.agentforge/agents/architect.yaml': 'new-architect-hash',
    },
  );

  assert.equal(result['AGENTS.md'], 'old-agents-hash');
  assert.equal(result['.agentforge/agents/orchestrator.yaml'], 'new-orchestrator-hash');
  assert.equal(result['.agentforge/agents/architect.yaml'], 'new-architect-hash');
  assert.equal(result['.agentforge/agents/legacy.yaml'], undefined);
});

test('uninstall preserves modified files and can keep the output folder', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-uninstall-'));

  try {
    await installFixture(projectRoot, { engines: ['codex', 'claude-code', 'cursor', 'github-copilot'], exportTargets: true });

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, `${readFileSync(agentsPath, 'utf8')}\nLinha manual.\n`, 'utf8');

    mkdirSync(join(projectRoot, PRODUCT.outputDir), { recursive: true });
    writeFileSync(join(projectRoot, PRODUCT.outputDir, 'notes.md'), '# Output\n', 'utf8');

    const prompts = [
      { confirmed: 'remove' },
      { removeOutput: false },
    ];

    const result = await runUninstall(projectRoot, {
      prompt: async () => prompts.shift(),
    });

    assert.equal(result.errors, 0);
    assert.equal(existsSync(agentsPath), true);
    assert.match(readFileSync(agentsPath, 'utf8'), /Linha manual\./);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.outputDir)), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('detectEngines still recognizes Codex when AGENTS.md is present', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-detect-'));

  try {
    const codexEntry = join(projectRoot, 'AGENTS.md');
    writeFileSync(codexEntry, '# AgentForge\n', 'utf8');

    const engines = detectEngines(projectRoot);
    const codex = engines.find((entry) => entry.id === 'codex');

    assert.ok(codex);
    assert.equal(codex.detected, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
