import * as clack from "@clack/prompts";
import { DEFAULT_INIT_CONFIG } from "../../../constants/index.ts";
import type { AgenticWorkspaceConfig } from "../../../types/index.ts";
import { isEditorAvailable as checkEditorAvailability, resolveEditor } from "../../../utils/editor.ts";

export interface PromptChoice {
	title: string;
	value: string | number | boolean;
	description?: string;
	disabled?: boolean;
}

export interface PromptQuestion {
	type: "confirm" | "number" | "text" | "select" | "multiselect";
	name: string;
	message: string;
	hint?: string;
	initial?: string | number | boolean;
	min?: number;
	max?: number;
	choices?: PromptChoice[];
}

export interface PromptOptions {
	onCancel?: () => void;
}

export type PromptRunner = (
	question: PromptQuestion | PromptQuestion[],
	options?: PromptOptions,
) => Promise<Record<string, unknown>>;

export type EditorAvailabilityChecker = (editor: string) => Promise<boolean>;

export interface WizardOptions {
	existingConfig?: AgenticWorkspaceConfig | null;
	cancelMessage: string;
	promptImpl?: PromptRunner;
	isEditorAvailable?: EditorAvailabilityChecker;
}

export interface AdvancedConfigWizardResult {
	config: Partial<AgenticWorkspaceConfig>;
	installShellCompletions: boolean;
}

type WizardConfig = Pick<
	AgenticWorkspaceConfig,
	| "checkActiveBranches"
	| "remoteOperations"
	| "activeBranchDays"
	| "bypassGitHooks"
	| "zeroPaddedIds"
	| "defaultEditor"
	| "defaultPort"
	| "autoOpenBrowser"
>;
type WizardConfigKey = keyof WizardConfig;

interface PromptContext {
	prompt: PromptRunner;
	onCancel: () => void;
}

interface FieldDescriptor<K extends WizardConfigKey> {
	key: K;
	question: Omit<PromptQuestion, "name" | "initial">;
	isValue: (value: unknown) => value is WizardConfig[K];
}

function handlePromptCancel(message: string) {
	clack.cancel(message);
	throw Object.assign(new Error("CLI requested exit"), { exitCode: 1 });
}

function withHint(message: string, hint?: string): string {
	return hint ? `${message} (${hint})` : message;
}

function promptChoices(choices: PromptChoice[] = []) {
	return choices.map((choice) => ({
		label: choice.title,
		value: choice.value,
		hint: choice.description,
		disabled: choice.disabled,
	}));
}

function cancelled(result: unknown, onCancel?: () => void): boolean {
	if (!clack.isCancel(result)) {
		return false;
	}
	onCancel?.();
	return true;
}

async function runConfirmPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result = await clack.confirm({
		message: withHint(question.message, question.hint),
		initialValue: Boolean(question.initial ?? false),
	});
	return cancelled(result, options?.onCancel) ? {} : { [question.name]: result };
}

async function runTextPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result = await clack.text({
		message: withHint(question.message, question.hint),
		initialValue: typeof question.initial === "string" ? question.initial : undefined,
	});
	return cancelled(result, options?.onCancel) ? {} : { [question.name]: String(result ?? "").trim() };
}

async function runNumberPrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const initial = typeof question.initial === "number" ? question.initial : undefined;
	const result = await clack.text({
		message: withHint(question.message, question.hint),
		initialValue: initial === undefined ? undefined : String(initial),
		validate: (value) => validateNumber(value, question, initial),
	});
	if (cancelled(result, options?.onCancel)) {
		return {};
	}
	const value = String(result ?? "").trim();
	return { [question.name]: value ? Number(value) : initial };
}

function validateNumber(value: unknown, question: PromptQuestion, initial: number | undefined): string | undefined {
	const normalized = String(value ?? "").trim();
	if (!normalized) {
		return initial === undefined ? "Value is required." : undefined;
	}
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) {
		return "Please enter a valid number.";
	}
	if (question.min !== undefined && parsed < question.min) {
		return `Value must be at least ${question.min}.`;
	}
	return question.max !== undefined && parsed > question.max ? `Value must be at most ${question.max}.` : undefined;
}

async function runChoicePrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	const result =
		question.type === "select"
			? await clack.select({
					message: withHint(question.message, question.hint),
					initialValue: question.initial,
					options: promptChoices(question.choices),
				})
			: await clack.multiselect({
					message: withHint(question.message, question.hint),
					required: false,
					options: promptChoices(question.choices),
				});
	if (cancelled(result, options?.onCancel)) {
		return {};
	}
	return { [question.name]: question.type === "multiselect" ? (Array.isArray(result) ? result : []) : result };
}

async function runSinglePrompt(question: PromptQuestion, options?: PromptOptions): Promise<Record<string, unknown>> {
	if (question.type === "confirm") {
		return runConfirmPrompt(question, options);
	}
	if (question.type === "text") {
		return runTextPrompt(question, options);
	}
	if (question.type === "number") {
		return runNumberPrompt(question, options);
	}
	return runChoicePrompt(question, options);
}

const clackPromptRunner: PromptRunner = async (question, options) => {
	if (!Array.isArray(question)) {
		return runSinglePrompt(question, options);
	}
	const merged: Record<string, unknown> = {};
	for (const single of question) {
		let didCancel = false;
		Object.assign(
			merged,
			await runSinglePrompt(single, {
				onCancel: () => {
					didCancel = true;
					options?.onCancel?.();
				},
			}),
		);
		if (didCancel) {
			break;
		}
	}
	return merged;
};

async function ask(context: PromptContext, question: PromptQuestion | PromptQuestion[]) {
	return context.prompt(question, { onCancel: context.onCancel });
}

async function promptFields<K extends WizardConfigKey>(
	context: PromptContext,
	initial: Pick<WizardConfig, K>,
	descriptors: readonly FieldDescriptor<K>[],
): Promise<Pick<WizardConfig, K>> {
	const values: Partial<WizardConfig> = {};
	for (const descriptor of descriptors) {
		const response = await ask(context, {
			...descriptor.question,
			name: descriptor.key,
			initial: initial[descriptor.key] as PromptQuestion["initial"],
		});
		const value = response[descriptor.key];
		values[descriptor.key] = descriptor.isValue(value) ? value : initial[descriptor.key];
	}
	return values as Pick<WizardConfig, K>;
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isNumber = (value: unknown): value is number => typeof value === "number" && !Number.isNaN(value);

async function promptGitSettings(
	context: PromptContext,
	initial: Pick<WizardConfig, "checkActiveBranches" | "remoteOperations" | "activeBranchDays" | "bypassGitHooks">,
) {
	const { checkActiveBranches } = await promptFields(context, { checkActiveBranches: initial.checkActiveBranches }, [
		{
			key: "checkActiveBranches",
			question: {
				type: "confirm",
				message: "Check task states across active branches?",
				hint: "Ensures accurate task tracking across branches (may impact performance on large repos)",
			},
			isValue: isBoolean,
		},
	]);
	const branchSettings = checkActiveBranches
		? await promptFields(
				context,
				{ remoteOperations: initial.remoteOperations, activeBranchDays: initial.activeBranchDays },
				[
					{
						key: "remoteOperations",
						question: {
							type: "confirm",
							message: "Check task states in remote branches?",
							hint: "Required for accessing tasks from feature branches on remote repos",
						},
						isValue: isBoolean,
					},
					{
						key: "activeBranchDays",
						question: {
							type: "number",
							message: "How many days should a branch be considered active?",
							hint: "Lower values improve performance (default: 30 days)",
							min: 1,
							max: 365,
						},
						isValue: isNumber,
					},
				],
			)
		: { remoteOperations: false, activeBranchDays: initial.activeBranchDays };
	const commitSettings = await promptFields(context, { bypassGitHooks: initial.bypassGitHooks }, [
		{
			key: "bypassGitHooks",
			question: {
				type: "confirm",
				message: "Bypass git hooks when committing?",
				hint: "Use --no-verify flag to skip pre-commit hooks",
			},
			isValue: isBoolean,
		},
	]);
	return { checkActiveBranches, ...branchSettings, ...commitSettings };
}

async function promptZeroPadding(context: PromptContext, initial: number | undefined): Promise<number | undefined> {
	while (true) {
		const enabled = await ask(context, {
			type: "confirm",
			name: "enableZeroPadding",
			message: "Enable zero-padded IDs for consistent formatting?",
			hint: "Example: task-001, doc-001 instead of task-1, doc-1",
			initial: (initial ?? 0) > 0,
		});
		if (!enabled.enableZeroPadding) {
			return undefined;
		}
		let goBack = false;
		const width = await context.prompt(
			{
				type: "number",
				name: "paddingWidth",
				message: "Number of digits for zero-padding:",
				hint: "e.g., 3 creates task-001; 4 creates task-0001",
				initial: initial ?? 3,
				min: 1,
				max: 10,
			},
			{
				onCancel: () => {
					goBack = true;
				},
			},
		);
		if (goBack) {
			continue;
		}
		if (isNumber(width.paddingWidth)) {
			return width.paddingWidth;
		}
	}
}

async function promptEditor(
	context: PromptContext,
	initial: string | undefined,
	isEditorAvailable: EditorAvailabilityChecker,
): Promise<string | undefined> {
	const response = await ask(context, {
		type: "text",
		name: "editor",
		message: "Default editor command (leave blank to use system default):",
		hint: "e.g., 'code --wait', 'vim', 'nano'",
		initial: initial ?? "",
	});
	let editor = String(response.editor ?? "").trim();
	if (editor && !(await isEditorAvailable(editor))) {
		console.warn(`Warning: Editor command '${editor}' not found in PATH`);
		const confirmed = await ask(context, {
			type: "confirm",
			name: "confirm",
			message: "Editor not found. Set it anyway?",
			initial: false,
		});
		if (!confirmed.confirm) {
			editor = "";
		}
	}
	return editor || undefined;
}

async function promptWebUISettings(
	context: PromptContext,
	initial: Pick<WizardConfig, "defaultPort" | "autoOpenBrowser">,
) {
	while (true) {
		const configure = await ask(context, {
			type: "confirm",
			name: "configureWebUI",
			message: "Configure web UI settings now?",
			hint: "Port and browser auto-open",
			initial: false,
		});
		if (!configure.configureWebUI) return initial;
		let goBack = false;
		const values = await context.prompt(
			[
				{
					type: "number",
					name: "defaultPort",
					message: "Default web UI port:",
					hint: "Port number for the web interface (1-65535)",
					initial: initial.defaultPort,
					min: 1,
					max: 65535,
				},
				{
					type: "confirm",
					name: "autoOpenBrowser",
					message: "Automatically open browser when starting web UI?",
					hint: "When enabled, 'agentic-workspace web' opens your browser",
					initial: initial.autoOpenBrowser,
				},
			],
			{
				onCancel: () => {
					goBack = true;
				},
			},
		);
		if (goBack) continue;
		return {
			defaultPort: isNumber(values.defaultPort) ? values.defaultPort : initial.defaultPort,
			autoOpenBrowser: isBoolean(values.autoOpenBrowser) ? values.autoOpenBrowser : initial.autoOpenBrowser,
		};
	}
}

function initialWizardConfig(config: AgenticWorkspaceConfig | null | undefined): WizardConfig {
	const configured = config ? { ...DEFAULT_INIT_CONFIG, ...config } : DEFAULT_INIT_CONFIG;
	return {
		checkActiveBranches: configured.checkActiveBranches,
		remoteOperations: configured.remoteOperations,
		activeBranchDays: configured.activeBranchDays,
		bypassGitHooks: configured.bypassGitHooks,
		zeroPaddedIds: configured.zeroPaddedIds,
		defaultEditor: configured.defaultEditor ?? process.env.EDITOR ?? process.env.VISUAL ?? resolveEditor(null),
		defaultPort: configured.defaultPort,
		autoOpenBrowser: configured.autoOpenBrowser,
	};
}

export async function runAdvancedConfigWizard({
	existingConfig,
	cancelMessage,
	promptImpl = clackPromptRunner,
	isEditorAvailable = checkEditorAvailability,
}: WizardOptions): Promise<AdvancedConfigWizardResult> {
	const initial = initialWizardConfig(existingConfig);
	const context: PromptContext = { prompt: promptImpl, onCancel: () => handlePromptCancel(cancelMessage) };
	const installShellCompletions = Boolean(
		(
			await ask(context, {
				type: "confirm",
				name: "installCompletions",
				message: "Install shell completions now?",
				hint: "Adds TAB completion support for AgenticWorkspace commands in your shell",
				initial: true,
			})
		).installCompletions,
	);
	const git = await promptGitSettings(context, initial);
	const zeroPaddedIds = await promptZeroPadding(context, initial.zeroPaddedIds);
	const defaultEditor = await promptEditor(context, initial.defaultEditor, isEditorAvailable);
	const webUI = await promptWebUISettings(context, {
		defaultPort: initial.defaultPort,
		autoOpenBrowser: initial.autoOpenBrowser,
	});
	return {
		config: { ...git, zeroPaddedIds, defaultEditor, ...webUI },
		installShellCompletions,
	};
}
