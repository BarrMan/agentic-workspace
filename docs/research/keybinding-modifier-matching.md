# Keybinding Modifier Matching — Research

Status: supporting evidence, not a contract. Prepared for the keybinding review indexed in
[normalization-refactor-decisions.md](../audits/normalization-refactor-decisions.md).
Question: should the local chord parser/matcher stay, or should it be replaced by a framework or established
TUI pattern? Oracle-validated with corrections.

## Problem

The app has three distinct key representations, and the research must not conflate them:

1. **Default binding strings** parsed by `keyFromCanonical` from `uiKeymap` (`src/renderer/opentui/keybindings.ts:46-81`).
   It accepts case-insensitive `C-`, `S-`, `M-`, `A-`, `Alt-`, and `Option-` prefixes, including
   repeated prefixes. An uppercase single character implies Shift. It does **not** accept
   `Ctrl-`, `Shift-`, `Super-`, or `Hyper-`, although the persisted object type supports `super`
   and `hyper`.
2. **Persisted overrides**: one ordered sequence of one or two `ShortcutKey` strokes, replacing
   every default alias (`keybindings.ts:12-38,342-365`).
3. **Live events**: normalized by `shortcutKeyFromEvent` (`keybindings.ts:381-409`) and compared
   with `normalizedKey` (`:311-318`). Normalization handles uppercase→Shift, `return`→`enter`,
   literal space→`space`, and `{`→Shift+`[`. It does **not** equate `Esc` and `escape`;
   `keymap.ts:160` only displays `escape` as “Esc.”

The question is not whether parsing chords is novel—every TUI does it. It is whether a mature parser
can replace this layer without losing the persisted override shape, sequence semantics, or macOS
Option handling.

## What mature TUI stacks do

| Stack | Representation | Parsing / normalization | Relevance |
|---|---|---|---|
| OpenTUI `@opentui/keymap` | Structured bindings and key events | `registerDefaultKeys()` installs the default parser/matcher; grammar is `ctrl+shift+x`, not `C-S-x`; its matcher does not reproduce this app's uppercase-implies-Shift, Return/Enter, or `{` equivalence; the default event resolver reads `meta`, not `option` | Closest framework fit, but semantic integration is required. |
| Textual | Structured `Key` events | Canonical names and keystroke formatting; explicit aliases for ambiguous encodings (for example Tab vs Ctrl+I) | Confirms explicit alias rules rather than ad hoc string comparison. |
| Bubble Tea | Structured `KeyMsg` | Canonical key names and `String()` formatting | Same pattern: key code and modifiers modeled separately. |
| Ink | Modifier flags on input | Parsing layer; Kitty protocol support for enhanced modifiers | Modifier reporting depends on terminal protocol, not only the app. |
| crossterm / Ratatui | `KeyEvent` with `KeyCode` + `KeyModifiers` | Structured, no chord-text parsing | Structured events are the durable boundary. |

## Terminal constraints

- Matching cannot recover a modifier the terminal did not report, but this app deliberately infers
  Meta from bare composed glyphs. The `option-compose.ts` map is a **partial US/ABC-layout
  heuristic**, not universal Option recovery. A statement that “an unreported modifier cannot
  match” is too absolute for this code.
- Extended modifiers and disambiguation rely on Kitty keyboard protocol support; OpenTUI's `meta`
  path includes Alt.
- Persisted overrides are project data. Changing the grammar or normalization can silently change
  which chord a stored override means.

## Options

### A. Adopt `@opentui/keymap` behind an in-memory adapter

`@opentui/keymap@0.5.14` exists and declares an exact dependency on `@opentui/core@0.5.14`; the
project manifest uses `^0.5.14`, while the latest keymap `0.6.6` requires core `0.6.6`. A bare
`Keymap` has no string parser or event matcher—`registerDefaultKeys()` installs them.

- Keep the persisted JSON unchanged and convert `ShortcutKey` to framework bindings in memory.
- Retain local sequence policy and dispatch.
- Add an adapter for the app's uppercase-implies-Shift, Return/Enter, `{`, and Option/meta
  differences, or accept the framework's semantics.

Fit: available now; the obstacle is semantic integration, not package availability. Cost: an
adapter plus tests proving persisted overrides still mean the same chord.

### B. Keep the local adapter, make its grammar explicit

- Retain `keyFromCanonical`/`normalizedKey`, document the accepted grammar and aliases, and add a
  table-driven test pinning every modifier spelling.
- Keep `option-compose.ts` and the complete `shortcutKeyFromEvent` policy.

Fit: lowest immediate integration cost and preserves the persisted format and Option behavior.
Cost: the local code remains. Risk: drift from OpenTUI's grammar; mitigated by tests.

### C. Store defaults as structured strokes

- Eliminate the private chord parser by expressing defaults as `ShortcutKey` objects, retaining
  local matching and persisted overrides.
- Requires updating `keymap.ts` consumers and formatting.

Fit: removes a parser without adopting framework semantics. Cost: touches the default keymap data
and display formatting; assess before choosing.

### D. Replace with a generic hotkey library

- `hotkeys-js`/`tinykeys` target browser `KeyboardEvent`s and do not model terminal key names,
  Option composition, or OpenTUI's event shape.
- A terminal-specific library would still need an adapter.

Fit: poor. Cost: new dependency plus adapter. Risk: duplicate normalization.

## Recommendation

**Keep the local adapter (Option B) for now.** It has the lowest immediate integration cost and
preserves the persisted override format and the macOS Option-composed input path without a
conversion layer. Correct the earlier overstatement: B is not the only option that *can* preserve
that behavior; A and C can too, with more integration work.

Revisit A if the persisted override format is redesigned or if the app wants one framework-owned
matcher. Consider C as a smaller simplification that removes the chord parser while keeping local
matching. Do not add a generic browser hotkey library.

## Migration sketch (only if Option A is chosen)

1. Keep the persisted JSON; convert `ShortcutKey` to framework bindings in memory. Round-trip
   equality is necessary but not sufficient.
2. Preserve the complete `shortcutKeyFromEvent` policy, not just `optionBaseKey`: `meta || option`,
   printable-ASCII `baseCode` precedence when Meta/Option is reported, composed-glyph fallback,
   Meta inference from otherwise unmodified mapped glyphs, normalization, and modifier-only/
   release filtering.
3. Preserve override validation: exact five-modifier matching, alias replacement, prefix-conflict
   rejection, empty/overlong sequence rejection, and `false` modifier handling.
4. Preserve sequence dispatch, including the current behavior where a mismatching second stroke is
   consumed rather than retried as a standalone shortcut (`keybindings.ts:525-540`); decide whether
   to keep or change it before migrating.
5. Run the existing keybinding and override tests against both implementations before deleting the
   local one, including real terminal-parser coverage for ESC-prefixed input.

## Test matrix

- Modifier spellings: `C-`, `S-`, `M-`, `A-`, `Alt-`, `Option-`, repeated prefixes, mixed case;
  confirm `Ctrl-`, `Shift-`, `Super-`, `Hyper-` are not accepted by the parser (persisted objects
  still support `super`/`hyper`).
- Named keys and aliases: `Return`/`enter`, `Esc`/`escape` (currently not equivalent), space
  (literal object), shifted `[`/`{`.
- Exact modifier matching: `C-x` must not match `C-S-x`; exact `super`/`hyper` matching.
- Uppercase defaults and persisted keys; malformed overrides (empty/overlong sequences, `false`
  modifier values).
- Ordered sequences and overrides: an override replaces every default alias; prefix conflicts;
  mismatching second stroke and pending-state clearing.
- macOS Option: composed glyph and ESC-prefixed forms; Option-only events; bare and shifted composed
  glyphs; valid/invalid `baseCode`; Ctrl/Shift combinations that suppress bare-glyph inference.
- Unknown keys: document current behavior rather than assuming universal rejection—arbitrary equal
  names can match.
- Propagation/registration priority and real terminal input, not only fabricated `KeyEvent`s.

## Sources

- [OpenTUI keyboard input](https://opentui.com/docs/core-concepts/keyboard/)
- [OpenTUI keymap core](https://opentui.com/docs/keymap/core/)
- [OpenTUI keymap addons](https://opentui.com/docs/keymap/addons/)
- [`@opentui/keymap@0.5.14` metadata](https://registry.npmjs.org/@opentui%2fkeymap/0.5.14)
- [`@opentui/keymap@0.5.14` source archive](https://registry.npmjs.org/@opentui/keymap/-/keymap-0.5.14.tgz)
- [Textual input and bindings](https://textual.textualize.io/guide/input/)
- [Ink `useInput`](https://github.com/vadimdemedes/ink/blob/master/src/hooks/use-input.ts)
- [crossterm `KeyEvent`](https://docs.rs/crossterm/latest/crossterm/event/struct.KeyEvent.html)
- [Bubble Tea key events](https://github.com/charmbracelet/bubbletea/blob/main/key.go)
