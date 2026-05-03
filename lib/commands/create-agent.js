import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUGGESTION_DIR = join(PRODUCT.internalDir, 'suggestions', 'agents');
const REPORT_REL_PATH = '.agentforge/reports/agent-created.md';

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAgentSuggestion(suggestion = {}) {
  const title = normalizeString(suggestion.title);
  const name = normalizeString(suggestion.name) || title;
  const purpose = normalizeString(suggestion.purpose);
  const description = normalizeString(suggestion.description) || purpose || normalizeString(suggestion.reason);
  const responsibilities = unique([
    ...toArray(suggestion.responsibilities),
    ...toArray(suggestion.recommended_steps),
  ]);
  const reads = unique([
    ...toArray(suggestion.reads),
    ...toArray(suggestion.recommended_context),
  ]);
  const boundaries = unique([
    ...toArray(suggestion.boundaries),
    ...toArray(suggestion.limits),
    ...toArray(suggestion.safety_limits),
  ]);
  const limits = unique([
    ...toArray(suggestion.limits),
    ...toArray(suggestion.boundaries),
    ...toArray(suggestion.safety_limits),
  ]);

  return {
    ...suggestion,
    id: normalizeString(suggestion.id),
    name,
    title: title || name,
    purpose: purpose || description,
    description,
    reason: normalizeString(suggestion.reason) || purpose || description,
    category: normalizeString(suggestion.category),
    responsibilities,
    reads,
    skills: unique(toArray(suggestion.skills)),
    flows: unique(toArray(suggestion.flows)),
    boundaries,
    limits,
    recommended_context: unique(toArray(suggestion.recommended_context)),
    recommended_steps: unique(toArray(suggestion.recommended_steps)),
    safety_limits: unique(toArray(suggestion.safety_limits)),
  };
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function listFilesRecursive(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function parseYamlFile(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

function detectSuggestionPath(projectRoot, agentId) {
  const yamlPath = join(projectRoot, SUGGESTION_DIR, `${agentId}.yaml`);
  if (existsSync(yamlPath)) return yamlPath;
  const ymlPath = join(projectRoot, SUGGESTION_DIR, `${agentId}.yml`);
  if (existsSync(ymlPath)) return ymlPath;
  return null;
}

function detectAgentOutputPath(projectRoot, agentId) {
  const agentsDir = join(projectRoot, PRODUCT.internalDir, 'agents');
  const mdPath = join(agentsDir, `${agentId}.md`);
  const yamlPath = join(agentsDir, `${agentId}.yaml`);
  const ymlPath = join(agentsDir, `${agentId}.yml`);

  if (existsSync(mdPath)) return mdPath;
  if (existsSync(yamlPath)) return yamlPath;
  if (existsSync(ymlPath)) return ymlPath;

  const existingAgents = listFilesRecursive(agentsDir);
  if (existingAgents.some((filePath) => extname(filePath).toLowerCase() === '.md')) {
    return mdPath;
  }

  return yamlPath;
}

function renderMarkdownAgent(doc) {
  const lines = [];
  lines.push(`# ${doc.name}`);
  lines.push('');
  lines.push(doc.description || doc.mission || 'Sem descrição.');
  lines.push('');
  lines.push(`- ID: \`${doc.id}\``);
  lines.push(`- Categoria: \`${doc.category || 'unknown'}\``);
  lines.push(`- Fonte: \`${doc.source_suggestion || 'suggestion'}\``);
  lines.push('');

  const sections = [
    ['## Missão', doc.mission || doc.description || 'Sem missão definida.'],
    ['## Responsabilidades', doc.responsibilities ?? []],
    ['## Limites', doc.boundaries ?? []],
    ['## Leituras', doc.reads ?? []],
    ['## Skills', doc.skills ?? []],
    ['## Flows', doc.flows ?? []],
  ];

  for (const [title, value] of sections) {
    lines.push(title);
    lines.push('');
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push('- Não definido.');
      } else {
        for (const item of value) {
          lines.push(`- ${item}`);
        }
      }
    } else {
      lines.push(`- ${value}`);
    }
    lines.push('');
  }

  lines.push('## Handoff');
  lines.push('');
  lines.push(`- Próximo padrão: ${normalizeString(doc.handoff?.next) || normalizeString(doc.handoff?.default_next) || 'não definido'}`);
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function renderYamlAgent(doc) {
  return `${YAML.stringify(doc).trim()}\n`;
}

function renderAgentDocument(doc, format) {
  if (format === 'md') return renderMarkdownAgent(doc);
  return renderYamlAgent(doc);
}

function buildAgentDoc(projectRoot, suggestion, { outputPath, suggestionPath }) {
  const normalized = normalizeAgentSuggestion(suggestion);
  const handoffTarget = 'reviewer';

  return {
    id: normalized.id,
    name: normalized.name,
    title: normalized.title,
    category: normalized.category,
    description: normalized.description,
    mission: normalized.description,
    purpose: normalized.purpose,
    reason: normalized.reason,
    responsibilities: normalized.responsibilities,
    boundaries: normalized.boundaries,
    limits: normalized.limits,
    reads: normalized.reads,
    skills: normalized.skills,
    flows: normalized.flows,
    recommended_context: normalized.recommended_context,
    recommended_steps: normalized.recommended_steps,
    safety_limits: normalized.safety_limits,
    handoff: {
      next: handoffTarget,
    },
    generated_by: 'agentforge create-agent',
    source_suggestion: suggestionPath ? rel(projectRoot, suggestionPath) : rel(projectRoot, join(projectRoot, SUGGESTION_DIR, `${normalized.id}.yaml`)),
    output_path: rel(projectRoot, outputPath),
  };
}

function validateAgentDoc(doc) {
  const errors = [];

  if (!AGENT_ID_PATTERN.test(doc.id)) {
    errors.push('O id do agente deve estar em kebab-case.');
  }
  if (!normalizeString(doc.name)) {
    errors.push('O nome do agente é obrigatório.');
  }
  if (!normalizeString(doc.description) && !normalizeString(doc.mission)) {
    errors.push('A descrição/missão do agente é obrigatória.');
  }
  if (!Array.isArray(doc.responsibilities) || doc.responsibilities.length === 0) {
    errors.push('As responsabilidades principais são obrigatórias.');
  }
  if (!Array.isArray(doc.boundaries) || doc.boundaries.length === 0) {
    errors.push('Os limites do agente são obrigatórios.');
  }

  return errors;
}

function loadSuggestion(projectRoot, agentId) {
  const suggestionPath = detectSuggestionPath(projectRoot, agentId);
  if (!suggestionPath) return null;

  const suggestion = parseYamlFile(suggestionPath);
  if (!suggestion) return { error: `Sugestão inválida em ${rel(projectRoot, suggestionPath)}.` };

  return {
    path: suggestionPath,
    suggestion,
  };
}

function renderReport(result) {
  const lines = [];
  lines.push('# AgentForge Agent Creation');
  lines.push('');
  lines.push('## Criado');
  lines.push('');
  lines.push(`- Agente: ${result.agent.id}`);
  lines.push(`- Nome: ${result.agent.name}`);
  lines.push(`- Categoria: ${result.agent.category || 'unknown'}`);
  lines.push(`- Arquivo: \`${result.agentPath}\``);
  lines.push(`- Formato: ${result.outputFormat}`);
  lines.push(`- Sugestão de origem: \`${result.suggestionPath}\``);
  lines.push('');
  lines.push('## Responsabilidades');
  lines.push('');
  for (const item of result.agent.responsibilities) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Limites');
  lines.push('');
  for (const item of result.agent.boundaries) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Leituras');
  lines.push('');
  for (const item of result.agent.reads) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Skills');
  lines.push('');
  for (const item of result.agent.skills) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Flows');
  lines.push('');
  for (const item of result.agent.flows) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Handoff');
  lines.push('');
  lines.push(`- Próximo padrão: ${result.agent.handoff?.next || 'não definido'}`);
  lines.push('');
  lines.push('## Nota');
  lines.push('');
  lines.push('- Apenas o agente sugerido foi promovido para `.agentforge/agents/`.');
  lines.push('- O registro em `state.json` foi atualizado com o novo agente gerado.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function updateStateAndManifest(projectRoot, manifest, paths, agentId, agentPath) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const generatedAgents = Array.isArray(state.generated_agents) ? state.generated_agents : [];
  const nextState = {
    ...state,
    generated_agents: unique([...generatedAgents, agentId]),
    created_files: unique([...createdFiles, ...paths, rel(projectRoot, agentPath)]),
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...paths, rel(projectRoot, statePath)]),
  });

  return nextState;
}

function parseArgs(args = []) {
  const parsed = {
    help: false,
    force: false,
    agentId: '',
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (!parsed.agentId && !arg.startsWith('--')) {
      parsed.agentId = arg;
    }
  }

  return parsed;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Create Agent\n`));
  console.log(`  Uso: npx ${PRODUCT.command} create-agent <agent-id> [--force]\n`);
  console.log('  Promove uma sugestão de `.agentforge/suggestions/agents/` para `.agentforge/agents/`.');
  console.log('  Use --force para sobrescrever um agente existente.\n');
}

export function createProjectAgentFromSuggestion(projectRoot, agentId, { force = false } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const normalizedAgentId = normalizeString(agentId);
  if (!normalizedAgentId) {
    return {
      ok: false,
      errors: ['O agent-id é obrigatório.'],
    };
  }

  const suggestionResult = loadSuggestion(projectRoot, normalizedAgentId);
  if (!suggestionResult) {
    return {
      ok: false,
      errors: ['Run agentforge suggest-agents first.'],
    };
  }
  if (suggestionResult.error) {
    return {
      ok: false,
      errors: [suggestionResult.error],
    };
  }

  const suggestion = suggestionResult.suggestion;
  if (normalizeString(suggestion.id) !== normalizedAgentId) {
    return {
      ok: false,
      errors: [`A sugestão em ${rel(projectRoot, suggestionResult.path)} não corresponde ao agent-id informado.`],
    };
  }

  const outputPath = detectAgentOutputPath(projectRoot, normalizedAgentId);
  if (existsSync(outputPath) && !force) {
    return {
      ok: false,
      errors: [`Já existe um agente em ${rel(projectRoot, outputPath)}. Use --force para sobrescrever.`],
    };
  }

  const outputFormat = extname(outputPath).toLowerCase() === '.md' ? 'md' : 'yaml';
  const agentDoc = buildAgentDoc(projectRoot, suggestion, { outputPath, suggestionPath: suggestionResult.path });
  const validationErrors = validateAgentDoc(agentDoc);
  if (validationErrors.length > 0) {
    return { ok: false, errors: validationErrors };
  }

  const report = renderReport({
    agent: agentDoc,
    suggestionPath: rel(projectRoot, suggestionResult.path),
    agentPath: rel(projectRoot, outputPath),
    outputFormat,
  });

  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(outputPath, renderAgentDocument(agentDoc, outputFormat), { force: true });
  writer.writeGeneratedFile(join(projectRoot, REPORT_REL_PATH), report, { force: true });

  const manifest = loadManifest(projectRoot);
  const nextState = updateStateAndManifest(
    projectRoot,
    manifest,
    [rel(projectRoot, outputPath), REPORT_REL_PATH],
    agentDoc.id,
    outputPath,
  );

  return {
    ok: true,
    agent: agentDoc,
    outputFormat,
    agentPath: rel(projectRoot, outputPath),
    suggestionPath: rel(projectRoot, suggestionResult.path),
    reportPath: REPORT_REL_PATH,
    state: nextState,
  };
}

export default async function createAgent(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  if (!parsed.agentId) {
    console.log(chalk.red('  O agent-id é obrigatório. Use `agentforge suggest-agents` primeiro.'));
    return 1;
  }

  const result = createProjectAgentFromSuggestion(process.cwd(), parsed.agentId, { force: parsed.force });
  if (!result.ok) {
    console.log(chalk.red(`  ${result.errors[0]}`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`  Agente criado em ${result.agentPath}`));
  console.log(chalk.gray(`  Sugestão: ${result.suggestionPath}`));
  console.log(chalk.gray(`  Report: ${result.reportPath}`));
  console.log(chalk.gray(`  Formato: ${result.outputFormat}`));
  return 0;
}
