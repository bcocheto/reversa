import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PRODUCT } from '../product.js';
import { advancePhase, renderAdvanceReport } from './phase-engine.js';

function parseArgs(args = []) {
  const phaseIndex = args.indexOf('--phase');
  return {
    all: args.includes('--all'),
    phase: phaseIndex !== -1 ? args[phaseIndex + 1] ?? null : null,
  };
}

export default async function advance(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();
  const options = parseArgs(args);
  const result = await advancePhase(projectRoot, options);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(reportPath, renderAdvanceReport(result), 'utf8');

  if (!result.ok) {
    console.log(chalk.red(`\n  AgentForge advance encontrou ${result.errors.length} erro(s).`));
    for (const error of result.errors) {
      console.log(chalk.red(`  - ${error}`));
    }
    console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${reportPath}\n`));
    return 1;
  }

  for (const warning of result.warnings ?? []) {
    console.log(chalk.yellow(`  Aviso: ${warning}`));
  }

  if (result.results.length === 0) {
    console.log(chalk.hex('#ffa203')('\n  AgentForge advance: nenhuma fase pendente para planejar.'));
  } else {
    console.log(chalk.hex('#ffa203')('\n  AgentForge advance: sequência planejada.'));
    for (const step of result.results) {
      console.log(chalk.hex('#ffa203')(`  ${step.phase} -> ${step.next} [${step.validation}]`));
    }
  }

  console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${reportPath}\n`));
  return 0;
}
