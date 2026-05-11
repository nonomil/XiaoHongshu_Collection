const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  stripFrontmatter,
  isSameBody,
  resolveMarkdownConflict
} = require('../../lib/output_naming');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('output-naming');
const filePath = path.join(tmpDir, 'note.md');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('stripFrontmatter removes yaml header', () => {
  const text = '---\nkey: value\n---\n\nBody';
  assert.equal(stripFrontmatter(text), 'Body');
});

test('isSameBody compares only body content', () => {
  const a = '---\nkey: a\n---\n\nBody';
  const b = '---\nkey: b\n---\n\nBody';
  assert.equal(isSameBody(a, b), true);
});

test('resolveMarkdownConflict overwrites when body same', () => {
  resetTmp();
  fs.writeFileSync(filePath, '---\nkey: a\n---\n\nBody', 'utf-8');
  const resolved = resolveMarkdownConflict({
    filepath: filePath,
    nextMarkdown: '---\nkey: b\n---\n\nBody'
  });
  assert.equal(resolved, filePath);
});

test('resolveMarkdownConflict adds suffix when body differs', () => {
  resetTmp();
  fs.writeFileSync(filePath, '---\nkey: a\n---\n\nBody', 'utf-8');
  const resolved = resolveMarkdownConflict({
    filepath: filePath,
    nextMarkdown: '---\nkey: b\n---\n\nBody2'
  });
  assert.ok(resolved.endsWith('-1.md'));
});
