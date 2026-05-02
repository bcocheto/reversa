import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createInstallAnswers(overrides = {}) {
  return {
    project_name: 'Demo Project',
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

function createInstalledProject(projectRoot) {
  const writer = new Writer(projectRoot);
  const answers = createInstallAnswers();
  writer.createProductDir(answers, '1.0.0');
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

test('agentforge bootstrap detects package scripts, writes report, and updates state', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-bootstrap-'));

  try {
    createInstalledProject(projectRoot);

    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'demo-project',
          version: '1.0.0',
          scripts: {
            test: 'node --test',
            lint: 'eslint .',
            typecheck: 'tsc -p tsconfig.json',
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );
    writeFileSync(join(projectRoot, 'package-lock.json'), '{"name":"demo-project"}\n', 'utf8');
    writeFileSync(join(projectRoot, 'README.md'), '# Demo Project\n\nBootstrap notes.\n', 'utf8');
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.js'), 'export const hello = true;\n', 'utf8');
    mkdirSync(join(projectRoot, 'tests'), { recursive: true });
    writeFileSync(join(projectRoot, 'tests', 'example.test.js'), 'import test from "node:test";\n', 'utf8');
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(join(projectRoot, 'docs', 'guide.md'), '# Guide\n', 'utf8');
    mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'bootstrap'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'bootstrap.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Stack detected:/);
    assert.match(report, /## Commands detected/);
    assert.match(report, /Próximos comandos sugeridos/);
    assert.match(report, /agentforge validate/);

    const commands = readFileSync(
      join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'),
      'utf8',
    );
    assert.match(commands, /`npm test`/);
    assert.match(commands, /`npm run lint`/);
    assert.match(commands, /`npm run typecheck`/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(typeof state.last_bootstrap_at === 'string');
    assert.ok(Array.isArray(state.bootstrap_detected_stack));
    assert.ok(state.bootstrap_detected_stack.includes('Node.js'));
    assert.ok(state.bootstrap_detected_stack.includes('TypeScript'));
    assert.ok(Array.isArray(state.bootstrap_detected_commands));
    assert.ok(state.bootstrap_detected_commands.includes('npm test'));
    assert.ok(state.bootstrap_detected_commands.includes('npm run lint'));
    assert.ok(state.bootstrap_detected_commands.includes('npm run typecheck'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge bootstrap preserves modified canonical files on rerun', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-bootstrap-preserve-'));

  try {
    createInstalledProject(projectRoot);
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'demo-project', version: '1.0.0', scripts: { test: 'node --test' } }, null, 2) + '\n',
      'utf8',
    );

    const first = spawnSync(process.execPath, [AGENTFORGE_BIN, 'bootstrap'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(first.status, 0);

    const preservedPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(
      preservedPath,
      `${readFileSync(preservedPath, 'utf8')}\nLinha adicionada pelo usuário.\n`,
      'utf8',
    );

    const second = spawnSync(process.execPath, [AGENTFORGE_BIN, 'bootstrap'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(second.status, 0);
    assert.match(readFileSync(preservedPath, 'utf8'), /Linha adicionada pelo usuário\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
