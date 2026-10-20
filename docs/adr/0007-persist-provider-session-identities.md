# ADR-0007: Persist provider session identities in session state

**Status:** Accepted  
**Date:** 2026-10-20  
**Supersedes:** [ADR-0002](0002-storage-filesystem-paths-formats.md), provider identity receipt path only

## Decision

Provider-native conversation identity belongs in the owning session's `nativeSessionId` field in `state.json`. New captures are persisted by the session identity publisher. Reads and resume use persisted identity only; there is no fallback or migration from sidecar files. Readiness receipts remain separate provider startup evidence and are not affected.

## Rationale

Provider identity already has a durable owner in session state. A second generic receipt creates competing sources of truth and requires revalidation and cleanup behavior. Existing sidecar-only identities are not automatically recovered.
