import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { PRODUCT } from '../lib/product.js';
import { buildContextMapForProject } from '../lib/commands/context-map.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createInstallAnswers(overrides = {}) {
  return {
    project_name: 'Context Map Demo',
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
    internal_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer', 'qa', 'security', 'devops'],
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
    ...overrides,
  };
}

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  const answers = createInstallAnswers();
  writer.createProductDir(answers, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function runCommand(projectRoot, args) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('context-map --write generates items with file ranges', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-map-write-'));

  try {
    await installFixture(projectRoot);

    const result = runCommand(projectRoot, ['context-map', '--write']);
    assert.equal(result.status, 0);

    const mapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-map.md');
    assert.equal(result.status, 0);
    assert.equal(readFileSync(mapPath, 'utf8').includes('generated_by: context-curator'), true);
    assert.equal(readFileSync(reportPath, 'utf8').includes('# Context Map'), true);

    const doc = YAML.parse(readFileSync(mapPath, 'utf8'));
    assert.ok(Array.isArray(doc.items));
    assert.ok(doc.items.length > 0);
    assert.ok(doc.items.every((item) => Number.isInteger(item.start_line) && Number.isInteger(item.end_line) && item.start_line <= item.end_line));
    assert.ok(doc.items.some((item) => item.file === 'context/coding-standards.md'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/harness/context-map.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('context-map --check fails when a range points to a missing line', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-map-check-'));

  try {
    await installFixture(projectRoot);
    const writeResult = runCommand(projectRoot, ['context-map', '--write']);
    assert.equal(writeResult.status, 0);

    const mapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
    const doc = YAML.parse(readFileSync(mapPath, 'utf8'));
    doc.items[0].end_line = 9999;
    writeFileSync(mapPath, `${YAML.stringify(doc).trim()}\n`, 'utf8');

    const checkResult = runCommand(projectRoot, ['context-map', '--check']);
    assert.equal(checkResult.status, 1);
    assert.match(checkResult.stdout + checkResult.stderr, /Context map has|Range inválido|Arquivo ausente/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate rejects malformed context-map items', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-map-validate-'));

  try {
    await installFixture(projectRoot);
    const writeResult = runCommand(projectRoot, ['context-map', '--write']);
    assert.equal(writeResult.status, 0);

    const mapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
    const doc = YAML.parse(readFileSync(mapPath, 'utf8'));

    delete doc.items[0].start_line;
    writeFileSync(mapPath, `${YAML.stringify(doc).trim()}\n`, 'utf8');
    let validateResult = runCommand(projectRoot, ['validate']);
    assert.equal(validateResult.status, 1);
    const validationReportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md');
    assert.match(readFileSync(validationReportPath, 'utf8'), /start_line/);

    doc.items[0].start_line = 10;
    doc.items[0].end_line = 1;
    writeFileSync(mapPath, `${YAML.stringify(doc).trim()}\n`, 'utf8');
    validateResult = runCommand(projectRoot, ['validate']);
    assert.equal(validateResult.status, 1);
    assert.match(readFileSync(validationReportPath, 'utf8'), /start_line não pode ser maior que end_line/);

    doc.items[0].start_line = 1;
    doc.items[0].end_line = 1;
    doc.items[0].curation_status = 'curated';
    doc.items[0].file = 'context/does-not-exist.md';
    writeFileSync(mapPath, `${YAML.stringify(doc).trim()}\n`, 'utf8');
    validateResult = runCommand(projectRoot, ['validate']);
    assert.equal(validateResult.status, 1);
    assert.match(readFileSync(validationReportPath, 'utf8'), /Arquivo ausente em "context\/does-not-exist\.md"/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate rejects context-curation task_contexts without a matching task mode', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-map-task-mode-'));

  try {
    await installFixture(projectRoot);

    const taskModesPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'task-modes.yaml');
    const taskModes = YAML.parse(readFileSync(taskModesPath, 'utf8'));
    delete taskModes['context-curation'];
    writeFileSync(taskModesPath, `${YAML.stringify(taskModes).trim()}\n`, 'utf8');

    const validateResult = runCommand(projectRoot, ['validate']);
    assert.equal(validateResult.status, 1);
    const validationReportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md');
    assert.match(readFileSync(validationReportPath, 'utf8'), /context-curation/);
    assert.match(readFileSync(validationReportPath, 'utf8'), /Modo de tarefa indefinido/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('context-map preserves curated items and marks stale ranges', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-map-stale-'));

  try {
    await installFixture(projectRoot);

    const initial = buildContextMapForProject(projectRoot);
    const mapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
    const original = initial.doc;
    const curated = { ...original.items[0], curation_status: 'curated' };
    original.items[0] = curated;
    writeFileSync(mapPath, `${YAML.stringify(original).trim()}\n`, 'utf8');

    const preserved = buildContextMapForProject(projectRoot);
    const preservedItem = preserved.doc.items.find((item) => item.id === curated.id);
    assert.equal(preservedItem?.curation_status, 'curated');
    assert.equal(preservedItem?.summary, curated.summary);

    const staleDoc = YAML.parse(readFileSync(mapPath, 'utf8'));
    staleDoc.items[0].end_line = 9999;
    writeFileSync(mapPath, `${YAML.stringify(staleDoc).trim()}\n`, 'utf8');

    const refreshed = buildContextMapForProject(projectRoot);
    const staleItem = refreshed.doc.items.find((item) => item.id === curated.id);
    assert.equal(staleItem?.curation_status, 'stale');
    assert.equal(staleItem?.summary, curated.summary);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
