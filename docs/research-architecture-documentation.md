---
consolidation:
  total: 25
  counts:
    exists: 8
    discard: 10
    integrate: 0
    unconfirmed: 7
  percentages:
    exists: 32.00%
    discard: 40.00%
    integrate: 0.00%
    unconfirmed: 28.00%
---
# Research: durable architecture documentation for agent-assisted projects

> **Non-authoritative supporting material.** This file is not a contract. Authoritative owner(s): [BLUEPRINT](BLUEPRINT.md), [CONVENTIONS](CONVENTIONS.md), [ADR process](adr/README.md).
> Historical — discard.

## Recommendation

Treat architecture documentation as a small set of purpose-separated, linked sources of truth—not a prose mirror of the source tree. Record durable ownership boundaries, responsibilities, permitted dependencies, externally meaningful interfaces, and interaction paths at the level needed to guide refactors. <!-- consolidation: unconfirmed; ref: none; reason: Linked structural contracts own boundaries and meaningful operations rather than declaration mirrors. --> Keep routine implementation details in code; document only details whose preservation matters across a refactor and which code/API declarations do not adequately express. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Code-owned declarations are linked rather than copied while blueprint contracts preserve meaningful behavior. -->

## Suggested responsibilities and authority

- **AGENTS.md**: operational instructions for agents and contributors (where to look, workflow, required checks); it should point to contracts, not silently define product behavior. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#engineering-conventions; reason: Contributor workflow and handoff procedures are delegated to AGENTS. -->
- **README.md**: entry point, purpose, setup, and links to the deeper sources. <!-- consolidation: discard; ref: none; reason: Entry-point navigation recommendation remains useful context without another core requirement. -->
- **SPEC.md**: normative product/behavior contract: what must remain true for users. Do not let observed implementation override it. <!-- consolidation: unconfirmed; ref: none; reason: Product authority and evidence hierarchy are explicit. -->
- **ARCHITECTURE.md**: normative structural contract: approved boundaries, ownership, dependency direction, major responsibilities, and communication/interface rules. <!-- consolidation: exists; ref: docs/BLUEPRINT.md#overview; reason: BLUEPRINT is the adopted owner of this structural responsibility. --> Distinguish explicitly between **required constraints**, **current implementation** (descriptive), and **accepted target not yet implemented**; label status and link code locations for the latter two. “Current” describes code, not authorization to change the contract. <!-- consolidation: unconfirmed; ref: none; reason: Status vocabulary and descriptive source navigation distinguish intent from implementation. -->
- **CONVENTIONS.md**: repeatable local engineering style/practices, only if not already covered by agent instructions or existing project docs. Not a second architecture authority. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#engineering-conventions; reason: Engineering ownership is distinct from structural contracts and contributor procedures. -->
- **ADRs** (e.g. `docs/adr/`): one significant decision per record, with context, decision, status, consequences, and links to the current contract. They preserve rationale/history; accepted ADRs explain why, but do not supersede the latest SPEC/ARCHITECTURE contract. Supersede/revise by explicit accepted decision and update the owning contract. <!-- consolidation: exists; ref: docs/adr/README.md#active-decisions; reason: Decision structure approval and explicit supersession preserve rationale alongside current owners. -->

These filenames/locations are recommendations, not a universal standard. Reuse an existing authoritative document when its responsibility is clear; do not create files solely to match this list. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#overview; reason: Local ownership is settled as BLUEPRINT rather than the suggested ARCHITECTURE filename. --> Avoid an unqualified `DESIGN.md`: “design” can mean proposal, rationale, target, or actual structure. If retained, state which one it owns and its status prominently. <!-- consolidation: discard; ref: none; reason: Naming advice for the already retired DESIGN document is historical context. -->

## Change and drift policy

An accidental code change, generated diagram, or agent inference never redefines approved architecture or product behavior. If code and normative contract disagree, flag the mismatch; do not silently “fix” the docs to match. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Code drift is an alignment issue rather than authority to amend intent. --> A deliberate architecture/behavior change requires explicit acceptance, updates the appropriate normative owner (SPEC for behavior; ARCHITECTURE for structure), and updates or supersedes relevant ADRs. <!-- consolidation: exists; ref: docs/adr/README.md#active-decisions; reason: Approved changes update current contracts and preserve superseded decisions. --> Implementation then follows, or the target is clearly marked as not yet implemented. Descriptive implementation notes may be refreshed to match code, but cannot grant permission to violate the contract. <!-- consolidation: unconfirmed; ref: none; reason: Accepted targets and descriptive source pointers have distinct evidence status. -->

## Granularity and diagrams

arc42 recommends hierarchical building blocks with purpose/responsibility and interfaces, but refinement by relevance: explain important, surprising, risky, complex, or volatile parts rather than cataloguing every class. Its runtime view recommends representative architecturally relevant scenarios, not exhaustive traces. <!-- consolidation: discard; ref: none; reason: External arc42 guidance remains supporting research. --> C4 likewise offers zoom levels (context, containers, components, code) and says only levels that add value need be used; code/class diagrams are implementation-level, rarely necessary. <!-- consolidation: discard; ref: none; reason: External diagram taxonomy is not a required project deliverable. --> Use a small context/container/component view for boundaries, and a sequence/scenario for consequential collaboration or failure paths. <!-- consolidation: unconfirmed; ref: none; reason: Specific diagram view selection is a recommendation rather than an approved required format. --> Use API/interface specs for concrete machine-consumed contracts (schema, protocol, errors, compatibility), linking them from the architecture. <!-- consolidation: unconfirmed; ref: docs/BLUEPRINT.md#component-contracts; reason: Core has logical detail contracts but does not approve a separate machine-consumed schema documentation mandate. --> Prefer generated or code-owned detail where practical; hand-maintained class/method inventories duplicate declarations and predictably rot. <!-- consolidation: exists; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Link code-owned declarations rather than duplicate them without removing meaningful designed contracts. -->

Document a class/method only when it carries a non-obvious architectural invariant or stable responsibility that cannot be inferred from signature, types, tests, or a focused interface spec. State why it matters, link to the declaration, and avoid repeating its parameter list or algorithm. <!-- consolidation: discard; ref: docs/BLUEPRINT.md#component-contracts; reason: The adopted contract requires all meaningful properties operations inputs results and failures even when code exposes them. --> Keep diagrams scoped, labeled with responsibilities/communication, and maintained alongside the contract they explain. <!-- consolidation: unconfirmed; ref: docs/CONVENTIONS.md#documentation-maintenance; reason: Exact diagram-maintenance practice is recommended but not explicitly adopted. -->

## Primary sources

1. **arc42, official documentation**: building-block hierarchy, purpose/responsibility/interfaces, and advice to refine selected significant blocks; runtime scenarios should be representative. [Building block view](https://docs.arc42.org/section-5/) · [Runtime view](https://docs.arc42.org/section-6/) · [Architecture decisions](https://docs.arc42.org/section-9/). Supports selective, responsibility-oriented documentation and separating views from rationale. <!-- consolidation: discard; ref: none; reason: External source findings remain bibliography evidence. -->
2. **C4 Model, official site by creator Simon Brown**: [Diagrams](https://c4model.com/diagrams) describes context/container/component/code and supporting dynamic/deployment views; use only diagrams that add value. [Introduction](https://c4model.com/introduction) frames diagrams as maps at different zoom levels, including retrospective documentation. Supports boundaries-first, selective diagrams instead of exhaustive class maps. <!-- consolidation: discard; ref: none; reason: Source characterization does not establish an approved diagram requirement. -->
3. **Michael Nygard, “Documenting Architecture Decisions” (2011), original article**: [article](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions). ADRs record architecturally significant decisions affecting structure, qualities, dependencies, interfaces, or construction; one record captures context, decision, status, and consequences, and reversed decisions remain with superseded status. Supports ADRs as rationale/history, not a substitute for the current contract. <!-- consolidation: discard; ref: none; reason: External rationale for ADR practice stays with the research provenance. -->

## Scope note

The authority hierarchy and agent-specific drift policy above are recommendations synthesized for this project context; the sources provide documentation models and decision-record practice, not a universal mandate for filenames or normative precedence. <!-- consolidation: discard; ref: none; reason: Research applicability disclaimer is not an additional core contract. -->
