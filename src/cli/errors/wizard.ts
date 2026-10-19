export class TaskWizardCancelledError extends Error {
	constructor() {
		super("Task wizard cancelled.");
	}
}
