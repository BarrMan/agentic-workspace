# Product Definition: AgenticWorkspace

## Vision

Users can organize agent-assisted work and continue its conversations in one project workspace while retaining control over how the work proceeds.

## Problem

Work organization, agent configuration, and conversations can otherwise be separated across tools or lose continuity. Integration needs vary, and exposing every setting or user action is neither necessary nor appropriate.

AgenticWorkspace brings project work, configurable agent-assisted work, and retained conversations together while allowing selective access to workspace operations. Detailed behavior is defined in [SPEC](SPEC.md).

## Target Users

### People organizing project work

**Who:** People who organize project work and interact with agents through a terminal workspace.

**Needs:**
- Keep project work and agent interaction organized together.
- Configure agent work without being forced into a development methodology or required deliverables.
- Retain access to conversations across changes in execution.

**Value:** Organize project work, configure agent work, and continue conversations together while retaining control over how work proceeds.

**Challenges:**
- Work organization, agent configuration, and conversations can otherwise be separated across tools or lose continuity.

### Agents and external applications

**Who:** Agents working within sessions and external applications interacting with a project workspace.

**Needs:**
- Access selected workspace operations relevant to their work.
- Work with the same project-scoped organization users rely on.

**Value:** Work with project-scoped organization through selective access to relevant workspace operations.

**Challenges:**
- Integration needs vary, and exposing every setting or user action is neither necessary nor appropriate.

## Product Goals

| Goal | Intended Outcome |
|---|---|
| Unite work organization and agent interaction | Users can manage project work and engage with agents in the same workspace. |
| Preserve conversation continuity | Conversations remain available across execution changes. |
| Support user-directed agent work | Users can configure agent work without an imposed methodology or required deliverables. |
| Make the workspace usable by people and integrations | Users can manage the workspace directly, while agents and applications receive selective access to needed operations. |

## Core Capabilities

### Project-scoped work organization

**Purpose:** Organize work in a project directory, whether or not it uses Git.

**Value:** People and integrations use the same project-scoped organization without requiring a particular development workflow.

The workspace supports tasks, optional task content, and project documents, including decision records, without prescribing deliverables.

### Configurable agent-assisted work

**Purpose:** Support agent work and live interaction within the user's chosen workflow.

**Value:** Users can direct agent work without being forced into a methodology or required deliverables.

### Retained conversations

**Purpose:** Retain conversations across execution changes.

**Value:** Users can continue conversations while preserving continuity.

### Selective workspace access

**Purpose:** Make workspace operations available to people and selectively to agents and external applications.

**Value:** Integrations can access relevant operations without exposing every setting or user action.

### Agent harness integration

**Purpose:** Wrap agent harnesses.

**Value:** Agent-assisted work is available without taking ownership of provider-owned configuration, data, or state.

## Product Boundaries

### In Scope

- Organize project-scoped work in a project directory, with or without Git.
- Support configurable agent-assisted work and live interaction within the user's chosen workflow.
- Retain conversations so users can continue them across execution changes.
- Support optional task content and project documents, including decision records, while preserving direct user access and prescribing no deliverables.
- Make workspace operations available to people and selectively to agents and external applications.
- Wrap agent harnesses without managing provider-owned configuration, data, or state.

### Out of Scope

- Requiring Git, a prescribed development workflow, a mode sequence, or a set of documents; the product supports varied project practices.
- Enforcing artifact-review gates or treating mode approval as approval of file contents; users direct their own work.
- Serving as a terminal-transcript or permanent session-lifecycle audit archive; retained conversations support continuity rather than exhaustive lifecycle auditing.
- Managing provider-owned configuration, data, or state; the application wraps harnesses and leaves provider state untouched.
- Automatically exposing every setting or user action through integrations; access remains selective to relevant needs.

## Guiding Principles

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

## Success Criteria

- Users can manage project work and engage with agents in the same workspace.
- Conversations remain available across execution changes.
- Users can configure agent work without an imposed methodology or required deliverables.
- Users can manage the workspace directly, while agents and applications receive selective access to needed operations.
