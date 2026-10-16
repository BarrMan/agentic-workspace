# Help and dialogs

Purpose: find shortcuts and complete focused actions without losing context. Product rules: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Help

Help presents the complete shortcut list and supports searching it. Binding and description are separate, aligned columns, including while capturing a replacement. `/` searches and `Enter` replaces the selected row's binding. The active row shows an inline `Press key...` prompt. After the first stroke, the binding is plain text and the prompt moves right in the same column; the footer offers an optional second stroke. A second stroke opens Save/Discard. Escape after the first stroke opens single-stroke confirmation and clears the prompt; Left/Right selects Save or Discard and Enter applies. The initial Escape can be recorded, so Escape twice confirms an Escape binding. Nothing persists until Save. Conflicts, including ambiguous sequence prefixes, cannot replace a working binding. Exact row ordering and empty-search copy are unspecified.

## Dialogs and editors

Overlays keep their task or settings context identifiable, show the active control and available actions, and retain unsaved input on failure. Filter dialogs are opaque and own keyboard and paste focus: Enter or Ctrl+S applies, Ctrl+R resets the draft, Escape cancels. Input must not leak through an active dialog. No universal geometry is established.

## Constrained terminals

Keep the active prompt, current value, and primary actions reachable by keyboard.

## Open Questions

Exact row ordering, empty-search copy, universal dialog geometry, minimum size, clipping, wrapping, scrolling, and action-priority rules are unspecified.
