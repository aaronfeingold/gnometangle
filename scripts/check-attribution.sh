#!/usr/bin/env bash
# Fails if commits or a pull request body carry visible AI tool attribution: Co-Authored-By or Claude-Session
# trailers, a "Generated with Claude Code" line, a robot emoji, a Claude session link, or a commit authored with an
# anthropic.com address (GitHub turns that into a Co-authored-by trailer on the squash commit).
# Text inside HTML comments (<!-- ... -->) is ignored, so a hidden marker can still record where a change came from.
# Usage:
#   scripts/check-attribution.sh <base>..<head>   check the commit messages in a range
#   scripts/check-attribution.sh --body <file>    check a pull request body
set -euo pipefail

patterns=(
  '^[[:space:]]*Co-Authored-By:.*(Claude|anthropic\.com)'
  '^[[:space:]]*Claude-Session:'
  'Generated (with|by) \[Claude'
  $'\xF0\x9F\xA4\x96' # U+1F916 robot face
  'claude\.ai/code/session_'
)

# Prints the matching lines of stdin with the HTML comments removed; returns 1 when nothing matches.
find_attribution() {
  perl -0pe 's/<!--.*?-->//gs' | grep -n -i -E "$(
    IFS='|'
    echo "${patterns[*]}"
  )"
}

status=0
if [ "${1:-}" = --body ]; then
  if matches=$(find_attribution <"$2"); then
    echo "::error::The pull request description has visible AI attribution. Remove it, or move it into an HTML comment:"
    echo "$matches"
    status=1
  fi
else
  for sha in $(git rev-list --no-merges "$1"); do
    if matches=$(git log -1 --format=%B "$sha" | find_attribution); then
      echo "::error::Commit $(git log -1 --format='%h %s' "$sha") has visible AI attribution in its message:"
      echo "$matches"
      status=1
    fi
    if git log -1 --format='%ae%n%ce' "$sha" | grep -q -i '@anthropic\.com$'; then
      echo "::error::Commit $(git log -1 --format='%h %s' "$sha") is authored as $(git log -1 --format='%an <%ae>' "$sha")."
      echo 'Set git config user.name and user.email to your own and amend it (git commit --amend --reset-author).'
      status=1
    fi
  done
  if [ "$status" = 1 ]; then
    echo 'Fix those commits (git rebase -i) and force-push the branch.'
  fi
fi
exit "$status"
