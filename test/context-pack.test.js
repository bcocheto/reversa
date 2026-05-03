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
const CONTEXT_INDEX_TEMPLATE = fileURLToPath(new URL('../templates/agentforge/harness/context-index.yaml', import.meta.url));

function installAnswers() {
  return {
    project_name: 'Context Pack Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, Next.js, PostgreSQL',
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
}

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(installAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'harness'), { recursive: true });
  writeFileSync(
    join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'),
    readFileSync(CONTEXT_INDEX_TEMPLATE, 'utf8'),
    'utf8',
  );
}

function writeProjectSurface(projectRoot) {
  writeFileSync(join(projectRoot, 'README.md'), [
    '# Context Pack Demo',
    '',
    'Repository used to validate context-pack output.',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'context'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'), '# Project Overview\n\nOverview content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'architecture.md'), '# Architecture\n\nArchitecture content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'coding-standards.md'), '# Coding Standards\n\nStandards content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'conventions.md'), '# Conventions\n\nConventions content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'testing.md'), '# Testing\n\nTesting content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'deployment.md'), '# Deployment\n\nDeployment content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'glossary.md'), '# Glossary\n\nGlossary content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'references'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), '# Commands\n\nCommands content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'important-files.md'), '# Important Files\n\nImportant files content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'tools.md'), '# Tools\n\nTools content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'create-implementation-plan'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'create-implementation-plan', 'SKILL.md'), '# Create Implementation Plan\n\nPlan content.\n', 'utf8');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests', 'SKILL.md'), '# Run Tests\n\nTest content.\n', 'utf8');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'review-changes'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'review-changes', 'SKILL.md'), '# Review Changes\n\nReview content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'flows'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.md'), '# Feature Development\n\nFlow content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'bugfix.md'), '# Bugfix\n\nFlow content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'refactor.md'), '# Refactor\n\nFlow content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.md'), '# Review\n\nFlow content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'context-curation.md'), '# Context Curation\n\nFlow content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'release.md'), '# Release\n\nFlow content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'policies'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'protected-files.md'), '# Protected Files\n\nPolicy content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'human-approval.md'), '# Human Approval\n\nPolicy content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'ai'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'README.md'), '# AI Readme\n\nAI content.\n', 'utf8');
}

function writeContextPackTaskSurfaces(projectRoot) {
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'agents'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'architect.yaml'), '# Architect\n\nAgent content.\n', 'utf8');
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'reviewer.yaml'), '# Reviewer\n\nAgent content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents', 'architect.yaml'), '# Suggested Architect\n\nSuggestion content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'memory'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'memory', 'decisions.md'), '# Decisions\n\nDecision content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'flow-notes.md'), '# Flow Notes\n\nReport content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'flows'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.md'), '# Feature Development\n\nFlow content.\n', 'utf8');

  writeFileSync(join(projectRoot, 'AGENTS.md'), [
    '# Legacy AGENTS',
    '',
    'Keep this file intact.',
  ].join('\n'), 'utf8');
  writeFileSync(join(projectRoot, 'CLAUDE.md'), [
    '# Legacy CLAUDE',
    '',
    'Keep this file intact.',
  ].join('\n'), 'utf8');
  mkdirSync(join(projectRoot, '.agents', 'skills', 'legacy'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'skills', 'legacy', 'SKILL.md'), '# Legacy Skill\n\nSkill content.\n', 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'context'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'), '# Project Overview\n\nOverview content.\n', 'utf8');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests', 'SKILL.md'), '# Run Tests\n\nSkill content.\n', 'utf8');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'policies'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'protected-files.md'), '# Protected Files\n\nPolicy content.\n', 'utf8');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'references'), { recursive: true });
  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), '# Commands\n\nReference content.\n', 'utf8');
}

function runContextPack(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'context-pack', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('agentforge context-pack feature --write generates a readable report', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-pack-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const result = runContextPack(projectRoot, ['feature', '--write']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# AgentForge Context Pack/);
    assert.match(result.stdout, /## Files to read in order/);
    assert.match(result.stdout, /project-overview\.md/);
    assert.match(result.stdout, /Run Tests/);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-pack-feature.md');
    assert.equal(existsSync(reportPath), true);
    assert.match(readFileSync(reportPath, 'utf8'), /# AgentForge Context Pack/);
    assert.match(readFileSync(reportPath, 'utf8'), /Feature Development/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.last_context_pack_mode, 'feature');
    assert.equal(state.context_pack.report_path, '.agentforge/reports/context-pack-feature.md');
    assert.ok(state.created_files.includes('.agentforge/reports/context-pack-feature.md'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/context-pack-feature.md']);
    assert.ok(manifest['.agentforge/state.json']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge context-pack --task returns a generic JSON pack', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-pack-generic-'));

  try {
    await installFixture(projectRoot);
    writeProjectSurface(projectRoot);

    const result = runContextPack(projectRoot, ['--task', 'migrar documentação para um fluxo revisável', '--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const pack = JSON.parse(result.stdout);
    assert.equal(pack.generic, true);
    assert.equal(pack.selection.selection_mode, 'manual');
    assert.ok(Array.isArray(pack.available_task_modes));
    assert.ok(pack.available_task_modes.includes('feature'));
    assert.ok(Array.isArray(pack.files_to_read));
    assert.ok(pack.files_to_read.length > 0);
    assert.ok(pack.warnings.length >= 0);
    assert.equal(pack.task_description, 'migrar documentação para um fluxo revisável');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge context-pack agent-design --write resolves agent surfaces without generic fallback', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-pack-agent-design-'));

  try {
    await installFixture(projectRoot);
    writeContextPackTaskSurfaces(projectRoot);

    const result = runContextPack(projectRoot, ['agent-design', '--write']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Mode: agent-design/);
    assert.match(result.stdout, /Generic: no/);
    assert.doesNotMatch(result.stdout, /Selection: manual/);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-pack-agent-design.md');
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /## Agents/);
    assert.match(report, /\.agentforge\/agents\/architect\.yaml/);
    assert.match(report, /## Suggestions/);
    assert.match(report, /\.agentforge\/suggestions\/agents\/architect\.yaml/);
    assert.match(report, /## Memory/);
    assert.match(report, /\.agentforge\/memory\/decisions\.md/);
    assert.doesNotMatch(report, /Selection: manual/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge context-pack flow-design --write resolves flow surfaces without generic fallback', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-pack-flow-design-'));

  try {
    await installFixture(projectRoot);
    writeContextPackTaskSurfaces(projectRoot);

    const result = runContextPack(projectRoot, ['flow-design', '--write']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Mode: flow-design/);
    assert.match(result.stdout, /Generic: no/);
    assert.doesNotMatch(result.stdout, /Selection: manual/);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-pack-flow-design.md');
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /## Flows/);
    assert.match(report, /\.agentforge\/flows\/feature-development\.md/);
    assert.match(report, /## Reports/);
    assert.match(report, /\.agentforge\/reports\/flow-notes\.md/);
    assert.match(report, /## Memory/);
    assert.match(report, /\.agentforge\/memory\/decisions\.md/);
    assert.doesNotMatch(report, /Selection: manual/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge context-pack adopt --write resolves legacy and canonical adoption surfaces', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-pack-adopt-'));

  try {
    await installFixture(projectRoot);
    writeContextPackTaskSurfaces(projectRoot);

    const result = runContextPack(projectRoot, ['adopt', '--write']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Mode: adopt/);
    assert.match(result.stdout, /Generic: no/);
    assert.doesNotMatch(result.stdout, /Selection: manual/);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-pack-adopt.md');
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /## Entrypoints/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /## Legacy/);
    assert.match(report, /\.agents\/skills\/legacy\/SKILL\.md/);
    assert.match(report, /## Context/);
    assert.match(report, /\.agentforge\/context\/project-overview\.md/);
    assert.match(report, /## Skills/);
    assert.match(report, /\.agentforge\/skills\/run-tests\/SKILL\.md/);
    assert.match(report, /## Policies/);
    assert.match(report, /\.agentforge\/policies\/protected-files\.md/);
    assert.doesNotMatch(report, /Selection: manual/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
