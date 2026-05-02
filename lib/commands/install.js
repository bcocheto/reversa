import { join, resolve } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { detectEngines, ENGINES } from '../installer/detector.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { runInstallPrompts } from '../installer/prompts.js';
import { Writer } from '../installer/writer.js';
import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { PRODUCT, normalizeSetupMode } from '../product.js';
import { buildAnalysis, persistAnalysis } from './analyze.js';
import { applyCoreContextSynthesis } from './context-synthesis.js';
import { compileAgentForge } from '../exporter/index.js';
import { repairPhaseState } from './phase-engine.js';
import { validateAgentForgeStructure } from './validate.js';
import { buildHandoffData, renderHandoffReport } from './handoff.js';

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

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function writeHandoffReport(projectRoot, engineId = '') {
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'handoff.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  const handoffData = buildHandoffData(projectRoot, { engine: engineId });
  writeFileSync(reportPath, renderHandoffReport(handoffData), 'utf8');
  return reportPath;
}

function printInstallSummary({
  chalk,
  answers,
  selectedEngines,
  internalAgents,
  initialAgents,
  initialFlows,
  version,
  handoffReportPath,
  setupModeOverride,
  label,
  nextSteps,
}) {
  const engineNames = selectedEngines.map((engine) => engine.name).join(', ');
  const setupMode = normalizeSetupMode(setupModeOverride);
  const setupModeSummary = {
    bootstrap: 'bootstrap - base nova criada do zero',
    adopt: 'adopt - projeto existente analisado e reaproveitado sem anexar conteúdo manual',
    hybrid: 'hybrid - base nova criada e arquivos existentes importados',
  }[setupMode] ?? setupMode;

  console.log('');
  console.log(chalk.bold('  Resumo:'));
  console.log(`  ${chalk.cyan('Modo:')}      ${setupModeSummary}`);
  console.log(`  ${chalk.cyan('Projeto:')}   ${answers.project_name}`);
  console.log(`  ${chalk.cyan('Tipo:')}      ${answers.project_type}`);
  console.log(`  ${chalk.cyan('Stack:')}     ${answers.stack}`);
  console.log(`  ${chalk.cyan('Objetivo:')}  ${answers.objective}`);
  console.log(`  ${chalk.cyan('Engines:')}   ${engineNames}`);
  console.log(`  ${chalk.cyan('Agentes internos:')} ${internalAgents.length} instalados`);
  console.log(`  ${chalk.cyan('Agentes iniciais:')} ${initialAgents.length} criados`);
  console.log(`  ${chalk.cyan('Fluxos iniciais:')} ${initialFlows.length} criados`);
  console.log(`  ${chalk.cyan('Versão:')}   ${version}`);
  console.log('');
  console.log(chalk.gray(label));
  console.log(chalk.hex('#ffa203')('  Fases AgentForge preparadas:'));
  console.log('  - discovery');
  console.log('  - agent-design');
  console.log('  - flow-design');
  console.log('  - policies');
  console.log('  - export');
  console.log('  - review');
  console.log('');
  console.log(chalk.gray('  Executor recomendado: sua IA ativa configurada.'));
  console.log(chalk.gray('  Próximo passo:'));
  for (const step of nextSteps) {
    console.log(chalk.cyan(step));
  }
  if (selectedEngines.length > 0) {
    console.log('');
    for (const engine of selectedEngines) {
      const heading = {
        codex: 'Codex:',
        'claude-code': 'Claude Code / Claude CLI:',
        claude: 'Claude Code / Claude CLI:',
        'gemini-cli': 'Gemini CLI:',
        gemini: 'Gemini CLI:',
        cursor: 'Cursor:',
        copilot: 'GitHub Copilot:',
        'github-copilot': 'GitHub Copilot:',
      }[engine.id] ?? `${engine.name}:`;
      const instruction = {
        codex: 'Abra Codex e digite `agentforge`.',
        'claude-code': 'Abra Claude Code/CLI e digite `agentforge` ou `/agentforge`, conforme disponível.',
        claude: 'Abra Claude Code/CLI e digite `agentforge` ou `/agentforge`, conforme disponível.',
        'gemini-cli': 'Abra Gemini CLI e digite `agentforge`.',
        gemini: 'Abra Gemini CLI e digite `agentforge`.',
        cursor: 'Use as rules geradas e peça `agentforge`.',
        copilot: 'Use as instructions geradas e peça para seguir o handoff do AgentForge.',
        'github-copilot': 'Use as instructions geradas e peça para seguir o handoff do AgentForge.',
      }[engine.id];
      console.log(chalk.gray(heading));
      console.log(chalk.cyan(`  - ${instruction}`));
    }
  }
  if (handoffReportPath) {
    console.log('');
    console.log(chalk.gray(`  Relatório de handoff: ${handoffReportPath}`));
  }
}

function collectPlannedEntrypoints(projectRoot, selectedEngines = []) {
  const planned = unique(selectedEngines.map((engine) => engine.entryFile));
  const existingEntrypoints = [
    'AGENTS.md',
    'CLAUDE.md',
    '.cursor/rules/agentforge.md',
    '.github/copilot-instructions.md',
  ].filter((entrypoint) => existsSync(join(projectRoot, entrypoint)));

  return unique([...existingEntrypoints, ...planned]);
}

function buildInstallPreview(projectRoot, answers, selectedEngines) {
  const setupMode = normalizeSetupMode(answers.setup_mode);
  const stateSeed = {
    project: answers.project_name,
    user_name: answers.user_name,
    project_type: answers.project_type ?? 'SaaS/Web App',
    stack: answers.stack ?? '',
    objective: answers.objective ?? '',
    setup_mode: setupMode,
    chat_language: answers.chat_language,
    doc_language: answers.doc_language,
    git_strategy: answers.git_strategy,
    engines: answers.engines,
    output_folder: answers.output_folder ?? PRODUCT.outputDir,
  };

  const analysisBundle = buildAnalysis(projectRoot, stateSeed, {
    skipContextAudit: true,
    ingestSummary: {
      ran: false,
      imported: 0,
      skipped: 0,
      reportPath: null,
    },
  });

  return {
    stateSeed,
    analysisBundle,
    entrypointsToRewrite: collectPlannedEntrypoints(projectRoot, selectedEngines),
  };
}

function printInstallPreview(chalk, preview) {
  const { analysisBundle } = preview;
  const patternResearch = analysisBundle.patternResearch ?? { recommendedPatterns: [] };
  const agents = analysisBundle.suggestions.agents ?? [];
  const flows = analysisBundle.suggestions.flows ?? [];
  const skills = analysisBundle.suggestions.skills ?? [];

  const printList = (label, items, formatter, emptyMessage = 'Nenhum sinal forte.') => {
    console.log(`  ${chalk.cyan(`${label}:`)}`);
    if (items.length === 0) {
      console.log(`    ${chalk.gray(emptyMessage)}`);
      return;
    }
    for (const item of items) {
      console.log(`    - ${formatter(item)}`);
    }
  };

  console.log('');
  console.log(chalk.bold('  Análise inicial:'));
  console.log(`  ${chalk.cyan('Stack detectada:')} ${analysisBundle.analysis.detectedStack.join(', ') || 'não detectada'}`);
  console.log(`  ${chalk.cyan('Framework:')} ${analysisBundle.analysis.framework}`);
  console.log(`  ${chalk.cyan('Arquitetura provável:')} ${analysisBundle.analysis.architecture}`);
  console.log('');

  printList(
    'Padrões recomendados',
    patternResearch.recommendedPatterns ?? [],
    (pattern) => `${pattern.name} [${pattern.confidence}] — ${pattern.evidence_summary}${pattern.tradeoffs?.length ? ` | tradeoff: ${pattern.tradeoffs[0]}` : ''}`,
  );
  console.log('');

  printList(
    'Agentes sugeridos',
    agents,
    (suggestion) => `${suggestion.name ?? suggestion.title ?? suggestion.id} (${suggestion.category ?? 'general'}, ${suggestion.confidence}) — ${suggestion.reason}`,
  );
  console.log('');

  printList(
    'Flows sugeridos',
    flows,
    (suggestion) => `${suggestion.name ?? suggestion.title ?? suggestion.id} (${suggestion.confidence}) — ${suggestion.reason}`,
  );
  console.log('');

  printList(
    'Skills sugeridas',
    skills,
    (suggestion) => `${suggestion.name ?? suggestion.title ?? suggestion.id} (${suggestion.confidence}) — ${suggestion.reason}`,
  );
  console.log('');

  printList(
    'Entrypoints que serão reescritos',
    preview.entrypointsToRewrite,
    (entrypoint) => entrypoint,
    'Nenhum entrypoint detectado para reescrita.',
  );
  console.log('');
}

export function shouldDefaultFinalizeAdoption(setupMode) {
  const normalized = normalizeSetupMode(setupMode);
  return normalized === 'adopt' || normalized === 'hybrid';
}

export default async function install(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  const { default: inquirer } = await import('inquirer');

  const projectRoot = resolve(process.cwd());
  const version = getVersion();

  console.log(chalk.bold(`\n  ${PRODUCT.name}\n`));
  console.log(chalk.gray('  Create, organize, evolve, and compile the agent-ready layer of your project.\n'));
  console.log(chalk.bold('  Instalação\n'));

  // Check existing installation
  const existing = checkExistingInstallation(projectRoot);
  if (existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} já está instalado (v${existing.version}) neste projeto.\n`));
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
    answers.setup_mode = normalizeSetupMode(answers.setup_mode ?? existing.state?.setup_mode);
  }

  const internalAgents = answers.internal_agents ?? [];
  const initialAgents = answers.initial_agents ?? [];
  const initialFlows = answers.initial_flows ?? [];
  const selectedEngines = ENGINES.filter(e => answers.engines.includes(e.id));
  const preview = buildInstallPreview(projectRoot, answers, selectedEngines);
  printInstallPreview(chalk, preview);

  const { applyStructure } = await inquirer.prompt([{
    type: 'confirm',
    name: 'applyStructure',
    message: 'Deseja aplicar a estrutura recomendada agora?',
    default: true,
  }]);

  if (!applyStructure) {
    const persistedResult = persistAnalysis(projectRoot, {
      ...preview.stateSeed,
      internal_agents: internalAgents,
      initial_agents: initialAgents,
      generated_agents: initialAgents,
      generated_subagents: [],
      initial_flows: initialFlows,
      flows: initialFlows,
      created_files: [],
    }, preview.analysisBundle, {
      ran: false,
      imported: 0,
      skipped: 0,
      reportPath: null,
    });
    applyCoreContextSynthesis(projectRoot, persistedResult.state, preview.analysisBundle);
    const handoffReportPath = writeHandoffReport(projectRoot, selectedEngines[0]?.id ?? '');

    printInstallSummary({
      chalk,
      answers,
      selectedEngines,
      internalAgents,
      initialAgents,
      initialFlows,
      version,
      handoffReportPath,
      setupModeOverride: normalizeSetupMode(answers.setup_mode),
      label: '  Estrutura recomendada preparada. A IA ativa ainda precisa executar as fases inteligentes.',
      nextSteps: [
        '  Abra sua IA configurada.',
        '  Digite `agentforge`.',
        '  A IA ativa deve seguir o handoff do AgentForge.',
      ],
    });
    return 0;
  }

  const writer = new Writer(projectRoot);
  const spinner = ora({ text: 'Aplicando a estrutura recomendada...', color: 'cyan' }).start();
  const deferExistingEntrypoints = true;
  const deferredEntrypoints = [];
  let handoffReportPath = null;

  try {
    for (const agent of internalAgents) {
      for (const engine of selectedEngines) {
        await writer.installSkill(agent, engine.skillsDir);
        if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
          await writer.installSkill(agent, engine.universalSkillsDir);
        }
      }
    }

    spinner.stop();

    const seenEntryFiles = new Set();
    for (const engine of selectedEngines) {
      if (seenEntryFiles.has(engine.entryFile)) continue;
      seenEntryFiles.add(engine.entryFile);
      const result = await writer.installEntryFile(engine, { deferExistingEntrypoints });
      if (result?.status === 'deferred') {
        deferredEntrypoints.push(result.path);
      }
    }

    if (selectedEngines.some((engine) => engine.id === 'cursor')) {
      const result = await writer.installEntryFile(
        {
          entryFile: '.cursor/rules/agentforge.md',
          entryTemplate: 'cursorrules',
        },
        { deferExistingEntrypoints },
      );
      if (result?.status === 'deferred') {
        deferredEntrypoints.push(result.path);
      }
    }

    spinner.start(`Criando a estrutura ${(existing.internalDir ?? PRODUCT.internalDir)}/...`);
    writer.createProductDir(answers, version);

    if (existing.installed) {
      const statePath = join(projectRoot, existing.internalDir ?? PRODUCT.internalDir, 'state.json');
      if (existsSync(statePath)) {
        const s = JSON.parse(readFileSync(statePath, 'utf8'));
        s.setup_mode = normalizeSetupMode(answers.setup_mode ?? s.setup_mode);
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

    if (answers.git_strategy === 'gitignore') {
      writer.updateGitignore(answers.output_folder);
    }

    writer.saveCreatedFiles();
    saveManifest(projectRoot, {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, writer.manifestPaths),
    });

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const persistedState = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, 'utf8'))
      : preview.stateSeed;
    const persistResult = persistAnalysis(projectRoot, persistedState, preview.analysisBundle, {
      ran: false,
      imported: 0,
      skipped: 0,
      reportPath: null,
    });
    applyCoreContextSynthesis(projectRoot, persistResult.state, preview.analysisBundle);

    handoffReportPath = writeHandoffReport(projectRoot, selectedEngines[0]?.id ?? '');

    spinner.stop();

    if (!applyStructure) {
      spinner.succeed(chalk.hex('#ffa203')('Estrutura recomendada preparada com sucesso!'));
      const validationResult = validateAgentForgeStructure(projectRoot);
      mkdirSync(dirname(validationResult.reportPath), { recursive: true });
      writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');

      if (!validationResult.valid) {
        console.log(chalk.red('  A validação da estrutura falhou.'));
        for (const error of validationResult.errors) {
          const prefix = error.file ? `${error.file}: ` : '';
          console.log(chalk.red(`  - ${prefix}${error.message}`));
        }
        console.log(chalk.gray(`  Relatório de validação: ${validationResult.reportPath}`));
        return 1;
      }

      printInstallSummary({
        chalk,
        answers,
        selectedEngines,
        internalAgents,
        initialAgents,
        initialFlows,
        version,
        handoffReportPath,
        setupModeOverride: normalizeSetupMode(answers.setup_mode),
        label: '  Estrutura recomendada preparada. A IA ativa ainda precisa executar as fases inteligentes.',
        nextSteps: [
          '  Abra sua IA configurada.',
          '  Digite `agentforge`.',
          '  A IA ativa deve seguir o handoff do AgentForge.',
        ],
      });
      return 0;
    }

    spinner.start('Compilando entrypoints...');
    const compileResult = await compileAgentForge(projectRoot, {
      force: true,
      takeoverEntrypoints: true,
      includeExistingEntrypoints: true,
      persistState: false,
    });

    if (compileResult.errors.length > 0) {
      spinner.fail(chalk.red('Erro durante a compilação da instalação.'));
      for (const error of compileResult.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
      console.log(chalk.gray(`  Relatório de compilação: ${compileResult.reportPath}`));
      return 1;
    }

    repairPhaseState(projectRoot);

    spinner.text = 'Validando a estrutura...';
    const validationResult = validateAgentForgeStructure(projectRoot);
    mkdirSync(dirname(validationResult.reportPath), { recursive: true });
    writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');

    if (!validationResult.valid) {
      spinner.fail(chalk.red('A estrutura recomendada foi aplicada, mas a validação falhou.'));
      for (const error of validationResult.errors) {
        const prefix = error.file ? `${error.file}: ` : '';
        console.log(chalk.red(`  - ${prefix}${error.message}`));
      }
      console.log(chalk.gray(`  Relatório de validação: ${validationResult.reportPath}`));
      return 1;
    }

    spinner.succeed(chalk.hex('#ffa203')('Estrutura recomendada aplicada com sucesso!'));
  } catch (err) {
    spinner.fail(chalk.red('Erro durante a instalação.'));
    throw err;
  }

  printInstallSummary({
    chalk,
    answers,
    selectedEngines,
    internalAgents,
    initialAgents,
    initialFlows,
    version,
    handoffReportPath,
    setupModeOverride: normalizeSetupMode(answers.setup_mode),
    label: '  Fases AgentForge preparadas:',
    nextSteps: [
      '  Abra sua IA configurada.',
      '  Digite `agentforge`.',
      '  A IA ativa deve seguir o handoff do AgentForge.',
    ],
  });

  if (deferredEntrypoints.length > 0) {
    console.log(chalk.gray(`  Entrypoints adiados: ${deferredEntrypoints.join(', ')}`));
  }
  console.log('');
  return 0;
}
