#!/usr/bin/env bash
set -euo pipefail

shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CLI_PATH="${AGENTIC_WORKSPACE_SMOKE_CLI:-${REPO_ROOT}/src/cli/index.ts}"
BUN_BIN="${BUN_BIN:-bun}"
JOB_COUNT="${JOB_COUNT:-8}"
KEEP_TEMP="${KEEP_TEMP:-0}"
JOB_TIMEOUT_SECONDS="${JOB_TIMEOUT_SECONDS:-60}"
TMP_ROOT=""

PIDS=()
LABELS=()
OUTFILES=()

usage() {
	cat <<EOF
Usage: $(basename "$0") [--jobs N] [--keep-temp]

Runs real parallel smoke tests against the local AgenticWorkspace CLI:
  1. concurrent task creation
  2. concurrent edits to separate task fields

Environment overrides:
  BUN_BIN            Bun executable to use (default: bun)
  AGENTIC_WORKSPACE_SMOKE_CLI  Path to local CLI entrypoint (default: <repo>/src/cli/index.ts)
  JOB_COUNT          Number of concurrent creates for scenario 1 (default: 8)
  JOB_TIMEOUT_SECONDS  Maximum time to wait for each child CLI process (default: 60)
  KEEP_TEMP          Keep temp repos after success (default: 0)
EOF
}

info() {
	printf '[smoke] %s\n' "$*"
}

fail() {
	printf '[smoke] ERROR: %s\n' "$*" >&2
	exit 1
}

cleanup() {
	local exit_code=$?
	settle_jobs
	if [[ "${KEEP_TEMP}" == "1" && -n "${TMP_ROOT}" && -d "${TMP_ROOT}" ]]; then
		info "Temp data kept at: ${TMP_ROOT}"
	elif [[ -n "${TMP_ROOT}" && -d "${TMP_ROOT}" ]]; then
		rm -rf "${TMP_ROOT}" || printf '[smoke] ERROR: Failed to remove temp root: %s\n' "${TMP_ROOT}" >&2
	fi
	return "${exit_code}"
}
trap cleanup EXIT

create_fixture() {
	env -u AGENTIC_WORKSPACE_CWD -u AGENTIC_WORKSPACE_WORKSPACE_CONTEXT -u AGENTIC_WORKSPACE_TASK_ID -u AGENTIC_WORKSPACE_TMUX_SOCKET \
		AGENTIC_WORKSPACE_SOURCE="${REPO_ROOT}" SEED_TASK="${1:-0}" INIT_PROJECT="${2:-1}" HOME="${PWD}/.home" USERPROFILE="${PWD}/.home" XDG_CONFIG_HOME="${PWD}/.config" \
		"${BUN_BIN}" -e '
			const { Core } = await import(`${process.env.AGENTIC_WORKSPACE_SOURCE}/src/index.ts`);
			const { initializeProject } = await import(`${process.env.AGENTIC_WORKSPACE_SOURCE}/src/controller/init.ts`);
			const core = new Core(process.cwd());
			if (process.env.INIT_PROJECT === "1") await initializeProject(core, { projectName: "Parallel Lock Smoke" });
			if (process.env.SEED_TASK === "1") await core.createTask({
				id: "task-1", title: "Shared Task", status: "To Do", createdDate: "2026-01-01",
				labels: [], dependencies: [], description: "Shared task fixture",
			});
		'
}

set_check_active_branches_false() {
	local config_path=$1
	if [[ -f "${config_path}" ]]; then
		perl -0pi -e 's/checkActiveBranches:\s*true/checkActiveBranches: false/g' "${config_path}"
	fi
}

init_repo() {
	local repo_dir=$1
	mkdir -p "${repo_dir}"
	mkdir -p "${repo_dir}/.home"
	mkdir -p "${repo_dir}/.config"
	pushd "${repo_dir}" >/dev/null
	git init -q
	git config user.name "AgenticWorkspace Smoke Test"
	git config user.email "smoke@example.com"
	create_fixture >/dev/null
	set_check_active_branches_false "${repo_dir}/.agentic-workspace/config.yml"
	popd >/dev/null
}

start_job() {
	local repo_dir=$1
	local label=$2
	shift 2

	local outfile="${repo_dir}/${label}.out"
	(
		cd "${repo_dir}"
		exec env -u AGENTIC_WORKSPACE_CWD -u AGENTIC_WORKSPACE_WORKSPACE_CONTEXT -u AGENTIC_WORKSPACE_TASK_ID -u AGENTIC_WORKSPACE_TMUX_SOCKET HOME="${repo_dir}/.home" USERPROFILE="${repo_dir}/.home" XDG_CONFIG_HOME="${repo_dir}/.config" "${BUN_BIN}" "${CLI_PATH}" "$@"
	) >"${outfile}" 2>&1 &

	PIDS+=("$!")
	LABELS+=("${label}")
	OUTFILES+=("${outfile}")
}

reset_jobs() {
	PIDS=()
	LABELS=()
	OUTFILES=()
}

job_is_running() {
	local pid=$1
	local running_pids
	local running_pid
	running_pids="$(jobs -pr)"
	for running_pid in ${running_pids}; do
		if [[ "${running_pid}" == "${pid}" ]]; then
			return 0
		fi
	done
	return 1
}

settle_jobs() {
	local i
	local pid
	for ((i = 0; i < ${#PIDS[@]}; i += 1)); do
		pid=${PIDS[$i]}
		[[ -n "${pid}" ]] || continue
		if job_is_running "${pid}"; then
			kill -KILL "${pid}" 2>/dev/null || true
		fi
		wait "${pid}" 2>/dev/null || true
		PIDS[$i]=""
	done
	reset_jobs
}

wait_job() {
	local pid=$1
	local deadline=$((SECONDS + JOB_TIMEOUT_SECONDS))
	while job_is_running "${pid}"; do
		if (( SECONDS >= deadline )); then
			job_is_running "${pid}" && kill -KILL "${pid}" 2>/dev/null || true
			wait "${pid}" 2>/dev/null || true
			return 124
		fi
		sleep 0.1
	done
	wait "${pid}"
}

wait_for_jobs() {
	local i
	local failed=0
	local status=0

	for ((i = 0; i < ${#PIDS[@]}; i += 1)); do
		if wait_job "${PIDS[$i]}"; then
			status=0
		else
			status=$?
		fi
		PIDS[$i]=""
		if [[ ${status} -ne 0 ]]; then
			printf '[smoke] Job failed: %s (exit %s)\n' "${LABELS[$i]}" "${status}" >&2
			printf '%s\n' "----- ${OUTFILES[$i]} -----" >&2
			cat "${OUTFILES[$i]}" >&2 || true
			failed=1
		fi
	done

	if [[ ${failed} -ne 0 ]]; then
		fail "One or more parallel jobs failed."
	fi

	reset_jobs
}

assert_sequential_ids() {
	local target_dir=$1
	local prefix=$2
	local expected_count=$3

	local files=("${target_dir}"/"${prefix}"-*/task.md)
	local actual_count=${#files[@]}
	if [[ ${actual_count} -ne ${expected_count} ]]; then
		printf '[smoke] Expected %s files in %s but found %s\n' "${expected_count}" "${target_dir}" "${actual_count}" >&2
		ls -la "${target_dir}" >&2 || true
		fail "Unexpected file count in ${target_dir}"
	fi

	local ids=""
	local file
	local base
	local id
	for file in "${files[@]}"; do
		base="$(basename "$(dirname "${file}")")"
		id="${base}"
		ids+="${id}"$'\n'
	done

	local unique_count
	unique_count="$(printf '%s' "${ids}" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')"
	if [[ "${unique_count}" -ne "${expected_count}" ]]; then
		printf '[smoke] Duplicate IDs detected in %s:\n%s' "${target_dir}" "${ids}" >&2
		fail "Expected unique IDs in ${target_dir}"
	fi

	local n
	for n in $(seq 1 "${expected_count}"); do
		if ! printf '%s' "${ids}" | grep -qx "${prefix}-${n}"; then
			printf '[smoke] Missing expected ID %s-%s in %s:\n%s' "${prefix}" "${n}" "${target_dir}" "${ids}" >&2
			fail "Unexpected ID sequence in ${target_dir}"
		fi
	done
}

scenario_parallel_create() {
	local repo_dir="${TMP_ROOT}/create"
	local i

	info "Scenario 1: concurrent task creation (${JOB_COUNT} jobs)"
	init_repo "${repo_dir}"

	for i in $(seq 1 "${JOB_COUNT}"); do
		start_job "${repo_dir}" "create-${i}" task create "Parallel Task ${i}"
	done
	wait_for_jobs

	assert_sequential_ids "${repo_dir}/.agentic-workspace/tasks" "task" "${JOB_COUNT}"
	info "Scenario 1 passed"
}

scenario_parallel_edit() {
	local repo_dir="${TMP_ROOT}/edit"
	local shared_id="task-1"
	local i
	local title_winners=""
	local description_winners=""
	local title_losers=""
	local description_losers=""

	info "Scenario 2: concurrent task editing (${JOB_COUNT} jobs)"
	init_repo "${repo_dir}"

	pushd "${repo_dir}" >/dev/null
	create_fixture 1 0 >/dev/null
	popd >/dev/null

	for i in $(seq 1 "${JOB_COUNT}"); do
		if (( i % 2 == 0 )); then
			start_job "${repo_dir}" "edit-title-${i}" task edit "${shared_id}" --title "Parallel Title ${i}"
		else
			start_job "${repo_dir}" "edit-description-${i}" task edit "${shared_id}" --description "Parallel Description ${i}"
		fi
	done

	# Contention is expected here, so jobs are classified instead of required to succeed:
	# a losing edit must fail loudly rather than silently overwrite the winner.
	local winners=""
	local status
	for ((i = 0; i < ${#PIDS[@]}; i += 1)); do
		status=0
		wait_job "${PIDS[$i]}" || status=$?
		PIDS[$i]=""
		if [[ ${status} -eq 0 ]]; then
			case "${LABELS[$i]}" in
				edit-title-*) title_winners+="${LABELS[$i]#edit-title-}"$'\n' ;;
				edit-description-*) description_winners+="${LABELS[$i]#edit-description-}"$'\n' ;;
			esac
		elif ! grep -q "is being modified by another process" "${OUTFILES[$i]}"; then
			printf '[smoke] Job %s failed without the contention message (exit %s)\n' "${LABELS[$i]}" "${status}" >&2
			printf '%s\n' "----- ${OUTFILES[$i]} -----" >&2
			cat "${OUTFILES[$i]}" >&2 || true
			fail "A losing parallel edit must fail with a clear contention message"
		else
			case "${LABELS[$i]}" in
				edit-title-*) title_losers+="${LABELS[$i]#edit-title-}"$'\n' ;;
				edit-description-*) description_losers+="${LABELS[$i]#edit-description-}"$'\n' ;;
			esac
		fi
	done
	reset_jobs

	if [[ -z "${title_winners}${description_winners}" ]]; then
		fail "Every parallel edit failed; at least one must succeed"
	fi

	local task_files=("${repo_dir}"/.agentic-workspace/tasks/${shared_id}/task.md)
	if [[ ${#task_files[@]} -ne 1 ]]; then
		ls -la "${repo_dir}/.agentic-workspace/tasks" >&2 || true
		fail "Expected exactly one ${shared_id} file after parallel edits"
	fi
	if ! (cd "${repo_dir}" && env -u AGENTIC_WORKSPACE_CWD -u AGENTIC_WORKSPACE_WORKSPACE_CONTEXT -u AGENTIC_WORKSPACE_TASK_ID -u AGENTIC_WORKSPACE_TMUX_SOCKET HOME="${repo_dir}/.home" USERPROFILE="${repo_dir}/.home" XDG_CONFIG_HOME="${repo_dir}/.config" "${BUN_BIN}" "${CLI_PATH}" task view "${shared_id}" --plain >/dev/null); then
		fail "Task is not a valid readable record after parallel edits"
	fi

	# The final value for each field must come from a successful writer. Successful writes to
	# the other field must remain intact; this does not detect lost updates within one field.
	local content
	content="$(cat "${task_files[0]}")"
	local found=0
	if [[ -n "${title_winners}" ]]; then
		while IFS= read -r i; do
			[[ -n "${i}" ]] || continue
			if printf '%s' "${content}" | grep -Fq "Parallel Title ${i}"; then found=1; fi
		done <<<"${title_winners}"
		(( found == 1 )) || fail "Final title is not from a successful title edit"
	else
		printf '%s' "${content}" | grep -Fq "title: Shared Task" || fail "Title changed despite no successful title edit"
	fi
	while IFS= read -r i; do
		[[ -n "${i}" ]] || continue
		if printf '%s' "${content}" | grep -Fq "Parallel Title ${i}"; then
			fail "Failed title edit ${i} was applied"
		fi
	done <<<"${title_losers}"

	found=0
	if [[ -n "${description_winners}" ]]; then
		while IFS= read -r i; do
			[[ -n "${i}" ]] || continue
			if printf '%s' "${content}" | grep -Fq "Parallel Description ${i}"; then found=1; fi
		done <<<"${description_winners}"
		(( found == 1 )) || fail "Final description is not from a successful description edit"
	else
		printf '%s' "${content}" | grep -Fq "Shared task fixture" || fail "Description changed despite no successful description edit"
	fi
	while IFS= read -r i; do
		[[ -n "${i}" ]] || continue
		if printf '%s' "${content}" | grep -Fq "Parallel Description ${i}"; then
			fail "Failed description edit ${i} was applied"
		fi
	done <<<"${description_losers}"

	info "Scenario 2 passed (${JOB_COUNT} jobs; separate-field updates preserved)"
}

main() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--jobs)
				JOB_COUNT=$2
				shift 2
				;;
			--keep-temp)
				KEEP_TEMP=1
				shift
				;;
			-h|--help)
				usage
				exit 0
				;;
			*)
				usage >&2
				fail "Unknown argument: $1"
				;;
		esac
	done

	if ! command -v "${BUN_BIN}" >/dev/null 2>&1; then
		fail "Bun executable not found: ${BUN_BIN}"
	fi

	if [[ ! -f "${CLI_PATH}" ]]; then
		fail "Local CLI entrypoint not found: ${CLI_PATH}"
	fi

	case "${JOB_COUNT}" in
		''|*[!0-9]*)
			fail "JOB_COUNT must be a positive integer"
			;;
	esac

	if [[ "${JOB_COUNT}" -lt 2 ]]; then
		fail "JOB_COUNT must be at least 2"
	fi
	case "${JOB_TIMEOUT_SECONDS}" in
		''|*[!0-9]*)
			fail "JOB_TIMEOUT_SECONDS must be a positive integer"
			;;
	esac
	if [[ "${JOB_TIMEOUT_SECONDS}" -lt 1 ]]; then
		fail "JOB_TIMEOUT_SECONDS must be a positive integer"
	fi

	TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/agentic-workspace-lock-smoke.XXXXXX")"
	info "Using temp root: ${TMP_ROOT}"

	scenario_parallel_create
	scenario_parallel_edit

	info "All parallel locking smoke tests passed"
}

main "$@"
