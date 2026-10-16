---
consolidation:
  total: 11
  counts:
    exists: 2
    discard: 8
    integrate: 0
    unconfirmed: 1
  percentages:
    exists: 18.18%
    discard: 72.73%
    integrate: 0.00%
    unconfirmed: 9.09%
---
# Contributing to AgenticWorkspace

Thank you for your interest in contributing to AgenticWorkspace. This project is managed using the AgenticWorkspace workflow and we welcome community involvement. <!-- consolidation: discard; ref: docs/SPEC.md#authority; reason: Contributor introduction is operational context and alignment currently uses the file ledger. -->

## Opening Issues

- Search existing issues before creating a new one. <!-- consolidation: discard; ref: none; reason: Retain issue hygiene in root contributor instructions rather than product or architecture core. -->
- Provide a clear description of the problem or proposal. <!-- consolidation: discard; ref: none; reason: Retain contribution submission guidance outside core consolidation. -->
- Reference the related task ID when applicable. <!-- consolidation: discard; ref: none; reason: Retain contribution traceability guidance outside core consolidation. -->

## Pull Requests

1. Fork the repository and create a branch named after the task ID and a short description (e.g. `task-27-contributing-guidelines`). <!-- consolidation: discard; ref: none; reason: Retain repository contribution workflow and branch naming outside core consolidation. -->
2. Make your changes and commit them with the task ID in the message. <!-- consolidation: discard; ref: none; reason: Retain contributor commit procedure outside core consolidation. -->
3. Run tests with `bun run test` and ensure they pass. <!-- consolidation: exists; ref: AGENTS.md#running-tests; reason: The repository test command is documented in the agent workflow. --> It applies the same test timeout CI uses. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#checks-and-test-ownership; reason: Exact script and CI timeout equivalence requires verification and is not established by core. -->
4. Format and lint the code using `npx biome check .`. <!-- consolidation: discard; ref: docs/CONVENTIONS.md#validation; reason: Core specifies the configured bun run check command and scripts as command inventory. -->
5. Open a pull request referencing the issue or task it addresses. <!-- consolidation: discard; ref: none; reason: Retain PR traceability instruction in contributor workflow outside core consolidation. -->

Please read [AGENTS.md](AGENTS.md) for detailed rules that apply to contributors and AI agents. <!-- consolidation: exists; ref: README.md#development; reason: README directs contributors and agents to the repository workflow instructions. -->
