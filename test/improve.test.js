import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest, loadManifest } from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createInstallAnswers() {
  return {
    project_name: 'Demo Project',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'develop-features',
    initial_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
    initial_flows: ['feature-development', 'release'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    setup_mode: 'bootstrap',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer', 'qa', 'security', 'devops'],
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
  };
}

function createInstalledProject(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(createInstallAnswers(), '1.0.0');
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function createSkillWithoutProcedure(projectRoot) {
  const skillDir = join(projectRoot, PRODUCT.internalDir, 'skills', 'custom-audit');
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: custom-audit',
      'description: Inspecta uma área do projeto.',
      'license: MIT',
      'metadata:',
      '  framework: agentforge',
      '  type: project-skill',
      '  source: manual',
      '  confidence: low',
      '---',
      '',
      '# Custom Audit',
      '',
      '## When to use',
      '',
      '- Quando um humano pede uma leitura rápida da área.',
      '',
      '## Safety limits',
      '',
      '- Não alterar arquivos.',
    ].join('\n') + '\n',
    'utf8',
  );
}

test('improve generates improvement-plan.md and flags missing READMEs and incomplete skills', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-dry-'));

  try {
    createInstalledProject(projectRoot);

    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'context', 'notes'), { recursive: true });
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'references', 'extra'), { recursive: true });
    createSkillWithoutProcedure(projectRoot);

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
    assert.equal(existsSync(reportPath), true);

    const report = readFileSync(reportPath, 'utf8');
    assert.match(report, /## Score geral/);
    assert.match(report, /## Problemas críticos/);
    assert.match(report, /## Melhorias seguras que podem ser aplicadas/);
    assert.match(report, /## Comandos sugeridos/);
    assert.match(report, /context\/notes\/README\.md/);
    assert.match(report, /Skill sem procedimento claro/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(typeof state.last_improve_at === 'string');
    assert.equal(typeof state.improvement_score, 'number');
    assert.ok(state.improvement_score >= 0);
    assert.ok(state.improvement_score <= 100);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('improve --apply creates missing READMEs, preserves modified skills, and updates the manifest', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-improve-apply-'));

  try {
    createInstalledProject(projectRoot);

    const missingReadmeDir = join(projectRoot, PRODUCT.internalDir, 'context', 'guidance');
    mkdirSync(missingReadmeDir, { recursive: true });
    createSkillWithoutProcedure(projectRoot);

    const first = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(first.status, 0);
    assert.equal(existsSync(join(missingReadmeDir, 'README.md')), true);

    const skillPath = join(projectRoot, PRODUCT.internalDir, 'skills', 'custom-audit', 'SKILL.md');
    writeFileSync(
      skillPath,
      `${readFileSync(skillPath, 'utf8')}\nLinha manual do usuário.\n`,
      'utf8',
    );

    const second = spawnSync(process.execPath, [AGENTFORGE_BIN, 'improve', '--apply'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    assert.equal(second.status, 0);
    assert.match(readFileSync(skillPath, 'utf8'), /Linha manual do usuário\./);

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/context/guidance/README.md']);
    assert.ok(manifest['.agentforge/reports/improvement-plan.md']);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.ok(typeof state.last_improve_at === 'string');
    assert.equal(typeof state.improvement_score, 'number');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
