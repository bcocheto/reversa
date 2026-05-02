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
    project_name: 'Analyze Demo',
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
    name: 'analyze-demo',
    private: true,
    packageManager: 'pnpm@9.0.0',
    scripts: {
      dev: 'next dev',
      test: 'node --test',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      build: 'next build',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      prisma: '^5.0.0',
      pg: '^8.0.0',
      tailwindcss: '^4.0.0',
      '@auth/core': '^0.36.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# Analyze Demo',
    '',
    'Objective: build and ship a Next.js product with a PostgreSQL-backed core.',
    '',
    'Audience: internal product and engineering team.',
    '',
    '## Commands',
    '',
    '- `npm test`',
    '- `npm run lint`',
    '- `npm run typecheck`',
    '- `npm run build`',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'docs'), { recursive: true });
  writeFileSync(join(projectRoot, 'docs', 'architecture.md'), '# Architecture\n\nApp, modules, and data layers.\n', 'utf8');
  writeFileSync(join(projectRoot, 'docs', 'testing.md'), '# Testing\n\nUse the main test script and smoke checks.\n', 'utf8');

  mkdirSync(join(projectRoot, 'src'), { recursive: true });
  writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
  mkdirSync(join(projectRoot, 'app'), { recursive: true });
  writeFileSync(join(projectRoot, 'app', 'page.tsx'), 'export default function Page() { return <main>Hello</main>; }\n', 'utf8');
  mkdirSync(join(projectRoot, 'libs'), { recursive: true });
  writeFileSync(join(projectRoot, 'libs', 'shared.ts'), 'export const shared = true;\n', 'utf8');
  mkdirSync(join(projectRoot, 'modules'), { recursive: true });
  writeFileSync(join(projectRoot, 'modules', 'core.ts'), 'export const core = true;\n', 'utf8');
  mkdirSync(join(projectRoot, 'tests'), { recursive: true });
  writeFileSync(join(projectRoot, 'tests', 'app.test.ts'), 'import test from "node:test"; test("ok", () => {});\n', 'utf8');
  mkdirSync(join(projectRoot, 'migrations'), { recursive: true });
  writeFileSync(join(projectRoot, 'migrations', '001-init.sql'), '-- init\n', 'utf8');
  mkdirSync(join(projectRoot, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(projectRoot, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
  writeFileSync(join(projectRoot, 'Dockerfile'), 'FROM node:20-alpine\n', 'utf8');
  writeFileSync(join(projectRoot, 'docker-compose.yml'), 'services:\n  app:\n    image: node:20-alpine\n', 'utf8');
  writeFileSync(join(projectRoot, 'CLAUDE.md'), '# CLAUDE\n\nKeep this project safe and review-driven.\n', 'utf8');
}

test('agentforge analyze generates consolidated reports, suggestions, and state updates', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-analyze-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const agentsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, ''));
    const skillsBefore = listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills')).map((file) => file.replace(projectRoot, ''));
    const agentsSnapshot = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'analyze'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20000,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /project-analysis\.md/);
    assert.match(result.stdout, /analysis-plan\.md/);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsSnapshot);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'agents')).map((file) => file.replace(projectRoot, '')), agentsBefore);
    assert.deepEqual(listFilesRecursive(join(projectRoot, PRODUCT.internalDir, 'skills')).map((file) => file.replace(projectRoot, '')), skillsBefore);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_analysis_at, 'string');
    assert.ok(Array.isArray(state.detected_stack));
    assert.ok(state.detected_stack.some((item) => /Next\.js|React|Prisma|PostgreSQL/i.test(item)));
    assert.ok(Array.isArray(state.suggested_agents));
    assert.ok(Array.isArray(state.suggested_skills));
    assert.ok(Array.isArray(state.suggested_flows));
    assert.ok(state.suggested_agents.some((item) => item.id === 'product-owner'));
    assert.ok(state.suggested_agents.some((item) => item.id === 'architect'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'run-tests'));
    assert.ok(state.suggested_skills.some((item) => item.id === 'ci-diagnosis'));
    assert.ok(state.suggested_flows.some((item) => item.id === 'feature-development'));
    assert.ok(state.suggested_policies.some((item) => item.id === 'safety'));
    assert.ok(state.suggested_context_files.some((item) => item.id === 'project-overview'));

    const analysisReport = join(projectRoot, PRODUCT.internalDir, 'reports', 'project-analysis.md');
    const analysisPlan = join(projectRoot, PRODUCT.internalDir, 'reports', 'analysis-plan.md');
    assert.equal(existsSync(analysisReport), true);
    assert.equal(existsSync(analysisPlan), true);
    assert.match(readFileSync(analysisReport, 'utf8'), /AgentForge Project Analysis/);
    assert.match(readFileSync(analysisPlan, 'utf8'), /AgentForge Analysis Plan/);

    for (const relPath of [
      '.agentforge/suggestions/agents/product-owner.yaml',
      '.agentforge/suggestions/skills/run-tests.yaml',
      '.agentforge/suggestions/flows/feature-development.yaml',
      '.agentforge/suggestions/policies/safety.yaml',
      '.agentforge/suggestions/context/project-overview.yaml',
    ]) {
      const filePath = join(projectRoot, relPath);
      assert.equal(existsSync(filePath), true);
      const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
      assert.equal(typeof parsed.id, 'string');
      assert.equal(typeof parsed.kind, 'string');
      assert.equal(typeof parsed.title, 'string');
      assert.equal(typeof parsed.target_path, 'string');
      assert.ok(Array.isArray(parsed.signals));
      assert.ok(Array.isArray(parsed.recommended_steps));
    }

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/reports/project-analysis.md']);
    assert.ok(manifest['.agentforge/reports/analysis-plan.md']);
    assert.ok(manifest['.agentforge/suggestions/agents/product-owner.yaml']);
    assert.ok(manifest['.agentforge/suggestions/skills/run-tests.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
