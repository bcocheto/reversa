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
    project_name: 'Suggest Agents Demo',
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
    name: 'suggest-agents-demo',
    private: true,
    packageManager: 'pnpm@9.0.0',
    workspaces: ['apps/*', 'modules/*'],
    scripts: {
      dev: 'nest start --watch',
      test: 'node --test',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      build: 'nest build',
      release: 'npm run build',
      deploy: 'npm run release',
      worker: 'node worker/index.js',
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
      typescript: '^5.0.0',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# Suggest Agents Demo',
    '',
    'Objective: build a SaaS API with a documentation-first workflow and operational release process.',
    '',
    'Audience: product, platform, support, and engineering teams.',
    '',
    '## Commands',
    '',
    '- `pnpm test`',
    '- `pnpm lint`',
    '- `pnpm typecheck`',
    '- `pnpm build`',
    '- `pnpm release`',
    '- `pnpm deploy`',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'docs'), { recursive: true });
  writeFileSync(join(projectRoot, 'docs', 'architecture.md'), '# Architecture\n\nNestJS modules, API boundaries, and shared libraries.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'roadmap.md'), '# Roadmap\n\nPlan milestones, backlog slices, and priorities.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'operations.md'), '# Operations\n\nRelease, deploy, rollback, and workflow notes.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'support.md'), '# Support\n\nTroubleshooting and ticket guidance.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'glossary.md'), '# Glossary\n\nDomain terms and business vocabulary.\n', 'utf8');

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

  mkdirSync(join(projectRoot, 'worker'), { recursive: true });
  writeFileSync(join(projectRoot, 'worker', 'index.js'), [
    'export function runJobs() {',
    '  return "ok";',
    '}',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, '.agents'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'architecture.md'), '# Architecture\n\nAgentic instructions for context routing.\n', 'utf8');

  writeFileSync(join(projectRoot, 'AGENTS.md'), '# AGENTS\n\nProtect docs, policies, and release paths.\n', 'utf8');
  writeFileSync(join(projectRoot, 'CLAUDE.md'), '# CLAUDE\n\nKeep the project safe, documented, and release-ready.\n', 'utf8');

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
    '  release:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: pnpm release',
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

  mkdirSync(join(projectRoot, 'tests'), { recursive: true });
  writeFileSync(join(projectRoot, 'tests', 'app.test.ts'), 'import test from "node:test"; test("ok", () => {});\n', 'utf8');
}

test('agentforge suggest-agents generates agent recommendations and reports', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-suggest-agents-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const agentsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, ''));
    const agentsSnapshot = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'suggest-agents'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20000,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /agent-suggestions\.md/);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsSnapshot);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, '')), agentsBefore);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'agent-suggestions.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Agent Suggestions/);
    assert.match(report, /documentation-curator/);
    assert.match(report, /automation-planner/);
    assert.match(report, /integration-specialist/);
    assert.match(report, /operations-coordinator/);

    for (const relPath of [
      '.agentforge/suggestions/agents/documentation-curator.yaml',
      '.agentforge/suggestions/agents/automation-planner.yaml',
      '.agentforge/suggestions/agents/operations-coordinator.yaml',
      '.agentforge/suggestions/agents/release-coordinator.yaml',
      '.agentforge/suggestions/agents/integration-specialist.yaml',
      '.agentforge/suggestions/agents/qa-strategist.yaml',
      '.agentforge/suggestions/agents/product-planner.yaml',
      '.agentforge/suggestions/agents/context-router.yaml',
    ]) {
      const filePath = join(projectRoot, relPath);
      assert.equal(existsSync(filePath), true);
      const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
      assert.equal(typeof parsed.id, 'string');
      assert.equal(typeof parsed.name, 'string');
      assert.equal(typeof parsed.category, 'string');
      assert.equal(typeof parsed.description, 'string');
      assert.equal(typeof parsed.reason, 'string');
      assert.equal(typeof parsed.confidence, 'string');
      assert.ok(Array.isArray(parsed.evidence));
      assert.ok(Array.isArray(parsed.responsibilities));
      assert.ok(Array.isArray(parsed.reads));
      assert.ok(Array.isArray(parsed.skills));
      assert.ok(Array.isArray(parsed.flows));
      assert.ok(Array.isArray(parsed.limits));
    }

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_agent_suggestions_at, 'string');
    assert.ok(Array.isArray(state.suggested_agents));
    assert.ok(state.suggested_agents.some((item) => item.id === 'documentation-curator'));
    assert.ok(state.suggested_agents.some((item) => item.id === 'automation-planner'));
    assert.ok(state.suggested_agents.some((item) => item.id === 'operations-coordinator'));
    assert.ok(state.suggested_agents.some((item) => item.id === 'release-coordinator'));
    assert.ok(state.suggested_agents.some((item) => item.id === 'integration-specialist'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/reports/agent-suggestions.md']);
    assert.ok(manifest['.agentforge/suggestions/agents/documentation-curator.yaml']);
    assert.ok(manifest['.agentforge/suggestions/agents/automation-planner.yaml']);
    assert.ok(manifest['.agentforge/suggestions/agents/operations-coordinator.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
