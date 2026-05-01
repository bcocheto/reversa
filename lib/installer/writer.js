import {
  existsSync, mkdirSync, writeFileSync,
  readFileSync, cpSync, appendFileSync,
  readdirSync, statSync,
} from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { askMergeStrategy } from './prompts.js';
import {
  PRODUCT,
  LEGACY_PRODUCT,
  AGENT_SKILL_IDS,
  resolveInternalDir,
  resolveOutputDir,
  getStatePath,
  resolveAgentSourceId,
  normalizeSetupMode,
} from '../product.js';
import { renderManagedBootloaderDocument } from '../exporter/bootloader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');
const TEMPLATES_DIR = join(REPO_ROOT, 'templates');

export const CANONICAL_AGENT_TEMPLATES = Object.freeze({
  orchestrator: 'agentforge/agents/orchestrator.yaml',
  'product-owner': 'agentforge/agents/product-owner.yaml',
  architect: 'agentforge/agents/architect.yaml',
  engineer: 'agentforge/agents/engineer.yaml',
  reviewer: 'agentforge/agents/reviewer.yaml',
  qa: 'agentforge/agents/qa.yaml',
  security: 'agentforge/agents/security.yaml',
  devops: 'agentforge/agents/devops.yaml',
});

export const CANONICAL_FLOW_TEMPLATES = Object.freeze({
  'feature-development': 'agentforge/flows/feature-development.yaml',
  bugfix: 'agentforge/flows/bugfix.yaml',
  refactor: 'agentforge/flows/refactor.yaml',
  release: 'agentforge/flows/release.yaml',
});

export const CANONICAL_FLOW_DEPENDENCIES = Object.freeze({
  'feature-development': ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
  bugfix: ['orchestrator', 'engineer', 'reviewer'],
  refactor: ['orchestrator', 'architect', 'engineer', 'reviewer'],
  release: ['orchestrator', 'qa', 'security', 'devops', 'reviewer'],
});

export const CANONICAL_STRUCTURE_DIRS = Object.freeze([
  'reports',
]);

const AGENT_LABELS = {
  orchestrator: 'Orchestrator',
  'product-owner': 'Product Owner',
  architect: 'Architect',
  engineer: 'Engineer',
  reviewer: 'Reviewer',
  qa: 'QA',
  security: 'Security',
  devops: 'DevOps',
};

const FLOW_LABELS = {
  'feature-development': 'Feature Development',
  bugfix: 'Bugfix',
  refactor: 'Refactor',
  release: 'Release',
};

const MANAGED_BOOTLOADER_ENTRY_TEMPLATES = Object.freeze({
  'AGENTS.md': {
    activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
  },
  'CLAUDE.md': {
    activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
  },
  '.github/copilot-instructions.md': {
    activationText: 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.',
  },
});

export const MINIMUM_HUMAN_READABLE_STRUCTURE_TEMPLATES = Object.freeze([
  { template: 'agentforge/harness/README.md', dest: 'harness/README.md' },
  { template: 'agentforge/harness/router.md', dest: 'harness/router.md' },
  { template: 'agentforge/harness/context-index.yaml', dest: 'harness/context-index.yaml' },
  { template: 'agentforge/harness/task-modes.yaml', dest: 'harness/task-modes.yaml' },
  { template: 'agentforge/harness/load-order.yaml', dest: 'harness/load-order.yaml' },
  { template: 'agentforge/harness/engine-map.yaml', dest: 'harness/engine-map.yaml' },
  { template: 'agentforge/reports/README.md', dest: 'reports/README.md' },
]);

export const HUMAN_READABLE_STRUCTURE_TEMPLATES = Object.freeze([
  { template: 'agentforge/README.md', dest: 'README.md' },
  { template: 'agentforge/harness/README.md', dest: 'harness/README.md' },
  { template: 'agentforge/harness/router.md', dest: 'harness/router.md' },
  { template: 'agentforge/harness/context-index.yaml', dest: 'harness/context-index.yaml' },
  { template: 'agentforge/harness/task-modes.yaml', dest: 'harness/task-modes.yaml' },
  { template: 'agentforge/harness/load-order.yaml', dest: 'harness/load-order.yaml' },
  { template: 'agentforge/harness/engine-map.yaml', dest: 'harness/engine-map.yaml' },
  { template: 'agentforge/context/README.md', dest: 'context/README.md' },
  { template: 'agentforge/context/project-overview.md', dest: 'context/project-overview.md' },
  { template: 'agentforge/context/architecture.md', dest: 'context/architecture.md' },
  { template: 'agentforge/context/conventions.md', dest: 'context/conventions.md' },
  { template: 'agentforge/context/coding-standards.md', dest: 'context/coding-standards.md' },
  { template: 'agentforge/context/testing.md', dest: 'context/testing.md' },
  { template: 'agentforge/context/deployment.md', dest: 'context/deployment.md' },
  { template: 'agentforge/context/glossary.md', dest: 'context/glossary.md' },
  { template: 'agentforge/references/README.md', dest: 'references/README.md' },
  { template: 'agentforge/references/commands.md', dest: 'references/commands.md' },
  { template: 'agentforge/references/important-files.md', dest: 'references/important-files.md' },
  { template: 'agentforge/references/external-docs.md', dest: 'references/external-docs.md' },
  { template: 'agentforge/policies/README.md', dest: 'policies/README.md' },
  { template: 'agentforge/policies/protected-files.md', dest: 'policies/protected-files.md' },
  { template: 'agentforge/policies/human-approval.md', dest: 'policies/human-approval.md' },
  { template: 'agentforge/policies/safety.md', dest: 'policies/safety.md' },
  { template: 'agentforge/flows/README.md', dest: 'flows/README.md' },
  { template: 'agentforge/flows/feature-development.md', dest: 'flows/feature-development.md' },
  { template: 'agentforge/flows/bugfix.md', dest: 'flows/bugfix.md' },
  { template: 'agentforge/flows/refactor.md', dest: 'flows/refactor.md' },
  { template: 'agentforge/flows/review.md', dest: 'flows/review.md' },
  { template: 'agentforge/skills/README.md', dest: 'skills/README.md' },
  { template: 'agentforge/skills/run-tests/SKILL.md', dest: 'skills/run-tests/SKILL.md' },
  { template: 'agentforge/skills/review-changes/SKILL.md', dest: 'skills/review-changes/SKILL.md' },
  { template: 'agentforge/skills/create-implementation-plan/SKILL.md', dest: 'skills/create-implementation-plan/SKILL.md' },
  { template: 'agentforge/memory/README.md', dest: 'memory/README.md' },
  { template: 'agentforge/memory/lessons.md', dest: 'memory/lessons.md' },
  { template: 'agentforge/memory/open-questions.md', dest: 'memory/open-questions.md' },
  { template: 'agentforge/reports/README.md', dest: 'reports/README.md' },
]);

export const CANONICAL_STRUCTURE_FILES = Object.freeze([
  ...HUMAN_READABLE_STRUCTURE_TEMPLATES,
]);

export function getMinimumHumanReadableStructureRelPaths(internalDirName = PRODUCT.internalDir) {
  return MINIMUM_HUMAN_READABLE_STRUCTURE_TEMPLATES.map((entry) => join(internalDirName, entry.dest));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function formatDisplayList(values, labels = {}) {
  const items = unique(values).map(value => labels[value] ?? value);
  return items.length > 0 ? items.join(', ') : '—';
}

function formatTomlArray(values) {
  if (!values || values.length === 0) return '[]';
  return `[\n${values.map(value => `  "${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',\n')}\n]`;
}

function formatYamlInlineArray(values) {
  return JSON.stringify(values);
}

export class Writer {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.createdFiles = [];   // dirs + files — used by uninstall via state.json
    this.manifestPaths = [];  // files only — used to build SHA-256 manifest
  }

  // Normalises an absolute path to project-relative
  _rel(absPath) {
    return absPath
      .replace(this.projectRoot + '\\', '')
      .replace(this.projectRoot + '/', '');
  }

  // Registers a path for uninstall tracking (dirs or files)
  _register(absPath) {
    const rel = this._rel(absPath);
    if (!this.createdFiles.includes(rel)) this.createdFiles.push(rel);
    // If it is a regular file, also track for manifest
    try {
      if (!statSync(absPath).isDirectory()) {
        if (!this.manifestPaths.includes(rel)) this.manifestPaths.push(rel);
      }
    } catch { /* ignore */ }
  }

  // Recursively registers individual files inside a directory for manifest
  _registerFilesInDir(dirPath) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          this._registerFilesInDir(full);
        } else {
          const rel = this._rel(full);
          if (!this.manifestPaths.includes(rel)) this.manifestPaths.push(rel);
        }
      }
    } catch { /* ignore */ }
  }

  // Cria diretório de forma segura
  _mkdir(dir) {
    mkdirSync(dir, { recursive: true });
  }

  // Cria diretório e registra na lista de arquivos criados quando necessário.
  _ensureDir(dir, { track = false } = {}) {
    const existed = existsSync(dir);
    this._mkdir(dir);
    if (track && !existed) {
      this._register(dir);
    }
  }

  ensureDirectory(dir, options = {}) {
    this._ensureDir(dir, options);
  }

  // Escreve arquivo apenas se não existir
  _writeNew(filePath, content) {
    if (existsSync(filePath)) return false;
    this._mkdir(dirname(filePath));
    writeFileSync(filePath, content, 'utf8');
    this._register(filePath);
    return true;
  }

  writeGeneratedFile(filePath, content, { force = false } = {}) {
    if (!force && existsSync(filePath)) return false;
    this._mkdir(dirname(filePath));
    writeFileSync(filePath, content, 'utf8');
    this._register(filePath);
    return true;
  }

  _writeTemplate(templateRelPath, destPath, { force = false } = {}) {
    const templatePath = join(TEMPLATES_DIR, templateRelPath);
    if (!existsSync(templatePath)) return false;
    if (!force && existsSync(destPath)) return false;

    this._mkdir(dirname(destPath));
    writeFileSync(destPath, readFileSync(templatePath, 'utf8'), 'utf8');
    this._register(destPath);
    return true;
  }

  installTemplateFile(templateRelPath, destPath, options = {}) {
    return this._writeTemplate(templateRelPath, destPath, options);
  }

  installCanonicalStructure(internalDirName, { agents = [], flows = [], scopeContent = null, force = false } = {}) {
    const internalDir = join(this.projectRoot, internalDirName);
    this._ensureDir(join(internalDir, 'context'));
    this._ensureDir(join(internalDir, 'agents'));
    this._ensureDir(join(internalDir, 'subagents'));
    this._ensureDir(join(internalDir, 'flows'));
    this._ensureDir(join(internalDir, 'policies'));
    this._ensureDir(join(internalDir, 'memory'));
    for (const dir of CANONICAL_STRUCTURE_DIRS) {
      this._ensureDir(join(internalDir, dir));
    }

    const scopePath = join(internalDir, 'scope.md');
    if (scopeContent !== null && scopeContent !== undefined) {
      if (!force && existsSync(scopePath)) {
        // Preserva o arquivo existente em reinstalações sem override explícito.
      } else {
        this._mkdir(dirname(scopePath));
        writeFileSync(scopePath, scopeContent, 'utf8');
        this._register(scopePath);
      }
    } else {
      this._writeTemplate('agentforge/scope.md', scopePath, { force });
    }

    const selectedAgents = unique(agents);
    const selectedFlows = unique(flows);

    for (const agentId of selectedAgents) {
      const templateRelPath = CANONICAL_AGENT_TEMPLATES[agentId];
      if (!templateRelPath) continue;
      this._writeTemplate(templateRelPath, join(internalDir, 'agents', `${agentId}.yaml`), { force });
    }

    for (const subagentId of ['database-specialist', 'security-reviewer', 'api-contract-reviewer']) {
      this._writeTemplate(
        `agentforge/subagents/${subagentId}.yaml`,
        join(internalDir, 'subagents', `${subagentId}.yaml`),
        { force },
      );
    }

    for (const flowId of selectedFlows) {
      const templateRelPath = CANONICAL_FLOW_TEMPLATES[flowId];
      if (!templateRelPath) continue;
      this._writeTemplate(templateRelPath, join(internalDir, 'flows', `${flowId}.yaml`), { force });
    }

    for (const policyId of ['permissions', 'protected-files', 'human-approval']) {
      this._writeTemplate(
        `agentforge/policies/${policyId}.yaml`,
        join(internalDir, 'policies', `${policyId}.yaml`),
        { force },
      );
    }

    for (const memoryId of ['decisions', 'conventions', 'glossary']) {
      this._writeTemplate(
        `agentforge/memory/${memoryId}.md`,
        join(internalDir, 'memory', `${memoryId}.md`),
        { force },
      );
    }
  }

  installHumanReadableStructure(internalDirName, { force = false } = {}) {
    const internalDir = join(this.projectRoot, internalDirName);

    for (const entry of HUMAN_READABLE_STRUCTURE_TEMPLATES) {
      this._writeTemplate(entry.template, join(internalDir, entry.dest), { force });
    }
  }

  installMinimumHumanReadableStructure(internalDirName, { force = false } = {}) {
    const internalDir = join(this.projectRoot, internalDirName);

    for (const entry of MINIMUM_HUMAN_READABLE_STRUCTURE_TEMPLATES) {
      this._writeTemplate(entry.template, join(internalDir, entry.dest), { force });
    }
  }

  // Instala os skills de um agente para uma engine
  async installSkill(agentId, skillsDir) {
    const sourceAgentId = resolveAgentSourceId(agentId);
    const currentSrc = join(AGENTS_DIR, agentId);
    const legacySrc = join(AGENTS_DIR, sourceAgentId);
    const src = existsSync(currentSrc) ? currentSrc : legacySrc;
    const dest = join(this.projectRoot, skillsDir, agentId);

    if (!existsSync(src)) {
      console.warn(`  Agente não encontrado: ${agentId}`);
      return;
    }

    if (existsSync(dest)) return; // já instalado

    this._mkdir(dirname(dest));
    cpSync(src, dest, { recursive: true });
    this._register(dest);              // directory → uninstall tracking
    this._registerFilesInDir(dest);    // individual files → manifest tracking
  }

  // Instala o arquivo de entrada de uma engine (CLAUDE.md, AGENTS.md, etc.)
  // force=true: sobrescreve silenciosamente (usado pelo update em arquivos intactos)
  async installEntryFile(engine, { force = false } = {}) {
    const templatePath = join(TEMPLATES_DIR, 'engines', engine.entryTemplate);
    const destPath = join(this.projectRoot, engine.entryFile);
    const bootloaderTemplate = MANAGED_BOOTLOADER_ENTRY_TEMPLATES[engine.entryFile];

    if (!bootloaderTemplate && !existsSync(templatePath)) return;

    const content = bootloaderTemplate
      ? renderManagedBootloaderDocument(bootloaderTemplate)
      : readFileSync(templatePath, 'utf8');

    if (!existsSync(destPath)) {
      this._mkdir(dirname(destPath));
      writeFileSync(destPath, content, 'utf8');
      this._register(destPath);
      return;
    }

    if (force) {
      this._mkdir(dirname(destPath));
      writeFileSync(destPath, content, 'utf8');
      this._register(destPath);
      return;
    }

    // Arquivo já existe — perguntar ao usuário (apenas merge ou skip)
    const strategy = await askMergeStrategy(engine.entryFile);

    if (strategy === 'merge') {
      appendFileSync(destPath, '\n\n---\n\n' + content, 'utf8');
      // Não registra em createdFiles — arquivo pré-existente
    }
    // 'skip' → não faz nada
  }

  // Cria a estrutura interna do produto.
  createProductDir(answers, version) {
    const internalDirName = resolveInternalDir(this.projectRoot);
    const internalDir = join(this.projectRoot, internalDirName);
    const configDir = join(internalDir, '_config');
    const render = (template, replacements) => {
      let content = template;
      for (const [key, value] of Object.entries(replacements)) {
        content = content.replaceAll(`{{${key}}}`, value);
      }
      return content;
    };
    const tomlString = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const projectName = answers.project_name ?? answers.project ?? '';
    const projectType = answers.project_type ?? '';
    const stack = answers.stack ?? '';
    const objective = answers.objective ?? '';
    const setupMode = normalizeSetupMode(answers.setup_mode);
    const gitStrategy = answers.git_strategy ?? 'commit';
    const internalAgents = unique(answers.internal_agents ?? AGENT_SKILL_IDS);
    const initialAgents = unique(answers.initial_agents ?? answers.generated_agents ?? []);
    const initialFlows = unique(answers.initial_flows ?? answers.flows ?? []);
    const generatedSubagents = unique(answers.generated_subagents ?? []);
    const responseMode = answers.response_mode ?? answers.answer_mode ?? 'chat';
    const detailLevel = answers.detail_level ?? 'complete';
    const memoryPolicy = answers.memory_policy ?? 'persistent';
    const reviewPolicy = answers.review_policy ?? 'strict';
    const selectedAgents = unique([
      ...initialAgents,
      ...initialFlows.flatMap(flowId => CANONICAL_FLOW_DEPENDENCIES[flowId] ?? []),
    ]);
    const generatedAgents = unique([...selectedAgents, ...initialAgents, ...(answers.generated_agents ?? [])]);
    const outputFolder = answers.output_folder ?? PRODUCT.outputDir;
    const scopeTemplate = readFileSync(join(TEMPLATES_DIR, 'agentforge', 'scope.md'), 'utf8');
    const scopeContent = render(scopeTemplate, {
      PROJECT_NAME: projectName,
      PROJECT_TYPE: projectType,
      OBJECTIVE: objective,
      STACK: stack,
      USER_NAME: answers.user_name ?? '',
      CHAT_LANGUAGE: answers.chat_language ?? 'pt-br',
      DOC_LANGUAGE: answers.doc_language ?? 'pt-br',
      GIT_STRATEGY: gitStrategy,
      INITIAL_AGENTS: formatDisplayList(initialAgents, AGENT_LABELS),
      INITIAL_FLOWS: formatDisplayList(initialFlows, FLOW_LABELS),
      ENGINES: formatDisplayList(answers.engines ?? []),
    });

    this._ensureDir(internalDir);
    this._ensureDir(configDir);

    // state.json
    const stateTemplate = readFileSync(join(TEMPLATES_DIR, 'state.json'), 'utf8');
    const state = JSON.parse(stateTemplate.replace('{{VERSION}}', version));
    state.project = projectName;
    state.user_name = answers.user_name;
    state.project_type = projectType;
    state.stack = stack;
    state.objective = objective;
    state.setup_mode = setupMode;
    state.chat_language = answers.chat_language;
    state.doc_language = answers.doc_language;
    state.git_strategy = gitStrategy;
    state.phase = null;
    state.completed = [];
    state.pending = ['discovery', 'agent-design', 'flow-design', 'policies', 'export', 'review'];
    state.engines = answers.engines;
    state.internal_agents = internalAgents;
    state.initial_agents = initialAgents;
    state.generated_agents = generatedAgents;
    state.generated_subagents = generatedSubagents;
    state.initial_flows = initialFlows;
    state.flows = initialFlows;
    state.output_folder = outputFolder;
    state.created_files = [];
    state.checkpoints = {};

    const statePath = getStatePath(this.projectRoot);
    this._writeNew(statePath, JSON.stringify(state, null, 2));

    // config.toml — rendered with actual selections
    const configTemplate = readFileSync(join(TEMPLATES_DIR, 'config.toml'), 'utf8');
    const enginesList = formatTomlArray(answers.engines);
    const initialAgentsList = formatTomlArray(initialAgents);
    const initialFlowsList = formatTomlArray(initialFlows);
    const internalAgentsList = formatTomlArray(internalAgents);
    const generatedAgentsList = formatTomlArray(generatedAgents);
    const generatedSubagentsList = formatTomlArray(generatedSubagents);
    const flowsList = formatTomlArray(initialFlows);
    const config = configTemplate
      .replace('{{PROJECT_NAME}}', tomlString(projectName))
      .replace('{{PROJECT_TYPE}}', tomlString(projectType))
      .replace('{{STACK}}', tomlString(stack))
      .replace('{{VERSION}}', version)
      .replace('{{SETUP_MODE}}', tomlString(setupMode))
      .replace('{{USER_NAME}}', tomlString(answers.user_name))
      .replace('{{CHAT_LANGUAGE}}', tomlString(answers.chat_language))
      .replace('{{DOC_LANGUAGE}}', tomlString(answers.doc_language))
      .replace('{{OUTPUT_FOLDER}}', tomlString(outputFolder))
      .replace('{{INITIAL_AGENT_ARRAY}}', initialAgentsList)
      .replace('{{INITIAL_FLOW_ARRAY}}', initialFlowsList)
      .replace('{{ENGINE_ARRAY}}', enginesList)
      .replace('{{INTERNAL_AGENT_ARRAY}}', internalAgentsList)
      .replace('{{GENERATED_AGENT_ARRAY}}', generatedAgentsList)
      .replace('{{GENERATED_SUBAGENT_ARRAY}}', generatedSubagentsList)
      .replace('{{FLOW_ARRAY}}', flowsList)
      .replace('{{OBJECTIVE}}', tomlString(objective))
      .replace('{{RESPONSE_MODE}}', tomlString(responseMode))
      .replace('{{DETAIL_LEVEL}}', tomlString(detailLevel))
      .replace('{{MEMORY_POLICY}}', tomlString(memoryPolicy))
      .replace('{{REVIEW_POLICY}}', tomlString(reviewPolicy))
      .replace('{{GIT_STRATEGY}}', tomlString(gitStrategy));

    this._writeNew(join(internalDir, 'config.toml'), config);
    this._writeNew(join(internalDir, 'config.user.toml'),
      readFileSync(join(TEMPLATES_DIR, 'config.user.toml'), 'utf8'));

    // plan.md
    const planTemplate = readFileSync(join(TEMPLATES_DIR, 'plan.md'), 'utf8');
    const plan = planTemplate
      .replace('{{PROJECT}}', projectName)
      .replace('{{PROJECT_TYPE}}', projectType)
      .replace('{{STACK}}', stack)
      .replace('{{OBJECTIVE}}', objective)
      .replace('{{DATE}}', new Date().toISOString().split('T')[0]);

    this._writeNew(join(internalDir, 'plan.md'), plan);

    // version
    this._writeNew(join(internalDir, 'version'), version);

    this.installMinimumHumanReadableStructure(internalDirName);
    this.installHumanReadableStructure(internalDirName);

    // Canonical AgentForge structure
    this.installCanonicalStructure(internalDirName, {
      agents: selectedAgents,
      flows: initialFlows,
      scopeContent,
    });

    // manifest.yaml
    this._writeNew(join(configDir, 'manifest.yaml'),
      `installation:\n  version: ${JSON.stringify(version)}\n  installDate: ${JSON.stringify(new Date().toISOString())}\n  lastUpdated: ${JSON.stringify(new Date().toISOString())}\n  setup_mode: ${JSON.stringify(setupMode)}\n\nproject:\n  name: ${JSON.stringify(projectName)}\n  type: ${JSON.stringify(projectType)}\n  stack: ${JSON.stringify(stack)}\n  objective: ${JSON.stringify(objective)}\n\nuser:\n  name: ${JSON.stringify(answers.user_name)}\n  chat_language: ${JSON.stringify(answers.chat_language)}\n  doc_language: ${JSON.stringify(answers.doc_language)}\n\ngit_strategy: ${JSON.stringify(gitStrategy)}\nengines: ${formatYamlInlineArray(answers.engines)}\ninternal_agents: ${formatYamlInlineArray(internalAgents)}\ninitial_agents: ${formatYamlInlineArray(initialAgents)}\ngenerated_agents: ${formatYamlInlineArray(generatedAgents)}\ngenerated_subagents: ${formatYamlInlineArray(generatedSubagents)}\ninitial_flows: ${formatYamlInlineArray(initialFlows)}\nflows: ${formatYamlInlineArray(initialFlows)}\nsetup_mode: ${JSON.stringify(setupMode)}\n`
    );
  }

  // Adiciona o diretório interno do produto e a pasta de saída ao .gitignore
  updateGitignore(outputFolder) {
    const gitignorePath = join(this.projectRoot, '.gitignore');
    const internalDir = resolveInternalDir(this.projectRoot);
    const resolvedOutputFolder = resolveOutputDir(this.projectRoot, outputFolder);
    const markerName = internalDir === PRODUCT.internalDir
      ? PRODUCT.name
      : LEGACY_PRODUCT.name;
    const lines = [
      '',
      `# ${markerName}`,
      `${internalDir}/config.user.toml`,
      `${internalDir}/config.user.yaml`,
      `${resolvedOutputFolder}/`,
    ].join('\n');

    if (existsSync(gitignorePath)) {
      const existing = readFileSync(gitignorePath, 'utf8');
      if (!existing.includes(`# ${markerName}`)) {
        appendFileSync(gitignorePath, lines, 'utf8');
      }
    } else {
      writeFileSync(gitignorePath, lines.trimStart(), 'utf8');
      this._register(gitignorePath);
    }
  }

  // Salva a lista de arquivos criados em state.json
  saveCreatedFiles() {
    const statePath = getStatePath(this.projectRoot);
    if (!existsSync(statePath)) return;
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.created_files = [...new Set([...(state.created_files ?? []), ...this.createdFiles])];
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
