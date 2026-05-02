import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadPhaseDefinition, getNextPhase } from './phase-engine.js';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readYamlText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseArgs(args = []) {
  const engineIndex = args.indexOf('--engine');
  const phaseIndex = args.indexOf('--phase');
  return {
    json: args.includes('--json'),
    engine: engineIndex !== -1 ? normalizeString(args[engineIndex + 1]) : '',
    phase: phaseIndex !== -1 ? normalizeString(args[phaseIndex + 1]) : '',
  };
}

function engineInstructions(engine) {
  const normalized = normalizeString(engine).toLowerCase();
  if (normalized === 'codex') {
    return 'Abra Codex e digite `agentforge`.';
  }
  if (normalized === 'claude' || normalized === 'claude-code' || normalized === 'claude cli') {
    return 'Abra Claude Code/CLI e digite `agentforge` ou `/agentforge`, conforme disponível.';
  }
  if (normalized === 'gemini' || normalized === 'gemini-cli') {
    return 'Abra Gemini CLI e digite `agentforge`.';
  }
  if (normalized === 'cursor') {
    return 'Use as rules geradas e peça `agentforge`.';
  }
  if (normalized === 'copilot' || normalized === 'github-copilot') {
    return 'Use as instructions geradas e peça para seguir o handoff do AgentForge.';
  }
  return 'Use a IA ativa configurada e digite `agentforge`.';
}

function listContextPacks(contextIndexText) {
  const packs = [];
  const itemMatches = [...contextIndexText.matchAll(/^\s*-\s*id:\s*([^\n]+)$/gm)];
  for (const match of itemMatches) {
    packs.push(match[1].trim());
  }
  return [...new Set(packs)];
}

function listFiles(projectRoot, nextPhase, contextIndexText) {
  const files = [
    '.agentforge/harness/router.md',
    '.agentforge/harness/context-index.yaml',
    '.agentforge/state.json',
    '.agentforge/plan.md',
    '.agentforge/workflow/phases.yaml',
    '.agentforge/workflow/history.jsonl',
  ];
  if (existsSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'README.md'))) {
    files.push('.agentforge/ai/README.md');
  }
  if (nextPhase?.currentPhase?.reads?.length > 0) {
    files.push(...nextPhase.currentPhase.reads.map((entry) => `.agentforge/${entry.replace(/^\//, '')}`));
  }
  if (contextIndexText) {
    files.push(...listContextPacks(contextIndexText).map((id) => `.agentforge/context-pack:${id}`));
  }
  return [...new Set(files)];
}

export function buildHandoffData(projectRoot, { engine = '', phase = '' } = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = readJson(statePath) ?? {};
  const definition = loadPhaseDefinition(projectRoot);
  const next = getNextPhase(projectRoot, state, definition);
  const requestedPhaseId = normalizeString(phase);
  const requestedPhase = requestedPhaseId
    ? definition.phases.find((entry) => entry.id === requestedPhaseId) ?? null
    : null;
  const focusPhase = requestedPhase ?? next.currentPhase;
  const focusNextPhase = focusPhase ? definition.phases[definition.phases.findIndex((entry) => entry.id === focusPhase.id) + 1] ?? null : next.nextPhase;
  const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  const contextIndexText = readYamlText(contextIndexPath);
  const configuredEngines = Array.isArray(state.engines) ? state.engines : [];
  const availablePacks = listContextPacks(contextIndexText);
  const filesToRead = listFiles(projectRoot, { currentPhase: focusPhase }, contextIndexText);
  const instructions = engineInstructions(engine || configuredEngines[0] || '');

  return {
    project: state.project || state.project_name || 'AgentForge',
    engine: normalizeString(engine) || normalizeString(configuredEngines[0]) || 'active-ai',
    configured_engines: configuredEngines,
    current_phase: focusPhase?.id ?? next.currentPhase?.id ?? null,
    next_phase: focusNextPhase?.id ?? next.nextPhase?.id ?? null,
    workflow_complete: next.workflowComplete,
    instructions,
    files_to_read: filesToRead,
    files_allowed_to_write: [
      '.agentforge/reports/handoff.md',
      '.agentforge/reports/checkpoint.md',
    ],
    files_prohibited: [
      '.agentforge/state.json',
      '.agentforge/plan.md',
      '.agentforge/context/**',
      '.agentforge/agents/**',
      '.agentforge/flows/**',
      '.agentforge/policies/**',
      'project entrypoints',
    ],
    commands: [
      'npx @bcocheto/agentforge handoff',
      `npx @bcocheto/agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status done`,
      'npx @bcocheto/agentforge validate',
    ],
    playbooks: definition.phases.map((entry) => entry.id),
    context_packs: availablePacks,
    context_pack_note: contextIndexText ? 'Use `agentforge context-pack <phase-or-task>` quando disponível.' : 'Nenhum context pack explícito foi encontrado no índice atual.',
    completion_criteria: [
      'A IA ativa leu router e context-index.',
      'A próxima fase foi executada com julgamento contextual.',
      'O checkpoint foi registrado com `agentforge checkpoint <phase> --status done`.',
      'A estrutura foi validada com `agentforge validate`.',
    ],
    checkpoint: {
      command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status done`,
      blocked_command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status blocked --reason "missing context"`,
      skipped_command: `agentforge checkpoint ${focusPhase?.id ?? '<phase>'} --status skipped --reason "not applicable"`,
    },
    next_step: focusNextPhase?.id ?? 'none',
    recommended_command: 'npx @bcocheto/agentforge handoff',
    ai_instruction: instructions,
  };
}

export function renderHandoffReport(data) {
  const lines = [];
  lines.push('# AgentForge Handoff');
  lines.push('');
  lines.push(`- Projeto: ${data.project}`);
  lines.push(`- Executor recomendado: ${data.engine || 'sua IA ativa configurada'}`);
  lines.push(`- Próxima fase: ${data.current_phase ?? 'discovery'}`);
  lines.push(`- Próximo passo: ${data.next_step}`);
  lines.push(`- Comando recomendado: ${data.recommended_command}`);
  lines.push('');
  lines.push('## Engines configuradas');
  lines.push('');
  if ((data.configured_engines ?? []).length > 0) {
    for (const engine of data.configured_engines) {
      lines.push(`- ${engine}`);
    }
  } else {
    lines.push('- nenhuma detectada');
  }
  lines.push('');
  lines.push('## Como proceder');
  lines.push('');
  lines.push(`- ${data.ai_instruction}`);
  lines.push('- Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/state.json` antes de decidir.');
  lines.push('- Execute a próxima fase com julgamento contextual e ajuste o plano ao projeto.');
  lines.push('- Ao finalizar, registre o checkpoint e valide a estrutura.');
  lines.push('');
  lines.push('## Playbooks disponíveis');
  lines.push('');
  for (const playbook of data.playbooks ?? []) {
    lines.push(`- ${playbook}`);
  }
  lines.push('');
  lines.push('## Context packs disponíveis');
  lines.push('');
  if ((data.context_packs ?? []).length > 0) {
    for (const pack of data.context_packs) {
      lines.push(`- ${pack}`);
    }
  } else {
    lines.push('- nenhum context pack explícito encontrado');
  }
  lines.push('');
  lines.push('## Arquivos para ler');
  lines.push('');
  for (const file of data.files_to_read ?? []) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('## Arquivos permitidos para escrita');
  lines.push('');
  for (const file of data.files_allowed_to_write ?? []) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('## Arquivos proibidos');
  lines.push('');
  for (const file of data.files_prohibited ?? []) {
    lines.push(`- ${file}`);
  }
  lines.push('');
  lines.push('## Comandos úteis');
  lines.push('');
  for (const command of data.commands ?? []) {
    lines.push(`- ${command}`);
  }
  lines.push('');
  lines.push('## Critérios de conclusão');
  lines.push('');
  for (const criterion of data.completion_criteria ?? []) {
    lines.push(`- ${criterion}`);
  }
  lines.push('');
  lines.push('## Checkpoint final');
  lines.push('');
  lines.push(`- ${data.checkpoint?.command}`);
  lines.push(`- ${data.checkpoint?.blocked_command}`);
  lines.push(`- ${data.checkpoint?.skipped_command}`);
  lines.push('');
  lines.push('## Validação');
  lines.push('');
  lines.push('- Finalize com `agentforge validate`.');
  lines.push('- Nunca edite `state.json` ou `plan.md` manualmente.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

export default async function handoff(args = []) {
  const { default: chalk } = await import('chalk');
  const options = parseArgs(args);
  const projectRoot = process.cwd();
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const data = buildHandoffData(projectRoot, options);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'handoff.md');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(reportPath, renderHandoffReport(data), 'utf8');

  if (options.json) {
    console.log(JSON.stringify({ ...data, report_path: reportPath }, null, 2));
  } else {
    console.log(`\n${chalk.bold('AgentForge handoff')}\n`);
    console.log(`Executor recomendado: ${data.engine || 'sua IA ativa configurada'}`);
    console.log(`Próxima fase: ${data.current_phase ?? 'discovery'}`);
    console.log(`Comando recomendado: ${data.recommended_command}`);
    console.log(`Relatório gerado em ${reportPath}\n`);
  }

  return 0;
}
