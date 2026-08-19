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
  main.ts      window creation, header-stripping (session.webRequest.onHeadersReceived
               per service partition), IPC handlers for the store
  preload.ts   contextBridge → window.electronAPI
  store.ts     electron-store schema + defaults + schema migrations
  services.ts  main-process service defs (id, partition, domains to strip headers for)
src/
  app/page.tsx        just renders <Shell />
  components/
    Shell.tsx          top-level layout: loading/onboarding routing, dock reveal logic,
                        theme sync to `data-theme`
    dock/Dock.tsx       the sidebar — renders one button per *group* (see below), handles
                        drag-to-merge, ungroup, dock display mode
    panels/
      WebviewStack.tsx  renders one <webview> per enabled service (all mounted
                        simultaneously — see "Why all webviews stay mounted" below),
                        positions them absolutely based on the active group
      SplitLayout.tsx   invisible layout scaffolding (react-resizable-panels) used only
                        to *measure* panel rects for WebviewStack to position webviews
                        against — has no visible content of its own
    onboarding/Onboarding.tsx   first-run: pick services, order (drag), theme
    settings/Settings.tsx       toggle services, drag-reorder, dock display mode picker,
                        ungroup panel
  lib/
    store.tsx           StoreProvider/useStore() React context wrapping the IPC store
    services.ts          renderer-side service defs (icon/color/url/partition)
    useDragReorder.ts     generic native-HTML5-drag reorder hook (Settings + Onboarding)
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
- **`defaults` only fills entirely-missing top-level keys**, not missing sub-fields of an object already on disk. Adding a new *nested* field (e.g. `layout.splitSizes`, historically) silently loads as `undefined` on existing configs and crashes anything that reads it — it does **not** get backfilled automatically. `getStore()` in `electron/store.ts` explicitly backfills/migrates on startup; any future nested-schema change needs the same treatment. New *top-level* keys (e.g. `dockMode`) are more likely to get picked up by `defaults` automatically, but `getStore()` still backfills them defensively rather than relying on that.
- `migrateLayout()` in `electron/store.ts` is the single place that knows how to convert every layout shape this app has ever persisted (the old global-mode schema → groups). Extend it, don't replace it, if the schema changes again.

## react-resizable-panels is NOT the API you remember

The installed version (4.x) is a from-scratch rewrite. No `PanelGroup`/`PanelResizeHandle`. Current API: `Group` / `Panel` / `Separator`, imported directly from `"react-resizable-panels"`. `Panel` and `Separator` **must be direct DOM children of `Group`** — wrapping them in a `<div>` (even `display: contents`) breaks it, since it inspects real DOM parentage. Use `<Fragment>` when `.map()`-ing panels+separators together. `onLayoutChanged(layout, meta)` gives `meta.isUserInteraction` — only persist sizes when that's `true`, or you'll write on every mount/programmatic change too. Sizes are `{[panelId]: percentage 0-100}`.

## lucide-react version note

The installed version has **no brand/logo icons** (no `Github`, `Trello`, etc.) — only generic shape icons. `src/lib/services.ts` uses substitutes (Mail, GitBranch, GitCompareArrows, Kanban, Clock). Worth revisiting with real brand SVGs for a more polished look.

## Local environment: chrome-sandbox permissions

`node_modules/electron/dist/chrome-sandbox` needs `sudo chown root:root` + `chmod 4755` to satisfy Chromium's SUID sandbox on Linux. This is **not something the agent can do** (no sudo/TTY) — if `node_modules` ever gets wiped/reinstalled, the app will crash on launch with a sandbox error until a human redoes this manually.

## Testing note: don't run a second Electron instance against the same profile

`~/.config/et-dashboard` is the single userData dir. Launching a second `electron .` (e.g. for CDP-driven testing) while the user's own `npm run dev` is already running causes real lock contention (IndexedDB/LevelDB `LOCK` errors) on shared partitions. Check `ps aux | grep electron` for an existing session before starting another one for testing purposes.

Also: dispatching a synthetic `new MouseEvent('mouseenter', {bubbles:true})` via `element.dispatchEvent()` does **not** trigger React's `onMouseEnter`/`onMouseLeave` — React derives those from real `mouseover`/`mouseout` bubbling, not from `mouseenter`/`mouseleave` natively. Use CDP `Input.dispatchMouseEvent` (`type: "mouseMoved"`) to simulate genuine pointer movement when testing hover behavior.

## Commands

- `npm run dev` — builds electron once, then runs `next dev` + `electron .` concurrently
- `npm run build` — `next build` (static export to `out/`) + electron compile
- `npm run dist` — full build + `electron-builder` (Linux AppImage/deb; not yet run end-to-end in this environment — needs network access to fetch packaging helper binaries)
