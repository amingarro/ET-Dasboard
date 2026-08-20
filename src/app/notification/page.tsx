"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { getServiceDefinition } from "@/lib/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useThemeSync } from "@/lib/useThemeSync";
import type { NotificationPayload } from "@/types/electron-api";

// This page is loaded into its own frameless, transparent, always-on-top
// BrowserWindow (see electron/main.ts) — a floating toast that shows up even
// while the main window is hidden in the tray, since it's a separate window
// entirely. Body/html need to stay transparent (see globals.css) so only the
// rounded card paints, not a rectangle behind it.
export default function NotificationPopupPage() {
  useThemeSync();
  const [payload, setPayload] = useState<NotificationPayload | null>(null);

  useEffect(() => {
    return window.electronAPI.onNotificationData(setPayload);
  }, []);

  const service = payload ? getServiceDefinition(payload.serviceId) : undefined;

  return (
    <div className="flex h-screen w-screen items-start justify-end bg-transparent p-2">
      <AnimatePresence>
        {payload && (
          <motion.div
            key={`${payload.title}-${payload.body}`}
            initial={{ opacity: 0, x: 48, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={() => window.electronAPI.activateNotificationService(payload.serviceId)}
            className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-base-300 bg-base-100 p-3 shadow-2xl shadow-black/40"
          >
            <div className="relative shrink-0">
              {/* Plain <img> with a relative path, not next/image (which
                  rejects relative src strings): under the packaged app's
                  file:// load, a root-absolute "/app-icon.png" resolves to
                  the filesystem root and 404s — a relative path resolves
                  against out/notification.html's own directory instead,
                  which is where the exported public/ files actually live. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="app-icon.png" alt="" width={40} height={40} className="rounded-xl" />
              {service && (
                <div className="absolute -bottom-1.5 -right-1.5 rounded-full ring-2 ring-base-100">
                  <ServiceIcon service={service} size={14} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm font-semibold text-base-content">{payload.title}</p>
              {payload.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-base-content/70">{payload.body}</p>
              )}
            </div>

            <button
              type="button"
              title="Cerrar"
              onClick={(e) => {
                e.stopPropagation();
                window.electronAPI.closeNotificationPopup();
              }}
              className="shrink-0 rounded-full p-1 text-base-content/40 hover:bg-base-200 hover:text-base-content"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
