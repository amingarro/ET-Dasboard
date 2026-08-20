// electron-builder afterPack hook, Linux only.
//
// Two flags need to reach the real Linux binary as genuine process
// arguments, not JS-side `app.commandLine.appendSwitch()` calls in
// main.ts — both were tried there and both proved too late in practice:
//
// - --no-sandbox: Chromium's SUID sandbox check runs during Electron's
//   native init, before any of main.ts's JS executes (confirmed: even
//   setting process.env.ELECTRON_DISABLE_SANDBOX as the very first line
//   still hit the SUID sandbox FATAL abort). Needed because the packaged
//   chrome-sandbox binary isn't chown-root/setuid on a normal end-user
//   install (that requires sudo the user won't have run).
// - --ozone-platform=x11: setting this via app.commandLine.appendSwitch()
//   in main.ts, combined with --no-sandbox coming from this wrapper,
//   reintroduced the Mesa GPU-process segfault (exit code 139) this whole
//   fix was meant to dodge — even though the window still rendered fine.
//   Passing both flags together as real argv on the same exec (matching
//   exactly how a working reference case, Discord, launches) avoided it;
//   only one of the two coming from JS did not, so both must come from
//   here.
//
// Fixed by renaming the real binary aside and replacing it with a tiny
// wrapper script that execs it with both flags. Every existing launch path
// (desktop icon, /usr/bin symlink via update-alternatives, running it from
// a terminal) keeps working unchanged since the wrapper keeps the original
// filename.
const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;

  const exeName = context.packager.executableName;
  const outDir = context.appOutDir;
  const exePath = path.join(outDir, exeName);
  const realExeName = `${exeName}-bin`;
  const realExePath = path.join(outDir, realExeName);

  fs.renameSync(exePath, realExePath);

  const wrapper = `#!/bin/sh
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec "$DIR/${realExeName}" --ozone-platform=x11 --no-sandbox "$@"
`;
  fs.writeFileSync(exePath, wrapper, { mode: 0o755 });
};
