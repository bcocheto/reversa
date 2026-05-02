import { PRODUCT } from '../product.js';
import {
  buildCommandsJsonPayload,
  listCommands,
  renderCommandsListing,
} from './registry.js';

function parseArgs(args = []) {
  const parsed = {
    help: false,
    json: false,
    category: null,
    stable: false,
    experimental: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--stable') {
      parsed.stable = true;
      continue;
    }
    if (arg === '--experimental') {
      parsed.experimental = true;
      continue;
    }
    if (arg === '--category') {
      parsed.category = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg.startsWith('--category=')) {
      parsed.category = arg.split('=')[1] ?? null;
    }
  }

  return parsed;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Commands\n`));
  console.log(`  Uso: npx ${PRODUCT.command} commands [--json] [--category <name>] [--stable] [--experimental]\n`);
  console.log('  Lista os comandos disponíveis com categoria, descrição, uso, aliases, escrita e status.');
  console.log('  Use --stable e --experimental para filtrar por status e --json para integração com scripts.\n');
}

export default async function commands(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const commandsList = listCommands({
    category: parsed.category,
    stable: parsed.stable,
    experimental: parsed.experimental,
  });

  if (parsed.json) {
    const payload = buildCommandsJsonPayload(commandsList, {
      category: parsed.category,
      stable: parsed.stable,
      experimental: parsed.experimental,
    });
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  console.log(renderCommandsListing(PRODUCT.command, commandsList));
  return 0;
}
