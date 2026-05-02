import { detectEngines } from './detector.js';
import {
  inferInitialAgents,
  inferInitialFlows,
  inferObjective,
  inferStack,
  runInstallPrompts,
} from './prompts.js';
import { normalizeSetupMode, PRODUCT } from '../product.js';
import { scanProjectSignals } from '../commands/project-signals.js';

function normalizeSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitList(value) {
  return String(value ?? '')
    .split(/[\n,;]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function buildInstallAnswers(raw = {}) {
  const setupMode = normalizeSetupMode(raw.setup_mode);
  const projectSignals = scanProjectSignals(process.cwd());
  const detectedStack = inferStack(projectSignals);
  const initialAgents = Array.isArray(raw.initial_agents) && raw.initial_agents.length > 0
    ? unique(raw.initial_agents)
    : inferInitialAgents(projectSignals, setupMode);
  const initialFlows = Array.isArray(raw.initial_flows) && raw.initial_flows.length > 0
    ? unique(raw.initial_flows)
    : inferInitialFlows(projectSignals, setupMode);
  const projectName = String(raw.project_name ?? projectSignals.projectName ?? process.cwd().split(/[\\/]/).pop() ?? '').trim();
  const userName = String(raw.user_name ?? '').trim();
  const projectType = String(raw.project_type ?? projectSignals.projectType ?? 'SaaS/Web App').trim() || 'SaaS/Web App';
  const stack = String(raw.stack ?? detectedStack.value).trim() || detectedStack.value;
  const objective = String(raw.objective ?? inferObjective(setupMode)).trim() || inferObjective(setupMode);
  const gitStrategy = String(raw.git_strategy ?? 'commit').trim() || 'commit';
  const engines = unique([...(raw.engines ?? []), ...splitList(raw.other_engines).map(normalizeSlug)]);

  return {
    engines,
    project_name: projectName,
    project: projectName,
    user_name: userName,
    project_type: projectType,
    stack,
    objective,
    setup_mode: setupMode,
    initial_agents: initialAgents,
    selected_agents: initialAgents,
    internal_agents: initialAgents,
    initial_flows: initialFlows,
    selected_flows: initialFlows,
    flows: initialFlows,
    git_strategy: gitStrategy,
    chat_language: raw.chat_language || 'pt-br',
    doc_language: raw.doc_language || 'pt-br',
    output_folder: PRODUCT.outputDir,
    answer_mode: 'agentforge',
    response_mode: 'agentforge',
    analysis_preferences: [
      projectType && `tipo:${projectType}`,
      stack && `stack:${stack}`,
      objective && `objetivo:${objective}`,
      gitStrategy && `git:${gitStrategy}`,
    ].filter(Boolean),
  };
}

async function promptAnswers() {
  const detectedEngines = detectEngines(process.cwd());
  const answers = await runInstallPrompts(detectedEngines);
  return buildInstallAnswers(answers);
}

export async function askInstallQuestions() {
  return promptAnswers();
}

export async function promptInstall() {
  return promptAnswers();
}

export async function collectInstallAnswers() {
  return promptAnswers();
}

export default promptAnswers;
