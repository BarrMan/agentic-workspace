export type ReadOutputMode = "json" | "plain" | "interactive";

export type ReadOutputOptions = {
	json?: boolean;
	plain?: boolean;
};

export function resolveReadOutputMode(options: ReadOutputOptions, hasInteractiveTTY: boolean): ReadOutputMode {
	if (options.json && options.plain) {
		throw new Error("--json cannot be combined with --plain.");
	}
	if (options.json) return "json";
	if (options.plain || !hasInteractiveTTY) return "plain";
	return "interactive";
}
