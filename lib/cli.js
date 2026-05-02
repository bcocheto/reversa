import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const COMMAND_LOADERS = {
  install:           () => import('./commands/install.js'),
  ingest:            () => import('./commands/ingest.js'),
  bootstrap:         () => import('./commands/bootstrap.js'),
  adopt:             () => import('./commands/adopt.js'),
  improve:           () => import('./commands/improve.js'),
  'audit-context':   () => import('./commands/audit-context.js'),
  'refactor-context': () => import('./commands/refactor-context.js'),
  'suggest-skills':  () => import('./commands/suggest-skills.js'),
  'create-skill':    () => import('./commands/create-skill.js'),
  update:            () => import('./commands/update.js'),
  status:            () => import('./commands/status.js'),
  uninstall:         () => import('./commands/uninstall.js'),
  'add-agent':       () => import('./commands/add-agent.js'),
  'add-flow':        () => import('./commands/add-flow.js'),
  'add-engine':      () => import('./commands/add-engine.js'),
  compile:           () => import('./commands/compile.js'),
  export:            () => import('./commands/export.js'),
  'export-diagrams':  () => import('./commands/export-diagrams.js'),
  validate:          () => import('./commands/validate.js'),
};

function renderHelp(binaryName) {
  const green = chalk.hex('#ffa203');
  return green(`
______
| ___ \\
| |_/ /_____   _____ _ __ ___  __ _
|    // _ \\ \\ / / _ \\ '__/ __|/ _\` |
| |\\ \\  __/\\ V /  __/ |  \\__ \\ (_| |
\\_| \\_\\___| \\_/ \\___|_|  |___/\\__,_|
`) + `
  AgentForge v${pkg.version}

  Uso: npx ${binaryName} <comando>

  Comandos:
    install            Instala o AgentForge e cria a equipe inicial
    ingest             Importa snapshots de instruções agentic existentes
    bootstrap          Completa a base agent-ready do projeto atual
    adopt              Analisa um projeto existente e gera um plano de adoção
                       Opções: --apply  Executa ingest, audit, refactor, skills, compile e validate
    improve           Analisa a estrutura e sugere melhorias
                       Opções: --apply  Cria apenas melhorias seguras
    audit-context      Diagnostica a organização do contexto com heurísticas determinísticas
    refactor-context   Separa conteúdo importado em arquivos canônicos
                       Opções: --apply  Cria ou atualiza arquivos canônicos seguros
    suggest-skills     Sugere skills de projeto a partir da estrutura e do contexto
                       Opções: --force  Sobrescreve apenas sugestões intactas
    create-skill       Cria uma skill real a partir de uma sugestão existente
                       Opções: --force  Sobrescreve uma skill já criada
    update             Atualiza os agentes para a última versão
    status             Mostra o estado atual da análise
    validate           Valida a estrutura canônica em .agentforge/
    uninstall          Remove o AgentForge do projeto
    add-agent          Cria um agente customizado do projeto
    add-flow           Cria um fluxo operacional customizado
    add-engine         Adiciona suporte a uma engine
    compile            Gera bootloaders pequenos e arquivos derivados para engines configuradas
                       Opções: --force  Sobrescreve apenas arquivos gerados e intactos
                       Opções: --takeover-entrypoints  Substitui entrypoints existentes sem bloco por bootloaders
    export             Alias de compile
    export-diagrams    Exporta diagramas Mermaid como imagens SVG/PNG
                       Opções: --format=svg|png  --output=<pasta>
                       Requer: npm install -g @mermaid-js/mermaid-cli

  Documentação: https://github.com/bcocheto/agentforge
  `;
}

export async function runCli({ binaryName = 'agentforge', argv = process.argv.slice(2) } = {}) {
  const [command, ...args] = argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(renderHelp(binaryName));
    return 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(pkg.version);
    return 0;
  }

  const loader = COMMAND_LOADERS[command];
  if (!loader) {
    console.error(`\n  Comando desconhecido: "${command}"`);
    console.error(`  Execute "npx ${binaryName} --help" para ver os comandos disponíveis.\n`);
    return 1;
  }

  const mod = await loader();
  const result = await mod.default(args);
  return typeof result === 'number' ? result : 0;
}
