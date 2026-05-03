import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative } from 'path';
import YAML from 'yaml';
import { getManifestPath, PRODUCT, SETUP_MODES, resolveInternalDir } from '../product.js';
import { getMinimumHumanReadableStructureRelPaths } from '../installer/writer.js';
import {
  ENTRYPOINT_TARGETS,
  inspectManagedEntrypointContent,
  buildEntrypointQualityMessage,
} from './entrypoint-quality.js';
import {
  getPhaseCompletionReport,
  loadPhaseDefinition,
  normalizePhaseId,
  normalizePhaseList,
  normalizeWorkflowState,
  renderPlanFromPhases,
} from './project-plan.js';

const REQUIRED_POLICY_FILES = [
  'permissions.yaml',
  'protected-files.yaml',
  'human-approval.yaml',
];

const VALID_CONTEXT_KINDS = new Set([
  'project-overview',
  'architecture',
  'domain',
  'glossary-term',
  'coding-standard',
  'testing',
  'deployment',
  'workflow',
  'policy',
  'tooling',
  'command',
  'reference',
  'memory',
  'unknown',
]);

const VALID_CONTEXT_CONFIDENCE = new Set(['low', 'medium', 'high']);
const VALID_CONTEXT_CURATION_STATUS = new Set(['needs-review', 'curated', 'stale', 'rejected']);

const REQUIRED_TASK_MODES = [
  'feature',
  'bugfix',
  'refactor',
  'review',
  'documentation',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function listFilesRecursive(dirPath, predicate = () => true) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, predicate));
      continue;
    }
    if (predicate(fullPath, entry.name)) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function rel(projectRoot, absPath) {
  const path = relative(projectRoot, absPath);
  return path || basename(absPath);
}

function pushError(errors, file, message) {
  errors.push({ file, message });
}

function pushWarning(warnings, file, message) {
  warnings.push({ file, message });
}

function parseYamlFile(filePath, errors, projectRoot) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const doc = YAML.parse(raw);
    if (!isPlainObject(doc)) {
      pushError(errors, rel(projectRoot, filePath), 'O arquivo YAML deve conter um objeto no topo.');
      return null;
    }
    return doc;
  } catch (error) {
    pushError(errors, rel(projectRoot, filePath), `YAML inválido: ${error.message}`);
    return null;
  }
}

function parseJsonFile(filePath, errors, projectRoot) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const doc = JSON.parse(raw);
    if (!isPlainObject(doc)) {
      pushError(errors, rel(projectRoot, filePath), 'O arquivo JSON precisa conter um objeto no topo.');
      return null;
    }
    return doc;
  } catch (error) {
    pushError(errors, rel(projectRoot, filePath), `JSON inválido: ${error.message}`);
    return null;
  }
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
}

function countLines(content) {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  if (!text) return 0;
  const lines = text.split('\n');
  if (text.endsWith('\n')) {
    lines.pop();
  }
  return lines.length;
}

function fileId(filePath) {
  return basename(filePath, extname(filePath));
}

function validateReferencedFile(baseDir, relPath, sourceRef, errors, { allowDirectory = false, allowMissing = false } = {}) {
  const normalized = normalizeString(relPath);
  if (!normalized) {
    pushError(errors, sourceRef, 'Campo path ausente.');
    return;
  }

  const absPath = join(baseDir, normalized);
  const relToBase = relative(baseDir, absPath);
  if (!relToBase || relToBase.startsWith('..')) {
    pushError(errors, sourceRef, `Path fora do harness: "${normalized}".`);
    return;
  }

  if (!existsSync(absPath)) {
    if (allowMissing) {
      return;
    }
    pushError(errors, sourceRef, `Arquivo ausente em "${normalized}".`);
    return;
  }

  const stats = statSync(absPath);
  if (stats.isFile()) {
    return;
  }
  if (allowDirectory && stats.isDirectory()) {
    return;
  }
  if (stats.isDirectory()) {
    pushError(errors, sourceRef, `Esperado um arquivo ou diretório em "${normalized}".`);
    return;
  }

  if (!stats.isFile()) {
    pushError(errors, sourceRef, `Esperado um arquivo em "${normalized}".`);
  }
}

function validatePathEntry(entry, baseDir, sourceRef, errors, { allowDirectory = false, allowMissing = false } = {}) {
  if (typeof entry === 'string') {
    validateReferencedFile(baseDir, entry, sourceRef, errors, { allowDirectory, allowMissing });
    return;
  }

  if (!isPlainObject(entry)) {
    pushError(errors, sourceRef, 'Cada item deve ser uma string ou um objeto.');
    return;
  }

  if (typeof entry.path === 'string') {
    validateReferencedFile(baseDir, entry.path, sourceRef, errors, { allowDirectory, allowMissing });
    return;
  }

  if (Array.isArray(entry.paths)) {
    for (const [index, pathEntry] of entry.paths.entries()) {
      validatePathEntry(pathEntry, baseDir, `${sourceRef}#paths[${index}]`, errors, { allowDirectory, allowMissing });
    }
    return;
  }

  pushError(errors, sourceRef, 'Cada item deve conter um campo path.');
}

function validatePathObjectCollection({
  baseDir,
  sourceFile,
  entries,
  errors,
  sectionName,
  required = false,
  allowDirectory = false,
  allowMissing = false,
}) {
  if (entries === undefined || entries === null) {
    if (required) {
      pushError(errors, sourceFile, `Campo obrigatório ausente: ${sectionName}.`);
    }
    return;
  }

  if (!Array.isArray(entries)) {
    pushError(errors, sourceFile, `Campo inválido: ${sectionName} deve ser uma lista.`);
    return;
  }

  if (required && entries.length === 0) {
    pushError(errors, sourceFile, `Campo obrigatório ausente ou vazio: ${sectionName}.`);
    return;
  }

  for (const [index, entry] of entries.entries()) {
    const itemRef = `${sourceFile}#${sectionName}[${index}]`;
    validatePathEntry(entry, baseDir, itemRef, errors, { allowDirectory, allowMissing });
  }
}

function validateStringPathCollection({
  baseDir,
  sourceFile,
  entries,
  errors,
  sectionName,
  required = false,
  allowDirectory = false,
  allowMissing = false,
}) {
  if (entries === undefined || entries === null) {
    if (required) {
      pushError(errors, sourceFile, `Campo obrigatório ausente: ${sectionName}.`);
    }
    return;
  }

  if (!Array.isArray(entries)) {
    pushError(errors, sourceFile, `Campo inválido: ${sectionName} deve ser uma lista.`);
    return;
  }

  if (required && entries.length === 0) {
    pushError(errors, sourceFile, `Campo obrigatório ausente ou vazio: ${sectionName}.`);
    return;
  }

  for (const [index, entry] of entries.entries()) {
    const itemRef = `${sourceFile}#${sectionName}[${index}]`;
    validatePathEntry(entry, baseDir, itemRef, errors, { allowDirectory, allowMissing });
  }
}

function validateTaskContextGroup({
  baseDir,
  sourceFile,
  group,
  errors,
  taskModes,
}) {
  const groupRef = sourceFile;

  if (Array.isArray(group)) {
    validateStringPathCollection({
      baseDir,
      sourceFile: groupRef,
      entries: group,
      errors,
      sectionName: 'task_contexts',
      required: false,
    });
    return;
  }

  if (!isPlainObject(group)) {
    pushError(errors, groupRef, 'Cada task_context deve ser uma lista ou um objeto.');
    return;
  }

  const supportedCategories = [
    'context',
    'skills',
    'flows',
    'policies',
    'references',
    'always_load',
    'entrypoints',
    'legacy',
    'agents',
    'suggestions',
    'memory',
    'reports',
  ];
  let foundCategory = false;

  for (const category of supportedCategories) {
    if (group[category] === undefined) continue;
    foundCategory = true;

    if (Array.isArray(group[category])) {
      validateStringPathCollection({
        baseDir,
        sourceFile: groupRef,
        entries: group[category],
        errors,
        sectionName: category,
        required: false,
        allowDirectory: true,
        allowMissing: true,
      });
      continue;
    }

    if (typeof group[category] === 'string' || isPlainObject(group[category])) {
      validatePathEntry(group[category], baseDir, `${groupRef}#${category}`, errors, { allowDirectory: true, allowMissing: true });
      continue;
    }

    pushError(errors, `${groupRef}#${category}`, `Campo inválido: ${category} deve ser uma lista de caminhos ou um objeto com path(s).`);
  }

  if (!foundCategory) {
    pushError(errors, groupRef, 'Cada task_context precisa informar ao menos uma categoria com caminhos.');
  }

  for (const [key, value] of Object.entries(group)) {
    if (supportedCategories.includes(key)) continue;
    if (typeof value === 'string' || Array.isArray(value) || isPlainObject(value)) continue;
    pushError(errors, `${groupRef}#${key}`, 'Campo inválido em task_context.');
  }
}

function validateAgent(doc, filePath, errors, registry, components, projectRoot) {
  const file = rel(projectRoot, filePath);
  const id = normalizeString(doc.id);
  const name = normalizeString(doc.name);
  const description = normalizeString(doc.description);
  const mission = normalizeString(doc.mission);
  const responsibilities = normalizeStringArray(doc.responsibilities);
  const boundaries = normalizeStringArray(doc.boundaries);
  const permissions = normalizeStringArray(doc.permissions);
  const fileName = fileId(filePath);

  if (!id) pushError(errors, file, 'Campo obrigatório ausente: id.');
  if (id && id !== fileName) {
    pushError(errors, file, `O id do agente deve coincidir com o nome do arquivo "${fileName}".`);
  }
  if (!name) pushError(errors, file, 'Campo obrigatório ausente: name.');
  if (!description && !mission) {
    pushError(errors, file, 'Campo obrigatório ausente: description ou mission.');
  }
  if (responsibilities.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente ou vazio: responsibilities.');
  }
  if (boundaries.length === 0 && permissions.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente: boundaries ou permissions.');
  }

  if (!id) return;
  if (registry.has(id)) {
    const previous = registry.get(id);
    pushError(errors, file, `ID duplicado de agent: "${id}" também existe em ${previous.file}.`);
    return;
  }

  registry.set(id, { file, kind: 'agent' });
  components.push({ id, file });
}

function validateSubagent(doc, filePath, errors, agentRegistry, subagentRegistry, components, projectRoot) {
  const file = rel(projectRoot, filePath);
  const fileName = fileId(filePath);
  const id = normalizeString(doc.id) || fileName;
  const rawId = normalizeString(doc.id);

  if (rawId && rawId !== fileName) {
    pushError(errors, file, `O id do subagent deve coincidir com o nome do arquivo "${fileName}".`);
  }

  if (agentRegistry.has(id) || subagentRegistry.has(id)) {
    const previous = agentRegistry.get(id) ?? subagentRegistry.get(id);
    pushError(errors, file, `ID duplicado de subagent: "${id}" também existe em ${previous.file}.`);
    return;
  }

  subagentRegistry.set(id, { file, kind: 'subagent' });
  components.push({ id, file });
}

function validateFlow(doc, filePath, errors, agentRegistry, subagentRegistry, flowRegistry, components, projectRoot) {
  const file = rel(projectRoot, filePath);
  const id = normalizeString(doc.id);
  const name = normalizeString(doc.name);
  const steps = Array.isArray(doc.steps) ? doc.steps : null;
  const fileName = fileId(filePath);

  if (!id) pushError(errors, file, 'Campo obrigatório ausente: id.');
  if (id && id !== fileName) {
    pushError(errors, file, `O id do flow deve coincidir com o nome do arquivo "${fileName}".`);
  }
  if (!name) pushError(errors, file, 'Campo obrigatório ausente: name.');
  if (!steps || steps.length === 0) {
    pushError(errors, file, 'Campo obrigatório ausente ou vazio: steps.');
    return;
  }

  for (const [index, step] of steps.entries()) {
    const stepFile = `${file}#steps[${index}]`;
    if (!isPlainObject(step)) {
      pushError(errors, stepFile, 'Cada step deve ser um objeto.');
      continue;
    }

    const stepId = normalizeString(step.id);
    const agentId =
      normalizeString(step.agent) ||
      normalizeString(step.agent_id) ||
      normalizeString(step.subagent);

    if (!stepId) {
      pushError(errors, stepFile, 'Cada step deve ter um id.');
    }
    if (!agentId) {
      pushError(errors, stepFile, 'Cada step deve referenciar um agent em "agent", "agent_id" ou "subagent".');
      continue;
    }
    if (!agentRegistry.has(agentId) && !subagentRegistry.has(agentId)) {
      pushError(errors, stepFile, `Agent inexistente referenciado: "${agentId}".`);
    }
  }

  if (!id) return;
  if (flowRegistry.has(id)) {
    const previous = flowRegistry.get(id);
    pushError(errors, file, `ID duplicado de flow: "${id}" também existe em ${previous.file}.`);
    return;
  }

  flowRegistry.set(id, { file, kind: 'flow' });
  components.push({ id, file });
}

function validatePolicyFile(filePath, errors, components, projectRoot) {
  const relPath = rel(projectRoot, filePath);

  if (!existsSync(filePath)) {
    pushError(errors, relPath, 'Política obrigatória ausente.');
    return;
  }

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  components.push({
    id: fileId(filePath),
    file: relPath,
  });
}

function validateMinimumHumanReadableStructure(projectRoot, internalDirName, errors) {
  for (const relPath of getMinimumHumanReadableStructureRelPaths(internalDirName)) {
    if (!existsSync(join(projectRoot, relPath))) {
      pushError(errors, relPath, 'Arquivo ausente da estrutura mínima do harness.');
    }
  }
}

const REQUIRED_AI_PLAYBOOKS = [
  'discovery',
  'agent-design',
  'flow-design',
  'policies',
  'export',
  'review',
  'task-execution',
];

const REQUIRED_AI_ENGINE_NOTES = [
  'codex',
  'claude',
  'gemini',
  'cursor',
  'copilot',
];

function resolveAiEngineNotePath(engine) {
  const normalized = normalizeString(engine).toLowerCase().replace(/[\s_]+/g, '-');
  const noteMap = {
    codex: 'codex.md',
    claude: 'claude.md',
    'claude-code': 'claude.md',
    'claude-cli': 'claude.md',
    gemini: 'gemini.md',
    'gemini-cli': 'gemini.md',
    cursor: 'cursor.md',
    copilot: 'copilot.md',
    'github-copilot': 'copilot.md',
  };
  return noteMap[normalized] ?? `${normalized}.md`;
}

function validateAiStructure(projectRoot, internalDirName, state, errors) {
  const aiRoot = join(projectRoot, internalDirName, 'ai');
  const aiReadme = join(aiRoot, 'README.md');
  if (!existsSync(aiReadme)) {
    pushError(errors, rel(projectRoot, aiReadme), 'Arquivo ausente da camada AI.');
  }

  for (const playbookId of REQUIRED_AI_PLAYBOOKS) {
    const playbookPath = join(aiRoot, 'playbooks', `${playbookId}.md`);
    if (!existsSync(playbookPath)) {
      pushError(errors, rel(projectRoot, playbookPath), `Playbook AI ausente: ${playbookId}.`);
    }
  }

  for (const engineId of REQUIRED_AI_ENGINE_NOTES) {
    const notePath = join(aiRoot, 'engines', `${engineId}.md`);
    if (!existsSync(notePath)) {
      pushError(errors, rel(projectRoot, notePath), `Nota específica da engine ausente: ${engineId}.`);
    }
  }

  if (state && Array.isArray(state.engines)) {
    for (const engine of state.engines) {
      const notePath = join(aiRoot, 'engines', resolveAiEngineNotePath(engine));
      if (!existsSync(notePath)) {
        pushError(errors, rel(projectRoot, notePath), `Nota específica da engine ausente para a engine ativa: ${engine}.`);
      }
    }
  }
}

function normalizeFlowIdFromPath(relPath) {
  const fileName = basename(normalizeString(relPath));
  if (fileName.endsWith('.md')) return fileName.slice(0, -3);
  return fileName.replace(/\.(yaml|yml)$/i, '');
}

function validateContextIndex(internalDir, projectRoot, errors, warnings, taskModes, state = null) {
  const filePath = join(internalDir, 'harness', 'context-index.yaml');
  if (!existsSync(filePath)) return;

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  if (doc.always_load !== undefined) {
    if (!Array.isArray(doc.always_load)) {
      pushError(errors, rel(projectRoot, filePath), 'Campo inválido: always_load deve ser uma lista.');
    } else {
      validateStringPathCollection({
        baseDir: internalDir,
        sourceFile: rel(projectRoot, filePath),
        entries: doc.always_load,
        errors,
        sectionName: 'always_load',
        required: false,
      });
    }
  }

  if (doc.task_contexts !== undefined) {
    if (!isPlainObject(doc.task_contexts)) {
      pushError(errors, rel(projectRoot, filePath), 'Campo inválido: task_contexts deve ser um objeto.');
    } else {
      for (const [modeName, group] of Object.entries(doc.task_contexts)) {
        const normalizedMode = normalizeString(modeName);
        const modeRef = `${rel(projectRoot, filePath)}#task_contexts.${normalizedMode || modeName}`;
        if (!taskModes.has(normalizedMode)) {
          pushError(errors, modeRef, `Modo de tarefa indefinido: "${normalizedMode || modeName}".`);
          continue;
        }
        validateTaskContextGroup({
          baseDir: internalDir,
          sourceFile: modeRef,
          group,
          errors,
          taskModes,
        });
      }
    }
  }

  validatePathObjectCollection({
    baseDir: internalDir,
    sourceFile: rel(projectRoot, filePath),
    entries: doc.items,
    errors,
    sectionName: 'items',
    required: true,
  });

  if (doc.skills !== undefined) {
    validatePathObjectCollection({
      baseDir: internalDir,
      sourceFile: rel(projectRoot, filePath),
      entries: doc.skills,
      errors,
      sectionName: 'skills',
      required: false,
    });
  }

  if (doc.flows !== undefined) {
    validatePathObjectCollection({
      baseDir: internalDir,
      sourceFile: rel(projectRoot, filePath),
      entries: doc.flows,
      errors,
      sectionName: 'flows',
      required: false,
    });
  }

  if (state && Array.isArray(state.flows) && Array.isArray(doc.flows)) {
    const indexedFlows = new Set(
      doc.flows
        .map((entry) => {
          if (typeof entry === 'string') return normalizeFlowIdFromPath(entry);
          if (!isPlainObject(entry)) return '';
          return normalizeString(entry.id) || normalizeFlowIdFromPath(entry.path);
        })
        .filter(Boolean),
    );

    const missingFlows = state.flows
      .map((flowId) => normalizeString(flowId))
      .filter(Boolean)
      .filter((flowId) => !indexedFlows.has(flowId));

    if (missingFlows.length > 0) {
      pushWarning(
        warnings,
        rel(projectRoot, filePath),
        `context-index.flows não cobre todos os state.flows: ${missingFlows.join(', ')}.`,
      );
    }
  }

  if (doc.policies !== undefined) {
    validatePathObjectCollection({
      baseDir: internalDir,
      sourceFile: rel(projectRoot, filePath),
      entries: doc.policies,
      errors,
      sectionName: 'policies',
      required: false,
    });
  }

  if (doc.context !== undefined) {
    validatePathObjectCollection({
      baseDir: internalDir,
      sourceFile: rel(projectRoot, filePath),
      entries: doc.context,
      errors,
      sectionName: 'context',
      required: false,
    });
  }
}

function validateContextMap(internalDir, projectRoot, errors, warnings) {
  const filePath = join(internalDir, 'harness', 'context-map.yaml');
  if (!existsSync(filePath)) {
    pushError(errors, rel(projectRoot, filePath), 'Arquivo ausente.');
    return;
  }

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  if (!isPlainObject(doc)) {
    pushError(errors, rel(projectRoot, filePath), 'O arquivo YAML deve conter um objeto no topo.');
    return;
  }

  if (!Array.isArray(doc.items)) {
    pushError(errors, rel(projectRoot, filePath), 'Campo inválido: items deve ser uma lista.');
    return;
  }

  let needsReviewCount = 0;
  const seenIds = new Set();
  const sourceFile = rel(projectRoot, filePath);

  for (const [index, item] of doc.items.entries()) {
    const itemRef = `${sourceFile}#items[${index}]`;
    if (!isPlainObject(item)) {
      pushError(errors, itemRef, 'Cada item deve ser um objeto.');
      continue;
    }

    const id = normalizeString(item.id);
    const title = normalizeString(item.title);
    const kind = normalizeString(item.kind);
    const file = normalizeString(item.file);
    const summary = normalizeString(item.summary);
    const confidence = normalizeString(item.confidence);
    const curationStatus = normalizeString(item.curation_status);
    const startLine = item.start_line;
    const endLine = item.end_line;

    if (!id) {
      pushError(errors, itemRef, 'Campo obrigatório ausente: id.');
    } else if (seenIds.has(id)) {
      pushError(errors, itemRef, `ID duplicado em context-map: "${id}".`);
    } else {
      seenIds.add(id);
    }

    if (!title) pushError(errors, itemRef, 'Campo obrigatório ausente: title.');
    if (!kind) {
      pushError(errors, itemRef, 'Campo obrigatório ausente: kind.');
    } else if (!VALID_CONTEXT_KINDS.has(kind)) {
      pushError(errors, itemRef, `kind inválido: "${kind}".`);
    }
    if (!file) {
      pushError(errors, itemRef, 'Campo obrigatório ausente: file.');
    }
    if (!summary) pushError(errors, itemRef, 'Campo obrigatório ausente: summary.');
    if (!VALID_CONTEXT_CONFIDENCE.has(confidence)) {
      pushError(errors, itemRef, `confidence inválido: "${confidence || 'vazio'}".`);
    }
    if (!VALID_CONTEXT_CURATION_STATUS.has(curationStatus)) {
      pushError(errors, itemRef, `curation_status inválido: "${curationStatus || 'vazio'}".`);
    }

    if (!Number.isInteger(startLine)) {
      pushError(errors, itemRef, 'Campo obrigatório ausente ou inválido: start_line.');
    }
    if (!Number.isInteger(endLine)) {
      pushError(errors, itemRef, 'Campo obrigatório ausente ou inválido: end_line.');
    }

    if (Number.isInteger(startLine) && Number.isInteger(endLine) && startLine > endLine) {
      pushError(errors, itemRef, 'start_line não pode ser maior que end_line.');
    }

    const absPath = join(internalDir, file);
    const relToBase = relative(internalDir, absPath);
    if (!file || relToBase.startsWith('..') || relToBase === '') {
      if (file) {
        pushError(errors, itemRef, `Path fora do diretório interno: "${file}".`);
      }
    } else if (!existsSync(absPath)) {
      pushError(errors, itemRef, `Arquivo ausente em "${file}".`);
    } else if (statSync(absPath).isDirectory()) {
      pushError(errors, itemRef, `Esperado um arquivo em "${file}".`);
    } else if (Number.isInteger(startLine) && Number.isInteger(endLine)) {
      const lineCount = countLines(readFileSync(absPath, 'utf8'));
      if (lineCount === 0) {
        pushError(errors, itemRef, `Arquivo vazio em "${file}".`);
      } else {
        if (startLine < 1 || endLine < 1) {
          pushError(errors, itemRef, 'start_line e end_line devem ser maiores que zero.');
        }
        if (startLine > lineCount || endLine > lineCount) {
          pushError(errors, itemRef, `Range inválido em "${file}": o arquivo tem apenas ${lineCount} linha(s).`);
        }
      }
    }

    if (curationStatus === 'needs-review') {
      needsReviewCount += 1;
    }

    if (item.source !== undefined && !isPlainObject(item.source)) {
      pushError(errors, itemRef, 'Campo source deve ser um objeto quando presente.');
    }
  }

  if (doc.items.length > 0 && needsReviewCount / doc.items.length > 0.4) {
    pushWarning(
      warnings,
      sourceFile,
      `Mais de 40% dos itens do context-map ainda estão em needs-review (${needsReviewCount}/${doc.items.length}).`,
    );
  }
}

function validateRefactorContextReports(internalDir, projectRoot, warnings) {
  const reportPath = join(internalDir, 'reports', 'refactor-context.json');
  if (!existsSync(reportPath)) return;

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const sourceFile = rel(projectRoot, reportPath);
    if (
      Number.isFinite(report.unclassified_snippets)
      && Number.isFinite(report.classified_snippets)
      && report.classified_snippets + report.unclassified_snippets > 0
    ) {
      const totalSnippets = report.classified_snippets + report.unclassified_snippets;
      if (report.unclassified_snippets / totalSnippets > 0.4) {
        pushWarning(
          warnings,
          sourceFile,
          `Muitos trechos continuam unclassified (${report.unclassified_snippets}/${totalSnippets}).`,
        );
      }
    }

    const createdFiles = new Set(Array.isArray(report.created_files) ? report.created_files : []);
    const updatedFiles = new Set(Array.isArray(report.updated_files) ? report.updated_files : []);
    const lowConfidenceApplied = Array.isArray(report.snippets)
      ? report.snippets.filter((snippet) => {
          const confidence = Number(snippet?.confidence ?? 0);
          const targetPath = normalizeString(snippet?.target_path);
          return confidence <= 3 && targetPath && targetPath !== 'context/unclassified.md'
            && (createdFiles.has(`.agentforge/${targetPath}`) || updatedFiles.has(`.agentforge/${targetPath}`));
        })
      : [];

    if (lowConfidenceApplied.length > 0) {
      pushWarning(
        warnings,
        sourceFile,
        `Trechos de baixa confiança foram aplicados diretamente em arquivos canônicos (${lowConfidenceApplied.length}).`,
      );
    }
  } catch {
    pushWarning(warnings, rel(projectRoot, reportPath), 'relatório refactor-context.json inválido ou ilegível.');
  }
}

function validateTaskModes(internalDir, projectRoot, errors) {
  const filePath = join(internalDir, 'harness', 'task-modes.yaml');
  if (!existsSync(filePath)) {
    pushError(errors, rel(projectRoot, filePath), 'Arquivo ausente.');
    return new Set();
  }

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return new Set();

  const knownModes = new Set();

  for (const modeName of REQUIRED_TASK_MODES) {
    const mode = doc[modeName];
    const modeRef = `${rel(projectRoot, filePath)}#${modeName}`;

    if (!isPlainObject(mode)) {
      pushError(errors, modeRef, `Modo ausente ou inválido: ${modeName}.`);
      continue;
    }

    knownModes.add(modeName);

    if (!normalizeString(mode.label)) {
      pushError(errors, modeRef, 'Campo obrigatório ausente: label.');
    }
    if (!normalizeString(mode.purpose)) {
      pushError(errors, modeRef, 'Campo obrigatório ausente: purpose.');
    }
    if (mode.use_when !== undefined) {
      if (!Array.isArray(mode.use_when) || mode.use_when.some((entry) => typeof entry !== 'string' || !entry.trim())) {
        pushError(errors, modeRef, 'Campo use_when deve ser uma lista de strings não vazias.');
      }
    }
  }

  for (const [modeName, mode] of Object.entries(doc)) {
    if (REQUIRED_TASK_MODES.includes(modeName)) continue;
    if (!isPlainObject(mode)) continue;
    if (normalizeString(mode.label) || normalizeString(mode.purpose)) {
      knownModes.add(modeName);
    }
  }

  return knownModes;
}

function validateLoadOrder(internalDir, projectRoot, errors) {
  const filePath = join(internalDir, 'harness', 'load-order.yaml');
  if (!existsSync(filePath)) return;

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  if (!Array.isArray(doc.order) || doc.order.length === 0) {
    pushError(errors, rel(projectRoot, filePath), 'Campo obrigatório ausente ou vazio: order.');
    return;
  }

  validateStringPathCollection({
    baseDir: internalDir,
    sourceFile: rel(projectRoot, filePath),
    entries: doc.order,
    errors,
    sectionName: 'order',
    required: true,
  });
}

function validateEngineMap(internalDir, projectRoot, state, errors, warnings) {
  const filePath = join(internalDir, 'harness', 'engine-map.yaml');
  if (!existsSync(filePath)) {
    pushError(errors, rel(projectRoot, filePath), 'Arquivo ausente.');
    return;
  }

  const doc = parseYamlFile(filePath, errors, projectRoot);
  if (!doc) return;

  if (!isPlainObject(doc.engines)) {
    pushError(errors, rel(projectRoot, filePath), 'Campo obrigatório ausente ou inválido: engines.');
    return;
  }

  for (const [engineId, entry] of Object.entries(doc.engines)) {
    const entryRef = `${rel(projectRoot, filePath)}#engines.${engineId}`;
    if (!isPlainObject(entry)) {
      pushError(errors, entryRef, 'Cada engine deve ser um objeto.');
      continue;
    }

    if (!normalizeString(entry.entry_file)) {
      pushError(errors, entryRef, 'Campo obrigatório ausente: entry_file.');
    }
  }

  if (state && Array.isArray(state.engines)) {
    const missingEngines = state.engines
      .map((engine) => normalizeString(engine))
      .filter(Boolean)
      .filter((engine) => !Object.hasOwn(doc.engines, engine));

    if (missingEngines.length > 0) {
      pushWarning(
        warnings,
        rel(projectRoot, filePath),
        `Engine(s) instalada(s) ausente(s) no engine-map: ${missingEngines.join(', ')}.`,
      );
    }
  }
}

function validateManifest(projectRoot, internalDirName, manifest, errors) {
  for (const [relPath, entry] of Object.entries(manifest)) {
    if (!normalizeString(relPath)) {
      pushError(errors, rel(projectRoot, getManifestPath(projectRoot)), 'Manifest contém uma chave vazia.');
      continue;
    }
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath)) {
      pushError(errors, rel(projectRoot, getManifestPath(projectRoot)), `Manifest aponta para arquivo ausente: ${relPath}.`);
      continue;
    }
    if (!statSync(absPath).isFile()) {
      pushError(errors, rel(projectRoot, getManifestPath(projectRoot)), `Manifest aponta para diretório: ${relPath}.`);
    }
    if (!normalizeString(entry)) {
      pushError(errors, rel(projectRoot, getManifestPath(projectRoot)), `Hash inválido em manifest: ${relPath}.`);
    }
  }

  for (const relPath of getMinimumHumanReadableStructureRelPaths(internalDirName)) {
    if (!existsSync(join(projectRoot, relPath))) continue;
    if (!Object.hasOwn(manifest, relPath)) {
      pushError(errors, relPath, 'Arquivo obrigatório existe, mas não está registrado no manifest.');
    }
  }
}

function validateManagedEntrypoints(projectRoot, manifest, errors, warnings) {
  for (const target of ENTRYPOINT_TARGETS) {
    const relPath = target.path;
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath)) continue;

    const hasManifestEntry = Object.hasOwn(manifest, relPath);
    const inspection = inspectManagedEntrypointContent(readFileSync(absPath, 'utf8'));

    if (!inspection.hasBlock) {
      if (hasManifestEntry) {
        pushError(errors, relPath, 'Arquivo gerenciado pelo AgentForge sem bloco de bootloader.');
      } else {
        pushWarning(warnings, relPath, 'Arquivo unmanaged sem bloco AgentForge.');
      }
    }

    for (const message of buildEntrypointQualityMessage(inspection)) {
      if (message === 'Arquivo de entrada sem bloco gerenciado do AgentForge.') {
        continue;
      }
      if (message.startsWith('Conteúdo manual excessivo fora do bloco AgentForge')) {
        pushError(errors, relPath, message);
        continue;
      }
      if (message.startsWith('Entrypoint gerenciado excede o limite de')) {
        pushError(errors, relPath, message);
        continue;
      }
      if (message.startsWith('Bloco AgentForge excede o limite de')) {
        pushError(errors, relPath, message);
        continue;
      }
      if (message.startsWith('Bootloader sem referências obrigatórias')) {
        pushError(errors, relPath, `${message} Mova o conteúdo de domínio para .agentforge/context ou references.`);
        continue;
      }
      if (message.startsWith('Conteúdo legado Reversa detectado')) {
        pushError(errors, relPath, `${message} Remova as referências legadas da Reversa do entrypoint.`);
        continue;
      }
      if (message.startsWith('Linguagem Codex-only detectada')) {
        if (relPath === 'AGENTS.md') {
          continue;
        }
        pushError(errors, relPath, `${message} Use a linguagem da engine ativa ou o handoff do AgentForge.`);
      }
    }
  }
}

function isAdoptionSetupMode(state) {
  const mode = normalizeString(state?.setup_mode);
  return mode === 'adopt' || mode === 'hybrid';
}

function loadSnapshotRecords(projectRoot, internalDir) {
  const snapshotsDir = join(internalDir, 'imports', 'snapshots');
  if (!existsSync(snapshotsDir) || !statSync(snapshotsDir).isDirectory()) return [];

  const records = [];
  for (const filePath of listFilesRecursive(snapshotsDir, (fullPath, name) => name.toLowerCase().endsWith('.json'))) {
    try {
      const doc = JSON.parse(readFileSync(filePath, 'utf8'));
      if (!isPlainObject(doc)) continue;
      records.push({
        path: rel(projectRoot, filePath),
        source_path: normalizeString(doc.source_path),
        source_type: normalizeString(doc.source_type),
      });
    } catch {
      continue;
    }
  }
  return records;
}

function hasSnapshotForSource(snapshots, sourcePath) {
  const normalized = normalizeString(sourcePath);
  return snapshots.some((snapshot) => snapshot.source_path === normalized);
}

function hasManagedAdoptionEntrypoint(projectRoot, entrypointPath) {
  const absPath = join(projectRoot, entrypointPath);
  if (!existsSync(absPath) || !statSync(absPath).isFile()) return false;
  return inspectManagedEntrypointContent(readFileSync(absPath, 'utf8')).hasBlock;
}

function hasLegacyAdoptionSurfaceFiles(projectRoot, legacyDir) {
  const absDir = join(projectRoot, legacyDir);
  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) return false;
  return listFilesRecursive(absDir).length > 0;
}

function validateAdoptionSurface(projectRoot, internalDir, state, errors) {
  const checks = [];
  if (!isAdoptionSetupMode(state)) {
    return checks;
  }

  const snapshots = loadSnapshotRecords(projectRoot, internalDir);
  const stateRef = rel(projectRoot, join(internalDir, 'state.json'));

  const entrypoints = ['AGENTS.md', 'CLAUDE.md'].filter((entrypoint) => existsSync(join(projectRoot, entrypoint)));
  const legacySnapshotsMissing = entrypoints.filter((entrypoint) => {
    const hasManagedBlock = hasManagedAdoptionEntrypoint(projectRoot, entrypoint);
    if (hasManagedBlock) return false;
    return !hasSnapshotForSource(snapshots, entrypoint);
  });
  checks.push({
    id: 'legacy_entrypoints_snapshotted',
    passed: legacySnapshotsMissing.length === 0,
    message: legacySnapshotsMissing.length === 0
      ? 'Snapshots de entrypoints legados presentes ou entrypoints já gerenciados.'
      : `Snapshots ausentes para: ${legacySnapshotsMissing.join(', ')}.`,
  });

  const agentsMdPath = join(projectRoot, 'AGENTS.md');
  const agentsMdManaged = !existsSync(agentsMdPath)
    ? true
    : hasManagedAdoptionEntrypoint(projectRoot, 'AGENTS.md');
  checks.push({
    id: 'agents_md_managed',
    passed: agentsMdManaged,
    message: agentsMdManaged
      ? 'AGENTS.md está gerenciado pelo AgentForge.'
      : 'AGENTS.md existe, mas ainda não está sob o bloco gerenciado do AgentForge.',
  });

  const legacyAgentDirs = ['.agents', '.claude/agents', '.github/agents'].filter((dir) => hasLegacyAdoptionSurfaceFiles(projectRoot, dir));
  const legacyAgentsClassified = legacyAgentDirs.length === 0
    || listFilesRecursive(join(projectRoot, internalDir, 'agents'), (fullPath, name) => name.toLowerCase().endsWith('.yaml') || name.toLowerCase().endsWith('.yml')).length > 0
    || snapshots.some((snapshot) => snapshot.source_path.startsWith('.agents/') || snapshot.source_path.startsWith('.claude/agents/') || snapshot.source_path.startsWith('.github/agents/'));
  checks.push({
    id: 'legacy_agents_classified',
    passed: legacyAgentsClassified,
    message: legacyAgentsClassified
      ? 'Surface legada de agentes foi classificada ou já não existe.'
      : 'Surface legada de agentes existe, mas não foi classificada para adoção.',
  });

  const legacySkillDirs = ['.agents/skills', '.claude/skills'].filter((dir) => hasLegacyAdoptionSurfaceFiles(projectRoot, dir));
  const migratedSkills = listFilesRecursive(join(projectRoot, internalDir, 'skills'), (fullPath, name) => name.toUpperCase() === 'SKILL.MD');
  const legacySkillsMigratedOrPreserved = legacySkillDirs.length === 0
    || migratedSkills.length > 0
    || snapshots.some((snapshot) => snapshot.source_path.startsWith('.agents/skills/') || snapshot.source_path.startsWith('.claude/skills/'));
  checks.push({
    id: 'legacy_skills_migrated_or_preserved',
    passed: legacySkillsMigratedOrPreserved,
    message: legacySkillsMigratedOrPreserved
      ? 'Skills legadas foram migradas ou preservadas em snapshots.'
      : 'Skills legadas existem, mas não foram migradas nem preservadas.',
  });

  const contextIndexPath = join(internalDir, 'harness', 'context-index.yaml');
  let contextIndexReferencesPromotedArtifacts = true;
  if (existsSync(contextIndexPath)) {
    try {
      const doc = YAML.parse(readFileSync(contextIndexPath, 'utf8'));
      const adoptContexts = isPlainObject(doc?.task_contexts?.adopt) ? doc.task_contexts.adopt : {};
      const requiredArtifacts = [
        '.agentforge/context/',
        '.agentforge/skills/',
        '.agentforge/flows/',
        '.agentforge/policies/',
        '.agentforge/references/',
      ];
      contextIndexReferencesPromotedArtifacts = requiredArtifacts.every((artifact) => {
        return Object.values(adoptContexts).some((entry) => {
          if (Array.isArray(entry)) return entry.includes(artifact);
          if (typeof entry === 'string') return entry === artifact;
          if (isPlainObject(entry)) {
            return Object.values(entry).some((value) => Array.isArray(value) ? value.includes(artifact) : value === artifact);
          }
          return false;
        });
      });
    } catch {
      contextIndexReferencesPromotedArtifacts = false;
    }
  } else {
    contextIndexReferencesPromotedArtifacts = false;
  }
  checks.push({
    id: 'context_index_references_promoted_artifacts',
    passed: contextIndexReferencesPromotedArtifacts,
    message: contextIndexReferencesPromotedArtifacts
      ? 'context-index referencia artefatos promovidos.'
      : 'context-index não referencia todos os artefatos promovidos no modo adopt.',
  });

  for (const check of checks) {
    if (!check.passed) {
      pushError(errors, stateRef, `${check.id}: ${check.message}`);
    }
  }

  return checks;
}

function normalizeIdArray(values, sourceRef, fieldName, errors) {
  if (!Array.isArray(values)) {
    pushError(errors, sourceRef, `Campo obrigatório ausente ou inválido: ${fieldName}.`);
    return null;
  }

  const ids = [];
  for (const [index, entry] of values.entries()) {
    const normalized = normalizeString(entry);
    if (!normalized) {
      pushError(errors, `${sourceRef}#${fieldName}[${index}]`, 'O valor precisa ser uma string não vazia.');
      continue;
    }
    ids.push(normalized);
  }
  return ids;
}

function validateStateCollection(state, fieldName, actualIds, sourceRef, errors, label) {
  const stateIds = normalizeIdArray(state[fieldName], sourceRef, fieldName, errors);
  if (!stateIds) return;

  const stateSet = new Set(stateIds);
  const actualSet = new Set(actualIds);
  const stateSorted = [...stateIds].sort((a, b) => a.localeCompare(b));
  const actualSorted = [...actualIds].sort((a, b) => a.localeCompare(b));

  if (stateSorted.join('\u0000') === actualSorted.join('\u0000')) return;

  const missingFromState = actualSorted.filter((id) => !stateSet.has(id));
  const extraInState = stateSorted.filter((id) => !actualSet.has(id));
  const details = [];

  if (missingFromState.length > 0) {
    details.push(`faltam no state: ${missingFromState.join(', ')}`);
  }
  if (extraInState.length > 0) {
    details.push(`sobram no state: ${extraInState.join(', ')}`);
  }
  if (stateIds.length !== stateSet.size) {
    details.push('o state contém IDs duplicados');
  }
  if (actualIds.length !== actualSet.size) {
    details.push(`os arquivos em ${label} contêm nomes duplicados`);
  }

  pushError(errors, sourceRef, `Campo ${fieldName} não bate com os arquivos em ${label}.${details.length > 0 ? ` ${details.join('; ')}.` : ''}`);
}

function buildReport(result) {
  const lines = [];
  const status = result.errors.length > 0
    ? 'inválido'
    : result.warnings.length > 0
      ? 'válido com avisos'
      : 'válido';

  lines.push('# AgentForge Validation Report');
  lines.push('');
  lines.push(`- Status: ${status}`);
  lines.push(`- Diretório: \`${result.internalDirName}\``);
  lines.push(`- Agentes: ${result.stats.agents}`);
  lines.push(`- Subagentes: ${result.stats.subagents}`);
  lines.push(`- Fluxos: ${result.stats.flows}`);
  lines.push(`- Políticas verificadas: ${result.stats.policies}`);
  lines.push(`- Erros: ${result.errors.length}`);
  lines.push(`- Avisos: ${result.warnings.length}`);
  if (Array.isArray(result.adoptionChecks) && result.adoptionChecks.length > 0) {
    const passed = result.adoptionChecks.filter((check) => check.passed).length;
    lines.push(`- Adoption checks: ${passed}/${result.adoptionChecks.length}`);
  }
  lines.push('');

  const appendSection = (title, items, emptyMessage) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
    } else {
      for (const item of items) {
        lines.push(`- \`${item.file}\`: ${item.message}`);
      }
    }
    lines.push('');
  };

  appendSection('Erros', result.errors, 'Nenhum erro encontrado.');
  appendSection('Avisos', result.warnings, 'Nenhum aviso encontrado.');
  if (Array.isArray(result.adoptionChecks) && result.adoptionChecks.length > 0) {
    lines.push('## Adoption checks');
    lines.push('');
    for (const check of result.adoptionChecks) {
      lines.push(`- [${check.passed ? 'x' : ' '}] \`${check.id}\`: ${check.message}`);
    }
    lines.push('');
  }

  lines.push('## Componentes validados');
  lines.push('');

  const appendComponents = (title, items) => {
    lines.push(`### ${title}`);
    if (items.length === 0) {
      lines.push('- Nenhum item encontrado.');
    } else {
      for (const item of items) {
        lines.push(`- \`${item.id}\` (${item.file})`);
      }
    }
    lines.push('');
  };

  appendComponents('Agentes', result.components.agents);
  appendComponents('Subagentes', result.components.subagents);
  appendComponents('Fluxos', result.components.flows);
  appendComponents('Políticas', result.components.policies);

  return lines.join('\n');
}

export function validateAgentForgeStructure(projectRoot) {
  const internalDirName = resolveInternalDir(projectRoot);
  const internalDir = join(projectRoot, internalDirName);
  const errors = [];
  const warnings = [];
  const components = {
    agents: [],
    subagents: [],
    flows: [],
    policies: [],
  };

  const manifestPath = getManifestPath(projectRoot);
  const manifest = existsSync(manifestPath)
    ? parseJsonFile(manifestPath, errors, projectRoot) ?? {}
    : (() => {
        pushError(errors, rel(projectRoot, manifestPath), 'Manifest ausente.');
        return {};
      })();

  const statePath = join(internalDir, 'state.json');
  let state = null;
  if (!existsSync(statePath)) {
    pushError(errors, rel(projectRoot, statePath), 'Arquivo ausente.');
  } else {
    const parsed = parseJsonFile(statePath, errors, projectRoot);
    if (parsed) state = parsed;
  }

  const agentsDir = join(internalDir, 'agents');
  const agentRegistry = new Map();
  const agentsDirExists = existsSync(agentsDir) && statSync(agentsDir).isDirectory();
  const agentFiles = agentsDirExists ? listYamlFiles(agentsDir) : [];
  if (!agentsDirExists) {
    pushError(errors, rel(projectRoot, agentsDir), 'Diretório ausente: agents.');
  } else {
    if (agentFiles.length === 0) {
      pushError(errors, rel(projectRoot, agentsDir), 'Nenhum arquivo YAML de agente encontrado.');
    }

    for (const filePath of agentFiles) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;
      validateAgent(doc, filePath, errors, agentRegistry, components.agents, projectRoot);
    }
  }

  const subagentsDir = join(internalDir, 'subagents');
  const subagentRegistry = new Map();
  const subagentsDirExists = existsSync(subagentsDir) && statSync(subagentsDir).isDirectory();
  const subagentFiles = subagentsDirExists ? listYamlFiles(subagentsDir) : [];
  if (subagentsDirExists) {
    for (const filePath of subagentFiles) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;
      validateSubagent(doc, filePath, errors, agentRegistry, subagentRegistry, components.subagents, projectRoot);
    }
  }

  const flowsDir = join(internalDir, 'flows');
  const flowRegistry = new Map();
  const flowsDirExists = existsSync(flowsDir) && statSync(flowsDir).isDirectory();
  const flowFiles = flowsDirExists ? listYamlFiles(flowsDir) : [];
  if (!flowsDirExists) {
    pushError(errors, rel(projectRoot, flowsDir), 'Diretório ausente: flows.');
  } else {
    if (flowFiles.length === 0) {
      pushError(errors, rel(projectRoot, flowsDir), 'Nenhum arquivo YAML de flow encontrado.');
    }

    for (const filePath of flowFiles) {
      const doc = parseYamlFile(filePath, errors, projectRoot);
      if (!doc) continue;
      validateFlow(doc, filePath, errors, agentRegistry, subagentRegistry, flowRegistry, components.flows, projectRoot);
    }
  }

  const policiesDir = join(internalDir, 'policies');
  if (!existsSync(policiesDir) || !statSync(policiesDir).isDirectory()) {
    pushError(errors, rel(projectRoot, policiesDir), 'Diretório ausente: policies.');
  } else {
    for (const fileName of REQUIRED_POLICY_FILES) {
      validatePolicyFile(join(policiesDir, fileName), errors, components.policies, projectRoot);
    }
  }

  validateMinimumHumanReadableStructure(projectRoot, internalDirName, errors);
  validateAiStructure(projectRoot, internalDirName, state, errors);
  const taskModes = validateTaskModes(internalDir, projectRoot, errors);
  validateContextIndex(internalDir, projectRoot, errors, warnings, taskModes, state);
  validateContextMap(internalDir, projectRoot, errors, warnings);
  validateRefactorContextReports(internalDir, projectRoot, warnings);
  validateLoadOrder(internalDir, projectRoot, errors);
  validateEngineMap(internalDir, projectRoot, state, errors, warnings);
  validateManifest(projectRoot, internalDirName, manifest, errors);
  validateManagedEntrypoints(projectRoot, manifest, errors, warnings);

  if (state) {
    const stateRef = rel(projectRoot, statePath);
    if (Object.hasOwn(state, 'generated_agents')) {
      validateStateCollection(
        state,
        'generated_agents',
        agentFiles.map(fileId),
        stateRef,
        errors,
        '.agentforge/agents/*.yaml',
      );
    }

    if (Object.hasOwn(state, 'generated_subagents')) {
      validateStateCollection(
        state,
        'generated_subagents',
        subagentFiles.map(fileId),
        stateRef,
        errors,
        '.agentforge/subagents/*.yaml',
      );
    }

    if (Object.hasOwn(state, 'flows')) {
      validateStateCollection(
        state,
        'flows',
        flowFiles.map(fileId),
        stateRef,
        errors,
        '.agentforge/flows/*.yaml',
      );
    }

    if (Object.hasOwn(state, 'generated_skills')) {
      const skillFiles = listFilesRecursive(join(internalDir, 'skills'), (fullPath, name) => {
        return extname(name).toLowerCase() === '.md' && basename(name) === 'SKILL.md';
      });
      validateStateCollection(
        state,
        'generated_skills',
        skillFiles.map((filePath) => basename(dirname(filePath))),
        stateRef,
        errors,
        '.agentforge/skills/*/SKILL.md',
      );
    }

    if (!Array.isArray(state.engines)) {
      pushError(errors, stateRef, 'Campo obrigatório ausente ou inválido: engines.');
    }
    if (!SETUP_MODES.includes(state.setup_mode)) {
      pushError(
        errors,
        stateRef,
        `setup_mode inválido: "${normalizeString(state.setup_mode) || 'vazio'}". Valores permitidos: ${SETUP_MODES.join(', ')}.`,
      );
    }
  }

  const definition = loadPhaseDefinition(projectRoot);
  const workflow = normalizeWorkflowState(state ?? {}, definition);
  const stateRef = rel(projectRoot, statePath);
  const adoptionChecks = validateAdoptionSurface(projectRoot, internalDir, state, errors);
  if (state && isPlainObject(state.workflow)) {
    if (normalizePhaseId(state.phase) !== workflow.current_phase) {
      pushError(errors, stateRef, 'Campo phase legado não bate com workflow.current_phase.');
    }
    if (JSON.stringify(normalizePhaseList(state.completed)) !== JSON.stringify(workflow.completed_phases)) {
      pushError(errors, stateRef, 'Campo completed legado não bate com workflow.completed_phases.');
    }
    if (JSON.stringify(normalizePhaseList(state.pending)) !== JSON.stringify(workflow.pending_phases)) {
      pushError(errors, stateRef, 'Campo pending legado não bate com workflow.pending_phases.');
    }

    for (const phaseId of workflow.completed_phases) {
      const phase = definition.phases.find((entry) => entry.id === phaseId);
      if (!phase) continue;
      const report = getPhaseCompletionReport(projectRoot, phase, state, definition);
      if (!report.satisfied) {
        pushError(errors, stateRef, `A fase concluída "${phaseId}" não cumpre os checks requeridos.`);
      }
    }

    if ((state.pending ?? []).length === 0 && workflow.pending_phases.length > 0) {
      pushError(errors, stateRef, 'state.pending vazio só é válido quando todas as fases obrigatórias estão concluídas.');
    }
  }

  const planPath = join(internalDir, 'plan.md');
  const planRef = rel(projectRoot, planPath);
  if (!existsSync(planPath)) {
    pushError(errors, planRef, 'Arquivo ausente.');
  } else {
    const planContent = readFileSync(planPath, 'utf8');
    const generatedPlan = renderPlanFromPhases(projectRoot, state ?? {}, definition);
    if (planContent !== generatedPlan) {
      pushError(errors, planRef, 'plan.md diverge do workflow estruturado.');
    }
  }

  const reportsPath = join(internalDir, 'reports');
  if (existsSync(reportsPath) && !statSync(reportsPath).isDirectory()) {
    pushWarning(warnings, rel(projectRoot, reportsPath), 'reports existe, mas não é um diretório.');
  }

  const report = {
    valid: errors.length === 0,
    errors,
    warnings,
    components,
    stats: {
      agents: components.agents.length,
      subagents: components.subagents.length,
      flows: components.flows.length,
      policies: components.policies.length,
    },
    adoptionChecks,
    internalDirName,
  };

  return {
    ...report,
    reportPath: join(reportsPath, 'validation.md'),
    reportContent: buildReport(report),
    internalDir,
  };
}

export default async function validate() {
  const { default: chalk } = await import('chalk');
  const { default: process } = await import('process');

  const projectRoot = process.cwd();
  const result = validateAgentForgeStructure(projectRoot);

  mkdirSync(dirname(result.reportPath), { recursive: true });
  writeFileSync(result.reportPath, result.reportContent, 'utf8');

  if (result.valid) {
    if (result.warnings.length > 0) {
      console.log(chalk.yellow(`\n  AgentForge: validação concluída com sucesso (${result.warnings.length} aviso(s)).`));
    } else {
      console.log(chalk.hex('#ffa203')(`\n  AgentForge: validação concluída com sucesso.`));
    }
    console.log(`  Relatório: ${result.reportPath}\n`);
    return 0;
  }

  console.log(chalk.red(`\n  AgentForge: validação encontrou ${result.errors.length} erro(s).`));
  console.log(`  Relatório: ${result.reportPath}\n`);
  return 1;
}
