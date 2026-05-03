import { getNextPhase, loadPhaseDefinition } from './phase-engine.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStateValue(value) {
  return normalizeString(value).toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getAdoptionState(state) {
  const adoption = isPlainObject(state?.adoption) ? state.adoption : {};
  return {
    adoption_status: normalizeStateValue(state?.adoption_status),
    apply_status: normalizeStateValue(adoption.apply_status),
    verification_status: normalizeStateValue(adoption.verification_status),
    next_required_output: normalizeString(adoption.next_required_output || state?.next_required_output),
  };
}

function buildPhaseEngineActivationPlan(projectRoot, state, definition) {
  const phaseEngine = getNextPhase(projectRoot, state, definition);
  const currentPhaseId = phaseEngine.currentPhase?.id ?? null;
  const nextPhaseId = phaseEngine.nextPhase?.id ?? null;
  const recommendedCommand = phaseEngine.commands?.[0] ?? 'none';

  return {
    mode: 'phase-engine',
    should_continue_workflow: true,
    current_phase: currentPhaseId,
    next_phase: nextPhaseId,
    recommended_command: recommendedCommand,
    next_action: phaseEngine.workflowComplete ? 'continue-phase-engine' : 'continue-phase-engine',
    reason: phaseEngine.workflowComplete
      ? 'Nenhuma adoção bloqueante foi encontrada; o phase-engine clássico permanece ativo.'
      : 'Nenhuma adoção bloqueante foi encontrada; seguindo o phase-engine clássico.',
    required_commands: Array.isArray(phaseEngine.commands) ? phaseEngine.commands : [],
    phase_engine: phaseEngine,
  };
}

export function resolveAgentForgeActivationPlan(projectRoot, state, definition, options = {}) {
  const resolvedDefinition = definition ?? loadPhaseDefinition(projectRoot);
  const adoption = getAdoptionState(state);

  if (adoption.adoption_status === 'planned' || adoption.apply_status === 'pending') {
    return {
      mode: 'adoption-pending',
      should_continue_workflow: false,
      current_phase: 'adoption-pending',
      next_phase: null,
      recommended_command: 'agentforge adopt --apply',
      next_action: 'apply-adoption',
      reason: 'A adoção está planejada ou a aplicação ainda está pendente.',
      required_commands: ['agentforge adopt --apply'],
      phase_engine: null,
    };
  }

  if (adoption.adoption_status === 'evidence_ready') {
    return {
      mode: 'adoption-evidence-ready',
      should_continue_workflow: false,
      current_phase: 'adoption-evidence-ready',
      next_phase: null,
      recommended_command: 'agentforge',
      next_action: 'fill-agentic-blueprint',
      reason: 'A evidência e o request estão prontos; use a IA ativa para preencher o blueprint agentic.',
      required_commands: [adoption.next_required_output || '.agentforge/ai/outbox/agentic-blueprint.yaml'],
      phase_engine: null,
    };
  }

  if (adoption.adoption_status === 'applied' && adoption.verification_status === 'verified') {
    return {
      mode: 'adoption-complete',
      should_continue_workflow: false,
      current_phase: 'adoption-complete',
      next_phase: null,
      recommended_command: 'none',
      next_action: 'ask-for-real-task',
      reason: 'A adoção foi aplicada e verificada; peça uma tarefa real.',
      required_commands: [],
      phase_engine: null,
    };
  }

  if (adoption.adoption_status === 'applied' && adoption.verification_status === 'failed') {
    return {
      mode: 'adoption-verification-failed',
      should_continue_workflow: false,
      current_phase: 'adoption-verification-failed',
      next_phase: null,
      recommended_command: 'agentforge adopt --apply --force',
      next_action: 'review-adoption-verification',
      reason: 'A adoção foi aplicada, mas a verificação falhou; revise a camada agentic ou reaplique com --force.',
      required_commands: ['agentforge adopt --apply --force', 'agentforge validate'],
      phase_engine: null,
    };
  }

  if (adoption.adoption_status === 'applied') {
    return {
      mode: 'adoption-verification',
      should_continue_workflow: false,
      current_phase: 'adoption-verification',
      next_phase: null,
      recommended_command: 'agentforge context-map --write',
      next_action: 'verify-adoption',
      reason: 'A adoção foi aplicada, mas a verificação ainda não foi concluída.',
      required_commands: ['agentforge context-map --write', 'agentforge validate'],
      phase_engine: null,
    };
  }

  return buildPhaseEngineActivationPlan(projectRoot, state, resolvedDefinition, options);
}

export default resolveAgentForgeActivationPlan;
