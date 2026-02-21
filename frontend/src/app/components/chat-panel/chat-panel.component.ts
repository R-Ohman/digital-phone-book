import { MessageProcessor, Surface } from '@a2ui/angular';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { LlmApi } from '@api/llm.api';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
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
    Surface,
  ],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  refreshRequested = output<void>();
  messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hi there! How can I assist you?' },
  ]);
  sending = signal<boolean>(false);
  inputDisabled = computed(() => this.sending());
  surfaces = signal<ReadonlyMap<string, any>>(new Map());

  readonly #llmApi = inject(LlmApi);
  readonly #formBuilder = inject(FormBuilder).nonNullable;
  readonly #messageService = inject(MessageService);
  readonly #destroyRef = inject(DestroyRef);
  protected readonly processor = inject(MessageProcessor);

  promptInput = this.#formBuilder.control<string>('', [Validators.maxLength(1024)]);

  constructor() {
    this.processor.events.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((event) => {
      const userAction = (event.message as any)?.userAction;
      if (userAction?.name === 'call') {
        const phone = (userAction.context?.['phone'] as string | undefined) ?? '';
        if (phone) {
          window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
        }
        event.completion.next([]);
        event.completion.complete();
      }
    });
  }

  send(): void {
    if (this.promptInput.invalid || this.sending()) return;
    const prompt = this.promptInput.value.trim();
    if (!prompt) return;

    this.sending.set(true);
    this.messages.update((arr) => [...arr, { role: 'user', text: prompt }]);

    this.promptInput.reset();
    this.#llmApi
      .sendPrompt({ prompt })
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (res) => {
          if (res.a2UiMessages?.length) {
            this.processor.clearSurfaces();
            this.processor.processMessages(res.a2UiMessages as any[]);
            this.surfaces.set(this.processor.getSurfaces());
          }
          this.messages.update((arr) => [...arr, { role: 'assistant', text: res.message }]);
          this.refreshRequested.emit();
        },
        error: (err: unknown) => {
          const detail = err instanceof Error ? err.message : 'Failed to send message';
          this.#messageService.add({ severity: 'error', summary: 'Chat Error', detail });
        },
      });
  }
}
