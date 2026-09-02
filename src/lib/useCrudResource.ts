"use client";

import { useCallback, useEffect, useState } from "react";

export interface CrudApi<T extends { id: string }> {
  list: () => Promise<T[]>;
  save: (item: T) => unknown;
  delete: (id: string) => unknown;
}

// Shared shape behind useNotes/useBirthdays: local list + loading, optimistic
// save ("exists → replace in place, otherwise → append") and delete against a
// remote API. Anything a resource needs beyond this — Drive auto-sync, an
// onChanged listener, a refresh token, timestamp stamping — stays layered on
// top in that resource's own hook, not here (e.g. birthdays' API has no
// onChanged at all, so this factory can't assume one).
//
// Takes a getter, not the api object itself: callers pass a module-level
// function (stable identity across renders, see birthdays.ts/notes.ts) that
// only touches `window.electronAPI` when actually invoked, inside an effect
// or callback — never at render time. Next's static export prerenders this
// "use client" hook on the server too, where `window` doesn't exist;
// resolving `window.electronAPI.x` as a plain argument expression at the
// call site would crash that prerender.
export function useCrudResource<T extends { id: string }>(getApi: () => CrudApi<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    return getApi().list().then((value) => {
      setItems(value);
      setLoading(false);
      return value;
    });
  }, [getApi]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    (item: T) => {
      setItems((prev) => {
        const exists = prev.some((i) => i.id === item.id);
        return exists ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item];
      });
      getApi().save(item);
    },
    [getApi],
  );

  const remove = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      getApi().delete(id);
    },
    [getApi],
  );

  return { items, loading, save, remove, refresh };
}
