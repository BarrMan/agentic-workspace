# Settings

Purpose: configure project agent presets and modes in the **Project agent settings** surface. Product rules: [SPEC](../SPEC.md). Shared rules: [design system](../DESIGN-SYSTEM.md).

## Contents and order

The Project agent settings surface is a fullscreen shell with a three-row header showing `Settings` and `[ Project ]`, and a three-row footer for contextual hints and status. A 20-column rounded Categories pane containing Agents sits beside a rounded content pane. Focus uses cyan `#22d3ee`. Fields show a label, selected-field description, then read-only value. Expose named presets, mode instructions, model selection/discovery, and permission controls; distinguish instruction-only guidance from provider-enforced restrictions. Stage committed edits until Save; Escape outside editing discards the draft. Configuration scope and availability follow the [configuration contract](../specs/configuration.md#configuration-task-mode-approval-and-mode-catalogue); this specification does not prescribe the composition of other settings surfaces.

## States and focus

Show model-discovery failures or unavailable configured models without silently changing the selection. Provider adapter and model-discovery behavior follows the [configuration contract](../specs/configuration.md#configuration-task-mode-approval-and-mode-catalogue). Show validation/save errors while retaining the staged values. Clearly identify the active field and whether it is being edited; keyboard input stays in the editor.

Right enters category fields; Left returns to categories without changing values. Tab/Shift+Tab, Up/Down, or mouse clicks select fields. Enter begins editing; preset arrows change a staged choice and text fields reveal native input. Enter commits the field edit to the settings draft; Escape cancels that edit and stays in Settings. At the preset selector, Space marks the choice as default and `n` copies its provider adapter into a new named preset. Ctrl+S saves committed draft values only, never an uncommitted editor buffer. Multiline environment paste works; Shift+Enter inserts a newline when supported by the terminal. The horizontal scrollbar stays hidden; the vertical scrollbar appears only on overflow. Keep controls reachable at constrained sizes.

## Open Questions

Exact dialog copy, wrapping, and minimum dimensions are unspecified.
