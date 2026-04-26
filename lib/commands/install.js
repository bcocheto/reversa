export default async function install(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  const { default: inquirer } = await import('inquirer');

  console.log(chalk.bold('\n  Reversa — Instalação\n'));

  // TODO: implementar fluxo completo de instalação
  // 1. Detectar engines instaladas (detector.js)
  // 2. Verificar instalação existente (validator.js)
  // 3. Sequência de perguntas (prompts.js):
  //    - Diretório de instalação
  //    - Engines a suportar
  //    - Agentes a instalar (todos marcados por padrão)
  //    - Formatos de saída
  //    - Modo Express / Avançado
  //    - Nome do projeto
  //    - Nome do usuário
  //    - Idioma das specs
  //    - Adicionar ao .gitignore ou commitar artefatos?
  //    - Modo de resposta a lacunas (chat ou arquivo)
  // 4. Escrever arquivos (writer.js)
  // 5. Criar state.json e plan.md iniciais

  console.log(chalk.yellow('  Em desenvolvimento — disponível em breve.\n'));
}
