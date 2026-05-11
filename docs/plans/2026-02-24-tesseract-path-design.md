# 2026-02-24 Tesseract Path Handling Design

## Goal
Eliminate `TESSDATA_PREFIX` warnings by auto-setting a default path when not provided, without adding extra log noise.

## Approach
- In `scripts/ocr_and_write.js`, if `process.env.TESSDATA_PREFIX` is not set, set it to `assets/tesseract` under the project directory.
- Do not print the path unless there is an error.
- Keep existing behavior if user explicitly sets the environment variable.

## Scope
- Only `scripts/ocr_and_write.js`.
- No changes to OCR logic or output format.

## Acceptance Criteria
- Running `node scripts/ocr_and_write.js` without setting `TESSDATA_PREFIX` does not produce the warning.
- If user sets `TESSDATA_PREFIX` manually, it is respected.
