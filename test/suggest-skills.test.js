import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const INSTALL_ANSWERS = {
  project_name: 'Skill Suggestions Demo',
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

function runSuggest(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'suggest-skills', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function createPackageJson(projectRoot) {
  writeFileSync(
    join(projectRoot, 'package.json'),
    JSON.stringify({
      name: 'skill-suggestions-demo',
      private: true,
      scripts: {
        test: 'node --test',
        lint: 'eslint .',
      },
    }, null, 2),
    'utf8',
  );
}

test('suggest-skills generates run-tests, run-lint, and database-migration suggestions', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-suggest-skills-basic-'));

  try {
    await installFixture(projectRoot);
    createPackageJson(projectRoot);
    mkdirSync(join(projectRoot, 'migrations'), { recursive: true });
    writeFileSync(join(projectRoot, 'migrations', '001-init.sql'), '-- migration\n', 'utf8');

    const result = runSuggest(projectRoot);
    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'skill-suggestions.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Skill Suggestions/);
    assert.match(report, /run-tests/);
    assert.match(report, /run-lint/);
    assert.match(report, /database-migration/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_skill_suggestions_at, 'string');
    assert.ok(Array.isArray(state.suggested_skills));
    assert.ok(state.suggested_skills.some((item) => item.id === 'run-tests'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'run-lint'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'database-migration'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/skill-suggestions.md']);
    assert.ok(manifest['.agentforge/suggestions/skills/run-tests.yaml']);
    assert.ok(manifest['.agentforge/suggestions/skills/run-lint.yaml']);
    assert.ok(manifest['.agentforge/suggestions/skills/database-migration.yaml']);
    assert.ok(manifest['.agentforge/state.json']);
    assert.equal(manifest['.agentforge/skill-suggestions/run-tests.yaml'], undefined);
    assert.equal(manifest['.agentforge/skill-suggestions/run-lint.yaml'], undefined);
    assert.equal(manifest['.agentforge/skill-suggestions/database-migration.yaml'], undefined);

    for (const relPath of [
      '.agentforge/suggestions/skills/run-tests.yaml',
      '.agentforge/suggestions/skills/run-lint.yaml',
      '.agentforge/suggestions/skills/database-migration.yaml',
    ]) {
      const filePath = join(projectRoot, relPath);
      assert.equal(existsSync(filePath), true);
      const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
      assert.equal(typeof parsed.id, 'string');
      assert.equal(typeof parsed.name, 'string');
      assert.equal(typeof parsed.description, 'string');
      assert.equal(typeof parsed.reason, 'string');
      assert.ok(['high', 'medium', 'low'].includes(parsed.confidence));
      assert.ok(Array.isArray(parsed.triggers));
      assert.ok(Array.isArray(parsed.recommended_context));
      assert.ok(Array.isArray(parsed.recommended_steps));
      assert.ok(Array.isArray(parsed.safety_limits));
      assert.ok(Array.isArray(parsed.engine_exports));
      assert.ok(Array.isArray(parsed.source_evidence));
    }

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'run-lint', 'SKILL.md')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('suggest-skills preserves a manually edited suggestion file without --force', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-suggest-skills-preserve-'));

  try {
    await installFixture(projectRoot);
    createPackageJson(projectRoot);
    mkdirSync(join(projectRoot, 'migrations'), { recursive: true });

    const first = runSuggest(projectRoot);
    assert.equal(first.status, 0);

    const suggestionPath = join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'run-tests.yaml');
    const manualContent = `${readFileSync(suggestionPath, 'utf8')}# manual note\n`;
    writeFileSync(suggestionPath, manualContent, 'utf8');

    const second = runSuggest(projectRoot);
    assert.equal(second.status, 0);

    assert.equal(readFileSync(suggestionPath, 'utf8'), manualContent);
    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'run-tests'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
