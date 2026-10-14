# BACK-26 — Checkable work

- [x] T1 Remove live Spec Kit passages and OpenCode `SPECIFY_FEATURE_*` variables from `agentic-workspace/agents.json`; canonical AgenticWorkspace artifact guidance remains.
- [x] T2 Apply the existing YOLO toggle/provider flag to profiled and unprofiled new/resumed launches, removing stale embedded flags when off and preserving model overrides and OpenCode rules.
- [x] T3 Use the current effective YOLO setting on snapshot-backed resumes without replacing captured profile, model, roots, or preset.
- [x] T4 Separate Modes overview and fields, show selected/input/textarea surfaces, and preserve navigation and editor reachability at 80×16 and 72×14.
- [x] T5 Explain provider-specific YOLO behavior and user-only artifact approval in Sessions settings.
- [x] T6 Rebuild after each code edit, check source freshness, run affected tests, and exercise rebuilt-binary settings and representative launches.

Verification: `bun run check:types` passed; 114 tests across nine affected files passed; `git diff --check` passed; `find src -name '*.ts' -newer dist/agentic-workspace` printed nothing. The installed `/opt/homebrew/bin/agentic-workspace` symlink points to the rebuilt `dist/agentic-workspace`. A real-PTY binary settings test saved and reopened mode fields. A throwaway fake-OpenCode launch through the installed CLI retained BUILD model `provider/model`, emitted `--auto` only with YOLO on, and kept that flag off the one-shot serve command. Snapshot on/off resumes were covered by focused tests, not a live provider. Native permission enforcement and a live-provider resume remain unverified. Existing unrelated uncommitted files were preserved; task remains In Progress for user review.
