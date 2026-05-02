import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const INSTALL_ANSWERS = {
  project_name: 'Context Audit Demo',
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
};

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(INSTALL_ANSWERS, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function runAudit(projectRoot) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'audit-context'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('audit-context generates a report with a simple AGENTS.md and no snapshots', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-audit-context-simple-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const originalAgents = readFileSync(agentsPath, 'utf8');

    const result = runAudit(projectRoot);
    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-audit.md');
    assert.equal(existsSync(reportPath), true);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Context Audit/);
    assert.match(report, /## Resumo executivo/);
    assert.match(report, /## Arquivos analisados/);
    assert.match(report, /AGENTS\.md/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_context_audit_at, 'string');
    assert.equal(typeof state.context_audit_score, 'number');
    assert.ok(Array.isArray(state.detected_skill_candidates));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/context-audit.md']);
    assert.ok(manifest['.agentforge/state.json']);

    assert.equal(readFileSync(agentsPath, 'utf8'), originalAgents);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('audit-context detects npm test as a possible skill', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-audit-context-skill-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const originalAgents = readFileSync(agentsPath, 'utf8');
    writeFileSync(
      agentsPath,
      '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n',
      'utf8',
    );

    const result = runAudit(projectRoot);
    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'context-audit.md'), 'utf8');
    assert.match(report, /npm test/);
    assert.match(report, /run-tests/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.detected_skill_candidates.some((item) => item.command === 'npm test' && item.skill_id === 'run-tests'));

    assert.equal(readFileSync(agentsPath, 'utf8'), '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n');
    assert.notEqual(readFileSync(agentsPath, 'utf8'), originalAgents);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('audit-context detects a simple always/never conflict', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-audit-context-conflict-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const claudePath = join(projectRoot, 'CLAUDE.md');
    const originalAgents = readFileSync(agentsPath, 'utf8');
    const originalClaude = '# Claude Code\n\n## Rules\n\nDo not run tests unless asked.\n';

    writeFileSync(
      agentsPath,
      '# AgentForge\n\n## Rules\n\nAlways run tests before you finish.\n',
      'utf8',
    );
    writeFileSync(
      claudePath,
      originalClaude,
      'utf8',
    );

    const result = runAudit(projectRoot);
    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'context-audit.md'), 'utf8');
    assert.match(report, /always run tests vs do not run tests unless asked/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /CLAUDE\.md/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.context_audit_score, 'number');
    assert.ok(state.context_audit_score < 100);

    assert.equal(readFileSync(agentsPath, 'utf8'), '# AgentForge\n\n## Rules\n\nAlways run tests before you finish.\n');
    assert.equal(readFileSync(claudePath, 'utf8'), originalClaude);
    assert.equal(readFileSync(agentsPath, 'utf8') !== originalAgents, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
