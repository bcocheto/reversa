import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { PRODUCT } from '../lib/product.js';

test('install writes the AgentForge state, config, plan, and engine entry templates', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-templates-'));

  try {
    const writer = new Writer(projectRoot);
    const answers = {
      project_name: 'Demo Project',
      user_name: 'Ana',
      chat_language: 'pt-br',
      doc_language: 'pt-br',
      output_folder: '_agentforge',
      engines: ['codex'],
      internal_agents: [
        PRODUCT.skillsPrefix,
        `${PRODUCT.skillsPrefix}-scope-scout`,
        `${PRODUCT.skillsPrefix}-agent-architect`,
      ],
      response_mode: 'chat',
    };

    writer.createProductDir(answers, '1.0.0');

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.version, '1.0.0');
    assert.equal(state.project, 'Demo Project');
    assert.equal(state.user_name, 'Ana');
    assert.equal(state.phase, null);
    assert.deepEqual(state.pending, [
      'discovery',
      'agent-design',
      'flow-design',
      'policies',
      'export',
      'review',
    ]);
    assert.deepEqual(state.internal_agents, [
      PRODUCT.skillsPrefix,
      `${PRODUCT.skillsPrefix}-scope-scout`,
      `${PRODUCT.skillsPrefix}-agent-architect`,
    ]);
    assert.deepEqual(state.generated_agents, []);
    assert.deepEqual(state.generated_subagents, []);
    assert.deepEqual(state.flows, []);
    assert.equal(state.output_folder, '_agentforge');
    assert.deepEqual(state.checkpoints, {});
    assert.equal(Object.hasOwn(state, 'agents'), false);
    assert.equal(Object.hasOwn(state, 'answer_mode'), false);
    assert.equal(Object.hasOwn(state, 'doc_level'), false);

    const config = readFileSync(join(projectRoot, PRODUCT.internalDir, 'config.toml'), 'utf8');
    assert.match(config, /\[internal_agents\]/);
    assert.match(config, /response_mode = "chat"/);
    assert.match(config, /detail_level = "complete"/);
    assert.match(config, /folder = "_agentforge"/);

    const plan = readFileSync(join(projectRoot, PRODUCT.internalDir, 'plan.md'), 'utf8');
    assert.match(plan, /Fase 1 — Discovery/);
    assert.match(plan, /Fase 6 — Review/);
    assert.doesNotMatch(plan, /Reconhecimento|Escavação|Geração|Revisão/);

    await writer.installEntryFile({ entryTemplate: 'AGENTS.md', entryFile: 'AGENTS.md' }, { force: true });
    await writer.installEntryFile({ entryTemplate: 'CLAUDE.md', entryFile: 'CLAUDE.md' }, { force: true });

    const agentsEntry = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsEntry, /AgentForge/);
    assert.match(agentsEntry, /\.agentforge\/state\.json/);
    assert.match(agentsEntry, /\/agentforge/);
    assert.doesNotMatch(agentsEntry, /Reversa/);

    const claudeEntry = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(claudeEntry, /AgentForge/);
    assert.match(claudeEntry, /\.agentforge\/state\.json/);
    assert.match(claudeEntry, /\/agentforge/);
    assert.doesNotMatch(claudeEntry, /Reversa/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
