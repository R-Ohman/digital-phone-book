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
    this.refreshRequested$.next();
  }

  removeContactFromSurfaces(contactId: string): void {
    const allSurfaces = this.processor.getSurfaces();
    const surfaceMessages: Types.ServerToClientMessage[] = [];
    const deletedSurfaceIds: string[] = [];

    for (const [surfaceId] of allSurfaces) {
      if (surfaceId.startsWith('contact-card-') && surfaceId.endsWith(contactId)) {
        surfaceMessages.push({
          surfaceUpdate: {
            surfaceId,
            components: [
              {
                id: 'actions',
                component: { List: { children: { explicitList: ['call-btn'] } } },
              },
            ],
          },
        });
      } else if (surfaceId.startsWith('delete-confirm-') && surfaceId.endsWith(contactId)) {
        surfaceMessages.push({ deleteSurface: { surfaceId } });
        deletedSurfaceIds.push(surfaceId);
      }
    }

    if (surfaceMessages.length) {
      this.processor.processMessages(surfaceMessages);
      this.surfaces.set(new Map(this.processor.getSurfaces()));
    }

    if (deletedSurfaceIds.length) {
      this.messages.update((arr) =>
        arr.map((msg) => ({
          ...msg,
          surfaceIds: msg.surfaceIds?.filter((id) => !deletedSurfaceIds.includes(id)),
        })),
      );
    }
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
      this.#removeSurface(userAction.surfaceId);
      event.completion.next([]);
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
      this.#removeSurface(userAction.surfaceId);
      event.completion.next([]);
      return;
    }

    if (userAction?.name === 'edit') {
      const id = (userAction.context?.['id'] as string | undefined) ?? '';
      const name = (userAction.context?.['name'] as string | undefined) ?? '';
      const phone = (userAction.context?.['phone'] as string | undefined) ?? '';
      this.#editSurfaceId = userAction.surfaceId;
      this.editingContact.set({ id, name, phoneNumber: phone });
      this.editDialogVisible.set(true);
      event.completion.next([]);
    }
  }

  #handleDeleteAction(event: DispatchedEvent, userAction: UserAction): void {
    const id = (userAction.context?.['id'] as string | undefined) ?? '';
    const name = (userAction.context?.['name'] as string | undefined) ?? 'this contact';

    this.#confirmationService.confirm({
      message: `Are you sure you want to delete ${name}?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', rounded: true, outlined: true },
      acceptButtonProps: { label: 'Delete', severity: 'danger', rounded: true },
      accept: () => {
        this.#contactsApi.delete(id).subscribe({
          next: () => {
            this.#messageService.add({
              severity: 'success',
              summary: 'Deleted',
              detail: `${name} deleted`,
            });
            this.removeContactFromSurfaces(id);
            event.completion.next([]);
            event.completion.complete();
            this.refreshRequested$.next();
          },
          error: () => {
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

    this.#contactsApi.delete(id).subscribe({
      next: () => {
        this.#messageService.add({
          severity: 'success',
          summary: 'Deleted',
          detail: `${name} deleted`,
        });
        this.removeContactFromSurfaces(id);
        event.completion.next([]);
        event.completion.complete();
        this.refreshRequested$.next();
      },
      error: () => {
        event.completion.next([]);
        event.completion.complete();
      },
    });
  }

  updateContactInSurfaces(contact: Contact): void {
    const allSurfaces = this.processor.getSurfaces();
    const surfaceMessages: Types.ServerToClientMessage[] = [];

    for (const [surfaceId] of allSurfaces) {
      if (surfaceId.endsWith(contact.id)) {
        surfaceMessages.push({
          dataModelUpdate: {
            surfaceId,
            contents: [
              { key: 'name', valueString: contact.name },
              { key: 'phone', valueString: contact.phoneNumber },
            ],
          },
        });
      }
    }

    if (surfaceMessages.length) {
      this.processor.processMessages(surfaceMessages);
      this.surfaces.set(new Map(this.processor.getSurfaces()));
    }
  }
}
