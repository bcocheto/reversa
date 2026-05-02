import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import {
  PATTERN_RESEARCH_REPORT_PATH,
  persistPatternResearch,
  runPatternResearch,
} from './pattern-research.js';

function parseArgs(args = []) {
  const parsed = {
    help: false,
    online: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--online') {
      parsed.online = true;
    }
  }

  return parsed;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Research Patterns\n`));
  console.log(`  Uso: npx ${PRODUCT.command} research-patterns [--online]\n`);
  console.log('  Sugere padrões locais a partir da stack, estrutura, configuração e contexto agentic existente.');
  console.log('  Funciona offline por padrão. A flag --online ainda não ativa pesquisa externa.\n');
}

export default async function researchPatterns(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  if (parsed.online) {
    console.log(chalk.yellow('  Online research is not configured yet; using local pattern catalog.'));
  }

  const projectRoot = process.cwd();
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    console.log(chalk.yellow('  AgentForge is not installed in this directory. Run npx agentforge install.'));
    return 1;
  }

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const currentState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : installation.state ?? {};
  const analysis = runPatternResearch(projectRoot, {
    state: currentState,
    onlineRequested: parsed.online,
  });

  persistPatternResearch(projectRoot, analysis);

  console.log(chalk.hex('#ffa203')(`  Pattern research saved to ${PATTERN_RESEARCH_REPORT_PATH}`));
  console.log(chalk.gray(`  Pattern suggestions: ${analysis.recommendedPatterns.length}`));
  console.log(chalk.gray(`  Stack detectada: ${analysis.detectedStack.join(', ') || 'none'}`));
  return 0;
}
