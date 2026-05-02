import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

import { COMMAND_REGISTRY } from '../lib/commands/registry.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('agentforge commands lists install, compile, validate, and context-map', () => {
  const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'commands'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /install/);
  assert.match(result.stdout, /compile/);
  assert.match(result.stdout, /validate/);
  assert.match(result.stdout, /context-map/);
});

test('agentforge commands --json returns valid JSON', () => {
  const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'commands', '--json'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);

  const payload = JSON.parse(result.stdout);
  assert.ok(Array.isArray(payload.commands));
  assert.ok(payload.commands.some((entry) => entry.id === 'install'));
  assert.ok(payload.commands.some((entry) => entry.id === 'compile'));
  assert.ok(payload.commands.some((entry) => entry.id === 'validate'));
  assert.ok(payload.commands.some((entry) => entry.id === 'context-map'));
});

test('agentforge commands --category skills lists suggest-skills and create-skill', () => {
  const result = spawnSync(process.execPath, [AGENTFORGE_BIN, 'commands', '--category', 'skills'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /skills/);
  assert.match(result.stdout, /suggest-skills/);
  assert.match(result.stdout, /create-skill/);
  assert.doesNotMatch(result.stdout, /install/);
});

test('agentforge help principal uses registry data', () => {
  const helpResult = spawnSync(process.execPath, [AGENTFORGE_BIN, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(helpResult.status, 0);

  const compile = COMMAND_REGISTRY.find((entry) => entry.id === 'compile');
  const commands = COMMAND_REGISTRY.find((entry) => entry.id === 'commands');
  assert.ok(compile);
  assert.ok(commands);

  assert.match(helpResult.stdout, new RegExp(escapeRegex(compile.description)));
  assert.match(helpResult.stdout, new RegExp(escapeRegex(commands.description)));
  assert.match(helpResult.stdout, /commands\s+/);
});
