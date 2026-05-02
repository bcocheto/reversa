import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { getPhaseStatus } from './phase-engine.js';

function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}

export default async function phaseStatus() {
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const status = getPhaseStatus(projectRoot, existing.state ?? null);

  console.log(`\n${PRODUCT.name} phase status\n`);
  console.log(`${pad('Phase', 15)}${pad('Status', 14)}Checks`);
  for (const phase of status.phases) {
    console.log(`${pad(phase.id, 15)}${pad(phase.status, 14)}${phase.checksLabel}`);
  }
  console.log('');
  return 0;
}
