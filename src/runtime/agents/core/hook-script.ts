/** The only statuses a hook may write; anything else is treated as absent. */
export const HOOK_STATUS_VALUES = ["running", "waiting", "idle", "error"] as const;
export type HookStatus = (typeof HOOK_STATUS_VALUES)[number];

function quoteShell(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** The shared shell-script body for every command-hook emitter. */
function hookScript(directoryExpression: string, status: HookStatus): string {
	return [
		"set -f",
		"umask 077",
		`D=${directoryExpression}`,
		'[ -n "$D" ] && [ -d "$D" ] || exit 0',
		`if [ ${status} = idle ] && [ "$(cat "$D/status" 2>/dev/null)" = idle ]; then :; else printf %s ${status} > "$D/status" 2>/dev/null; fi`,
		"exit 0",
	].join("; ");
}

/** The command-hook body for a hook file inside the owned per-launch temp dir. */
export function buildHookCommand(statusDir: string, status: HookStatus): string {
	return `sh -c ${quoteShell(hookScript(quoteShell(statusDir), status))}`;
}

/** Save provider hook stdin verbatim; parsing belongs to the harness. */
export function buildReadinessReceiptCommand(directory: string, path: string): string {
	return `sh -c ${quoteShell(
		`umask 077; D=${quoteShell(directory)}; P=${quoteShell(path)}; [ -d "$D" ] || exit 0; T="$P.tmp.$$"; if cat > "$T" 2>/dev/null && mv "$T" "$P" 2>/dev/null; then exit 0; fi; rm -f "$T"; exit 0`,
	)}`;
}
