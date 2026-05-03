import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, loadManifest, saveManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function listFilesRecursive(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir({
    project_name: 'Adopt Prepare Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'prepare-adoption',
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
  }, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function runAdopt(projectRoot, args) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function writeLegacySurface(projectRoot) {
  writeFileSync(join(projectRoot, 'AGENTS.md'), [
    '# Legacy AGENTS',
    '',
    'This file must not be changed by prepare.',
  ].join('\n'), 'utf8');

  writeFileSync(join(projectRoot, 'CLAUDE.md'), [
    '# Legacy CLAUDE',
    '',
    'This file must not be changed by prepare.',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, '.agents', 'skills', 'legacy-audit'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'skills', 'legacy-audit', 'SKILL.md'), [
    '# Legacy Audit',
    '',
    'Audit the legacy surface before migration.',
  ].join('\n'), 'utf8');
}

test('agentforge adopt --prepare gathers evidence without materializing final decisions', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-prepare-'));

  try {
    await installFixture(projectRoot);
    writeLegacySurface(projectRoot);

    const agentsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents'));
    const skillsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills'));
    const agentsMdBefore = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    const claudeBefore = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
    const legacySkillBefore = readFileSync(join(projectRoot, '.agents', 'skills', 'legacy-audit', 'SKILL.md'), 'utf8');

    const result = runAdopt(projectRoot, ['--prepare']);
    assert.equal(result.status, 0);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsMdBefore);
    assert.equal(readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8'), claudeBefore);
    assert.equal(readFileSync(join(projectRoot, '.agents', 'skills', 'legacy-audit', 'SKILL.md'), 'utf8'), legacySkillBefore);

    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')), agentsBefore);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills')), skillsBefore);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-evidence.json')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-brief.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'ai-evidence.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'agentic-dossier.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'requests', 'agentic-blueprint.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.adoption_status, 'evidence_ready');
    assert.equal(state.adoption?.status, 'evidence_ready');
    assert.equal(state.adoption?.next_required_output, '.agentforge/ai/outbox/agentic-blueprint.yaml');
    assert.equal(state.next_required_output, '.agentforge/ai/outbox/agentic-blueprint.yaml');
    assert.equal(state.adoption?.request_path, '.agentforge/ai/requests/agentic-blueprint.md');
    assert.equal(state.adoption?.dossier_path, '.agentforge/reports/agentic-dossier.md');
    assert.equal(state.adoption?.prepare_report_path, '.agentforge/reports/adoption-plan.md');
    assert.equal(state.ai_evidence.files.json, '.agentforge/ai/evidence/project-evidence.json');
    assert.equal(state.ai_evidence.files.brief, '.agentforge/ai/evidence/project-brief.md');
    assert.equal(state.ai_evidence.files.report, '.agentforge/reports/ai-evidence.md');
    assert.ok(state.created_files.includes('.agentforge/ai/requests/agentic-blueprint.md'));
    assert.ok(state.created_files.includes('.agentforge/reports/agentic-dossier.md'));
    assert.ok(state.created_files.includes('.agentforge/reports/adoption-plan.md'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/ai/evidence/project-evidence.json']);
    assert.ok(manifest['.agentforge/ai/evidence/project-brief.md']);
    assert.ok(manifest['.agentforge/reports/ai-evidence.md']);
    assert.ok(manifest['.agentforge/reports/agentic-dossier.md']);
    assert.ok(manifest['.agentforge/ai/requests/agentic-blueprint.md']);
    assert.ok(manifest['.agentforge/reports/adoption-plan.md']);
    assert.ok(manifest['.agentforge/state.json']);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'suggestions')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
