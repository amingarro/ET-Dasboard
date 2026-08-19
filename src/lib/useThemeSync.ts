"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function useThemeSync() {
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
