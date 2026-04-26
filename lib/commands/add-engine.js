export default async function addEngine(args) {
  const { default: chalk } = await import('chalk');

  console.log(chalk.bold('\n  Reversa — Adicionar Engine\n'));

  // TODO: implementar adição de engine
  // 1. Detectar engines disponíveis no ambiente
  // 2. Listar engines não configuradas
  // 3. Usuário seleciona com Tab
  // 4. Verificar se arquivo de entrada já existe (CLAUDE.md, AGENTS.md, etc.)
  //    Se existir: perguntar explicitamente se quer mesclar (só adiciona, nunca apaga)
  //    Se não existir: criar do template
  // 5. Atualizar state.json

  console.log(chalk.yellow('  Em desenvolvimento — disponível em breve.\n'));
}
