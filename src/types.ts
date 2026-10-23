export type View = "chat" | "search" | "models";

export interface LocalModel {
  id: string;
  fileName: string;
  sizeBytes: number;
  importedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface GenerationSettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  contextSize: number;
  systemPrompt: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
  settings: GenerationSettings;
}

export interface AppSettings {
  defaultModelId: string | null;
}

export interface TokenPayload {
  requestId: string;
  conversationId: string;
  token: string;
}

export interface Toast {
  id: number;
  kind: "info" | "error";
  text: string;
}

export const DEFAULT_SETTINGS: GenerationSettings = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 2048,
  contextSize: 8192,
  systemPrompt:
    "You are ATLAS, a helpful private AI assistant running entirely on the user's device. Answer directly, clearly, and concisely.",
};

export function isDesktopApp(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
