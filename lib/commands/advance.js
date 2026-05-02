import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PRODUCT } from '../product.js';
import { advancePhase } from './phase-engine.js';

function parseArgs(args = []) {
  const phaseIndex = args.indexOf('--phase');
  return {
    all: args.includes('--all'),
    phase: phaseIndex !== -1 ? args[phaseIndex + 1] ?? null : null,
  };
}

function renderReport(result) {
  const lines = [];
  lines.push('# AgentForge Advance Report');
  lines.push('');

  if (!result.ok) {
    lines.push('- Status: failed');
    lines.push('');
    for (const error of result.errors ?? []) {
      lines.push(`- ${error}`);
    }
    lines.push('');
    return `${lines.join('\n').trimEnd()}\n`;
  }

  lines.push('- Status: passed');
  lines.push('');
  for (const step of result.results ?? []) {
    lines.push(`## ${step.phase}`);
    lines.push('');
    lines.push(`- Next: ${step.next}`);
    lines.push(`- Validation: ${step.validation}`);
    lines.push(`- Written: ${step.written.length > 0 ? step.written.join(', ') : 'none'}`);
    lines.push(`- Checks: ${step.checks.length > 0 ? step.checks.join(' | ') : 'ok'}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export default async function advance(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();
  const options = parseArgs(args);
  const result = await advancePhase(projectRoot, options);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'advance.md');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(reportPath, renderReport(result), 'utf8');

  if (!result.ok) {
    console.log(chalk.red(`\n  AgentForge advance encontrou ${result.errors.length} erro(s).`));
    for (const error of result.errors) {
      console.log(chalk.red(`  - ${error}`));
    }
    console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${reportPath}\n`));
    return 1;
  }

  if (result.results.length === 0) {
    console.log(chalk.hex('#ffa203')('\n  AgentForge advance: nenhuma fase pendente para processar.'));
  } else {
    for (const step of result.results) {
      console.log(chalk.hex('#ffa203')(`  ${step.phase} -> ${step.next} (${step.validation})`));
    }
  }

  console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${reportPath}\n`));
  return 0;
}
