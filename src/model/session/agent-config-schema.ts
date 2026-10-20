import { z } from "zod";
import { isModeTextColor } from "./mode-colors.ts";
import { AGENT_BOOTSTRAP_TYPES, type AgentConfiguration, type ModeCatalog, type ModeProfile } from "./types.ts";

const SAFE_PRESET_NAME = /^(?!__proto__$|prototype$|constructor$)[A-Za-z_][A-Za-z0-9_-]*$/;
const POSIX_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_MODE_ID = /^(?!__proto__$|prototype$|constructor$)[a-z][a-z0-9-]*$/;
const NO_NUL = (value: string): boolean => !value.includes("\0");

export const agentCommandArgvSchema = z
	.array(z.string().refine(NO_NUL, "arguments must not contain NUL bytes."))
	.min(1, "command must contain an executable.")
	.refine((argv) => !!argv[0]?.trim(), "command must contain a non-empty executable.");

/** Task-container relative names only; internal files and task records are not artifacts. */
export function validateArtifactPath(path: string): string {
	if (
		!path ||
		path.includes("\0") ||
		path.includes("\\") ||
		path.startsWith("/") ||
		/^[A-Za-z]:/.test(path) ||
		path.split("/").some((part) => !part || part === "." || part === "..") ||
		path === "task.md" ||
		path === ".artifacts.json"
	)
		throw new Error(`Invalid task artifact path: ${path}`);
	return path;
}

const envSchema = z
	.unknown()
	.superRefine((value, ctx) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			ctx.addIssue({ code: "custom", message: "env must be an object of strings." });
			return;
		}
		for (const [key, envValue] of Object.entries(value)) {
			if (!POSIX_ENV_NAME.test(key) || typeof envValue !== "string" || !NO_NUL(envValue)) {
				ctx.addIssue({ code: "custom", message: "env must be an object of strings.", path: [key] });
			}
		}
	})
	.transform((value) => value as Record<string, string>);

const presetSchema = z
	.looseObject(
		{
			command: agentCommandArgvSchema,
			env: envSchema,
			prepare: z.string({ error: "prepare must be a string." }).refine(NO_NUL, "prepare must be a string."),
			bootstrap: z.enum(AGENT_BOOTSTRAP_TYPES, {
				error: "bootstrap is invalid; set it to a supported bootstrap value.",
			}),
			resumeFlag: z
				.string({ error: "resumeFlag must be a non-empty string without NUL bytes." })
				.refine(
					(value) => value.trim().length > 0 && NO_NUL(value),
					"resumeFlag must be a non-empty string without NUL bytes.",
				)
				.optional(),
		},
		{ error: "presets entries must be named objects." },
	)
	.superRefine((value, ctx) => {
		if (Object.hasOwn(value, "worktree")) {
			ctx.addIssue({
				code: "custom",
				message: "worktree is retired; remove this unsupported field from the preset.",
				path: ["worktree"],
			});
		}
	});

const sessionSettingsSchema = z.looseObject(
	{
		worktreePerTask: z.boolean({ error: "must be a boolean." }),
		yoloMode: z.boolean({ error: "must be a boolean." }),
		autoResumeOnRestart: z.boolean({ error: "must be a boolean." }).optional(),
	},
	{ error: "sessions must be an object." },
);

const ModeCatalogSchema = z
	.unknown()
	.superRefine((value, ctx) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			ctx.addIssue({ code: "custom", message: "must be an object." });
			return;
		}
		const catalog = value as Partial<ModeCatalog>;
		if (
			catalog.version !== 1 ||
			typeof catalog.defaultModeId !== "string" ||
			!catalog.profiles ||
			typeof catalog.profiles !== "object" ||
			Array.isArray(catalog.profiles)
		) {
			ctx.addIssue({ code: "custom", message: "has an invalid version or profiles." });
			return;
		}
		const ids = Object.keys(catalog.profiles);
		if (
			!ids.length ||
			!Array.isArray(catalog.order) ||
			catalog.order.length !== ids.length ||
			new Set(catalog.order).size !== ids.length ||
			ids.some((id) => !SAFE_MODE_ID.test(id) || !catalog.order?.includes(id)) ||
			!catalog.profiles[catalog.defaultModeId]
		) {
			ctx.addIssue({
				code: "custom",
				message: "must have unique ordered profiles and a valid defaultModeId.",
			});
			return;
		}
		for (const [id, raw] of Object.entries(catalog.profiles)) {
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
				ctx.addIssue({ code: "custom", message: "must be an object.", path: ["profiles", id] });
				continue;
			}
			const profile = raw as ModeProfile;
			if (profile.textColor !== undefined && !isModeTextColor(profile.textColor)) {
				ctx.addIssue({
					code: "custom",
					message: "must be a supported lowercase named color.",
					path: ["profiles", id, "textColor"],
				});
			}
			if (
				typeof profile.name !== "string" ||
				!profile.name.trim() ||
				typeof profile.prompt !== "string" ||
				!profile.model ||
				!["default", "explicit"].includes(profile.model.kind) ||
				(profile.model.kind === "explicit" && typeof profile.model.id !== "string")
			) {
				ctx.addIssue({
					code: "custom",
					message: "has invalid name, prompt, or model.",
					path: ["profiles", id],
				});
			}
			const permissions = profile.permissions;
			if (
				!permissions ||
				!["none", "read", "read-write"].includes(permissions.repository) ||
				!["read", "read-write"].includes(permissions.task) ||
				!["read", "read-write"].includes(permissions.artifacts) ||
				!["allowed", "disabled"].includes(permissions.subagents) ||
				!Array.isArray(profile.artifacts)
			) {
				ctx.addIssue({
					code: "custom",
					message: "has invalid permissions or artifacts.",
					path: ["profiles", id],
				});
				continue;
			}
			for (const [index, artifact] of profile.artifacts.entries()) {
				if (!artifact || typeof artifact.purpose !== "string") {
					ctx.addIssue({
						code: "custom",
						message: "has an invalid artifact declaration.",
						path: ["profiles", id, "artifacts", index],
					});
					continue;
				}
				try {
					validateArtifactPath(artifact.path);
				} catch (error) {
					ctx.addIssue({
						code: "custom",
						message: (error as Error).message,
						path: ["profiles", id, "artifacts", index, "path"],
					});
				}
			}
			if (profile.approvalArtifact !== undefined) {
				try {
					validateArtifactPath(profile.approvalArtifact);
				} catch (error) {
					ctx.addIssue({
						code: "custom",
						message: (error as Error).message,
						path: ["profiles", id, "approvalArtifact"],
					});
				}
			}
		}
	})
	.transform((value) => value as ModeCatalog);

export const AgentConfigurationSchema = z
	.looseObject(
		{
			selectedPreset: z
				.string({ error: "must be a non-empty string." })
				.regex(SAFE_PRESET_NAME, "must be a non-empty string."),
			presets: z.record(z.string().regex(SAFE_PRESET_NAME, "presets entries must be named objects."), presetSchema, {
				error: "presets must be an object.",
			}),
			sessions: sessionSettingsSchema.optional(),
			modes: ModeCatalogSchema.optional(),
		},
		{ error: "must be an object." },
	)
	.superRefine((config, ctx) => {
		if (!Object.hasOwn(config.presets, config.selectedPreset)) {
			ctx.addIssue({
				code: "custom",
				message: "must name a configured preset.",
				path: ["selectedPreset"],
			});
		}
	});

function issueMessage(label: string, path: PropertyKey[], message: string): Error {
	const suffix = path.map(String).join(".");
	return new Error(`${label}${suffix ? `.${suffix}` : ""} ${message}`);
}

export function assertAgentConfiguration(
	value: unknown,
	label = "Agent configuration",
): asserts value is AgentConfiguration {
	const result = AgentConfigurationSchema.safeParse(value);
	if (!result.success)
		throw issueMessage(label, result.error.issues[0]?.path ?? [], result.error.issues[0]?.message ?? "is invalid.");
}

export function assertModeCatalog(value: unknown, label: string): asserts value is ModeCatalog {
	const result = ModeCatalogSchema.safeParse(value);
	if (!result.success)
		throw issueMessage(label, result.error.issues[0]?.path ?? [], result.error.issues[0]?.message ?? "is invalid.");
}
