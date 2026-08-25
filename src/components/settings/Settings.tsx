"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  Cake,
  GripVertical,
  LayoutGrid,
  PartyPopper,
  RefreshCw,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { SERVICE_DEFINITIONS, getServiceDefinition } from "@/lib/services";
import { DriveSyncButton } from "@/components/DriveSyncButton";
import { GoogleDriveLogo } from "@/components/GoogleDriveLogo";
import { ServiceIcon } from "@/components/ServiceIcon";
import { DatePickerPopover } from "@/components/notas/DatePickerPopover";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import { useBirthdays } from "@/lib/birthdays";
import {
  createBirthday,
  getTodaysBirthdays,
  isBirthdayToday,
  sortByUpcoming,
} from "@/lib/birthdayUtils";
import type { DockMode, ServiceConfig, StoreSchema, UpdateCheckResult } from "@/types/electron-api";

type SettingsCategory = "servicios" | "cumpleanos" | "sync" | "apariencia";

function formatBirthdayDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
  });
}

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
  const { state, update } = useStore();
  const [category, setCategory] = useState<SettingsCategory>("servicios");
  const { birthdays, loading: birthdaysLoading, saveBirthday, deleteBirthday } = useBirthdays();
  const [birthdayName, setBirthdayName] = useState("");
  const [birthdayDate, setBirthdayDate] = useState<string | null>(null);
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

  const orderedIds = [...SERVICE_DEFINITIONS.map((s) => s.id)].sort((a, b) => {
    const orderA = state.services.find((s) => s.id === a)?.order ?? 0;
    const orderB = state.services.find((s) => s.id === b)?.order ?? 0;
    return orderA - orderB;
  });

  function reorder(nextIds: string[]) {
    const services = nextIds.map((id, index) => {
      const existing = state.services.find((s) => s.id === id);
      return existing
        ? { ...existing, order: index }
        : { id, enabled: false, order: index, notificationsEnabled: true, lastUrl: null };
    });
    update({ services });
  }

  const { getItemProps } = useDragReorder(orderedIds, reorder);

  function toggleService(id: string) {
    const existing = state.services.find((s) => s.id === id);
    const isCurrentlyEnabled = existing?.enabled ?? false;
    const enabledCount = state.services.filter((s) => s.enabled).length;

    if (isCurrentlyEnabled && enabledCount <= 1) return;

    let services: ServiceConfig[];
    if (existing) {
      services = state.services.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
    } else {
      services = [
        ...state.services,
        { id, enabled: true, order: state.services.length, notificationsEnabled: true, lastUrl: null },
      ];
    }

    let groups = state.layout.groups;
    if (isCurrentlyEnabled) {
      // Disabling: drop it from whichever group holds it; empty groups die too.
      groups = groups
        .map((g) => ({ ...g, serviceIds: g.serviceIds.filter((s) => s !== id) }))
        .filter((g) => g.serviceIds.length > 0);
    } else if (!groups.some((g) => g.serviceIds.includes(id))) {
      // Enabling a service with no group yet: give it its own solo group.
      groups = [...groups, { id, serviceIds: [id], splitDirection: "horizontal", splitSizes: {} }];
    }

    const activeStillExists = groups.some((g) => g.id === state.layout.activeGroupId);

    update({
      services,
      layout: {
        groups,
        activeGroupId: activeStillExists ? state.layout.activeGroupId : (groups[0]?.id ?? null),
      },
    });
  }

  function addBirthday() {
    const trimmed = birthdayName.trim();
    if (!trimmed || !birthdayDate) return;
    saveBirthday(createBirthday(trimmed, birthdayDate));
    setBirthdayName("");
    setBirthdayDate(null);
  }

  function toggleBirthdayNotifications() {
    update({ birthdayNotificationsEnabled: !state.birthdayNotificationsEnabled });
  }

  function toggleDriveSync() {
    const enabling = !state.driveSyncEnabled;
    update({ driveSyncEnabled: enabling });
    // Turning it on shouldn't wait for the next note edit to prove it works —
    // this also doubles as the trigger for the very first login.
    if (enabling) window.electronAPI.drive.sync();
  }

  function toggleNotifications(id: string) {
    const services = state.services.map((s) =>
      s.id === id ? { ...s, notificationsEnabled: !(s.notificationsEnabled ?? true) } : s,
    );
    update({ services });
  }

  function removeFromGroup(groupId: string, serviceId: string) {
    const group = state.layout.groups.find((g) => g.id === groupId);
    if (!group || group.serviceIds.length < 2) return;

    const trimmedGroup = { ...group, serviceIds: group.serviceIds.filter((s) => s !== serviceId) };
    const soloGroup = {
      id: serviceId,
      serviceIds: [serviceId],
      splitDirection: "horizontal" as const,
      splitSizes: {},
    };
    const groups = state.layout.groups.map((g) => (g.id === groupId ? trimmedGroup : g));
    groups.splice(groups.indexOf(trimmedGroup) + 1, 0, soloGroup);

    update({ layout: { ...state.layout, groups } });
  }

  const enabledCount = state.services.filter((s) => s.enabled).length;
  const multiGroups = state.layout.groups.filter((g) => g.serviceIds.length > 1);
  const todaysBirthdays = getTodaysBirthdays(birthdays);
  const sortedBirthdays = sortByUpcoming(birthdays);

  const dockModeOptions: { value: DockMode; label: string }[] = [
    { value: "expanded", label: "Ícono y texto" },
    { value: "compact", label: "Ícono solo" },
    { value: "auto", label: "Automático" },
  ];

  const themeOptions: { value: StoreSchema["theme"]; label: string }[] = [
    { value: "light", label: "Claro" },
    { value: "dark", label: "Oscuro" },
    { value: "system", label: "Sistema" },
  ];

  const categories: { id: SettingsCategory; label: string; badge?: string }[] = [
    { id: "servicios", label: "Servicios del dock", badge: String(enabledCount) },
    {
      id: "cumpleanos",
      label: "Cumpleaños",
      badge: todaysBirthdays.length > 0 ? "🎂" : undefined,
    },
    { id: "sync", label: "Sincronización" },
    { id: "apariencia", label: "Apariencia" },
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
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
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
              {category === "apariencia" && (
                <div className="flex max-w-lg flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-base-content/70">Tema</p>
                    <div className="join">
                      {themeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`btn join-item btn-sm ${
                            state.theme === option.value ? "btn-primary" : "btn-ghost"
                          }`}
                          onClick={() => update({ theme: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-base-content/70">Menú lateral</p>
                    <div className="join">
                      {dockModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`btn join-item btn-sm ${
                            state.dockMode === option.value ? "btn-primary" : "btn-ghost"
                          }`}
                          onClick={() => update({ dockMode: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-base-content/50">
                      &quot;Ícono y texto&quot; y &quot;Ícono solo&quot; lo dejan siempre visible.
                      &quot;Automático&quot; lo oculta y aparece al acercar el mouse al borde.
                    </p>
                  </div>
                </div>
              )}

              {category === "cumpleanos" && (
                <div className="flex max-w-lg flex-col gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-base-content/70">Avisarme el día del cumpleaños</p>
                      <p className="text-xs text-base-content/50">
                        Muestra una notificación cuando sea el cumpleaños de alguien de la lista.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary shrink-0"
                      checked={state.birthdayNotificationsEnabled}
                      onChange={toggleBirthdayNotifications}
                    />
                  </div>

                  {todaysBirthdays.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                      {todaysBirthdays.map((b) => (
                        <p key={b.id} className="flex items-center gap-2 font-semibold text-primary">
                          <PartyPopper size={18} />
                          ¡Hoy {b.name} cumple años!
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-base-300 bg-base-200 p-3">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={birthdayName}
                      onChange={(e) => setBirthdayName(e.target.value)}
                      className="input input-sm flex-1"
                    />
                    <DatePickerPopover value={birthdayDate} onChange={setBirthdayDate} />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!birthdayName.trim() || !birthdayDate}
                      onClick={addBirthday}
                    >
                      Agregar
                    </button>
                  </div>

                  {birthdaysLoading ? (
                    <p className="text-sm text-base-content/50">Cargando…</p>
                  ) : sortedBirthdays.length === 0 ? (
                    <p className="text-sm text-base-content/50">No hay cumpleaños cargados todavía.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {sortedBirthdays.map((b) => (
                        <li
                          key={b.id}
                          className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                            isBirthdayToday(b) ? "border-primary bg-primary/10" : "border-base-300"
                          }`}
                        >
                          <span className="flex-1 truncate font-medium">{b.name}</span>
                          <span className="text-sm text-base-content/60">{formatBirthdayDate(b.date)}</span>
                          <button
                            type="button"
                            title={`Borrar a ${b.name}`}
                            className="rounded-lg p-1.5 text-base-content/40 hover:bg-base-300 hover:text-error"
                            onClick={() => deleteBirthday(b.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {category === "sync" && (
                <div className="flex max-w-lg flex-col gap-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm text-base-content/70">Sincronizar Notas automáticamente</p>
                      <p className="text-xs text-base-content/50">
                        Cada cambio en una nota se sube solo, sin apretar el botón.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary shrink-0"
                      checked={state.driveSyncEnabled}
                      onChange={toggleDriveSync}
                    />
                  </div>
                  <DriveSyncButton />
                </div>
              )}

              {category === "servicios" && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-base-content/70">
                    Elegí qué páginas querés tener disponibles en el dock.
                  </p>

                  <ul className="flex flex-col gap-2">
                    {orderedIds.map((id) => {
                      const service = getServiceDefinition(id);
                      if (!service) return null;
                      const config = state.services.find((s) => s.id === service.id);
                      const isEnabled = config?.enabled ?? false;
                      const notificationsEnabled = config?.notificationsEnabled ?? true;
                      const isLastEnabled = isEnabled && enabledCount <= 1;
                      const { isDragging, ...dragProps } = getItemProps(service.id);
                      return (
                        <li key={service.id} {...dragProps} className={isDragging ? "opacity-40" : undefined}>
                          <div
                            className={`flex w-full items-center gap-1 rounded-lg border pr-2 transition-colors ${
                              isEnabled
                                ? "border-primary bg-primary/10"
                                : "border-base-300 hover:bg-base-200"
                            }`}
                          >
                            <label
                              className={`flex flex-1 items-center gap-1 py-1 ${
                                isLastEnabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                              }`}
                            >
                              <span className="cursor-grab p-2 text-base-content/40 active:cursor-grabbing">
                                <GripVertical size={16} />
                              </span>
                              <ServiceIcon service={service} size={20} className="shrink-0" />
                              <span className="flex-1 py-2 font-medium">{service.name}</span>
                              <input
                                type="checkbox"
                                className="toggle toggle-primary"
                                checked={isEnabled}
                                disabled={isLastEnabled}
                                onChange={() => toggleService(service.id)}
                              />
                            </label>
                            <button
                              type="button"
                              title={
                                notificationsEnabled
                                  ? `Apagar notificaciones de ${service.name}`
                                  : `Prender notificaciones de ${service.name}`
                              }
                              onClick={() => toggleNotifications(service.id)}
                              className={`rounded-lg p-2 hover:bg-base-300 ${
                                notificationsEnabled ? "text-base-content/70" : "text-base-content/30"
                              }`}
                            >
                              {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {multiGroups.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-base-content/50">
                        Grupos armados (arrastrá un ícono sobre otro en el dock para crear uno nuevo):
                      </p>
                      <ul className="flex flex-col gap-2">
                        {multiGroups.map((group) => (
                          <li
                            key={group.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-base-300 px-3 py-2"
                          >
                            {group.serviceIds.map((id) => {
                              const service = getServiceDefinition(id);
                              if (!service) return null;
                              return (
                                <span key={id} className="badge badge-outline gap-1 py-3">
                                  <ServiceIcon service={service} size={14} />
                                  {service.name}
                                  <button
                                    type="button"
                                    title={`Sacar ${service.name} del grupo`}
                                    onClick={() => removeFromGroup(group.id, id)}
                                    className="ml-1 text-base-content/50 hover:text-base-content"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              );
                            })}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-base-content/50">
                    Tiene que quedar al menos una página activa. Los cambios se guardan al instante.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
