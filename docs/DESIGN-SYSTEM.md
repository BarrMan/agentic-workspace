# Shared visual design

This document owns reusable visual rules. Product behavior belongs in [SPEC](SPEC.md); exact screen composition belongs in [screen specifications](screens/README.md).

## Status and activity

Use both a text label and color/state marker where space permits; color alone must not carry meaning.

| Observed session state | Visual treatment |
|---|---|
| Ended | Grey |
| Working | Green |
| Permission request | Orange |
| Idle, unknown, or starting | Blue |
| Activity error | Red |

Preserve readable labels and markers so color is not the only signal.

## Type, cells, and spacing

Terminal text uses the available cell grid, not proportional-font or web-breakpoint assumptions. Preserve readable labels and visible focus. Use the geometry specified by each screen where given; do not generalize screen-specific colors or invent decorative treatment.

## Shared footer and focus

Session start applies to the selected mode only. Footer content, mode-specific cue policy, shortcut presentation, and focused-agent footer detail remain open questions.

## Dialogs and focus

Make focus visible and keep keyboard input within the active dialog or editor; actions must not leak through an active modal. Preserve unsaved values when an operation fails.

## Open Questions

Exact shared palette tokens, global spacing scale, focus color, and universal dialog geometry are unspecified; screen-specific details are owned by the screen contracts.
