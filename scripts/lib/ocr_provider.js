const { CodexTaskError } = require('./errors');

function shouldUseVisionOcr(config) {
  return Boolean(
    config &&
    !config._missing &&
    !config._invalid &&
    config.enabled !== false &&
    String(config.baseUrl || '').trim() &&
    String(config.apiKey || '').trim() &&
    String(config.model || '').trim()
  );
}

function resolveOcrProvider({ visionConfig, tesseractEnabled = true } = {}) {
  if (shouldUseVisionOcr(visionConfig)) return 'vision';
  if (tesseractEnabled) return 'tesseract';
  return 'none';
}

async function runOcrWithProvider({
  images,
  noteId,
  imagesRoot,
  tesseractLang,
  visionConfig,
  tesseractEnabled = true,
  runVisionOcr,
  runTesseractOcr
} = {}) {
  const visionAvailable = shouldUseVisionOcr(visionConfig) && typeof runVisionOcr === 'function';

  if (visionAvailable) {
    try {
      return await runVisionOcr({ images, config: visionConfig });
    } catch (error) {
      if (visionConfig?.fallbackToTesseract === false) {
        throw new CodexTaskError(
          'vision_ocr_failed',
          error?.message || 'Vision OCR failed',
          { cause: error }
        );
      }
    }
  }

  if (tesseractEnabled && typeof runTesseractOcr === 'function') {
    return runTesseractOcr({
      images,
      imagesRoot,
      noteId,
      tesseractLang
    });
  }

  return [];
}

module.exports = {
  resolveOcrProvider,
  runOcrWithProvider,
  shouldUseVisionOcr
};
