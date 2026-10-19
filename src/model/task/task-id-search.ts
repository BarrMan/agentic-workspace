/** Keep the stored task ID literal; matching itself handles casing and substring queries. */
export function createTaskIdSearchVariants(id: string): string[] {
	const lowerId = id.toLowerCase();
	return id === lowerId ? [id] : [id, lowerId];
}
