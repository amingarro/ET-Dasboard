"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Dock } from "@/components/dock/Dock";
import { Notas } from "@/components/notas/Notas";
import { WebviewStack } from "@/components/panels/WebviewStack";
import { Settings } from "@/components/settings/Settings";
import { useStore } from "@/lib/store";
import { useThemeSync } from "@/lib/useThemeSync";
import { useBirthdays } from "@/lib/birthdays";
import { getTodaysBirthdays } from "@/lib/birthdayUtils";

const HIDE_DELAY_MS = 350;
const EDGE_HOVER_PX = 14;
const DOCK_WIDTH_COMPACT = 64;
const DOCK_WIDTH_EXPANDED = 224;

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

// Once-a-day "someone's birthday today" popup, reusing the same
// showNotification bridge webviews use (see WebviewStack.tsx) with a
// synthetic "birthdays" serviceId — the notification popup page already
// renders gracefully when getServiceDefinition can't resolve an id (just
// omits the small brand badge), so no service registration is needed.
// Guarded by birthdayNotificationsEnabled (Settings → Cumpleaños) and a
// localStorage date stamp so it fires once per calendar day rather than on
// every mount, while still catching a midnight rollover in a long-running
// session via the periodic recheck.
const BIRTHDAY_NOTIFIED_DATE_KEY = "et-dashboard:birthday-notified-date";
const BIRTHDAY_RECHECK_MS = 30 * 60 * 1000;

function useBirthdayNotifications(enabled: boolean) {
  const { birthdays } = useBirthdays();

  useEffect(() => {
    if (!enabled) return;

    function checkAndNotify() {
      const todays = getTodaysBirthdays(birthdays);
      if (todays.length === 0) return;
      const todayKey = new Date().toDateString();
      if (localStorage.getItem(BIRTHDAY_NOTIFIED_DATE_KEY) === todayKey) return;
      localStorage.setItem(BIRTHDAY_NOTIFIED_DATE_KEY, todayKey);

      const title =
        todays.length === 1 ? `¡Hoy ${todays[0].name} cumple años!` : "¡Hoy cumplen años!";
      const body = todays.length === 1 ? "" : todays.map((b) => b.name).join(", ");
      window.electronAPI.showNotification({ serviceId: "birthdays", title, body });
    }

    checkAndNotify();
    const interval = setInterval(checkAndNotify, BIRTHDAY_RECHECK_MS);
    return () => clearInterval(interval);
  }, [enabled, birthdays]);
}

function useNotificationClicks() {
  const { state, update } = useStore();
  const layout = state.layout;

  useEffect(() => {
    return window.electronAPI.onNotificationClick((serviceId) => {
      const group = layout.groups.find((g) => g.serviceIds.includes(serviceId));
      if (group) {
        update({ layout: { ...layout, activeGroupId: group.id } });
      }
    });
  }, [layout, update]);
}

export function Shell() {
  useThemeSync();
  useNotificationClicks();
  const { state, loading } = useStore();
  useBirthdayNotifications(state.birthdayNotificationsEnabled);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notasOpen, setNotasOpen] = useState(false);
  const activeGroup = state.layout.groups.find((g) => g.id === state.layout.activeGroupId);
  const isSplit = Boolean(activeGroup && activeGroup.serviceIds.length > 1);
  const pinnedByMode = state.dockMode !== "auto";
  const pinned = pinnedByMode || isSplit;
  const { revealed, show, scheduleHide } = useDockReveal(pinned, settingsOpen || notasOpen);
  const dockWidth = state.dockMode === "expanded" ? DOCK_WIDTH_EXPANDED : DOCK_WIDTH_COMPACT;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    window.electronAPI.checkForUpdates().then((result) => setUpdateAvailable(result.updateAvailable));
  }, []);

  const [loadingServiceIds, setLoadingServiceIds] = useState<Set<string>>(new Set());
  const handleServiceLoadingChange = useCallback((id: string, isLoading: boolean) => {
    setLoadingServiceIds((prev) => {
      if (isLoading === prev.has(id)) return prev;
      const next = new Set(prev);
      if (isLoading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  if (loading) {
    return <LoadingScreen />;
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
        loadingServiceIds={loadingServiceIds}
        updateAvailable={updateAvailable}
        onOpenNotas={() => setNotasOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      />

      <motion.div
        className="relative flex h-full flex-1"
        animate={{ paddingLeft: pinned ? dockWidth : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
      >
        <WebviewStack onLoadingChange={handleServiceLoadingChange} />
      </motion.div>

      <AnimatePresence>
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
        {notasOpen && <Notas onClose={() => setNotasOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
