const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runOcrWithProvider } = require('../../lib/ocr_provider');

const visionConfig = {
  enabled: true,
  baseUrl: 'https://example.com/v1',
  apiKey: 'sk-test',
  model: 'vision-test'
};

test('runOcrWithProvider prefers vision OCR when available', async () => {
  const result = await runOcrWithProvider({
    images: ['https://example.com/a.jpg'],
    visionConfig,
    runVisionOcr: async () => [{ index: 0, text: 'vision text' }],
    runTesseractOcr: async () => [{ index: 0, text: 'tesseract text' }]
  });

  assert.deepEqual(result, [{ index: 0, text: 'vision text' }]);
});

test('runOcrWithProvider falls back to tesseract when vision fails', async () => {
  const result = await runOcrWithProvider({
    images: ['https://example.com/a.jpg'],
    visionConfig: { ...visionConfig, fallbackToTesseract: true },
    runVisionOcr: async () => {
      throw new Error('Vision OCR failed');
    },
    runTesseractOcr: async () => [{ index: 0, text: 'tesseract text' }]
  });

  assert.deepEqual(result, [{ index: 0, text: 'tesseract text' }]);
});

test('runOcrWithProvider throws when fallback is disabled', async () => {
  await assert.rejects(
    () => runOcrWithProvider({
      images: ['https://example.com/a.jpg'],
      visionConfig: { ...visionConfig, fallbackToTesseract: false },
      runVisionOcr: async () => {
        throw new Error('Vision OCR failed');
      },
      runTesseractOcr: async () => [{ index: 0, text: 'tesseract text' }]
    }),
    /Vision OCR failed/
  );
});

test('runOcrWithProvider returns empty when no provider is available', async () => {
  const result = await runOcrWithProvider({
    images: ['https://example.com/a.jpg'],
    visionConfig: { enabled: false },
    tesseractEnabled: false
  });

  assert.deepEqual(result, []);
});
