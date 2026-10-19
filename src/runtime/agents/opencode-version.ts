export type OpenCodeBootstrap = "opencode-v1" | "opencode-v2";

/** Map a `--version` result to the OpenCode adapter for its major version. */
export function openCodeBootstrapForVersion(output: string): OpenCodeBootstrap | undefined {
	const version = output.trim().replace(/^opencode\s+/i, "");
	if (/\s/.test(version)) return undefined;
	if (Bun.semver.satisfies(version, "1.x")) return "opencode-v1";
	if (Bun.semver.satisfies(version, "2.x")) return "opencode-v2";
	return undefined;
}
