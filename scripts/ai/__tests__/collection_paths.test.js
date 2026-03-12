const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  resolveCollectionRawPath,
  resolveCollectionOutputRoot
} = require('../../lib/collection_paths');

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('resolveCollectionRawPath uses env override when set', () => {
  process.env.XHS_RAW_PATH = 'G:/custom/raw.json';
  const value = resolveCollectionRawPath({ dataDir: 'G:/data' });
  assert.equal(value, 'G:/custom/raw.json');
});

test('resolveCollectionRawPath falls back to data dir', () => {
  delete process.env.XHS_RAW_PATH;
  const value = resolveCollectionRawPath({ dataDir: 'G:/data' });
  assert.equal(value, path.join('G:/data', 'raw_notes.json'));
});

test('resolveCollectionOutputRoot uses env override when set', () => {
  process.env.XHS_OUTPUT_ROOT = 'G:/custom/output';
  const value = resolveCollectionOutputRoot({ outputDir: 'G:/output' });
  assert.equal(value, 'G:/custom/output');
});

test('resolveCollectionOutputRoot falls back to output dir', () => {
  delete process.env.XHS_OUTPUT_ROOT;
  const value = resolveCollectionOutputRoot({ outputDir: 'G:/output' });
  assert.equal(value, 'G:/output');
});

