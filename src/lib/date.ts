/** Formats timestamps stored in AgenticWorkspace markdown with minute precision in UTC. */
export function formatStoredDate(date = new Date()): string {
	return date.toISOString().slice(0, 16).replace("T", " ");
}
