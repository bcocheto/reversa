import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest, mergeUpdateManifest } from '../lib/installer/manifest.js';
import { compileAgentForge } from '../lib/exporter/index.js';
import { runUninstall } from '../lib/commands/uninstall.js';
import { checkExistingInstallation } from '../lib/installer/validator.js';
import { detectEngines, ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const MINIMUM_HARNESS_REL_PATHS = [
  'harness/README.md',
  'harness/router.md',
  'harness/context-index.yaml',
  'harness/task-modes.yaml',
  'harness/load-order.yaml',
  'harness/engine-map.yaml',
  'reports/README.md',
];

const MINIMUM_HARNESS_MANIFEST_PATHS = MINIMUM_HARNESS_REL_PATHS.map(
  (relPath) => `${PRODUCT.internalDir}/${relPath}`,
);

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
    setup_mode: 'bootstrap',
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

async function installFixture(projectRoot, {
  engines = ['codex'],
  exportTargets = false,
  setupMode = 'bootstrap',
} = {}) {
  const writer = new Writer(projectRoot);
  const answers = baseAnswers({ engines, setup_mode: setupMode });

  writer.createProductDir(answers, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  if (exportTargets) {
    await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });
  }

  return answers;
}

function assertMinimumHarness(projectRoot) {
  for (const relPath of MINIMUM_HARNESS_REL_PATHS) {
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, relPath)), true);
  }
}

test('install creates the AgentForge structure, state, Codex entry file, agents, and flows', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-'));

  try {
    const answers = await installFixture(projectRoot);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'state.json')), true);
    assert.equal(existsSync(join(projectRoot, 'AGENTS.md')), true);
    assertMinimumHarness(projectRoot);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'reviewer.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'release.yaml')), true);

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /<!-- agentforge:end -->/);
    assert.match(agentsEntry, /Leia `\.agentforge\/harness\/router\.md`/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.project, answers.project_name);
    assert.equal(state.setup_mode, 'bootstrap');
    assert.deepEqual(state.initial_agents, answers.initial_agents);
    assert.deepEqual(state.initial_flows, answers.initial_flows);
    assert.deepEqual(state.engines, answers.engines);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile after install updates only the managed bootloader block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-managed-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const original = readFileSync(agentsPath, 'utf8');
    const mutated = original.replace(
      'Use `.agentforge/harness/context-index.yaml` para localizar o contexto mínimo necessário.',
      'Use `.agentforge/harness/context-index.yaml` para localizar o contexto mínimo necessário.\nLinha manual interna.',
    );
    writeFileSync(agentsPath, `${mutated}\nLinha manual externa.\n`, 'utf8');

    const result = await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => {
        throw new Error('mergeStrategyResolver should not be called for managed bootloaders.');
      },
    });

    assert.equal(result.errors.length, 0);
    assert.ok(result.written.includes('AGENTS.md'));

    const content = readFileSync(agentsPath, 'utf8');
    assert.match(content, /Linha manual externa\./);
    assert.doesNotMatch(content, /Linha manual interna\./);
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal((content.match(/<!-- agentforge:end -->/g) ?? []).length, 1);
    assert.match(content, /Use `\.agentforge\/harness\/context-index\.yaml` para localizar o contexto mínimo necessário\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

for (const setupMode of ['bootstrap', 'adopt', 'hybrid']) {
  test(`install in ${setupMode} mode creates the minimum harness structure`, async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), `agentforge-install-${setupMode}-`));

    try {
      const answers = await installFixture(projectRoot, { setupMode });

      assert.equal(answers.setup_mode, setupMode);
      assertMinimumHarness(projectRoot);

      const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
      assert.equal(state.setup_mode, setupMode);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
}

test('compile merges into an existing AGENTS.md without a managed block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-merge-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, '# Manual AGENTS\nLinha manual.\n', 'utf8');

    const result = await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });

    assert.equal(result.errors.length, 0);
    const content = readFileSync(agentsPath, 'utf8');
    assert.match(content, /Linha manual\./);
    assert.match(content, /<!-- agentforge:start -->/);
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md')), true);
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

test('validate fails when context-index.yaml points to a missing file', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-missing-context-index-'));

  try {
    await installFixture(projectRoot);

    const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
    const contextIndex = readFileSync(contextIndexPath, 'utf8').replace(
      'path: context/project-overview.md',
      'path: context/missing-project-overview.md',
    );
    writeFileSync(contextIndexPath, contextIndex, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /missing-project-overview\.md/);
    assert.match(report, /Arquivo ausente em/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when state.generated_agents lists a missing agent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-state-mismatch-'));

  try {
    await installFixture(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.generated_agents = [...state.generated_agents, 'ghost-agent'];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /generated_agents/);
    assert.match(report, /ghost-agent/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate warns when engine-map is missing an installed engine', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-engine-warning-'));

  try {
    await installFixture(projectRoot);

    const engineMapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'engine-map.yaml');
    const engineMap = readFileSync(engineMapPath, 'utf8').replace(
      /  codex:\n    activation: agentforge\n    slash_command: \/agentforge\n    entry_file: AGENTS\.md\n/,
      '',
    );
    writeFileSync(engineMapPath, engineMap, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido com avisos/);
    assert.match(report, /Avisos/);
    assert.match(report, /codex/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile warns when the minimum harness is absent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-missing-harness-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    rmSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'compile', '--force'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /AgentForge compile encontrou 1 erro\(s\)\./);
    assert.match(result.stdout, /context-index\.yaml/);
    assert.match(result.stdout, /Relatório gerado em .*compile\.md/);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /Arquivo ausente da estrutura mínima do harness/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('bootstrap populates human-readable context, updates state, and preserves modified files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-bootstrap-'));

  try {
    await installFixture(projectRoot);

    const overviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(overviewPath, `${readFileSync(overviewPath, 'utf8')}\nLinha manual preservada.\n`, 'utf8');

    const result = spawnSync(process.execPath, [
      AGENTFORGE_BIN,
      'bootstrap',
      '--project-type',
      'SaaS/Web App',
      '--stack',
      'Node.js, TypeScript, PostgreSQL',
      '--primary-goals',
      'develop-features,review-prs',
      '--preferred-workflow',
      'feature-development',
      '--quality-level',
      'strict',
      '--engines',
      'codex,claude-code',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.last_bootstrap_at);
    assert.deepEqual(state.primary_goals, ['develop-features', 'review-prs']);
    assert.equal(state.preferred_workflow, 'feature-development');
    assert.equal(state.quality_level, 'strict');

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'bootstrap.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Bootstrap Report/);
    assert.match(report, /Files written/);

    const overview = readFileSync(overviewPath, 'utf8');
    assert.match(overview, /Linha manual preservada\./);

    const commands = readFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), 'utf8');
    assert.match(commands, /agentforge bootstrap/);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, /bootstrap:/);
    assert.match(contextIndex, /quality_level: strict/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('improve generates a useful report without applying changes', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-report-'));

  try {
    await installFixture(projectRoot);

    const hugePath = join(projectRoot, PRODUCT.internalDir, 'context', 'oversized.md');
    writeFileSync(
      hugePath,
      Array.from({ length: 260 }, (_, index) => `Linha ${index + 1}`).join('\n'),
      'utf8',
    );
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'duplicate-a.md'), 'Conteúdo duplicado.\n', 'utf8');
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'duplicate-b.md'), 'Conteúdo duplicado.\n', 'utf8');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'SKILL.md'),
      ['---', 'name: mystery', 'license: MIT', '---', '', '# Mystery', ''].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
    assert.equal(existsSync(reportPath), true);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Improvement Plan/);
    assert.match(report, /Arquivos muito grandes/);
    assert.match(report, /oversized\.md/);
    assert.match(report, /Pastas sem README/);
    assert.match(report, /agents/);
    assert.match(report, /Conteúdo duplicado/);
    assert.match(report, /duplicate-a\.md/);
    assert.match(report, /Skills sem trigger claro/);
    assert.match(report, /skills\/mystery\/SKILL\.md/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'README.md')), false);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/improvement-plan.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('improve --apply creates only safe documentation placeholders', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-apply-'));

  try {
    await installFixture(projectRoot);

    const overviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(overviewPath, `${readFileSync(overviewPath, 'utf8')}\nLinha manual preservada.\n`, 'utf8');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'SKILL.md'),
      ['---', 'name: mystery', 'license: MIT', '---', '', '# Mystery', ''].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'subagents', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'README.md')), true);
    assert.match(readFileSync(overviewPath, 'utf8'), /Linha manual preservada\./);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md')), true);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/agents/README.md']);
    assert.ok(manifest['.agentforge/subagents/README.md']);
    assert.ok(manifest['.agentforge/skills/mystery/README.md']);
    assert.ok(manifest['.agentforge/reports/improvement-plan.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt generates a read-only adoption plan', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const agentsBefore = readFileSync(agentsPath, 'utf8');

    const readmePath = join(projectRoot, 'README.md');
    writeFileSync(readmePath, '# Manual Project\nConteúdo manual.\n', 'utf8');
    const readmeBefore = readFileSync(readmePath, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
    assert.equal(existsSync(reportPath), true);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Adoption Plan/);
    assert.match(report, /## 1\. Ingest/);
    assert.match(report, /## 2\. Audit context/);
    assert.match(report, /## 3\. Refactor context \(dry run\)/);
    assert.match(report, /agentforge refactor-context --apply/);
    assert.match(report, /agentforge create-skill <id>/);
    assert.match(report, /Read-only guarantee/);

    assert.equal(readFileSync(agentsPath, 'utf8'), agentsBefore);
    assert.equal(readFileSync(readmePath, 'utf8'), readmeBefore);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/adoption-plan.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('manifest includes generated AgentForge files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-manifest-'));

  try {
    await installFixture(projectRoot);
    await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/state.json']);
    assert.ok(manifest['.agentforge/agents/orchestrator.yaml']);
    assert.ok(manifest['.agentforge/flows/feature-development.yaml']);
    assert.ok(manifest['AGENTS.md']);
    for (const relPath of MINIMUM_HARNESS_MANIFEST_PATHS) {
      assert.ok(manifest[relPath], `${relPath} should be tracked in the manifest`);
    }
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

test('legacy installations without setup_mode default to bootstrap', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-legacy-mode-'));

  try {
    mkdirSync(join(projectRoot, PRODUCT.internalDir), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'state.json'),
      JSON.stringify({
        version: '1.0.0',
        project: 'Legacy Project',
        user_name: 'Ana',
        project_type: 'API',
        stack: 'Node.js',
        objective: 'develop-features',
        engines: ['codex'],
        internal_agents: ['orchestrator'],
        generated_agents: ['orchestrator'],
        generated_subagents: [],
        flows: ['feature-development'],
        output_folder: '_agentforge',
        created_files: [],
        checkpoints: {},
      }, null, 2),
      'utf8',
    );

    const existing = checkExistingInstallation(projectRoot);
    assert.equal(existing.installed, true);
    assert.equal(existing.state.setup_mode, 'bootstrap');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
