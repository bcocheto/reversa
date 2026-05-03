import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { buildAiEvidenceBundle } from '../lib/ai/evidence-bundle.js';
import {
  renderAgentSuggestionRequest,
  renderSkillSuggestionRequest,
  renderFlowSuggestionRequest,
  renderPolicySuggestionRequest,
  renderContextSynthesisRequest,
  renderAgenticBlueprintRequest,
} from '../lib/ai/request-renderer.js';

function buildBundleFixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-request-renderer-'));

  try {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'request-renderer-demo',
      private: true,
      scripts: {
        test: 'node --test',
        lint: 'eslint .',
      },
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    }, null, 2), 'utf8');

    writeFileSync(join(projectRoot, 'README.md'), [
      '# Request Renderer Demo',
      '',
      'Objective: validate formal prompt generation for AI suggestions.',
      '',
    ].join('\n'), 'utf8');

    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), [
      'export function hello() {',
      '  return "world";',
      '}',
    ].join('\n'), 'utf8');

    return buildAiEvidenceBundle(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function assertCommonRequest(prompt, rootKey) {
  assert.match(prompt, /Julgue semanticamente o projeto/);
  assert.match(prompt, /Não sugira itens genéricos/);
  assert.match(prompt, /source_evidence/);
  assert.match(prompt, /recommended_context/);
  assert.match(prompt, /safety_limits/);
  assert.match(prompt, /confidence: low\|medium\|high/);
  assert.match(prompt, /path: path\/to\/file/);
  assert.match(prompt, /kind: evidence-kind/);
  assert.match(prompt, /reason: why this evidence matters/);
  assert.match(prompt, /snippet: short excerpt copied from the bundle/);
  assert.match(prompt, new RegExp(`${rootKey}:`));
  assert.match(prompt, /`package\.json`/);
  assert.match(prompt, /`README\.md`/);
  assert.match(prompt, /`src\/index\.ts`/);
}

test('request renderer emits deterministic agent prompts with schema', () => {
  const bundle = buildBundleFixture();
  const first = renderAgentSuggestionRequest(bundle);
  const second = renderAgentSuggestionRequest(bundle);

  assert.equal(first, second);
  assert.match(first, /# Agent Suggestion Request/);
  assert.match(first, /agents:/);
  assert.match(first, /responsibilities:/);
  assert.match(first, /reads:/);
  assert.match(first, /skills:/);
  assert.match(first, /flows:/);
  assertCommonRequest(first, 'agents');
});

test('request renderer emits formal skill, flow, policy, and context prompts', () => {
  const bundle = buildBundleFixture();

  const skill = renderSkillSuggestionRequest(bundle);
  assert.match(skill, /# Skill Suggestion Request/);
  assert.match(skill, /skills:/);
  assert.match(skill, /recommended_steps:/);
  assertCommonRequest(skill, 'skills');

  const flow = renderFlowSuggestionRequest(bundle);
  assert.match(flow, /# Flow Suggestion Request/);
  assert.match(flow, /flows:/);
  assert.match(flow, /stages:/);
  assertCommonRequest(flow, 'flows');

  const policy = renderPolicySuggestionRequest(bundle);
  assert.match(policy, /# Policy Suggestion Request/);
  assert.match(policy, /policies:/);
  assert.match(policy, /scope:/);
  assert.match(policy, /rule:/);
  assertCommonRequest(policy, 'policies');

  const context = renderContextSynthesisRequest(bundle);
  assert.match(context, /# Context Synthesis Request/);
  assert.match(context, /context_documents:/);
  assert.match(context, /sections:/);
  assert.match(context, /title:/);
  assertCommonRequest(context, 'context_documents');
});

test('request renderer emits a deterministic agentic blueprint prompt', () => {
  const bundle = buildBundleFixture();
  const first = renderAgenticBlueprintRequest(bundle);
  const second = renderAgenticBlueprintRequest(bundle);

  assert.equal(first, second);
  assert.match(first, /# Agentic Blueprint Request/);
  assert.match(first, /agents:/);
  assert.match(first, /skills:/);
  assert.match(first, /context_documents:/);
  assert.match(first, /entrypoints:/);
  assert.match(first, /source_evidence:/);
  assert.match(first, /Julgue semanticamente/);
  assert.match(first, /Não copie heurísticas do CLI/);
  assert.match(first, /Não crie agente sem evidência/);
  assert.match(first, /Não crie o agente genérico "reviewer" sem papel específico/);
  assert.match(first, /Não materialize arquivos manualmente/);
  assert.match(first, /Não altere state\/manifest/);
  assert.match(first, /Retorne somente YAML válido/);
});
