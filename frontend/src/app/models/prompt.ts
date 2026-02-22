import { Types } from '@a2ui/lit/0.8';

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
  a2UiMessages?: Types.ServerToClientMessage[];
}

export type StreamChunk =
  | { type: 'token'; text: string }
  | { type: 'a2ui'; messages: Types.ServerToClientMessage[] }
  | { type: 'done' }
  | { type: 'error'; detail: string };
