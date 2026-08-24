"use client";

import { useCallback, useEffect, useState } from "react";
import type { Birthday } from "@/types/electron-api";

// Plain hook, not a Context/Provider — same reasoning as useNotes() in
// notes.ts. The dock button needs this data too (to show today's badge), so
// unlike notes it's not lazy-loaded only when a screen mounts.
export function useBirthdays() {
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.birthdays.list().then((value) => {
      setBirthdays(value);
      setLoading(false);
    });
  }, []);

  const saveBirthday = useCallback((birthday: Birthday) => {
    setBirthdays((prev) => {
      const exists = prev.some((b) => b.id === birthday.id);
      return exists ? prev.map((b) => (b.id === birthday.id ? birthday : b)) : [...prev, birthday];
    });
    window.electronAPI.birthdays.save(birthday);
  }, []);

  const deleteBirthday = useCallback((id: string) => {
    setBirthdays((prev) => prev.filter((b) => b.id !== id));
    window.electronAPI.birthdays.delete(id);
  }, []);

  return { birthdays, loading, saveBirthday, deleteBirthday };
}
