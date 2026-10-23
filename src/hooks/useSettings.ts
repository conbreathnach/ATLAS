import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { isDesktopApp, type AppSettings } from "../types";

export function useSettings(notify: (text: string, kind?: "info" | "error") => void) {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const refresh = useCallback(async () => {
    if (!isDesktopApp()) return;
    try {
      setSettings(await api.getSettings());
    } catch (error) {
      notify(`Could not load settings: ${error}`, "error");
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apply appearance immediately whenever settings change.
  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
  }, [settings]);

  const update = useCallback(
    async (next: AppSettings) => {
      setSettings(next); // optimistic: theme changes feel instant
      if (!isDesktopApp()) return;
      try {
        setSettings(await api.updateAppSettings(next));
      } catch (error) {
        notify(`Could not save settings: ${error}`, "error");
        void refresh();
      }
    },
    [notify, refresh],
  );

  const setDefaultModel = useCallback(
    async (modelId: string | null) => {
      if (!isDesktopApp()) return;
      try {
        setSettings(await api.setDefaultModel(modelId));
      } catch (error) {
        notify(`Could not update the default model: ${error}`, "error");
      }
    },
    [notify],
  );

  return { settings, update, setDefaultModel, refresh };
}
