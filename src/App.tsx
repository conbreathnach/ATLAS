import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { api, onToken } from "./api";
import { ChatView } from "./components/ChatView";
import { ModelsView } from "./components/ModelsView";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { ToastStack } from "./components/Toast";
import { useConversations } from "./hooks/useConversations";
import { useModels } from "./hooks/useModels";
import { useSettings } from "./hooks/useSettings";
import { useToast } from "./hooks/useToast";
import type { Conversation, GenerationSettings, View } from "./types";

interface StreamState {
  requestId: string;
  conversationId: string;
  text: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export default function App() {
  const [view, setView] = useState<View>("chat");
  const [stream, setStream] = useState<StreamState | null>(null);
  const { toasts, notify, dismiss } = useToast();
  const { models, importing, deletingId, importModel, deleteModel } = useModels(notify);
  const {
    conversations,
    active,
    activeId,
    setActiveId,
    upsert,
    refresh: refreshConversations,
    create,
    remove,
    clearAll,
    rename,
  } = useConversations(notify);
  const { settings, update: updateAppSettings, setDefaultModel, refresh: refreshSettings } =
    useSettings(notify);
  const defaultModelId = settings?.defaultModelId ?? null;

  const stoppedByUser = useRef(false);
  const creatingChat = useRef(false);
  const settingsSaveTimer = useRef<number | undefined>(undefined);
  const streamRef = useRef<StreamState | null>(null);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Streamed tokens arrive over Tauri events while generation runs; only
  // tokens for the in-flight request are accepted.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    onToken((payload) => {
      setStream((current) =>
        current &&
        current.requestId === payload.requestId &&
        current.conversationId === payload.conversationId
          ? { ...current, text: current.text + payload.token }
          : current,
      );
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Discard pending debounced writes when the app closes or reloads.
  useEffect(() => () => window.clearTimeout(settingsSaveTimer.current), []);

  const cancelPendingSettingsSave = useCallback(() => {
    window.clearTimeout(settingsSaveTimer.current);
    settingsSaveTimer.current = undefined;
  }, []);

  const stopStreamFor = useCallback((conversationId: string) => {
    const current = streamRef.current;
    if (current && current.conversationId === conversationId) {
      stoppedByUser.current = true;
      void api.stopGeneration(current.requestId);
    }
  }, []);

  const runGeneration = useCallback(
    async (conversation: Conversation) => {
      const model =
        models.find((candidate) => candidate.id === conversation.modelId) ??
        models.find((candidate) => candidate.id === defaultModelId) ??
        models[0];
      if (!model) {
        notify("Add a GGUF model in the Models tab first.", "error");
        return;
      }

      const requestId = crypto.randomUUID();
      setStream({ requestId, conversationId: conversation.id, text: "" });
      stoppedByUser.current = false;
      try {
        const response = await api.generateResponse(
          requestId,
          conversation.id,
          model.id,
          conversation.messages,
          conversation.settings,
        );
        // Empty means the user stopped before any token was produced.
        if (response.trim()) {
          const updated = await api.appendMessage(conversation.id, {
            role: "assistant",
            content: response,
            createdAt: nowSeconds(),
          });
          upsert(updated);
        }
      } catch (error) {
        if (!stoppedByUser.current) {
          notify(`The model could not answer: ${error}`, "error");
        }
      } finally {
        stoppedByUser.current = false;
        setStream(null);
      }
    },
    [models, notify, defaultModelId, upsert],
  );

  const send = useCallback(
    async (text: string) => {
      let conversation = active;
      if (!conversation) {
        conversation = await create();
        if (!conversation) return;
      }
      const modelId =
        conversation.modelId ??
        (models.some((m) => m.id === defaultModelId) ? defaultModelId : null) ??
        models[0]?.id ??
        null;
      try {
        if (modelId && modelId !== conversation.modelId) {
          conversation = await api.setConversationModel(conversation.id, modelId);
        }
        conversation = await api.appendMessage(conversation.id, {
          role: "user",
          content: text,
          createdAt: nowSeconds(),
        });
        upsert(conversation);
        await runGeneration(conversation);
      } catch (error) {
        notify(`Could not send the message: ${error}`, "error");
      }
    },
    [active, create, models, notify, runGeneration, defaultModelId, upsert],
  );

  const regenerate = useCallback(async () => {
    if (!active || active.messages.length === 0 || streamRef.current) return;
    try {
      const trimmed = await api.removeLastMessage(active.id);
      upsert(trimmed);
      if (trimmed.messages[trimmed.messages.length - 1]?.role !== "user") return;
      await runGeneration(trimmed);
    } catch (error) {
      notify(`Could not regenerate: ${error}`, "error");
    }
  }, [active, notify, runGeneration, upsert]);

  const stop = useCallback(() => {
    const current = streamRef.current;
    if (!current) return;
    stoppedByUser.current = true;
    void api.stopGeneration(current.requestId);
  }, []);

  const selectModel = useCallback(
    async (modelId: string) => {
      if (!active) return;
      try {
        upsert(await api.setConversationModel(active.id, modelId));
      } catch (error) {
        notify(`Could not set the model: ${error}`, "error");
      }
    },
    [active, notify, upsert],
  );

  const updateSettings = useCallback(
    (generationSettings: GenerationSettings) => {
      if (!active) return;
      upsert({ ...active, settings: generationSettings });
      window.clearTimeout(settingsSaveTimer.current);
      const conversationId = active.id;
      settingsSaveTimer.current = window.setTimeout(() => {
        // A deleted conversation makes this patch fail; that is expected.
        api
          .updateConversationSettings(conversationId, generationSettings)
          .catch(() => {});
      }, 500);
    },
    [active, upsert],
  );

  const newChat = useCallback(async () => {
    if (creatingChat.current) return;
    creatingChat.current = true;
    setView("chat");
    try {
      await create();
    } finally {
      creatingChat.current = false;
    }
  }, [create]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      cancelPendingSettingsSave();
      stopStreamFor(conversationId);
      await remove(conversationId);
    },
    [cancelPendingSettingsSave, remove, stopStreamFor],
  );

  const clearConversations = useCallback(async () => {
    cancelPendingSettingsSave();
    if (streamRef.current) {
      stoppedByUser.current = true;
      void api.stopGeneration(streamRef.current.requestId);
    }
    await clearAll();
  }, [cancelPendingSettingsSave, clearAll]);

  const deleteModelAndRefresh = useCallback(
    async (modelId: string) => {
      await deleteModel(modelId);
      await Promise.all([refreshConversations(), refreshSettings()]);
    },
    [deleteModel, refreshConversations, refreshSettings],
  );

  // Keyboard shortcuts: Ctrl+N new chat, Ctrl+K search, Ctrl+M models.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        void newChat();
      } else if (key === "k") {
        event.preventDefault();
        setView("search");
      } else if (key === "m") {
        event.preventDefault();
        setView("models");
      } else if (key === ",") {
        event.preventDefault();
        setView("settings");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newChat]);

  const streamingHere = stream !== null && stream.conversationId === activeId;

  return (
    <div className="app">
      <Sidebar
        view={view}
        onNavigate={setView}
        conversations={conversations}
        activeId={activeId}
        onNewChat={() => void newChat()}
        onSelectConversation={(id) => {
          setActiveId(id);
          setView("chat");
        }}
        onDeleteConversation={(id) => void deleteConversation(id)}
        onRenameConversation={(id, title) => void rename(id, title)}
        modelCount={models.length}
      />

      <main className="main">
        {view === "chat" && (
          <ChatView
            conversation={active}
            models={models}
            defaultModelId={defaultModelId}
            streamingText={streamingHere ? stream.text : null}
            streaming={streamingHere}
            onSend={(text) => void send(text)}
            onStop={stop}
            onRegenerate={() => void regenerate()}
            onSelectModel={(modelId) => void selectModel(modelId)}
            onUpdateSettings={updateSettings}
            onGoToModels={() => setView("models")}
          />
        )}
        {view === "search" && (
          <SearchView
            conversations={conversations}
            onOpenConversation={(id) => {
              setActiveId(id);
              setView("chat");
            }}
            onClearAll={() => void clearConversations()}
          />
        )}
        {view === "settings" && settings && (
          <SettingsView
            settings={settings}
            models={models}
            onUpdate={(next) => void updateAppSettings(next)}
            onClearChats={() => void clearConversations()}
          />
        )}
        {view === "models" && (
          <ModelsView
            models={models}
            defaultModelId={defaultModelId}
            importing={importing}
            deletingId={deletingId}
            onImport={() => void importModel()}
            onDelete={(modelId) => void deleteModelAndRefresh(modelId)}
            onSetDefault={(modelId) => void setDefaultModel(modelId)}
            onUseInChat={(modelId) => {
              void (async () => {
                const conversation = await create();
                if (conversation) {
                  upsert(await api.setConversationModel(conversation.id, modelId));
                  setView("chat");
                }
              })();
            }}
          />
        )}
      </main>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
