"use client";

import { useEffect } from "react";

import { useAppSettingsStore } from "@/lib/stores/app-settings-store";

export function AppSettingsHydrator() {
  const hydrate = useAppSettingsStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return null;
}
