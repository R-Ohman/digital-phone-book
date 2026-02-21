import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Prompt, PromptResponse } from '@models/prompt';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LlmApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/llm';

  sendPrompt(prompt: Prompt): Observable<PromptResponse> {
    return this.#http.post<PromptResponse>(`${this.#base}/prompt`, prompt);
  }
}
