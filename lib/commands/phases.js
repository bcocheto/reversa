import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { loadPhaseDefinition, getNextPhase } from './phase-engine.js';

function formatList(values = []) {
  return values.length > 0 ? values.join(', ') : 'none';
}

export default async function phases() {
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const definition = loadPhaseDefinition(projectRoot);
  const next = getNextPhase(projectRoot);

  console.log(`\n${PRODUCT.name} phases\n`);
  for (const phase of definition.phases) {
    console.log(`- ${phase.id} (${phase.name})`);
    console.log(`  order: ${phase.order}`);
    console.log(`  purpose: ${phase.purpose}`);
    console.log(`  reads: ${formatList(phase.reads)}`);
    console.log(`  writes: ${formatList(phase.writes)}`);
  }
  console.log('');
  console.log(`Current phase: ${next.currentPhase?.id ?? 'none'}`);
  console.log(`Next phase: ${next.nextPhase?.id ?? 'none'}`);
  console.log('');
  return 0;
}
