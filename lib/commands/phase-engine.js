import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import YAML from 'yaml';
import { PRODUCT } from '../product.js';
import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { ENTRYPOINT_TARGETS, buildEntrypointQualityMessage, inspectManagedEntrypointContent } from './entrypoint-quality.js';

export const PHASE_IDS = Object.freeze([
  'discovery',
  'agent-design',
  'flow-design',
  'policies',
  'export',
  'review',
]);

export const DEFAULT_PHASE_DEFINITION = Object.freeze({
  version: 1,
  phases: [
    {
      id: 'discovery',
      name: 'Discovery',
      order: 10,
      purpose: 'Mapear objetivos, restricoes, superfices e contexto persistente.',
      reads: ['state.json', 'scope.md', 'reports/project-analysis.md', 'reports/analysis-plan.md', 'suggestions/context/'],
      writes: ['context/project-overview.md', 'context/architecture.md', 'context/testing.md', 'references/important-files.md'],
      completion: { required_files: ['context/project-overview.md', 'context/architecture.md'], required_checks: ['no_placeholder_core_context'] },
    },
    {
      id: 'agent-design',
      name: 'Agent Design',
      order: 20,
      purpose: 'Promover agentes sugeridos e consolidar papeis.',
      reads: ['suggestions/agents/', 'agents/', 'context/project-overview.md', 'context/architecture.md'],
      writes: ['agents/', 'memory/decisions.md'],
      completion: { required_files: ['agents/orchestrator.yaml'], required_checks: ['generated_agents_valid'] },
    },
    {
      id: 'flow-design',
      name: 'Flow Design',
      order: 30,
      purpose: 'Consolidar flows operacionais em YAML e Markdown.',
      reads: ['suggestions/flows/', 'flows/', 'agents/'],
      writes: ['flows/', 'memory/decisions.md'],
      completion: { required_checks: ['all_state_flows_in_context_index', 'flow_yaml_md_pairs'] },
    },
    {
      id: 'policies',
      name: 'Policies',
      order: 40,
      purpose: 'Consolidar permissoes, seguranca e aprovacao humana.',
      reads: ['suggestions/policies/', 'policies/'],
      writes: ['policies/', 'memory/decisions.md'],
      completion: { required_checks: ['required_policies_valid'] },
    },
    {
      id: 'export',
      name: 'Export',
      order: 50,
      purpose: 'Compilar entrypoints e validar manifest.',
      reads: ['harness/', 'agents/', 'flows/', 'policies/'],
      writes: ['AGENTS.md', 'CLAUDE.md', 'reports/compile.md'],
      completion: { required_checks: ['entrypoints_compiled', 'validate_passes'] },
    },
    {
      id: 'review',
      name: 'Review',
      order: 60,
      purpose: 'Revisar consistencia final.',
      reads: ['reports/validation.md', 'state.json', 'plan.md'],
      writes: ['reports/review.md'],
      completion: { required_checks: ['validate_passes', 'no_state_plan_drift'] },
    },
  ],
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePhaseId(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizePhaseList(values = []) {
  return [...new Set(Array.isArray(values) ? values.map((value) => normalizePhaseId(value)).filter(Boolean) : [])];
}

export function isWorkflowComplete(workflow = {}, definition = DEFAULT_PHASE_DEFINITION) {
  const phaseIds = getPhaseIds(definition);
  const completed = normalizePhaseList(workflow.completed_phases);
  const pending = normalizePhaseList(workflow.pending_phases);
  return pending.length === 0 && phaseIds.every((phaseId) => completed.includes(phaseId));
}

function phaseFile(projectRoot) {
  return join(projectRoot, PRODUCT.internalDir, 'workflow', 'phases.yaml');
}

function historyFile(projectRoot) {
  return join(projectRoot, PRODUCT.internalDir, 'workflow', 'history.jsonl');
}

function stateFile(projectRoot) {
  return join(projectRoot, PRODUCT.internalDir, 'state.json');
}

function planFile(projectRoot) {
  return join(projectRoot, PRODUCT.internalDir, 'plan.md');
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function toPosixPath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function writeText(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function isPlaceholder(text) {
  return /(\bA preencher\b|<[^>]+>|\bTBD\b|\bNão detectado\b)/i.test(String(text ?? ''));
}

function listFilesRecursive(dirPath, predicate = () => true) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath, entry.name)) files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function listAgentFiles(projectRoot) {
  const agentsDir = join(projectRoot, PRODUCT.internalDir, 'agents');
  return listFilesRecursive(agentsDir, (fullPath, name) => ['.yaml', '.yml'].includes(extname(name).toLowerCase()));
}

function parseYamlObject(filePath) {
  try {
    const doc = YAML.parse(readText(filePath));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

function validateManagedAgentDoc(doc, fileId) {
  const errors = [];
  if (normalizeString(doc.id) !== fileId) {
    errors.push(`id do agente deve coincidir com o nome do arquivo (${fileId}).`);
  }
  if (!normalizeString(doc.name)) {
    errors.push('nome do agente ausente.');
  }
  if (!normalizeString(doc.description) && !normalizeString(doc.mission)) {
    errors.push('descrição/missão do agente ausente.');
  }
  if (!Array.isArray(doc.responsibilities) || doc.responsibilities.length === 0) {
    errors.push('responsabilidades principais ausentes.');
  }
  if (!Array.isArray(doc.boundaries) || doc.boundaries.length === 0) {
    errors.push('limites do agente ausentes.');
  }
  return errors;
}

function repairGeneratedAgentsState(projectRoot, state, manifest) {
  const agentFiles = listAgentFiles(projectRoot);
  const discoveredIds = [];
  const seenIds = new Set();
  const unrepaired = [];
  const recommendedCommands = new Set();

  for (const filePath of agentFiles) {
    const relPath = rel(projectRoot, filePath);
    const fileId = basename(filePath, extname(filePath));
    const manifestEntry = manifest[relPath];
    const status = manifestEntry ? fileStatus(projectRoot, relPath, manifestEntry) : 'missing';

    if (!manifestEntry) {
      unrepaired.push(`generated_agents: ${relPath} não está no manifest.`);
      recommendedCommands.add(`Use agentforge create-agent ${fileId} --force or remove the manual agent file.`);
      continue;
    }

    if (status !== 'intact') {
      unrepaired.push(`generated_agents: ${relPath} foi modificado manualmente.`);
      recommendedCommands.add(`Use agentforge create-agent ${fileId} --force or remove the manual agent file.`);
      continue;
    }

    const doc = parseYamlObject(filePath);
    if (!doc) {
      unrepaired.push(`generated_agents: ${relPath} contém YAML inválido.`);
      recommendedCommands.add(`Use agentforge create-agent ${fileId} --force or remove the manual agent file.`);
      continue;
    }

    const docErrors = validateManagedAgentDoc(doc, fileId);
    if (docErrors.length > 0) {
      unrepaired.push(`generated_agents: ${relPath} inválido (${docErrors.join(' ')})`);
      recommendedCommands.add(`Use agentforge create-agent ${fileId} --force or remove the manual agent file.`);
      continue;
    }

    if (seenIds.has(fileId)) {
      unrepaired.push(`generated_agents: id duplicado detectado para ${fileId}.`);
      recommendedCommands.add(`Use agentforge create-agent ${fileId} --force or remove the manual agent file.`);
      continue;
    }

    seenIds.add(fileId);
    discoveredIds.push(fileId);
  }

  const currentGeneratedAgents = Array.isArray(state.generated_agents)
    ? state.generated_agents.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
  const nextGeneratedAgents = [...new Set(discoveredIds)].sort((a, b) => a.localeCompare(b));
  const currentSorted = [...currentGeneratedAgents].sort((a, b) => a.localeCompare(b));
  const canRepairGeneratedAgents = unrepaired.length === 0;
  const generatedAgentsChanged = canRepairGeneratedAgents
    && currentSorted.join('\u0000') !== nextGeneratedAgents.join('\u0000');

  return {
    state: canRepairGeneratedAgents
      ? {
          ...state,
          generated_agents: nextGeneratedAgents,
        }
      : state,
    repairedFields: generatedAgentsChanged ? ['generated_agents'] : [],
    unrepairedFields: [...new Set(unrepaired)],
    recommendedCommands: [...new Set(recommendedCommands)].sort((a, b) => a.localeCompare(b)),
  };
}

function parsePhaseFile(doc) {
  if (!isPlainObject(doc)) return null;
  const phases = Array.isArray(doc.phases) ? doc.phases : [];
  const normalized = phases.map((phase) => {
    if (!isPlainObject(phase)) return null;
    return {
      id: normalizePhaseId(phase.id),
      name: normalizeString(phase.name) || normalizePhaseId(phase.id),
      order: Number(phase.order) || 0,
      purpose: normalizeString(phase.purpose),
      reads: Array.isArray(phase.reads) ? phase.reads.filter((value) => typeof value === 'string' && value.trim()) : [],
      writes: Array.isArray(phase.writes) ? phase.writes.filter((value) => typeof value === 'string' && value.trim()) : [],
      completion: {
        required_files: Array.isArray(phase.completion?.required_files)
          ? phase.completion.required_files.filter((value) => typeof value === 'string' && value.trim())
          : [],
        required_checks: Array.isArray(phase.completion?.required_checks)
          ? phase.completion.required_checks.filter((value) => typeof value === 'string' && value.trim())
          : [],
      },
    };
  }).filter(Boolean);
  return { version: Number(doc.version) || 1, phases: normalized.sort((a, b) => a.order - b.order) };
}

export function loadPhaseDefinition(projectRoot) {
  const filePath = phaseFile(projectRoot);
  if (!existsSync(filePath)) return structuredClone(DEFAULT_PHASE_DEFINITION);
  const parsed = parsePhaseFile(YAML.parse(readText(filePath)));
  if (!parsed || parsed.phases.length === 0) {
    throw new Error(`Invalid phase definition in ${filePath}`);
  }
  return parsed;
}

function getPhaseIds(definition) {
  return definition.phases.map((phase) => phase.id);
}

function getPhaseIndex(definition, phaseId) {
  return definition.phases.findIndex((phase) => phase.id === phaseId);
}

function readState(projectRoot) {
  const parsed = JSON.parse(readText(stateFile(projectRoot)) || '{}');
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid state file: ${stateFile(projectRoot)}`);
  }
  return parsed;
}

function normalizeWorkflowStateFromState(state, definition) {
  const phaseIds = getPhaseIds(definition);
  const legacyCompleted = normalizePhaseList(state.completed);
  const legacyPending = normalizePhaseList(state.pending);
  const current = normalizePhaseId(state.phase) || normalizePhaseId(state.workflow?.current_phase) || phaseIds[0];
  const completed = normalizePhaseList(
    legacyCompleted.length > 0
      ? legacyCompleted
      : (Array.isArray(state.workflow?.completed_phases) && state.workflow.completed_phases.length > 0
        ? state.workflow.completed_phases
        : []),
  ).filter((phaseId) => phaseIds.includes(phaseId));
  let pending = normalizePhaseList(
    legacyPending.length > 0
      ? legacyPending
      : (Array.isArray(state.workflow?.pending_phases) && state.workflow.pending_phases.length > 0
        ? state.workflow.pending_phases
        : []),
  ).filter((phaseId) => phaseIds.includes(phaseId));
  if (pending.length === 0) {
    pending = phaseIds.filter((phaseId) => !completed.includes(phaseId));
  }
  const currentPhase = phaseIds.includes(current) ? current : (pending[0] ?? phaseIds[0]);
  const currentIndex = getPhaseIndex(definition, currentPhase);
  const pendingFromCurrent = phaseIds.slice(Math.max(0, currentIndex)).filter((phaseId) => !completed.includes(phaseId));
  return {
    current_phase: currentPhase,
    completed_phases: completed,
    pending_phases: pendingFromCurrent.length > 0 ? pendingFromCurrent : pending,
    phase_history: Array.isArray(state.workflow?.phase_history) ? state.workflow.phase_history.filter(isPlainObject) : [],
  };
}

export function normalizeWorkflowState(state, definition) {
  return normalizeWorkflowStateFromState(state, definition);
}

export function getPhaseDefinitionMap(definition) {
  return new Map(definition.phases.map((phase) => [phase.id, phase]));
}

function readPhaseFile(projectRoot, relPath) {
  return readText(join(projectRoot, PRODUCT.internalDir, relPath));
}

function phaseCompletionMessages(projectRoot, phase, state, definition) {
  const messages = [];
  switch (phase.id) {
    case 'discovery': {
      const overview = readPhaseFile(projectRoot, 'context/project-overview.md');
      const architecture = readPhaseFile(projectRoot, 'context/architecture.md');
      if (!overview.trim()) messages.push('context/project-overview.md está ausente');
      if (!architecture.trim()) messages.push('context/architecture.md está ausente');
      if (isPlaceholder(overview)) messages.push('context/project-overview.md tem placeholders');
      if (isPlaceholder(architecture)) messages.push('context/architecture.md tem placeholders');
      break;
    }
    case 'agent-design': {
      const agentsDir = join(projectRoot, PRODUCT.internalDir, 'agents');
      if (!existsSync(join(agentsDir, 'orchestrator.yaml'))) messages.push('agents/orchestrator.yaml está ausente');
      const agentFiles = existsSync(agentsDir) && statSync(agentsDir).isDirectory()
        ? listFilesRecursive(agentsDir, (fullPath, name) => name.endsWith('.yaml') || name.endsWith('.yml'))
        : [];
      if (agentFiles.length === 0) messages.push('generated_agents_valid');
      break;
    }
    case 'flow-design': {
      const flowsDir = join(projectRoot, PRODUCT.internalDir, 'flows');
      const flowIds = normalizePhaseList(state.flows);
      const flowFiles = existsSync(flowsDir) && statSync(flowsDir).isDirectory()
        ? listFilesRecursive(flowsDir, (fullPath, name) => name.endsWith('.yaml') || name.endsWith('.yml') || name.endsWith('.md'))
        : [];
      const yamlIds = new Set(flowFiles.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml')).map((file) => basename(file).replace(/\.(ya?ml)$/i, '')));
      const mdIds = new Set(flowFiles.filter((file) => file.endsWith('.md')).map((file) => basename(file, '.md')));
      for (const flowId of flowIds) {
        if (!yamlIds.has(flowId)) messages.push(`flow ${flowId} sem YAML`);
        if (!mdIds.has(flowId)) messages.push(`flow ${flowId} sem MD`);
      }
      const contextIndex = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
      if (existsSync(contextIndex)) {
        try {
          const doc = YAML.parse(readText(contextIndex));
          const indexed = new Set(Array.isArray(doc?.flows) ? doc.flows.map((entry) => normalizePhaseId(entry?.id)).filter(Boolean) : []);
          for (const flowId of flowIds) {
            if (!indexed.has(flowId)) messages.push(`flow ${flowId} ausente no context-index`);
          }
        } catch {
          messages.push('harness/context-index.yaml inválido');
        }
      }
      break;
    }
    case 'policies': {
      const policiesDir = join(projectRoot, PRODUCT.internalDir, 'policies');
      for (const fileName of ['permissions.yaml', 'protected-files.yaml', 'human-approval.yaml']) {
        if (!existsSync(join(policiesDir, fileName))) messages.push(`policies/${fileName} está ausente`);
      }
      break;
    }
    case 'export': {
      for (const target of ENTRYPOINT_TARGETS) {
        const absPath = join(projectRoot, target.path);
        if (!existsSync(absPath)) {
          if (target.path === 'AGENTS.md') {
            messages.push(`${target.path} não tem bootloader gerenciado`);
          }
          continue;
        }

        const inspection = inspectManagedEntrypointContent(readText(absPath));
        if (!inspection.hasBlock && target.path === 'AGENTS.md') {
          messages.push(`${target.path} não tem bootloader gerenciado`);
          continue;
        }

        for (const message of buildEntrypointQualityMessage(inspection)) {
          if (message === 'Arquivo de entrada sem bloco gerenciado do AgentForge.') continue;
          if (message.startsWith('Conteúdo manual excessivo fora do bloco AgentForge')) {
            messages.push(message);
            continue;
          }
          if (message.startsWith('Entrypoint gerenciado excede o limite de')) {
            messages.push(message);
            continue;
          }
          if (message.startsWith('Bloco AgentForge excede o limite de')) {
            messages.push(message);
            continue;
          }
          if (message.startsWith('Bootloader sem referências obrigatórias')) {
            messages.push(`${message} Mova o conteúdo de domínio para .agentforge/context ou references.`);
            continue;
          }
          if (message.startsWith('Conteúdo legado Reversa detectado')) {
            messages.push(message);
          }
        }
      }
      break;
    }
    case 'review': {
      if (!normalizeString(state.workflow?.current_phase)) messages.push('workflow ausente');
      break;
    }
    default:
      break;
  }

  return messages;
}

function currentPhase(definition, workflow) {
  return definition.phases.find((phase) => phase.id === workflow.current_phase) ?? definition.phases[0] ?? null;
}

function nextPhase(definition, phaseId) {
  const index = getPhaseIndex(definition, phaseId);
  return index === -1 ? null : (definition.phases[index + 1] ?? null);
}

export function getPhaseCompletionReport(projectRoot, phase, state, definition) {
  const messages = phaseCompletionMessages(projectRoot, phase, state, definition);
  return {
    satisfied: messages.length === 0,
    totalChecks: (phase.completion?.required_files?.length ?? 0) + (phase.completion?.required_checks?.length ?? 0),
    passedChecks: Math.max(0, (phase.completion?.required_files?.length ?? 0) + (phase.completion?.required_checks?.length ?? 0) - messages.length),
    missingFiles: messages,
    missingChecks: [],
    messages,
  };
}

export function getPhaseStatus(projectRoot, stateOverride = null, definitionOverride = null) {
  const definition = definitionOverride ?? loadPhaseDefinition(projectRoot);
  const state = stateOverride ?? readState(projectRoot);
  const workflow = normalizeWorkflowStateFromState(state, definition);
  const completed = new Set(workflow.completed_phases);
  const currentIndex = getPhaseIndex(definition, workflow.current_phase);
  return {
    definition,
    state: workflow,
    phases: definition.phases.map((phase, index) => {
      const report = getPhaseCompletionReport(projectRoot, phase, state, definition);
      const status = completed.has(phase.id) ? 'done' : (index > currentIndex ? 'blocked' : 'pending');
      const checksLabel = completed.has(phase.id) ? 'ok' : (report.messages.length > 0 ? `${report.messages.length} checks` : 'ok');
      return { ...phase, status, checksLabel, report };
    }),
  };
}

export function getNextPhase(projectRoot, stateOverride = null, definitionOverride = null) {
  const definition = definitionOverride ?? loadPhaseDefinition(projectRoot);
  const state = stateOverride ?? readState(projectRoot);
  const workflow = normalizeWorkflowStateFromState(state, definition);
  const current = currentPhase(definition, workflow);
  const workflowComplete = isWorkflowComplete(workflow, definition);
  const next = current ? nextPhase(definition, current.id) : null;
  const focus = workflowComplete
    ? null
    : (current && !getPhaseCompletionReport(projectRoot, current, state, definition).satisfied ? current : next);
  const focusReport = focus ? getPhaseCompletionReport(projectRoot, focus, state, definition) : null;
  return {
    definition,
    state: workflow,
    currentPhase: current,
    nextPhase: next,
    focusPhase: focus,
    workflowComplete,
    pendingChecks: focusReport ? focusReport.messages : [],
    commands: [
      'agentforge handoff',
      focus ? `agentforge checkpoint ${focus.id} --status done` : null,
      'agentforge validate',
    ].filter(Boolean),
  };
}

export function renderPlanFromPhases(projectRoot, stateOverride = null, definitionOverride = null) {
  const definition = definitionOverride ?? loadPhaseDefinition(projectRoot);
  const state = stateOverride ?? readState(projectRoot);
  const workflow = normalizeWorkflowStateFromState(state, definition);
  const project = normalizeString(state.project || state.project_name) || 'AgentForge';
  const lines = [];
  lines.push(`# Plano Operacional do AgentForge - ${project}`);
  lines.push('');
  lines.push('> Generated from `.agentforge/workflow/phases.yaml` and `.agentforge/state.json`.');
  lines.push('> Do not edit checkboxes manually. Use `agentforge checkpoint` or `agentforge status --repair`.');
  lines.push('');
  lines.push(`- Current phase: ${workflow.current_phase}`);
  lines.push(`- Next phase: ${nextPhase(definition, workflow.current_phase)?.id ?? 'none'}`);
  lines.push(`- Completed phases: ${workflow.completed_phases.join(', ') || 'none'}`);
  lines.push(`- Pending phases: ${workflow.pending_phases.join(', ') || 'none'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const phase of definition.phases) {
    const report = getPhaseCompletionReport(projectRoot, phase, state, definition);
    lines.push(`## Fase ${Math.floor(phase.order / 10)} — ${phase.name}`);
    lines.push('');
    const ok = report.satisfied;
    for (const file of phase.completion?.required_files ?? []) {
      lines.push(`- [${ok ? 'x' : ' '}] ${file}`);
    }
    for (const check of phase.completion?.required_checks ?? []) {
      lines.push(`- [${ok ? 'x' : ' '}] ${check}`);
    }
    if ((phase.completion?.required_files?.length ?? 0) === 0 && (phase.completion?.required_checks?.length ?? 0) === 0) {
      lines.push('- [x] phase completed');
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function normalizeStateForWrite(state, definition) {
  const workflow = normalizeWorkflowStateFromState(state, definition);
  return {
    ...state,
    workflow: {
      current_phase: workflow.current_phase,
      completed_phases: workflow.completed_phases,
      pending_phases: workflow.pending_phases,
      phase_history: workflow.phase_history,
    },
    phase: workflow.current_phase,
    completed: workflow.completed_phases,
    pending: workflow.pending_phases,
  };
}

function mergeExportedState(projectRoot, workingState) {
  const exportedState = readState(projectRoot);
  const merged = {
    ...exportedState,
    ...workingState,
    created_files: [...new Set([...(exportedState.created_files ?? []), ...(workingState.created_files ?? [])])],
    checkpoints: {
      ...(exportedState.checkpoints ?? {}),
      ...(workingState.checkpoints ?? {}),
    },
  };

  return merged;
}

function phaseFiles(definition) {
  return definition.phases.flatMap((phase) => [...(phase.writes ?? []), ...(phase.completion?.required_files ?? [])]
    .filter((relPath) => !relPath.endsWith('/') && (relPath.includes('.') || relPath === 'AGENTS.md' || relPath === 'CLAUDE.md'))
    .map((relPath) => join(PRODUCT.internalDir, relPath).replace(/\\/g, '/')));
}

function snapshot(paths) {
  const map = new Map();
  for (const path of paths) {
    map.set(path, existsSync(path) ? readFileSync(path, 'utf8') : null);
  }
  return map;
}

function restoreSnapshot(map) {
  for (const [path, content] of map.entries()) {
    if (content === null) {
      if (existsSync(path)) unlinkSync(path);
      continue;
    }
    writeText(path, content);
  }
}

function writePhaseArtifacts(projectRoot, state, phase) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const writes = [];
  const record = (relPath, content) => {
    const abs = join(internalDir, relPath);
    writeText(abs, content);
    writes.push(join(PRODUCT.internalDir, relPath).replace(/\\/g, '/'));
  };

  const name = normalizeString(state.project || state.project_name) || 'AgentForge';
  const type = normalizeString(state.project_type) || 'A preencher';
  const objective = normalizeString(state.objective) || 'A preencher';
  const stack = normalizeString(state.stack) || 'A preencher';

  if (phase.id === 'discovery') {
    record('context/project-overview.md', [
      '# Project Overview',
      '',
      '## Nome',
      '',
      name,
      '',
      '## Objetivo',
      '',
      objective,
      '',
      '## Tipo de projeto',
      '',
      type,
      '',
      '## Stack principal',
      '',
      stack,
      '',
      '## Estado atual',
      '',
      '- Use `agentforge next` to determine the next phase.',
      '',
    ].join('\n'));
    record('context/architecture.md', [
      '# Architecture',
      '',
      '## Overview',
      '',
      `This project is a ${type}.`,
      '',
      '## Layers',
      '',
      '- Interface: entrypoints and bootloaders.',
      '- Aplicacao: commands and phase engine.',
      '- Dominio: workflow, state, and validation rules.',
      '- Infraestrutura: generated files and manifests.',
      '',
      '## Fluxo principal',
      '',
      '1. Read the structured state.',
      '2. Reconcile the current phase.',
      '3. Write only the artifacts for that phase.',
      '4. Regenerate plan.md from workflow state.',
      '5. Validate before advancing.',
      '',
    ].join('\n'));
    record('context/testing.md', [
      '# Testing',
      '',
      '## Strategy',
      '',
      '- Run the smallest useful test command first.',
      '- Use temporary directories when commands write artifacts.',
      '- Validate the CLI after each phase transition.',
      '',
      '## Commands',
      '',
      '- `npm test`',
      '- `agentforge validate`',
      '',
    ].join('\n'));
    record('references/important-files.md', [
      '# Important Files',
      '',
      '| Arquivo | Função |',
      '| --- | --- |',
      '| `.agentforge/state.json` | Fonte estruturada do estado. |',
      '| `.agentforge/plan.md` | Visualização humana derivada do estado e do workflow. |',
      '| `.agentforge/workflow/phases.yaml` | Definição estruturada das fases. |',
      '| `.agentforge/workflow/history.jsonl` | Histórico append-only das transições. |',
      '',
    ].join('\n'));
    record('README.md', [
      '# AgentForge Workspace',
      '',
      'Use `agentforge next` to determine the next phase.',
      'Use `agentforge advance` to move the Phase Engine forward.',
      'Never edit `state.json` or `plan.md` manually.',
      '',
    ].join('\n'));
  }

  if (phase.id === 'agent-design' || phase.id === 'flow-design' || phase.id === 'policies') {
    const decisionsPath = join(internalDir, 'memory', 'decisions.md');
    const existing = readText(decisionsPath).trimEnd();
    const message = phase.id === 'agent-design'
      ? '- Agent design phase completed through the CLI.'
      : phase.id === 'flow-design'
        ? '- Flow design phase completed through the CLI.'
        : '- Policies phase completed through the CLI.';
    const content = `${existing ? `${existing}\n\n` : ''}## ${new Date().toISOString().split('T')[0]}\n\n${message}\n`;
    writeText(decisionsPath, content.endsWith('\n') ? content : `${content}\n`);
    writes.push(join(PRODUCT.internalDir, 'memory', 'decisions.md').replace(/\\/g, '/'));
  }

  if (phase.id === 'review') {
    record('reports/review.md', [
      '# Review',
      '',
      '- The repo was revalidated after the latest phase transition.',
      '- Use `agentforge validate` to inspect detailed results.',
      '',
    ].join('\n'));
  }

  return writes;
}

function appendHistory(projectRoot, record) {
  const filePath = historyFile(projectRoot);
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function syncPhaseManifest(projectRoot, writtenPaths = []) {
  const relPaths = [
    ...new Set([
      ...writtenPaths,
      join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'plan.md').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'workflow/history.jsonl').replace(/\\/g, '/'),
    ]),
  ];

  const nextManifest = {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, relPaths),
  };
  saveManifest(projectRoot, nextManifest);
}

async function runValidate(projectRoot) {
  const { validateAgentForgeStructure } = await import('./validate.js');
  return validateAgentForgeStructure(projectRoot);
}

function buildHistoryRecord({ from, to, command, written, checks, validation }) {
  return {
    at: new Date().toISOString(),
    from,
    to,
    command,
    written,
    checks,
    validation,
  };
}

function normalizeCheckpointStatus(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'done' || normalized === 'blocked' || normalized === 'skipped') {
    return normalized;
  }
  return null;
}

function buildPlannedPhases(definition, workflow, options = {}) {
  const phaseIds = getPhaseIds(definition);
  const currentIndex = Math.max(0, getPhaseIndex(definition, workflow.current_phase));
  const targetId = normalizePhaseId(options.phase);
  const targetIndex = targetId ? getPhaseIndex(definition, targetId) : currentIndex;
  const endIndex = options.all ? phaseIds.length - 1 : (targetId ? targetIndex : currentIndex);
  const sequence = phaseIds.slice(currentIndex, Math.max(currentIndex, endIndex) + 1);

  return {
    phaseIds,
    currentIndex,
    targetId,
    targetIndex,
    endIndex,
    sequence,
  };
}

export async function advancePhase(projectRoot, options = {}) {
  const definition = loadPhaseDefinition(projectRoot);
  const state = readState(projectRoot);
  const workflow = normalizeWorkflowStateFromState(state, definition);
  const planned = buildPlannedPhases(definition, workflow, options);

  if (planned.targetId && planned.targetIndex === -1) {
    return { ok: false, errors: [`Unknown phase: ${planned.targetId}`], results: [] };
  }
  if (!options.all && planned.targetId && planned.targetIndex < planned.currentIndex) {
    return { ok: false, errors: [`Target phase ${planned.targetId} is behind the current phase ${workflow.current_phase}.`], results: [] };
  }

  const results = [];
  for (const phaseId of planned.sequence) {
    const phase = definition.phases.find((entry) => entry.id === phaseId);
    if (!phase) continue;
    const report = getPhaseCompletionReport(projectRoot, phase, state, definition);
    results.push({
      phase: phase.id,
      next: nextPhase(definition, phase.id)?.id ?? phase.id,
      reads: [...(phase.reads ?? [])],
      writes: [...(phase.writes ?? [])],
      checks: report.messages,
      validation: report.satisfied ? 'ready' : 'needs-attention',
      status: phase.id === workflow.current_phase ? 'current' : 'planned',
    });
  }

  return {
    ok: true,
    results,
    warnings: options.all
      ? ['advance --all não executa fases inteligentes. Use sua IA ativa com `agentforge handoff` e registre progresso com `agentforge checkpoint`.']
      : [],
    state: workflow,
    workflowComplete: isWorkflowComplete(workflow, definition),
    reportPath: join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md'),
  };
}

export function renderAdvanceReport(result) {
  const lines = [];
  lines.push('# AgentForge Advance Report');
  lines.push('');

  if (!result?.ok) {
    lines.push('- Status: failed');
    lines.push('');
    lines.push('## Errors');
    lines.push('');
    for (const error of result?.errors ?? []) {
      lines.push(`- ${error}`);
    }
    lines.push('');
    lines.push('## Next steps');
    lines.push('');
    lines.push('- Fix the blocking issue and run `agentforge handoff` again.');
    lines.push('- Use `agentforge validate` to inspect the current state.');
    lines.push('');
    return `${lines.join('\n').trimEnd()}\n`;
  }

  lines.push('- Status: planned');
  lines.push('');
  lines.push('## Phases planned');
  lines.push('');
  for (const step of result.results ?? []) {
    lines.push(`- ${step.phase} -> ${step.next} (${step.validation})`);
  }
  lines.push('');

  lines.push('## Context recommended');
  lines.push('');
  const reads = new Set((result.results ?? []).flatMap((step) => step.reads ?? []));
  if (reads.size === 0) {
    lines.push('- none');
  } else {
    for (const file of reads) {
      lines.push(`- ${file}`);
    }
  }
  lines.push('');

  lines.push('## Checklist');
  lines.push('');
  const checks = (result.results ?? []).flatMap((step) => step.checks ?? []);
  if (checks.length === 0) {
    lines.push('- none');
  } else {
    for (const check of checks) {
      lines.push(`- ${check}`);
    }
  }
  lines.push('');

  lines.push('## Planned writes');
  lines.push('');
  for (const step of result.results ?? []) {
    const writes = step.writes?.length > 0 ? step.writes.join(', ') : 'none';
    lines.push(`- ${step.phase}: ${writes}`);
  }
  lines.push('');

  lines.push('## Warnings');
  lines.push('');
  if (result.warnings?.length > 0) {
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push('- none');
  }
  lines.push('');

  lines.push('## Next steps');
  lines.push('');
  if (result.workflowComplete) {
    lines.push('- Open your active AI and start a real project task with `agentforge`.');
    lines.push('- Run `agentforge handoff` when the next phase changes.');
  } else {
    lines.push('- Open your active AI and run `agentforge handoff`.');
    lines.push('- After the phase is complete, register it with `agentforge checkpoint <phase> --status done`.');
  }
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function updateWorkflowForCheckpoint(workflow, phaseId, status, phaseIds) {
  const completed = normalizePhaseList(workflow.completed_phases);
  const pending = phaseIds.filter((id) => !completed.includes(id));
  const currentPhase = normalizePhaseId(workflow.current_phase) || phaseIds[0] || phaseId;

  if (status === 'done') {
    if (!completed.includes(phaseId)) completed.push(phaseId);
    const next = phaseIds.find((id) => !completed.includes(id)) ?? phaseId;
    return {
      current_phase: next,
      completed_phases: completed,
      pending_phases: phaseIds.filter((id) => !completed.includes(id)),
      phase_history: [...(workflow.phase_history ?? [])],
      next_phase: next,
    };
  }

  const current = phaseIds.includes(phaseId) ? phaseId : currentPhase;
  return {
    current_phase: current,
    completed_phases: completed,
    pending_phases: pending,
    phase_history: [...(workflow.phase_history ?? [])],
    next_phase: current,
  };
}

export async function registerCheckpoint(projectRoot, options = {}) {
  const definition = loadPhaseDefinition(projectRoot);
  const state = readState(projectRoot);
  const workflow = normalizeWorkflowStateFromState(state, definition);
  const phaseIds = getPhaseIds(definition);
  const phaseId = normalizePhaseId(options.phase);
  const phase = definition.phases.find((entry) => entry.id === phaseId);

  if (!phase) {
    return { ok: false, errors: [`Unknown phase: ${phaseId || options.phase || 'unknown'}`], reportPath: join(projectRoot, PRODUCT.internalDir, 'reports', 'checkpoint.md') };
  }

  const status = normalizeCheckpointStatus(options.status);
  if (!status) {
    return { ok: false, errors: [`Invalid checkpoint status: ${options.status}`], reportPath: join(projectRoot, PRODUCT.internalDir, 'reports', 'checkpoint.md') };
  }

  const reason = normalizeString(options.reason);
  const dryRun = Boolean(options.dryRun);
  const nextWorkflow = updateWorkflowForCheckpoint(workflow, phase.id, status, phaseIds);
  const checkpoint = {
    at: new Date().toISOString(),
    phase: phase.id,
    status,
    reason: reason || null,
    next_phase: nextWorkflow.next_phase,
  };
  const updatedState = {
    ...state,
    workflow: {
      current_phase: nextWorkflow.current_phase,
      completed_phases: nextWorkflow.completed_phases,
      pending_phases: nextWorkflow.pending_phases,
      phase_history: [...nextWorkflow.phase_history, checkpoint],
    },
    phase: nextWorkflow.current_phase,
    completed: nextWorkflow.completed_phases,
    pending: nextWorkflow.pending_phases,
    checkpoints: {
      ...(state.checkpoints ?? {}),
      [phase.id]: checkpoint,
    },
  };

  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'checkpoint.md');
  const historyEntry = buildHistoryRecord({
    from: workflow.current_phase,
    to: nextWorkflow.current_phase,
    command: `checkpoint ${phase.id} --status ${status}${reason ? ` --reason ${JSON.stringify(reason)}` : ''}`,
    written: [
      join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'plan.md').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'workflow/history.jsonl').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'reports/checkpoint.md').replace(/\\/g, '/'),
    ],
    checks: [],
    validation: 'pending',
  });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      reportPath,
      result: {
        phase: phase.id,
        status,
        reason,
        next_phase: nextWorkflow.next_phase,
        state: updatedState,
      },
    };
  }

  writeText(stateFile(projectRoot), `${JSON.stringify(updatedState, null, 2)}\n`);
  writeText(planFile(projectRoot), renderPlanFromPhases(projectRoot, updatedState, definition));
  appendHistory(projectRoot, historyEntry);
  writeText(reportPath, renderCheckpointReport({
    phase: phase.id,
    status,
    reason,
    next_phase: nextWorkflow.next_phase,
    state: updatedState,
    historyEntry,
  }));
  syncPhaseManifest(projectRoot, [
    join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'),
    join(PRODUCT.internalDir, 'plan.md').replace(/\\/g, '/'),
    join(PRODUCT.internalDir, 'workflow/history.jsonl').replace(/\\/g, '/'),
    join(PRODUCT.internalDir, 'reports/checkpoint.md').replace(/\\/g, '/'),
  ]);

  const validation = await runValidate(projectRoot);
  return {
    ok: validation.valid !== false,
    errors: validation.valid ? [] : (validation.errors?.map((entry) => entry.message ?? String(entry)) ?? []),
    reportPath,
    result: {
      phase: phase.id,
      status,
      reason,
      next_phase: nextWorkflow.next_phase,
      state: updatedState,
      historyEntry,
      validation,
    },
  };
}

export function renderCheckpointReport(result) {
  const lines = [];
  lines.push('# AgentForge Checkpoint Report');
  lines.push('');
  lines.push(`- Phase: ${result.phase}`);
  lines.push(`- Status: ${result.status}`);
  lines.push(`- Next phase: ${result.next_phase ?? 'none'}`);
  lines.push(`- Reason: ${result.reason || 'none'}`);
  lines.push('');
  lines.push('## Next steps');
  lines.push('');
  lines.push('- Use `agentforge validate` to confirm the workspace remains consistent.');
  lines.push('- If the phase is blocked, reopen `agentforge handoff` and continue from the active AI.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

export function repairPhaseState(projectRoot) {
  const definition = loadPhaseDefinition(projectRoot);
  const currentState = readState(projectRoot);
  const normalizedState = normalizeStateForWrite(currentState, definition);
  const manifest = loadManifest(projectRoot);
  const generatedAgentsRepair = repairGeneratedAgentsState(projectRoot, normalizedState, manifest);
  const state = generatedAgentsRepair.state;
  const currentStateText = readText(stateFile(projectRoot));
  const stateText = `${JSON.stringify(state, null, 2)}\n`;
  const plan = renderPlanFromPhases(projectRoot, state, definition);
  const currentPlan = readText(planFile(projectRoot));
  const repairedFields = [...generatedAgentsRepair.repairedFields];

  if (stateText !== currentStateText) {
    repairedFields.push('state.json');
  }
  if (plan !== currentPlan) {
    repairedFields.push('plan.md');
  }

  writeText(stateFile(projectRoot), stateText);
  writeText(planFile(projectRoot), plan);
  return {
    state,
    planContent: plan,
    repairedFields: [...new Set(repairedFields)].sort((a, b) => a.localeCompare(b)),
    unrepairedFields: generatedAgentsRepair.unrepairedFields,
    recommendedCommands: generatedAgentsRepair.recommendedCommands,
  };
}

export function finalizeAdoptionWorkflow(projectRoot, state, { validationResult = null, adoptionApplyPath = null } = {}) {
  if (validationResult && validationResult.valid === false) {
    throw new Error('Cannot finalize adoption workflow without a successful validation result.');
  }

  const definition = loadPhaseDefinition(projectRoot);
  const phaseIds = getPhaseIds(definition);
  const workflow = normalizeWorkflowStateFromState(state ?? {}, definition);
  const currentPhase = 'review';
  const completedPhases = phaseIds.filter((phaseId) => phaseId !== 'discovery' && phaseId !== currentPhase);
  const pendingPhases = [currentPhase];
  const verifiedAt = new Date().toISOString();
  const adoption = isPlainObject(state?.adoption) ? state.adoption : {};
  const finalizedState = {
    ...state,
    adoption: {
      ...adoption,
      status: 'applied',
      apply_status: 'applied',
      verification_status: 'verified',
      verified_at: verifiedAt,
      ...(adoptionApplyPath ? { apply_report_path: adoptionApplyPath } : {}),
    },
    adoption_status: 'applied',
    workflow: {
      ...(state?.workflow ?? {}),
      current_phase: currentPhase,
      completed_phases: completedPhases,
      pending_phases: pendingPhases,
      phase_history: Array.isArray(workflow.phase_history) ? [...workflow.phase_history] : [],
    },
    phase: currentPhase,
    completed: completedPhases,
    pending: pendingPhases,
  };

  writeText(stateFile(projectRoot), `${JSON.stringify(finalizedState, null, 2)}\n`);
  const repaired = repairPhaseState(projectRoot);
  const historyEntry = buildHistoryRecord({
    from: workflow.current_phase ?? phaseIds[0] ?? 'discovery',
    to: currentPhase,
    command: 'adopt --apply',
    written: [
      join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'plan.md').replace(/\\/g, '/'),
      join(PRODUCT.internalDir, 'workflow/history.jsonl').replace(/\\/g, '/'),
      ...(adoptionApplyPath ? [adoptionApplyPath.replace(/\\/g, '/')] : []),
    ],
    checks: [],
    validation: validationResult?.valid === false ? 'failed' : 'passed',
  });
  appendHistory(projectRoot, historyEntry);
  syncPhaseManifest(projectRoot, [
    join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'),
    join(PRODUCT.internalDir, 'plan.md').replace(/\\/g, '/'),
    join(PRODUCT.internalDir, 'workflow/history.jsonl').replace(/\\/g, '/'),
    ...(adoptionApplyPath ? [adoptionApplyPath.replace(/\\/g, '/')] : []),
  ]);

  return {
    state: repaired.state,
    planContent: repaired.planContent,
    historyEntry,
    verifiedAt,
  };
}

export function readStateAndPlan(projectRoot) {
  const statePath = stateFile(projectRoot);
  const planPathValue = planFile(projectRoot);
  let state = null;
  let stateError = null;
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readText(statePath));
    } catch (error) {
      stateError = error instanceof Error ? error.message : String(error);
    }
  }
  return { statePath, planPath: planPathValue, state, stateError, planContent: readText(planPathValue) };
}

export function summarizeStatePlan({ state = null } = {}) {
  const definition = DEFAULT_PHASE_DEFINITION;
  const workflow = normalizeWorkflowStateFromState(state ?? {}, definition);
  return {
    phases: definition.phases,
    state: { phase: workflow.current_phase, completed: workflow.completed_phases, pending: workflow.pending_phases },
    plan: { openPhases: workflow.pending_phases, closedPhases: workflow.completed_phases, allPhases: getPhaseIds(definition) },
    nextRecommendedPhase: nextPhase(definition, workflow.current_phase)?.id ?? null,
    warnings: [],
    errors: [],
  };
}
