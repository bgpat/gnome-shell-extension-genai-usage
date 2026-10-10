#!/usr/bin/env bash
# preToolUse (Delete): auto-allow when the target is tracked in git.
set -euo pipefail

input=$(cat)

path=$(
  echo "$input" | jq -r '
    .tool_input.file_path // .tool_input.filePath // .tool_input.path //
    .tool_input.target // .tool_input.target_file // empty
  '
)

if [[ -z "$path" || "$path" == "null" ]]; then
  echo '{}'
  exit 0
fi

cwd=$(echo "$input" | jq -r '.cwd // .workspace_roots[0] // empty')
if [[ -z "$cwd" || "$cwd" == "null" ]]; then
  echo '{}'
  exit 0
fi

if [[ "$path" != /* ]]; then
  path=$(realpath -m "$cwd/$path")
fi

parent=$(dirname "$path")
if ! git -C "$parent" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

repo_root=$(git -C "$parent" rev-parse --show-toplevel)
rel="${path#"$repo_root"/}"
if [[ "$rel" == "$path" ]]; then
  echo '{}'
  exit 0
fi

if git -C "$repo_root" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
  echo '{"permission":"allow"}'
  exit 0
fi

echo '{}'
exit 0
