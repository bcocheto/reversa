import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest, mergeUpdateManifest } from '../lib/installer/manifest.js';
import { compileAgentForge } from '../lib/exporter/index.js';
import { renderManagedEntrypoint } from '../lib/exporter/bootloader.js';
import { buildHandoffData, renderHandoffReport, resolveHandoffWritePolicy } from '../lib/commands/handoff.js';
import { resolveAgentForgeActivationPlan } from '../lib/commands/activation-plan.js';
import { runUninstall } from '../lib/commands/uninstall.js';
import { buildInstallOnboardingCopy, shouldDefaultFinalizeAdoption } from '../lib/commands/install.js';
import { runAdoptApply } from '../lib/commands/adopt.js';
import { finalizeAdoptionWorkflow } from '../lib/commands/phase-engine.js';
import { validateAgentForgeStructure } from '../lib/commands/validate.js';
import { checkExistingInstallation } from '../lib/installer/validator.js';
import { detectEngines, ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';
import { COMMAND_REGISTRY } from '../lib/commands/registry.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const MINIMUM_HARNESS_REL_PATHS = [
  'harness/README.md',
  'harness/router.md',
  'harness/context-index.yaml',
  'harness/task-modes.yaml',
  'harness/load-order.yaml',
  'harness/engine-map.yaml',
  'reports/README.md',
];

const MINIMUM_HARNESS_MANIFEST_PATHS = MINIMUM_HARNESS_REL_PATHS.map(
  (relPath) => `${PRODUCT.internalDir}/${relPath}`,
);

function baseAnswers(overrides = {}) {
  return {
    project_name: 'AgentForge Demo',
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

async function installFixture(projectRoot, {
  engines = ['codex'],
  exportTargets = false,
  setupMode = 'bootstrap',
  answersOverrides = {},
} = {}) {
  const writer = new Writer(projectRoot);
  const answers = baseAnswers({ engines, setup_mode: setupMode, ...answersOverrides });

  writer.createProductDir(answers, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  if (exportTargets) {
    await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });
  }

  return answers;
}

async function createInstalledProjectWithClaude(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(baseAnswers({ engines: ['codex', 'claude-code'] }), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  const claudeCode = ENGINES.find((entry) => entry.id === 'claude-code');
  assert.ok(codex, 'Codex engine definition must exist');
  assert.ok(claudeCode, 'Claude Code engine definition must exist');

  await writer.installEntryFile(codex, { force: true });
  await writer.installEntryFile(claudeCode, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function buildManagedEntrypointContent({
  manualLines = 0,
  includeLegacyReversaBlockInsideManagedBlock = false,
  includeLegacyReversaBlock = false,
  includeLegacyReversaPath = false,
} = {}) {
  const lines = [
    '# AgentForge bootloader',
    ...Array.from({ length: manualLines }, (_, index) => `Linha manual ${index + 1}.`),
    '',
    '<!-- agentforge:start -->',
    'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
    'A IA ativa deve decidir o próximo passo com julgamento contextual antes de editar arquivos reais.',
    'A pasta `.agentforge/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto.',
    'Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/harness/context-map.yaml`.',
    'Selecione o task mode mais provável para a solicitação do usuário.',
    'Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação.',
    'Aplique o flow, skill e policy relevantes ao contexto detectado.',
    'Só então leia e edite os arquivos reais do projeto conforme o objetivo do usuário.',
    'Não assuma Codex como o único runtime; use a IA ativa configurada no ambiente.',
    'Se a tarefa for de contexto, documentação, refatoração de instruções, glossário, localização ou segregação de conhecimento, acione o agente `context-curator`.',
    'Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento.',
    'Ao concluir, rode `agentforge checkpoint <phase> --status done` e depois `agentforge validate`.',
    'Nunca edite `state.json` ou `plan.md` manualmente.',
    'Use `.agentforge/policies/`, `.agentforge/skills/`, `.agentforge/flows/` e `.agentforge/references/` conforme necessário.',
    'Considere `.agentforge/memory/` quando relevante.',
  ];

  if (includeLegacyReversaBlockInsideManagedBlock) {
    lines.push(
      '',
      '<!-- reversa:start -->',
      'Bloco legado Reversa.',
      '<!-- reversa:end -->',
    );
  }

  lines.push('<!-- agentforge:end -->');

  if (includeLegacyReversaBlock) {
    lines.push(
      '',
      '<!-- reversa:start -->',
      'Bloco legado Reversa.',
      '<!-- reversa:end -->',
    );
  }

  if (includeLegacyReversaPath) {
    lines.push('', 'Consulte `.reversa/legacy.md` e `_reversa_sdd/notes.md`.');
  }

  return `${lines.join('\n')}\n`;
}

function assertMinimumHarness(projectRoot) {
  for (const relPath of MINIMUM_HARNESS_REL_PATHS) {
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, relPath)), true);
  }
}

function assertAiLayer(projectRoot) {
  const relPaths = [
    'ai/README.md',
    'ai/playbooks/discovery.md',
    'ai/playbooks/agent-design.md',
    'ai/playbooks/flow-design.md',
    'ai/playbooks/policies.md',
    'ai/playbooks/export.md',
    'ai/playbooks/review.md',
    'ai/playbooks/task-execution.md',
    'ai/engines/codex.md',
    'ai/engines/claude.md',
    'ai/engines/gemini.md',
    'ai/engines/cursor.md',
    'ai/engines/copilot.md',
  ];

  for (const relPath of relPaths) {
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, relPath)), true, relPath);
  }
}

test('install creates the AgentForge structure, state, Codex entry file, agents, and flows', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-install-'));

  try {
    const answers = await installFixture(projectRoot);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'state.json')), true);
    assert.equal(existsSync(join(projectRoot, 'AGENTS.md')), true);
    assertMinimumHarness(projectRoot);
    assertAiLayer(projectRoot);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'reviewer.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'release.yaml')), true);
    const manifest = loadManifest(projectRoot);
    for (const relPath of MINIMUM_HARNESS_MANIFEST_PATHS) {
      assert.ok(manifest[relPath], `missing manifest entry for ${relPath}`);
    }

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /<!-- agentforge:end -->/);
    assert.match(agentsEntry, /A pasta `\.agentforge\/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto\./);
    assert.match(agentsEntry, /Leia `\.agentforge\/harness\/router\.md`, `\.agentforge\/harness\/context-index\.yaml` e `\.agentforge\/harness\/context-map\.yaml`\./);
    assert.match(agentsEntry, /Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação\./);
    assert.match(agentsEntry, /Não assuma Codex como o único runtime; use a IA ativa configurada no ambiente\./);
    assert.match(agentsEntry, /Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento\./);
    assert.match(agentsEntry, /Ao concluir, rode `agentforge checkpoint <phase> --status done` e depois `agentforge validate`\./);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.project, answers.project_name);
    assert.equal(state.setup_mode, 'bootstrap');
    assert.deepEqual(state.initial_agents, answers.initial_agents);
    assert.deepEqual(state.initial_flows, answers.initial_flows);
    assert.deepEqual(state.engines, answers.engines);
    assert.deepEqual(state.workflow, {
      current_phase: 'discovery',
      completed_phases: [],
      pending_phases: ['discovery', 'agent-design', 'flow-design', 'policies', 'export', 'review'],
      phase_history: [],
    });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff reports engine-specific notes and playbooks for active engines', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-handoff-'));

  try {
    await installFixture(projectRoot, { engines: ['codex', 'claude-code', 'gemini-cli'] });

    const discovery = buildHandoffData(projectRoot, { engine: 'codex', phase: 'discovery' });
    const agentDesign = buildHandoffData(projectRoot, { engine: 'claude', phase: 'agent-design' });
    const exportPhase = buildHandoffData(projectRoot, { engine: 'gemini', phase: 'export' });
    const codex = buildHandoffData(projectRoot, { engine: 'codex' });
    const claude = buildHandoffData(projectRoot, { engine: 'claude' });
    const gemini = buildHandoffData(projectRoot, { engine: 'gemini' });

    assert.equal(discovery.playbook.path, '.agentforge/ai/playbooks/discovery.md');
    assert.equal(agentDesign.playbook.path, '.agentforge/ai/playbooks/agent-design.md');
    assert.equal(exportPhase.playbook.path, '.agentforge/ai/playbooks/export.md');
    assert.equal(codex.engine_note.path, '.agentforge/ai/engines/codex.md');
    assert.equal(claude.engine_note.path, '.agentforge/ai/engines/claude.md');
    assert.equal(gemini.engine_note.path, '.agentforge/ai/engines/gemini.md');
    assert.match(renderHandoffReport(discovery), /Leia o playbook da fase: `\.agentforge\/ai\/playbooks\/discovery\.md`\./);
    assert.match(renderHandoffReport(agentDesign), /Leia o playbook da fase: `\.agentforge\/ai\/playbooks\/agent-design\.md`\./);
    assert.match(renderHandoffReport(exportPhase), /Leia o playbook da fase: `\.agentforge\/ai\/playbooks\/export\.md`\./);
    assert.ok(exportPhase.commands.some((command) => command.includes('compile --takeover-entrypoints --include-existing-entrypoints')));
    const agentDesignPlaybook = readFileSync(new URL('../templates/agentforge/ai/playbooks/agent-design.md', import.meta.url), 'utf8');
    assert.match(agentDesignPlaybook, /Não criar YAML de agente manualmente; use `agentforge create-agent <id>`/);
    assert.match(agentDesignPlaybook, /`agentforge apply-suggestions --agents`/);
    const exportPlaybook = readFileSync(new URL('../templates/agentforge/ai/playbooks/export.md', import.meta.url), 'utf8');
    assert.match(exportPlaybook, /Não editar entrypoints manualmente/);
    assert.match(renderHandoffReport(codex), /Leia a nota da engine: `\.agentforge\/ai\/engines\/codex\.md`\./);
    assert.match(renderHandoffReport(claude), /Leia a nota da engine: `\.agentforge\/ai\/engines\/claude\.md`\./);
    assert.match(renderHandoffReport(gemini), /Leia a nota da engine: `\.agentforge\/ai\/engines\/gemini\.md`\./);
    assert.match(renderHandoffReport(codex), /Playbooks disponíveis/);
    assert.match(renderHandoffReport(codex), /ai\/playbooks\/discovery\.md/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('handoff write policy adapts to phase and adoption mode', () => {
  const agentDesign = resolveHandoffWritePolicy({ phase: 'agent-design' });
  const exportPolicy = resolveHandoffWritePolicy({ phase: 'export' });
  const adoptionPolicy = resolveHandoffWritePolicy({ mode: 'adopt' });

  assert.equal(agentDesign.direct_write_allowed.includes('.agentforge/agents/**'), false);
  assert.ok(agentDesign.command_write_allowed.includes('.agentforge/agents/**'));
  assert.ok(agentDesign.command_write_allowed.includes('.agentforge/suggestions/agents/**'));
  assert.ok(agentDesign.never_edit_manually.includes('.agentforge/state.json'));
  assert.ok(agentDesign.never_edit_manually.includes('.agentforge/plan.md'));
  assert.ok(agentDesign.never_edit_manually.includes('.agentforge/_config/**'));

  assert.equal(exportPolicy.direct_write_allowed.includes('AGENTS.md'), false);
  assert.ok(exportPolicy.command_write_allowed.includes('AGENTS.md'));
  assert.ok(exportPolicy.command_write_allowed.includes('CLAUDE.md'));
  assert.ok(exportPolicy.command_write_allowed.includes('.cursor/rules/agentforge.md'));
  assert.ok(exportPolicy.command_write_allowed.includes('.github/copilot-instructions.md'));

  assert.equal(adoptionPolicy.direct_write_allowed.includes('AGENTS.md'), false);
  assert.equal(adoptionPolicy.direct_write_allowed.includes('CLAUDE.md'), false);
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agents/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/context/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/skills/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/flows/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/policies/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/references/**'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/harness/context-index.yaml'));
  assert.ok(adoptionPolicy.command_write_allowed.includes('.agentforge/harness/context-map.yaml'));
  assert.ok(adoptionPolicy.never_edit_manually.includes('.agentforge/state.json'));
  assert.ok(adoptionPolicy.never_edit_manually.includes('.agentforge/plan.md'));
  assert.ok(adoptionPolicy.never_edit_manually.includes('.agentforge/_config/**'));
});

test('activation plan prioritizes adoption states before the phase engine', async () => {
  const adoptionRoot = mkdtempSync(join(tmpdir(), 'agentforge-activation-adopt-'));

  try {
    await installFixture(adoptionRoot, { setupMode: 'adopt' });

    const statePath = join(adoptionRoot, PRODUCT.internalDir, 'state.json');
    const plannedState = JSON.parse(readFileSync(statePath, 'utf8'));
    const plannedPlan = resolveAgentForgeActivationPlan(adoptionRoot, {
      ...plannedState,
      adoption_status: 'planned',
      adoption: {
        ...(plannedState.adoption ?? {}),
        apply_status: 'pending',
      },
    });

    assert.equal(plannedPlan.mode, 'adoption-pending');
    assert.equal(plannedPlan.should_continue_workflow, false);
    assert.equal(plannedPlan.current_phase, 'adoption-pending');
    assert.equal(plannedPlan.next_action, 'apply-adoption');
    assert.equal(plannedPlan.recommended_command, 'agentforge adopt --apply');
    assert.deepEqual(plannedPlan.required_commands, ['agentforge adopt --apply']);
    assert.doesNotMatch(plannedPlan.required_commands.join('\n'), /discovery|agent-design/);

    const verificationState = {
      ...plannedState,
      adoption_status: 'applied',
      adoption: {
        ...(plannedState.adoption ?? {}),
        status: 'applied',
        apply_status: 'applied',
      },
    };
    const verificationPlan = resolveAgentForgeActivationPlan(adoptionRoot, verificationState);

    assert.equal(verificationPlan.mode, 'adoption-verification');
    assert.equal(verificationPlan.should_continue_workflow, false);
    assert.equal(verificationPlan.current_phase, 'adoption-verification');
    assert.equal(verificationPlan.next_action, 'verify-adoption');
    assert.equal(verificationPlan.recommended_command, 'agentforge context-map --write');
    assert.deepEqual(verificationPlan.required_commands, ['agentforge context-map --write', 'agentforge validate']);
    assert.doesNotMatch(verificationPlan.required_commands.join('\n'), /agent-design/);

    const verifiedPlan = resolveAgentForgeActivationPlan(adoptionRoot, {
      ...verificationState,
      adoption: {
        ...verificationState.adoption,
        verification_status: 'verified',
      },
    });

    assert.equal(verifiedPlan.mode, 'adoption-complete');
    assert.equal(verifiedPlan.should_continue_workflow, false);
    assert.equal(verifiedPlan.current_phase, 'adoption-complete');
    assert.equal(verifiedPlan.next_action, 'ask-for-real-task');
    assert.equal(verifiedPlan.recommended_command, 'none');
    assert.deepEqual(verifiedPlan.required_commands, []);
  } finally {
    rmSync(adoptionRoot, { recursive: true, force: true });
  }

  const bootstrapRoot = mkdtempSync(join(tmpdir(), 'agentforge-activation-bootstrap-'));

  try {
    await installFixture(bootstrapRoot, { setupMode: 'bootstrap' });

    const bootstrapState = JSON.parse(readFileSync(join(bootstrapRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    const bootstrapPlan = resolveAgentForgeActivationPlan(bootstrapRoot, bootstrapState);

    assert.equal(bootstrapPlan.mode, 'phase-engine');
    assert.equal(bootstrapPlan.should_continue_workflow, true);
    assert.equal(bootstrapPlan.current_phase, 'discovery');
    assert.equal(bootstrapPlan.next_phase, 'agent-design');
    assert.ok(bootstrapPlan.required_commands.includes('agentforge handoff'));
  } finally {
    rmSync(bootstrapRoot, { recursive: true, force: true });
  }
});

test('agentforge next, handoff, and status honor adopted activation plans', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-activation-cli-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.adoption_status = 'applied';
    state.adoption = {
      ...(state.adoption ?? {}),
      status: 'applied',
      apply_status: 'applied',
    };
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const nextResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'next'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(nextResult.status, 0);
    assert.match(nextResult.stdout, /Activation mode: adoption-verification/);
    assert.match(nextResult.stdout, /Current phase: adoption-verification/);
    assert.match(nextResult.stdout, /Next phase: none/);
    assert.match(nextResult.stdout, /agentforge context-map --write/);
    assert.match(nextResult.stdout, /agentforge validate/);
    assert.doesNotMatch(nextResult.stdout, /checkpoint discovery/);
    assert.doesNotMatch(nextResult.stdout, /agent-design/);

    const handoffResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'handoff'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(handoffResult.status, 0);
    assert.match(handoffResult.stdout, /Próxima fase: adoption-verification/);
    assert.match(handoffResult.stdout, /Comando recomendado: agentforge context-map --write/);
    assert.doesNotMatch(handoffResult.stdout, /agent-design/);
    assert.doesNotMatch(handoffResult.stdout, /checkpoint discovery/);

    state.adoption.verification_status = 'verified';
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const statusResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'status', '--json'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(statusResult.status, 0);
    const payload = JSON.parse(statusResult.stdout);
    assert.equal(payload.activation_mode, 'adoption-complete');
    assert.equal(payload.current_phase, 'adoption-complete');
    assert.equal(payload.next_phase, null);
    assert.equal(payload.recommended_command, 'none');
    assert.equal(payload.next_action, 'ask-for-real-task');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install source no longer auto-runs the intelligent cycle', () => {
  const installSource = readFileSync(new URL('../lib/commands/install.js', import.meta.url), 'utf8');

  assert.doesNotMatch(installSource, /Deseja também executar o ciclo AgentForge completo agora\?/);
  assert.doesNotMatch(installSource, /advancePhase\(projectRoot,\s*\{\s*all:\s*true/);
  assert.doesNotMatch(installSource, /Fases AgentForge executadas: discovery, agent-design, flow-design, policies, export, review/);
  assert.match(installSource, /writeHandoffReport\(/);
  assert.match(installSource, /persistState:\s*false/);
});

test('managed bootloaders require local reads, npx fallback, and explicit confirmation', () => {
  const agentContent = renderManagedEntrypoint({
    entryFile: 'AGENTS.md',
    activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
  });
  const claudeContent = renderManagedEntrypoint({ entryFile: 'CLAUDE.md' });
  const cursorContent = renderManagedEntrypoint({ entryFile: '.cursor/rules/agentforge.md' });
  const copilotContent = renderManagedEntrypoint({ entryFile: '.github/copilot-instructions.md' });

  for (const content of [agentContent, claudeContent, cursorContent, copilotContent]) {
    assert.match(content, /A IA ativa deve decidir o próximo passo com julgamento contextual antes de editar arquivos reais\./);
    assert.match(content, /A pasta `\.agentforge\/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto\./);
    assert.match(content, /Leia `\.agentforge\/harness\/router\.md`, `\.agentforge\/harness\/context-index\.yaml` e `\.agentforge\/harness\/context-map\.yaml`\./);
    assert.match(content, /Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação\./);
    assert.match(content, /Não assuma Codex como o único runtime; use a IA ativa configurada no ambiente\./);
    assert.match(content, /Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento\./);
    assert.match(content, /Ao concluir, rode `agentforge checkpoint <phase> --status done` e depois `agentforge validate`\./);
    assert.doesNotMatch(content, /advance --all/);
  }
  assert.match(claudeContent, /Quando o usuário digitar `agentforge` ou usar `\/agentforge`, ative o orquestrador AgentForge\./);
  assert.match(cursorContent, /Quando o usuário usar `agentforge` ou `\/agentforge`, siga estas regras\./);
  assert.match(copilotContent, /Quando a sessão precisar de AgentForge, siga estas instruções e respeite `\/agentforge` quando aplicável\./);
});

test('install keeps review canonical and manifest/state in sync with YAML flows', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-review-flow-'));

  try {
    await installFixture(projectRoot, {
      answersOverrides: {
        initial_flows: ['feature-development', 'review'],
      },
    });

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.flows.includes('review'));
    assert.equal(state.flows.every((flowId) => existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', `${flowId}.yaml`))), true);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[`${PRODUCT.internalDir}/flows/review.yaml`]);

    const validation = validateAgentForgeStructure(projectRoot);
    assert.equal(validation.valid, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate reports one manifest error per missing harness file', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-manifest-error-'));

  try {
    await installFixture(projectRoot);

    const manifest = loadManifest(projectRoot);
    for (const relPath of MINIMUM_HARNESS_MANIFEST_PATHS) {
      delete manifest[relPath];
    }
    saveManifest(projectRoot, manifest);

    const validation = validateAgentForgeStructure(projectRoot);
    const manifestErrors = validation.errors.filter((error) => MINIMUM_HARNESS_MANIFEST_PATHS.includes(error.file));

    assert.equal(manifestErrors.length, MINIMUM_HARNESS_MANIFEST_PATHS.length);
    for (const error of manifestErrors) {
      assert.equal(error.message, 'Arquivo obrigatório existe, mas não está registrado no manifest.');
    }
    assert.equal(validation.errors.filter((error) => error.message.includes('Arquivo ausente da estrutura mínima do harness')).length, 0);
    assert.equal(validation.errors.filter((error) => error.message.includes('Manifest não registra arquivo obrigatório')).length, 0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('install defaults adoption finalization to true for adopt and hybrid modes', () => {
  assert.equal(shouldDefaultFinalizeAdoption('bootstrap'), false);
  assert.equal(shouldDefaultFinalizeAdoption('adopt'), true);
  assert.equal(shouldDefaultFinalizeAdoption('hybrid'), true);
});

test('install onboarding copy distinguishes planned and applied adoption', () => {
  const planned = buildInstallOnboardingCopy({
    setupMode: 'adopt',
    adoptionApplied: false,
    adoptionPlanPath: '.agentforge/reports/adoption-plan.md',
  });
  const applied = buildInstallOnboardingCopy({
    setupMode: 'hybrid',
    adoptionApplied: true,
    adoptionApplyPath: '.agentforge/reports/adoption-apply.md',
    deferredEntrypoints: ['AGENTS.md'],
  });
  const bootstrap = buildInstallOnboardingCopy({
    setupMode: 'bootstrap',
  });

  assert.match(planned.label, /ainda precisa ser aplicada/i);
  assert.match(planned.adoptionLine, /planejada/);
  assert.match(planned.adoptionLine, /adoption-plan\.md/);
  assert.match(planned.nextSteps.join('\n'), /agentforge adopt --apply/);

  assert.match(applied.label, /adoção agentic foi executada/i);
  assert.match(applied.adoptionLine, /aplicada/);
  assert.match(applied.adoptionLine, /adoption-apply\.md/);
  assert.match(applied.deferredLine, /Entrypoints resolvidos/);

  assert.equal(bootstrap.adoptionLine, null);
  assert.equal(bootstrap.deferredLine, null);
});

test('compile after install updates only the managed bootloader block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-managed-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const original = readFileSync(agentsPath, 'utf8');
    const mutated = original.replace(
      'Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/harness/context-map.yaml`.',
      'Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/harness/context-map.yaml`.\nLinha manual interna.',
    );
    writeFileSync(agentsPath, `${mutated}\nLinha manual externa.\n`, 'utf8');

    const result = await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => {
        throw new Error('mergeStrategyResolver should not be called for managed bootloaders.');
      },
    });

    assert.equal(result.errors.length, 0);
    assert.ok(result.written.some((entry) => String(entry).endsWith('AGENTS.md')));

    const content = readFileSync(agentsPath, 'utf8');
    assert.match(content, /Linha manual externa\./);
    assert.doesNotMatch(content, /Linha manual interna\./);
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.equal((content.match(/<!-- agentforge:end -->/g) ?? []).length, 1);
    assert.match(content, /Leia `\.agentforge\/harness\/router\.md`, `\.agentforge\/harness\/context-index\.yaml` e `\.agentforge\/harness\/context-map\.yaml`\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

for (const setupMode of ['bootstrap', 'adopt', 'hybrid']) {
  test(`install in ${setupMode} mode creates the minimum harness structure`, async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), `agentforge-install-${setupMode}-`));

    try {
      const answers = await installFixture(projectRoot, { setupMode });

      assert.equal(answers.setup_mode, setupMode);
      assertMinimumHarness(projectRoot);

      const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
      assert.equal(state.setup_mode, setupMode);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
}

test('compile warns and preserves an existing AGENTS.md without a managed block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-merge-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const manualContent = Array.from({ length: 300 }, (_, index) => `Linha manual ${index + 1}.`).join('\n');
    writeFileSync(agentsPath, `${manualContent}\n`, 'utf8');

    const result = await compileAgentForge(projectRoot);

    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes('--takeover-entrypoints')));
    const content = readFileSync(agentsPath, 'utf8');
    assert.equal(content, `${manualContent}\n`);
    assert.doesNotMatch(content, /<!-- agentforge:start -->/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.completed.includes('export'), false);
    assert.equal(state.checkpoints.export, undefined);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile --takeover-entrypoints snapshots and rewrites an existing AGENTS.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-takeover-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const legacyContent = Array.from({ length: 300 }, (_, index) => `Linha legada ${index + 1}.`).join('\n');
    writeFileSync(agentsPath, `${legacyContent}\n`, 'utf8');

    const result = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
    });

    assert.equal(result.errors.length, 0);
    assert.ok(result.preservedSnapshots.some((entry) => entry.includes('.agentforge/imports/snapshots/AGENTS.md/')));

    const content = readFileSync(agentsPath, 'utf8');
    assert.match(content, /<!-- agentforge:start -->/);
    assert.match(content, /<!-- agentforge:end -->/);
    assert.match(content, /\.agentforge\/harness\/router\.md/);
    assert.equal((content.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
    assert.ok(content.trimEnd().split(/\r?\n/).length <= 150);

    const snapshotsDir = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'AGENTS.md');
    assert.equal(existsSync(snapshotsDir), true);
    assert.ok(readdirSync(snapshotsDir).some((name) => name.endsWith('.json')));

    const rerun = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
    });
    assert.equal(rerun.errors.length, 0);
    const secondContent = readFileSync(agentsPath, 'utf8');
    assert.equal((secondContent.match(/<!-- agentforge:start -->/g) ?? []).length, 1);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate succeeds on a fresh AgentForge installation', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-ok-'));

  try {
    await installFixture(projectRoot);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md')), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when context-index.yaml points to a missing file', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-missing-context-index-'));

  try {
    await installFixture(projectRoot);

    const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
    const contextIndex = readFileSync(contextIndexPath, 'utf8').replace(
      'path: context/project-overview.md',
      'path: context/missing-project-overview.md',
    );
    writeFileSync(contextIndexPath, contextIndex, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /missing-project-overview\.md/);
    assert.match(report, /Arquivo ausente em/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when context-index.yaml is absent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-missing-context-index-file-'));

  try {
    await installFixture(projectRoot);

    rmSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /Arquivo ausente/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when state.generated_agents lists a missing agent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-state-mismatch-'));

  try {
    await installFixture(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.generated_agents = [...state.generated_agents, 'ghost-agent'];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /generated_agents/);
    assert.match(report, /ghost-agent/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when AGENTS.md is unmanaged and missing a managed block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-unmanaged-agents-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, '# Manual AGENTS\nLinha manual.\n', 'utf8');
    rmSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), { force: true });

    const manifest = loadManifest(projectRoot);
    delete manifest['AGENTS.md'];
    saveManifest(projectRoot, manifest);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: inválido/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /plan\.md diverge do workflow estruturado/);
    assert.match(report, /Arquivo unmanaged sem bloco AgentForge/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when AGENTS.md has a managed block but too much manual content outside it', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-manual-excess-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      buildManagedEntrypointContent({ manualLines: 300 }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Conteúdo manual excessivo fora do bloco AgentForge/);
    assert.match(report, /mova esse material para \.agentforge\/context ou references/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate passes when AGENTS.md is a short managed bootloader', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-short-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      renderManagedEntrypoint({
        entryFile: 'AGENTS.md',
        activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
      }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido/);
    assert.doesNotMatch(report, /Conteúdo manual excessivo/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails when AGENTS.md still contains a Reversa legacy block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-reversa-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      buildManagedEntrypointContent({
        manualLines: 20,
        includeLegacyReversaBlockInsideManagedBlock: true,
      }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Conteúdo legado Reversa detectado/);
    assert.match(report, /reversa:start|reversa:end/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate allows Reversa references outside the managed AgentForge block', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-agents-reversa-compat-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(
      agentsPath,
      `${renderManagedEntrypoint({
        entryFile: 'AGENTS.md',
        activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
      })}\nConsulte \`.reversa/legacy.md\` e \`_reversa_sdd/notes.md\`.\n`,
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido/);
    assert.doesNotMatch(report, /Conteúdo legado Reversa detectado/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate applies the same bootloader quality rules to CLAUDE.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-claude-quality-'));

  try {
    await createInstalledProjectWithClaude(projectRoot);

    const claudePath = join(projectRoot, 'CLAUDE.md');
    writeFileSync(
      claudePath,
      buildManagedEntrypointContent({ manualLines: 260 }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /CLAUDE\.md/);
    assert.match(report, /Conteúdo manual excessivo fora do bloco AgentForge/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate warns when engine-map is missing an installed engine', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-engine-warning-'));

  try {
    await installFixture(projectRoot);

    const engineMapPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'engine-map.yaml');
    const engineMap = readFileSync(engineMapPath, 'utf8').replace(
      /  codex:\n    activation: agentforge\n    slash_command: \/agentforge\n    entry_file: AGENTS\.md\n/,
      '',
    );
    writeFileSync(engineMapPath, engineMap, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md'), 'utf8');
    assert.match(report, /Status: válido com avisos/);
    assert.match(report, /Avisos/);
    assert.match(report, /codex/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('commands lists the full registry and emits valid json', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-commands-'));

  try {
    await installFixture(projectRoot);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'commands'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\bnext\b/);
    assert.match(result.stdout, /\banalyze\b/);
    assert.match(result.stdout, /\bresearch-patterns\b/);
    assert.match(result.stdout, /\bsuggest-agents\b/);
    assert.match(result.stdout, /\bcreate-agent\b/);
    assert.match(result.stdout, /\bapply-suggestions\b/);
    assert.match(result.stdout, /\bhandoff\b/);
    assert.match(result.stdout, /\bcheckpoint\b/);

  const advanceEntry = COMMAND_REGISTRY.find((entry) => entry.id === 'advance');
  assert.ok(advanceEntry);
  assert.deepEqual(advanceEntry.writes, ['.agentforge/reports/advance.md']);
  const handoffEntry = COMMAND_REGISTRY.find((entry) => entry.id === 'handoff');
  assert.ok(handoffEntry);
  assert.deepEqual(handoffEntry.writes, ['.agentforge/reports/handoff.md']);
  const codexPlanEntry = COMMAND_REGISTRY.find((entry) => entry.id === 'codex-plan');
  assert.ok(codexPlanEntry);
  assert.equal(codexPlanEntry.status, 'deprecated');

  const jsonResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'commands', '--json'], {
    cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(jsonResult.status, 0);
    const payload = JSON.parse(jsonResult.stdout);
    assert.equal(Array.isArray(payload.commands), true);
    assert.deepEqual(
      payload.commands.map((entry) => entry.id),
      COMMAND_REGISTRY.map((entry) => entry.id),
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge phases, next, phase-status, advance, handoff, and checkpoint expose the phase engine', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-advance-all-'));

  try {
    await installFixture(projectRoot);

    const phasesResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'phases'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(phasesResult.status, 0);
    assert.match(phasesResult.stdout, /AgentForge phases/);
    assert.match(phasesResult.stdout, /- discovery \(Discovery\)/);
    assert.match(phasesResult.stdout, /- review \(Review\)/);
    assert.match(phasesResult.stdout, /Current phase: discovery/);
    assert.match(phasesResult.stdout, /Next phase: agent-design/);

    const nextResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'next'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(nextResult.status, 0);
    assert.match(nextResult.stdout, /Current phase: discovery/);
    assert.match(nextResult.stdout, /Next phase: agent-design/);
    assert.match(nextResult.stdout, /context\/project-overview\.md tem placeholders/);
    assert.match(nextResult.stdout, /context\/architecture\.md tem placeholders/);
    assert.match(nextResult.stdout, /agentforge handoff/);
    assert.match(nextResult.stdout, /agentforge checkpoint discovery --status done/);
    assert.match(nextResult.stdout, /agentforge validate/);

    const phaseStatusResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'phase-status'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(phaseStatusResult.status, 0);
    assert.match(phaseStatusResult.stdout, /Phase\s+Status\s+Checks/);
    assert.match(phaseStatusResult.stdout, /discovery\s+pending\s+2 checks/);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const planPath = join(projectRoot, PRODUCT.internalDir, 'plan.md');
    const trackedPaths = [
      join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'),
      join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml'),
      join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml'),
      join(projectRoot, PRODUCT.internalDir, 'policies', 'protected-files.yaml'),
      join(projectRoot, 'AGENTS.md'),
    ].filter((path) => existsSync(path));
    const stateBefore = readFileSync(statePath, 'utf8');
    const planBefore = readFileSync(planPath, 'utf8');
    const trackedBefore = new Map(trackedPaths.map((path) => [path, readFileSync(path, 'utf8')]));

    const advanceResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'advance'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(advanceResult.status, 0);
    assert.match(advanceResult.stdout, /sequência planejada/i);

    assert.equal(readFileSync(statePath, 'utf8'), stateBefore);
    assert.equal(readFileSync(planPath, 'utf8'), planBefore);
    for (const [path, content] of trackedBefore.entries()) {
      assert.equal(readFileSync(path, 'utf8'), content);
    }
    assert.ok(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md')));
    assert.match(readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md'), 'utf8'), /Phases planned/);

    const validation = validateAgentForgeStructure(projectRoot);
    assert.equal(validation.valid, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge advance --all only plans the workflow and warns', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-advance-all-'));

  try {
    await installFixture(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const trackedPaths = [
      join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'),
      join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml'),
      join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml'),
      join(projectRoot, PRODUCT.internalDir, 'policies', 'protected-files.yaml'),
      join(projectRoot, 'AGENTS.md'),
    ].filter((path) => existsSync(path));
    const stateBefore = readFileSync(statePath, 'utf8');
    const trackedBefore = new Map(trackedPaths.map((path) => [path, readFileSync(path, 'utf8')]));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'advance', '--all'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /advance --all não executa fases inteligentes/i);
    assert.match(result.stdout, /sequência planejada/i);
    assert.match(result.stdout, /agent-design/);
    assert.match(result.stdout, /review/);
    assert.equal(readFileSync(statePath, 'utf8'), stateBefore);
    for (const [path, content] of trackedBefore.entries()) {
      assert.equal(readFileSync(path, 'utf8'), content);
    }
    assert.ok(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md')));

    const validation = validateAgentForgeStructure(projectRoot);
    assert.equal(validation.valid, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge checkpoint updates state, plan, history, and report without smart artifacts', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-checkpoint-'));

  try {
    await installFixture(projectRoot);

    const projectOverviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    const architecturePath = join(projectRoot, PRODUCT.internalDir, 'context', 'architecture.md');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'context'), { recursive: true });
    writeFileSync(projectOverviewPath, [
      '# Project Overview',
      '',
      'Projeto preparado para a fase discovery.',
      '',
      '## Scope',
      '',
      'Validar contexto, stack e objetivos.',
    ].join('\n'), 'utf8');
    writeFileSync(architecturePath, [
      '# Architecture',
      '',
      '## Summary',
      '',
      'Arquitetura inicial documentada para checkpoint.',
    ].join('\n'), 'utf8');

    const agentsPath = join(projectRoot, PRODUCT.internalDir, 'agents', 'orchestrator.yaml');
    const flowsPath = join(projectRoot, PRODUCT.internalDir, 'flows', 'feature-development.yaml');
    const policiesPath = join(projectRoot, PRODUCT.internalDir, 'policies', 'protected-files.yaml');
    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const planPath = join(projectRoot, PRODUCT.internalDir, 'plan.md');
    const historyPath = join(projectRoot, PRODUCT.internalDir, 'workflow', 'history.jsonl');
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'checkpoint.md');

    const before = {
      state: readFileSync(statePath, 'utf8'),
      plan: readFileSync(planPath, 'utf8'),
      history: readFileSync(historyPath, 'utf8'),
      contextOverview: readFileSync(projectOverviewPath, 'utf8'),
      architecture: readFileSync(architecturePath, 'utf8'),
      agents: readFileSync(agentsPath, 'utf8'),
      flows: readFileSync(flowsPath, 'utf8'),
      policies: readFileSync(policiesPath, 'utf8'),
    };

    const dryRun = spawnSync(process.execPath, [
      AGENTFORGE_BIN,
      'checkpoint',
      'discovery',
      '--status',
      'done',
      '--dry-run',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(dryRun.status, 0);
    assert.match(dryRun.stdout, /Checkpoint simulado/);
    assert.equal(readFileSync(statePath, 'utf8'), before.state);

    const result = spawnSync(process.execPath, [
      AGENTFORGE_BIN,
      'checkpoint',
      'discovery',
      '--status',
      'done',
      '--reason',
      'prepared',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Checkpoint registrado: discovery -> done/);

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.workflow.current_phase, 'agent-design');
    assert.ok(state.workflow.completed_phases.includes('discovery'));
    assert.ok(state.workflow.pending_phases.includes('export'));
    assert.match(readFileSync(reportPath, 'utf8'), /AgentForge Checkpoint Report/);
    assert.notEqual(readFileSync(planPath, 'utf8'), before.plan);
    assert.match(readFileSync(historyPath, 'utf8'), /"from":"discovery"/);
    assert.match(readFileSync(historyPath, 'utf8'), /"to":"agent-design"/);
    assert.match(readFileSync(historyPath, 'utf8'), /"command":"checkpoint discovery --status done --reason \\"prepared\\""/);
    assert.equal(readFileSync(projectOverviewPath, 'utf8'), before.contextOverview);
    assert.equal(readFileSync(architecturePath, 'utf8'), before.architecture);
    assert.equal(readFileSync(agentsPath, 'utf8'), before.agents);
    assert.equal(readFileSync(flowsPath, 'utf8'), before.flows);
    assert.equal(readFileSync(policiesPath, 'utf8'), before.policies);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[`${PRODUCT.internalDir}/reports/checkpoint.md`]);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('next detects plan/state divergence and status repair fills missing pending phases', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-next-'));

  try {
    await installFixture(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const planPath = join(projectRoot, PRODUCT.internalDir, 'plan.md');

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.phase = 'review';
    state.completed = ['discovery', 'agent-design', 'flow-design', 'policies', 'review'];
    state.pending = [];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    let plan = readFileSync(planPath, 'utf8');
    for (const regex of [
      /## Fase 1 — Discovery[\s\S]*?(?=## Fase 2 — Agent Design)/,
      /## Fase 2 — Agent Design[\s\S]*?(?=## Fase 3 — Flow Design)/,
      /## Fase 3 — Flow Design[\s\S]*?(?=## Fase 4 — Policies)/,
      /## Fase 4 — Policies[\s\S]*?(?=## Fase 5 — Export)/,
      /## Fase 6 — Review[\s\S]*$/,
    ]) {
      plan = plan.replace(regex, (section) => section.replace(/- \[ \]/g, '- [x]'));
    }
    writeFileSync(planPath, plan, 'utf8');

    const nextResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'next'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(nextResult.status, 0);
    assert.match(nextResult.stdout, /Current phase: review/);
    assert.match(nextResult.stdout, /Next phase: none/);
    assert.match(nextResult.stdout, /Pending checks:\n- ok/);
    assert.match(nextResult.stdout, /agentforge handoff/);
    assert.match(nextResult.stdout, /agentforge validate/);

    const statusResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'status', '--repair'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(statusResult.status, 0);
    assert.match(statusResult.stdout, /Repair applied to state\.json\./);
    const repairedState = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.ok(repairedState.pending.includes('export'));

    const statusJsonResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'status', '--json'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(statusJsonResult.status, 0);
    const statusPayload = JSON.parse(statusJsonResult.stdout);
    assert.equal(statusPayload.next_phase, null);
    assert.equal(statusPayload.repair_applied, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate fails on plan/state divergence and invalid state json', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-validate-plan-state-'));

  try {
    await installFixture(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const planPath = join(projectRoot, PRODUCT.internalDir, 'plan.md');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.phase = 'review';
    state.completed = ['discovery', 'agent-design', 'flow-design', 'policies', 'review'];
    state.pending = [];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    let plan = readFileSync(planPath, 'utf8');
    for (const regex of [
      /## Fase 1 — Discovery[\s\S]*?(?=## Fase 2 — Agent Design)/,
      /## Fase 2 — Agent Design[\s\S]*?(?=## Fase 3 — Flow Design)/,
      /## Fase 3 — Flow Design[\s\S]*?(?=## Fase 4 — Policies)/,
      /## Fase 4 — Policies[\s\S]*?(?=## Fase 5 — Export)/,
      /## Fase 6 — Review[\s\S]*$/,
    ]) {
      plan = plan.replace(regex, (section) => section.replace(/- \[ \]/g, '- [x]'));
    }
    writeFileSync(planPath, plan, 'utf8');

    const validation = validateAgentForgeStructure(projectRoot);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((entry) => entry.message.includes('plan.md diverge do workflow estruturado.')));
    assert.ok(validation.errors.some((entry) => entry.message.includes('A fase concluída "discovery" não cumpre os checks requeridos.')));

    writeFileSync(statePath, '{ invalid json', 'utf8');
    const invalidValidation = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(invalidValidation.status, 1);
    assert.match(invalidValidation.stdout, /validação encontrou/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ingest snapshots AGENTS.md and CLAUDE.md without modifying the originals', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-ingest-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const claudePath = join(projectRoot, 'CLAUDE.md');
    writeFileSync(claudePath, '# Claude Instructions\nUse this file only for tests.\n', 'utf8');

    const agentsBefore = readFileSync(agentsPath, 'utf8');
    const claudeBefore = readFileSync(claudePath, 'utf8');

    const first = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(first.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'imports', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'ingest.md')), true);

    const stateAfterFirst = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(stateAfterFirst.last_ingest_at.length > 0, true);
    assert.equal(stateAfterFirst.ingest_count, 1);
    assert.equal(stateAfterFirst.imported_sources.length, 2);
    assert.ok(stateAfterFirst.imported_sources.some((item) => item.source_path === 'AGENTS.md' && item.source_type === 'codex-entrypoint'));
    assert.ok(stateAfterFirst.imported_sources.some((item) => item.source_path === 'CLAUDE.md' && item.source_type === 'claude-entrypoint'));

    for (const item of stateAfterFirst.imported_sources) {
      assert.equal(existsSync(join(projectRoot, item.snapshot_path)), true);
    }

    const manifestAfterFirst = loadManifest(projectRoot);
    assert.ok(manifestAfterFirst['.agentforge/imports/README.md']);
    assert.ok(manifestAfterFirst['.agentforge/reports/ingest.md']);
    for (const item of stateAfterFirst.imported_sources) {
      assert.ok(manifestAfterFirst[item.snapshot_path]);
    }

    assert.equal(readFileSync(agentsPath, 'utf8'), agentsBefore);
    assert.equal(readFileSync(claudePath, 'utf8'), claudeBefore);

    const second = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(second.status, 0);
    const stateAfterSecond = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(stateAfterSecond.ingest_count, 2);
    assert.equal(stateAfterSecond.imported_sources.length, 2);
    assert.equal(
      stateAfterSecond.imported_sources.every((item) => stateAfterFirst.imported_sources.some((previous) => previous.source_path === item.source_path && previous.source_hash === item.source_hash)),
      true,
    );

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'ingest.md'), 'utf8');
    assert.match(report, /AgentForge Ingest Report/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /CLAUDE\.md/);
    assert.match(report, /agentforge audit-context/);
    assert.match(report, /snapshot já importado com o mesmo hash/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ingest and refactor legacy .agents references into canonical files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-legacy-agents-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    mkdirSync(join(projectRoot, '.agents', 'references'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'references', 'domain.md'),
      [
        '# Domain Reference',
        '',
        'Termo principal: explica o vocabulário estável do produto.',
        '',
        '- Link canônico: https://example.com/domain',
        '- Consulte sempre esta lista antes de mudar regras de negócio.',
        '',
      ].join('\n'),
      'utf8',
    );

    const ingestResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'ingest'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(ingestResult.status, 0);
    const legacyReportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'legacy-agents-import.md');
    assert.equal(existsSync(legacyReportPath), true);

    const legacyReport = readFileSync(legacyReportPath, 'utf8');
    assert.match(legacyReport, /\.agents\/references\/domain\.md/);
    assert.match(legacyReport, /legacy-reference/);

    const snapshotDir = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', '.agents', 'references', 'domain.md');
    assert.equal(existsSync(snapshotDir), true);
    assert.ok(readdirSync(snapshotDir).some((name) => name.endsWith('.json')));

    const stateAfterIngest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(stateAfterIngest.imported_sources.some((item) => item.source_path === '.agents/references/domain.md' && item.source_type === 'legacy-reference'));

    const refactorResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'refactor-context', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(refactorResult.status, 0);

    const canonicalTargets = [
      join(projectRoot, PRODUCT.internalDir, 'references', 'domain.md'),
      join(projectRoot, PRODUCT.internalDir, 'context', 'domain.md'),
    ];
    const canonicalTarget = canonicalTargets.find((filePath) => existsSync(filePath));
    assert.ok(canonicalTarget, 'expected a canonical domain file to be created');

    const canonicalContent = readFileSync(canonicalTarget, 'utf8');
    assert.match(canonicalContent, /Domain Reference|Domain/);
    assert.match(canonicalContent, /\.agents\/references\/domain\.md/);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, canonicalTarget.includes('/references/domain.md') ? /references\/domain\.md/ : /context\/domain\.md/);

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /\.agentforge\/harness\/router\.md/);
    assert.doesNotMatch(agentsEntry, /\.agents\//);

    const validateResult = spawnSync(process.execPath, [AGENTFORGE_BIN, 'validate'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(validateResult.status, 0);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt --apply tracks entrypoints in the manifest and compile can finalize takeover', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-agentic-surface-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      [
        '# Legacy Agent Instructions',
        '',
        '## Overview',
        '',
        'Billing app for small teams.',
        '',
        '## Commands',
        '',
        '- Use `npx eslint .` before shipping.',
        '',
        '## Safety',
        '',
        '- Do not modify protected files without approval.',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(projectRoot, 'CLAUDE.md'),
      [
        '# Legacy Claude Notes',
        '',
        '## Workflow',
        '',
        '1. Inspect the context.',
        '2. Preserve the agentic surface.',
        '3. Review the results.',
        '',
      ].join('\n'),
      'utf8',
    );

    mkdirSync(join(projectRoot, '.agents', 'skills', 'foo'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'skills', 'foo', 'SKILL.md'),
      [
        '---',
        'name: foo',
        'license: MIT',
        '---',
        '',
        '# Foo',
        '',
        '## Quando usar',
        '',
        'Quando precisar de uma skill de teste.',
        '',
        '## Procedimento',
        '',
        '1. Fazer algo.',
        '',
        '## Checklist',
        '',
        '- item',
        '',
        '## Saída esperada',
        '',
        '- resultado',
        '',
        '## Limites de segurança',
        '',
        '- nenhum',
        '',
        '## Evidências de origem',
        '',
        '- origem',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, '.agents', 'context'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'context', 'domain.md'),
      [
        '# Domain Notes',
        '',
        'Stable domain guidance that should land in canonical context.',
        '',
      ].join('\n'),
      'utf8',
    );

    const manualOverviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(
      manualOverviewPath,
      `${readFileSync(manualOverviewPath, 'utf8').trimEnd()}\n\nManual keep.\n`,
      'utf8',
    );

    const adoptResult = await runAdoptApply(projectRoot);
    assert.equal(adoptResult.ok, true);
    assert.ok(adoptResult.entrypoints.includes('AGENTS.md'));
    assert.ok(adoptResult.entrypoints.includes('CLAUDE.md'));

    const stateAfterApply = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    finalizeAdoptionWorkflow(projectRoot, stateAfterApply, {
      validationResult: adoptResult.validationResult,
      adoptionApplyPath: adoptResult.reportPath,
    });

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['AGENTS.md']);
    assert.ok(manifest['CLAUDE.md']);
    assert.ok(manifest['.agentforge/skills/foo/SKILL.md']);
    assert.ok(manifest['.agentforge/harness/context-index.yaml']);
    assert.ok(manifest['.agentforge/harness/context-map.yaml']);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'foo', 'SKILL.md')), true);
    assert.match(readFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'foo', 'SKILL.md'), 'utf8'), /## Quando usar/);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, /skills\/foo\/SKILL\.md/);

    const contextMap = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml'), 'utf8');
    assert.match(contextMap, /context\/domain\.md/);

    const finalOverview = readFileSync(manualOverviewPath, 'utf8');
    assert.match(finalOverview, /Manual keep\./);

    const applyReport = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md'), 'utf8');
    assert.match(applyReport, /AGENTS\.md/);
    assert.match(applyReport, /CLAUDE\.md/);
    assert.match(applyReport, /Final takeover of existing entrypoints/);

    const finalState = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(finalState.adoption_status, 'applied');
    assert.equal(finalState.adoption?.verification_status, 'verified');
    assert.equal(finalState.workflow.current_phase, 'review');
    assert.deepEqual(finalState.workflow.completed_phases, [
      'agent-design',
      'flow-design',
      'policies',
      'export',
    ]);
    assert.deepEqual(finalState.workflow.pending_phases, ['review']);

    const mutateManagedEntrypoint = (relPath, internalLine, externalLine) => {
      const entryPath = join(projectRoot, relPath);
      const original = readFileSync(entryPath, 'utf8');
      const mutated = original.replace(
        '<!-- agentforge:end -->',
        `Linha manual interna: ${internalLine}\n<!-- agentforge:end -->`,
      );
      writeFileSync(entryPath, `${mutated}\n${externalLine}\n`, 'utf8');
    };
    mutateManagedEntrypoint('AGENTS.md', 'AGENTS', 'Linha manual externa: AGENTS.');
    mutateManagedEntrypoint('CLAUDE.md', 'CLAUDE', 'Linha manual externa: CLAUDE.');

    const compileResult = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
      includeExistingEntrypoints: true,
      mergeStrategyResolver: async () => 'merge',
    });

    assert.equal(compileResult.errors.length, 0);
    assert.ok(compileResult.written.some((entry) => String(entry).endsWith('AGENTS.md')));
    assert.ok(compileResult.written.some((entry) => String(entry).endsWith('CLAUDE.md')));

    const snapshotRoot = join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'AGENTS.md');
    assert.equal(existsSync(snapshotRoot), true);
    assert.ok(readdirSync(snapshotRoot).some((name) => name.endsWith('.json')));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt --apply migrates a legacy skill and refreshes the context index', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-apply-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      [
        '# Legacy Agent Instructions',
        '',
        'Use this file only for adoption testing.',
        '',
      ].join('\n'),
      'utf8',
    );

    mkdirSync(join(projectRoot, '.agents', 'skills', 'foo'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'skills', 'foo', 'SKILL.md'),
      [
        '# Foo Skill',
        '',
        '## When to use',
        '',
        'Use this skill when a task needs the foo workflow.',
        '',
      ].join('\n'),
      'utf8',
    );

    mkdirSync(join(projectRoot, '.agents', 'context'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'context', 'domain.md'),
      [
        '# Domain Notes',
        '',
        'Stable domain guidance that should land in canonical context.',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'foo', 'SKILL.md')), true);
    assert.match(readFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'foo', 'SKILL.md'), 'utf8'), /Foo Skill/);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, /skills\/foo\/SKILL\.md/);

    const contextMap = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml'), 'utf8');
    assert.match(contextMap, /context\/domain\.md/);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/skills/foo/SKILL.md']);
    assert.ok(manifest['.agentforge/harness/context-index.yaml']);
    assert.ok(manifest['.agentforge/harness/context-map.yaml']);
    assert.ok(Object.keys(manifest).some((relPath) => relPath.startsWith('.agentforge/imports/snapshots/AGENTS.md/')));

    const adoptionApplyReport = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md'), 'utf8');
    assert.match(adoptionApplyReport, /skills\/foo\/SKILL\.md/);
    assert.match(adoptionApplyReport, /AGENTS\.md/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.adoption_status, 'applied');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('compile warns when the minimum harness is absent', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-compile-missing-harness-'));

  try {
    await installFixture(projectRoot, { setupMode: 'adopt' });

    rmSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'compile', '--force'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /AgentForge compile encontrou 1 erro\(s\)\./);
    assert.match(result.stdout, /context-index\.yaml/);
    assert.match(result.stdout, /Relatório gerado em .*compile\.md/);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'compile.md'), 'utf8');
    assert.match(report, /context-index\.yaml/);
    assert.match(report, /Arquivo ausente da estrutura mínima do harness/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('bootstrap populates human-readable context and fills inferred project signals', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-bootstrap-'));

  try {
    await installFixture(projectRoot);

    writeFileSync(
      join(projectRoot, 'package.json'),
      `${JSON.stringify({
        name: 'agentforge-demo-app',
        private: true,
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          dev: 'next dev',
        },
        devDependencies: {
          typescript: '^5.5.0',
        },
      }, null, 2)}\n`,
      'utf8',
    );
    writeFileSync(
      join(projectRoot, 'README.md'),
      [
        '# AgentForge Demo App',
        '',
        '## Objective',
        '',
        'Track orders and surface operational status for the support team.',
        '',
        '## Audience',
        '',
        'Support engineers and operators.',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const ping = () => "pong";\n', 'utf8');

    const result = spawnSync(process.execPath, [
      AGENTFORGE_BIN,
      'bootstrap',
      '--primary-goals',
      'develop-features,review-prs',
      '--preferred-workflow',
      'feature-development',
      '--quality-level',
      'strict',
      '--engines',
      'codex,claude-code',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.last_bootstrap_at);
    assert.deepEqual(state.primary_goals, ['develop-features', 'review-prs']);
    assert.equal(state.preferred_workflow, 'feature-development');
    assert.equal(state.quality_level, 'strict');

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'bootstrap.md');
    assert.equal(existsSync(reportPath), true);
    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Bootstrap Report/);
    assert.match(report, /Files written/);

    const overview = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md'), 'utf8');
    assert.match(overview, /AgentForge Demo App|AgentForge Demo/);
    assert.match(overview, /Track orders and surface operational status/);
    assert.doesNotMatch(overview, /<nome do projeto>|A preencher/);

    const commands = readFileSync(join(projectRoot, PRODUCT.internalDir, 'references', 'commands.md'), 'utf8');
    assert.match(commands, /`install`/);
    assert.match(commands, /`analyze`/);
    assert.match(commands, /`research-patterns`/);
    assert.match(commands, /`suggest-agents`/);
    assert.match(commands, /`create-agent`/);
    assert.match(commands, /`apply-suggestions`/);
    assert.match(commands, /`status`/);
    assert.match(commands, /`next`/);
    assert.match(commands, /`validate`/);
    assert.match(commands, /`commands`/);
    assert.match(commands, /npx @bcocheto\/agentforge commands/);
    assert.match(commands, /npx @bcocheto\/agentforge validate/);
    assert.match(commands, /npx @bcocheto\/agentforge compile/);
    assert.match(commands, /npx @bcocheto\/agentforge analyze/);

    const architecture = readFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'architecture.md'), 'utf8');
    assert.match(architecture, /src\//);

    const contextIndex = readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8');
    assert.match(contextIndex, /bootstrap:/);
    assert.match(contextIndex, /quality_level: strict/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('improve generates a useful report without applying changes', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-report-'));

  try {
    await installFixture(projectRoot);

    const hugePath = join(projectRoot, PRODUCT.internalDir, 'context', 'oversized.md');
    writeFileSync(
      hugePath,
      Array.from({ length: 260 }, (_, index) => `Linha ${index + 1}`).join('\n'),
      'utf8',
    );
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'duplicate-a.md'), 'Conteúdo duplicado.\n', 'utf8');
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'context', 'duplicate-b.md'), 'Conteúdo duplicado.\n', 'utf8');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'SKILL.md'),
      ['---', 'name: mystery', 'license: MIT', '---', '', '# Mystery', ''].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
    assert.equal(existsSync(reportPath), true);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /Improvement Plan/);
    assert.match(report, /Arquivos muito grandes/);
    assert.match(report, /oversized\.md/);
    assert.match(report, /Pastas sem README/);
    assert.match(report, /agents/);
    assert.match(report, /Conteúdo duplicado/);
    assert.match(report, /duplicate-a\.md/);
    assert.match(report, /Skills sem trigger claro/);
    assert.match(report, /skills\/mystery\/SKILL\.md/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'README.md')), false);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/improvement-plan.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('improve --apply creates only safe documentation placeholders', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-apply-'));

  try {
    await installFixture(projectRoot);

    const overviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(overviewPath, `${readFileSync(overviewPath, 'utf8')}\nLinha manual preservada.\n`, 'utf8');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'SKILL.md'),
      ['---', 'name: mystery', 'license: MIT', '---', '', '# Mystery', ''].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'subagents', 'README.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'mystery', 'README.md')), true);
    assert.match(readFileSync(overviewPath, 'utf8'), /Linha manual preservada\./);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md')), true);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/agents/README.md']);
    assert.ok(manifest['.agentforge/subagents/README.md']);
    assert.ok(manifest['.agentforge/skills/mystery/README.md']);
    assert.ok(manifest['.agentforge/reports/improvement-plan.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt generates a read-only adoption plan for agentic surface files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-'));

  try {
    await installFixture(projectRoot);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const claudePath = join(projectRoot, 'CLAUDE.md');
    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const manifestPath = join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json');

    writeFileSync(
      agentsPath,
      [
        '# Legacy Agent Instructions',
        '',
        '## Overview',
        '',
        'Billing app for small teams.',
        '',
        '## Safety',
        '',
        '- Do not modify protected files without approval.',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      claudePath,
      [
        '# Claude Notes',
        '',
        '## Workflow',
        '',
        '1. Inspect the context.',
        '2. Refactor the legacy surface.',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, '.agents', 'skills', 'foo'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.agents', 'skills', 'foo', 'SKILL.md'),
      [
        '---',
        'name: foo',
        'license: MIT',
        '---',
        '',
        '# Foo',
        '',
        '## Quando usar',
        '',
        'Quando precisar de uma skill de teste.',
        '',
        '## Procedimento',
        '',
        '1. Fazer algo.',
        '',
        '## Checklist',
        '',
        '- item',
        '',
        '## Saída esperada',
        '',
        '- resultado',
        '',
        '## Limites de segurança',
        '',
        '- nenhum',
        '',
        '## Evidências de origem',
        '',
        '- origem',
        '',
      ].join('\n'),
      'utf8',
    );
    mkdirSync(join(projectRoot, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(projectRoot, '.claude', 'agents', 'legacy.md'), '# Claude Agent\nUse this file only for tests.\n', 'utf8');
    mkdirSync(join(projectRoot, '.github', 'agents'), { recursive: true });
    writeFileSync(join(projectRoot, '.github', 'agents', 'bot.md'), '# GitHub Agent\nUse this file only for tests.\n', 'utf8');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'legacy'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'imports', 'snapshots', 'legacy', 'snapshot.json'),
      `${JSON.stringify({
        source_path: '.agents/legacy/notes.md',
        source_type: 'legacy-agentic-doc',
        source_hash: 'abc123',
        content: 'Legacy memory snapshot.',
      }, null, 2)}\n`,
      'utf8',
    );

    const stateBefore = readFileSync(statePath, 'utf8');
    const manifestBefore = readFileSync(manifestPath, 'utf8');
    const agentsBefore = readFileSync(agentsPath, 'utf8');
    const claudeBefore = readFileSync(claudePath, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
    assert.equal(existsSync(reportPath), true);
    assert.equal(readFileSync(statePath, 'utf8'), stateBefore);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifestBefore);
    assert.equal(readFileSync(agentsPath, 'utf8'), agentsBefore);
    assert.equal(readFileSync(claudePath, 'utf8'), claudeBefore);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /AgentForge Adoption Plan/);
    assert.match(report, /Total agentic surface files:/);
    assert.match(report, /Classification/);
    assert.match(report, /AGENTS\.md/);
    assert.match(report, /CLAUDE\.md/);
    assert.match(report, /\.agents\/skills\/foo\/SKILL\.md/);
    assert.match(report, /\.claude\/agents\/legacy\.md/);
    assert.match(report, /\.github\/agents\/bot\.md/);
    assert.match(report, /\.agentforge\/imports\/snapshots\/legacy\/snapshot\.json/);
    assert.match(report, /entrypoint/);
    assert.match(report, /skill/);
    assert.match(report, /agent/);
    assert.match(report, /memory/);
    assert.match(report, /What will be migrated/);
    assert.match(report, /What will be preserved/);
    assert.match(report, /What will be ignored/);
    assert.match(report, /What requires human review/);
    assert.match(report, /No files outside `\.agentforge\/reports\/` and `\.agentforge\/suggestions\/` were modified\./);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'adoption-agentic-surface.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'context', 'adoption-agentic-surface.yaml')), true);

    const suggestions = readFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'adoption-agentic-surface.yaml'), 'utf8');
    assert.match(suggestions, /foo/);
    assert.match(suggestions, /skill/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('adopt remains read-only when no agentic files are present', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-empty-'));

  try {
    await installFixture(projectRoot);
    rmSync(join(projectRoot, 'AGENTS.md'), { force: true });
    rmSync(join(projectRoot, 'CLAUDE.md'), { force: true });

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const manifestPath = join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json');
    const stateBefore = readFileSync(statePath, 'utf8');
    const manifestBefore = readFileSync(manifestPath, 'utf8');

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'adopt'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(readFileSync(statePath, 'utf8'), stateBefore);
    assert.equal(readFileSync(manifestPath, 'utf8'), manifestBefore);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md'), 'utf8');
    assert.match(report, /Total agentic surface files: 0/);
    assert.match(report, /No migration candidates were identified\./);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('manifest includes generated AgentForge files', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-manifest-'));

  try {
    await installFixture(projectRoot);
    await compileAgentForge(projectRoot, {
      mergeStrategyResolver: async () => 'merge',
    });

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/state.json']);
    assert.ok(manifest['.agentforge/agents/orchestrator.yaml']);
    assert.ok(manifest['.agentforge/flows/feature-development.yaml']);
    assert.ok(manifest['AGENTS.md']);
    for (const relPath of MINIMUM_HARNESS_MANIFEST_PATHS) {
      assert.ok(manifest[relPath], `${relPath} should be tracked in the manifest`);
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('mergeUpdateManifest preserves modified entries', () => {
  const existingManifest = {
    'AGENTS.md': 'old-agents-hash',
    '.agentforge/agents/orchestrator.yaml': 'old-orchestrator-hash',
    '.agentforge/agents/legacy.yaml': 'legacy-hash',
  };

  const result = mergeUpdateManifest(
    existingManifest,
    ['.agentforge/agents/orchestrator.yaml'],
    ['AGENTS.md'],
    {
      '.agentforge/agents/orchestrator.yaml': 'new-orchestrator-hash',
      '.agentforge/agents/architect.yaml': 'new-architect-hash',
    },
  );

  assert.equal(result['AGENTS.md'], 'old-agents-hash');
  assert.equal(result['.agentforge/agents/orchestrator.yaml'], 'new-orchestrator-hash');
  assert.equal(result['.agentforge/agents/architect.yaml'], 'new-architect-hash');
  assert.equal(result['.agentforge/agents/legacy.yaml'], undefined);
});

test('uninstall preserves modified files and can keep the output folder', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-uninstall-'));

  try {
    await installFixture(projectRoot, { engines: ['codex', 'claude-code', 'cursor', 'github-copilot'], exportTargets: true });

    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, `${readFileSync(agentsPath, 'utf8')}\nLinha manual.\n`, 'utf8');

    mkdirSync(join(projectRoot, PRODUCT.outputDir), { recursive: true });
    writeFileSync(join(projectRoot, PRODUCT.outputDir, 'notes.md'), '# Output\n', 'utf8');

    const prompts = [
      { confirmed: 'remove' },
      { removeOutput: false },
    ];

    const result = await runUninstall(projectRoot, {
      prompt: async () => prompts.shift(),
    });

    assert.equal(result.errors, 0);
    assert.equal(existsSync(agentsPath), true);
    assert.match(readFileSync(agentsPath, 'utf8'), /Linha manual\./);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.outputDir)), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('detectEngines still recognizes Codex when AGENTS.md is present', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-detect-'));

  try {
    const codexEntry = join(projectRoot, 'AGENTS.md');
    writeFileSync(codexEntry, '# AgentForge\n', 'utf8');

    const engines = detectEngines(projectRoot);
    const codex = engines.find((entry) => entry.id === 'codex');

    assert.ok(codex);
    assert.equal(codex.detected, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('legacy installations without setup_mode default to bootstrap', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-legacy-mode-'));

  try {
    mkdirSync(join(projectRoot, PRODUCT.internalDir), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'state.json'),
      JSON.stringify({
        version: '1.0.0',
        project: 'Legacy Project',
        user_name: 'Ana',
        project_type: 'API',
        stack: 'Node.js',
        objective: 'develop-features',
        engines: ['codex'],
        internal_agents: ['orchestrator'],
        generated_agents: ['orchestrator'],
        generated_subagents: [],
        flows: ['feature-development'],
        output_folder: '_agentforge',
        created_files: [],
        checkpoints: {},
      }, null, 2),
      'utf8',
    );

    const existing = checkExistingInstallation(projectRoot);
    assert.equal(existing.installed, true);
    assert.equal(existing.state.setup_mode, 'bootstrap');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
