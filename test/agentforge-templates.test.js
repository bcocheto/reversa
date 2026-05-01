import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { buildUninstallPlan, applyUninstallPlan } from '../lib/commands/uninstall.js';
import { PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

test('install writes the AgentForge state, config, plan, and engine entry templates', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-templates-'));

  try {
    const writer = new Writer(projectRoot);
    const answers = {
      project_name: 'Demo Project',
      user_name: 'Ana',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
      output_folder: '_agentforge',
      engines: ['codex'],
      internal_agents: [
        PRODUCT.skillsPrefix,
        `${PRODUCT.skillsPrefix}-scope-scout`,
        `${PRODUCT.skillsPrefix}-agent-architect`,
      ],
      response_mode: 'chat',
    };

    writer.createProductDir(answers, '1.0.0');
    await writer.installEntryFile({ entryTemplate: 'AGENTS.md', entryFile: 'AGENTS.md' }, { force: true });
    await writer.installEntryFile({ entryTemplate: 'CLAUDE.md', entryFile: 'CLAUDE.md' }, { force: true });
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.version, '1.0.0');
    assert.equal(state.project, 'Demo Project');
    assert.equal(state.user_name, 'Ana');
    assert.equal(state.phase, null);
    assert.deepEqual(state.pending, [
      'discovery',
      'agent-design',
      'flow-design',
      'policies',
      'export',
      'review',
    ]);
    assert.deepEqual(state.internal_agents, [
      PRODUCT.skillsPrefix,
      `${PRODUCT.skillsPrefix}-scope-scout`,
      `${PRODUCT.skillsPrefix}-agent-architect`,
    ]);
    assert.deepEqual(state.generated_agents, []);
    assert.deepEqual(state.generated_subagents, []);
    assert.deepEqual(state.flows, []);
    assert.equal(state.output_folder, '_agentforge');
    assert.deepEqual(state.checkpoints, {});
    assert.ok(state.created_files.includes('.agentforge/scope.md'));
    assert.ok(state.created_files.includes('.agentforge/agents/orchestrator.yaml'));
    assert.ok(state.created_files.includes('.agentforge/memory/conventions.md'));
    assert.equal(Object.hasOwn(state, 'agents'), false);
    assert.equal(Object.hasOwn(state, 'answer_mode'), false);
    assert.equal(Object.hasOwn(state, 'doc_level'), false);

    const config = readFileSync(join(projectRoot, PRODUCT.internalDir, 'config.toml'), 'utf8');
    assert.match(config, /\[internal_agents\]/);
    assert.match(config, /response_mode = "chat"/);
    assert.match(config, /detail_level = "complete"/);
    assert.match(config, /folder = "_agentforge"/);

    const plan = readFileSync(join(projectRoot, PRODUCT.internalDir, 'plan.md'), 'utf8');
    assert.match(plan, /Fase 1 — Discovery/);
    assert.match(plan, /Fase 6 — Review/);
    assert.doesNotMatch(plan, /Reconhecimento|Escavação|Geração|Revisão/);

    const scope = readFileSync(join(projectRoot, PRODUCT.internalDir, 'scope.md'), 'utf8');
    assert.match(scope, /Escopo do AgentForge/);

    const orchestrator = readFileSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml'), 'utf8');
    assert.match(orchestrator, /name: orchestrator/);
    assert.match(orchestrator, /slash_command: \/agentforge/);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/scope.md']);
    assert.ok(manifest['.agentforge/agents/orchestrator.yaml']);
    assert.ok(manifest['.agentforge/flows/feature-development.yaml']);
    assert.ok(manifest['.agentforge/policies/permissions.yaml']);
    assert.ok(manifest['.agentforge/memory/decisions.md']);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports')), true);

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /AgentForge/);
    assert.match(agentsEntry, /\.agentforge\/state\.json/);
    assert.match(agentsEntry, /\/agentforge/);
    assert.doesNotMatch(agentsEntry, /Reversa/);

    const claudeEntry = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(claudeEntry, /AgentForge/);
    assert.match(claudeEntry, /\.agentforge\/state\.json/);
    assert.match(claudeEntry, /\/agentforge/);
    assert.doesNotMatch(claudeEntry, /Reversa/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('uninstall preserves modified canonical files and removes intact ones', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-uninstall-'));

  try {
    const writer = new Writer(projectRoot);
    const answers = {
      project_name: 'Demo Project',
      user_name: 'Ana',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
      output_folder: '_agentforge',
      engines: ['codex'],
      internal_agents: [PRODUCT.skillsPrefix],
      response_mode: 'chat',
    };

    writer.createProductDir(answers, '1.0.0');
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const modifiedPath = join(projectRoot, PRODUCT.internalDir, 'memory', 'conventions.md');
    writeFileSync(modifiedPath, `${readFileSync(modifiedPath, 'utf8')}\nLinha adicionada pelo usuário.\n`, 'utf8');

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    const manifest = loadManifest(projectRoot);
    const plan = buildUninstallPlan(projectRoot, state, manifest, PRODUCT.internalDir);
    const result = applyUninstallPlan(projectRoot, plan);

    assert.equal(result.errors, 0);
    assert.equal(existsSync(modifiedPath), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'scope.md')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge validate succeeds on a fresh install and writes validation.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-ok-'));

  try {
    const writer = new Writer(projectRoot);
    const answers = {
      project_name: 'Demo Project',
      user_name: 'Ana',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
      output_folder: '_agentforge',
      engines: ['codex'],
      internal_agents: [PRODUCT.skillsPrefix],
      response_mode: 'chat',
    };

    writer.createProductDir(answers, '1.0.0');
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md')), true);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido/);
    assert.match(report, /Agentes:/);
    assert.match(report, /Fluxos:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge validate fails when a flow references a missing agent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-fail-'));

  try {
    const writer = new Writer(projectRoot);
    const answers = {
      project_name: 'Demo Project',
      user_name: 'Ana',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
      output_folder: '_agentforge',
      engines: ['codex'],
      internal_agents: [PRODUCT.skillsPrefix],
      response_mode: 'chat',
    };

    writer.createProductDir(answers, '1.0.0');
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const flowPath = join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml');
    const brokenFlow = readFileSync(flowPath, 'utf8').replace('agent: orchestrator', 'agent: ghost-agent');
    writeFileSync(flowPath, brokenFlow, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md')), true);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: inválido/);
    assert.match(report, /ghost-agent/);
    assert.match(report, /Agent inexistente referenciado/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
