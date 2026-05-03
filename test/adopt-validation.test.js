import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createAdoptAnswers() {
  return {
    project_name: 'Adopt Validation Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'migrate-agentic-surface',
    initial_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
    initial_flows: ['feature-development', 'release'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    setup_mode: 'adopt',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: AGENT_SKILL_IDS,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
  };
}

async function installAdoptFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(createAdoptAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function writeLegacySurface(projectRoot) {
  writeFileSync(join(projectRoot, 'AGENTS.md'), [
    '# Legacy AGENTS',
    '',
    'This entrypoint still contains legacy instructions.',
  ].join('\n'), 'utf8');

  writeFileSync(join(projectRoot, 'CLAUDE.md'), [
    '# Legacy Claude',
    '',
    'This entrypoint also still contains legacy instructions.',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, '.agents', 'skills', 'legacy-audit'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'skills', 'legacy-audit', 'SKILL.md'), [
    '# Legacy Audit',
    '',
    'Audit the legacy surface before migration.',
  ].join('\n'), 'utf8');
}

function runCli(projectRoot, args) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('validate fails in adopt mode when legacy surfaces are not adopted', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-validate-fail-'));

  try {
    await installAdoptFixture(projectRoot);
    writeLegacySurface(projectRoot);

    const result = runCli(projectRoot, ['validate']);
    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Adoption checks/);
    assert.match(report, /legacy_entrypoints_snapshotted/);
    assert.match(report, /agents_md_managed/);
    assert.match(report, /legacy_skills_migrated_or_preserved/);
    assert.match(report, /context_index_references_promoted_artifacts/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate passes after adopt --apply migrates the legacy surface', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-validate-pass-'));

  try {
    await installAdoptFixture(projectRoot);
    writeLegacySurface(projectRoot);

    const applyResult = runCli(projectRoot, ['adopt', '--apply']);
    assert.equal(applyResult.status, 0);

    const validateResult = runCli(projectRoot, ['validate']);
    assert.equal(validateResult.status, 0);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['AGENTS.md']);
    assert.ok(manifest['CLAUDE.md']);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Adoption checks/);
    assert.match(report, /\[x\] `legacy_entrypoints_snapshotted`/);
    assert.match(report, /\[x\] `agents_md_managed`/);
    assert.match(report, /\[x\] `legacy_skills_migrated_or_preserved`/);
    assert.match(report, /\[x\] `context_index_references_promoted_artifacts`/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
