export default async function uninstall(args) {
  const { default: chalk } = await import('chalk');

  console.log(chalk.bold('\n  Reversa — Desinstalação\n'));

  // TODO: implementar fluxo de desinstalação
  // 1. Ler .reversa/state.json para obter lista de created_files
  // 2. Mostrar ao usuário o que será removido
  // 3. Pedir confirmação explícita
  // 4. Remover apenas os arquivos listados em created_files
  // 5. Remover .reversa/ e _reversa_sdd/ (com confirmação separada para _reversa_sdd/)
  // NUNCA remover arquivos que não foram criados pelo Reversa

  console.log(chalk.yellow('  Em desenvolvimento — disponível em breve.\n'));
}
