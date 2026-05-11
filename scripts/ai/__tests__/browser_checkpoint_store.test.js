const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createJsonCheckpointStore,
  sanitizeCheckpointId
} = require('../../lib/browser_checkpoint_store');

test('sanitizeCheckpointId keeps safe characters and normalizes spaces', () => {
  assert.equal(sanitizeCheckpointId(' note save / 01 '), 'note_save_01');
  assert.equal(sanitizeCheckpointId('abc-123.ok'), 'abc-123.ok');
});

test('createJsonCheckpointStore saves and loads checkpoint payloads', () => {
  const writes = new Map();
  const store = createJsonCheckpointStore({
    rootDir: 'G:/tmp/checkpoints',
    mkdirSync: () => {},
    existsSync: (filepath) => writes.has(filepath),
    readFileSync: (filepath) => writes.get(filepath),
    writeFileSync: (filepath, payload) => {
      writes.set(filepath, payload);
    }
  });

  const filepath = store.saveCheckpoint('note-save-1', {
    state: 'load_note',
    status: 'running'
  });

  assert.match(filepath, /note-save-1\.json$/);
  assert.deepEqual(store.loadCheckpoint('note-save-1'), {
    state: 'load_note',
    status: 'running'
  });
});
