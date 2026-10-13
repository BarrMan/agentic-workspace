export class TaskCollectionFilterError extends Error {}

export class TaskCollectionParentNotFoundError extends Error {
	constructor(parent: string) {
		super(`Parent task ${parent} not found`);
	}
}
