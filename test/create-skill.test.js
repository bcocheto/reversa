import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

const INSTALL_ANSWERS = {
  project_name: 'Skill Creation Demo',
  user_name: 'Ana',
  project_type: 'SaaS/Web App',
  stack: 'Node.js, TypeScript, PostgreSQL',
  objective: 'develop-features',
  initial_agents: [
    'orchestrator',
    'product-owner',
    'architect',
    'engineer',
    'reviewer',
  ],
  initial_flows: ['feature-development', 'release'],
  chat_language: 'pt-br',
  doc_language: 'pt-br',
  git_strategy: 'commit',
  setup_mode: 'bootstrap',
  output_folder: '_agentforge',
  engines: ['codex'],
  internal_agents: AGENT_SKILL_IDS,
  response_mode: 'chat',
  detail_level: 'complete',
  memory_policy: 'persistent',
  review_policy: 'strict',
};

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(INSTALL_ANSWERS, '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function runCreateSkill(projectRoot, skillId, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'create-skill', skillId, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function createSuggestion(projectRoot, overrides = {}) {
  const suggestion = {
    id: 'run-tests',
    name: 'Run Tests',
    description: 'Executa e interpreta a suíte de testes do projeto.',
    reason: 'package.json já expõe um script de teste.',
    confidence: 'high',
    triggers: ['package.json scripts.test'],
    recommended_context: ['context/testing.md', 'references/commands.md'],
    recommended_steps: [
      'Mapear o comando de teste principal e seus aliases.',
      'Explicar quando rodar a suíte completa ou parcial.',
      'Registrar como interpretar falhas frequentes.',
    ],
    safety_limits: [
      'Não alterar arquivos de produção para validar testes.',
      'Usar diretórios temporários quando a suíte escrever artefatos.',
    ],
    engine_exports: ['AGENTS.md', '.github/copilot-instructions.md'],
    source_evidence: [
      { file: 'package.json', line: 12, snippet: '"test": "node --test"' },
    ],
    ...overrides,
  };

  const suggestionPath = join(projectRoot, PRODUCT.internalDir, 'skill-suggestions', `${suggestion.id}.yaml`);
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'skill-suggestions'), { recursive: true });
  writeFileSync(suggestionPath, `${YAML.stringify(suggestion).trim()}\n`, 'utf8');
  return suggestionPath;
}

function removeExistingSkill(projectRoot, skillId) {
  rmSync(join(projectRoot, PRODUCT.internalDir, 'skills', skillId), { recursive: true, force: true });
}

test('create-skill run-tests creates .agentforge/skills/run-tests/SKILL.md', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-basic-'));

  try {
    await installFixture(projectRoot);
    createSuggestion(projectRoot);
    removeExistingSkill(projectRoot, 'run-tests');

    const result = runCreateSkill(projectRoot, 'run-tests');
    assert.equal(result.status, 0);

    const skillPath = join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests', 'SKILL.md');
    assert.equal(existsSync(skillPath), true);

    const skill = readFileSync(skillPath, 'utf8');
    assert.match(skill, /^---\n/m);
    assert.match(skill, /^# Run Tests/m);
    assert.match(skill, /## Quando usar/);
    assert.match(skill, /## Procedimento/);
    assert.match(skill, /## Checklist/);
    assert.match(skill, /## Saída esperada/);
    assert.match(skill, /## Limites de segurança/);
    assert.match(skill, /## Evidências de origem/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.generated_skills.includes('run-tests'));
    assert.equal(typeof state.last_skill_created_at, 'string');
    assert.ok(state.created_files.includes('.agentforge/skills/run-tests/SKILL.md'));
    assert.ok(state.created_files.includes('.agentforge/harness/context-index.yaml'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/skills/run-tests/SKILL.md']);
    assert.ok(manifest['.agentforge/state.json']);
    assert.ok(manifest['.agentforge/harness/context-index.yaml']);

    const contextIndex = YAML.parse(
      readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'),
    );
    const runTestsEntry = Array.isArray(contextIndex.skills)
      ? contextIndex.skills.find((entry) => entry.id === 'run-tests')
      : null;
    assert.ok(runTestsEntry);
    assert.equal(runTestsEntry.path, 'skills/run-tests/SKILL.md');
    assert.ok(Array.isArray(contextIndex.task_contexts.review.skills));
    assert.ok(contextIndex.task_contexts.review.skills.includes('skills/run-tests/SKILL.md'));

    const validateResult = spawnSync(
      process.execPath,
      [AGENTFORGE_BIN, 'validate'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );
    assert.equal(validateResult.status, 0);
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'validation.md')),
      true,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create-skill fails when the suggestion does not exist', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-missing-'));

  try {
    await installFixture(projectRoot);

    const result = runCreateSkill(projectRoot, 'dependency-update');
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'dependency-update', 'SKILL.md')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create-skill does not overwrite an existing skill without --force', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-preserve-'));

  try {
    await installFixture(projectRoot);
    createSuggestion(projectRoot);
    removeExistingSkill(projectRoot, 'run-tests');

    const first = runCreateSkill(projectRoot, 'run-tests');
    assert.equal(first.status, 0);

    const skillPath = join(projectRoot, PRODUCT.internalDir, 'skills', 'run-tests', 'SKILL.md');
    const originalContent = readFileSync(skillPath, 'utf8');
    const manualContent = `${originalContent}\n<!-- manual note -->\n`;
    writeFileSync(skillPath, manualContent, 'utf8');

    const second = runCreateSkill(projectRoot, 'run-tests');
    assert.notEqual(second.status, 0);
    assert.equal(readFileSync(skillPath, 'utf8'), manualContent);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create-skill updates state.generated_skills and context-index.yaml', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-index-'));

  try {
    await installFixture(projectRoot);
    removeExistingSkill(projectRoot, 'run-lint');
    createSuggestion(projectRoot, {
      id: 'run-lint',
      name: 'Run Lint',
      description: 'Executa e interpreta verificações de lint.',
      reason: 'package.json já expõe um script lint.',
      confidence: 'high',
      triggers: ['package.json scripts.lint'],
      recommended_context: ['context/coding-standards.md'],
      recommended_steps: ['Explicar o comando principal.', 'Listar falhas comuns.'],
      safety_limits: ['Não aplicar autofix destrutivo sem confirmação.'],
      source_evidence: [{ file: 'package.json', line: 13, snippet: '"lint": "eslint ."' }],
    });

    const result = runCreateSkill(projectRoot, 'run-lint');
    assert.equal(result.status, 0);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(state.generated_skills.includes('run-lint'));
    assert.equal(typeof state.last_skill_created_at, 'string');

    const contextIndex = YAML.parse(
      readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'),
    );
    const skillEntry = contextIndex.skills.find((entry) => entry.id === 'run-lint');
    assert.ok(skillEntry);
    assert.equal(skillEntry.path, 'skills/run-lint/SKILL.md');
    assert.ok(contextIndex.task_contexts.feature.skills.includes('skills/run-lint/SKILL.md'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create-skill preserves a modified context-index.yaml without --force', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-index-preserve-'));

  try {
    await installFixture(projectRoot);
    createSuggestion(projectRoot);
    removeExistingSkill(projectRoot, 'run-tests');

    const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
    const originalContent = readFileSync(contextIndexPath, 'utf8');
    const modifiedContent = `${originalContent}\n# manual note\n`;
    writeFileSync(contextIndexPath, modifiedContent, 'utf8');

    const manifestBefore = loadManifest(projectRoot);
    const result = runCreateSkill(projectRoot, 'run-tests');
    assert.equal(result.status, 0);

    assert.equal(readFileSync(contextIndexPath, 'utf8'), modifiedContent);

    const manifestAfter = loadManifest(projectRoot);
    assert.equal(
      manifestAfter['.agentforge/harness/context-index.yaml'],
      manifestBefore['.agentforge/harness/context-index.yaml'],
    );
    assert.ok(manifestAfter['.agentforge/skills/run-tests/SKILL.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create-skill updates context-index.yaml with --force when it was modified', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-create-skill-index-force-'));

  try {
    await installFixture(projectRoot);
    createSuggestion(projectRoot);
    removeExistingSkill(projectRoot, 'run-tests');

    const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
    const originalContent = readFileSync(contextIndexPath, 'utf8');
    writeFileSync(contextIndexPath, `${originalContent}\n# manual note\n`, 'utf8');

    const manifestBefore = loadManifest(projectRoot);
    const result = runCreateSkill(projectRoot, 'run-tests', ['--force']);
    assert.equal(result.status, 0);

    const updatedContent = readFileSync(contextIndexPath, 'utf8');
    assert.notEqual(updatedContent, `${originalContent}\n# manual note\n`);
    assert.match(updatedContent, /skills:\n/);
    assert.match(updatedContent, /run-tests/);

    const manifestAfter = loadManifest(projectRoot);
    assert.notEqual(
      manifestAfter['.agentforge/harness/context-index.yaml'],
      manifestBefore['.agentforge/harness/context-index.yaml'],
    );
    assert.ok(manifestAfter['.agentforge/skills/run-tests/SKILL.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
