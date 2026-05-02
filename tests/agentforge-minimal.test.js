import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest, mergeUpdateManifest } from '../lib/installer/manifest.js';
import { compileAgentForge } from '../lib/exporter/index.js';
import { runUninstall } from '../lib/commands/uninstall.js';
import { shouldDefaultFinalizeAdoption } from '../lib/commands/install.js';
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

async function createInstalledProjectWithClaude(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(baseAnswers({ engines: ['codex', 'claude-code'] }), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  const claudeCode = ENGINES.find((entry) => entry.id === 'claude-code');
  assert.ok(codex, 'Codex engine definition must exist');
  assert.ok(claudeCode, 'Claude Code engine definition must exist');

  await writer.installEntryFile(codex, { force: true });
  await writer.installEntryFile(claudeCode, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function buildManagedEntrypointContent({
  manualLines = 0,
  includeLegacyReversaBlock = false,
  includeLegacyReversaPath = false,
} = {}) {
  const lines = [
    '# AgentForge bootloader',
    ...Array.from({ length: manualLines }, (_, index) => `Linha manual ${index + 1}.`),
    '',
    '<!-- agentforge:start -->',
    'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
    'Leia `.agentforge/harness/router.md`.',
    'Use `.agentforge/harness/context-index.yaml` para localizar o contexto mínimo necessário.',
    'Respeite `.agentforge/policies/`.',
    'Use skills de `.agentforge/skills/` quando apropriado.',
    'Siga flows de `.agentforge/flows/`.',
    'Consulte `.agentforge/references/` quando necessário.',
    '<!-- agentforge:end -->',
  ];

  if (includeLegacyReversaBlock) {
    lines.push(
      '',
      '<!-- reversa:start -->',
      'Bloco legado Reversa.',
      '<!-- reversa:end -->',
    );
  }

  if (includeLegacyReversaPath) {
    lines.push('', 'Consulte `.reversa/legacy.md` e `_reversa_sdd/notes.md`.');
  }

  return `${lines.join('\n')}\n`;
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

test('install defaults adoption finalization to true for adopt and hybrid modes', () => {
  assert.equal(shouldDefaultFinalizeAdoption('bootstrap'), false);
  assert.equal(shouldDefaultFinalizeAdoption('adopt'), true);
  assert.equal(shouldDefaultFinalizeAdoption('hybrid'), true);
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

test('compile warns and preserves an existing AGENTS.md without a managed block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-merge-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const manualContent = Array.from({ length: 300 }, (_, index) => `Linha manual ${index + 1}.`).join('\n');
    writeFileSync(agentsPath, `${manualContent}\n`, 'utf8');

    const result = await compileAgentForge(projectRoot);

    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes('--takeover-entrypoints')));
    const content = readFileSync(agentsPath, 'utf8');
    assert.equal(content, `${manualContent}\n`);
    assert.doesNotMatch(content, /<!-- agentforge:start -->/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.completed.includes('export'), false);
    assert.equal(state.checkpoints.export, undefined);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile --takeover-entrypoints snapshots and rewrites an existing AGENTS.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-takeover-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const legacyContent = Array.from({ length: 300 }, (_, index) => `Linha legada ${index + 1}.`).join('\n');
    writeFileSync(agentsPath, `${legacyContent}\n`, 'utf8');

    const result = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
    });

    assert.equal(result.errors.length, 0);
    assert.ok(result.preservedSnapshots.some((entry) => entry.includes('.agentforge/imports/snapshots/AGENTS.md/')));

    const content = readFileSync(agentsPath, 'utf8');
    assert.match(content, /<!-- agentforge:start -->/);
    assert.match(content, /<!-- agentforge:end -->/);
    assert.match(content, /\.agentforge\/harness\/router\.md/);
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.ok(content.trimEnd().split(/\r?\n/).length <= 150);

    const snapshotsDir = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'AGENTS.md');
    assert.equal(existsSync(snapshotsDir), true);
    assert.ok(readdirSync(snapshotsDir).some((name) => name.endsWith('.json')));

    const rerun = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
    });
    assert.equal(rerun.errors.length, 0);
    const secondContent = readFileSync(agentsPath, 'utf8');
    assert.equal((secondContent.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
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

test('validate fails when context-index.yaml is absent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-missing-context-index-file-'));

  try {
    await installFixture(projectRoot);

    rmSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /Arquivo ausente/);
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

test('validate warns when AGENTS.md is unmanaged and missing a managed block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-unmanaged-agents-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, '# Manual AGENTS\nLinha manual.\n', 'utf8');
    rmSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), { force: true });

    const manifest = loadManifest(projectRoot);
    delete manifest['AGENTS.md'];
    saveManifest(projectRoot, manifest);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido com avisos/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /Arquivo unmanaged sem bloco AgentForge/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when AGENTS.md has a managed block but too much manual content outside it', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-manual-excess-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      buildManagedEntrypointContent({ manualLines: 300 }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Conteúdo manual excessivo fora do bloco AgentForge/);
    assert.match(report, /mova esse material para \.agentforge\/context ou references/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate passes when AGENTS.md is a short managed bootloader', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-short-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      buildManagedEntrypointContent({ manualLines: 68 }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido/);
    assert.doesNotMatch(report, /Conteúdo manual excessivo/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when AGENTS.md still contains a Reversa legacy block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-reversa-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      buildManagedEntrypointContent({
        manualLines: 20,
        includeLegacyReversaBlock: true,
        includeLegacyReversaPath: true,
      }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Conteúdo legado Reversa detectado/);
    assert.match(report, /\.reversa\/|_reversa_sdd\//);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate applies the same bootloader quality rules to CLAUDE.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-claude-quality-'));

  try {
    await createInstalledProjectWithClaude(projectRoot);

    const claudePath = join(projectRoot, 'CLAUDE.md');
    writeFileSync(
      claudePath,
      buildManagedEntrypointContent({ manualLines: 260 }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /CLAUDE\.md/);
    assert.match(report, /Conteúdo manual excessivo fora do bloco AgentForge/);
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

test('ingest snapshots AGENTS.md and CLAUDE.md without modifying the originals', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-ingest-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const claudePath = join(projectRoot, 'CLAUDE.md');
    writeFileSync(claudePath, '# Claude Instructions\nUse this file only for tests.\n', 'utf8');

    const agentsBefore = readFileSync(agentsPath, 'utf8');
    const claudeBefore = readFileSync(claudePath, 'utf8');

    const first = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(first.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'imports', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'ingest.md')), true);

    const stateAfterFirst = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(stateAfterFirst.last_ingest_at.length > 0, true);
    assert.equal(stateAfterFirst.ingest_count, 1);
    assert.equal(stateAfterFirst.imported_sources.length, 2);
    assert.ok(stateAfterFirst.imported_sources.some((item) => item.source_path === 'AGENTS.md' && item.source_type === 'codex-entrypoint'));
    assert.ok(stateAfterFirst.imported_sources.some((item) => item.source_path === 'CLAUDE.md' && item.source_type === 'claude-entrypoint'));

    for (const item of stateAfterFirst.imported_sources) {
      assert.equal(existsSync(join(projectRoot, item.snapshot_path)), true);
    }

    const manifestAfterFirst = loadManifest(projectRoot);
    assert.ok(manifestAfterFirst['.agentforge/imports/README.md']);
    assert.ok(manifestAfterFirst['.agentforge/reports/ingest.md']);
    for (const item of stateAfterFirst.imported_sources) {
      assert.ok(manifestAfterFirst[item.snapshot_path]);
    }

    assert.equal(readFileSync(agentsPath, 'utf8'), agentsBefore);
    assert.equal(readFileSync(claudePath, 'utf8'), claudeBefore);

    const second = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(second.status, 0);
    const stateAfterSecond = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(stateAfterSecond.ingest_count, 2);
    assert.equal(stateAfterSecond.imported_sources.length, 2);
    assert.equal(
      stateAfterSecond.imported_sources.every((item) => stateAfterFirst.imported_sources.some((previous) => previous.source_path === item.source_path && previous.source_hash === item.source_hash)),
      true,
    );

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'ingest.md'), 'utf8');
    assert.match(report, /AgentForge Ingest Report/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /CLAUDE\.md/);
    assert.match(report, /agentforge audit-context/);
    assert.match(report, /snapshot já importado com o mesmo hash/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ingest and refactor legacy .agents references into canonical files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-legacy-agents-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    mkdirSync(join(projectRoot, '.agents', 'references'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'references', 'domain.md'),
      [
        '# Domain Reference',
        '',
        'Termo principal: explica o vocabulário estável do produto.',
        '',
        '- Link canônico: https://example.com/domain',
        '- Consulte sempre esta lista antes de mudar regras de negócio.',
        '',
      ].join('\n'),
      'utf8',
    );

    const ingestResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(ingestResult.status, 0);
    const legacyReportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'legacy-agents-import.md');
    assert.equal(existsSync(legacyReportPath), true);

    const legacyReport = readFileSync(legacyReportPath, 'utf8');
    assert.match(legacyReport, /\.agents\/references\/domain\.md/);
    assert.match(legacyReport, /legacy-reference/);

    const snapshotDir = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', '.agents', 'references', 'domain.md');
    assert.equal(existsSync(snapshotDir), true);
    assert.ok(readdirSync(snapshotDir).some((name) => name.endsWith('.json')));

    const stateAfterIngest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(stateAfterIngest.imported_sources.some((item) => item.source_path === '.agents/references/domain.md' && item.source_type === 'legacy-reference'));

    const refactorResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'refactor-context', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(refactorResult.status, 0);

    const canonicalTargets = [
      join(projectRoot, PRODUCT.internalDir, 'references', 'domain.md'),
      join(projectRoot, PRODUCT.internalDir, 'context', 'domain.md'),
    ];
    const canonicalTarget = canonicalTargets.find((filePath) => existsSync(filePath));
    assert.ok(canonicalTarget, 'expected a canonical domain file to be created');

    const canonicalContent = readFileSync(canonicalTarget, 'utf8');
    assert.match(canonicalContent, /Domain Reference|Domain/);
    assert.match(canonicalContent, /\.agents\/references\/domain\.md/);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, canonicalTarget.includes('/references/domain.md') ? /references\/domain\.md/ : /context\/domain\.md/);

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /\.agentforge\/harness\/router\.md/);
    assert.doesNotMatch(agentsEntry, /\.agents\//);

    const validateResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validateResult.status, 0);
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

test('bootstrap populates human-readable context and fills inferred project signals', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-bootstrap-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'package.json'),
      `${JSON.stringify({
        name: 'agentforge-demo-app',
        private: true,
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          dev: 'next dev',
        },
        devDependencies: {
          typescript: '^5.5.0',
        },
      }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(projectRoot, 'README.md'),
      [
        '# AgentForge Demo App',
        '',
        '## Objective',
        '',
        'Track orders and surface operational status for the support team.',
        '',
        '## Audience',
        '',
        'Support engineers and operators.',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const ping = () => "pong";\n', 'utf8');

    const result = spawnSync(process.execPath, [
      AGENTFORGE_BIN,
      'bootstrap',
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

    const overview = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'), 'utf8');
    assert.match(overview, /AgentForge Demo App|AgentForge Demo/);
    assert.match(overview, /Track orders and surface operational status/);
    assert.doesNotMatch(overview, /<nome do projeto>|A preencher/);

    const commands = readFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), 'utf8');
    assert.match(commands, /agentforge bootstrap/);
    assert.match(commands, /`vitest run`/);
    assert.match(commands, /`eslint \.`/);
    assert.match(commands, /`tsc --noEmit`/);

    const architecture = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'architecture.md'), 'utf8');
    assert.match(architecture, /src\//);

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
    const claudePath = join(projectRoot, 'CLAUDE.md');
    writeFileSync(claudePath, '# Claude Code\nUse this file only for tests.\n', 'utf8');
    const agentsBefore = readFileSync(agentsPath, 'utf8');
    const claudeBefore = readFileSync(claudePath, 'utf8');

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
    assert.match(report, /agentforge audit-context/);
    assert.match(report, /agentforge refactor-context/);
    assert.match(report, /agentforge refactor-context --apply/);
    assert.match(report, /agentforge suggest-skills/);
    assert.match(report, /Refactor applied: no/);
    assert.match(report, /Read-only guarantee/);
    assert.match(report, /No original project files were modified\./);
    assert.match(report, /Files under `\.agentforge\/` may have been created or updated/);
    assert.doesNotMatch(report, /Only `\.agentforge\/reports\/adoption-plan\.md` was generated\./);
    assert.match(report, /Imported snapshots/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /CLAUDE\.md/);

    assert.equal(readFileSync(agentsPath, 'utf8'), agentsBefore);
    assert.equal(readFileSync(claudePath, 'utf8'), claudeBefore);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_adopt_at, 'string');
    assert.equal(state.adoption_status, 'plan-generated');
    assert.ok(Array.isArray(state.imported_sources));
    assert.ok(state.imported_sources.length >= 2);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/adoption-plan.md']);
    assert.ok(manifest['.agentforge/reports/ingest.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt generates a plan even when no agentic files are present', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-empty-'));

  try {
    await installFixture(projectRoot);
    rmSync(join(projectRoot, 'AGENTS.md'), { force: true });
    rmSync(join(projectRoot, 'CLAUDE.md'), { force: true });

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md'), 'utf8');
    assert.match(report, /AgentForge Adoption Plan/);
    assert.match(report, /No known entry files were found/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.adoption_status, 'plan-generated');
    assert.equal(state.imported_sources.length, 0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt --apply snapshots a legacy AGENTS.md and finalizes entrypoints as bootloaders', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-apply-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'package.json'),
      `${JSON.stringify({
        name: 'agentforge-adopt-demo',
        private: true,
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
        },
        devDependencies: {
          typescript: '^5.5.0',
        },
      }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(projectRoot, 'README.md'),
      [
        '# AgentForge Adopt Demo',
        '',
        '## Objective',
        '',
        'Track orders and alert the support team when delivery status changes.',
        '',
        '## Audience',
        '',
        'Support engineers and operations.',
        '',
        '## Testing',
        '',
        '- `npm test`',
        '- `vitest run`',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const ping = () => "pong";\n', 'utf8');

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const legacySections = Array.from({ length: 60 }, (_, index) => [
      `## Project Overview ${index + 1}`,
      `UNIQUE_ADOPT_MARKER_${index + 1}`,
      `## Architecture ${index + 1}`,
      `Architecture detail ${index + 1}`,
      `## Testing ${index + 1}`,
    ].join('\n')).join('\n');
    writeFileSync(
      agentsPath,
      [
        '# Legacy Agent Notes',
        '',
        'Regra de domínio: pedidos pagos não podem ser cancelados.',
        '',
        legacySections,
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const finalAgents = readFileSync(agentsPath, 'utf8');
    assert.match(finalAgents, /<!-- agentforge:start -->/);
    assert.match(finalAgents, /<!-- agentforge:end -->/);
    assert.ok(finalAgents.trimEnd().split(/\r?\n/).length <= 150);
    assert.doesNotMatch(finalAgents, /<nome do projeto>|A preencher/);

    const snapshotRoot = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'AGENTS.md');
    assert.equal(existsSync(snapshotRoot), true);
    assert.ok(readdirSync(snapshotRoot).some((name) => name.endsWith('.json')));

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.adoption_status, 'applied');
    assert.equal(typeof state.last_adopt_at, 'string');
    assert.ok(state.completed.includes('export'));
    assert.ok(state.checkpoints.export);
    assert.ok(state.refactor_context);
    assert.ok(state.refactor_context.classified_count > 0 || state.refactor_context.unclassified_count > 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.outputDir)), false);

    const projectOverview = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'), 'utf8');
    assert.match(projectOverview, /AgentForge Adopt Demo|AgentForge Demo/);
    assert.match(projectOverview, /Track orders and alert the support team/);
    assert.doesNotMatch(projectOverview, /<nome do projeto>/);

    const commands = readFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), 'utf8');
    assert.match(commands, /`npm test`/);
    assert.match(commands, /`agentforge adopt`/);

    const testingContext = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'testing.md'), 'utf8');
    assert.match(testingContext, /<!-- Source:/);
    assert.match(testingContext, /`vitest run`/);

    const domainCandidates = [
      join(projectRoot, PRODUCT.internalDir, 'context', 'domain.md'),
      join(projectRoot, PRODUCT.internalDir, 'context', 'unclassified.md'),
    ];
    assert.ok(
      domainCandidates.some((filePath) => existsSync(filePath) && /pedidos pagos não podem ser cancelados/i.test(readFileSync(filePath, 'utf8'))),
      'expected the legacy domain rule to be imported into the canonical context layer',
    );

    const validateResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validateResult.status, 0);

    const secondCompile = spawnSync(process.execPath, [AGENTFORGE_BIN, 'compile'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(secondCompile.status, 0);
    const rerunAgents = readFileSync(agentsPath, 'utf8');
    assert.equal((rerunAgents.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal((rerunAgents.match(/<!-- agentforge:end -->/g) ?? []).length, 1);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt --apply records apply-failed when validation fails after partial steps', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-apply-failed-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'README.md'),
      [
        '# AgentForge Adopt Demo',
        '',
        '## Objective',
        '',
        'Track orders and alert the support team when delivery status changes.',
        '',
        '## Testing',
        '',
        '- `npm test`',
        '- `vitest run`',
        '',
      ].join('\n'),
      'utf8',
    );

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.generated_agents = [...state.generated_agents, 'ghost-agent'];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const nextState = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(nextState.adoption_status, 'apply-failed');
    assert.equal(nextState.adoption_failed_step, 'validate');
    assert.match(nextState.last_adopt_error, /ghost-agent/);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /# AgentForge Adoption Apply Report/);
    assert.match(report, /Completed steps/);
    assert.match(report, /Failed step/);
    assert.match(report, /validate/);
    assert.match(report, /Written files/);
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
