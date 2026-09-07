#!/usr/bin/env bash
set -euo pipefail

# CHANGELOG.md's top entry must describe a version that hasn't shipped yet.
#
# Bug this guards against (2026-09-07): new release notes got appended to
# CHANGELOG.md's top "## [x.y.z]" entry on the assumption it was still
# unreleased — but that version had actually already been tagged and
# released days earlier. A stale local clone (tags never fetched) made the
# release look pending when it wasn't. The fix landed on main and had to be
# untangled into a separate new entry after the fact.
#
# This check always asks the remote directly (git ls-remote), never local
# tags — a stale/shallow local clone is exactly the failure mode above, so
# trusting local state here would silently reintroduce the same bug.

TOP_VERSION=$(sed -n 's/^## \[\([0-9]*\.[0-9]*\.[0-9]*\)\].*/\1/p' CHANGELOG.md | head -n1)
if [ -z "$TOP_VERSION" ]; then
  echo "check-changelog-version: couldn't find a '## [x.y.z]' heading at the top of CHANGELOG.md" >&2
  exit 1
fi

REMOTE="${1:-origin}"
if git ls-remote --tags "$REMOTE" "refs/tags/v$TOP_VERSION" | grep -q .; then
  cat >&2 <<EOF
check-changelog-version: CHANGELOG.md's top entry is v$TOP_VERSION, but that
tag already exists on '$REMOTE' — it already shipped.

Add a NEW '## [x.y.z]' heading above it for whatever you're describing now,
instead of editing an already-released entry. release.yml bumps the patch
version on its own each run, so the next release will be whatever comes
after the version currently in package.json@$REMOTE — check that if unsure
what to call the new heading.
EOF
  exit 1
fi

echo "check-changelog-version: OK — v$TOP_VERSION is not yet tagged on '$REMOTE'."
