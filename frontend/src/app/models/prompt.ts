export interface Prompt {
  prompt: string;
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
