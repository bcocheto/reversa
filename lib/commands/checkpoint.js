import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { registerCheckpoint, renderCheckpointReport } from './phase-engine.js';

function parseArgs(args = []) {
  const phase = args.find((arg) => !arg.startsWith('--')) ?? '';
  const statusIndex = args.indexOf('--status');
  const reasonIndex = args.indexOf('--reason');
  return {
    phase,
    status: statusIndex !== -1 ? args[statusIndex + 1] ?? '' : '',
    reason: reasonIndex !== -1 ? args[reasonIndex + 1] ?? '' : '',
    dryRun: args.includes('--dry-run'),
  };
}

export default async function checkpoint(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const options = parseArgs(args);
  if (!options.phase || !options.status) {
    console.log(chalk.red('\n  Uso: npx @bcocheto/agentforge checkpoint <phase-id> --status <done|blocked|skipped> [--reason <text>] [--dry-run]\n'));
    return 1;
  }

  const result = await registerCheckpoint(projectRoot, options);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'checkpoint.md');

  if (result.dryRun) {
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
    writeFileSync(reportPath, renderCheckpointReport(result.result), 'utf8');
    console.log(chalk.hex('#ffa203')(`\n  Checkpoint simulado para ${result.result.phase} (${result.result.status}).`));
    console.log(chalk.gray(`  Relatório gerado em ${reportPath}\n`));
    return 0;
  }

  if (!result.ok) {
    console.log(chalk.red(`\n  AgentForge checkpoint encontrou ${result.errors.length} erro(s).`));
    for (const error of result.errors) {
      console.log(chalk.red(`  - ${error}`));
    }
    console.log(chalk.gray(`  Relatório gerado em ${reportPath}\n`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`\n  Checkpoint registrado: ${result.result.phase} -> ${result.result.status}`));
  console.log(chalk.gray(`  Próxima fase: ${result.result.next_phase ?? 'none'}`));
  console.log(chalk.gray(`  Relatório gerado em ${reportPath}\n`));
  return 0;
}
