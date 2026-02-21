import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Prompt, PromptResponse, StreamChunk } from '@models/prompt';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LlmApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/llm';

  sendPrompt(prompt: Prompt): Observable<PromptResponse> {
    return this.#http.post<PromptResponse>(`${this.#base}/prompt`, prompt);
  }

  sendPromptStream(prompt: Prompt): Observable<StreamChunk> {
    return new Observable<StreamChunk>((observer) => {
      const controller = new AbortController();

      fetch(`${this.#base}/prompt/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prompt),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            observer.error(new Error(`HTTP ${response.status}`));
            return;
          }
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop()!;
            for (const line of lines) {
              if (line.trim()) {
                try {
                  observer.next(JSON.parse(line) as StreamChunk);
                } catch {}
              }
            }
          }
          observer.complete();
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') observer.error(err);
        });

      return () => controller.abort();
    });
  }
}
