import { Surface } from '@a2ui/angular';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatLoadingComponent } from '@components/chat-panel/chat-loading/chat-loading.component';
import { ChatService } from '@components/chat-panel/chat.service';
import { ContactFormDialogComponent } from '@components/contact-form-dialog/contact-form-dialog.component';
import { Contact } from '@models/contact';
import { MarkdownPipe } from '@pipes/markdown.pipe';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-chat-panel',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    ProgressSpinnerModule,
    FormsModule,
    Surface,
    ChatLoadingComponent,
    MarkdownPipe,
    ContactFormDialogComponent,
  ],
  providers: [ConfirmationService, ChatService],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ChatPanelComponent {
  readonly #formBuilder = inject(FormBuilder).nonNullable;
  readonly #destroyRef = inject(DestroyRef);
  protected readonly chat = inject(ChatService);

  refreshRequested = output<void>();

  promptInput = this.#formBuilder.control<string>('', [Validators.maxLength(1024)]);
  messagesContainer = viewChild.required<ElementRef>('messagesContainer');

  constructor() {
    effect(() => {
      this.chat.messages();

      const el = this.messagesContainer()?.nativeElement;
      if (!el) return;

      const shouldScroll = this.#isNearBottom(el);

      setTimeout(() => {
        if (shouldScroll) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 50);
    });

    this.chat.refreshRequested$
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => this.refreshRequested.emit());
  }

  send(): void {
    const prompt = this.promptInput.value.trim();
    if (this.promptInput.invalid || this.chat.sending() || !prompt) return;

    this.promptInput.reset();
    this.chat.send(prompt);
  }

  onContactDeleted(contact: Contact): void {
    this.chat.removeContactFromSurfaces(contact.id);
  }

  onContactEdited(contact: Contact): void {
    this.chat.updateContactInSurfaces(contact);
  }

  #isNearBottom(el: HTMLElement): boolean {
    const threshold = 200;
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }
}
