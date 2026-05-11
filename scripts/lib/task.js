function normalizeTaskInput(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim();
}

function normalizeTaskString(value) {
  return String(value || '').trim();
}

function cloneTaskMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return JSON.parse(JSON.stringify(metadata));
}

function resolveTaskIngressFields(input = {}) {
  const route = normalizeTaskString(input.route);
  const deliveryMode = normalizeTaskString(input.deliveryMode || input.delivery_mode);
  const metadata = cloneTaskMetadata(input.metadata);
  return {
    ...(route ? { route } : {}),
    ...(deliveryMode ? { deliveryMode } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {})
  };
}

function buildNoteSaveTask({ input = '', source = 'cli', mode, ...rest } = {}) {
  const normalizedInput = normalizeTaskInput(input);
  const options = {};

  if (mode === 'current') {
    options.mode = 'current';
  }

  return {
    type: 'note-save',
    source: normalizeTaskString(source),
    input: mode === 'current' ? '' : normalizedInput,
    options,
    requestedAt: new Date().toISOString(),
    ...resolveTaskIngressFields(rest)
  };
}

function buildCollectionTask({ source = 'cli', ...rest } = {}) {
  return {
    type: 'collection-export',
    source: normalizeTaskString(source),
    input: '',
    options: {},
    requestedAt: new Date().toISOString(),
    ...resolveTaskIngressFields(rest)
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

  if (task.route !== undefined && typeof task.route !== 'string') {
    throw new Error('Task route must be a string');
  }

  if (task.deliveryMode !== undefined && typeof task.deliveryMode !== 'string') {
    throw new Error('Task deliveryMode must be a string');
  }

  if (task.metadata !== undefined && (!task.metadata || typeof task.metadata !== 'object' || Array.isArray(task.metadata))) {
    throw new Error('Task metadata must be an object');
  }

  return task;
}

module.exports = {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask,
  normalizeTaskInput
};
