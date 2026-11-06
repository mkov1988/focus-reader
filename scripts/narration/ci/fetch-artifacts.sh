#!/usr/bin/env bash
# Download every artifact of a workflow run whose name starts with a prefix.
#
#   fetch-artifacts.sh <run_id> <name_prefix> <dest_dir> <merge|split>
#
# Replaces actions/download-artifact for cross-run downloads. That action
# lists a run's artifacts through a path that stops at the newest 100, so
# the shard WAVs of the first books in a wave silently vanished once a run
# held more than 100 artifacts (campaign 1, wave 1 lost three books that
# way). This lists with --paginate, so every artifact is seen.
#
#   merge  unpack every matching artifact into <dest_dir> itself
#          (what finish needs: all shard WAVs of one book x voice in one dir)
#   split  unpack each artifact into <dest_dir>/<artifact name>/
#          (what collect needs: one dir per verified pair)
#
# Needs: gh (GH_TOKEN in the environment), jq, unzip. Fails if nothing matched.
set -euo pipefail

RUN="${1:?run id}"; PREFIX="${2:?name prefix}"; DEST="${3:?dest dir}"; MODE="${4:?merge|split}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

echo "Listing artifacts of run $RUN in $REPO matching '$PREFIX*'"
mapfile -t ROWS < <(gh api --paginate "repos/$REPO/actions/runs/$RUN/artifacts?per_page=100" \
  --jq ".artifacts[] | select(.name | startswith(\"$PREFIX\")) | select(.expired == false) | \"\(.id)\t\(.name)\t\(.size_in_bytes)\"")
echo "Found ${#ROWS[@]} matching artifact(s)"
if [ "${#ROWS[@]}" -eq 0 ]; then
  echo "::error::no artifact named '$PREFIX*' in run $RUN (expired, never uploaded, or wrong run id)"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"
for row in "${ROWS[@]}"; do
  IFS=$'\t' read -r id name bytes <<<"$row"
  echo "- $name ($bytes bytes, id $id)"
  gh api "repos/$REPO/actions/artifacts/$id/zip" > "$TMP/$id.zip"
  if [ "$MODE" = split ]; then target="$DEST/$name"; else target="$DEST"; fi
  mkdir -p "$target"
  unzip -o -q "$TMP/$id.zip" -d "$target"
  rm -f "$TMP/$id.zip"
done
echo "Downloaded ${#ROWS[@]} artifact(s) into $DEST ($MODE)"
