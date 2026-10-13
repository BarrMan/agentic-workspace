#!/usr/bin/env node

// Static registration imports run before dispatch and would consume forwarder stdin.
// Keep this process on the pipe-only module graph, without CLI or terminal UI startup.
if (process.argv[2] === "__vt-pipe") {
	const { runVtPipe } = await import("../agent-workspace/live/tmux/vt-channel.ts");
	runVtPipe(process.argv[3] ?? "");
} else {
	const { runCli } = await import("./register.ts");
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
	if (exitCode === 130 || exitCode === 143) process.exit(exitCode);
}
