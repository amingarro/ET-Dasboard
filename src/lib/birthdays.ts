"use client";

import { useCrudResource } from "@/lib/useCrudResource";
import type { Birthday } from "@/types/electron-api";

// Module-level, not inline at the call site: a stable function identity
// across renders (see useCrudResource's own comment on why), and one that
// only touches `window.electronAPI` when actually invoked rather than as
// soon as useBirthdays() renders — Next's static export prerenders this
// "use client" hook on the server too, where `window` doesn't exist yet.
function getBirthdaysApi() {
  return window.electronAPI.birthdays;
}

// Plain hook, not a Context/Provider — same reasoning as useNotes() in
// notes.ts. The dock button needs this data too (to show today's badge), so
// unlike notes it's not lazy-loaded only when a screen mounts.
export function useBirthdays() {
  const { items, loading, save, remove } = useCrudResource<Birthday>(getBirthdaysApi);

  return { birthdays: items, loading, saveBirthday: save, deleteBirthday: remove };
}
