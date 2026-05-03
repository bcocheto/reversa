import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

test('suggest-skills writes an AI request and evidence bundle by default', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-suggest-skills-basic-'));

  try {
    await installFixture(projectRoot);
    createPackageJson(projectRoot);
    mkdirSync(join(projectRoot, 'migrations'), { recursive: true });
    writeFileSync(join(projectRoot, 'migrations', '001-init.sql'), '-- migration\n', 'utf8');

    const result = runSuggest(projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Request written to/);
    assert.match(result.stdout, /active AI should answer/);

    const requestPath = join(projectRoot, PRODUCT.internalDir, 'ai', 'requests', 'suggest-skills.md');
    const jsonPath = join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-evidence.json');
    const briefPath = join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-brief.md');
    const evidenceReportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'ai-evidence.md');
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'skill-suggestions.md');

    assert.equal(existsSync(requestPath), true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(briefPath), true);
    assert.equal(existsSync(evidenceReportPath), true);
    assert.equal(existsSync(reportPath), true);
    const request = readFileSync(requestPath, 'utf8');
    assert.match(request, /# Skill Suggestion Request/);
    assert.match(request, /skills:/);
    assert.match(request, /source_evidence:/);
    assert.match(request, /safety_limits:/);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Skill Suggestions/);
    assert.match(report, /Mode: AI-first/);
    assert.match(report, /No heuristic YAML suggestions were generated in this mode/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_skill_suggestion_request_at, 'string');
    assert.equal(state.skill_suggestion_request.mode, 'ai-first');
    assert.equal(state.skill_suggestion_request.request_file, '.agentforge/ai/requests/suggest-skills.md');
    assert.equal(state.skill_suggestion_request.status, 'pending_ai_response');
    assert.equal(typeof state.last_skill_suggestions_at, 'undefined');

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/ai/requests/suggest-skills.md']);
    assert.ok(manifest['.agentforge/ai/evidence/project-evidence.json']);
    assert.ok(manifest['.agentforge/ai/evidence/project-brief.md']);
    assert.ok(manifest['.agentforge/reports/ai-evidence.md']);
    assert.ok(manifest['.agentforge/reports/skill-suggestions.md']);
    assert.ok(manifest['.agentforge/state.json']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('suggest-skills --heuristic keeps the legacy YAML flow', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-suggest-skills-preserve-'));

  try {
    await installFixture(projectRoot);
    createPackageJson(projectRoot);
    mkdirSync(join(projectRoot, 'migrations'), { recursive: true });

    const result = runSuggest(projectRoot, ['--heuristic']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Sugestões geradas em/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'requests', 'suggest-skills.md')), false);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'skill-suggestions.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Mode: legacy heuristic/);
    assert.match(report, /run-tests/);
    assert.match(report, /run-lint/);
    assert.match(report, /database-migration/);

    const suggestionPath = join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'run-tests.yaml');
    assert.equal(existsSync(suggestionPath), true);
    const manualContent = `${readFileSync(suggestionPath, 'utf8')}# manual note\n`;
    writeFileSync(suggestionPath, manualContent, 'utf8');

    const second = runSuggest(projectRoot, ['--heuristic']);
    assert.equal(second.status, 0);

    assert.equal(readFileSync(suggestionPath, 'utf8'), manualContent);
    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'run-tests'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
