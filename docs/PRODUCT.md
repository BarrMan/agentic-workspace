# Product Definition: AgenticWorkspace

## Overview

AgenticWorkspace is a TUI-first task and agent-session workspace for a project directory, whether or not the project uses Git. It brings work organization, configurable agent-assisted work, retained conversations, and live interaction together in one workspace.

It serves people organizing project work and interacting with agents, as well as agents and external applications that need selective access to workspace operations. It helps them coordinate work and continue conversations while retaining control over how the work proceeds.

Detailed behavior is defined in [SPEC](SPEC.md).

## Vision

Users can organize agent-assisted work and continue its conversations in one project workspace while retaining control over how the work proceeds.

## Target Users

### People organizing project work

**Description:** People who organize project work and interact with agents through a terminal workspace.

**Needs:**
- Keep project work and agent interaction organized together.
- Configure agent work without being forced into a development methodology or required deliverables.
- Retain access to conversations across changes in execution.

**Challenges:**
- Work organization, agent configuration, and conversations can otherwise be separated across tools or lose continuity.

### Agents and external applications

**Description:** Agents working within sessions and external applications interacting with a project workspace.

**Needs:**
- Access selected workspace operations relevant to their work.
- Work with the same project-scoped organization users rely on.

**Challenges:**
- Integration needs vary, and exposing every setting or user action is neither necessary nor appropriate.

## Goals

| Goal | Intended Outcome |
|---|---|
| Unite work organization and agent interaction | Users can manage project work and engage with agents in the same workspace. |
| Preserve conversation continuity | Conversations remain available across execution changes. |
| Support user-directed agent work | Users can configure agent work without an imposed methodology or required deliverables. |
| Make the workspace usable by people and integrations | Users can manage the workspace directly, while agents and applications receive selective access to needed operations. |

## Scope

Define the product's fundamental responsibilities and capabilities.

- Organize project-scoped work in a project directory, with or without Git.
- Support configurable agent-assisted work and live interaction within the user's chosen workflow.
- Retain conversations so users can continue them across execution changes.
- Support optional task content and project documents, including decision records, while preserving direct user access and prescribing no deliverables.
- Make workspace operations available to people and selectively to agents and external applications.
- Wrap agent harnesses without managing provider-owned configuration, data, or state.

## Non-Goals

Define intentional boundaries that clarify what the product is not intended to become.

- Requiring Git, a prescribed development workflow, a mode sequence, or a set of documents; the product supports varied project practices.
- Enforcing artifact-review gates or treating mode approval as approval of file contents; users direct their own work.
- Serving as a terminal-transcript or permanent session-lifecycle audit archive; retained conversations support continuity rather than exhaustive lifecycle auditing.
- Managing provider-owned configuration, data, or state; the application wraps harnesses and leaves provider state untouched.
- Automatically exposing every setting or user action through integrations; access remains selective to relevant needs.

## Product Principles

### User-directed work

**Definition:** Agent modes and optional files support the user's workflow rather than dictate it; mode approval is informational.

**Implication:** Do not require a particular methodology, deliverable, or approval of content as a condition of work.

### Conversation continuity

**Definition:** A retained conversation remains the same conversation across execution changes.

**Implication:** Preserve continuity when execution changes, and require an explicit choice to start a different conversation.

### Observed runtime truth

**Definition:** Current session state is determined by observation rather than permanent lifecycle labels.

**Implication:** Represent current state from what is observed, not as an assumed permanent status.

### Project-scoped organization

**Definition:** A project directory defines the workspace, whether or not it uses Git.

**Implication:** Do not make Git a prerequisite for organizing project work.

### Accessible configuration and data

**Definition:** Users retain direct access to editable files; integrations provide convenience rather than exclusive access.

**Implication:** Preserve user access to project data and expose integrations selectively, without making them the only way to manage the workspace.

## Open Product Decisions

| Decision | Context | Status |
|---|---|---|
| Search filter combinations and matching details | See the [filtering and search contract](specs/filtering-and-search.md#filtering-and-search). | Open |
