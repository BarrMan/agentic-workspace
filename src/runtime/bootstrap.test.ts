import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentPreset } from "../model/session/types.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { usePromptInjectionAgent } from "../test/test-fake-agent.ts";
import { shellQuote } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { buildAgentLaunchCommand, buildAgentResumeCommand, renderSessionBootstrap } from "./bootstrap.ts";

const profile = getDefaultModeCatalog().profiles.build;
if (!profile) throw new Error("Missing default build mode profile.");

const preset: AgentPreset = {
	command: "",
	env: {},
	prepare: "",
	bootstrap: "opencode",
};

describe("agent session bootstrap", () => {
	it("starts idle with only the active task identity", () => {
		expect(renderSessionBootstrap({ taskId: "BACK-123" })).toBe("Active task: BACK-123.\nWait for user instructions.");
	});

	it("passes bootstrap content as one argv value and preserves configured command flags", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-bootstrap-"));
		const outputPath = join(directory, "argv.txt");
		const agentPath = join(directory, "agent");
		const bootstrapPath = join(directory, "agent's bootstrap.md");
		const bootstrap = "Read this first: $() * and spaces";
		await writeFile(agentPath, '#!/bin/sh\nprintf "%s\\n" "$@" > "$OUTPUT"\n');
		await chmod(agentPath, 0o755);
		await writeFile(bootstrapPath, bootstrap);

		try {
			for (const [bootstrapType, expected] of [
				["opencode-v1", ["--existing", "--prompt", bootstrap]],
				["claude", ["--existing", "--session-id", "native-1", bootstrap]],
				["pi", ["--existing", "--session-id", "native-1", bootstrap]],
			] as const) {
				const command = buildAgentLaunchCommand(
					{ ...preset, command: `${agentPath} --existing`, bootstrap: bootstrapType },
					bootstrapPath,
					bootstrapType === "opencode-v1" ? undefined : "native-1",
				);
				const child = Bun.spawn(["/bin/sh", "-lc", command], {
					env: { ...process.env, OUTPUT: outputPath },
					stdout: "ignore",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				expect((await readFile(outputPath, "utf8")).trimEnd().split("\n")).toEqual([...expected]);
			}
			const seededOpenCode = buildAgentLaunchCommand(
				{ ...preset, command: `${agentPath} --existing`, bootstrap: "opencode-v1" },
				bootstrapPath,
				"native-1",
			);
			const seededChild = Bun.spawn(["/bin/sh", "-lc", seededOpenCode], {
				env: { ...process.env, OUTPUT: outputPath },
				stdout: "ignore",
				stderr: "pipe",
			});
			expect(await seededChild.exited).toBe(0);
			expect((await readFile(outputPath, "utf8")).trimEnd().split("\n")).toEqual([
				"--existing",
				"--session",
				"native-1",
			]);

			const restore = usePromptInjectionAgent("claude");
			try {
				const custom = buildAgentLaunchCommand(
					{ ...preset, command: `${agentPath} --existing --custom {instructions}`, bootstrap: "claude" },
					bootstrapPath,
				);
				const child = Bun.spawn(["/bin/sh", "-lc", custom], {
					env: { ...process.env, OUTPUT: outputPath },
					stdout: "ignore",
					stderr: "pipe",
				});
				expect(await child.exited).toBe(0);
				expect((await readFile(outputPath, "utf8")).trimEnd().split("\n")).toEqual([
					"--existing",
					"--custom",
					bootstrap,
				]);
			} finally {
				restore();
			}
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("gives each adapter ownership of its native identity for new and resume intents", async () => {
		const requireAgent = (name: "claude" | "pi" | "opencode-v1" | "opencode-v2") => {
			const agent = agentFor(name);
			if (!agent) throw new Error(`Agent not registered: ${name}`);
			return agent;
		};
		const bootstrapped = (name: "claude" | "pi" | "opencode-v1" | "opencode-v2"): AgentPreset => ({
			...preset,
			command: "agent",
			bootstrap: name === "opencode-v2" ? "opencode" : name,
		});
		const prepareWith = async (
			name: "claude" | "pi" | "opencode-v1" | "opencode-v2",
			intent: import("./agents/agent.ts").SessionIntent,
		) => {
			const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-identity-"));
			try {
				return await requireAgent(name).prepare({
					cwd: directory,
					bootstrapPath: join(directory, "bootstrap.md"),
					directory,
					skillRoot: join(directory, "skills"),
					skillPath: join(directory, "skills", "SKILL.md"),
					env: {},
					preset: bootstrapped(name),
					intent,
					profile,
				});
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		};
		for (const name of ["claude", "pi", "opencode-v2"] as const) {
			const prepared = await prepareWith(name, { kind: "new" });
			expect(prepared.identity?.basis).toBe("client-established");
			expect(prepared.command).toContain(prepared.identity?.id ?? "");
		}
		for (const name of ["claude", "pi", "opencode-v1", "opencode-v2"] as const) {
			const prepared = await prepareWith(name, { kind: "resume", nativeSessionId: "ses_exact" });
			expect(prepared.identity?.id).toBe("ses_exact");
			expect(prepared.command).toContain("ses_exact");
		}
		const deferred = await prepareWith("opencode-v1", { kind: "new" });
		expect(deferred.identity).toBeUndefined();
	});

	it("resumes exact native conversations with documented or configured syntax", () => {
		for (const [bootstrapType, native] of [
			["opencode-v1", "agent --existing '--session' 'native-1'"],
			["claude", "agent --existing '--resume' 'native-1'"],
			["pi", "agent --existing '--session' 'native-1'"],
		] as const) {
			expect(
				buildAgentResumeCommand({ ...preset, command: "agent --existing", bootstrap: bootstrapType }, "native-1"),
			).toBe(native);
			expect(() =>
				buildAgentResumeCommand({ ...preset, command: "agent --existing", bootstrap: bootstrapType }),
			).toThrow("exact native session ID");
		}
		expect(
			buildAgentResumeCommand(
				{ ...preset, command: "agent", bootstrap: "pi", resumeFlag: "--session; touch /tmp/unsafe" },
				"native; touch /tmp/unsafe",
			),
		).toBe("agent '--session; touch /tmp/unsafe' 'native; touch /tmp/unsafe'");
		expect(() =>
			buildAgentResumeCommand(
				{ ...preset, command: "agent --existing", bootstrap: "pi", resumeFlag: "\0--session" },
				"native-1",
			),
		).toThrow("without NUL bytes");

		const restore = usePromptInjectionAgent("claude");
		try {
			expect(
				buildAgentResumeCommand(
					{ ...preset, command: "agent --existing", bootstrap: "claude", resumeFlag: "--continue" },
					"native-1",
				),
			).toBe("agent --existing '--continue' 'native-1'");
			expect(() =>
				buildAgentResumeCommand({ ...preset, command: "agent {prompt}", bootstrap: "claude" }, "native-1"),
			).toThrow("do not define a native resume command");
		} finally {
			restore();
		}
	});

	it("requires a prompt placeholder for custom commands and rejects unsafe built-in suffixes", () => {
		const restore = usePromptInjectionAgent("claude");
		try {
			expect(() => buildAgentLaunchCommand({ ...preset, bootstrap: "claude", command: "my-agent" }, "/tmp/a")).toThrow(
				"must include {prompt} or {instructions}",
			);
		} finally {
			restore();
		}
		expect(() =>
			buildAgentLaunchCommand({ ...preset, bootstrap: "opencode-v1", command: "agent | tee output" }, "/tmp/a"),
		).toThrow("not a shell pipeline");
	});
});

describe("agent ask commands", () => {
	const nativeSessionId = "ses_1";
	const question = `what's "next"?`;
	const quotedQuestion = `'what'"'"'s "next"?'`;

	const requireAgent = (name: "opencode-v1" | "claude" | "pi") => {
		const agent = agentFor(name);
		if (!agent) throw new Error(`Agent not registered: ${name}`);
		return agent;
	};

	it("builds the exact shell-quoted ask command for each provider", () => {
		expect(
			requireAgent("opencode-v1").askCommand({
				preset: { ...preset, command: "opencode", bootstrap: "opencode-v1" },
				nativeSessionId,
				question,
			}),
		).toBe(`opencode run --session 'ses_1' ${quotedQuestion}`);
		expect(
			requireAgent("claude").askCommand({
				preset: { ...preset, command: "claude", bootstrap: "claude" },
				nativeSessionId,
				question,
			}),
		).toBe(`claude -p --resume 'ses_1' ${quotedQuestion}`);
		expect(
			requireAgent("pi").askCommand({
				preset: { ...preset, command: "pi", bootstrap: "pi" },
				nativeSessionId,
				question,
			}),
		).toBe(`pi -p --session 'ses_1' ${quotedQuestion}`);
	});

	it("refuses to ask without a native session ID", () => {
		for (const [bootstrap, command] of [
			["opencode-v1", "opencode"],
			["claude", "claude"],
			["pi", "pi"],
		] as const) {
			for (const native of ["", "   "]) {
				expect(() =>
					requireAgent(bootstrap).askCommand({
						preset: { ...preset, command, bootstrap },
						nativeSessionId: native,
						question,
					}),
				).toThrow("exact native session ID");
			}
		}
	});

	it("passes the question verbatim through shell quoting", async () => {
		const tricky = "  $HOME `id` $(whoami) 'single' \"double\" ; | & * ? ~\n";
		const command = requireAgent("opencode-v1").askCommand({
			preset: { ...preset, command: "opencode", bootstrap: "opencode-v1" },
			nativeSessionId,
			question: tricky,
		});
		expect(command).toBe(`opencode run --session 'ses_1' ${shellQuote(tricky)}`);

		const child = Bun.spawn(["/bin/sh", "-c", `printf '%s' ${shellQuote(tricky)}`], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toBe(tricky);
	});
});
