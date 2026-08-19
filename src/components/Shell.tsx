"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { Dock } from "@/components/dock/Dock";
import { WebviewStack } from "@/components/panels/WebviewStack";
import { Settings } from "@/components/settings/Settings";
import { useStore } from "@/lib/store";

const HIDE_DELAY_MS = 350;
const EDGE_HOVER_PX = 14;
const DOCK_WIDTH_COMPACT = 64;
const DOCK_WIDTH_EXPANDED = 224;

function useThemeSync() {
  const { state } = useStore();

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", state.theme);
    }
  }, [state.theme]);
}

function useDockReveal(pinBase: boolean, pinned: boolean) {
  const [hovering, setHovering] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHideTimeout() {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
  }

  function show() {
    clearHideTimeout();
    setHovering(true);
  }

  function scheduleHide() {
    clearHideTimeout();
    hideTimeout.current = setTimeout(() => setHovering(false), HIDE_DELAY_MS);
  }

  useEffect(() => clearHideTimeout, []);

  const revealed = pinBase || pinned || hovering;
  return { revealed, show, scheduleHide };
}

export function Shell() {
  useThemeSync();
  const { state, loading } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeGroup = state.layout.groups.find((g) => g.id === state.layout.activeGroupId);
  const isSplit = Boolean(activeGroup && activeGroup.serviceIds.length > 1);
  const pinnedByMode = state.dockMode !== "auto";
  const pinned = pinnedByMode || isSplit;
  const { revealed, show, scheduleHide } = useDockReveal(pinned, settingsOpen);
  const dockWidth = state.dockMode === "expanded" ? DOCK_WIDTH_EXPANDED : DOCK_WIDTH_COMPACT;

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!state.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-base-300">
      {!pinned && (
        <div
          className="fixed inset-y-0 left-0 z-30"
          style={{ width: EDGE_HOVER_PX }}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        />
      )}

      <Dock
        revealed={revealed}
        expanded={state.dockMode === "expanded"}
        width={dockWidth}
        onOpenSettings={() => setSettingsOpen(true)}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      />

      <motion.div
        className="flex h-full flex-1"
        animate={{ paddingLeft: pinned ? dockWidth : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
      >
        <WebviewStack />
      </motion.div>

      <AnimatePresence>
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
