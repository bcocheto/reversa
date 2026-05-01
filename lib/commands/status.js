import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT, LEGACY_PRODUCT } from '../product.js';

export default async function status(args) {
  const { default: chalk } = await import('chalk');

  const existing = checkExistingInstallation(process.cwd());

  if (!existing.installed) {
    console.log(chalk.yellow(`\n  ${PRODUCT.name} não está instalado neste diretório.`));
    console.log(`  Execute ${chalk.bold(`npx ${LEGACY_PRODUCT.command} install`)} para instalar.\n`);
    return;
  }

  const state = existing.state;
  const internalAgents = state.internal_agents ?? [];
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
  console.log(`  Projeto:         ${chalk.cyan(state.project || '(não definido)')}`);
  console.log(`  Usuário:         ${chalk.cyan(state.user_name || '(não definido)')}`);
  console.log(`  Versão:          ${chalk.cyan(state.version || '?')}`);
  console.log(`  Fase:            ${chalk.cyan(state.phase || 'não iniciada')}`);
  console.log(`  Idioma do chat:  ${chalk.cyan(state.chat_language || 'pt-br')}`);
  console.log(`  Idioma docs:     ${chalk.cyan(state.doc_language || 'pt-br')}`);

  renderList('Agentes internos', internalAgents);
  renderList('Agentes gerados', generatedAgents);
  renderList('Subagentes gerados', generatedSubagents);
  renderList('Fluxos', flows);

  if (state.completed?.length > 0) {
    console.log(`\n  Concluídos: ${state.completed.map(f => chalk.hex('#ffa203')('✓ ' + f)).join(', ')}`);
  }
  if (state.pending?.length > 0) {
    console.log(`  Pendentes:   ${state.pending.map(f => chalk.gray('○ ' + f)).join(', ')}`);
  }

  console.log();
}
