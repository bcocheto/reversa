import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const REQUIRED_POLICY_FILES = [
  'permissions.yaml',
  'protected-files.yaml',
  'human-approval.yaml',
];

function formatList(values = []) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function getPoliciesStatus(projectRoot, internalDir) {
  const policyDir = join(projectRoot, internalDir, 'policies');
  const items = REQUIRED_POLICY_FILES.map((file) => ({
    file,
    present: existsSync(join(policyDir, file)),
  }));

  return {
    items,
    overall: items.every((item) => item.present) ? 'OK' : 'MISSING',
  };
}

function getLastValidationStatus(projectRoot, internalDir) {
  const reportPath = join(projectRoot, internalDir, 'reports', 'validation.md');
  if (!existsSync(reportPath)) return null;

  const report = readFileSync(reportPath, 'utf8');
  const match = report.match(/^- Status:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

export default async function status() {
  const { default: chalk } = await import('chalk');

  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const state = existing.state;
  const internalDir = existing.internalDir ?? PRODUCT.internalDir;
  const policiesStatus = getPoliciesStatus(projectRoot, internalDir);
  const lastValidationStatus = getLastValidationStatus(projectRoot, internalDir);
  const currentPhase = state.phase ?? 'not started';
  const outputFolder = state.output_folder ?? PRODUCT.outputDir;
  const engines = state.engines ?? [];
  const generatedAgents = state.generated_agents ?? [];
  const generatedSubagents = state.generated_subagents ?? [];
  const flows = state.flows ?? [];

  console.log(chalk.bold(`\n  ${PRODUCT.name} status\n`));
  console.log(`  Project:             ${chalk.cyan(state.project || '(not set)')}`);
  console.log(`  User:                ${chalk.cyan(state.user_name || '(not set)')}`);
  console.log(`  Version:             ${chalk.cyan(state.version || '?')}`);
  console.log(`  Current phase:       ${chalk.cyan(currentPhase)}`);
  console.log(`  Engines:             ${chalk.cyan(formatList(engines))}`);
  console.log(`  Generated agents:    ${chalk.cyan(formatList(generatedAgents))}`);
  console.log(`  Generated subagents: ${chalk.cyan(formatList(generatedSubagents))}`);
  console.log(`  Flows:               ${chalk.cyan(formatList(flows))}`);
  console.log(`  Output folder:       ${chalk.cyan(outputFolder)}`);
  console.log(`  Policies status:     ${chalk.cyan(policiesStatus.overall)}`);

  for (const item of policiesStatus.items) {
    console.log(`    - ${item.file}: ${item.present ? chalk.green('present') : chalk.red('missing')}`);
  }

  console.log(`  Last validation status: ${chalk.cyan(lastValidationStatus ?? 'not run')}`);

  if (state.completed?.length > 0) {
    console.log(`\n  Completed: ${state.completed.map((item) => chalk.hex('#ffa203')('✓ ' + item)).join(', ')}`);
  }
  if (state.pending?.length > 0) {
    console.log(`  Pending:   ${state.pending.map((item) => chalk.gray('○ ' + item)).join(', ')}`);
  }

  console.log();
  return 0;
}
