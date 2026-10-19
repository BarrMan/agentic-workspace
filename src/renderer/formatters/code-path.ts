/* Code path detection and styling utilities */

/**
 * Regex patterns for detecting code paths in backticks
 */
export const CODE_PATH_PATTERNS = {
	// Matches `src/cli.ts`, `package.json`, `/full/path/file.ts`
	BACKTICKED_PATH: /`([^`]+)`/g,
	// Matches file extensions
	FILE_EXTENSION: /\.[a-zA-Z0-9]+$/,
	// Matches path separators
	PATH_SEPARATOR: /[/\\]/,
} as const;

/**
 * Detect if a backticked string is likely a file path
 */
export function isCodePath(content: string): boolean {
	// Has file extension OR contains path separator
	return CODE_PATH_PATTERNS.FILE_EXTENSION.test(content) || CODE_PATH_PATTERNS.PATH_SEPARATOR.test(content);
}

/**
 * Extract all code paths from text
 */
export function extractCodePaths(text: string): string[] {
	const matches = text.match(CODE_PATH_PATTERNS.BACKTICKED_PATH);
	if (!matches) return [];

	return matches
		.map((match) => match.slice(1, -1)) // Remove backticks
		.filter(isCodePath);
}

/**
 * Simple styling for plain text (without markup tags)
 */
export function transformCodePathsPlain(text: string): string {
	if (!text) return "";

	return text.replace(CODE_PATH_PATTERNS.BACKTICKED_PATH, (match, path) => {
		if (isCodePath(path)) {
			return `\`${path}\``;
		}
		return match;
	});
}
