export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Prompt {
  prompt: string;
  history?: ChatHistoryMessage[];
}

export interface PromptResponse {
  message: string;
  a2UiMessages?: any[];
}

export type StreamChunk =
  | { type: 'token'; text: string }
  | { type: 'a2ui'; messages: any[] }
  | { type: 'done' }
  | { type: 'error'; detail: string };
