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

function installAnswers() {
  return {
    project_name: 'Apply Suggestions Demo',
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

function writeSuggestions(projectRoot) {
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'flows'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'policies'), { recursive: true });

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents', 'automation-planner.yaml'), `${YAML.stringify({
    id: 'automation-planner',
    name: 'Automation Planner',
    category: 'automation',
    description: 'Planeja automações recorrentes e fluxos operacionais.',
    reason: 'O projeto tem workflows, workers e comandos de release.',
    confidence: 'high',
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
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'ci-diagnosis.yaml'), `${YAML.stringify({
    id: 'ci-diagnosis',
    title: 'CI Diagnosis',
    description: 'Diagnostica falhas de CI e problemas de automação.',
    reason: 'GitHub Actions e scripts de validação estão presentes.',
    confidence: 'high',
    target_path: '.agentforge/skills/ci-diagnosis/SKILL.md',
    signals: ['.github/workflows/'],
    recommended_context: ['context/testing.md', 'references/commands.md'],
    recommended_steps: [
      'Listar os workflows e seus propósitos.',
      'Descrever a triagem de falhas.',
      'Separar erros de ambiente e de código.',
    ],
    safety_limits: [
      'Não editar segredos ou credenciais de workflow automaticamente.',
    ],
    status: 'recommended',
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'flows', 'review.yaml'), `${YAML.stringify({
    id: 'review',
    title: 'Review',
    description: 'Revisar mudanças com foco em risco, consistência e segurança.',
    reason: 'O projeto mostra documentação, automação e pontos de aprovação.',
    confidence: 'medium',
    target_path: '.agentforge/flows/review.yaml',
    recommended_steps: [
      'Ler a mudança.',
      'Checar impacto.',
      'Verificar políticas.',
      'Sinalizar riscos.',
      'Aprovar ou pedir ajustes.',
    ],
    safety_limits: ['Não aprovar uma revisão com riscos abertos.'],
    status: 'recommended',
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'policies', 'safety.yaml'), `${YAML.stringify({
    id: 'release-policy',
    title: 'Release Policy',
    description: 'Define aprovação e cuidados para ações de release.',
    reason: 'O projeto tem automação e processos de entrega.',
    confidence: 'high',
    target_path: '.agentforge/policies/release-policy.yaml',
    safety_limits: ['Não automatizar ações de release sem confirmação humana.'],
    status: 'recommended',
  }).trim()}\n`, 'utf8');
}

function runApply(projectRoot, args = [], input = '') {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'apply-suggestions', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
  });
}

test('agentforge apply-suggestions --dry-run only generates the report', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-dry-'));

  try {
    await installFixture(projectRoot);
    writeSuggestions(projectRoot);

    const result = runApply(projectRoot, ['--dry-run', '--all']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /apply-suggestions\.md/);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'safety.yaml')), false);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'apply-suggestions.md'), 'utf8');
    assert.match(report, /Dry run: yes/);
    assert.match(report, /Agents:/);
    assert.match(report, /Skills:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge apply-suggestions applies selected artifacts after confirmation', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-confirm-'));

  try {
    await installFixture(projectRoot);
    writeSuggestions(projectRoot);

    const agentsSnapshot = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    const result = runApply(projectRoot, ['--all'], 'y\n');
    assert.equal(result.status, 0);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsSnapshot);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'release-policy.yaml')), true);

    const skill = readFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md'), 'utf8');
    assert.match(skill, /# CI Diagnosis/);
    assert.match(skill, /## Limites de segurança/);

    const flow = YAML.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml'), 'utf8'));
    assert.equal(flow.id, 'review');
    assert.ok(Array.isArray(flow.steps));

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'apply-suggestions.md'), 'utf8');
    assert.match(report, /Confirmed: yes/);
    assert.match(report, /Applied/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_apply_suggestions_at, 'string');
    assert.ok(state.generated_agents.includes('automation-planner'));
    assert.ok(state.generated_skills.includes('ci-diagnosis'));
    assert.ok(state.flows.includes('review'));
    assert.ok(Array.isArray(state.applied_suggestions.agents));
    assert.ok(Array.isArray(state.applied_suggestions.skills));

    const contextIndex = YAML.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'));
    assert.ok(Array.isArray(contextIndex.skills));
    assert.ok(contextIndex.skills.some((item) => item.id === 'ci-diagnosis'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/reports/apply-suggestions.md']);
    assert.ok(manifest['.agentforge/agents/automation-planner.yaml']);
    assert.ok(manifest['.agentforge/skills/ci-diagnosis/SKILL.md']);
    assert.ok(manifest['.agentforge/flows/review.yaml']);
    assert.ok(manifest['.agentforge/policies/release-policy.yaml']);
    assert.ok(manifest['.agentforge/harness/context-index.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
