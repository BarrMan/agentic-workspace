# Normalization refactor status

This was a working status log; its historical answers, test totals, and progress narrative are not current evidence or behavior authority. Use the [evidence and review index](normalization-refactor-decisions.md) for bounded current findings and its linked owner contracts for requirements.

Unique retained material:

- Q9.1–Q9.5 session safety rationale and concrete guard scenarios: [open questions](normalization-refactor-open-questions.md#q91-session-file-delete-guard).
- Q10 provider-native session-capture design: [open questions](normalization-refactor-open-questions.md#q10-provider-session-capture).
- Q12 sanitizer rationale: no provider sanitizer should silently alter a user's chosen command; explicit bypass options are a separate, disclosed launch behavior. Consult the session-runtime contract and index for current evidence.
- Keybinding research and source links: [modifier-matching research](../research/keybinding-modifier-matching.md).

Historical claims that status spelling is normalized, environment variables are filtered, dates use a custom parser, or removed files/features remain present are obsolete. The index points to current implementation evidence; no policy change is made here.
