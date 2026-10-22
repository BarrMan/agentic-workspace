import { randomUUID } from "node:crypto";
import { resolveAgentConfiguration } from "../../controller/agent-configuration.ts";
import type { Core } from "../../controller/agentic-workspace.ts";
import { copyToClipboard } from "../../lib/clipboard.ts";
import { getPriorityLabels } from "../../model/task/priority-config.ts";
import { getTaskTypeValues } from "../../model/task/task-type-config.ts";
import type { AgenticWorkspaceConfig, Task } from "../../model/types.ts";
import { emptyGroupState, type GroupState, type GroupStore, type TaskGroup } from "../../storage/group-store.ts";
import type { BoardMoveCommit } from "./board/models/board.ts";
import { mountTaskForm, type TaskFormField } from "./controls.ts";
import type { mountOpenTuiGroupDeleteModal, OpenTuiGroupDeleteModalMount } from "./group-delete-modal.ts";
import { mountOpenTuiGroupModal, type OpenTuiGroupModalMount } from "./group-modal.ts";
import { collectDescendantGroupIds, findGroup, setCollapsed } from "./groups.ts";
import type { OpenTuiHost } from "./host.ts";
import { mountOpenTuiTaskComposer, type OpenTuiTaskComposerMount } from "./task-composer.ts";
import { runTaskLifecycleAction } from "./task-lifecycle.ts";
import { changedTaskFields, createWorkspaceDraft, type WorkspaceDraft } from "./workspace/model/drafts.ts";
import type { OpenTuiWorkspaceTaskAction } from "./workspace.ts";
import type { WorkspaceSessions } from "./workspace-sessions.ts";

type EditorField = "title" | "description" | "type" | "priority";
type EditorValues = Record<EditorField, string>;
type FormValues = EditorValues & { group: string };

function editorFields(
	draft: WorkspaceDraft,
	config: AgenticWorkspaceConfig | null,
	groupOptions: readonly { label: string; value: string }[],
	currentGroupId: string,
): readonly TaskFormField<EditorField | "group">[] {
	return [
		{ kind: "input", name: "title", label: "Title", value: draft.values.title },
		{ kind: "textarea", name: "description", label: "Description", value: draft.values.description, height: 4 },
		{
			kind: "select",
			name: "type",
			label: "Type",
			options: [{ label: "None", value: "" }, ...getTaskTypeValues(config).map((value) => ({ label: value, value }))],
			value: draft.values.type,
		},
		{
			kind: "select",
			name: "priority",
			label: "Priority",
			options: [
				{ label: "None", value: "" },
				...getPriorityLabels(config).map((priority) => ({ label: priority, value: priority })),
			],
			value: draft.values.priority,
		},
		{
			kind: "select",
			name: "group",
			label: "Group",
			options: [{ label: "Root (none)", value: "" }, ...groupOptions],
			value: currentGroupId,
		},
	];
}

/** Owns complete task edits/actions and group organization; selection stays with navigation. */
export class WorkspaceTaskActions {
	#closed = false;
	#loading = false;
	#composer: OpenTuiTaskComposerMount | undefined;
	#editor: { dispose(): void } | undefined;
	#groupModal: OpenTuiGroupModalMount | undefined;
	#groupDelete: OpenTuiGroupDeleteModalMount | undefined;

	constructor(
		private readonly core: Core,
		private readonly host: OpenTuiHost,
		private readonly store: GroupStore | undefined,
		private readonly sessions: WorkspaceSessions,
		private readonly mountGroupDelete: typeof mountOpenTuiGroupDeleteModal,
		private readonly operations: {
			blocked(): boolean;
			refresh(): Promise<void>;
			notice(message: string): void;
			confirm(title: string, message: string): Promise<boolean>;
			created(task: Task): Promise<void>;
			removed(taskId: string): void;
			groupRemoved(groupId: string): void;
		},
	) {}

	get busy(): boolean {
		return !!(this.#loading || this.#composer || this.#editor || this.#groupModal || this.#groupDelete);
	}

	get organization(): GroupState {
		return this.store?.current ?? emptyGroupState();
	}

	async toggleGroup(groupId: string, direction: "expand" | "collapse"): Promise<void> {
		const group = findGroup(this.organization.groups, groupId);
		if (!this.store || !group || this.#closed) return;
		try {
			const descendants = collectDescendantGroupIds(this.organization.groups, groupId);
			const expand = direction === "expand";
			const alreadyAtTarget = expand ? !group.collapsed : group.collapsed;
			const ids = alreadyAtTarget ? [groupId, ...descendants] : [groupId];
			await this.store.update((state) => ({ ...state, groups: setCollapsed(state.groups, ids, !expand) }));
			void this.operations.refresh();
		} catch (error) {
			this.#groupError(error);
		}
	}

	#groupError(error: unknown): void {
		this.operations.notice(error instanceof Error ? error.message : String(error));
		void this.operations.refresh().catch(() => undefined);
	}

	async deleteGroup(groupId: string): Promise<void> {
		const group = findGroup(this.organization.groups, groupId);
		const store = this.store;
		if (!group || this.#closed || !store) return;
		try {
			const directTaskIds = Object.entries(this.organization.membership)
				.filter(([, membershipGroupId]) => membershipGroupId === groupId)
				.map(([taskId]) => taskId);
			const directChildIds = new Set(
				this.organization.groups.filter((candidate) => candidate.parentId === groupId).map((candidate) => candidate.id),
			);
			const removeGroup = async (destinationGroupId: string | null): Promise<void> => {
				await store.update((state) => {
					const membership = { ...state.membership };
					for (const taskId of directTaskIds) {
						if (destinationGroupId === null) delete membership[taskId];
						else membership[taskId] = destinationGroupId;
					}
					return {
						...state,
						membership,
						groups: state.groups
							.filter((candidate) => candidate.id !== groupId)
							.map((candidate) =>
								directChildIds.has(candidate.id) ? { ...candidate, parentId: destinationGroupId } : candidate,
							),
					};
				});
				this.operations.groupRemoved(groupId);
				this.operations.notice(`Deleted group ${group.name}`);
				void this.operations.refresh();
			};
			if (directTaskIds.length === 0 && directChildIds.size === 0) {
				const confirmed = await this.operations.confirm(
					"Delete group",
					`Permanently delete group ${group.name}?\nThis cannot be undone.`,
				);
				if (confirmed && !this.#closed) await removeGroup(null);
				return;
			}
			const descendants = new Set(collectDescendantGroupIds(this.organization.groups, groupId));
			const destinationOptions = this.#groupOptions().filter(
				(option) => option.value !== groupId && !descendants.has(option.value),
			);
			const modal = this.mountGroupDelete(this.host.renderer, this.host.root, {
				groupId,
				groupName: group.name,
				taskCount: directTaskIds.length,
				childGroupCount: directChildIds.size,
				destinationOptions,
				defaultDestinationId: group.parentId,
				onConfirm: async (destinationGroupId) => {
					await removeGroup(destinationGroupId);
					if (this.#groupDelete === modal) this.#groupDelete = undefined;
					void this.operations.refresh();
				},
				onCancel: () => {
					if (this.#groupDelete === modal) this.#groupDelete = undefined;
					void this.operations.refresh();
				},
			});
			this.#groupDelete = modal;
		} catch (error) {
			this.#groupError(error);
		}
	}

	#parentContext(taskId?: string, selectedGroupId?: string): TaskGroup | null {
		if (selectedGroupId) {
			const selected = findGroup(this.organization.groups, selectedGroupId);
			if (selected) return selected;
		}
		const groupId = taskId ? this.organization.membership[taskId] : undefined;
		return (groupId ? findGroup(this.organization.groups, groupId) : undefined) ?? null;
	}

	openGroupComposer(taskId?: string, selectedGroupId?: string): void {
		const store = this.store;
		if (!store || this.#closed || this.operations.blocked()) return;
		const parent = this.#parentContext(taskId, selectedGroupId);
		const modal = mountOpenTuiGroupModal(this.host.renderer, this.host.root, {
			defaultRoot: parent === null,
			parentGroupId: parent?.id ?? null,
			parentGroupName: parent?.name,
			onCreate: async ({ name, parentGroupId }) => {
				const order = this.organization.groups.filter((group) => group.parentId === parentGroupId).length;
				await store.update((state) => ({
					...state,
					groups: [
						...state.groups,
						{ id: `grp-${randomUUID().slice(0, 8)}`, name, parentId: parentGroupId, order, collapsed: false },
					],
				}));
				if (this.#groupModal === modal) this.#groupModal = undefined;
				this.operations.notice(`Created group ${name}`);
				void this.operations.refresh();
			},
			onCancel: () => {
				if (this.#groupModal === modal) this.#groupModal = undefined;
				void this.operations.refresh();
			},
		});
		this.#groupModal = modal;
	}

	async openComposer(config: AgenticWorkspaceConfig | null, taskId?: string, selectedGroupId?: string): Promise<void> {
		if (this.#closed || this.operations.blocked()) return;
		this.#loading = true;
		try {
			const resolved = await resolveAgentConfiguration(this.core);
			if (this.#closed) return;
			const parent = this.#parentContext(taskId, selectedGroupId);
			let committedTask: Task | undefined;
			const composer = mountOpenTuiTaskComposer(this.host.renderer, this.host.root, {
				statuses: config?.statuses ?? [],
				types: config?.types,
				priorities: config?.priorities,
				agentConfiguration: resolved.config,
				defaultGroupId: parent?.id ?? null,
				defaultGroupName: parent?.name,
				persist: async (input, { groupId }) => {
					try {
						if (committedTask) {
							committedTask = await this.core.updateTaskFromInput(committedTask.id, {
								...input,
								description: input.description ?? "",
								type: input.type ?? "",
								priority: input.priority ?? "",
								agentConfiguration: input.agentConfiguration ?? null,
							});
						} else {
							committedTask = (await this.core.createTaskFromInput(input)).task;
						}
						if (groupId || this.organization.membership[committedTask.id])
							await this.#setTaskGroup(committedTask.id, groupId);
						await this.operations.created(committedTask);
						this.operations.notice(`Created ${committedTask.id}`);
						return committedTask;
					} catch (cause) {
						const detail = cause instanceof Error ? cause.message : String(cause);
						const message = committedTask
							? `Task ${committedTask.id} was created, but saving its remaining changes is incomplete: ${detail}`
							: `Could not create task: ${detail}`;
						this.operations.notice(message);
						throw new Error(message, { cause });
					}
				},
			});
			this.#composer = composer;
			void composer.result.then(() => {
				if (this.#composer === composer) this.#composer = undefined;
				void this.operations.refresh();
			});
		} catch (error) {
			this.operations.notice(`Could not open task composer: ${String(error)}`);
		} finally {
			this.#loading = false;
			if (!this.#closed && !this.#composer) void this.operations.refresh();
		}
	}

	#openEditor(task: Task | undefined, config: AgenticWorkspaceConfig | null): void {
		if (!task || this.#closed || this.operations.blocked()) return;
		const draft = createWorkspaceDraft(task);
		const editor = mountTaskForm(this.host.renderer, this.host.root, {
			title: `Edit ${task.id}`,
			fields: editorFields(draft, config, this.#groupOptions(), this.organization.membership[task.id] ?? ""),
			submitLabel: "save",
			onSubmit: async (values: FormValues) => {
				const { group, ...textValues } = values;
				await this.#saveTaskFields(task.id, draft, textValues);
				try {
					await this.#setTaskGroup(task.id, group || null);
				} catch (cause) {
					const message = `Task fields for ${task.id} are saved, but group changes are incomplete: ${cause instanceof Error ? cause.message : String(cause)}`;
					this.operations.notice(message);
					throw new Error(message, { cause });
				}
				if (this.#editor === editor) this.#editor = undefined;
				void this.operations.refresh();
			},
			onCancel: () => {
				if (this.#editor === editor) this.#editor = undefined;
				void this.operations.refresh();
			},
		});
		this.#editor = editor;
	}

	async #saveTaskFields(taskId: string, draft: WorkspaceDraft, values: EditorValues): Promise<void> {
		try {
			const latest = await this.core.getTask(taskId);
			if (!latest) throw new Error(`Task ${taskId} no longer exists.`);
			const submitted: WorkspaceDraft = { ...draft, values: { ...draft.values, ...values } };
			const changes = changedTaskFields(submitted, latest);
			if (Object.keys(changes).length === 0) {
				this.operations.notice("No task fields changed.");
				return;
			}
			const committed = await this.core.updateTaskFromInput(taskId, changes, {});
			const committedValues = createWorkspaceDraft(committed).values;
			for (const field of Object.keys(changes) as EditorField[]) {
				draft.baseline[field] = committedValues[field];
				draft.values[field] = committedValues[field];
			}
			this.operations.notice(`Saved ${taskId}`);
		} catch (error) {
			this.operations.notice(`Could not save task: ${error instanceof Error ? error.message : "Unknown error"}`);
			throw error;
		} finally {
			void this.operations.refresh();
		}
	}

	async #setTaskGroup(taskId: string, groupId: string | null): Promise<void> {
		await this.store?.update((state) => {
			if (groupId === null) {
				if (!(taskId in state.membership)) return state;
				const { [taskId]: _removed, ...membership } = state.membership;
				return { ...state, membership };
			}
			if (state.membership[taskId] === groupId) return state;
			return { ...state, membership: { ...state.membership, [taskId]: groupId } };
		});
	}

	#groupOptions(): { label: string; value: string }[] {
		const children = new Map<string, TaskGroup[]>();
		const roots: TaskGroup[] = [];
		for (const group of this.organization.groups) {
			const parent = group.parentId === null ? undefined : findGroup(this.organization.groups, group.parentId);
			if (!parent) {
				roots.push(group);
				continue;
			}
			const siblings = children.get(parent.id);
			if (siblings) siblings.push(group);
			else children.set(parent.id, [group]);
		}
		const compare = (a: TaskGroup, b: TaskGroup): number =>
			a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
		const options: { label: string; value: string }[] = [];
		const seen = new Set<string>();
		const visit = (group: TaskGroup, depth: number): void => {
			if (seen.has(group.id)) return;
			seen.add(group.id);
			options.push({ label: `${"  ".repeat(depth)}${group.name}`, value: group.id });
			for (const child of [...(children.get(group.id) ?? [])].sort(compare)) visit(child, depth + 1);
		};
		for (const root of roots.sort(compare)) visit(root, 0);
		return options;
	}

	async act(
		taskId: string,
		action: OpenTuiWorkspaceTaskAction,
		editTask: Task | undefined,
		config: AgenticWorkspaceConfig | null,
	): Promise<void> {
		if (action === "edit") return this.#openEditor(editTask, config);
		try {
			const task = await this.core.getTask(taskId);
			if (!task) {
				this.operations.notice(`Task ${taskId} no longer exists.`);
				return;
			}
			if (action === "copy") {
				this.operations.notice((await copyToClipboard(task.id)) ? `Copied ${task.id}` : `Could not copy ${task.id}`);
				return;
			}
			if (action === "done") {
				const result = await this.core.markTaskDone(task.id);
				this.operations.notice(
					result.changed ? `Moved ${task.id} to ${result.task.status}` : `Task ${task.id} is already done.`,
				);
				return;
			}
			if (action === "delete") {
				this.operations.notice(await this.#deleteTask(task));
				return;
			}
			this.operations.notice((await runTaskLifecycleAction(this.core, task, action)).message);
		} catch (error) {
			this.operations.notice(
				`Could not ${action} ${taskId}: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			void this.operations.refresh();
		}
	}

	async #deleteTask(task: Task): Promise<string> {
		const confirmed = await this.operations.confirm(
			"Delete task",
			`Permanently delete ${task.id} - ${task.title}?\nThis cannot be undone.`,
		);
		if (!confirmed) return "Delete cancelled";
		const result = await this.sessions.deleteTask(task.id);
		if (!result.success) return `Could not delete ${task.id}`;
		if (result.cleanupError)
			return `Task ${task.id} was deleted, but workspace cleanup is incomplete: ${result.cleanupError instanceof Error ? result.cleanupError.message : String(result.cleanupError)}`;
		try {
			await this.#setTaskGroup(task.id, null);
		} catch (error) {
			return `Task ${task.id} was deleted, but group cleanup is incomplete: ${error instanceof Error ? error.message : String(error)}`;
		}
		this.operations.removed(task.id);
		return `Deleted ${task.id}`;
	}

	async move(commit: BoardMoveCommit): Promise<void> {
		try {
			if (commit.kind === "move") {
				const result = await this.core.moveTasksToStatus({
					taskIds: commit.taskIds,
					targetStatus: commit.targetStatus,
					orderedTaskIds: commit.orderedTaskIds,
				});
				this.operations.notice(
					result.failures.length
						? `Moved ${result.movedTasks.length} task(s); ${result.failures.length} failed`
						: `Moved ${result.movedTasks.length} task(s) to ${commit.targetStatus}`,
				);
				return;
			}
			await this.core.reorderTask({
				taskId: commit.taskIds[0] ?? "",
				targetStatus: commit.targetStatus,
				orderedTaskIds: commit.orderedTaskIds,
			});
			this.operations.notice(`Reordered task in ${commit.targetStatus}`);
		} catch (error) {
			this.operations.notice(`Could not move task: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			void this.operations.refresh();
		}
	}

	dispose(): void {
		this.#closed = true;
		this.#composer?.dispose();
		this.#composer = undefined;
		this.#editor?.dispose();
		this.#editor = undefined;
		this.#groupModal?.dispose();
		this.#groupModal = undefined;
		this.#groupDelete?.dispose();
		this.#groupDelete = undefined;
	}
}
