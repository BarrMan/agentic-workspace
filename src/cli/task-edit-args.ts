export interface TaskEditArgs {
	title?: string;
	dueDate?: string | null;
	description?: string;
	status?: string;
	priority?: string;
	type?: string;
	project?: string;
	milestone?: string | null;
	labels?: string[];
	addLabels?: string[];
	removeLabels?: string[];
	assignee?: string[];
	ordinal?: number;
	dependencies?: string[];
	references?: string[];
	addReferences?: string[];
	removeReferences?: string[];
	documentation?: string[];
	addDocumentation?: string[];
	removeDocumentation?: string[];
	modifiedFiles?: string[];
}
