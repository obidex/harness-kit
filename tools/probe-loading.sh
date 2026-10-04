#!/usr/bin/env bash
# probe-loading — prove a project's sessions load the kit: once in a fresh session, once after a
# resume (adapter A01, card H2). Needs the `claude` CLI signed in; not run in CI.
#
#   bash tools/probe-loading.sh <project dir>     prints PASS or FAIL per probe; exit 1 on a FAIL
#
# Tools are disabled, so the answers can come only from what the entry file loaded at start.
set -euo pipefail
dir="${1:?usage: probe-loading.sh <project dir>}"
want_version="$(tr -d '[:space:]' < "$dir/.harness/VERSION")"
want_c03="$(grep -oE '^- \*\*C03 [^*]+' "$dir/.harness/core.md" | sed 's/^- \*\*C03 //; s/\.$//')"
want_o05="$(grep -oE '^- \*\*O05 [^*]+' "$dir/.harness/owner-defaults.md" | sed 's/^- \*\*O05 //; s/\.$//')"
no_tools="Bash,Read,Grep,Glob,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Task"
sid="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"
ask() { (cd "$dir" && env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION claude -p "$1" "${@:2}" --disallowedTools "$no_tools" 2>&1); }
fail=0
check() { if printf '%s' "$2" | grep -qiF "$3"; then echo "probe-loading: PASS $1 (answer contains \"$3\")"; else echo "probe-loading: FAIL $1: expected \"$3\", got: $(printf '%s' "$2" | tr '\n' ' ' | cut -c1-200)"; fail=1; fi; }

a1="$(ask "Answer only from the instructions already loaded in your context; you have no tools. Line 1: the installed Harness Kit version, exactly. Line 2: the title of rule C03, exactly." --session-id "$sid")"
check "fresh session: kit version" "$a1" "$want_version"
check "fresh session: C03 title" "$a1" "$want_c03"

a2="$(ask "Still without tools: what is the title of owner-default rule O05, exactly, and what kit version is installed?" --resume "$sid")"
check "after resume: O05 title" "$a2" "$want_o05"
check "after resume: kit version" "$a2" "$want_version"
exit "$fail"
