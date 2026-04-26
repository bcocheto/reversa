export default async function addAgent(args) {
  const { default: chalk } = await import('chalk');

  console.log(chalk.bold('\n  Reversa — Adicionar Agente\n'));

  // TODO: implementar adição de agente
  // 1. Listar agentes disponíveis que não estão instalados
  // 2. Usuário seleciona com Tab
  // 3. Copiar .md do agente para .reversa/agents/
  // 4. Atualizar state.json

  console.log(chalk.yellow('  Em desenvolvimento — disponível em breve.\n'));
}
