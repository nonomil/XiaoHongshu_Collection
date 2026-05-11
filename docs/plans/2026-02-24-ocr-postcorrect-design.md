# 2026-02-24 OCR Post-Correction Design

## Goal
Improve OCR text quality by fixing common OCR errors and using AI for low-fluency segments only, without touching the main note content.

## Scope
- Only OCR-recognized text is corrected.
- Main note content (captured text) is not modified.

## Pipeline
1. **Rule-based correction**
   - Apply a curated set of common OCR fixes (e.g., “收藏天” → “收藏夹”, “Al” → “AI”).
   - Keep replacements low risk (simple substitutions, no expansions).
2. **Fluency detection**
   - Compute a heuristic score for “not fluent” (e.g., unusual symbol density, low CJK ratio, broken tokens).
   - Only when the score exceeds a threshold do we call AI correction.
3. **AI correction (conditional)**
   - Prompt OpenRouter to **only** fix obvious OCR mistakes and broken sentences.
   - Explicitly forbid adding new facts or rewriting beyond correction.
   - Preserve line breaks and list structure where possible.

## Configuration
Add optional fields to `config/openrouter.json`:
- `ocrPostCorrect`: boolean (default true)
- `ocrPostCorrectThreshold`: number (default tuned threshold)
- `ocrPostCorrectMaxChars`: number (limit for AI correction payload)

## Output
- Markdown includes corrected OCR text only.
- No separate storage of raw OCR unless added later.

## Error Handling
- If AI correction fails or times out, fall back to rule-based result.
- Log AI failures but continue processing.

## Acceptance Criteria
- Obvious OCR errors (e.g., “收藏天”) are corrected in OCR sections.
- Only low-fluency OCR segments trigger AI correction.
- Main note content remains unchanged.
