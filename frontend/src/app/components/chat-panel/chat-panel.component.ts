import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { LlmApi } from '@api/llm.api';
import { finalize } from 'rxjs/operators';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-chat-panel',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    ProgressSpinnerModule,
    FormsModule,
  ],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  refreshRequested = output<void>();
  messages = signal<ChatMessage[]>([]);
  sending = signal<boolean>(false);
  inputDisabled = computed(() => this.sending());
  readonly #llmApi = inject(LlmApi);
  readonly #formBuilder = inject(FormBuilder).nonNullable;
  form = this.#formBuilder.group({
    input: ['', [Validators.maxLength(1024)]],
  });
  readonly #messageService = inject(MessageService);

  send(): void {
    if (this.form.invalid || this.sending()) return;
    const prompt = this.form.controls.input.value.trim();
    if (!prompt) return;

    this.sending.set(true);
    this.messages.update((arr) => [...arr, { role: 'user', text: prompt }]);

    this.#llmApi
      .sendPrompt({ prompt })
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (res) => {
          this.messages.update((arr) => [...arr, { role: 'assistant', text: res.message }]);
          this.form.reset({ input: '' });
          // After any successful response, request a refresh of contacts per requirements
          this.refreshRequested.emit();
        },
        error: (err: unknown) => {
          const detail = err instanceof Error ? err.message : 'Failed to send message';
          this.#messageService.add({ severity: 'error', summary: 'Chat Error', detail });
        },
      });
  }
}
