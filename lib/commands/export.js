import { exportAgentForge } from '../exporter/index.js';

export default async function exportCommand(args = []) {
  const { default: chalk } = await import('chalk');
  const force = args.includes('--force') || args.includes('-f');

  const result = exportAgentForge(process.cwd(), { force });

  for (const message of result.messages) {
    console.log(chalk.hex('#ffa203')(`  ${message}`));
  }

  for (const warning of result.warnings) {
    console.log(chalk.yellow(`  Aviso: ${warning}`));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red(`\n  AgentForge export encontrou ${result.errors.length} erro(s).`));
    for (const error of result.errors) {
      console.log(chalk.red(`  - ${error}`));
    }
    return 1;
  }

  if (result.written.length === 0) {
    console.log(chalk.hex('#ffa203')('\n  AgentForge export: nada para atualizar.'));
  } else {
    console.log(chalk.hex('#ffa203')(`\n  AgentForge export: ${result.written.length} arquivo(s) gerado(s) ou atualizado(s).`));
  }

  if (result.skipped.length > 0) {
    console.log(`  Arquivos preservados: ${result.skipped.join(', ')}`);
  }

  return 0;
}
