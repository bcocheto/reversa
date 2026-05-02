import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import {
  readStateAndPlan,
  summarizeStatePlan,
} from './project-plan.js';

function formatList(values = []) {
  return values.length > 0 ? values.join(', ') : 'none';
}

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

  const summary = summarizeStatePlan({
    state: existing.state ?? stateAndPlan.state ?? {},
    planContent: stateAndPlan.planContent,
  });

  console.log('\nCurrent state:');
  console.log(`- phase: ${summary.state.phase ?? 'none'}`);
  console.log(`- completed: ${formatList(summary.state.completed)}`);
  console.log(`- pending: ${formatList(summary.state.pending)}`);
  console.log('');

  console.log('Plan:');
  if (summary.plan.openPhases.length === 0) {
    console.log('- no open phases in plan.md');
  } else {
    for (const phaseId of summary.plan.openPhases) {
      console.log(`- ${phaseId} has unchecked tasks`);
    }
  }
  console.log('');

  console.log('Next recommended phase:');
  console.log(`- ${summary.nextRecommendedPhase ?? 'none'}`);
  console.log('');

  if (summary.warnings.length > 0) {
    console.log('Inconsistency:');
    for (const warning of summary.warnings) {
      console.log(`- ${warning}`);
    }
    console.log('');
  }

  if (summary.errors.length > 0) {
    console.log('State error:');
    for (const error of summary.errors) {
      console.log(`- ${error}`);
    }
    console.log('');
    return 1;
  }

  if (summary.warnings.length > 0) {
    console.log('Suggested:');
    console.log('- agentforge status --repair');
    if (summary.nextRecommendedPhase === 'export') {
      console.log('- agentforge compile');
    }
    console.log('- agentforge validate');
    console.log('');
  }

  return 0;
}
