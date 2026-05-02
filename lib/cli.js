import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { COMMAND_REGISTRY, renderMainHelp } from './commands/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const COMMAND_LOADERS = Object.fromEntries(
  COMMAND_REGISTRY.map((entry) => [
    entry.id,
    () => import(new URL(`./commands/${entry.module.slice(2)}`, import.meta.url).href),
  ]),
);

export async function runCli({ binaryName = 'agentforge', argv = process.argv.slice(2) } = {}) {
  const [command, ...args] = argv;

  if (!command || command === '--help' || command === '-h') {
    console.log(renderMainHelp(binaryName, pkg.version));
    return 0;
  }

  if (command === '--version' || command === '-v') {
    console.log(pkg.version);
    return 0;
  }

  const loader = COMMAND_LOADERS[command];
  if (!loader) {
    console.error(`\n  Comando desconhecido: "${command}"`);
    console.error(`  Execute "npx ${binaryName} --help" ou "npx ${binaryName} commands" para ver os comandos disponíveis.\n`);
    return 1;
  }

  const mod = await loader();
  const result = await mod.default(args);
  return typeof result === 'number' ? result : 0;
}
