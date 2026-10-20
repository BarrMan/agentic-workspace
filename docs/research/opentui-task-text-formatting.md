# Task Description Formatting in OpenTUI

Status: research plan and supporting evidence, not a contract. This document decides how to
replace the current file-path heuristic in task-description rendering. It was researched by a
librarian and verified by the oracle.

## Decision

Use a **small, explicitly specified backtick-span scanner** that emits ordered OpenTUI
`StyledText` chunks. Remove path classification and path-specific reflow entirely. Style every
backticked span the same way, whether it contains a path, `1.2`, `e.g`, or `example.com`.

Do not use OpenTUI's `MarkdownRenderable` for this fix. It is a real, terminal-native option, but
it is not a drop-in replacement for the current chunk pipeline and it implies broader Markdown
support than the product has decided.

If inline-code highlighting is not actually wanted, the smallest correct change is **no
replacement**: render description text literally, with no parsing and no special styling.

## Why the current code is wrong

The heuristic lives in `src/renderer/formatters/code-path.ts:18`. It treats a backticked span as a
path if it contains `/` or `\`, or if it ends in `.` plus alphanumerics. That matches versions,
abbreviations, and domains such as `1.2`, `e.g`, and `example.com`.

The destructive part is elsewhere: `src/renderer/opentui/task-detail-content.ts:65-98` extracts
those spans, removes them from the prose, collapses whitespace, and appends them as separate
chunks. The bug is not only misclassification; it is also layout mutation.

`transformCodePathsPlain()` in `src/renderer/formatters/task-plain-text.ts` is already an identity
operation for valid string inputs. Delete it rather than replace it with a parser.

## Verified environment

- Installed `@opentui/core` resolves to **0.5.14** (confirmed through runtime resolution, not just
  the `^0.5.14` declaration in `package.json`).
- It exports `StyledText`, `fg`, `MarkdownRenderable`, and `SyntaxStyle`.
- `MarkdownRenderable` extends OpenTUI `Renderable`; it is not a DOM or React component.
- It uses `marked` **17.0.1**, the version bundled inside the installed OpenTUI package. The latest
  standalone `marked` release is newer (18.x); do not assume that version is what OpenTUI uses.
- `MarkdownRenderable` supports inline code via a custom `SyntaxStyle` and uses the `markup.raw`
  style. It requires a syntax style and conceals Markdown delimiters by default.
- Its inline rendering method is private. It produces styled chunks internally but does not expose
  a supported chunk-producing API for this pipeline.
- The existing task-detail surface consumes one `StyledText` value in a word-wrapping
  `TextRenderable` (`src/renderer/opentui/workspace.ts:428-431,660`). Preserving that composition
  is a concrete integration advantage.

## Scope

The inspected task and screen contracts do not require rendered Markdown. Markdown frontmatter
storage does not create a Markdown presentation contract. `docs/screens/tasks.md:19` leaves
wrapping, truncation, and scrolling unspecified.

The narrow scope is:

- Description text is rendered as literal text.
- Explicit backtick spans are highlighted inline.
- Spans keep their original position, order, and surrounding prose.
- Unsupported constructs remain literal.
- No headings, lists, links, tables, or fenced-block rendering unless the product separately
  decides to support them.

## Options

| Option | Maintenance and cost | Output and scope | Fit | Tradeoff |
|---|---|---|---|---|
| **No replacement — literal text** | No dependency; removes code. | No parsing; descriptions render exactly as stored. | Smallest fix for the heuristic bug. | Loses inline-code highlighting. |
| **Small backtick-span scanner → `StyledText` chunks** | No dependency; negligible runtime cost. | Ordered `literal(...)` and styled `fg(...)` chunks; inline spans only. | **Recommended.** Preserves the existing detail layout and the source text. | Must define delimiter rules precisely; do not claim CommonMark. |
| **OpenTUI `MarkdownRenderable`** | Existing dependency; no new package. | Full Markdown renderable with inline code and `SyntaxStyle`. | Only if broader Markdown rendering is a product decision. | Different renderable model; layout, wrapping, concealment, and lifecycle must be validated against 0.5.14. Not a drop-in. |
| **`marked` tokens mapped to chunks** | MIT; active (18.x upstream; OpenTUI bundles 17.0.1). Adds a direct dependency. | Full Markdown tokens; renderer-agnostic mapping. | If a Markdown token model is genuinely required while keeping chunks. | Dependency plus a mapping layer; excessive for inline code only. |
| **`markdown-it`** | MIT; active (15.x). Adds a dependency. | Full CommonMark-oriented token stream. | Similar to `marked`, with a different token model. | Second parser when OpenTUI already bundles one; more than the scope needs. |
| **`micromark` / `mdast-util-from-markdown`** | MIT; active; heavier dependency tree. | Full Markdown tokens or AST. | Standards-compliant parsing if that becomes a requirement. | Much heavier than an inline scanner. |
| **`cli-highlight`** | ISC; latest release 2021. | ANSI syntax highlighting, not Markdown spans. | Poor fit. | ANSI output is not OpenTUI chunks; release cadence is a concern. |
| **Ink-style components** | React/Ink runtime. | Components for a different renderer. | Wrong target. | Not OpenTUI `StyledText` chunks. |

## Recommendation

Choose the **scanner**, with the source-preserving contract below. Choose **literal text** instead
if the only goal is to delete the bug and inline-code styling is not worth a small parser.

Do not choose `MarkdownRenderable` just because it exists. Choosing it means deciding to render
Markdown in task descriptions, which is a larger product and layout decision. If that decision is
made later, evaluate it against the installed 0.5.14 behavior, not the latest docs.

## Scanner contract to specify before coding

1. **Delimiters.** Decide whether only single backticks are supported, or equal-length backtick
   runs too. Do not accidentally claim CommonMark compatibility. If multiline code-span
   normalization is required, use a real parser instead.
2. **Source preservation.** Prefer keeping the backticks visible and changing only their style.
   Unsupported constructs remain literal.
3. **Edge cases.** Define escaped delimiters, unmatched runs, empty spans, repeated spans, and
   multiple spans on one line.
4. **Fenced blocks.** Fenced code blocks must remain literal; do not consume their delimiters as
   inline spans.
5. **No path semantics.** There is no path classification and no reflow. A span is a span.

## Migration

- Replace `src/renderer/formatters/code-path.ts` with the scanner, or delete it and put the small
  scanner beside the detail renderer if it has only one consumer.
- Remove the extraction/reflow path in `src/renderer/opentui/task-detail-content.ts`.
- Delete `transformCodePathsPlain` and its import from
  `src/renderer/formatters/task-plain-text.ts`; it is already an identity operation.
- Replace the heuristic tests in `src/test/code-path.test.ts` with scanner tests and
  description-level detail tests.
- Record the accepted presentation rule in the screen contract if it is user-visible behavior.

## Test matrix

- `1.2`, `e.g`, and `example.com` in backticks are styled as code and never treated as paths.
- Real paths (`src/cli.ts`, `/abs/file`, `C:\dir\file`) are styled identically to every other span.
- Identifiers (`function`, `TASK-1`) and non-path text are styled identically.
- Multiple spans preserve order; prose before, between, and after them is unchanged.
- Punctuation, tabs, blank lines, repeated identical spans, and unmatched backticks behave as
  specified.
- Fenced blocks remain literal.
- If the source-preserving contract is adopted, concatenating the chunk text equals the input.
- Rendering checks: narrow widths, long unbroken spans, Unicode cell widths, task switching, and
  resize. Remove artificial path reflow, not normal terminal wrapping.
- Performance: no repeated suffix scans or replacements that become quadratic on backtick-heavy
  input.

## Pre-implementation checks

1. Confirm the resolved `@opentui/core` version and the `StyledText`/`fg` signatures in that
   installed version.
2. Confirm the detail surface can accept ordered chunks without changing its wrapping behavior.
3. Decide the delimiter contract in one sentence before writing the scanner.
4. Confirm whether inline-code styling is wanted at all; if not, take the literal-text option.

## Sources

- [OpenTUI Markdown docs](https://opentui.com/docs/components/markdown/)
- [OpenTUI text and cells docs](https://opentui.com/docs/core-concepts/text-and-cells/)
- [OpenTUI API index](https://opentui.com/docs/reference/api-index/)
- [OpenTUI 0.5.14 Markdown source](https://github.com/anomalyco/opentui/blob/v0.5.14/packages/core/src/renderables/Markdown.ts)
- [Marked releases](https://github.com/markedjs/marked/releases/)
- [markdown-it](https://www.npmjs.com/package/markdown-it)
- [micromark](https://www.npmjs.com/package/micromark)
- [mdast-util-from-markdown](https://www.npmjs.com/package/mdast-util-from-markdown)
- [cli-highlight releases](https://github.com/felixfbecker/cli-highlight/releases)
