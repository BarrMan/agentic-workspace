import matter from "gray-matter";

/**
 * The only place in the codebase that talks to gray-matter.
 *
 * gray-matter keeps a module-level cache of parse results keyed by the input string and hands the
 * same `data` object back to every later caller, so one caller mutating its result silently changes
 * what the next parse of identical content returns, and a malformed file only throws on its first
 * parse. Passing an options object skips the cache entirely (gray-matter 4.x only reads and writes
 * the cache when `options` is falsy), so every call here passes one.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
	const file = matter(content, {
		engines: {
			yaml: {
				// Bun's YAML parser preserves timestamp scalars as their written strings.
				parse: (source: string) => {
					const data = Bun.YAML.parse(source);
					if (data === null || data === undefined) return {};
					if (typeof data !== "object" || Array.isArray(data)) {
						throw new Error("YAML frontmatter must be a mapping.");
					}
					return data;
				},
			},
		},
	});
	return { data: file.data, content: file.content };
}

/** Serialize `data` as frontmatter above `content`. */
export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
	// An object keeps a frontmatter-looking prefix in the opaque body from being parsed again.
	return matter.stringify({ content }, data, {});
}
