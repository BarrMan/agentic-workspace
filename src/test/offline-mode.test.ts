import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitOperations } from "../filesystem/git/operations.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";

describe("Offline Mode Configuration", () => {
	let tempDir: string;
	let gitOps: GitOperations;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "agentic-workspace-offline-test-"));
		gitOps = new GitOperations(tempDir);
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	describe("GitOperations.fetch()", () => {
		it("should skip fetch when remoteOperations is false", async () => {
			const config: AgenticWorkspaceConfig = {
				projectName: "Test",
				statuses: ["To Do", "Done"],
				labels: [],
				dateFormat: "YYYY-MM-DD",
				remoteOperations: false,
			};

			gitOps.setConfig(config);

			// Mock process.env.DEBUG to capture debug message
			const originalDebug = process.env.DEBUG;
			process.env.DEBUG = "1";

			// Capture console.warn calls
			const originalWarn = console.warn;
			const warnMessages: string[] = [];
			console.warn = (message: string) => {
				warnMessages.push(message);
			};

			// This should not throw and should skip the actual fetch
			await gitOps.fetch();

			// Verify debug message was logged
			expect(warnMessages).toContain("Remote operations are disabled in config. Skipping fetch.");

			// Restore
			process.env.DEBUG = originalDebug;
			console.warn = originalWarn;
		});

		it("should handle network errors gracefully", async () => {
			const config: AgenticWorkspaceConfig = {
				projectName: "Test",
				statuses: ["To Do", "Done"],
				labels: [],
				dateFormat: "YYYY-MM-DD",
				remoteOperations: true,
			};

			gitOps.setConfig(config);

			// Capture console.warn calls
			const originalWarn = console.warn;
			const warnMessages: string[] = [];
			console.warn = (message: string) => {
				warnMessages.push(message);
			};

			// Mock execGit to simulate network error
			type GitOperationsInternals = {
				hasAnyRemote: () => Promise<boolean>;
				execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
			};
			const internals = gitOps as unknown as GitOperationsInternals;
			const originalHasAnyRemote = internals.hasAnyRemote;
			const originalExecGit = internals.execGit;
			internals.hasAnyRemote = async () => true;
			internals.execGit = async () => {
				throw new Error("could not resolve host github.com");
			};

			try {
				await expect(gitOps.fetch()).resolves.toBeUndefined();
				if (!process.env.DEBUG) expect(warnMessages).toEqual([]);
			} finally {
				console.warn = originalWarn;
				internals.hasAnyRemote = originalHasAnyRemote;
				internals.execGit = originalExecGit;
			}
		});
	});

	describe("Network Error Detection", () => {
		it("should detect various network error patterns", () => {
			const config: AgenticWorkspaceConfig = {
				projectName: "Test",
				statuses: ["To Do", "Done"],
				labels: [],
				dateFormat: "YYYY-MM-DD",
				remoteOperations: true,
			};

			gitOps.setConfig(config);

			const networkErrors = [
				"could not resolve host github.com",
				"Connection refused",
				"Network is unreachable",
				"Operation timed out",
				"No route to host",
				"Connection timed out",
				"Temporary failure in name resolution",
			];

			for (const errorMessage of networkErrors) {
				const isNetworkError = (gitOps as unknown as { isNetworkError: (error: unknown) => boolean }).isNetworkError(
					new Error(errorMessage),
				);
				expect(isNetworkError).toBe(true);
			}

			// Non-network errors should not be detected as network errors
			const nonNetworkErrors = ["Permission denied", "Repository not found", "Authentication failed"];

			for (const errorMessage of nonNetworkErrors) {
				const isNetworkError = (gitOps as unknown as { isNetworkError: (error: unknown) => boolean }).isNetworkError(
					new Error(errorMessage),
				);
				expect(isNetworkError).toBe(false);
			}
		});
	});
});
