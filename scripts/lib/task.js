function normalizeTaskInput(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim();
}

function buildNoteSaveTask({ input = '', source = 'cli', mode } = {}) {
  const normalizedInput = normalizeTaskInput(input);
  const options = {};

  if (mode === 'current') {
    options.mode = 'current';
  }

  return {
    type: 'note-save',
    source: String(source || ''),
    input: mode === 'current' ? '' : normalizedInput,
    options,
    requestedAt: new Date().toISOString()
  };
}

function buildCollectionTask({ source = 'cli' } = {}) {
  return {
    type: 'collection-export',
    source: String(source || ''),
    input: '',
    options: {},
    requestedAt: new Date().toISOString()
  };
}

function assertValidTask(task) {
  if (!task || typeof task !== 'object') {
    throw new Error('Invalid task');
  }

  if (!task.type) {
    throw new Error('Task type is required');
  }

  if (!task.source) {
    throw new Error('Task source is required');
  }

  if (task.input === undefined || task.input === null) {
    throw new Error('Task input is required');
  }

  if (task.type === 'note-save' && !task.input && task.options?.mode !== 'current') {
    throw new Error('Note save task requires input or current mode');
  }

  return task;
}

module.exports = {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask,
  normalizeTaskInput
};
