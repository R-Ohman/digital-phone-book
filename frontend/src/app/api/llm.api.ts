import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Prompt, PromptResponse } from '@models/prompt';

@Injectable({ providedIn: 'root' })
export class LlmApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/llm';

  sendPrompt(prompt: Prompt): Observable<PromptResponse> {
    return this.#http.post<PromptResponse>(`${this.#base}/prompt`, prompt);
  }
}
