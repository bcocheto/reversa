import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT, LEGACY_PRODUCT } from '../product.js';

export default async function status(args) {
  const { default: chalk } = await import('chalk');

  const existing = checkExistingInstallation(process.cwd());

  if (!existing.installed) {
    console.log(chalk.yellow(`\n  ${PRODUCT.name} is not installed in this directory.`));
    console.log(`  Run ${chalk.bold(`npx ${LEGACY_PRODUCT.command} install`)} to install.\n`);
    return;
  }

  const state = existing.state;
  const internalAgents = state.internal_agents ?? state.agents ?? [];
  const generatedAgents = state.generated_agents ?? [];
  const generatedSubagents = state.generated_subagents ?? [];
  const flows = state.flows ?? [];

  const renderList = (label, items) => {
    if (!items || items.length === 0) return;
    const value = items.map(item => {
      if (typeof item === 'string') return chalk.cyan(item);
      if (item && typeof item === 'object') {
        return chalk.cyan(item.name ?? item.id ?? JSON.stringify(item));
      }
      return chalk.cyan(String(item));
    }).join(', ');
    console.log(`  ${label}: ${value}`);
  };

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Status\n`));
  console.log(`  Project:         ${chalk.cyan(state.project || '(not set)')}`);
  console.log(`  User:            ${chalk.cyan(state.user_name || '(not set)')}`);
  console.log(`  Version:         ${chalk.cyan(state.version || '?')}`);
  console.log(`  Phase:           ${chalk.cyan(state.phase || 'Not started')}`);
  console.log(`  Chat language:   ${chalk.cyan(state.chat_language || 'pt-br')}`);
  console.log(`  Docs language:   ${chalk.cyan(state.doc_language || 'pt-br')}`);

  renderList('Internal agents', internalAgents);
  renderList('Generated agents', generatedAgents);
  renderList('Generated subagents', generatedSubagents);
  renderList('Flows', flows);

  if (state.completed?.length > 0) {
    console.log(`\n  Completed: ${state.completed.map(f => chalk.hex('#ffa203')('✓ ' + f)).join(', ')}`);
  }
  if (state.pending?.length > 0) {
    console.log(`  Pending:   ${state.pending.map(f => chalk.gray('○ ' + f)).join(', ')}`);
  }

  console.log();
}
