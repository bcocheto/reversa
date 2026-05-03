import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, loadManifest, saveManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const INSTALL_ANSWERS = {
  project_name: 'AI Evidence Demo',
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

function runAiEvidence(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'ai-evidence', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function createProjectSurface(projectRoot) {
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'ai-evidence-demo',
    private: true,
    packageManager: 'pnpm@9.0.0',
    scripts: {
      test: 'node --test',
      lint: 'eslint .',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      prisma: '^5.0.0',
      pg: '^8.0.0',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# AI Evidence Demo',
    '',
    'Objective: create an evidence bundle for the active AI engine.',
    '',
    'Audience: internal platform and engineering users.',
    '',
    '## Commands',
    '',
    '- `npm test`',
    '- `npm run lint`',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'src'), { recursive: true });
  writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
}

test('agentforge ai-evidence writes the evidence bundle, brief, and report', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-ai-evidence-'));

  try {
    await installFixture(projectRoot);
    createProjectSurface(projectRoot);

    const result = runAiEvidence(projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ai-evidence\.md/);

    const jsonPath = join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-evidence.json');
    const briefPath = join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-brief.md');
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'ai-evidence.md');

    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(briefPath), true);
    assert.equal(existsSync(reportPath), true);

    const bundle = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(bundle.project.name, 'AI Evidence Demo');
    assert.equal(bundle.stack.framework, 'Next.js');
    assert.ok(Array.isArray(bundle.packageScripts));
    assert.ok(bundle.packageScripts.some((script) => script.name === 'test'));
    assert.ok(Array.isArray(bundle.evidence));
    assert.ok(bundle.evidence.some((item) => item.path === 'package.json' && item.kind === 'project-metadata'));
    assert.ok(bundle.evidence.some((item) => item.path === 'README.md' && item.kind === 'project-metadata'));
    assert.ok(bundle.evidence.some((item) => item.path === 'src/index.ts' && item.kind === 'main-area'));

    assert.match(readFileSync(briefPath, 'utf8'), /# AI Evidence Brief/);
    assert.match(readFileSync(reportPath, 'utf8'), /# AgentForge AI Evidence/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_ai_evidence_at, 'string');
    assert.equal(state.ai_evidence.project_name, 'AI Evidence Demo');
    assert.equal(state.ai_evidence.framework, 'Next.js');
    assert.equal(state.ai_evidence.files.json, '.agentforge/ai/evidence/project-evidence.json');
    assert.ok(state.created_files.includes('.agentforge/ai/evidence/project-evidence.json'));
    assert.ok(state.created_files.includes('.agentforge/ai/evidence/project-brief.md'));
    assert.ok(state.created_files.includes('.agentforge/reports/ai-evidence.md'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/ai/evidence/project-evidence.json']);
    assert.ok(manifest['.agentforge/ai/evidence/project-brief.md']);
    assert.ok(manifest['.agentforge/reports/ai-evidence.md']);
    assert.ok(manifest['.agentforge/state.json']);

    const briefWithManualNote = `${readFileSync(briefPath, 'utf8')}\n<!-- manual note -->\n`;
    writeFileSync(briefPath, briefWithManualNote, 'utf8');

    const second = runAiEvidence(projectRoot);
    assert.equal(second.status, 0);
    assert.equal(readFileSync(briefPath, 'utf8'), briefWithManualNote);

    const third = runAiEvidence(projectRoot, ['--force']);
    assert.equal(third.status, 0);
    assert.notEqual(readFileSync(briefPath, 'utf8'), briefWithManualNote);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge ai-evidence --json prints valid JSON', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-ai-evidence-json-'));

  try {
    await installFixture(projectRoot);
    createProjectSurface(projectRoot);

    const result = runAiEvidence(projectRoot, ['--json']);
    assert.equal(result.status, 0);

    const bundle = JSON.parse(result.stdout);
    assert.equal(bundle.project.name, 'AI Evidence Demo');
    assert.equal(bundle.stack.framework, 'Next.js');
    assert.ok(Array.isArray(bundle.evidence));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
