import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url));
const REVERSA_BIN = fileURLToPath(new URL('../bin/reversa.js', import.meta.url));

test('legacy reversa alias is published and reports its own binary name', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));

  assert.equal(packageJson.bin.agentforge, 'bin/agentforge.js');
  assert.equal(packageJson.bin.reversa, 'bin/reversa.js');

  const result = spawnSync(process.execPath, [REVERSA_BIN, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Uso: npx reversa <comando>/);
  assert.doesNotMatch(result.stdout, /npx agentforge <comando>/);
});
