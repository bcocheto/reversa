import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
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

function baseAnswers(overrides = {}) {
  return {
    project_name: 'Pattern Research Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, NestJS, PostgreSQL',
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
    ...overrides,
  };
}

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(baseAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function writeProjectSurface(projectRoot) {
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'pattern-research-demo',
    private: true,
    packageManager: 'pnpm@9.0.0',
    workspaces: ['apps/*', 'modules/*'],
    bin: {
      patternresearch: 'src/cli.ts',
    },
    scripts: {
      dev: 'nest start --watch',
      test: 'node --test',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      build: 'nest build',
      release: 'npm run build',
    },
    dependencies: {
      '@nestjs/common': '^10.0.0',
      '@nestjs/core': '^10.0.0',
      '@nestjs/platform-express': '^10.0.0',
      '@auth/core': '^0.36.0',
      prisma: '^5.0.0',
      pg: '^8.0.0',
      'reflect-metadata': '^0.2.0',
      rxjs: '^7.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      next: '^15.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# Pattern Research Demo',
    '',
    'Objective: build a SaaS API with a documentation-first workflow and modular NestJS architecture.',
    '',
    'Audience: product, platform, and engineering teams.',
    '',
    '## Commands',
    '',
    '- `pnpm test`',
    '- `pnpm lint`',
    '- `pnpm typecheck`',
    '- `pnpm build`',
    '- `pnpm release`',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'docs'), { recursive: true });
  writeFileSync(join(projectRoot, 'docs', 'architecture.md'), '# Architecture\n\nNestJS modules, API boundaries, and shared libraries.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'testing.md'), '# Testing\n\nUse the main test script and release checks.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'onboarding.md'), '# Onboarding\n\nRead the docs, then the command references.\n', 'utf8');

  mkdirSync(join(projectRoot, 'src', 'users'), { recursive: true });
  writeFileSync(join(projectRoot, 'src', 'main.ts'), [
    'import { NestFactory } from "@nestjs/core";',
    'import { AppModule } from "./app.module";',
    '',
    'async function bootstrap() {',
    '  const app = await NestFactory.create(AppModule);',
    '  await app.listen(3000);',
    '}',
    '',
    'bootstrap();',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(projectRoot, 'src', 'app.module.ts'), [
    'import { Module } from "@nestjs/common";',
    '',
    '@Module({',
    '  imports: [],',
    '  controllers: [],',
    '  providers: [],',
    '})',
    'export class AppModule {}',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(projectRoot, 'src', 'users', 'users.controller.ts'), [
    'import { Controller, Get } from "@nestjs/common";',
    '',
    '@Controller("users")',
    'export class UsersController {',
    '  @Get()',
    '  listUsers() {',
    '    return [];',
    '  }',
    '}',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(projectRoot, 'src', 'users', 'users.service.ts'), [
    'import { Injectable } from "@nestjs/common";',
    '',
    '@Injectable()',
    'export class UsersService {}',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'modules'), { recursive: true });
  writeFileSync(join(projectRoot, 'modules', 'billing.module.ts'), [
    'import { Module } from "@nestjs/common";',
    '',
    '@Module({',
    '  imports: [],',
    '  controllers: [],',
    '  providers: [],',
    '})',
    'export class BillingModule {}',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'libs'), { recursive: true });
  writeFileSync(join(projectRoot, 'libs', 'shared.ts'), 'export const shared = true;\n', 'utf8');

  mkdirSync(join(projectRoot, 'tests'), { recursive: true });
  writeFileSync(join(projectRoot, 'tests', 'app.test.ts'), 'import test from "node:test"; test("ok", () => {});\n', 'utf8');

  mkdirSync(join(projectRoot, '.agents'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'architecture.md'), '# Architecture\n\nDocument modular responsibilities here.\n', 'utf8');

  writeFileSync(join(projectRoot, 'AGENTS.md'), '# AGENTS\n\nProtect docs, modules, and release paths.\n', 'utf8');
  writeFileSync(join(projectRoot, 'CLAUDE.md'), '# CLAUDE\n\nKeep the system safe, modular, and release-ready.\n', 'utf8');

  writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n  - "modules/*"\n', 'utf8');

  mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), [
    'name: CI',
    'on: [push, pull_request]',
    'jobs:',
    '  test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pnpm test',
    '',
  ].join('\n'), 'utf8');

  writeFileSync(join(projectRoot, 'Dockerfile'), 'FROM node:20-alpine\n', 'utf8');
  writeFileSync(join(projectRoot, 'docker-compose.yml'), [
    'services:',
    '  app:',
    '    build: .',
    '    command: pnpm test',
    '',
  ].join('\n'), 'utf8');
}

test('agentforge research-patterns generates local pattern reports and recommendations', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-research-patterns-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const agentsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, ''));
    const skillsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills')).map((file) => file.replace(projectRoot, ''));
    const agentsSnapshot = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    const stateSnapshot = readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'research-patterns'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20000,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Pattern research saved to/);
    assert.match(result.stdout, /pattern-research\.md/);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsSnapshot);
    assert.equal(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'), stateSnapshot);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, '')), agentsBefore);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills')).map((file) => file.replace(projectRoot, '')), skillsBefore);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'pattern-research.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Pattern Research Demo/);
    assert.match(report, /NestJS modular architecture/);
    assert.match(report, /Documentation-heavy project/);
    assert.match(report, /Automation-heavy project/);
    assert.match(report, /Stack detected/);
    assert.match(report, /Observed patterns/);
    assert.match(report, /Recommended patterns/);
    assert.match(report, /Confidence:/);

    const nestjsSuggestion = YAML.parse(readFileSync(join(projectRoot, '.agentforge', 'suggestions', 'patterns', 'nestjs.yaml'), 'utf8'));
    assert.equal(nestjsSuggestion.kind, 'pattern');
    assert.equal(nestjsSuggestion.recommended, true);
    assert.ok(nestjsSuggestion.recommended_agents.includes('architect'));
    assert.ok(nestjsSuggestion.recommended_context_files.includes('context/architecture.md'));

    const automationSuggestion = YAML.parse(readFileSync(join(projectRoot, '.agentforge', 'suggestions', 'patterns', 'automation-heavy.yaml'), 'utf8'));
    assert.equal(automationSuggestion.kind, 'pattern');
    assert.equal(automationSuggestion.recommended, true);
    assert.ok(automationSuggestion.recommended_agents.includes('devops'));
    assert.ok(automationSuggestion.recommended_flows.includes('release'));

    const docsSuggestion = YAML.parse(readFileSync(join(projectRoot, '.agentforge', 'suggestions', 'patterns', 'documentation-heavy.yaml'), 'utf8'));
    assert.equal(docsSuggestion.kind, 'pattern');
    assert.equal(docsSuggestion.recommended, true);
    assert.ok(docsSuggestion.recommended_agents.includes('documentation-curator'));

    const dockerSuggestion = YAML.parse(readFileSync(join(projectRoot, '.agentforge', 'suggestions', 'patterns', 'docker.yaml'), 'utf8'));
    assert.equal(dockerSuggestion.kind, 'pattern');
    assert.equal(dockerSuggestion.recommended, true);
    assert.ok(dockerSuggestion.recommended_agents.includes('devops'));

    const githubActionsSuggestion = YAML.parse(readFileSync(join(projectRoot, '.agentforge', 'suggestions', 'patterns', 'github-actions.yaml'), 'utf8'));
    assert.equal(githubActionsSuggestion.kind, 'pattern');
    assert.equal(githubActionsSuggestion.recommended, true);
    assert.ok(githubActionsSuggestion.recommended_agents.includes('devops'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/reports/pattern-research.md']);
    assert.ok(manifest['.agentforge/suggestions/patterns/nestjs.yaml']);
    assert.ok(manifest['.agentforge/suggestions/patterns/automation-heavy.yaml']);
    assert.ok(manifest['.agentforge/suggestions/patterns/documentation-heavy.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge research-patterns --online emits the local-research warning', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-research-patterns-online-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'research-patterns', '--online'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20000,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Online research is not configured yet; using local pattern catalog\./);
    assert.match(result.stdout, /Pattern research saved to/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
