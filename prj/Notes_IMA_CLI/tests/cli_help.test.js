import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const project_root = path.resolve(__dirname, '..');

test('cli help prints usage information', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', '--help'], {
    cwd: project_root,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /ima-cli/i);
  assert.match(result.stdout, /auth check/i);
  assert.match(result.stdout, /notes folders/i);
  assert.match(result.stdout, /notes export/i);
});
