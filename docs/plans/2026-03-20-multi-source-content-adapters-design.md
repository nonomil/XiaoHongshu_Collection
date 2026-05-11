# Multi-Source Content Adapters Design

Date: 2026-03-20

## Goal

Extend the current XiaoHongshu-focused save flow into a browser-attached multi-source content saver that can handle:

- WeChat articles
- Zhihu article / answer pages
- CSDN blog article pages
- XiaoHongshu notes as an existing specialized source

without rewriting the existing OCR, AI summary, Markdown export, UI report, and output-folder workflows.

## Current repo shape

The repo already has a usable separation:

- input/task normalization
- fetch from browser/CDP
- enrich via OCR / AI / comment filtering
- write Markdown and related artifacts
- report to CLI / UI

The source-specific logic is mostly concentrated in the fetch step. This is why multi-source support should be implemented as adapters, not as a new parallel pipeline.

## Approaches considered

### Approach A: Generic web page saver only

Implement one extractor that reads the current page title, visible article body, images, and URL, then reuses the existing export pipeline.

Pros:

- fastest to ship
- good first support for article-style pages
- minimal code movement

Cons:

- poor source-specific quality
- weak author/date extraction
- harder to grow into stable WeChat / Zhihu / CSDN support

### Approach B: Source adapters on top of the existing pipeline

Add a `source detector` plus source-specific extractors that all return the same normalized content shape.

Pros:

- fits the current architecture best
- keeps XiaoHongshu specialized logic intact
- easy to add new sources incrementally
- better long-term testability

Cons:

- slightly more upfront structure than a single generic extractor

### Approach C: Fully automatic “any webpage” intelligent parser

Detect source, mix specialized rules with generic readability-style extraction, and fall back dynamically.

Pros:

- best long-term flexibility
- broadest surface coverage

Cons:

- too much scope for the next step
- more debugging complexity than the repo currently needs

## Recommendation

Use **Approach B** now.

That means:

- keep the existing unified pipeline
- introduce a small source-detection layer
- implement 3 first-wave article adapters
- keep XiaoHongshu as a separate specialized adapter
- optionally add a generic web fallback later

## Target architecture

### 1. Unified content model

Introduce one normalized content payload for all single-page saves:

- `platform`
- `sourceType`
- `sourceUrl`
- `canonicalUrl`
- `title`
- `author`
- `authorLink`
- `date`
- `tags`
- `content`
- `images`
- `comments`
- `commentTotal`
- `commentError`
- `commentWarningCode`
- `collection`
- `noteId` or `contentId`

Important design choice:

- do **not** rename every existing `note` concept immediately
- internally we can keep the existing export function contract and pass article pages through the same shape
- add `platform` and `sourceType` first, then refactor naming later only if necessary

### 2. Source detection

Add a small detector based on URL hostname and page shape:

- `xiaohongshu`
- `wechat_article`
- `zhihu_article`
- `zhihu_answer`
- `csdn_article`
- `generic_web`

Detection priority should be URL-first, DOM-second.

### 3. Source adapters

Add one adapter module per source under a new folder such as:

- `scripts/lib/sources/xiaohongshu.js`
- `scripts/lib/sources/wechat_article.js`
- `scripts/lib/sources/zhihu.js`
- `scripts/lib/sources/csdn.js`
- `scripts/lib/sources/generic_web.js`

Each adapter should expose:

- `detect(url, domState?)`
- `extract(context)`

The `extract` result should be normalized into the shared content model.

### 4. Save entry evolution

Current `save_note.js` should become the general “single-page save” entry while keeping backward compatibility:

- existing XiaoHongshu links still work
- `--current` still works
- browser-attach behavior stays the same
- if current page is WeChat / Zhihu / CSDN, we save it as an article

CLI naming can stay unchanged short-term to reduce churn.

Later, a friendlier alias such as `save_page.js` can be added if useful.

### 5. Export strategy

Reuse the existing export machinery as much as possible:

- Markdown frontmatter
- OCR image handling
- AI summary/tags
- output naming conflict resolution
- UI report rendering

Behavior differences by source:

- XiaoHongshu keeps comments and comment warnings
- article sources default to `comments = []`
- article sources use source-specific collection labels such as:
  - `微信公众号文章`
  - `知乎文章`
  - `CSDN文章`

## First-phase scope

### Include

- current-browser / isolated browser attach remains available
- single-page save for:
  - WeChat article pages
  - Zhihu article / answer pages
  - CSDN article pages
- normalized Markdown output
- reuse OCR and AI summary
- UI and CLI summary compatibility

### Exclude

- WeChat subscription list crawling
- Zhihu collection crawling
- CSDN author-space crawling
- cross-site comment extraction
- generalized anti-bot / login automation
- “save any arbitrary website perfectly”

## UI impact

UI does not need a large redesign for phase 1.

Recommended changes:

- update copy from “小红书保存” toward “页面保存 / 内容保存”
- keep XiaoHongshu-specific actions where necessary
- show `platform` in result rows or raw report

Do not add source-specific forms yet.

## Risks

### Risk 1: source logic bleeds into export

Mitigation:

- keep source branching inside adapters and detection
- export only consumes normalized payloads

### Risk 2: WeChat / Zhihu / CSDN DOM instability

Mitigation:

- prefer resilient selectors and fallback extraction
- test against representative static fixtures

### Risk 3: browser current-page flow becomes ambiguous

Mitigation:

- update “current page” error/help text to mention supported sources
- report detected platform in result JSON

### Risk 4: terminology drift

Mitigation:

- tolerate `note` naming internally in phase 1
- avoid broad rename refactors until adapters are proven

## Success criteria

Phase 1 is successful when:

1. One current Chrome page from each of WeChat, Zhihu, and CSDN can be saved through the existing UI or CLI.
2. Existing XiaoHongshu save flows still pass.
3. The resulting Markdown contains clean title, author, date, content, source URL, and images.
4. Full test suite remains green.

## Recommended next step

Implement the adapter architecture in the smallest slice:

1. Source detector
2. Generic article payload model
3. WeChat adapter
4. Zhihu adapter
5. CSDN adapter
6. Wire UI/CLI summaries to show `platform`
