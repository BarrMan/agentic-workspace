export function moveTargetToAdjacentColumn(
	statuses: readonly string[],
	targetStatus: string,
	targetIndex: number,
	direction: "previous" | "next",
	columnSize: (status: string) => number,
): { status: string; index: number } | undefined {
	const currentIndex = statuses.indexOf(targetStatus);
	const targetStatusIndex = currentIndex + (direction === "previous" ? -1 : 1);
	const status = statuses[targetStatusIndex];
	if (!status) return undefined;
	return { status, index: Math.min(targetIndex, columnSize(status)) };
}
