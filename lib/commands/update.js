export default async function update(args) {
  const { default: chalk } = await import('chalk');

  console.log(chalk.bold('\n  Reversa — Atualização\n'));

  // TODO: implementar fluxo de atualização
  // 1. Verificar versão instalada em .reversa/version
  // 2. Checar versão mais recente no npm registry
  // 3. Identificar arquivos modificados pelo usuário (via hash ou manifest)
  // 4. Informar ao usuário quais arquivos serão atualizados
  // 5. Pedir confirmação
  // 6. Atualizar somente os arquivos não modificados (ou todos, com confirmação)

  console.log(chalk.yellow('  Em desenvolvimento — disponível em breve.\n'));
}
