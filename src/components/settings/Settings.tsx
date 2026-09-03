"use client";

import { useEffect, useState } from "react";
import { Cake, LayoutGrid, RefreshCw, SpellCheck, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GoogleDriveLogo } from "@/components/GoogleDriveLogo";
import { useStore } from "@/lib/store";
import { useBirthdays } from "@/lib/birthdays";
import { getTodaysBirthdays } from "@/lib/birthdayUtils";
import { ServiciosPanel } from "@/components/settings/ServiciosPanel";
import { CumpleanosPanel } from "@/components/settings/CumpleanosPanel";
import { SyncPanel } from "@/components/settings/SyncPanel";
import { AparienciaPanel } from "@/components/settings/AparienciaPanel";
import { OrtografiaPanel } from "@/components/settings/OrtografiaPanel";
import { ReleaseNotesModal } from "@/components/settings/ReleaseNotesModal";
import type { UpdateCheckResult } from "@/types/electron-api";

type SettingsCategory = "servicios" | "cumpleanos" | "sync" | "apariencia" | "ortografia";

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: UpdateCheckResult }
  | { status: "downloading"; percent: number }
  | { status: "installed" }
  | { status: "download-error"; message: string };

// Real checks often resolve in well under a second, which made the
// "checking" spinner flash and the result content pop in right after it —
// a jarring layout jump instead of visible feedback. Hold "checking" open
// for at least this long so the state change always reads as intentional.
const MIN_CHECK_DURATION_MS = 3000;

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { state } = useStore();
  const [category, setCategory] = useState<SettingsCategory>("servicios");
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const { birthdays } = useBirthdays();
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "checking" });
  // Separate from updateState on purpose: re-checking from the sidebar footer
  // must not blank out an already-known "update available" badge while the
  // new check is in flight — only the very first, pre-any-result check uses
  // updateState's own "checking" status for that.
  const [isRechecking, setIsRechecking] = useState(false);

  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  function runUpdateCheck() {
    const start = Date.now();
    window.electronAPI.checkForUpdates().then((result) => {
      setReleaseUrl(result.releaseUrl);
      setCurrentVersion(result.currentVersion);
      const delay = Math.max(0, MIN_CHECK_DURATION_MS - (Date.now() - start));
      setTimeout(() => {
        setUpdateState({ status: "done", result });
        setIsRechecking(false);
      }, delay);
    });
  }

  function checkForUpdates() {
    setIsRechecking(true);
    runUpdateCheck();
  }

  function downloadUpdate() {
    setUpdateState({ status: "downloading", percent: 0 });
    window.electronAPI.downloadUpdate().then(({ error }) => {
      if (error) setUpdateState({ status: "download-error", message: error });
    });
  }

  useEffect(() => {
    runUpdateCheck();
  }, []);

  useEffect(() => {
    const offProgress = window.electronAPI.onUpdateDownloadProgress((percent) =>
      setUpdateState({ status: "downloading", percent }),
    );
    const offInstalled = window.electronAPI.onUpdateInstalled(() =>
      setUpdateState({ status: "installed" }),
    );
    const offError = window.electronAPI.onUpdateError((message) =>
      setUpdateState({ status: "download-error", message }),
    );
    return () => {
      offProgress();
      offInstalled();
      offError();
    };
  }, []);

  const enabledCount = state.services.filter((s) => s.enabled).length;
  const todaysBirthdays = getTodaysBirthdays(birthdays);

  const categories: { id: SettingsCategory; label: string; badge?: string }[] = [
    { id: "servicios", label: "Servicios del dock", badge: String(enabledCount) },
    {
      id: "cumpleanos",
      label: "Cumpleaños",
      badge: todaysBirthdays.length > 0 ? "🎂" : undefined,
    },
    { id: "sync", label: "Sincronización" },
    { id: "apariencia", label: "Apariencia" },
    { id: "ortografia", label: "Corrector ortográfico" },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card max-h-[85vh] w-full max-w-4xl overflow-hidden bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[640px] max-h-full flex-col">
          <div className="flex items-center justify-between border-b border-base-300 px-6 py-4">
            <div className="flex items-center gap-2">
              {/* Relative path, not next/image — see notification/page.tsx */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="app-icon.png" alt="" width={24} height={24} className="rounded-md" />
              <h2 className="text-xl font-bold">Configuración</h2>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Sidebar: categories + version, version stays pinned regardless of
                which category is open — it's status, not a settings category. */}
            <div className="flex w-64 shrink-0 flex-col border-r border-base-300 bg-base-200">
              <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
                      category === cat.id
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-base-content/70 hover:bg-base-300"
                    }`}
                  >
                    <span className="shrink-0">
                      {cat.id === "servicios" && <LayoutGrid size={18} />}
                      {cat.id === "cumpleanos" && <Cake size={18} />}
                      {cat.id === "sync" && <GoogleDriveLogo size={17} />}
                      {cat.id === "apariencia" && <Sun size={18} />}
                      {cat.id === "ortografia" && <SpellCheck size={18} />}
                    </span>
                    <span className="flex-1">{cat.label}</span>
                    {cat.badge && (
                      <span className="rounded-full bg-base-content/10 px-2 py-0.5 text-[11px] text-base-content/50">
                        {cat.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="flex shrink-0 flex-col gap-2 border-t border-base-300 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-base-content/60">
                    Versión v{currentVersion ?? (window.electronAPI ? "…" : "")}
                    {" · "}
                    <button
                      type="button"
                      className="link link-primary"
                      onClick={() => setReleaseNotesOpen(true)}
                    >
                      Novedades
                    </button>
                  </span>
                  <button
                    type="button"
                    title="Buscar actualizaciones"
                    className="btn btn-ghost btn-xs btn-circle text-base-content/50"
                    disabled={updateState.status === "checking" || isRechecking || updateState.status === "downloading"}
                    onClick={checkForUpdates}
                  >
                    <RefreshCw
                      size={13}
                      className={updateState.status === "checking" || isRechecking ? "animate-spin" : undefined}
                    />
                  </button>
                </div>

                {updateState.status === "done" && updateState.result.error && (
                  <p className="text-[11px] text-error">No se pudo comprobar</p>
                )}
                {updateState.status === "done" &&
                  !updateState.result.error &&
                  updateState.result.updateAvailable && (
                    // Grayed out (not hidden) while a recheck is in flight — reads as
                    // "this is stale, hang on" instead of the badge just vanishing and
                    // popping back once the new result lands.
                    <div
                      className={`flex flex-wrap items-center gap-1.5 text-[11px] transition-[filter,opacity] ${
                        isRechecking ? "opacity-50 grayscale" : ""
                      }`}
                    >
                      <span className="badge badge-primary badge-xs">Nueva versión</span>
                      <button
                        type="button"
                        className="link link-primary"
                        disabled={isRechecking}
                        onClick={downloadUpdate}
                      >
                        {updateState.result.latestVersion} · Actualizar
                      </button>
                    </div>
                  )}

                {updateState.status === "downloading" && (
                  <div className="flex flex-col gap-1">
                    <progress
                      className="progress progress-primary w-full"
                      value={updateState.percent}
                      max={100}
                    />
                    <span className="text-[11px] text-base-content/60">
                      Descargando… {Math.round(updateState.percent)}%
                    </span>
                  </div>
                )}

                {updateState.status === "installed" && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="badge badge-success badge-xs">Instalada</span>
                    <button
                      type="button"
                      className="link link-primary"
                      onClick={() => window.electronAPI.relaunchApp()}
                    >
                      Reiniciar ahora
                    </button>
                  </div>
                )}

                {updateState.status === "download-error" && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] text-error">No se pudo actualizar: {updateState.message}</p>
                    {releaseUrl && (
                      <button
                        type="button"
                        className="link link-primary w-fit text-[11px]"
                        onClick={() => window.electronAPI.openExternal(releaseUrl)}
                      >
                        Descargar manualmente
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content pane */}
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {category === "servicios" && <ServiciosPanel />}
              {category === "cumpleanos" && <CumpleanosPanel />}
              {category === "sync" && <SyncPanel />}
              {category === "apariencia" && <AparienciaPanel />}
              {category === "ortografia" && <OrtografiaPanel />}
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {releaseNotesOpen && <ReleaseNotesModal onClose={() => setReleaseNotesOpen(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}
