import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';
import inquirer from 'inquirer';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

const FLOW_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function listYamlFiles(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listYamlFiles(fullPath));
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    if (ext === '.yaml' || ext === '.yml') {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function parseYamlDoc(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(doc) ? doc : null;
  } catch {
    return null;
  }
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }

  if (typeof value !== 'string') return [];
  return value
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(list) {
  return [...new Set(list)];
}

function ensureAgentForgeInstalled(projectRoot) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  return existsSync(statePath);
}

function loadExistingAgents(projectRoot) {
  const agentsDir = join(projectRoot, PRODUCT.internalDir, 'agents');
  if (!existsSync(agentsDir) || !statSync(agentsDir).isDirectory()) return [];

  return listYamlFiles(agentsDir)
    .map((filePath) => {
      const doc = parseYamlDoc(filePath);
      if (!doc) return null;
      const id = normalizeString(doc.id) || basename(filePath, extname(filePath));
      if (!id) return null;
      return {
        id,
        name: normalizeString(doc.name) || id,
        file: rel(projectRoot, filePath),
      };
    })
    .filter(Boolean);
}

function validateFlowDraft(flowDoc, existingAgents) {
  const errors = [];
  const agentIds = new Set(existingAgents.map((agent) => agent.id));
  const knownSteps = new Set();

  const flowId = normalizeString(flowDoc.id);
  const flowName = normalizeString(flowDoc.name);
  const flowDescription = normalizeString(flowDoc.description);
  const steps = Array.isArray(flowDoc.steps) ? flowDoc.steps : null;

  if (!flowId) errors.push('O id do fluxo é obrigatório.');
  else if (!FLOW_ID_PATTERN.test(flowId)) errors.push('O id do fluxo deve estar em kebab-case.');
  if (!flowName) errors.push('O nome do fluxo é obrigatório.');
  if (!flowDescription) errors.push('A descrição do fluxo é obrigatória.');
  if (!steps || steps.length === 0) {
    errors.push('O fluxo deve ter pelo menos um step.');
    return errors;
  }

  for (const [index, step] of steps.entries()) {
    const stepRef = `steps[${index}]`;
    if (!isPlainObject(step)) {
      errors.push(`${stepRef}: cada step deve ser um objeto.`);
      continue;
    }

    const stepId = normalizeString(step.id);
    const agentId = normalizeString(step.agent);
    const instruction = normalizeString(step.instruction);
    const dependsOn = parseList(step.depends_on);
    const output = normalizeString(step.output);
    const gate = normalizeString(step.gate);

    if (!stepId) {
      errors.push(`${stepRef}: o step precisa de um id.`);
    } else if (!FLOW_ID_PATTERN.test(stepId)) {
      errors.push(`${stepRef}: o id do step deve estar em kebab-case.`);
    } else if (knownSteps.has(stepId)) {
      errors.push(`${stepRef}: id de step duplicado "${stepId}".`);
    }

    if (!agentId) {
      errors.push(`${stepRef}: o step precisa referenciar um agente.`);
    } else if (!agentIds.has(agentId)) {
      errors.push(`${stepRef}: agente inexistente referenciado "${agentId}".`);
    }

    if (!instruction) {
      errors.push(`${stepRef}: a instrução do step é obrigatória.`);
    }

    for (const dependency of dependsOn) {
      if (!knownSteps.has(dependency)) {
        errors.push(`${stepRef}: depends_on referencia step inexistente "${dependency}".`);
      }
    }

    if (gate && gate !== 'required') {
      errors.push(`${stepRef}: gate deve ser omitido ou definido como "required".`);
    }

    if (!output && step.gate === undefined) {
      // sem ação: output é opcional, mas permitimos o campo vazio.
    }

    if (stepId) {
      knownSteps.add(stepId);
    }
  }

  return errors;
}

function buildFlowDoc(answers) {
  const steps = answers.steps.map((step) => {
    const stepDoc = {
      id: normalizeString(step.id),
      agent: normalizeString(step.agent),
      instruction: normalizeString(step.instruction),
    };

    const dependsOn = parseList(step.depends_on);
    if (dependsOn.length > 0) {
      stepDoc.depends_on = dependsOn;
    }

    const output = normalizeString(step.output);
    if (output) {
      stepDoc.output = output;
    }

    if (step.gate) {
      stepDoc.gate = 'required';
    }

    return stepDoc;
  });

  const outputsExpected = unique(
    steps
      .map((step) => normalizeString(step.output))
      .filter(Boolean)
  );

  const flowDoc = {
    id: normalizeString(answers.id),
    name: normalizeString(answers.name),
    description: normalizeString(answers.description),
    steps,
  };

  if (outputsExpected.length > 0) {
    flowDoc.outputs_expected = outputsExpected;
  }

  return flowDoc;
}

function writeYamlFile(filePath, doc) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${YAML.stringify(doc).trim()}\n`, 'utf8');
}

function updateState(projectRoot, updater) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const nextState = updater(state);
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

function updateManifest(projectRoot, paths) {
  const current = loadManifest(projectRoot);
  const next = {
    ...current,
    ...buildManifest(projectRoot, paths),
  };
  saveManifest(projectRoot, next);
}

function renderSummary(flowDoc) {
  const lines = [];
  lines.push(`Flow criado: ${flowDoc.id}`);
  lines.push(`Steps: ${flowDoc.steps.length}`);
  return lines.join('\n');
}

export function createProjectFlow(projectRoot, answers) {
  if (!ensureAgentForgeInstalled(projectRoot)) {
    return { ok: false, errors: ['Instale o AgentForge primeiro com `agentforge install`.'] };
  }

  const existingAgents = loadExistingAgents(projectRoot);
  if (existingAgents.length === 0) {
    return { ok: false, errors: ['Nenhum agente encontrado em `.agentforge/agents/`.'] };
  }

  const flowDoc = buildFlowDoc(answers);
  const errors = validateFlowDraft(flowDoc, existingAgents);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const flowPath = join(projectRoot, PRODUCT.internalDir, 'flows', `${flowDoc.id}.yaml`);
  if (existsSync(flowPath)) {
    return { ok: false, errors: [`Já existe um flow com o id "${flowDoc.id}".`] };
  }

  writeYamlFile(flowPath, flowDoc);

  updateState(projectRoot, (state) => {
    const flows = Array.isArray(state.flows) ? state.flows : [];
    const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];

    return {
      ...state,
      flows: unique([...flows, flowDoc.id]),
      created_files: unique([...createdFiles, rel(projectRoot, flowPath)]),
    };
  });

  updateManifest(projectRoot, [
    rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'state.json')),
    rel(projectRoot, flowPath),
  ]);

  return {
    ok: true,
    flow: {
      id: flowDoc.id,
      path: rel(projectRoot, flowPath),
    },
    summary: renderSummary(flowDoc),
  };
}

async function promptForFlow(projectRoot) {
  if (!ensureAgentForgeInstalled(projectRoot)) {
    return { cancelled: false, error: 'Instale o AgentForge primeiro com `agentforge install`.' };
  }

  const agents = loadExistingAgents(projectRoot);
  if (agents.length === 0) {
    return { cancelled: false, error: 'Nenhum agente encontrado em `.agentforge/agents/`.' };
  }

  try {
    const base = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'ID do fluxo (kebab-case):',
        validate: (value) => {
          const id = normalizeString(value);
          if (!id) return 'O id é obrigatório.';
          if (!FLOW_ID_PATTERN.test(id)) return 'Use kebab-case, por exemplo: feature-development.';
          return true;
        },
      },
      {
        type: 'input',
        name: 'name',
        message: 'Nome do fluxo:',
        validate: (value) => (normalizeString(value) ? true : 'O nome é obrigatório.'),
      },
      {
        type: 'input',
        name: 'description',
        message: 'Descrição do fluxo:',
        validate: (value) => (normalizeString(value) ? true : 'A descrição é obrigatória.'),
      },
    ]);

    const steps = [];
    while (true) {
      const step = await inquirer.prompt([
        {
          type: 'input',
          name: 'id',
          message: `ID do step #${steps.length + 1} (kebab-case):`,
          validate: (value) => {
            const id = normalizeString(value);
            if (!id) return 'O id do step é obrigatório.';
            if (!FLOW_ID_PATTERN.test(id)) return 'Use kebab-case, por exemplo: clarify.';
            if (steps.some((item) => item.id === id)) return 'Já existe um step com esse id neste fluxo.';
            return true;
          },
        },
        {
          type: 'list',
          name: 'agent',
          message: 'Agente responsável pelo step:',
          choices: agents.map((agent) => ({
            name: `${agent.id} - ${agent.name}`,
            value: agent.id,
          })),
        },
        {
          type: 'input',
          name: 'instruction',
          message: 'Instrução do step:',
          validate: (value) => (normalizeString(value) ? true : 'A instrução é obrigatória.'),
        },
        {
          type: 'input',
          name: 'output',
          message: 'Output esperado do step (opcional):',
          default: '',
        },
        {
          type: 'input',
          name: 'depends_on',
          message: 'Depends on (opcional, separe por vírgula):',
          default: '',
        },
        {
          type: 'confirm',
          name: 'gate',
          message: 'Esse step é um gate obrigatório?',
          default: false,
        },
      ]);

      steps.push(step);

      const { addAnother } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAnother',
          message: 'Adicionar outro step?',
          default: false,
        },
      ]);

      if (!addAnother) break;
    }

    return {
      cancelled: false,
      answers: {
        ...base,
        steps,
      },
    };
  } catch (error) {
    return { cancelled: true, error };
  }
}

export default async function addFlow() {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();

  const promptResult = await promptForFlow(projectRoot);
  if (promptResult.cancelled) {
    console.log(chalk.hex('#ffa203')('\n  Operação cancelada. Nenhum arquivo foi alterado.\n'));
    return 0;
  }
  if (promptResult.error) {
    console.log(chalk.red(`\n  ${promptResult.error}\n`));
    return 1;
  }

  const result = createProjectFlow(projectRoot, promptResult.answers);
  if (!result.ok) {
    for (const error of result.errors) {
      console.log(chalk.red(`  ${error}`));
    }
    console.log('');
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`\n  ${result.summary}\n`));
  return 0;
}
