import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { isDesktopApp, type Conversation } from "../types";

export function useConversations(notify: (text: string, kind?: "info" | "error") => void) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!isDesktopApp()) return;
    try {
      const saved = await api.listConversations();
      setConversations(saved);
      setActiveId((currentActive) =>
        saved.some((item) => item.id === currentActive)
          ? currentActive
          : (saved[0]?.id ?? null),
      );
    } catch (error) {
      notify(`Could not load conversations: ${error}`, "error");
    }
  }, [notify]);

  useEffect(() => {
    if (!isDesktopApp()) {
      setLoaded(true);
      return;
    }
    void refresh().finally(() => setLoaded(true));
  }, [refresh]);

  const upsert = useCallback((conversation: Conversation) => {
    setConversations((current) => {
      const exists = current.some((item) => item.id === conversation.id);
      const next = exists
        ? current.map((item) => (item.id === conversation.id ? conversation : item))
        : [conversation, ...current];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const create = useCallback(async (): Promise<Conversation | null> => {
    if (!isDesktopApp()) return null;
    try {
      const conversation = await api.createConversation();
      upsert(conversation);
      setActiveId(conversation.id);
      return conversation;
    } catch (error) {
      notify(`Could not create the conversation: ${error}`, "error");
      return null;
    }
  }, [notify, upsert]);

  const remove = useCallback(
    async (conversationId: string) => {
      if (!isDesktopApp()) return;
      try {
        await api.deleteConversation(conversationId);
        setConversations((current) => {
          const next = current.filter((item) => item.id !== conversationId);
          setActiveId((currentActive) =>
            currentActive === conversationId ? (next[0]?.id ?? null) : currentActive,
          );
          return next;
        });
      } catch (error) {
        notify(`Could not delete the conversation: ${error}`, "error");
      }
    },
    [notify],
  );

  const clearAll = useCallback(async () => {
    if (!isDesktopApp()) return;
    try {
      await api.clearConversations();
      setConversations([]);
      setActiveId(null);
      notify("All conversations cleared.");
    } catch (error) {
      notify(`Could not clear conversations: ${error}`, "error");
    }
  }, [notify]);

  const rename = useCallback(
    async (conversationId: string, title: string) => {
      if (!isDesktopApp() || !title.trim()) return;
      try {
        await api.renameConversation(conversationId, title);
        setConversations((current) =>
          current.map((item) => (item.id === conversationId ? { ...item, title: title.trim() } : item)),
        );
      } catch (error) {
        notify(`Could not rename the conversation: ${error}`, "error");
      }
    },
    [notify],
  );

  const active = conversations.find((item) => item.id === activeId) ?? null;

  return {
    conversations,
    active,
    activeId,
    loaded,
    setActiveId,
    upsert,
    refresh,
    create,
    remove,
    clearAll,
    rename,
  };
}
