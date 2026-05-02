import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { compileAgentForge, exportPackageAgentForge } from '../lib/exporter/index.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createInstallAnswers(overrides = {}) {
  return {
    project_name: 'Demo Project',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'develop-features',
    initial_agents: [
      'orchestrator',
      'product-owner',
      'architect',
      'engineer',
      'reviewer',
    ],
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

const ENGINE_CASES = [
  {
    id: 'codex',
    label: 'Codex',
    entryPath: 'AGENTS.md',
    absentLegacyPath: null,
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    entryPath: 'CLAUDE.md',
    absentLegacyPath: null,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    entryPath: '.cursor/rules/agentforge.md',
    absentLegacyPath: '.cursorrules',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    entryPath: '.github/copilot-instructions.md',
    absentLegacyPath: null,
  },
];

async function createCompileFixture(projectRoot, engineId) {
  const writer = new Writer(projectRoot);
  const answers = createInstallAnswers({ engines: [engineId] });

  writer.createProductDir(answers, '1.0.0');
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  const contextDir = join(projectRoot, PRODUCT.internalDir, 'context');
  mkdirSync(contextDir, { recursive: true });
  writeFileSync(
    join(contextDir, 'project-overview.md'),
    `# Project Overview\n\nUNIQUE_CONTEXT_MARKER_${engineId}\n`,
    'utf8',
  );
}

async function assertEngineExportContract({ id, label, entryPath, absentLegacyPath }) {
  const projectRoot = mkdtempSync(join(tmpdir(), `agentforge-export-${id}-`));

  try {
    await createCompileFixture(projectRoot, id);

    const first = await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });

    assert.equal(first.errors.length, 0, `${label} compile should not report errors`);
    assert.equal(existsSync(join(projectRoot, entryPath)), true, `${label} entrypoint should exist`);
    if (absentLegacyPath) {
      assert.equal(
        existsSync(join(projectRoot, absentLegacyPath)),
        false,
        `${label} compile should standardize on the modern entrypoint`,
      );
    }

    const content = readFileSync(join(projectRoot, entryPath), 'utf8');
    assert.match(content, /<!-- agentforge:start -->/);
    assert.match(content, /<!-- agentforge:end -->/);
    assert.match(content, /\.agentforge\/harness\/router\.md/);
    assert.match(content, /\.agentforge\/harness\/context-index\.yaml/);
    assert.match(content, /\.agentforge\/policies\//);
    assert.match(content, /\.agentforge\/skills\//);
    assert.match(content, /\.agentforge\/flows\//);
    assert.match(content, /\.agentforge\/references\//);
    assert.doesNotMatch(content, new RegExp(`UNIQUE_CONTEXT_MARKER_${id}`));
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal((content.match(/<!-- agentforge:end -->/g) ?? []).length, 1);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[entryPath], `${label} entrypoint should be tracked in the manifest`);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.completed.includes('export'), true, `${label} compile should finalize export`);
    assert.equal(state.checkpoints.export.mode, 'entrypoints');
    assert.ok(state.checkpoints.export.written.includes(entryPath));

    const manualLine = `Linha manual preservada para ${id}.`;
    writeFileSync(join(projectRoot, entryPath), `${content}\n${manualLine}\n`, 'utf8');
    const beforeRerun = readFileSync(join(projectRoot, entryPath), 'utf8');

    const second = await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });

    assert.equal(second.errors.length, 0, `${label} compile should remain clean on rerun`);
    const afterRerun = readFileSync(join(projectRoot, entryPath), 'utf8');
    assert.equal(afterRerun, beforeRerun, `${label} compile should be idempotent`);
    assert.match(afterRerun, new RegExp(`Linha manual preservada para ${id}\\.`));
    assert.equal((afterRerun.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal((afterRerun.match(/<!-- agentforge:end -->/g) ?? []).length, 1);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

test('export-package writes an isolated _agentforge bundle', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-export-package-'));

  try {
    await createCompileFixture(projectRoot, 'codex');

    const result = await exportPackageAgentForge(projectRoot);

    assert.equal(result.errors.length, 0, 'export-package should not report errors');
    assert.equal(existsSync(join(projectRoot, '_agentforge', 'AGENTS.md')), true);
    assert.equal(existsSync(join(projectRoot, '_agentforge', 'CLAUDE.md')), false);
    assert.equal(existsSync(join(projectRoot, 'AGENTS.md')), false);
    assert.equal(existsSync(join(projectRoot, '_agentforge', '.agentforge', 'state.json')), true);
    assert.equal(result.written.some((path) => path.startsWith('_agentforge/')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.completed?.includes('export') ?? false, false);
    assert.equal(state.checkpoints?.export_package?.output_folder, '_agentforge');
    assert.equal(Array.isArray(state.pending), true);
    assert.equal(state.pending.includes('export'), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('export --package generates the isolated _agentforge bundle via CLI', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-export-cli-package-'));

  try {
    await createCompileFixture(projectRoot, 'codex');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'export', '--package'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(existsSync(join(projectRoot, '_agentforge', 'AGENTS.md')), true);
    assert.equal(existsSync(join(projectRoot, 'AGENTS.md')), false);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.completed.includes('export'), false);
    assert.equal(state.checkpoints.export_package.output_folder, '_agentforge');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

for (const engineCase of ENGINE_CASES) {
  test(`compile/export contract for ${engineCase.label}`, async () => {
    await assertEngineExportContract(engineCase);
  });
}
