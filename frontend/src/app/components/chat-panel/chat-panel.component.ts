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
import { ContactsApi } from '@api/contacts.api';
import { LlmApi } from '@api/llm.api';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { finalize } from 'rxjs/operators';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  surfaceIds?: string[];
}

@Component({
  selector: 'app-chat-panel',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    ConfirmDialogModule,
    ProgressSpinnerModule,
    FormsModule,
    Surface,
  ],
  providers: [ConfirmationService],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  readonly #llmApi = inject(LlmApi);
  readonly #contactsApi = inject(ContactsApi);
  readonly #formBuilder = inject(FormBuilder).nonNullable;
  readonly #messageService = inject(MessageService);
  readonly #confirmationService = inject(ConfirmationService);
  readonly #destroyRef = inject(DestroyRef);
  protected readonly processor = inject(MessageProcessor);

  refreshRequested = output<void>();
  messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hi there! How can I assist you?' },
  ]);
  sending = signal<boolean>(false);
  streamingStarted = signal<boolean>(false);
  inputDisabled = computed(() => this.sending());
  surfaces = signal<ReadonlyMap<string, any>>(new Map());

  promptInput = this.#formBuilder.control<string>('', [Validators.maxLength(1024)]);
  readonly #contactSurfaceMap = new Map<string, string>();

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
      } else if (userAction?.name === 'delete') {
        const id = (userAction.context?.['id'] as string | undefined) ?? '';
        const name = (userAction.context?.['name'] as string | undefined) ?? 'this contact';
        const surfaceId = this.#contactSurfaceMap.get(id);
        this.#confirmationService.confirm({
          message: `Are you sure you want to delete ${name}?`,
          header: 'Confirm Delete',
          icon: 'pi pi-exclamation-triangle',
          rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
          acceptButtonProps: { label: 'Delete', severity: 'danger' },
          accept: () => {
            this.#contactsApi.delete(id).subscribe({
              next: () => {
                this.#messageService.add({
                  severity: 'success',
                  summary: 'Deleted',
                  detail: `${name} deleted`,
                });
                if (surfaceId) {
                  this.processor.processMessages([
                    {
                      surfaceUpdate: {
                        surfaceId,
                        components: [
                          {
                            id: 'actions',
                            component: { List: { children: { explicitList: ['call-btn'] } } },
                          },
                        ],
                      },
                    } as any,
                  ]);
                  this.surfaces.set(new Map(this.processor.getSurfaces()));
                }
                event.completion.next([]);
                event.completion.complete();
                this.refreshRequested.emit();
              },
              error: (err: unknown) => {
                const detail = err instanceof Error ? err.message : 'Delete failed';
                this.#messageService.add({ severity: 'error', summary: 'Error', detail });
                event.completion.next([]);
                event.completion.complete();
              },
            });
          },
          reject: () => {
            event.completion.next([]);
            event.completion.complete();
          },
        });
      }
    });
  }

  send(): void {
    if (this.promptInput.invalid || this.sending()) return;
    const prompt = this.promptInput.value.trim();
    if (!prompt) return;

    this.sending.set(true);
    this.streamingStarted.set(false);
    this.messages.update((arr) => [...arr, { role: 'user', text: prompt }]);
    this.messages.update((arr) => [...arr, { role: 'assistant', text: '' }]);
    const assistantIdx = this.messages().length - 1;

    this.promptInput.reset();
    this.#llmApi
      .sendPromptStream({ prompt })
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (chunk) => {
          if (chunk.type === 'token') {
            if (!this.streamingStarted()) this.streamingStarted.set(true);
            this.messages.update((arr) => {
              const copy = [...arr];
              copy[assistantIdx] = {
                ...copy[assistantIdx],
                text: copy[assistantIdx].text + chunk.text,
              };
              return copy;
            });
          } else if (chunk.type === 'a2ui') {
            const ts = Date.now();
            const backendIds = [
              ...new Set(
                (chunk.messages as any[]).flatMap((msg) =>
                  ['surfaceUpdate', 'dataModelUpdate', 'beginRendering', 'deleteSurface']
                    .map((k) => msg[k]?.surfaceId)
                    .filter(Boolean),
                ),
              ),
            ] as string[];
            const idMap = new Map<string, string>(
              backendIds.map((id, i) => [id, `${id}-${ts}-${i}`]),
            );
            const remapped = (chunk.messages as any[]).map((msg) => {
              const clone = JSON.parse(JSON.stringify(msg));
              for (const key of [
                'surfaceUpdate',
                'dataModelUpdate',
                'beginRendering',
                'deleteSurface',
              ]) {
                if (clone[key]?.surfaceId) {
                  clone[key].surfaceId = idMap.get(clone[key].surfaceId) ?? clone[key].surfaceId;
                }
              }
              return clone;
            });
            this.processor.processMessages(remapped);
            this.surfaces.set(new Map(this.processor.getSurfaces()));
            const surfaceIds = [...idMap.values()];
            for (const msg of remapped) {
              if (msg.surfaceUpdate) {
                const deleteBtn = msg.surfaceUpdate.components?.find(
                  (c: any) => c.id === 'delete-btn',
                );
                const contactId: string | undefined =
                  deleteBtn?.component?.Button?.action?.context?.find((c: any) => c.key === 'id')
                    ?.value?.literalString;
                if (contactId) this.#contactSurfaceMap.set(contactId, msg.surfaceUpdate.surfaceId);
              }
            }
            this.messages.update((arr) => {
              const copy = [...arr];
              copy[assistantIdx] = { ...copy[assistantIdx], surfaceIds };
              return copy;
            });
          } else if (chunk.type === 'done') {
            this.refreshRequested.emit();
          } else if (chunk.type === 'error') {
            this.#messageService.add({
              severity: 'error',
              summary: 'Chat Error',
              detail: chunk.detail,
            });
          }
        },
        error: (err: unknown) => {
          const detail = err instanceof Error ? err.message : 'Failed to send message';
          this.#messageService.add({ severity: 'error', summary: 'Chat Error', detail });
        },
      });
  }
}
