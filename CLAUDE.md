@AGENTS.md

# ET Dashboard

Desktop app ("ET Dashboard") that centralizes Gmail, GitHub, Bitbucket, Trello, and Harvest — sites the user would otherwise keep open across many Chrome tabs — into one window.

## Why this is an Electron app, not a website

Gmail/GitHub/Bitbucket/Trello send `X-Frame-Options` / CSP `frame-ancestors` headers that block being loaded in an `<iframe>` from another origin. A plain web app cannot work around this. Electron's main process can intercept HTTP responses and strip those headers before the renderer applies them — that's the whole reason this is a desktop app instead of a page.

Each site is embedded with Electron's `<webview>` tag (not `BrowserView`): `<webview>` lives in the normal DOM and can be positioned/resized/animated with plain CSS, which `BrowserView` (rendered outside the DOM layout tree) cannot do.

## Stack

- Next.js 16 (App Router, TypeScript) + React 19, Tailwind v4, **daisyUI** for components/theming
- Electron 43, `electron-store` for persisted config, `electron-builder` for packaging
- `motion` (Framer Motion) for animations, `react-resizable-panels` for split-view resizing, `lucide-react` for icons
- `next.config.ts`: `output: 'export'` — prod build is static files loaded via `file://` in Electron, not a Node server

## Architecture

```
electron/
  main.ts             window creation, header-stripping (session.webRequest.onHeadersReceived
                       per service partition), tray, notification popup window + queue,
                       IPC handlers for the store
  preload.ts           contextBridge → window.electronAPI (main window + notification popup
                       window both use this same file)
  webview-preload.ts    attached to every <webview>'s `preload` attr — bridges the guest
                       page's Notification API to the host (see "Notifications" below)
  store.ts             electron-store schema + defaults + schema migrations
  services.ts          main-process service defs (id, partition, domains to strip headers for)
src/
  app/
    page.tsx            just renders <Shell />
    notification/page.tsx   standalone page loaded into the separate notification popup
                       window (not part of Shell's tree at all — own theme sync, own DOM)
  components/
    Shell.tsx          top-level layout: loading/onboarding routing, dock reveal logic,
                        theme sync, switches active group on notification click
    ServiceIcon.tsx     shared per-service icon badge (Font Awesome glyph + brand-color
                        background, used by Dock/Onboarding/Settings/notification popup)
    dock/Dock.tsx       the sidebar — renders one button per *group* (see below), handles
                        drag-to-merge, ungroup, dock display mode
    panels/
      WebviewStack.tsx  renders one <webview> per enabled service (all mounted
                        simultaneously — see "Why all webviews stay mounted" below),
                        positions them absolutely based on the active group, bridges
                        webview notification events to the main process
      SplitLayout.tsx   invisible layout scaffolding (react-resizable-panels) used only
                        to *measure* panel rects for WebviewStack to position webviews
                        against — has no visible content of its own
    onboarding/Onboarding.tsx   first-run: pick services, order (drag), theme
    settings/Settings.tsx       toggle services + per-service notification mute, drag-reorder,
                        dock display mode picker, theme picker, ungroup panel, test-notification button
  lib/
    store.tsx           StoreProvider/useStore() React context wrapping the IPC store
    services.ts          renderer-side service defs (icon/color/url/partition)
    useDragReorder.ts     generic native-HTML5-drag reorder hook (Settings + Onboarding)
    useThemeSync.ts        data-theme sync hook, shared by Shell.tsx and the notification
                        popup page (separate renderer processes, each needs its own sync)
  types/
    electron-api.d.ts     StoreSchema shared between main and renderer (hand-duplicated
                        from electron/store.ts — main/renderer are separate TS build
                        targets, not worth sharing given the size)
    electron-webview.d.ts declares the <webview> JSX intrinsic
```

## The view-group model (the core design of the UI)

There is **no global "fullscreen vs split" mode**. Instead, `layout.groups: ViewGroup[]` is an ordered list where each entry is one dock icon:

```ts
interface ViewGroup {
  id: string;
  serviceIds: string[];       // 1 = shown fullscreen; 2+ = shown split
  splitDirection: "horizontal" | "vertical";
  splitSizes: Record<string, number>;
}
interface LayoutState {
  groups: ViewGroup[];
  activeGroupId: string | null;
}
```

- Every enabled service starts as its own solo group (one dock icon each).
- **Dragging one dock icon onto another merges them** into one group (classic OS-dock-folder pattern) — `Dock.tsx`'s `mergeGroups()`. The dragged group is removed; the target group keeps its id/position and gains the dragged service(s).
- Clicking a solo group's icon shows that service **fullscreen**. Clicking a multi-service group's icon shows its members **split** (resizable, via `SplitLayout`).
- A small **×** badge appears on multi-service group icons to fully ungroup them back to solo groups. `Settings.tsx` also has a "Grupos" section to remove one member at a time (finer control than the dock's all-or-nothing ×).
- Each group remembers its own `splitDirection`/`splitSizes` independently — no app-wide split setting.

**Why this shape, not a single mode+activeService+splitServiceIds flag** (which is what an earlier iteration used): the user explicitly wants some services grouped together and others solo, switchable independently by clicking the dock — a global mode couldn't express "GitHub+Bitbucket split, Gmail solo, pick whichever with one click."

## Why all webviews stay mounted simultaneously

`WebviewStack.tsx` renders one `<webview>` per **enabled** service at all times (not just the active group's), toggling visibility/position instead of mounting/unmounting. Two reasons:
1. Electron throws if a `<webview>`'s `partition` changes after it has already navigated once — remounting on every switch would risk hitting this.
2. Keeping them mounted means every site keeps its live session/scroll state when you switch groups, instead of reloading.

Positioning: fullscreen uses plain CSS (`inset: 5px` — see the "gap" section below). Split mode cannot rely on CSS alone because panel sizes are computed dynamically by `react-resizable-panels`, so `SplitLayout.tsx` renders the `Group`/`Panel` grid as **invisible measurement scaffolding only** (a `ResizeObserver` per panel), and `WebviewStack.tsx` reads those rects to position the real `<webview>` elements absolutely on top. Webviews are never rendered *inside* the `Panel` components — that would force React to unmount/remount them across mode switches, losing the exact state item 2 above is trying to preserve.

## Visual: rounded corners + gap

Every visible webview gets a 5px inset on all sides plus `rounded-xl border border-base-300` (see the `GAP` constant in `WebviewStack.tsx`). Chromium correctly clips `<webview>` content to `border-radius` the same way it does for `<iframe>`, so this works without extra tricks. The container behind them is `bg-base-300`, which is what shows through the gaps.

## Dock display modes

`StoreSchema.dockMode: "expanded" | "compact" | "auto"` (Settings → "Menú lateral"):
- `expanded` — always visible, icon + text label, wider (`w-56`)
- `compact` — always visible, icon only, narrow (`w-16`)
- `auto` (default) — hidden, reveals on hovering a 14px edge strip or the dock itself, hides again after a 350ms delay (`Shell.tsx`'s `useDockReveal`). Also force-revealed whenever the active group is a split (multi-service) group, regardless of this setting.

## electron-store gotchas (read before touching the schema)

- **v11 is ESM-only** (`"type": "module"`, no CJS `main`). TS classic `moduleResolution` can't resolve its types cleanly from the CJS `tsconfig.electron.json` build. Fix in use: don't import its types at all — `getStore()` does `const { default: Store } = await import("electron-store")` (dynamic import works fine for ESM-only deps from CJS) and casts the instance to a small hand-written `AppStore` interface.
- **`defaults` only fills entirely-missing top-level keys**, not missing sub-fields of an object already on disk (or of objects inside an array, e.g. `ServiceConfig.notificationsEnabled` — same deal). Adding a new *nested* field (e.g. `layout.splitSizes`, historically) silently loads as `undefined` on existing configs and crashes anything that reads it — it does **not** get backfilled automatically. `getStore()` in `electron/store.ts` explicitly backfills/migrates on startup; any future nested-schema change needs the same treatment. New *top-level* keys (e.g. `dockMode`) are more likely to get picked up by `defaults` automatically, but `getStore()` still backfills them defensively rather than relying on that.
- `migrateLayout()` in `electron/store.ts` is the single place that knows how to convert every layout shape this app has ever persisted (the old global-mode schema → groups). Extend it, don't replace it, if the schema changes again.

## react-resizable-panels is NOT the API you remember

The installed version (4.x) is a from-scratch rewrite. No `PanelGroup`/`PanelResizeHandle`. Current API: `Group` / `Panel` / `Separator`, imported directly from `"react-resizable-panels"`. `Panel` and `Separator` **must be direct DOM children of `Group`** — wrapping them in a `<div>` (even `display: contents`) breaks it, since it inspects real DOM parentage. Use `<Fragment>` when `.map()`-ing panels+separators together. `onLayoutChanged(layout, meta)` gives `meta.isUserInteraction` — only persist sizes when that's `true`, or you'll write on every mount/programmatic change too. Sizes are `{[panelId]: percentage 0-100}`.

## Service icons: Font Awesome, not lucide-react

`src/lib/services.ts` sources each service's icon from `@fortawesome/free-brands-svg-icons` (`faGoogle`, `faGithub`, `faBitbucket`, `faTrello`, `faAtlassian`) with each product's real brand color — the installed `lucide-react` version has **no brand/logo icons**, only generic shapes, which is why this project doesn't use it for service icons (still used for plain UI chrome: grip handles, close buttons, split-direction toggles, etc.). Harvest has no Font Awesome brand mark, so it falls back to a generic `faClock` (solid icon set) in Harvest's own brand color. Font Awesome itself is **only** an icon dependency here, not one of the embedded pages/services. `ServiceDefinition.icon` is a Font Awesome `IconDefinition`, rendered everywhere via the shared `<ServiceIcon service={...} size={n} />` component (`src/components/ServiceIcon.tsx`) — always go through that component rather than reaching for `service.icon` directly, so sizing/coloring/the near-black-color inversion (see its source) stays consistent.

## Local environment: chrome-sandbox permissions

`node_modules/electron/dist/chrome-sandbox` needs `sudo chown root:root` + `chmod 4755` to satisfy Chromium's SUID sandbox on Linux. This is **not something the agent can do** (no sudo/TTY) — if `node_modules` ever gets wiped/reinstalled, the app will crash on launch with a sandbox error until a human redoes this manually.

## Testing note: don't run a second Electron instance against the same profile

`~/.config/et-dashboard` is the single userData dir. Launching a second `electron .` (e.g. for CDP-driven testing) while the user's own `npm run dev` is already running causes real lock contention (IndexedDB/LevelDB `LOCK` errors) on shared partitions. Check `ps aux | grep electron` for an existing session before starting another one for testing purposes.

Also: dispatching a synthetic `new MouseEvent('mouseenter', {bubbles:true})` via `element.dispatchEvent()` does **not** trigger React's `onMouseEnter`/`onMouseLeave` — React derives those from real `mouseover`/`mouseout` bubbling, not from `mouseenter`/`mouseleave` natively. Use CDP `Input.dispatchMouseEvent` (`type: "mouseMoved"`) to simulate genuine pointer movement when testing hover behavior.

## System tray

`electron/main.ts` creates a `Tray` (icon at `build/tray-icon.png`, a 32×32 downscale of the app icon; also `build/tray-icon@2x.png` for HiDPI) right after the main window. The window's `close` event is intercepted (`event.preventDefault(); win.hide()`) so clicking the window's close button minimizes to the tray instead of quitting, like Discord — actually quitting only happens via the tray menu's "Salir" item (or any path that hits `app.quit()`/`before-quit`, both of which set the module-level `isQuitting` flag the `close` handler checks). Both tray icon files are included in `package.json`'s `build.files` (`"build/**/*"`) so they ship in the packaged app too — the plain window-icon lookup in `createWindow()` still guards with `fs.existsSync` since that one only matters cosmetically, but the tray icon is functionally required or no tray gets created at all.

## Wayland/GNOME tray gotcha

The Tray from the section above did not render at all under native Wayland (this machine's GNOME session, `XDG_SESSION_TYPE=wayland`) even with the `ubuntu-appindicators` Shell extension installed and active — Electron's Tray/AppIndicator support is unreliable as a native Wayland client. Fix: force XWayland via the **real** `--ozone-platform=x11` flag passed as a literal CLI arg in the `dev:electron` npm script (`electron . --ozone-platform=x11`). Two things that looked like fixes but weren't, if revisiting this:
- `app.commandLine.appendSwitch(...)` from inside `main.ts` — Ozone platform is decided too early in Chromium's startup for a switch set from JS at that point to reliably land.
- `--ozone-platform-hint` / `ELECTRON_OZONE_PLATFORM_HINT` — doesn't exist in this Electron build (`strings` on the `electron` binary only turns up plain `--ozone-platform`, not the `-hint` variant); setting it silently does nothing.

`electron/main.ts` still also calls `app.commandLine.appendSwitch("ozone-platform", "x11")` as a best-effort fallback for launch paths that skip the npm script, but the npm script's CLI flag is the fix that actually works. **Packaging (`npm run dist`) will need the same flag wired into how the packaged binary gets launched (e.g. the `.desktop` file's `Exec` line) or the tray will silently not appear there either** — not yet done.

## Notifications: bridged from the webview, delivered by a second window

Sites embedded in a `<webview>` normally can't show a notification that looks like it belongs to this app — Electron would just hand it to the OS's native notification daemon, unstyled. `electron/webview-preload.ts` (attached to every `<webview>` via its `preload` attribute) replaces the guest page's whole `window.Notification` with a `BridgedNotification` class that never shows anything itself — it just forwards `{title, body}` to the host via `ipcRenderer.sendToHost("app-notification", ...)` and reports permission as always `"granted"` (there's nowhere sensible to show a real permission prompt from inside an embedded page). `WebviewStack.tsx`'s `ServiceWebview` sub-component attaches a native `ipc-message` DOM event listener directly to the `<webview>` ref for this (Electron webviews emit it as a plain DOM CustomEvent, not a React prop) and, if that service's `notificationsEnabled` is true (per-service mute toggle in Settings — bell icon next to each service row), calls `window.electronAPI.showNotification({serviceId, title, body})`.

**Delivery is a second, separate `BrowserWindow`, not anything rendered inside the main window.** First iteration rendered an in-app toast (a React context + component tree inside the main window) — dropped because it only shows while the main window is actually visible, and the whole point of the tray is running with it minimized. A real OS `Notification` was tried next — visible even when minimized, but 100% OS-rendered, no styling control at all (shadow/theme/animation/logo — everything the design asks for — is off the table). Final answer, matching what Discord/Slack do: `createNotificationWindow()` in `electron/main.ts` makes one reused, frameless (`frame:false`), `transparent:true`, `alwaysOnTop:true`, `skipTaskbar:true`, `focusable:false` window, positioned at the primary display's top-right corner (`screen.getPrimaryDisplay().workArea`). It's independent of the main window, so it shows up regardless of whether that one is hidden in the tray. It loads its own route, `src/app/notification/page.tsx` (static-exports to the flat file `out/notification.html`, not a directory — checked by building and looking, don't assume the App Router convention here), which is `useThemeSync()` + an `AnimatePresence`d card reusing the same visual design (shadow, theme colors, app icon + `ServiceIcon` badge) the dropped in-app toast had.

Flow: `ipcMain.on("show-notification", ...)` pushes onto a small in-memory queue and calls `showNextNotification()`, which sends the payload to the popup window (`webContents.send("notification-data", ...)`) and shows it with `showInactive()` — the "inactive" part matters, it's what keeps the popup from stealing focus from whatever the user is actually doing. A `setTimeout` (`POPUP_DURATION_MS`, 6s) hides it and advances the queue; clicking the popup (`activateNotificationService` IPC) or its close button (`closeNotificationPopup`) does the same early, and clicking additionally shows+focuses the main window and sends `notification-clicked` to it, which `Shell.tsx`'s `useNotificationClicks()` hook turns into switching `layout.activeGroupId` to whichever group contains that service.

`useThemeSync` (`src/lib/useThemeSync.ts`) is a standalone hook specifically so both `Shell.tsx` and the notification popup page can sync `data-theme` independently — they're separate renderer processes with separate DOM trees, so the main window's theme sync doesn't reach the popup window on its own. Relatedly, `body { background: transparent }` in `globals.css` is required for the popup window's transparency to actually show only the rounded card and not a solid rectangle — safe globally because every top-level screen (loading spinner, onboarding, `Shell`) already paints its own full-viewport `bg-*` on its own root element regardless.

**Preload scripts are sandboxed — no arbitrary `node:*` imports.** `electron/preload.ts` (the *main window's* preload, not the webview one above) originally computed the webview preload's `file://` path itself with `path.join`/`pathToFileURL`, which silently crashed the entire preload script before `contextBridge.exposeInMainWorld` ever ran — the whole `window.electronAPI` came back `undefined` in the renderer (symptom: `Cannot read properties of undefined (reading 'store')` in `store.tsx`, unrelated-looking to the actual cause). Fixed by computing that path in `main.ts` (full, unsandboxed Node access, ipcMain handler `get-webview-preload-path`) and having preload.ts fetch it async via `ipcRenderer.invoke` (`window.electronAPI.getWebviewPreloadPath()`, not a plain string property) — `WebviewStack.tsx` fetches it once in a `useEffect` and passes it down. **Lesson: don't add `node:path`/`node:fs`/etc. imports to `electron/preload.ts` — do that kind of computation in `main.ts` and hand the result over via IPC instead**, `ipcRenderer`/`contextBridge` themselves are the only things confirmed to work in this preload's sandbox. The *notification popup* window reuses this same `preload.js`.

Since webviews are all mounted simultaneously regardless of which one is active (see "Why all webviews stay mounted simultaneously" above), notifications fire from **every** enabled+unmuted service, not just the currently visible one.

**Not yet verified**: whether `focusable: false` on the popup window also blocks mouse clicks on some window manager (it's only documented to affect keyboard focus) — if clicking the popup ever turns out to do nothing, that flag is the first thing to try removing.

## Commands

- `npm run dev` — builds electron once, then runs `next dev` + `electron .` concurrently
- `npm run build` — `next build` (static export to `out/`) + electron compile
- `npm run dist` — full build + `electron-builder` (Linux AppImage/deb; not yet run end-to-end in this environment — needs network access to fetch packaging helper binaries)
