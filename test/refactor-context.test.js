import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
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
  project_name: 'Refactor Context Demo',
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

function runRefactor(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'refactor-context', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('refactor-context without --apply only creates the plan report', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-dry-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const originalAgents = readFileSync(agentsPath, 'utf8');
    const originalState = readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8');
    const originalManifest = readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8');
    const testingPath = join(projectRoot, PRODUCT.internalDir, 'context', 'testing.md');
    const commandsPath = join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md');
    const originalTesting = existsSync(testingPath) ? readFileSync(testingPath, 'utf8') : null;
    const originalCommands = existsSync(commandsPath) ? readFileSync(commandsPath, 'utf8') : null;

    writeFileSync(
      agentsPath,
      '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n',
      'utf8',
    );

    const result = runRefactor(projectRoot);
    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-plan.md');
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(testingPath), originalTesting !== null);
    assert.equal(existsSync(commandsPath), originalCommands !== null);
    if (originalTesting !== null) assert.equal(readFileSync(testingPath, 'utf8'), originalTesting);
    if (originalCommands !== null) assert.equal(readFileSync(commandsPath, 'utf8'), originalCommands);

    assert.equal(readFileSync(agentsPath, 'utf8'), '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n');
    assert.equal(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'), originalState);
    assert.equal(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'), originalManifest);
    assert.notEqual(readFileSync(agentsPath, 'utf8'), originalAgents);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('refactor-context --curation-input generates structured curation reports', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-curation-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n',
      'utf8',
    );

    const result = runRefactor(projectRoot, ['--curation-input']);
    assert.equal(result.status, 0);

    const jsonPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-context.json');
    const inputPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-curation-input.md');
    assert.equal(existsSync(jsonPath), true);
    assert.equal(existsSync(inputPath), true);

    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.equal(report.score >= 0, true);
    assert.ok(Array.isArray(report.snippets));
    assert.ok(report.snippets.length > 0);
    assert.ok(report.snippets.every((snippet) => snippet.curation_status === 'needs-review'));
    assert.ok(report.snippets.some((snippet) => Number.isInteger(snippet.source_start_line) && Number.isInteger(snippet.source_end_line)));
    assert.match(readFileSync(inputPath, 'utf8'), /# Context Curation Input/);
    assert.match(readFileSync(inputPath, 'utf8'), /context-curator/);
    assert.match(readFileSync(inputPath, 'utf8'), /Suggested next step/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('refactor-context --apply creates references/commands.md when command lists are found', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-commands-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      '# AgentForge\n\n## Commands\n\n- `npm test`\n- `npm run lint`\n',
      'utf8',
    );

    const result = runRefactor(projectRoot, ['--apply']);
    assert.equal(result.status, 0);

    const commandsPath = join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md');
    assert.equal(existsSync(commandsPath), true);
    const commandsContent = readFileSync(commandsPath, 'utf8');
    assert.match(commandsContent, /# Commands/);
    assert.match(commandsContent, /npm test/);

    const contextIndex = YAML.parse(
      readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'),
    );
    assert.ok(Array.isArray(contextIndex.items));
    assert.ok(contextIndex.items.some((item) => item.path === 'references/commands.md'));
    assert.ok(Array.isArray(contextIndex.flows));
    assert.ok(contextIndex.flows.some((item) => item.id === 'release'));
    assert.equal(contextIndex.task_contexts.release, undefined);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/references/commands.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('refactor-context --apply preserves a modified canonical file', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-preserve-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n',
      'utf8',
    );

    const testingPath = join(projectRoot, PRODUCT.internalDir, 'context', 'testing.md');
    writeFileSync(testingPath, '# Testing\n\nConteúdo humano.\n', 'utf8');
    saveManifest(projectRoot, {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, [`.agentforge/context/testing.md`]),
    });

    writeFileSync(testingPath, '# Testing\n\nConteúdo humano alterado.\n', 'utf8');
    const before = readFileSync(testingPath, 'utf8');

    const result = runRefactor(projectRoot, ['--apply']);
    assert.equal(result.status, 0);

    const after = readFileSync(testingPath, 'utf8');
    assert.equal(after, before);
    assert.match(after, /Conteúdo humano alterado/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('refactor-context --apply updates the manifest with generated files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-manifest-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n',
      'utf8',
    );

    const result = runRefactor(projectRoot, ['--apply']);
    assert.equal(result.status, 0);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/context/testing.md']);
    assert.ok(manifest['.agentforge/reports/refactor-plan.md']);
    assert.ok(manifest['.agentforge/state.json']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('refactor-context --apply does not alter AGENTS.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-refactor-context-agents-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const original = '# AgentForge\n\n## Testing\n\nSempre rode `npm test` antes de finalizar.\n';
    writeFileSync(agentsPath, original, 'utf8');

    const result = runRefactor(projectRoot, ['--apply']);
    assert.equal(result.status, 0);

    assert.equal(readFileSync(agentsPath, 'utf8'), original);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
