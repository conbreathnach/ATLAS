import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ChatMessage,
  Conversation,
  GenerationSettings,
  LocalModel,
  TokenPayload,
} from "./types";

export const api = {
  listModels: () => invoke<LocalModel[]>("list_models"),
  importModel: (sourcePath: string) => invoke<LocalModel>("import_model", { sourcePath }),
  deleteModel: (modelId: string) => invoke<void>("delete_model", { modelId }),

  listConversations: () => invoke<Conversation[]>("list_conversations"),
  createConversation: () => invoke<Conversation>("create_conversation"),
  appendMessage: (conversationId: string, message: ChatMessage) =>
    invoke<Conversation>("append_message", { conversationId, message }),
  removeLastMessage: (conversationId: string) =>
    invoke<Conversation>("remove_last_message", { conversationId }),
  updateConversationSettings: (conversationId: string, settings: GenerationSettings) =>
    invoke<Conversation>("update_conversation_settings", { conversationId, settings }),
  setConversationModel: (conversationId: string, modelId: string) =>
    invoke<Conversation>("set_conversation_model", { conversationId, modelId }),
  renameConversation: (conversationId: string, title: string) =>
    invoke<void>("rename_conversation", { conversationId, title }),
  deleteConversation: (conversationId: string) =>
    invoke<void>("delete_conversation", { conversationId }),
  clearConversations: () => invoke<void>("clear_conversations"),

  generateResponse: (
    requestId: string,
    conversationId: string,
    modelId: string,
    messages: ChatMessage[],
    settings: GenerationSettings,
  ) =>
    invoke<string>("generate_response", {
      requestId,
      conversationId,
      modelId,
      messages,
      settings,
    }),
  stopGeneration: (requestId: string) => invoke<void>("stop_generation", { requestId }),

  getSettings: () => invoke<AppSettings>("get_settings"),
  setDefaultModel: (modelId: string | null) =>
    invoke<AppSettings>("set_default_model", { modelId }),
};

export function onToken(handler: (payload: TokenPayload) => void): Promise<UnlistenFn> {
  return listen<TokenPayload>("atlas://token", (event) => handler(event.payload));
}
