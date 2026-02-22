import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { ContactsApi } from '@api/contacts.api';
import { Contact, ContactCreate } from '@models/contact';
import { MessageService } from 'primeng/api';
import { Dialog } from 'primeng/dialog';
import { finalize } from 'rxjs';
import { ContactFormComponent } from './contact-form/contact-form.component';

@Component({
  selector: 'app-contact-form-dialog',
  imports: [ContactFormComponent, Dialog],
  templateUrl: './contact-form-dialog.component.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactFormDialogComponent {
  readonly #contactsApi = inject(ContactsApi);
  readonly #messageService = inject(MessageService);

  show = input.required<boolean>();
  contact = input<Contact>();

  submit = output<Contact>();
  close = output<void>();

  protected saving = signal<boolean>(false);
  protected editing = computed<boolean>(() => !!this.contact());

  onSubmit(contact: ContactCreate): void {
    if (this.saving()) return;
    this.saving.set(true);
    const req$ =
      this.editing() && this.contact()
        ? this.#contactsApi.update(this.contact()!.id, contact)
        : this.#contactsApi.create(contact);

    req$.pipe(finalize(() => this.saving.set(false))).subscribe((saved) => {
      this.#messageService.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Contact saved',
      });
      this.submit.emit(saved);
    });
  }

  onClose(): void {
    if (!this.saving()) {
      this.close.emit();
    }
  }
}
