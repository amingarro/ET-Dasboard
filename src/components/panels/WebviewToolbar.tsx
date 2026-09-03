"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Copy, Home, RotateCw } from "lucide-react";
import type { CSSProperties } from "react";

interface WebviewToolbarProps {
  style: CSSProperties;
  expanded: boolean;
  onToggleExpand: () => void;
  onHome: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onCopyUrl: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  copied: boolean;
}

/** Small round icon button shared by every action in the toolbar. */
function ToolbarButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
    >
      {children}
    </button>
  );
}

/**
 * Floating navigation overlay pinned to a visible webview's bottom-left
 * corner. Exists because sites embedded via <webview> (Figma canvases
 * launched from inside a Jira ticket, in particular) can strand the user
 * somewhere with no in-page way back and no window chrome of its own —
 * this gives every service a always-available Home/Back/Forward/Copy URL,
 * independent of whatever that page's own navigation is doing.
 */
export function WebviewToolbar({
  style,
  expanded,
  onToggleExpand,
  onHome,
  onBack,
  onForward,
  onReload,
  onCopyUrl,
  canGoBack,
  canGoForward,
  copied,
}: WebviewToolbarProps) {
  return (
    <div
      className="absolute z-10 flex items-center gap-0.5 rounded-full border border-base-300 bg-base-100/90 p-0.5 shadow-lg backdrop-blur-sm"
      style={style}
    >
      <ToolbarButton onClick={onToggleExpand} title={expanded ? "Contraer" : "Expandir"}>
        <motion.span
          className="flex items-center justify-center"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronRight size={16} />
        </motion.span>
      </ToolbarButton>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="flex items-center gap-0.5 overflow-hidden"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <ToolbarButton onClick={onBack} disabled={!canGoBack} title="Atrás">
              <ArrowLeft size={16} />
            </ToolbarButton>
            <ToolbarButton onClick={onForward} disabled={!canGoForward} title="Adelante">
              <ArrowRight size={16} />
            </ToolbarButton>
            <ToolbarButton onClick={onHome} title="Ir al inicio">
              <Home size={16} />
            </ToolbarButton>
            <ToolbarButton onClick={onReload} title="Recargar">
              <RotateCw size={16} />
            </ToolbarButton>
            <ToolbarButton onClick={onCopyUrl} title="Copiar URL">
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </ToolbarButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
