import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PRODUCT } from '../product.js';

const SECTION_HEADING_RE = /^##\s+(.+?)\s*$/;
const CHECKBOX_RE = /^\s*-\s+\[( |x|X)\]\s+(.+)$/;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhaseId(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function phaseLabelFromHeading(title) {
  return normalizeString(title)
    .replace(/^Fase\s+\d+\s+[—-]\s+/i, '')
    .replace(/^Phase\s+\d+\s+[—-]\s+/i, '')
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function formatPhaseNames(phases = [], phaseMap = new Map()) {
  return phases.map((phase) => phaseMap.get(phase) ?? phase).join(', ');
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function readStateAndPlan(projectRoot) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const planPath = join(projectRoot, PRODUCT.internalDir, 'plan.md');
  let state = null;
  let stateError = null;
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch (error) {
      stateError = error instanceof Error ? error.message : String(error);
    }
  }
  const planContent = readText(planPath);

  return {
    statePath,
    planPath,
    state,
    stateError,
    planContent,
  };
}

export function parsePlanMarkdown(content) {
  const phases = [];
  let current = null;

  for (const rawLine of String(content ?? '').split(/\r?\n/)) {
    const headingMatch = rawLine.match(SECTION_HEADING_RE);
    if (headingMatch) {
      const title = phaseLabelFromHeading(headingMatch[1]);
      current = {
        title,
        id: normalizePhaseId(title),
        totalTasks: 0,
        completedTasks: 0,
        openTasks: 0,
      };
      phases.push(current);
      continue;
    }

    const checkboxMatch = rawLine.match(CHECKBOX_RE);
    if (!checkboxMatch || !current) continue;

    current.totalTasks += 1;
    if (checkboxMatch[1].toLowerCase() === 'x') {
      current.completedTasks += 1;
    } else {
      current.openTasks += 1;
    }
  }

  return phases;
}

export function normalizePhaseList(values = []) {
  return unique(
    Array.isArray(values)
      ? values.map((value) => normalizePhaseId(value)).filter(Boolean)
      : [],
  );
}

export function summarizeStatePlan({ state = null, planContent = '' } = {}) {
  const phases = parsePlanMarkdown(planContent);
  const stateCompleted = normalizePhaseList(state?.completed);
  const statePending = normalizePhaseList(state?.pending);
  const statePhase = normalizePhaseId(state?.phase);
  const planPhaseIds = phases.map((phase) => phase.id).filter(Boolean);
  const knownPhases = new Set(planPhaseIds);
  const openPlanPhases = phases.filter((phase) => phase.openTasks > 0).map((phase) => phase.id);
  const closedPlanPhases = phases.filter((phase) => phase.totalTasks > 0 && phase.openTasks === 0).map((phase) => phase.id);
  const phaseLabels = new Map(phases.map((phase) => [phase.id, phase.title || phase.id]));
  const nextPlanPhase = openPlanPhases[0] ?? null;
  const nextStatePhase = statePending[0] ?? null;
  const nextRecommendedPhase = nextPlanPhase ?? nextStatePhase ?? null;
  const warnings = [];
  const errors = [];

  if (statePhase && !knownPhases.has(statePhase)) {
    errors.push(`state.phase aponta para uma fase desconhecida: "${statePhase}".`);
  }

  for (const phase of stateCompleted) {
    if (!knownPhases.has(phase)) {
      errors.push(`state.completed contém uma fase desconhecida: "${phase}".`);
    }
  }

  for (const phase of statePending) {
    if (!knownPhases.has(phase)) {
      errors.push(`state.pending contém uma fase desconhecida: "${phase}".`);
    }
  }

  const openPhasesInCompleted = openPlanPhases.filter((phase) => stateCompleted.includes(phase));
  if (openPhasesInCompleted.length > 0) {
    warnings.push(
      `state.completed marca fases que ainda têm tarefas abertas em plan.md: ${formatPhaseNames(openPhasesInCompleted, phaseLabels)}.`,
    );
  }

  const missingOpenPhases = openPlanPhases.filter((phase) => !statePending.includes(phase));
  if (missingOpenPhases.length > 0) {
    if (statePending.length === 0) {
      warnings.push(
        `state says no pending phases, but plan.md still has open ${formatPhaseNames(missingOpenPhases, phaseLabels)} tasks.`,
      );
    } else {
      warnings.push(
        `state.pending is missing open phases from plan.md: ${formatPhaseNames(missingOpenPhases, phaseLabels)}.`,
      );
    }
  }

  const stalePendingPhases = statePending.filter((phase) => closedPlanPhases.includes(phase));
  if (stalePendingPhases.length > 0) {
    warnings.push(
      `state.pending ainda lista fases já fechadas em plan.md: ${formatPhaseNames(stalePendingPhases, phaseLabels)}.`,
    );
  }

  return {
    phases,
    state: {
      phase: statePhase || null,
      completed: stateCompleted,
      pending: statePending,
    },
    plan: {
      openPhases: openPlanPhases,
      closedPhases: closedPlanPhases,
      allPhases: planPhaseIds,
    },
    nextRecommendedPhase,
    warnings,
    errors,
  };
}

export function repairStateFromPlan(state, summary) {
  const nextState = {
    ...(state ?? {}),
  };
  const currentPending = normalizePhaseList(state?.pending);
  const currentCompleted = normalizePhaseList(state?.completed);
  const missingPending = summary.plan.openPhases.filter(
    (phase) => !currentPending.includes(phase) && !currentCompleted.includes(phase),
  );

  nextState.pending = unique([...currentPending, ...missingPending]);
  return nextState;
}

export function writeState(projectRoot, nextState) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return statePath;
}
