import { checkExistingInstallation } from '../installer/validator.js';
import { getNextPhase, readStateAndPlan } from './project-plan.js';

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
  const phase = getNextPhase(projectRoot, snapshot);

  console.log(`\nCurrent phase: ${phase.currentPhase?.id ?? 'none'}`);
  console.log(`Next phase: ${phase.nextPhase?.id ?? 'none'}`);
  console.log('');
  console.log('Pending checks:');
  if (phase.pendingChecks.length === 0) {
    console.log('- ok');
  } else {
    for (const check of phase.pendingChecks) {
      console.log(`- ${check}`);
    }
  }
  console.log('');
  console.log('Run:');
  console.log('- agentforge advance');
  if (phase.nextPhase?.id) {
    console.log(`- agentforge advance --phase ${phase.nextPhase.id}`);
  }
  console.log('- agentforge advance --all');
  console.log('');

  return 0;
}
