import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { Writer } from '../installer/writer.js';
import { loadManifest, saveManifest, buildManifest } from '../installer/manifest.js';
import { ENGINES } from '../installer/detector.js';
import { applyOrangeTheme, ORANGE_PREFIX } from '../installer/orange-prompts.js';
import { PRODUCT, LEGACY_PRODUCT, normalizeAgentId } from '../product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const AGENT_LABELS = {
  'agentforge':              'AgentForge: main orchestrator',
  'agentforge-scout':        'Scout: reconnaissance',
  'agentforge-archaeologist':'Archaeologist: excavation',
  'agentforge-detective':    'Detective: interpretation',
  'agentforge-architect':    'Architect: architectural synthesis',
  'agentforge-writer':       'Writer: spec generation',
  'agentforge-reviewer':     'Reviewer: spec review and validation',
  'agentforge-visor':        'Visor: UI analysis via screenshots',
  'agentforge-data-master':  'Data Master: database analysis',
  'agentforge-design-system':'Design System: design tokens and themes',
  'agentforge-agents-help':  'Agents Help: explains agents with analogies',
  'agentforge-reconstructor':'Reconstructor: rebuilds the software from generated specs',
};

export default async function addAgent(args) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');
  applyOrangeTheme();

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Add Agent\n`));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} is not installed in this directory.`));
    console.log('  Run ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} install`) + ' to install.\n');
    return;
  }

  const state = existing.state;

  // Validate required fields
  if (!Array.isArray(state.engines) || state.engines.length === 0) {
    console.log(chalk.red('  state.json has no configured engines.'));
    console.log('  Run ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} install`) + ' or ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} add-engine`) + ' first.\n');
    return;
  }

  const installedAgents = new Set(state.agents ?? []);
  const installedEngines = ENGINES.filter(e => state.engines.includes(e.id));

  let availableAgents = [];
  try {
    availableAgents = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => normalizeAgentId(d.name))
      .filter((name, index, all) => all.indexOf(name) === index)
      .filter(name => !installedAgents.has(name));
  } catch {
    console.log(chalk.red('  Could not read the agents folder.\n'));
    return;
  }

  if (availableAgents.length === 0) {
    console.log(chalk.hex('#ffa203')('  All available agents are already installed.\n'));
    return;
  }

  const choices = availableAgents.map(id => ({
    name: AGENT_LABELS[id] ?? id,
    value: id,
    checked: true,
  }));

  const { selected } = await inquirer.prompt([{
    prefix: ORANGE_PREFIX,
    type: 'checkbox',
    name: 'selected',
    message: 'Select agents to add:',
    choices,
    validate: (v) => v.length > 0 || 'Select at least one agent.',
  }]);

  const writer = new Writer(projectRoot);

  for (const agent of selected) {
    for (const engine of installedEngines) {
      await writer.installSkill(agent, engine.skillsDir);
      if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
        await writer.installSkill(agent, engine.universalSkillsDir);
      }
    }
    console.log(chalk.hex('#ffa203')(`  ✓  ${AGENT_LABELS[agent] ?? agent}`));
  }

  // Atualizar state.json
  const statePath = join(projectRoot, existing.internalDir ?? PRODUCT.internalDir, 'state.json');
  const s = JSON.parse(readFileSync(statePath, 'utf8'));
  s.agents = [...new Set([...(s.agents ?? []), ...selected])];
  writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');

  writer.saveCreatedFiles();

  // Atualizar manifest com caminhos relativos
  const existingManifest = loadManifest(projectRoot);
  const newManifest = buildManifest(projectRoot, writer.manifestPaths);
  saveManifest(projectRoot, { ...existingManifest, ...newManifest });

  console.log(chalk.bold(`\n  ${selected.length} agent(s) added successfully.\n`));
}
