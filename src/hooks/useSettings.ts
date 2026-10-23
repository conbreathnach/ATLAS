import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { isDesktopApp, type AppSettings } from "../types";

export function useSettings(notify: (text: string, kind?: "info" | "error") => void) {
  const [settings, setSettings] = useState<AppSettings>({ defaultModelId: null });

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

  const setDefaultModel = useCallback(
    async (modelId: string | null) => {
      if (!isDesktopApp()) return;
      try {
        setSettings(await api.setDefaultModel(modelId));
        notify(modelId ? "Default model updated." : "Default model cleared.");
      } catch (error) {
        notify(`Could not update the default model: ${error}`, "error");
      }
    },
    [notify],
  );

  return { settings, setDefaultModel, refresh };
}
