# Documentation map

The project contracts are authoritative and are the single source of truth for their concerns: PRODUCT, SPEC and its linked `specs/`, BLUEPRINT and its detailed `architecture/` pages, CONVENTIONS, DESIGN-SYSTEM, `screens/`, and ADRs. Each concern has one owning contract.

## Durable documents

| Read when… | Owner | Contains |
|---|---|---|
| Understanding the product's purpose or scope | [PRODUCT](PRODUCT.md) | Users, goals, scope and non-goals. |
| Changing a feature, API or failure/recovery behavior | [SPEC](SPEC.md) and its linked feature contracts | Supported behavior, scenarios, constraints and acceptance criteria. |
| Changing logical architecture, ownership, interfaces or operation contracts | [BLUEPRINT](BLUEPRINT.md) and [`architecture/`](architecture/) | Structural boundaries and meaningful operations, properties, and events, including their inputs, results, preconditions, and failure contracts. Detailed component pages are parts of this contract. |
| Changing a particular screen | [Screen index](screens/README.md) | Screen contents, ordering, states, focus, actions and terminal-size behavior. |
| Reusing or adding visual/interaction patterns | [DESIGN-SYSTEM](DESIGN-SYSTEM.md) | Shared palette, spacing, headers, footers, dialogs and component patterns. |
| Writing code or tests | [CONVENTIONS](CONVENTIONS.md) | Repeatable engineering and organization practices. |
| Understanding an accepted technology choice or significant architecture decision | [ADRs](adr/README.md) | Approved decisions with rationale, alternatives and consequences; significant new decisions require approval and accepted records are preserved with explicit supersession. |

The root [README](../README.md) introduces installation and usage. Root [AGENTS.md](../AGENTS.md) defines the reading/execution workflow, not product behavior.

## Feature contracts and scenarios

SPEC is the entry point for product behavior. Its linked files under `specs/` are parts of that same specification, not competing documents. A feature's normal behavior, preconditions, failure outcomes, interruption/recovery, repeated/concurrent operations and acceptance scenarios belong together in its owning contract. An unresolved policy is labeled in the owning contract.

Screen documents link to product rules instead of restating them. The design system owns reusable patterns; screens own their application and documented exceptions. Architecture names the components and communication needed to implement behavior without redefining its outcomes.

## Work and evidence

- [Alignment plan](alignment-plan.md): the temporary file-based execution queue until the project is usable for task tracking. It tracks implementation gaps and verification work, not desired behavior owned by a contract.
- Research reports, older specifications, handoffs and implementation plans: non-contract supporting material. Consult them only when relevant to current work; the owning contract defines intended behavior.

Before retiring non-contract material, account for any useful requirements and update inbound links. Keep unclassified material intact until that check is complete.

## Changing the contract

1. Find the existing owner and read its normal, failure and recovery rules before asking the owner a question.
2. Identify the exact unanswered policy or requested change; discoverable implementation facts are research work.
3. Record an accepted decision in the owning contract. Obtain approval for significant new technology or architecture decisions and preserve accepted decisions in ADRs with rationale; supersede them with a new accepted record rather than rewriting history.
4. Track unfinished implementation and verification in the alignment plan. Code, tests, screenshots and installed help demonstrate conformance or a gap; update the owning contract when an approved behavior changes.

Use descriptive headings and links. Split a growing feature or screen by responsibility rather than maintaining abbreviated duplicate copies.
