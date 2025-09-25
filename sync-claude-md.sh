#!/usr/bin/env bash
#USAGE: symlinks CLAUDE.md to AGENTS.md all over the codebase

set -euo pipefail

# Recursively ensure that for every AGENTS.md (outside .gitignored folders),
# there is a CLAUDE.md symlink pointing to it. Also remove any orphaned
# CLAUDE.md files that do not have a sibling AGENTS.md.

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

log() { printf '%s\n' "$*"; }

# 1) For each AGENTS.md, create/update CLAUDE.md symlink next to it
while IFS= read -r -d '' path; do
  base_name="${path##*/}"
  [ "$base_name" = "AGENTS.md" ] || continue
  dir_path="$(dirname -- "$path")"
  # Ensure relative link target so it remains stable across machines
  (
    cd "$REPO_ROOT/$dir_path"
    ln -sfn "AGENTS.md" "CLAUDE.md"
  )
  log "Linked: ${dir_path}/CLAUDE.md -> AGENTS.md"
done < <(git ls-files -co --exclude-standard -z)

# 2) Remove orphaned CLAUDE.md that do not have a sibling AGENTS.md
while IFS= read -r -d '' path; do
  base_name="${path##*/}"
  [ "$base_name" = "CLAUDE.md" ] || continue
  dir_path="$(dirname -- "$path")"
  if [ ! -f "$REPO_ROOT/$dir_path/AGENTS.md" ]; then
    rm -f -- "$REPO_ROOT/$path"
    log "Removed orphan: $path"
  fi
done < <(git ls-files -co --exclude-standard -z)
