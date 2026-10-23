import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { isDesktopApp, type LocalModel } from "../types";

export function useModels(notify: (text: string, kind?: "info" | "error") => void) {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDesktopApp()) return;
    try {
      setModels(await api.listModels());
    } catch (error) {
      notify(`Could not load the model library: ${error}`, "error");
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importModel = useCallback(async () => {
    if (!isDesktopApp()) {
      notify("Open ATLAS as a desktop app to import models.", "error");
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "GGUF model", extensions: ["gguf"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setImporting(true);
      const imported = await api.importModel(selected);
      setModels((current) => [...current, imported]);
      notify(`${imported.fileName} added to your library.`);
    } catch (error) {
      notify(`Could not import the model: ${error}`, "error");
    } finally {
      setImporting(false);
    }
  }, [notify]);

  const deleteModel = useCallback(
    async (modelId: string) => {
      if (!isDesktopApp()) return;
      try {
        setDeletingId(modelId);
        await api.deleteModel(modelId);
        setModels((current) => current.filter((model) => model.id !== modelId));
        notify("Model removed from the library.");
      } catch (error) {
        notify(`Could not remove the model: ${error}`, "error");
      } finally {
        setDeletingId(null);
      }
    },
    [notify],
  );

  return { models, importing, deletingId, refresh, importModel, deleteModel };
}
