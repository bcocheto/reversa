import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

import { buildContextPack } from './context-pack.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadPhaseDefinition, getNextPhase } from './phase-engine.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readYamlText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseArgs(args = []) {
  const engineIndex = args.indexOf('--engine');
  const phaseIndex = args.indexOf('--phase');
  const modeIndex = args.indexOf('--mode');
  const taskIndex = args.indexOf('--task');
  return {
    json: args.includes('--json'),
    engine: engineIndex !== -1 ? normalizeString(args[engineIndex + 1]) : '',
    phase: phaseIndex !== -1 ? normalizeString(args[phaseIndex + 1]) : '',
    mode: modeIndex !== -1 ? normalizeString(args[modeIndex + 1]) : '',
    task: taskIndex !== -1 ? normalizeString(args[taskIndex + 1]) : '',
  };
}

function engineInstructions(engine) {
  const normalized = normalizeString(engine).toLowerCase();
  if (normalized === 'codex') {
    return 'Abra Codex e digite `agentforge`.';
  }
  if (normalized === 'claude' || normalized === 'claude-code' || normalized === 'claude cli') {
    return 'Abra Claude Code/CLI e digite `agentforge` ou `/agentforge`, conforme disponível.';
  }
  if (normalized === 'gemini' || normalized === 'gemini-cli') {
    return 'Abra Gemini CLI e digite `agentforge`.';
  }
  if (normalized === 'cursor') {
    return 'Use as rules geradas e peça `agentforge`.';
  }
  if (normalized === 'copilot' || normalized === 'github-copilot') {
    return 'Use as instructions geradas e peça para seguir o handoff do AgentForge.';
  }
  return 'Use a IA ativa configurada e digite `agentforge`.';
}

function normalizeEngineId(value) {
  return normalizeString(value).toLowerCase().replace(/[\s_]+/g, '-');
}

function getPlaybookPath(phaseId) {
  const normalized = normalizeString(phaseId);
  return normalized ? `.agentforge/ai/playbooks/${normalized}.md` : null;
}

function getEngineNotePath(engineId) {
  const normalized = normalizeEngineId(engineId);
  const noteMap = {
    codex: '.agentforge/ai/engines/codex.md',
    claude: '.agentforge/ai/engines/claude.md',
    'claude-code': '.agentforge/ai/engines/claude.md',
    gemini: '.agentforge/ai/engines/gemini.md',
    'gemini-cli': '.agentforge/ai/engines/gemini.md',
    cursor: '.agentforge/ai/engines/cursor.md',
    copilot: '.agentforge/ai/engines/copilot.md',
    'github-copilot': '.agentforge/ai/engines/copilot.md',
  };
  return noteMap[normalized] ?? '.agentforge/ai/engines/task-execution.md';
}

const HANDOFF_WRITE_SURFACES = Object.freeze({
  state: '.agentforge/state.json',
  plan: '.agentforge/plan.md',
  reports: '.agentforge/reports/**',
  entrypoints: [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursor/rules/agentforge.md',
    '.github/copilot-instructions.md',
    '.cursorrules',
    '.windsurfrules',
    '.clinerules',
    '.roorules',
    'GEMINI.md',
    'CONVENTIONS.md',
    '.kiro/steering/agentforge.md',
    '.amazonq/rules/agentforge.md',
  ],
  legacyAgentDocs: '.agents/**',
  agents: '.agentforge/agents/**',
  suggestionsAgents: '.agentforge/suggestions/agents/**',
  suggestions: '.agentforge/suggestions/**',
  context: '.agentforge/context/**',
  skills: '.agentforge/skills/**',
  memory: '.agentforge/memory/**',
  flows: '.agentforge/flows/**',
  policies: '.agentforge/policies/**',
  references: '.agentforge/references/**',
  harnessContextIndex: '.agentforge/harness/context-index.yaml',
  harnessContextMap: '.agentforge/harness/context-map.yaml',
});

function normalizeHandoffModeValue(value) {
  return normalizeString(value).toLowerCase();
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isAdoptionHandoff({ mode, task, state } = {}) {
  const normalizedMode = normalizeHandoffModeValue(mode);
  const normalizedTask = normalizeHandoffModeValue(task);
  const setupMode = normalizeHandoffModeValue(state?.setup_mode);
  const adoptionStatus = normalizeHandoffModeValue(state?.adoption_status);

  return (
    normalizedMode === 'adopt'
    || normalizedMode === 'adoption'
    || normalizedMode === 'hybrid'
    || normalizedTask.includes('adopt')
    || normalizedTask.includes('adoption')
    || setupMode === 'adopt'
    || setupMode === 'hybrid'
    || adoptionStatus === 'planned'
    || adoptionStatus === 'applied'
  );
}

function buildWritePolicy(allowed, prohibited = []) {
  return {
    allowed: uniqueStrings([...allowed, HANDOFF_WRITE_SURFACES.reports]),
    prohibited: uniqueStrings([HANDOFF_WRITE_SURFACES.state, HANDOFF_WRITE_SURFACES.plan, ...prohibited]),
  };
}

const PHASE_WRITE_POLICIES = {
  discovery: buildWritePolicy([
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.references,
  ], [
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestions,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.skills,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
    ...HANDOFF_WRITE_SURFACES.entrypoints,
  ]),
  'agent-design': buildWritePolicy([
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    HANDOFF_WRITE_SURFACES.memory,
  ], [
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
    ...HANDOFF_WRITE_SURFACES.entrypoints,
  ]),
  'flow-design': buildWritePolicy([
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    HANDOFF_WRITE_SURFACES.memory,
  ], [
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestions,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
    ...HANDOFF_WRITE_SURFACES.entrypoints,
  ]),
  policies: buildWritePolicy([
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
  ], [
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestions,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.skills,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
    ...HANDOFF_WRITE_SURFACES.entrypoints,
  ]),
  export: buildWritePolicy([
    ...HANDOFF_WRITE_SURFACES.entrypoints,
  ], [
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestions,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.skills,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
  ]),
  review: buildWritePolicy([], [
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    ...HANDOFF_WRITE_SURFACES.entrypoints,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.suggestions,
    HANDOFF_WRITE_SURFACES.suggestionsAgents,
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.skills,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
  ]),
  adopt: buildWritePolicy([
    ...HANDOFF_WRITE_SURFACES.entrypoints,
    HANDOFF_WRITE_SURFACES.legacyAgentDocs,
    HANDOFF_WRITE_SURFACES.agents,
    HANDOFF_WRITE_SURFACES.context,
    HANDOFF_WRITE_SURFACES.skills,
    HANDOFF_WRITE_SURFACES.flows,
    HANDOFF_WRITE_SURFACES.policies,
    HANDOFF_WRITE_SURFACES.references,
    HANDOFF_WRITE_SURFACES.harnessContextIndex,
    HANDOFF_WRITE_SURFACES.harnessContextMap,
  ], []),
};

export function resolveHandoffWritePolicy({ phase, mode, task, state } = {}) {
  const normalizedPhase = normalizeHandoffModeValue(phase);
  const phaseKey = normalizedPhase && PHASE_WRITE_POLICIES[normalizedPhase]
    ? normalizedPhase
    : normalizedPhase === 'context-curation'
      ? 'discovery'
      : normalizedPhase || 'discovery';
  const adoptionHandoff = isAdoptionHandoff({ mode, task, state });
  const selectedPolicy = adoptionHandoff
    ? PHASE_WRITE_POLICIES.adopt
    : (PHASE_WRITE_POLICIES[phaseKey] ?? PHASE_WRITE_POLICIES.discovery);

  return {
    phase: phaseKey,
    mode: normalizeHandoffModeValue(mode) || null,
    task: normalizeString(task) || null,
    adoption: adoptionHandoff,
    allowed: uniqueStrings(selectedPolicy.allowed),
    prohibited: uniqueStrings([
      ...selectedPolicy.prohibited,
      HANDOFF_WRITE_SURFACES.state,
      HANDOFF_WRITE_SURFACES.plan,
    ]),
  };
}

function listFiles(projectRoot, nextPhase, engine, contextPack = null) {
  const files = [
    '.agentforge/ai/README.md',
    '.agentforge/harness/router.md',
    '.agentforge/harness/context-index.yaml',
    '.agentforge/state.json',
    '.agentforge/plan.md',
    '.agentforge/workflow/phases.yaml',
    '.agentforge/workflow/history.jsonl',
  ];
  if (existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'README.md'))) {
    files.push('.agentforge/ai/README.md');
  }
  const playbookPath = getPlaybookPath(nextPhase?.currentPhase?.id);
  if (playbookPath && existsSync(join(projectRoot, playbookPath))) {
    files.push(playbookPath);
  }
  const engineNotePath = getEngineNotePath(engine);
  if (engineNotePath && existsSync(join(projectRoot, engineNotePath))) {
    files.push(engineNotePath);
  }
  if (nextPhase?.currentPhase?.reads?.length > 0) {
    files.push(...nextPhase.currentPhase.reads.map((entry) => `.agentforge/${entry.replace(/^\//, '')}`));
  }
  if (contextPack?.report_path) {
    files.push(contextPack.report_path);
  }
  if (contextPack?.files_to_read?.length > 0) {
    files.push(...contextPack.files_to_read);
  }
  const contextMapPath = '.agentforge/harness/context-map.yaml';
  if (existsSync(join(projectRoot, contextMapPath))) {
    files.push(contextMapPath);
  }
  return [...new Set(files)];
}

export function buildHandoffData(projectRoot, { engine = '', phase = '', mode = '', task = '' } = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = readJson(statePath) ?? {};
  const definition = loadPhaseDefinition(projectRoot);
  const next = getNextPhase(projectRoot, state, definition);
  const requestedPhaseId = normalizeString(phase);
  const requestedPhase = requestedPhaseId
    ? definition.phases.find((entry) => entry.id === requestedPhaseId) ?? null
    : null;
  const focusPhase = requestedPhase ?? next.currentPhase;
  const focusNextPhase = focusPhase ? definition.phases[definition.phases.findIndex((entry) => entry.id === focusPhase.id) + 1] ?? null : next.nextPhase;
  const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  const contextIndexText = readYamlText(contextIndexPath);
  const contextIndex = contextIndexText ? (() => {
    try {
      return YAML.parse(contextIndexText);
    } catch {
      return null;
    }
  })() : null;
  const configuredEngines = Array.isArray(state.engines) ? state.engines : [];
  const availablePacks = isPlainObject(contextIndex?.task_contexts) ? Object.keys(contextIndex.task_contexts) : [];
  const selectedEngine = normalizeString(engine) || normalizeString(configuredEngines[0]) || 'active-ai';
  const contextCurationRequested = requestedPhaseId === 'context-curation' || focusPhase?.id === 'context-curation';
  const explicitMode = normalizeString(mode);
  const taskDescription = normalizeString(task);
  const phaseMode = !explicitMode && !taskDescription && focusPhase?.id && isPlainObject(contextIndex?.task_contexts) && Object.hasOwn(contextIndex.task_contexts, focusPhase.id)
    ? focusPhase.id
    : '';
  const selectedMode = explicitMode || phaseMode;
  const contextPackResult = selectedMode
    ? buildContextPack(projectRoot, { mode: selectedMode })
    : (taskDescription ? buildContextPack(projectRoot, { task: taskDescription }) : null);
  const contextPack = contextPackResult?.ok ? contextPackResult : null;
  const contextPackReportPath = selectedMode
    ? `.agentforge/reports/context-pack-${selectedMode}.md`
    : (contextPack?.pack.generic ? '.agentforge/reports/context-pack-generic.md' : contextPack ? `.agentforge/reports/context-pack-${contextPack.pack.mode}.md` : null);
  const filesToRead = listFiles(projectRoot, { currentPhase: focusPhase }, selectedEngine, contextPack ? {
    report_path: contextPackReportPath,
    files_to_read: contextPack.pack.generic ? [] : contextPack.pack.files_to_read ?? [],
  } : null);
  const instructions = engineInstructions(selectedEngine);
  const playbookPath = contextCurationRequested
    ? '.agentforge/flows/context-curation.md'
    : getPlaybookPath(focusPhase?.id);
  const engineNotePath = getEngineNotePath(selectedEngine);
  const contextCurationPhases = new Set(['discovery', 'review', 'refactor', 'context-curation']);
  const contextCurationActive = contextCurationPhases.has(focusPhase?.id ?? requestedPhaseId);
  const currentPhaseId = contextCurationRequested ? 'context-curation' : (focusPhase?.id ?? next.currentPhase?.id ?? null);
  const writePolicy = resolveHandoffWritePolicy({
    phase: currentPhaseId ?? requestedPhaseId,
    mode: selectedMode || explicitMode,
    task: taskDescription,
    state,
  });
  const commands = [
    'npx @bcocheto/agentforge handoff',
    `npx @bcocheto/agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status done`,
    'npx @bcocheto/agentforge validate',
  ];
  const contextPackCommand = selectedMode
    ? `agentforge context-pack ${selectedMode} --write`
    : (taskDescription ? `agentforge context-pack --task "${taskDescription}" --write` : 'agentforge context-pack <phase-or-task> --write');

  if (contextCurationActive) {
    commands.unshift(
      'npx @bcocheto/agentforge context-map --check',
      'npx @bcocheto/agentforge context-map --write',
    );
  }

  if (contextCurationRequested) {
    filesToRead.push(
      '.agentforge/flows/context-curation.md',
      '.agentforge/flows/context-curation.yaml',
      '.agentforge/reports/context-curation-input.md',
    );
  }

  if (focusPhase?.id === 'export') {
    commands.splice(1, 0, 'npx @bcocheto/agentforge compile --takeover-entrypoints --include-existing-entrypoints');
  }

  return {
    project: state.project || state.project_name || 'AgentForge',
    engine: selectedEngine,
    configured_engines: configuredEngines,
    current_phase: currentPhaseId,
    next_phase: focusNextPhase?.id ?? next.nextPhase?.id ?? null,
    workflow_complete: next.workflowComplete,
    instructions,
    ai_readme: '.agentforge/ai/README.md',
    task_description: taskDescription,
    selected_mode: selectedMode,
    playbook: {
      id: currentPhaseId,
      path: playbookPath,
    },
    engine_note: {
      engine: selectedEngine,
      path: engineNotePath,
    },
    context_curation: contextCurationActive
      ? {
          agent: 'context-curator',
          task_mode: 'context-curation',
          note: 'Use o agente `context-curator` para revisar o mapa antes de promover contexto como curated.',
          inputs: [
            '.agentforge/harness/context-index.yaml',
            '.agentforge/harness/context-map.yaml',
            '.agentforge/reports/context-curation-input.md',
          ],
          outputs: [
            '.agentforge/reports/context-curation.md',
            '.agentforge/harness/context-map.yaml',
        ],
      }
      : null,
    inference_pending: !selectedMode && taskDescription ? {
      task: taskDescription,
      note: 'Escolha o task mode mais provável antes de editar arquivos reais.',
      recommended_modes: availablePacks,
      command: `agentforge context-pack --task "${taskDescription}" --write`,
    } : null,
    context_pack: contextPack ? {
      mode: contextPack.pack.mode,
      generic: contextPack.pack.generic,
      task_description: contextPack.pack.task_description || '',
      report_path: contextPackReportPath,
      command: contextPackCommand,
      files_to_read: contextPack.pack.files_to_read ?? [],
      always_load: contextPack.pack.always_load ?? [],
      context: contextPack.pack.context ?? [],
      references: contextPack.pack.references ?? [],
      skills: contextPack.pack.skills ?? [],
      flows: contextPack.pack.flows ?? [],
      policies: contextPack.pack.policies ?? [],
      warnings: contextPack.warnings ?? [],
    } : null,
    files_to_read: filesToRead,
    files_allowed_to_write: uniqueStrings([
      '.agentforge/reports/handoff.md',
      '.agentforge/reports/checkpoint.md',
      ...writePolicy.allowed,
    ]),
    files_prohibited: uniqueStrings(writePolicy.prohibited),
    write_policy: writePolicy,
    commands,
    playbooks: definition.phases.map((entry) => ({
      id: entry.id,
      path: getPlaybookPath(entry.id),
      name: entry.name ?? null,
    })),
    context_packs: availablePacks,
    context_pack_note: contextIndexText
      ? 'Carregue o contexto com `agentforge context-pack <task-mode> --write` e aplique as mudanças nos arquivos reais do projeto.'
      : 'Nenhum contexto indexado foi encontrado para montar um context-pack acionável.',
    completion_criteria: [
      'A IA ativa leu router e context-index.',
      'A IA ativa carregou o context-pack correto antes de editar arquivos reais.',
      'A IA ativa leu o playbook da fase atual.',
      'A IA ativa leu a nota específica da engine selecionada.',
      'A próxima fase foi executada com julgamento contextual sobre os arquivos reais do projeto.',
      'O checkpoint foi registrado com `agentforge checkpoint <phase> --status done`.',
      'A estrutura foi validada com `agentforge validate`.',
    ],
    checkpoint: {
      command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status done`,
      blocked_command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status blocked --reason "missing context"`,
      skipped_command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status skipped --reason "not applicable"`,
    },
    next_step: focusNextPhase?.id ?? 'none',
    recommended_command: contextPackCommand,
    ai_instruction: instructions,
  };
}

export function renderHandoffReport(data) {
  const lines = [];
  lines.push('# AgentForge Handoff');
  lines.push('');
  lines.push(`- Projeto: ${data.project}`);
  lines.push(`- Executor recomendado: ${data.engine || 'sua IA ativa configurada'}`);
  lines.push(`- Próxima fase: ${data.current_phase ?? 'discovery'}`);
  lines.push(`- Próximo passo: ${data.next_step}`);
  lines.push(`- Comando recomendado: ${data.recommended_command}`);
  lines.push('');
  lines.push('## Diretriz');
  lines.push('');
  lines.push('- `.agentforge` é a camada de roteamento, não o destino final da mudança.');
  lines.push('- A tarefa deve ser aplicada nos arquivos reais do projeto, não nos artefatos de coordenação.');
  lines.push('- O contexto deve ser carregado via `agentforge context-pack` antes de editar.');
  if (data.context_pack?.report_path) {
    lines.push(`- Report de contexto esperado: \`${data.context_pack.report_path}\``);
  }
  if (data.inference_pending) {
    lines.push(`- Inferência pendente: ${data.inference_pending.note}`);
  }
  lines.push('');
  lines.push('## Engines configuradas');
  lines.push('');
  if ((data.configured_engines ?? []).length > 0) {
    for (const engine of data.configured_engines) {
      lines.push(`- ${engine}`);
    }
  } else {
    lines.push('- nenhuma detectada');
  }
  lines.push('');
  lines.push('## Como proceder');
  lines.push('');
  if (data.context_curation) {
    lines.push(`- ${data.context_curation.note}`);
    lines.push('- Execute `npx @bcocheto/agentforge context-map --check` antes de confiar no mapa.');
    lines.push('- Execute `npx @bcocheto/agentforge context-map --write` para gerar ou atualizar o mapa mecânico.');
    lines.push('- Leia `.agentforge/reports/context-curation-input.md` antes de curar o mapa.');
    lines.push('- Gere `.agentforge/reports/context-curation.md` com as decisões finais da IA ativa.');
    lines.push('- Atualize `.agentforge/harness/context-map.yaml` após a curadoria.');
    lines.push('- Finalize com `agentforge validate`.');
  }
  lines.push(`- ${data.ai_instruction}`);
  lines.push(`- Leia \`${data.ai_readme ?? '.agentforge/ai/README.md'}\` antes de decidir.`);
  if (data.context_pack?.command) {
    lines.push(`- Execute o context pack primeiro: \`${data.context_pack.command}\`.`);
  }
  if (data.inference_pending) {
    lines.push(`- Antes de editar, escolha o task mode mais provável entre: ${data.inference_pending.recommended_modes.join(', ') || 'nenhum encontrado'}.`);
  }
  if (data.playbook?.path) {
    lines.push(`- Leia o playbook da fase: \`${data.playbook.path}\`.`);
  }
  if (data.engine_note?.path) {
    lines.push(`- Leia a nota da engine: \`${data.engine_note.path}\`.`);
  }
  lines.push('- Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/state.json` antes de decidir.');
  if (data.context_pack?.files_to_read?.length > 0) {
    lines.push('- Leia também os arquivos resolvidos pelo context-pack:');
    for (const file of data.context_pack.files_to_read) {
      lines.push(`  - ${file}`);
    }
  }
  lines.push('- Execute a próxima fase com julgamento contextual e ajuste o plano ao projeto.');
  lines.push('- Ao finalizar, registre o checkpoint e valide a estrutura.');
  lines.push('');
  lines.push('## Playbooks disponíveis');
  lines.push('');
  for (const playbook of data.playbooks ?? []) {
    if (typeof playbook === 'string') {
      lines.push(`- ${playbook}`);
      continue;
    }
    const playbookPath = playbook?.path ? ` (${playbook.path})` : '';
    lines.push(`- ${playbook?.id ?? 'unknown'}${playbookPath}`);
  }
  lines.push('');
  lines.push('## Context packs disponíveis');
  lines.push('');
  if ((data.context_packs ?? []).length > 0) {
    for (const pack of data.context_packs) {
      lines.push(`- ${pack}`);
    }
  } else {
    lines.push('- nenhum context pack explícito encontrado');
  }
  lines.push('');
  lines.push('## Arquivos para ler');
  lines.push('');
  for (const file of data.files_to_read ?? []) {
    lines.push(`- ${file}`);
  }
  if (data.inference_pending) {
    lines.push('');
    lines.push('## Inferência pendente');
    lines.push('');
    lines.push(`- Tarefa: ${data.inference_pending.task}`);
    lines.push(`- ${data.inference_pending.note}`);
    lines.push(`- Comando sugerido: \`${data.inference_pending.command}\``);
    lines.push('- Não altere arquivos reais até escolher o task mode mais provável.');
  }
  lines.push('');
  if (data.write_policy) {
    lines.push('## Política de escrita');
    lines.push('');
    lines.push(`- Fase resolvida: ${data.write_policy.phase}`);
    lines.push(`- Modo resolvido: ${data.write_policy.mode ?? 'none'}`);
    if (data.write_policy.adoption) {
      lines.push('- Adoção/hybrid detectada: superfícies legadas e canônicas de adoção estão liberadas.');
    }
    lines.push('');
  }
  lines.push('## Arquivos permitidos para escrita');
  lines.push('');
  for (const file of data.files_allowed_to_write ?? []) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('## Arquivos proibidos');
  lines.push('');
  for (const file of data.files_prohibited ?? []) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('## Comandos úteis');
  lines.push('');
  for (const command of data.commands ?? []) {
    lines.push(`- ${command}`);
  }
  lines.push('');
  lines.push('## Critérios de conclusão');
  lines.push('');
  for (const criterion of data.completion_criteria ?? []) {
    lines.push(`- ${criterion}`);
  }
  lines.push('');
  lines.push('## Checkpoint final');
  lines.push('');
  lines.push(`- ${data.checkpoint?.command}`);
  lines.push(`- ${data.checkpoint?.blocked_command}`);
  lines.push(`- ${data.checkpoint?.skipped_command}`);
  lines.push('');
  lines.push('## Validação');
  lines.push('');
  lines.push('- Finalize com `agentforge validate`.');
  lines.push('- Nunca edite `state.json` ou `plan.md` manualmente.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

export default async function handoff(args = []) {
  const { default: chalk } = await import('chalk');
  const options = parseArgs(args);
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const data = buildHandoffData(projectRoot, options);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'handoff.md');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(reportPath, renderHandoffReport(data), 'utf8');

  if (options.json) {
    console.log(JSON.stringify({ ...data, report_path: reportPath }, null, 2));
  } else {
    console.log(`\n${chalk.bold('AgentForge handoff')}\n`);
    console.log(`Executor recomendado: ${data.engine || 'sua IA ativa configurada'}`);
    console.log(`Próxima fase: ${data.current_phase ?? 'discovery'}`);
    console.log(`Comando recomendado: ${data.recommended_command}`);
    if (data.context_curation) {
      console.log(`Curadoria de contexto: ${data.context_curation.agent}`);
      console.log('Use `npx @bcocheto/agentforge context-map --check` e `npx @bcocheto/agentforge context-map --write` antes de promover contexto como curated.');
      console.log('Leia `.agentforge/reports/context-curation-input.md` antes de curar o mapa.');
      console.log('Gere `.agentforge/reports/context-curation.md` com as decisões finais da IA ativa.');
      console.log('Atualize `.agentforge/harness/context-map.yaml` após a curadoria.');
      console.log('Finalize com `agentforge validate`.');
    }
    console.log(`Relatório gerado em ${reportPath}\n`);
  }

  return 0;
}
