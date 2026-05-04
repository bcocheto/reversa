import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import inquirer from 'inquirer';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { createProjectAgentFromSuggestion } from './create-agent.js';
import { runAdoptApplyFromBlueprint } from './adopt.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const REPORT_REL_PATH = '.agentforge/reports/apply-suggestions.md';
const AGENT_SUGGESTION_DIR = '.agentforge/suggestions/agents';
const SKILL_SUGGESTION_DIRS = ['.agentforge/skill-suggestions', '.agentforge/suggestions/skills'];
const FLOW_SUGGESTION_DIR = '.agentforge/suggestions/flows';
const POLICY_SUGGESTION_DIR = '.agentforge/suggestions/policies';
const CONTEXT_INDEX_REL_PATH = '.agentforge/harness/context-index.yaml';
const TEMPLATE_ROOT = join(REPO_ROOT, 'templates', 'agentforge');

const SKILL_TASK_CONTEXTS = {
  'run-tests': ['feature', 'bugfix', 'review'],
  'run-lint': ['feature', 'refactor', 'review'],
  typecheck: ['feature', 'bugfix', 'refactor', 'review'],
  'database-migration': ['feature', 'bugfix'],
  'update-docs': ['documentation'],
  'ci-diagnosis': ['review', 'bugfix'],
  'release-checklist': ['feature', 'review'],
  'docker-compose-workflow': ['feature', 'bugfix'],
  'review-pr': ['review'],
  'review-changes': ['review'],
  'api-contract-review': ['review'],
  'security-review': ['review'],
  'frontend-component-review': ['feature', 'review'],
  'backend-endpoint-review': ['feature', 'bugfix', 'review'],
  'dependency-update': ['refactor', 'review'],
};

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

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
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

function loadContextIndexDocument(projectRoot) {
  const absPath = join(projectRoot, CONTEXT_INDEX_REL_PATH);
  const relPath = rel(projectRoot, absPath);

  if (!existsSync(absPath)) {
    return { absPath, relPath, doc: null };
  }

  try {
    const doc = YAML.parse(readFileSync(absPath, 'utf8'));
    if (isPlainObject(doc)) return { absPath, relPath, doc };
  } catch {
    // fall through
  }

  return { absPath, relPath, doc: null };
}

function mergeObjectArrayById(items = [], entry) {
  const next = Array.isArray(items) ? [...items] : [];
  const normalizedId = normalizeString(entry?.id);
  if (!normalizedId) return next;

  const index = next.findIndex((item) => isPlainObject(item) && normalizeString(item.id) === normalizedId);
  if (index >= 0) {
    next[index] = { ...next[index], ...entry };
    return next;
  }

  next.push(entry);
  return next;
}

function extractTaskContextModes(value) {
  if (Array.isArray(value)) return unique(value.map((item) => normalizeString(item)));
  if (typeof value === 'string') return unique(toArray(value));
  if (isPlainObject(value)) {
    return unique(Object.entries(value).flatMap(([key, entry]) => (entry ? [normalizeString(key)] : [])));
  }
  return [];
}

function normalizeContextPurpose(suggestion) {
  return normalizeString(suggestion?.purpose)
    || normalizeString(suggestion?.description)
    || normalizeString(suggestion?.reason)
    || normalizeString(suggestion?.name);
}

function buildContextIndexPatch(partialDoc) {
  const doc = isPlainObject(partialDoc) ? partialDoc : {};
  return `${YAML.stringify(doc).trim()}\n`;
}

function mergeTaskContextSection(taskContextsDoc, modes, sectionName, targetPath) {
  const nextTaskContexts = isPlainObject(taskContextsDoc) ? { ...taskContextsDoc } : {};
  const patchTaskContexts = {};
  const changedModes = [];

  for (const mode of unique(modes)) {
    const currentGroup = isPlainObject(nextTaskContexts[mode]) ? { ...nextTaskContexts[mode] } : {};
    const currentValues = Array.isArray(currentGroup[sectionName]) ? [...currentGroup[sectionName]] : [];
    const mergedValues = unique([...currentValues, targetPath]);
    const changed = mergedValues.length !== currentValues.length || mergedValues.some((value, index) => value !== currentValues[index]);
    currentGroup[sectionName] = mergedValues;
    nextTaskContexts[mode] = currentGroup;

    if (changed) {
      changedModes.push(mode);
      patchTaskContexts[mode] = {
        [sectionName]: mergedValues,
      };
    }
  }

  return {
    task_contexts: nextTaskContexts,
    changedModes: unique(changedModes),
    patchTaskContexts,
  };
}

function buildContextIndexUpdate(projectRoot, manifest, {
  kind,
  entry = null,
  targetPath = null,
  taskContextSection = null,
  taskContextModes = [],
  force = false,
  apply = false,
} = {}) {
  const contextIndex = loadContextIndexDocument(projectRoot);
  if (!contextIndex.doc) {
    return {
      kind,
      path: contextIndex.relPath,
      updated: false,
      wrote: false,
      skipped: false,
      reason: 'context-index-missing',
      patch: null,
      content: null,
      summary: [],
    };
  }

  const relPath = contextIndex.relPath;
  const status = manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'modified';
  const writeAllowed = status !== 'modified' || force;
  const nextDoc = { ...contextIndex.doc };
  const patchDoc = {};
  const summary = [];
  let changed = false;

  if (kind === 'agent') {
    const nextAgents = mergeObjectArrayById(nextDoc.agents, entry);
    if (JSON.stringify(nextAgents) !== JSON.stringify(nextDoc.agents ?? [])) changed = true;
    nextDoc.agents = nextAgents;
    patchDoc.agents = [entry];
    summary.push(`agents.${entry.id}`);
  } else if (kind === 'skill') {
    const nextSkills = mergeObjectArrayById(nextDoc.skills, entry);
    if (JSON.stringify(nextSkills) !== JSON.stringify(nextDoc.skills ?? [])) changed = true;
    nextDoc.skills = nextSkills;
    patchDoc.skills = [entry];
    summary.push(`skills.${entry.id}`);
  } else if (kind === 'flow') {
    const nextFlows = mergeObjectArrayById(nextDoc.flows, entry);
    if (JSON.stringify(nextFlows) !== JSON.stringify(nextDoc.flows ?? [])) changed = true;
    nextDoc.flows = nextFlows;
    patchDoc.flows = [entry];
    summary.push(`flows.${entry.id}`);
  }

  if (taskContextSection && unique(taskContextModes).length > 0) {
    const taskContextResult = mergeTaskContextSection(nextDoc.task_contexts, taskContextModes, taskContextSection, targetPath);
    if (taskContextResult.changedModes.length > 0) {
      changed = true;
      nextDoc.task_contexts = taskContextResult.task_contexts;
      patchDoc.task_contexts = taskContextResult.patchTaskContexts;
      for (const mode of taskContextResult.changedModes) {
        summary.push(`task_contexts.${mode}.${taskContextSection}`);
      }
    }
  }

  if (!changed) {
    return {
      kind,
      path: relPath,
      updated: false,
      wrote: false,
      skipped: false,
      reason: null,
      patch: null,
      content: null,
      summary,
    };
  }

  const skipped = !writeAllowed;
  const content = buildContextIndexPatch(nextDoc);

  return {
    kind,
    path: relPath,
    updated: Boolean(apply && writeAllowed),
    wrote: Boolean(apply && writeAllowed),
    skipped,
    reason: skipped ? 'context-index-modified' : null,
    patch: buildContextIndexPatch(patchDoc),
    content: apply && writeAllowed ? content : null,
    summary,
    status,
  };
}

function loadSuggestionsFromDirs(projectRoot, relDirs) {
  const suggestions = [];
  for (const relDir of relDirs) {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const absPath of listFilesRecursive(absDir)) {
      const parsed = parseYamlFile(absPath);
      if (!parsed) continue;
      suggestions.push({
        source_path: rel(projectRoot, absPath),
        doc: parsed,
      });
    }
  }
  return suggestions;
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

function renderSkillDocument(suggestion) {
  const lines = [];
  lines.push('---');
  lines.push(YAML.stringify({
    name: suggestion.name,
    description: suggestion.description,
    license: 'MIT',
    metadata: {
      framework: 'agentforge',
      type: 'project-skill',
      source: 'apply-suggestions',
      suggestion_id: suggestion.id,
      confidence: suggestion.confidence,
    },
  }).trimEnd());
  lines.push('---');
  lines.push('');
  lines.push(`# ${suggestion.name}`);
  lines.push('');
  lines.push('## Quando usar');
  lines.push('');
  lines.push(`- ${suggestion.reason}`);
  for (const trigger of suggestion.triggers) {
    lines.push(`- Gatilho: \`${trigger}\``);
  }
  lines.push('');
  lines.push('## Contexto necessário');
  lines.push('');
  if (suggestion.recommended_context.length === 0) {
    lines.push('- Nenhum contexto adicional foi identificado.');
  } else {
    for (const item of suggestion.recommended_context) {
      lines.push(`- \`${item}\``);
    }
  }
  lines.push('');
  lines.push('## Procedimento');
  lines.push('');
  if (suggestion.recommended_steps.length === 0) {
    lines.push('1. Ler a sugestão de origem.');
    lines.push('2. Identificar o comando ou fluxo principal.');
    lines.push('3. Executar a tarefa de forma segura e revisável.');
  } else {
    suggestion.recommended_steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  lines.push('');
  lines.push('## Checklist');
  lines.push('');
  lines.push('- Frontmatter válido.');
  lines.push('- Procedimento legível e sequenciado.');
  lines.push('- Contexto e limites claros.');
  lines.push('- Evidências de origem incluídas.');
  lines.push('');
  lines.push('## Saída esperada');
  lines.push('');
  lines.push('- Skill pronta para uso humano e por agentes.');
  lines.push('- Próximos passos claros para aplicação da skill.');
  lines.push('- Limites e contexto explicitados.');
  lines.push('');
  lines.push('## Limites de segurança');
  lines.push('');
  if (suggestion.safety_limits.length === 0) {
    lines.push('- Nenhum limite adicional foi informado.');
  } else {
    for (const item of suggestion.safety_limits) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');
  lines.push('## Evidências de origem');
  lines.push('');
  lines.push(`- Sugestão de origem: \`${suggestion.source_path}\``);
  if (suggestion.source_evidence.length === 0) {
    lines.push('- Nenhuma evidência explícita foi registrada na sugestão de origem.');
  } else {
    for (const item of suggestion.source_evidence) {
      const lineLabel = Number.isInteger(item.line) ? `:${item.line}` : '';
      const snippet = normalizeString(item.snippet || item.content || '');
      lines.push(`- \`${normalizeString(item.file) || 'origem desconhecida'}${lineLabel}\` - ${snippet}`);
    }
  }
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function validateSkillDocument(content, suggestion) {
  const errors = [];
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push('SKILL.md precisa começar com frontmatter YAML delimitado por `---`.');
    return errors;
  }

  let frontmatter;
  try {
    frontmatter = YAML.parse(match[1]);
  } catch {
    errors.push('Frontmatter YAML inválido.');
    return errors;
  }

  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    errors.push('Frontmatter deve ser um objeto YAML.');
    return errors;
  }

  if (normalizeString(frontmatter.name) !== suggestion.name) {
    errors.push('Frontmatter deve conter o nome da skill.');
  }
  if (normalizeString(frontmatter.description) !== suggestion.description) {
    errors.push('Frontmatter deve conter a descrição da skill.');
  }
  if (normalizeString(frontmatter.license) !== 'MIT') {
    errors.push('Frontmatter deve declarar license: MIT.');
  }

  const metadata = frontmatter.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push('Frontmatter deve conter metadata estruturado.');
  } else {
    if (normalizeString(metadata.framework) !== 'agentforge') errors.push('metadata.framework deve ser agentforge.');
    if (normalizeString(metadata.type) !== 'project-skill') errors.push('metadata.type deve ser project-skill.');
    if (normalizeString(metadata.source) !== 'apply-suggestions') errors.push('metadata.source deve ser apply-suggestions.');
    if (normalizeString(metadata.suggestion_id) !== suggestion.id) errors.push('metadata.suggestion_id deve corresponder ao skill-id.');
    if (!['high', 'medium', 'low'].includes(normalizeString(metadata.confidence))) {
      errors.push('metadata.confidence deve ser high, medium ou low.');
    }
  }

  const body = match[2];
  if (!/^#\s+.+/m.test(body)) errors.push('SKILL.md precisa ter um título `# ...`.');
  if (!/##\s+Quando usar/m.test(body)) errors.push('SKILL.md precisa descrever `Quando usar`.');
  if (!/##\s+Procedimento/m.test(body)) errors.push('SKILL.md precisa descrever `Procedimento`.');
  if (!/^\s*(?:\d+\.|-)\s+.+/m.test(body)) errors.push('SKILL.md precisa conter um procedimento em lista numerada ou com bullets.');
  if (!/##\s+Checklist/m.test(body)) errors.push('SKILL.md precisa conter `Checklist`.');
  if (!/##\s+Saída esperada/m.test(body)) errors.push('SKILL.md precisa conter `Saída esperada`.');
  if (!/##\s+Limites de segurança/m.test(body)) errors.push('SKILL.md precisa conter `Limites de segurança`.');
  if (!/##\s+Evidências de origem/m.test(body)) errors.push('SKILL.md precisa conter `Evidências de origem`.');

  return errors;
}

function updateSkillContextIndex(projectRoot, manifest, skillId, skillDescription, { force = false, apply = false } = {}) {
  return buildContextIndexUpdate(projectRoot, manifest, {
    kind: 'skill',
    entry: {
      id: skillId,
      path: `skills/${skillId}/SKILL.md`,
      purpose: skillDescription,
    },
    targetPath: `skills/${skillId}/SKILL.md`,
    taskContextSection: 'skills',
    taskContextModes: unique(SKILL_TASK_CONTEXTS[skillId] ?? []),
    force,
    apply,
  });
}

function resolveTaskContextModesFromDocument(suggestion, contextIndexDoc) {
  const explicit = unique([
    ...extractTaskContextModes(suggestion?.task_contexts),
    ...extractTaskContextModes(suggestion?.task_context),
    ...extractTaskContextModes(suggestion?.contexts),
    ...extractTaskContextModes(suggestion?.modes),
  ]);
  if (explicit.length > 0) return explicit;
  const id = normalizeString(suggestion?.id);
  if (id && isPlainObject(contextIndexDoc?.task_contexts) && Object.prototype.hasOwnProperty.call(contextIndexDoc.task_contexts, id)) {
    return [id];
  }
  return [];
}

function updateFlowContextIndex(projectRoot, manifest, suggestion, { force = false, apply = false } = {}) {
  const id = normalizeString(suggestion?.id);
  const targetPath = `flows/${id}.yaml`;
  const contextIndex = loadContextIndexDocument(projectRoot);
  return buildContextIndexUpdate(projectRoot, manifest, {
    kind: 'flow',
    entry: {
      id,
      path: targetPath,
      purpose: normalizeContextPurpose(suggestion),
    },
    targetPath,
    taskContextSection: 'flows',
    taskContextModes: resolveTaskContextModesFromDocument(suggestion, contextIndex.doc),
    force,
    apply,
  });
}

function updatePolicyContextIndex(projectRoot, manifest, suggestion, { force = false, apply = false } = {}) {
  const id = normalizeString(suggestion?.id);
  const contextIndex = loadContextIndexDocument(projectRoot);
  return buildContextIndexUpdate(projectRoot, manifest, {
    kind: 'policy',
    targetPath: `policies/${id}.yaml`,
    taskContextSection: 'policies',
    taskContextModes: resolveTaskContextModesFromDocument(suggestion, contextIndex.doc),
    force,
    apply,
  });
}

function updateAgentContextIndex(projectRoot, manifest, suggestion, agentPath, { force = false, apply = false } = {}) {
  return buildContextIndexUpdate(projectRoot, manifest, {
    kind: 'agent',
    entry: {
      id: normalizeString(suggestion?.id),
      path: normalizeString(agentPath),
      purpose: normalizeContextPurpose(suggestion),
    },
    force,
    apply,
  });
}

function renderGenericFlowDoc(suggestion) {
  const id = suggestion.id;
  const name = suggestion.name;
  const goal = suggestion.description || suggestion.reason || 'Fluxo operacional do AgentForge.';
  const trigger = suggestion.reason ? `Quando ${suggestion.reason.toLowerCase()}` : 'Quando o fluxo precisar ser aplicado.';
  const recommendedSteps = suggestion.recommended_steps.length > 0
    ? suggestion.recommended_steps
    : ['Consolidar o contexto.', 'Executar a mudança mínima.', 'Validar o resultado.'];

  const steps = [];
  const idLower = id.toLowerCase();
  const agentOrder = idLower.includes('release')
    ? ['orchestrator', 'qa', 'security', 'devops', 'reviewer']
    : idLower.includes('bugfix')
      ? ['orchestrator', 'engineer', 'reviewer']
      : idLower.includes('review')
        ? ['orchestrator', 'reviewer']
        : idLower.includes('refactor')
          ? ['orchestrator', 'architect', 'engineer', 'reviewer']
          : ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'];

  for (let index = 0; index < recommendedSteps.length; index += 1) {
    const stepId = index === 0 ? 'discover' : index === recommendedSteps.length - 1 ? 'review' : `step-${index + 1}`;
    const agent = agentOrder[Math.min(index, agentOrder.length - 1)] ?? 'orchestrator';
    steps.push({
      id: stepId,
      name: recommendedSteps[index].split('.').shift().trim() || `Etapa ${index + 1}`,
      agent,
      description: recommendedSteps[index],
    });
  }

  const checkpoints = suggestion.safety_limits.length > 0
    ? unique([...suggestion.safety_limits, 'Resultado validado'])
    : ['Resultado validado'];

  return {
    id,
    name,
    goal,
    trigger,
    steps,
    checkpoints,
    done_when: [suggestion.reason || 'O fluxo recomendado foi aplicado.'],
  };
}

function readTemplateIfExists(relTemplatePath) {
  const absPath = join(TEMPLATE_ROOT, relTemplatePath);
  if (!existsSync(absPath)) return null;
  return readText(absPath);
}

function renderFlowDocument(suggestion) {
  const templatePath = `flows/${suggestion.id}.yaml`;
  const template = readTemplateIfExists(templatePath);
  if (template) return `${template.trim()}\n`;
  return `${YAML.stringify(renderGenericFlowDoc(suggestion)).trim()}\n`;
}

function renderPolicyDocument(suggestion) {
  const templatePath = `policies/${suggestion.id}.yaml`;
  const template = readTemplateIfExists(templatePath);
  if (template) return `${template.trim()}\n`;

  return `${YAML.stringify({
    name: suggestion.name,
    description: suggestion.description || suggestion.reason || 'Política recomendada por análise.',
    required_for: suggestion.safety_limits.length > 0 ? suggestion.safety_limits : [suggestion.reason || 'uso seguro do fluxo'],
    default_channel: 'chat',
    notes: unique([suggestion.reason, ...suggestion.safety_limits]),
  }).trim()}\n`;
}

function renderAgentSuggestion(suggestion, sourcePath) {
  return {
    ...suggestion,
    source_path: sourcePath,
    name: normalizeString(suggestion.name) || normalizeString(suggestion.title) || suggestion.id,
    category: normalizeString(suggestion.category) || 'core',
    description: normalizeString(suggestion.description) || normalizeString(suggestion.reason),
    reason: normalizeString(suggestion.reason) || normalizeString(suggestion.description),
    confidence: normalizeString(suggestion.confidence) || 'medium',
    responsibilities: toArray(suggestion.responsibilities),
    reads: toArray(suggestion.reads),
    skills: toArray(suggestion.skills),
    flows: toArray(suggestion.flows),
    limits: toArray(suggestion.limits || suggestion.boundaries),
    evidence: Array.isArray(suggestion.evidence) ? suggestion.evidence : [],
  };
}

function renderSkillSuggestion(suggestion, sourcePath) {
  return {
    source_path: sourcePath,
    id: normalizeString(suggestion.id),
    name: normalizeString(suggestion.name) || normalizeString(suggestion.title) || suggestion.id,
    description: normalizeString(suggestion.description) || normalizeString(suggestion.title) || normalizeString(suggestion.reason),
    reason: normalizeString(suggestion.reason) || normalizeString(suggestion.description) || normalizeString(suggestion.title),
    confidence: normalizeString(suggestion.confidence) || 'medium',
    triggers: toArray(suggestion.triggers ?? suggestion.signals),
    recommended_context: toArray(suggestion.recommended_context),
    recommended_steps: toArray(suggestion.recommended_steps),
    safety_limits: toArray(suggestion.safety_limits),
    source_evidence: Array.isArray(suggestion.source_evidence) ? suggestion.source_evidence : [],
  };
}

function renderFlowSuggestion(suggestion, sourcePath) {
  return {
    source_path: sourcePath,
    id: normalizeString(suggestion.id),
    name: normalizeString(suggestion.name) || normalizeString(suggestion.title) || suggestion.id,
    description: normalizeString(suggestion.description) || normalizeString(suggestion.reason),
    reason: normalizeString(suggestion.reason) || normalizeString(suggestion.description),
    confidence: normalizeString(suggestion.confidence) || 'medium',
    recommended_steps: toArray(suggestion.recommended_steps),
    safety_limits: toArray(suggestion.safety_limits),
    signals: toArray(suggestion.signals),
    task_contexts: extractTaskContextModes(suggestion.task_contexts),
    target_path: normalizeString(suggestion.target_path) || `.agentforge/flows/${normalizeString(suggestion.id)}.yaml`,
  };
}

function renderPolicySuggestion(suggestion, sourcePath) {
  return {
    source_path: sourcePath,
    id: normalizeString(suggestion.id),
    name: normalizeString(suggestion.name) || normalizeString(suggestion.title) || suggestion.id,
    description: normalizeString(suggestion.description) || normalizeString(suggestion.reason),
    reason: normalizeString(suggestion.reason) || normalizeString(suggestion.description),
    confidence: normalizeString(suggestion.confidence) || 'medium',
    safety_limits: toArray(suggestion.safety_limits),
    signals: toArray(suggestion.signals),
    task_contexts: extractTaskContextModes(suggestion.task_contexts),
    target_path: normalizeString(suggestion.target_path) || `.agentforge/policies/${normalizeString(suggestion.id)}.yaml`,
  };
}

function applyAgentSuggestion(projectRoot, suggestion, { force = false } = {}) {
  const result = createProjectAgentFromSuggestion(projectRoot, suggestion.id, { force });
  if (!result.ok) {
    return result;
  }

  const manifest = loadManifest(projectRoot);
  const contextIndexChange = updateAgentContextIndex(
    projectRoot,
    manifest,
    suggestion,
    result.agentPath,
    { force, apply: true },
  );

  if (contextIndexChange.wrote && contextIndexChange.content) {
    const writer = new Writer(projectRoot);
    writer.writeGeneratedFile(join(projectRoot, contextIndexChange.path), contextIndexChange.content, { force: true });
    writer.saveCreatedFiles();

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
    const nextState = {
      ...state,
      created_files: unique([...createdFiles, contextIndexChange.path]),
    };
    writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

    saveManifest(projectRoot, {
      ...manifest,
      ...buildManifest(projectRoot, [contextIndexChange.path, rel(projectRoot, statePath)]),
    });
  }

  return {
    ...result,
    contextIndexChange,
  };
}

function collectApplyPlan(projectRoot, selection) {
  const plan = {
    agents: [],
    skills: [],
    flows: [],
    policies: [],
  };

  if (selection.agents) {
    for (const entry of loadSuggestionsFromDirs(projectRoot, [AGENT_SUGGESTION_DIR])) {
      const suggestion = renderAgentSuggestion(entry.doc, entry.source_path);
      const outputPath = detectAgentOutputPath(projectRoot, suggestion.id);
      const existing = existsSync(outputPath) ? fileStatus(projectRoot, rel(projectRoot, outputPath), loadManifest(projectRoot)[rel(projectRoot, outputPath)]) : 'missing';
      plan.agents.push({
        ...suggestion,
        outputPath,
        relPath: rel(projectRoot, outputPath),
        action: existing === 'intact' || !existsSync(outputPath) ? 'apply' : 'skip',
        existingStatus: existing,
      });
    }
  }

  if (selection.skills) {
    const entries = loadSuggestionsFromDirs(projectRoot, SKILL_SUGGESTION_DIRS);
    for (const entry of entries) {
      const suggestion = renderSkillSuggestion(entry.doc, entry.source_path);
      const outputPath = join(projectRoot, PRODUCT.internalDir, 'skills', suggestion.id, 'SKILL.md');
      const manifest = loadManifest(projectRoot);
      const relPath = rel(projectRoot, outputPath);
      const existing = existsSync(outputPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
      plan.skills.push({
        ...suggestion,
        outputPath,
        relPath,
        action: existing === 'intact' || !existsSync(outputPath) ? 'apply' : 'skip',
        existingStatus: existing,
      });
    }
  }

  if (selection.flows) {
    for (const entry of loadSuggestionsFromDirs(projectRoot, [FLOW_SUGGESTION_DIR])) {
      const suggestion = renderFlowSuggestion(entry.doc, entry.source_path);
      const outputPath = join(projectRoot, PRODUCT.internalDir, 'flows', `${suggestion.id}.yaml`);
      const manifest = loadManifest(projectRoot);
      const relPath = rel(projectRoot, outputPath);
      const existing = existsSync(outputPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
      plan.flows.push({
        ...suggestion,
        outputPath,
        relPath,
        action: existing === 'intact' || !existsSync(outputPath) ? 'apply' : 'skip',
        existingStatus: existing,
      });
    }
  }

  if (selection.policies) {
    for (const entry of loadSuggestionsFromDirs(projectRoot, [POLICY_SUGGESTION_DIR])) {
      const suggestion = renderPolicySuggestion(entry.doc, entry.source_path);
      const outputPath = join(projectRoot, PRODUCT.internalDir, 'policies', `${suggestion.id}.yaml`);
      const manifest = loadManifest(projectRoot);
      const relPath = rel(projectRoot, outputPath);
      const existing = existsSync(outputPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
      plan.policies.push({
        ...suggestion,
        outputPath,
        relPath,
        action: existing === 'intact' || !existsSync(outputPath) ? 'apply' : 'skip',
        existingStatus: existing,
      });
    }
  }

  return plan;
}

function renderReport({ selection, plan, applied, skipped, harnessUpdates = [], dryRun, confirmed }) {
  const lines = [];
  lines.push('# AgentForge Apply Suggestions');
  lines.push('');
  lines.push('## Mode');
  lines.push('');
  lines.push(`- Dry run: ${dryRun ? 'yes' : 'no'}`);
  lines.push(`- Confirmed: ${confirmed ? 'yes' : 'no'}`);
  lines.push(`- Agents: ${selection.agents ? 'yes' : 'no'}`);
  lines.push(`- Skills: ${selection.skills ? 'yes' : 'no'}`);
  lines.push(`- Flows: ${selection.flows ? 'yes' : 'no'}`);
  lines.push(`- Policies: ${selection.policies ? 'yes' : 'no'}`);
  lines.push('');

  const renderCategory = (title, items) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('- Nenhuma sugestão encontrada.');
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`### ${item.id}`);
      lines.push('');
      lines.push(`- Source: \`${item.source_path}\``);
      lines.push(`- Target: \`${item.relPath}\``);
      lines.push(`- Action: ${item.action}`);
      lines.push(`- Confidence: ${item.confidence || 'medium'}`);
      lines.push(`- Reason: ${item.reason || item.description || '—'}`);
      if (item.existingStatus) {
        lines.push(`- Existing file status: ${item.existingStatus}`);
      }
      lines.push('');
    }
  };

  renderCategory('Agents', plan.agents);
  renderCategory('Skills', plan.skills);
  renderCategory('Flows', plan.flows);
  renderCategory('Policies', plan.policies);

  lines.push('## Applied');
  lines.push('');
  lines.push(`- Agents: ${applied.agents.length}`);
  lines.push(`- Skills: ${applied.skills.length}`);
  lines.push(`- Flows: ${applied.flows.length}`);
  lines.push(`- Policies: ${applied.policies.length}`);
  lines.push('');

  if (skipped.length > 0) {
    lines.push('## Skipped');
    lines.push('');
    for (const item of skipped) {
      lines.push(`- ${item.category}: ${item.id} (${item.reason})`);
    }
    lines.push('');
  }

  lines.push('## Harness updates');
  lines.push('');
  if (harnessUpdates.length === 0) {
    lines.push('- Nenhuma atualização de harness foi registrada.');
  } else {
    for (const item of harnessUpdates) {
      lines.push(`### ${item.kind}: ${item.id}`);
      lines.push('');
      lines.push(`- Path: \`${item.path}\``);
      lines.push(`- Status: ${item.skipped ? 'blocked' : item.wrote ? 'written' : 'planned'}`);
      if (item.summary?.length > 0) {
        lines.push(`- Changes: ${item.summary.join(', ')}`);
      }
      if (item.reason) {
        lines.push(`- Reason: ${item.reason}`);
      }
      if (item.patch && (item.skipped || !item.wrote)) {
        lines.push('');
        lines.push('- Patch recommendation:');
        lines.push('');
        lines.push('```yaml');
        lines.push(item.patch.trim());
        lines.push('```');
      }
      lines.push('');
    }
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- Final artifacts are written only inside `.agentforge/`.');
  lines.push('- Human-modified files are preserved unless `--force` is used.');
  lines.push('- Agents update `harness/context-index.yaml` under `agents`.');
  lines.push('- Skills update `harness/context-index.yaml` under `skills` and task contexts.');
  lines.push('- Flows update `harness/context-index.yaml` under `flows` and task contexts when mapped.');
  lines.push('- Policies update `harness/context-index.yaml` under task contexts when mapped.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function parseArgs(args = []) {
  const parsed = {
    help: false,
    agents: false,
    skills: false,
    flows: false,
    all: false,
    dryRun: false,
    force: false,
    blueprintSpecified: false,
    blueprint: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--agents') parsed.agents = true;
    else if (arg === '--skills') parsed.skills = true;
    else if (arg === '--flows') parsed.flows = true;
    else if (arg === '--all') parsed.all = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--force') parsed.force = true;
    else if (arg === '--blueprint') {
      parsed.blueprintSpecified = true;
      const nextArg = args[index + 1] ?? '';
      if (nextArg && !nextArg.startsWith('-')) {
        parsed.blueprint = normalizeString(nextArg);
        index += 1;
      } else {
        parsed.blueprint = '';
      }
    } else if (arg.startsWith('--blueprint=')) {
      parsed.blueprintSpecified = true;
      parsed.blueprint = normalizeString(arg.slice(arg.indexOf('=') + 1));
    }
  }

  return parsed;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Apply Suggestions\n`));
  console.log(`  Uso: npx ${PRODUCT.command} apply-suggestions [--agents] [--skills] [--flows] [--all] [--dry-run] [--force] [--blueprint <path>]\n`);
  console.log('  Aplica sugestões geradas por analysis e comandos de sugestão, com confirmação por padrão.');
  console.log('  Use --dry-run para apenas gerar o relatório e --force para sobrescrever arquivos humanos.\n');
  console.log('  Use --blueprint para materializar uma decisão completa da IA sem heurísticas.\n');
}

function ensureInstalled(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return { ok: false, errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'] };
  }
  return { ok: true, state: installation.state ?? {} };
}

function validateBlueprintMode(parsed) {
  if (!parsed.blueprintSpecified) return { ok: true };
  if (!parsed.blueprint) {
    return { ok: false, errors: ['Informe um caminho para --blueprint.'] };
  }
  if (parsed.agents || parsed.skills || parsed.flows || parsed.all || parsed.dryRun || parsed.force) {
    return {
      ok: false,
      errors: ['Use --blueprint sozinho, sem --agents, --skills, --flows, --all, --dry-run ou --force.'],
    };
  }
  return { ok: true };
}

function selectCategories(parsed) {
  const hasExplicit = parsed.agents || parsed.skills || parsed.flows;
  const selected = parsed.all || !hasExplicit
    ? { agents: true, skills: true, flows: true, policies: true }
    : {
        agents: parsed.agents,
        skills: parsed.skills,
        flows: parsed.flows,
        policies: false,
      };
  return selected;
}

function applySkillSuggestion(projectRoot, suggestion, { force = false } = {}) {
  const skillPath = join(projectRoot, PRODUCT.internalDir, 'skills', suggestion.id, 'SKILL.md');
  const manifest = loadManifest(projectRoot);
  const relPath = rel(projectRoot, skillPath);
  const existingStatus = existsSync(skillPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
  if (existsSync(skillPath) && existingStatus !== 'intact' && !force) {
    return {
      ok: false,
      skipped: true,
      reason: 'modified-skill',
      relPath,
      outputPath: skillPath,
      contextIndexUpdated: false,
    };
  }

  const content = renderSkillDocument(suggestion);
  const validationErrors = validateSkillDocument(content, suggestion);
  if (validationErrors.length > 0) {
    return { ok: false, skipped: false, errors: validationErrors, relPath, outputPath: skillPath, contextIndexUpdated: false };
  }

  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(skillPath, content, { force: true });

  const contextIndexChange = updateSkillContextIndex(projectRoot, manifest, suggestion.id, suggestion.description, { force, apply: true });
  if (contextIndexChange.wrote && contextIndexChange.content) {
    writer.writeGeneratedFile(join(projectRoot, contextIndexChange.path), contextIndexChange.content, { force: true });
  }
  writer.saveCreatedFiles();

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const generatedSkills = Array.isArray(state.generated_skills) ? state.generated_skills : [];
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    generated_skills: unique([...generatedSkills, suggestion.id]),
    created_files: unique([
      ...createdFiles,
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
    ]),
  };
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

  const nextManifest = {
    ...manifest,
    ...buildManifest(projectRoot, [
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
      rel(projectRoot, statePath),
    ]),
  };
  saveManifest(projectRoot, nextManifest);

  return {
    ok: true,
    skipped: false,
    relPath,
    outputPath: skillPath,
    contextIndexUpdated: contextIndexChange.wrote,
    contextIndexSkipped: contextIndexChange.skipped,
    contextIndexReason: contextIndexChange.reason,
    contextIndexChange,
  };
}

function applyFlowSuggestion(projectRoot, suggestion, { force = false } = {}) {
  const flowPath = join(projectRoot, PRODUCT.internalDir, 'flows', `${suggestion.id}.yaml`);
  const manifest = loadManifest(projectRoot);
  const relPath = rel(projectRoot, flowPath);
  const existingStatus = existsSync(flowPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
  if (existsSync(flowPath) && existingStatus !== 'intact' && !force) {
    return { ok: false, skipped: true, reason: 'modified-flow', relPath, outputPath: flowPath };
  }

  const content = renderFlowDocument(suggestion);
  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(flowPath, content, { force: true });

  const contextIndexChange = updateFlowContextIndex(projectRoot, manifest, suggestion, { force, apply: true });
  if (contextIndexChange.wrote && contextIndexChange.content) {
    writer.writeGeneratedFile(join(projectRoot, contextIndexChange.path), contextIndexChange.content, { force: true });
  }
  writer.saveCreatedFiles();

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const flows = Array.isArray(state.flows) ? state.flows : [];
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    flows: unique([...flows, suggestion.id]),
    created_files: unique([
      ...createdFiles,
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
    ]),
  };
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
      rel(projectRoot, statePath),
    ]),
  });

  return {
    ok: true,
    skipped: false,
    relPath,
    outputPath: flowPath,
    contextIndexChange,
  };
}

function applyPolicySuggestion(projectRoot, suggestion, { force = false } = {}) {
  const policyPath = join(projectRoot, PRODUCT.internalDir, 'policies', `${suggestion.id}.yaml`);
  const manifest = loadManifest(projectRoot);
  const relPath = rel(projectRoot, policyPath);
  const existingStatus = existsSync(policyPath) ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'missing';
  if (existsSync(policyPath) && existingStatus !== 'intact' && !force) {
    return { ok: false, skipped: true, reason: 'modified-policy', relPath, outputPath: policyPath };
  }

  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(policyPath, renderPolicyDocument(suggestion), { force: true });

  const contextIndexChange = updatePolicyContextIndex(projectRoot, manifest, suggestion, { force, apply: true });
  if (contextIndexChange.wrote && contextIndexChange.content) {
    writer.writeGeneratedFile(join(projectRoot, contextIndexChange.path), contextIndexChange.content, { force: true });
  }
  writer.saveCreatedFiles();

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    created_files: unique([
      ...createdFiles,
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
    ]),
  };
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [
      relPath,
      ...(contextIndexChange.wrote ? [contextIndexChange.path] : []),
      rel(projectRoot, statePath),
    ]),
  });

  return {
    ok: true,
    skipped: false,
    relPath,
    outputPath: policyPath,
    contextIndexChange,
  };
}

function sortById(items = []) {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function collectHarnessPreview(projectRoot, plan, force = false) {
  const manifest = loadManifest(projectRoot);
  const updates = [];

  for (const item of sortById(plan.agents)) {
    if (item.action !== 'apply') continue;
    const change = updateAgentContextIndex(
      projectRoot,
      manifest,
      { id: item.id, description: item.description, reason: item.reason, name: item.name },
      item.relPath,
      { force, apply: false },
    );
    if (change.summary.length > 0 || change.reason || change.patch) {
      updates.push({ ...change, id: item.id });
    }
  }

  for (const item of sortById(plan.skills)) {
    if (item.action !== 'apply') continue;
    const change = updateSkillContextIndex(projectRoot, manifest, item.id, item.description, { force, apply: false });
    if (change.summary.length > 0 || change.reason || change.patch) {
      updates.push({ ...change, id: item.id });
    }
  }

  for (const item of sortById(plan.flows)) {
    if (item.action !== 'apply') continue;
    const change = updateFlowContextIndex(projectRoot, manifest, item, { force, apply: false });
    if (change.summary.length > 0 || change.reason || change.patch) {
      updates.push({ ...change, id: item.id });
    }
  }

  for (const item of sortById(plan.policies)) {
    if (item.action !== 'apply') continue;
    const change = updatePolicyContextIndex(projectRoot, manifest, item, { force, apply: false });
    if (change.summary.length > 0 || change.reason || change.patch) {
      updates.push({ ...change, id: item.id });
    }
  }

  return updates;
}

export function runApplySuggestions(projectRoot, parsed = {}) {
  const installation = ensureInstalled(projectRoot);
  if (!installation.ok) return installation;

  const blueprintValidation = validateBlueprintMode(parsed);
  if (!blueprintValidation.ok) return blueprintValidation;

  const blueprintMode = normalizeString(parsed.blueprint);
  if (blueprintMode) {
    if (!existsSync(blueprintMode)) {
      return { ok: false, errors: [`Blueprint ausente em ${blueprintMode}.`] };
    }
    return runAdoptApplyFromBlueprint(projectRoot, blueprintMode, { writeReportsOnError: false });
  }

  const selection = selectCategories(parsed);
  const plan = collectApplyPlan(projectRoot, selection);
  const reportOnly = Boolean(parsed.dryRun);

  const reportWriter = new Writer(projectRoot);
  const reportPath = join(projectRoot, REPORT_REL_PATH);

  const applied = {
    agents: [],
    skills: [],
    flows: [],
    policies: [],
  };
  const harnessUpdates = [];
  const skipped = [];
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');

  const applyAgentEntries = async () => {
    for (const item of sortById(plan.agents)) {
      if (item.action !== 'apply') {
        skipped.push({ category: 'agents', id: item.id, reason: item.existingStatus === 'modified' ? 'modified-file' : 'not-selected' });
        continue;
      }
      const result = applyAgentSuggestion(projectRoot, item, { force: parsed.force });
      if (!result.ok) {
        skipped.push({ category: 'agents', id: item.id, reason: result.errors[0] });
        continue;
      }
      applied.agents.push({ id: item.id, path: result.agentPath });
      if (result.contextIndexChange && (result.contextIndexChange.summary.length > 0 || result.contextIndexChange.reason || result.contextIndexChange.patch)) {
        harnessUpdates.push({ ...result.contextIndexChange, id: item.id });
      }
    }
  };

  const applySkillEntries = () => {
    for (const item of sortById(plan.skills)) {
      if (item.action !== 'apply') {
        skipped.push({ category: 'skills', id: item.id, reason: item.existingStatus === 'modified' ? 'modified-file' : 'not-selected' });
        continue;
      }
      const result = applySkillSuggestion(projectRoot, item, { force: parsed.force });
      if (!result.ok) {
        skipped.push({ category: 'skills', id: item.id, reason: result.errors?.[0] || result.reason || 'apply-failed' });
        continue;
      }
      applied.skills.push({ id: item.id, path: result.relPath });
      if (result.contextIndexChange && (result.contextIndexChange.summary.length > 0 || result.contextIndexChange.reason || result.contextIndexChange.patch)) {
        harnessUpdates.push({ ...result.contextIndexChange, id: item.id });
      }
      if (result.contextIndexSkipped) {
        skipped.push({ category: 'skills', id: item.id, reason: result.contextIndexReason || 'context-index-modified' });
      }
    }
  };

  const applyFlowEntries = () => {
    for (const item of sortById(plan.flows)) {
      if (item.action !== 'apply') {
        skipped.push({ category: 'flows', id: item.id, reason: item.existingStatus === 'modified' ? 'modified-file' : 'not-selected' });
        continue;
      }
      const result = applyFlowSuggestion(projectRoot, item, { force: parsed.force });
      if (!result.ok) {
        skipped.push({ category: 'flows', id: item.id, reason: result.reason || 'apply-failed' });
        continue;
      }
      applied.flows.push({ id: item.id, path: result.relPath });
      if (result.contextIndexChange && (result.contextIndexChange.summary.length > 0 || result.contextIndexChange.reason || result.contextIndexChange.patch)) {
        harnessUpdates.push({ ...result.contextIndexChange, id: item.id });
      }
    }
  };

  const applyPolicyEntries = () => {
    for (const item of sortById(plan.policies)) {
      if (item.action !== 'apply') {
        skipped.push({ category: 'policies', id: item.id, reason: item.existingStatus === 'modified' ? 'modified-file' : 'not-selected' });
        continue;
      }
      const result = applyPolicySuggestion(projectRoot, item, { force: parsed.force });
      if (!result.ok) {
        skipped.push({ category: 'policies', id: item.id, reason: result.reason || 'apply-failed' });
        continue;
      }
      applied.policies.push({ id: item.id, path: result.relPath });
      if (result.contextIndexChange && (result.contextIndexChange.summary.length > 0 || result.contextIndexChange.reason || result.contextIndexChange.patch)) {
        harnessUpdates.push({ ...result.contextIndexChange, id: item.id });
      }
    }
  };

  const run = async () => {
    const writeReportOnly = (confirmed) => {
      const reportHarnessUpdates = reportOnly ? collectHarnessPreview(projectRoot, plan, parsed.force) : harnessUpdates;
      const report = renderReport({ selection, plan, applied, skipped, harnessUpdates: reportHarnessUpdates, dryRun: reportOnly, confirmed });
      reportWriter.writeGeneratedFile(reportPath, report, { force: true });
      return { ok: true, reportPath, selection, plan, applied, skipped, confirmed };
    };

    if (reportOnly) {
      return writeReportOnly(false);
    }

    if (plan.agents.length === 0 && plan.skills.length === 0 && plan.flows.length === 0 && plan.policies.length === 0) {
      return writeReportOnly(true);
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Apply the selected suggestions now?',
        default: false,
      },
    ]);

    if (!confirmed) {
      return writeReportOnly(false);
    }

    if (selection.agents) await applyAgentEntries();
    if (selection.skills) applySkillEntries();
    if (selection.flows) applyFlowEntries();
    if (selection.policies) applyPolicyEntries();

    const report = renderReport({
      selection,
      plan,
      applied,
      skipped,
      harnessUpdates,
      dryRun: reportOnly,
      confirmed: true,
    });
    reportWriter.writeGeneratedFile(reportPath, report, { force: true });
    reportWriter.saveCreatedFiles();

    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const nextState = {
      ...state,
      last_apply_suggestions_at: new Date().toISOString(),
      applied_suggestions: {
        agents: applied.agents.map((item) => ({ id: item.id, path: item.path })),
        skills: applied.skills.map((item) => ({ id: item.id, path: item.path })),
        flows: applied.flows.map((item) => ({ id: item.id, path: item.path })),
        policies: applied.policies.map((item) => ({ id: item.id, path: item.path })),
      },
    };
    writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

    const manifest = loadManifest(projectRoot);
    const writtenPaths = [REPORT_REL_PATH, rel(projectRoot, statePath)];
    for (const item of [...applied.agents, ...applied.skills, ...applied.flows, ...applied.policies]) {
      writtenPaths.push(item.path);
    }
    saveManifest(projectRoot, {
      ...manifest,
      ...buildManifest(projectRoot, writtenPaths),
    });

    return { ok: true, reportPath, selection, plan, applied, skipped, confirmed: true };
  };

  return run();
}

export default async function applySuggestions(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const result = await runApplySuggestions(process.cwd(), parsed);
  if (!result.ok) {
    console.log(chalk.red(`  ${result.errors[0]}`));
    if (parsed.blueprintSpecified) {
      console.log(chalk.gray(`  Blueprint validation report: ${result.validationReportPath ?? 'not available'}`));
      console.log(chalk.gray(`  Relatório: ${result.reportPath ?? 'not available'}`));
    }
    return 1;
  }

  if (parsed.blueprintSpecified) {
    console.log(chalk.hex('#ffa203')('  Blueprint da IA materializado com sucesso.'));
    console.log(chalk.gray(`  Blueprint: ${result.blueprintPath}`));
    console.log(chalk.gray(`  Validation report: ${result.validationReportPath}`));
    console.log(chalk.gray(`  Report: ${result.reportPath}`));
    return 0;
  }

  console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${result.reportPath}`));
  console.log(chalk.gray(`  Aplicados: ${result.applied.agents.length} agents, ${result.applied.skills.length} skills, ${result.applied.flows.length} flows, ${result.applied.policies.length} policies`));
  console.log(chalk.gray(`  Confirmado: ${result.confirmed ? 'sim' : 'não'}`));
  return 0;
}
