import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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

function installAnswers(overrides = {}) {
  return {
    project_name: 'Create Agent Demo',
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
  writer.createProductDir(installAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function writeSuggestion(projectRoot, suggestion) {
  const suggestionDir = join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents');
  mkdirSync(suggestionDir, { recursive: true });
  writeFileSync(
    join(suggestionDir, `${suggestion.id}.yaml`),
    `${YAML.stringify(suggestion).trim()}\n`,
    'utf8',
  );
}

function runCreateAgent(projectRoot, agentId, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'create-agent', agentId, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('agentforge create-agent creates an agent from a suggestion', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-agent-'));

  try {
    await installFixture(projectRoot);
    writeSuggestion(projectRoot, {
      id: 'automation-planner',
      name: 'Automation Planner',
      category: 'automation',
      description: 'Planeja automações recorrentes e fluxos operacionais.',
      reason: 'O projeto tem workflows, workers e comandos de release.',
      confidence: 'high',
      evidence: [
        { file: 'package.json', line: 12, snippet: '"worker": "node worker/index.js"' },
      ],
      responsibilities: [
        'Identificar automações repetitivas.',
        'Separar orquestração de execução.',
      ],
      reads: [
        '.github/workflows/',
        'worker/',
        'README.md',
      ],
      skills: ['create-implementation-plan', 'run-tests'],
      flows: ['release'],
      limits: [
        'Não automatizar operações destrutivas por padrão.',
        'Não esconder aprovações humanas em scripts.',
      ],
    });

    const result = runCreateAgent(projectRoot, 'automation-planner');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /agent-created\.md/);

    const agentPath = join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml');
    assert.equal(existsSync(agentPath), true);

    const agent = YAML.parse(readFileSync(agentPath, 'utf8'));
    assert.equal(agent.id, 'automation-planner');
    assert.equal(agent.name, 'Automation Planner');
    assert.equal(agent.category, 'automation');
    assert.equal(agent.description, 'Planeja automações recorrentes e fluxos operacionais.');
    assert.equal(agent.mission, 'Planeja automações recorrentes e fluxos operacionais.');
    assert.ok(Array.isArray(agent.responsibilities));
    assert.ok(Array.isArray(agent.boundaries));
    assert.ok(Array.isArray(agent.reads));
    assert.ok(Array.isArray(agent.skills));
    assert.ok(Array.isArray(agent.flows));
    assert.equal(agent.handoff.next, 'reviewer');

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'agent-created.md');
    assert.equal(existsSync(reportPath), true);
    assert.match(readFileSync(reportPath, 'utf8'), /automation-planner/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.generated_agents.includes('automation-planner'));
    assert.ok(state.created_files.includes('.agentforge/agents/automation-planner.yaml'));
    assert.ok(state.created_files.includes('.agentforge/reports/agent-created.md'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/agents/automation-planner.yaml']);
    assert.ok(manifest['.agentforge/reports/agent-created.md']);

    const validateResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validateResult.status, 0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge create-agent promotes analyze-shaped suggestions', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-agent-analyze-'));

  try {
    await installFixture(projectRoot);
    writeSuggestion(projectRoot, {
      id: 'data-master',
      title: 'Data Master',
      purpose: 'Organiza contexto e decisões de dados para o projeto.',
      reason: 'O repositório tem sinais claros de banco, migrações e contratos de dados.',
      confidence: 'medium',
      recommended_context: [
        'context/architecture.md',
        'context/deployment.md',
      ],
      recommended_steps: [
        'Mapear a superfície de dados principal.',
        'Separar responsabilidades de leitura e escrita.',
        'Registrar riscos de migração e compatibilidade.',
      ],
      safety_limits: [
        'Não executar migrações destrutivas automaticamente.',
        'Não esconder impactos de contrato ou rollback.',
      ],
    });

    const result = runCreateAgent(projectRoot, 'data-master', ['--force']);
    assert.equal(result.status, 0);

    const agentPath = join(projectRoot, PRODUCT.internalDir, 'agents', 'data-master.yaml');
    assert.equal(existsSync(agentPath), true);

    const agent = YAML.parse(readFileSync(agentPath, 'utf8'));
    assert.equal(agent.id, 'data-master');
    assert.equal(agent.name, 'Data Master');
    assert.equal(agent.description, 'Organiza contexto e decisões de dados para o projeto.');
    assert.equal(agent.mission, 'Organiza contexto e decisões de dados para o projeto.');
    assert.deepEqual(agent.responsibilities, [
      'Mapear a superfície de dados principal.',
      'Separar responsabilidades de leitura e escrita.',
      'Registrar riscos de migração e compatibilidade.',
    ]);
    assert.deepEqual(agent.reads, [
      'context/architecture.md',
      'context/deployment.md',
    ]);
    assert.deepEqual(agent.boundaries, [
      'Não executar migrações destrutivas automaticamente.',
      'Não esconder impactos de contrato ou rollback.',
    ]);
    assert.deepEqual(agent.limits, agent.boundaries);
    assert.equal(agent.purpose, 'Organiza contexto e decisões de dados para o projeto.');

    const validateResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validateResult.status, 0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge create-agent does not overwrite an existing agent without --force', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-agent-force-'));

  try {
    await installFixture(projectRoot);
    writeSuggestion(projectRoot, {
      id: 'automation-planner',
      name: 'Automation Planner',
      category: 'automation',
      description: 'Planeja automações recorrentes e fluxos operacionais.',
      reason: 'O projeto tem workflows, workers e comandos de release.',
      confidence: 'high',
      evidence: [],
      responsibilities: ['Identificar automações repetitivas.'],
      reads: ['README.md'],
      skills: ['create-implementation-plan'],
      flows: ['release'],
      limits: ['Não automatizar operações destrutivas por padrão.'],
    });

    const first = runCreateAgent(projectRoot, 'automation-planner');
    assert.equal(first.status, 0);

    const agentPath = join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml');
    const originalContent = readFileSync(agentPath, 'utf8');
    const manualContent = `${originalContent}\n# manual note\n`;
    writeFileSync(agentPath, manualContent, 'utf8');

    const second = runCreateAgent(projectRoot, 'automation-planner');
    assert.notEqual(second.status, 0);
    assert.match(second.stdout, /Use --force/);
    assert.equal(readFileSync(agentPath, 'utf8'), manualContent);

    const third = runCreateAgent(projectRoot, 'automation-planner', ['--force']);
    assert.equal(third.status, 0);
    assert.notEqual(readFileSync(agentPath, 'utf8'), manualContent);
    assert.match(readFileSync(agentPath, 'utf8'), /id: automation-planner/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge create-agent fails with a clear message when the suggestion is missing', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-agent-missing-'));

  try {
    await installFixture(projectRoot);

    const result = runCreateAgent(projectRoot, 'automation-planner');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Run agentforge suggest-agents first\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
