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
  resolveInternalDir,
  resolveOutputDir,
  getStatePath,
  resolveAgentSourceId,
} from '../product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');
const TEMPLATES_DIR = join(REPO_ROOT, 'templates');

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

  // Escreve arquivo apenas se não existir
  _writeNew(filePath, content) {
    if (existsSync(filePath)) return false;
    this._mkdir(dirname(filePath));
    writeFileSync(filePath, content, 'utf8');
    this._register(filePath);
    return true;
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

    if (!existsSync(templatePath)) return;

    const content = readFileSync(templatePath, 'utf8');

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

    this._mkdir(internalDir);
    this._mkdir(configDir);
    this._mkdir(join(internalDir, 'context'));

    // state.json
    const stateTemplate = readFileSync(join(TEMPLATES_DIR, 'state.json'), 'utf8');
    const state = JSON.parse(stateTemplate.replace('{{VERSION}}', version));
    state.project = answers.project_name;
    state.user_name = answers.user_name;
    state.chat_language = answers.chat_language;
    state.doc_language = answers.doc_language;
    state.answer_mode = answers.answer_mode;
    state.output_folder = answers.output_folder;
    state.engines = answers.engines;
    state.agents = answers.agents;

    const statePath = getStatePath(this.projectRoot);
    this._writeNew(statePath, JSON.stringify(state, null, 2));

    // config.toml — rendered with actual selections
    const configTemplate = readFileSync(join(TEMPLATES_DIR, 'config.toml'), 'utf8');
    const agentsList = answers.agents.map(a => `  "${a}"`).join(',\n');
    const enginesList = answers.engines.map(e => `  "${e}"`).join(',\n');
    const config = configTemplate
      .replace('name = ""', `name = "${answers.project_name}"`)
      .replace('name = ""', `name = "${answers.user_name}"`)
      .replace('chat_language = "pt-br"', `chat_language = "${answers.chat_language}"`)
      .replace('doc_language = "pt-br"', `doc_language = "${answers.doc_language}"`)
      .replace(/folder = ".*?"/, `folder = "${answers.output_folder ?? PRODUCT.outputDir}"`)
      .replace(
        /\[agents\]\r?\ninstalled = \[[\s\S]*?\]/,
        `[agents]\ninstalled = [\n${agentsList}\n]`
      )
      .replace('installed = []', `installed = [\n${enginesList}\n]`)
      .replace('answer_mode = "chat"', `answer_mode = "${answers.answer_mode}"`);

    this._writeNew(join(internalDir, 'config.toml'), config);
    this._writeNew(join(internalDir, 'config.user.toml'),
      readFileSync(join(TEMPLATES_DIR, 'config.user.toml'), 'utf8'));

    // plan.md
    const planTemplate = readFileSync(join(TEMPLATES_DIR, 'plan.md'), 'utf8');
    const plan = planTemplate
      .replace('{{PROJECT}}', answers.project_name)
      .replace('{{DATE}}', new Date().toISOString().split('T')[0]);

    this._writeNew(join(internalDir, 'plan.md'), plan);

    // version
    this._writeNew(join(internalDir, 'version'), version);

    // manifest.yaml
    this._writeNew(join(configDir, 'manifest.yaml'),
      `installation:\n  version: ${version}\n  installDate: ${new Date().toISOString()}\n  lastUpdated: ${new Date().toISOString()}\n\nengines:\n${answers.engines.map(e => `  - ${e}`).join('\n')}\n\nagents:\n${answers.agents.map(a => `  - ${a}`).join('\n')}\n`
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
