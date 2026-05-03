import { checkExistingInstallation } from '../installer/validator.js';
import { readStateAndPlan } from './project-plan.js';
import { loadPhaseDefinition } from './phase-engine.js';
import { resolveAgentForgeActivationPlan } from './activation-plan.js';

export default async function next() {
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const stateAndPlan = readStateAndPlan(projectRoot);
  if (stateAndPlan.stateError) {
    console.log(`\nAgentForge: state.json inválido: ${stateAndPlan.stateError}\n`);
    return 1;
  }

  const snapshot = existing.state ?? stateAndPlan.state ?? {};
  const definition = loadPhaseDefinition(projectRoot);
  const activationPlan = resolveAgentForgeActivationPlan(projectRoot, snapshot, definition);
  const phase = activationPlan.phase_engine ?? null;

  console.log(`\nActivation mode: ${activationPlan.mode}`);
  console.log(`Current phase: ${activationPlan.current_phase ?? 'none'}`);
  console.log(`Next phase: ${activationPlan.next_phase ?? 'none'}`);
  console.log('');
  if (activationPlan.should_continue_workflow && phase?.workflowComplete) {
    console.log('Cycle status: ready');
    console.log('Task packs available: feature-development, bugfix, refactor, review, release');
    console.log('');
    console.log('Run:');
    console.log('- agentforge handoff');
    console.log('- agentforge validate');
  } else if (activationPlan.should_continue_workflow) {
    console.log('Pending checks:');
    if ((phase?.pendingChecks ?? []).length === 0) {
      console.log('- ok');
    } else {
      for (const check of phase.pendingChecks) {
        console.log(`- ${check}`);
      }
    }
    console.log('');
    console.log('Run:');
    console.log('- agentforge handoff');
    if (phase?.currentPhase?.id) {
      console.log(`- agentforge checkpoint ${phase.currentPhase.id} --status done`);
    }
    console.log('- agentforge validate');
  } else {
    console.log(`Reason: ${activationPlan.reason}`);
    console.log('');
    console.log('Required commands:');
    if (activationPlan.required_commands.length === 0) {
      console.log('- ask-for-real-task');
    } else {
      for (const command of activationPlan.required_commands) {
        console.log(`- ${command}`);
      }
    }
  }
  console.log('');

  return 0;
}
