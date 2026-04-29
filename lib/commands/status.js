import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default async function status(args) {
  const { default: chalk } = await import('chalk');

  const statePath = join(process.cwd(), '.reversa', 'state.json');

  if (!existsSync(statePath)) {
    console.log(chalk.yellow('\n  Reversa is not installed in this directory.'));
    console.log('  Run ' + chalk.bold('npx reversa install') + ' to install.\n');
    return;
  }

  const state = JSON.parse(readFileSync(statePath, 'utf8'));

  console.log(chalk.bold('\n  Reversa: Status\n'));
  console.log(`  Project:         ${chalk.cyan(state.project || '(not set)')}`);
  console.log(`  User:            ${chalk.cyan(state.user_name || '(not set)')}`);
  console.log(`  Version:         ${chalk.cyan(state.version || '?')}`);
  console.log(`  Current phase:   ${chalk.cyan(state.phase || 'Not started')}`);
  console.log(`  Chat language:   ${chalk.cyan(state.chat_language || 'pt-br')}`);
  console.log(`  Docs language:   ${chalk.cyan(state.doc_language || 'pt-br')}`);

  if (state.completed?.length > 0) {
    console.log(`\n  Completed: ${state.completed.map(f => chalk.hex('#ffa203')('✓ ' + f)).join(', ')}`);
  }
  if (state.pending?.length > 0) {
    console.log(`  Pending:   ${state.pending.map(f => chalk.gray('○ ' + f)).join(', ')}`);
  }

  console.log();
}
