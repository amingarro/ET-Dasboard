import fs from "node:fs/promises";
import path from "node:path";

export interface ReleaseNoteEntry {
  version: string;
  date: string;
  notes: string[];
}

// How many versions the release-notes modal shows: this one plus the
// previous 10, per the feature request. CHANGELOG.md itself keeps the full
// history — this only trims what gets sent to the renderer.
const MAX_VERSIONS = 11;

const VERSION_HEADING = /^## \[([^\]]+)\] - (.+)$/;
const BULLET = /^- (.+)$/;

// CHANGELOG.md is the single source of truth for release notes — already
// written in user-facing Spanish prose as part of the existing release
// process (see the repo's git history: every version bump edits this file).
// Parsing it here instead of hand-duplicating its content into a second,
// renderer-side data file means a future release only ever needs the one
// edit it already needs today.
export function parseChangelog(markdown: string): ReleaseNoteEntry[] {
  const entries: ReleaseNoteEntry[] = [];
  let current: ReleaseNoteEntry | null = null;

  for (const line of markdown.split("\n")) {
    const heading = VERSION_HEADING.exec(line);
    if (heading) {
      current = { version: heading[1], date: heading[2], notes: [] };
      entries.push(current);
      continue;
    }
    const bullet = current && BULLET.exec(line);
    if (bullet) current!.notes.push(bullet[1]);
  }

  return entries.slice(0, MAX_VERSIONS);
}

// __dirname here is dist-electron/ (this file's compiled location, both in
// the unpacked dev tree and inside the packaged app's resources) — same
// "../" pattern main.ts already uses for build/icon.png, out/index.html,
// etc. CHANGELOG.md needs to ship alongside those (package.json's
// build.files) or this resolves to nothing in the packaged app.
export async function getReleaseNotes(): Promise<ReleaseNoteEntry[]> {
  const changelogPath = path.join(__dirname, "../CHANGELOG.md");
  const markdown = await fs.readFile(changelogPath, "utf-8");
  return parseChangelog(markdown);
}
