export function parseColonConfigLine(rawLine: string): { key: string; value: string } | null {
	const line = rawLine.trim();
	if (!line || line.startsWith("#")) return null;
	const colonIndex = line.indexOf(":");
	if (colonIndex === -1) return null;
	return {
		key: line.slice(0, colonIndex).trim(),
		value: line.slice(colonIndex + 1).trim(),
	};
}
