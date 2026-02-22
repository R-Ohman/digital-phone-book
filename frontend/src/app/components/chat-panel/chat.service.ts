import { DispatchedEvent, MessageProcessor } from '@a2ui/angular';
import { Types } from '@a2ui/lit/0.8';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContactsApi } from '@api/contacts.api';
import { LlmApi } from '@api/llm.api';
import { Contact } from '@models/contact';
import { ChatHistoryMessage } from '@models/prompt';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';

type UserAction = NonNullable<Types.A2UIClientEventMessage['userAction']>;

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  surfaceIds?: string[];
}

@Injectable()
export class ChatService {
  readonly #llmApi = inject(LlmApi);
  readonly #contactsApi = inject(ContactsApi);
  readonly #messageService = inject(MessageService);
  readonly #confirmationService = inject(ConfirmationService);
  readonly #destroyRef = inject(DestroyRef);
  readonly processor = inject(MessageProcessor);

  readonly sending = signal<boolean>(false);
  readonly streamingStarted = signal<boolean>(false);
  readonly surfaces = signal<ReadonlyMap<string, Types.Surface>>(new Map());
  readonly editDialogVisible = signal<boolean>(false);
  readonly editingContact = signal<Contact | null>(null);
  readonly messages = signal<ChatMessage[]>([]);

  readonly refreshRequested$ = new Subject<void>();

  readonly #contactSurfaceMap = new Map<string, string>();
  #editSurfaceId = '';

  constructor() {
    this.processor.events.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((event) => {
      this.#handleUserAction(event, event.message.userAction);
    });
  }

  send(prompt: string): void {
    if (this.sending()) return;

    const history: ChatHistoryMessage[] = this.messages()
      .filter((msg) => msg.text)
      .map((msg) => ({ role: msg.role, content: msg.text }));

    this.sending.set(true);
    this.streamingStarted.set(false);
    this.messages.update((arr) => [...arr, { role: 'user', text: prompt }]);
    this.messages.update((arr) => [...arr, { role: 'assistant', text: '' }]);
    const assistantIdx = this.messages().length - 1;

    this.#llmApi
      .sendPromptStream({ prompt, history })
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
            this.#handleA2uiChunk(chunk.messages, assistantIdx);
          } else if (chunk.type === 'done') {
            this.refreshRequested$.next();
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

  onEditSubmit(contact: Contact): void {
    this.editDialogVisible.set(false);
    const surfaceId = this.#editSurfaceId;
    if (!surfaceId) {
      this.refreshRequested$.next();
      return;
    }

    this.processor.processMessages([
      {
        surfaceUpdate: {
          surfaceId,
          components: [
            {
              id: 'name-text',
              component: {
                Text: { text: { literalString: contact.name }, usageHint: 'h2' },
              },
            },
            {
              id: 'phone-text',
              component: { Text: { text: { literalString: contact.phoneNumber } } },
            },
            {
              id: 'call-btn',
              component: {
                Button: {
                  child: 'call-btn-label',
                  action: {
                    name: 'call',
                    context: [{ key: 'phone', value: { literalString: contact.phoneNumber } }],
                  },
                },
              },
            },
            {
              id: 'edit-btn',
              component: {
                Button: {
                  child: 'edit-btn-label',
                  action: {
                    name: 'edit',
                    context: [
                      { key: 'id', value: { literalString: contact.id } },
                      { key: 'name', value: { literalString: contact.name } },
                      { key: 'phone', value: { literalString: contact.phoneNumber } },
                      { key: 'surfaceId', value: { literalString: surfaceId } },
                    ],
                  },
                },
              },
            },
            {
              id: 'delete-btn',
              component: {
                Button: {
                  child: 'delete-btn-label',
                  action: {
                    name: 'delete',
                    context: [
                      { key: 'id', value: { literalString: contact.id } },
                      { key: 'name', value: { literalString: contact.name } },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      {
        dataModelUpdate: {
          surfaceId,
          contents: [
            { key: 'name', valueString: contact.name },
            { key: 'phone', valueString: contact.phoneNumber },
          ],
        },
      },
    ]);
    this.surfaces.set(new Map(this.processor.getSurfaces()));
    this.#contactSurfaceMap.set(contact.id, surfaceId);
    this.refreshRequested$.next();
  }

  #handleA2uiChunk(messages: Types.ServerToClientMessage[], assistantIdx: number): void {
    const backendIds = [
      ...new Set(
        messages.flatMap((msg) =>
          [
            msg.surfaceUpdate?.surfaceId,
            msg.dataModelUpdate?.surfaceId,
            msg.beginRendering?.surfaceId,
            msg.deleteSurface?.surfaceId,
          ].filter((id): id is string => Boolean(id)),
        ),
      ),
    ];

    this.processor.processMessages(messages);
    this.surfaces.set(new Map(this.processor.getSurfaces()));

    for (const msg of messages) {
      if (msg.surfaceUpdate) {
        const deleteBtn = msg.surfaceUpdate.components?.find((c) => c.id === 'delete-btn');
        const buttonComp = deleteBtn?.component as
          | {
              Button?: {
                action?: { context?: Array<{ key: string; value?: { literalString?: string } }> };
              };
            }
          | undefined;
        const contactId = buttonComp?.Button?.action?.context?.find((c) => c.key === 'id')?.value
          ?.literalString;
        if (contactId) this.#contactSurfaceMap.set(contactId, msg.surfaceUpdate.surfaceId);
      }
    }

    this.messages.update((arr) => {
      const copy = [...arr];
      copy[assistantIdx] = { ...copy[assistantIdx], surfaceIds: [...backendIds] };
      return copy;
    });
  }

  #removeSurface(surfaceId: string): void {
    this.processor.processMessages([{ deleteSurface: { surfaceId } }]);
    this.surfaces.set(new Map(this.processor.getSurfaces()));
    this.messages.update((arr) =>
      arr.map((msg) => ({
        ...msg,
        surfaceIds: msg.surfaceIds?.filter((id) => id !== surfaceId),
      })),
    );
  }

  #handleUserAction(event: DispatchedEvent, userAction: UserAction | undefined): void {
    if (userAction?.name === 'call') {
      const phone = (userAction.context?.['phone'] as string | undefined) ?? '';
      if (phone) window.location.href = `tel:${phone.replace(/\s+/g, '')}`;
      event.completion.next([]);
      event.completion.complete();
      return;
    }

    if (userAction?.name === 'close') {
      const surfaceId = (userAction.context?.['surfaceId'] as string | undefined) ?? '';
      if (surfaceId) this.#removeSurface(surfaceId);
      event.completion.next([]);
      event.completion.complete();
      return;
    }

    if (userAction?.name === 'delete') {
      this.#handleDeleteAction(event, userAction);
      return;
    }

    if (userAction?.name === 'confirm-delete') {
      this.#handleConfirmDeleteAction(event, userAction);
      return;
    }

    if (userAction?.name === 'cancel-delete') {
      const surfaceId = (userAction.context?.['surfaceId'] as string | undefined) ?? '';
      if (surfaceId) this.#removeSurface(surfaceId);
      event.completion.next([]);
      event.completion.complete();
      return;
    }

    if (userAction?.name === 'edit') {
      const id = (userAction.context?.['id'] as string | undefined) ?? '';
      const name = (userAction.context?.['name'] as string | undefined) ?? '';
      const phone = (userAction.context?.['phone'] as string | undefined) ?? '';
      const surfaceId = (userAction.context?.['surfaceId'] as string | undefined) ?? '';
      this.#editSurfaceId = surfaceId;
      this.editingContact.set({ id, name, phoneNumber: phone });
      this.editDialogVisible.set(true);
      event.completion.next([]);
      event.completion.complete();
    }
  }

  #handleDeleteAction(event: DispatchedEvent, userAction: UserAction): void {
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
                },
              ]);
              this.surfaces.set(new Map(this.processor.getSurfaces()));
            }
            event.completion.next([]);
            event.completion.complete();
            this.refreshRequested$.next();
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

  #handleConfirmDeleteAction(event: DispatchedEvent, userAction: UserAction): void {
    const id = (userAction.context?.['id'] as string | undefined) ?? '';
    const name = (userAction.context?.['name'] as string | undefined) ?? 'this contact';
    const surfaceId = (userAction.context?.['surfaceId'] as string | undefined) ?? '';

    this.#contactsApi.delete(id).subscribe({
      next: () => {
        this.#messageService.add({
          severity: 'success',
          summary: 'Deleted',
          detail: `${name} deleted`,
        });
        if (surfaceId) this.#removeSurface(surfaceId);
        event.completion.next([]);
        event.completion.complete();
        this.refreshRequested$.next();
      },
      error: (err: unknown) => {
        const detail = err instanceof Error ? err.message : 'Delete failed';
        this.#messageService.add({ severity: 'error', summary: 'Error', detail });
        event.completion.next([]);
        event.completion.complete();
      },
    });
  }
}
