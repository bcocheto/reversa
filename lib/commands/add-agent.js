import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { Writer } from '../installer/writer.js';
import { loadManifest, saveManifest, buildManifest } from '../installer/manifest.js';
import { ENGINES } from '../installer/detector.js';
import { applyOrangeTheme, ORANGE_PREFIX } from '../installer/orange-prompts.js';
import { PRODUCT, LEGACY_PRODUCT, AGENT_SKILL_IDS } from '../product.js';

const AGENT_LABELS = {
  agentforge: 'AgentForge: orquestrador central',
  'agentforge-scope-scout': 'Levantador de escopo: entende contexto, stack e restrições',
  'agentforge-agent-architect': 'Arquiteto de agentes: propõe agentes e subagentes',
  'agentforge-flow-designer': 'Designer de fluxos: desenha fluxos operacionais',
  'agentforge-policy-guard': 'Guardião de políticas: define permissões e aprovações',
  'agentforge-exporter': 'Exportador: prepara exportações para engines',
  'agentforge-reviewer': 'Revisor: valida conflitos e cobertura',
};

export default async function addAgent(args) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');
  applyOrangeTheme();

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Adicionar agente\n`));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} não está instalado neste diretório.`));
    console.log('  Execute ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} install`) + ' para instalar.\n');
    return;
  }

  const state = existing.state;

  // Validate required fields
  if (!Array.isArray(state.engines) || state.engines.length === 0) {
    console.log(chalk.red('  O state.json não tem engines configuradas.'));
    console.log('  Execute ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} install`) + ' ou ' + chalk.bold(`npx ${LEGACY_PRODUCT.command} add-engine`) + ' primeiro.\n');
    return;
  }

  const installedAgents = new Set(state.internal_agents ?? []);
  const installedEngines = ENGINES.filter(e => state.engines.includes(e.id));

  const availableAgents = AGENT_SKILL_IDS.filter(name => !installedAgents.has(name));

  if (availableAgents.length === 0) {
    console.log(chalk.hex('#ffa203')('  Todos os agentes internos disponíveis já estão instalados.\n'));
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
    message: 'Selecione os agentes internos para adicionar:',
    choices,
    validate: (v) => v.length > 0 || 'Selecione ao menos um agente.',
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
  s.internal_agents = [...new Set([...(s.internal_agents ?? []), ...selected])];
  writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');

  writer.saveCreatedFiles();

  // Atualizar manifest com caminhos relativos
  const existingManifest = loadManifest(projectRoot);
  const newManifest = buildManifest(projectRoot, writer.manifestPaths);
  saveManifest(projectRoot, { ...existingManifest, ...newManifest });

  console.log(chalk.bold(`\n  ${selected.length} agente(s) interno(s) adicionados com sucesso.\n`));
}
