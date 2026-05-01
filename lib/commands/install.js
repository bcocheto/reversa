import { join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { detectEngines, ENGINES } from '../installer/detector.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { runInstallPrompts } from '../installer/prompts.js';
import { Writer } from '../installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export default async function install(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  const projectRoot = resolve(process.cwd());
  const version = getVersion();

  console.log(chalk.hex('#ffa203')(`
______
| ___ \\
| |_/ /_____   _____ _ __ ___  __ _
|    // _ \\ \\ / / _ \\ '__/ __|/ _\` |
| |\\ \\  __/\\ V /  __/ |  \\__ \\ (_| |
\\_| \\_\\___| \\_/ \\___|_|  |___/\\__,_|
`));
  console.log(chalk.gray(`  ${PRODUCT.name}\n`));
  console.log(chalk.bold('  Instalação\n'));

  // Check existing installation
  const existing = checkExistingInstallation(projectRoot);
  if (existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} já está instalado (v${existing.version}) neste projeto.\n`));
    const { default: inquirer } = await import('inquirer');
    const { proceed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Você quer reinstalar / atualizar a configuração?',
      default: false,
    }]);
    if (!proceed) {
      console.log(chalk.gray('\n  Instalação cancelada.\n'));
      return;
    }
  }

  // Detect engines
  const detectedEngines = detectEngines(projectRoot);
  const detected = detectedEngines.filter(e => e.detected).map(e => e.name).join(', ');
  if (detected) {
    console.log(chalk.gray(`  Detectadas: ${detected}\n`));
  }

  // Collect answers
  let answers;
  try {
    answers = await runInstallPrompts(detectedEngines);
  } catch (err) {
    if (err.isTtyError || err.message?.includes('cancel')) {
      console.log(chalk.gray('\n  Instalação cancelada.\n'));
      return;
    }
    throw err;
  }

  if (existing.installed) {
    answers.output_folder = existing.state?.output_folder ?? answers.output_folder;
  }

  const internalAgents = answers.internal_agents ?? [];
  const selectedEngines = ENGINES.filter(e => answers.engines.includes(e.id));
  const writer = new Writer(projectRoot);

  const spinner = ora({ text: 'Instalando agentes...', color: 'cyan' }).start();

  try {
    // Install skills for each agent x engine
    for (const agent of internalAgents) {
      for (const engine of selectedEngines) {
        await writer.installSkill(agent, engine.skillsDir);
        if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
          await writer.installSkill(agent, engine.universalSkillsDir);
        }
      }
    }

    // Stop spinner before possible interactive conflict prompts
    spinner.stop();

    // Instalar entry file de cada engine (deduplica arquivos compartilhados)
    const seenEntryFiles = new Set();
    for (const engine of selectedEngines) {
      if (seenEntryFiles.has(engine.entryFile)) continue;
      seenEntryFiles.add(engine.entryFile);
      await writer.installEntryFile(engine);
    }

    spinner.start(`Criando a estrutura ${(existing.internalDir ?? PRODUCT.internalDir)}/...`);

    // Criar a estrutura interna do produto.
    writer.createProductDir(answers, version);

    // Se reinstall: atualizar engines/agents/config no state.json existente
    if (existing.installed) {
      const statePath = join(projectRoot, existing.internalDir ?? PRODUCT.internalDir, 'state.json');
      if (existsSync(statePath)) {
        const s = JSON.parse(readFileSync(statePath, 'utf8'));
        s.internal_agents = internalAgents;
        s.generated_agents = s.generated_agents ?? [];
        s.generated_subagents = s.generated_subagents ?? [];
        s.flows = s.flows ?? [];
        s.engines = answers.engines;
        s.output_folder = answers.output_folder;
        delete s.agents;
        delete s.answer_mode;
        delete s.doc_level;
        writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
      }
    }

    // .gitignore
    if (answers.git_strategy === 'gitignore') {
      writer.updateGitignore(answers.output_folder);
    }

    writer.saveCreatedFiles();

    spinner.text = 'Gerando manifest...';

    // Manifest com caminhos relativos, apenas arquivos (não diretórios)
    const existingManifest = existing.installed ? loadManifest(projectRoot) : {};
    const newManifest = buildManifest(projectRoot, writer.manifestPaths);
    saveManifest(projectRoot, { ...existingManifest, ...newManifest });

    spinner.succeed(chalk.hex('#ffa203')('Instalação concluída!'));
  } catch (err) {
    spinner.fail(chalk.red('Erro durante a instalação.'));
    throw err;
  }

  // Resumo
  const engineNames = selectedEngines.map(e => e.name).join(', ');
  console.log('');
  console.log(chalk.bold('  Resumo:'));
  console.log(`  ${chalk.cyan('Projeto:')}   ${answers.project_name}`);
  console.log(`  ${chalk.cyan('Engines:')}   ${engineNames}`);
  console.log(`  ${chalk.cyan('Agentes internos:')} ${internalAgents.length} instalados`);
  console.log(`  ${chalk.cyan('Versão:')}   ${version}`);
  console.log('');

  if (selectedEngines.length > 0) {
    const names = selectedEngines.map(e => e.name);
    const namesStr = names.length > 1
      ? names.slice(0, -1).join(', ') + ' ou ' + names.slice(-1)[0]
      : names[0];
    const hasSlashEngine = selectedEngines.some(e => e.id !== 'codex');
    const command = hasSlashEngine
      ? PRODUCT.slashCommand
      : PRODUCT.activationCommand;
    console.log(chalk.cyan(`  → Abra ${namesStr} e digite: ${command} no chat`));
  }
  console.log('');
}
