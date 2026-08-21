"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

interface DatePickerPopoverProps {
  value: string | null; // "YYYY-MM-DD" or null
  onChange: (value: string | null) => void;
}

// cally's <calendar-date> is a plain custom element, not a React component —
// its `value` prop and "change" event aren't reachable through JSX's
// onChange (React's synthetic event system doesn't bridge custom element
// events reliably), so both are wired imperatively through a ref. Same
// reasoning as WebviewStack.tsx's native "ipc-message" listener on <webview>.
export function DatePickerPopover({ value, onChange }: DatePickerPopoverProps) {
  const id = useId().replace(/:/g, "");
  const anchorName = `--cally-anchor-${id}`;
  const popoverId = `cally-popover-${id}`;
  const calendarRef = useRef<HTMLElement & { value: string }>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // cally registers its custom elements by executing customElements.define()
  // as a side effect of being imported, which touches `document` — deferred
  // to a client-only effect since Next prerenders "use client" components
  // too, and a top-level `import "cally"` crashed that pass with
  // "document is not defined". Custom elements upgrade in place once
  // defined, so <calendar-date> below works fine as soon as this resolves.
  useEffect(() => {
    import("cally");
  }, []);

  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    function handleChange(this: HTMLElement & { value: string }) {
      onChange(this.value || null);
      popoverRef.current?.hidePopover();
    }
    el.addEventListener("change", handleChange);
    return () => el.removeEventListener("change", handleChange);
  }, [onChange]);

  useEffect(() => {
    if (calendarRef.current) calendarRef.current.value = value ?? "";
  }, [value]);

  const label = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Poner fecha límite";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        popoverTarget={popoverId}
        id={`cally-trigger-${id}`}
        style={{ anchorName } as CSSProperties}
        className="btn btn-soft btn-sm gap-2"
      >
        <CalendarDays size={14} />
        {label}
      </button>
      {value && (
        <button
          type="button"
          title="Quitar fecha límite"
          className="btn btn-ghost btn-xs btn-circle"
          onClick={() => onChange(null)}
        >
          <X size={12} />
        </button>
      )}

      <div
        ref={popoverRef}
        popover="auto"
        id={popoverId}
        className="dropdown rounded-box bg-base-100 shadow-lg"
        style={{ positionAnchor: anchorName } as CSSProperties}
      >
        <calendar-date ref={calendarRef} className="cally">
          <ChevronLeft slot="previous" size={16} />
          <ChevronRight slot="next" size={16} />
          <calendar-month></calendar-month>
        </calendar-date>
      </div>
    </div>
  );
}
