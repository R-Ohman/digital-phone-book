import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ContactsApi } from '@api/contacts.api';
import { ContactFormDialogComponent } from '@components/contact-form-dialog/contact-form-dialog.component';
import { Contact } from '@models/contact';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { ToolbarModule } from 'primeng/toolbar';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-contact-list',
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    DialogModule,
    ToolbarModule,
    ConfirmDialogModule,
    ProgressSpinnerModule,
    ConfirmPopup,
    ContactFormDialogComponent,
    ProgressBarModule,
  ],
  templateUrl: './contact-list.component.html',
  styleUrl: './contact-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactListComponent implements OnInit {
  readonly #contactsApi = inject(ContactsApi);
  readonly #confirmationService = inject(ConfirmationService);
  readonly #messageService = inject(MessageService);

  contacts = signal<Contact[]>([]);
  loading = signal<boolean>(false);
  contactFormVisible = signal<boolean>(false);
  selectedContact = signal<Contact | null>(null);

  constructor() {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.#contactsApi
      .getAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.contacts.set(data),
        error: (err: unknown) => this.#showError(err, 'Could not load contacts'),
      });
  }

  openAdd(): void {
    this.selectedContact.set(null);
    this.contactFormVisible.set(true);
  }

  openEdit(contact: Contact): void {
    this.selectedContact.set(contact);
    this.contactFormVisible.set(true);
  }

  onSubmit(): void {
    this.contactFormVisible.set(false);
    this.refresh();
  }

  confirmDelete(contact: Contact, event: Event): void {
    this.#confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message: `Are you sure you want to delete ${contact.name}?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: {
        label: 'Cancel',
        severity: 'secondary',
        outlined: true,
        rounded: true,
      },
      acceptButtonProps: {
        label: 'Delete',
        severity: 'danger',
        rounded: true,
      },
      accept: () => this.#delete(contact),
    });
  }

  #delete(contact: Contact): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.#contactsApi
      .delete(contact.id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.#messageService.add({
            severity: 'success',
            summary: 'Deleted',
            detail: 'Contact deleted',
          });
          this.refresh();
        },
        error: (err: unknown) => this.#showError(err, 'Delete failed'),
      });
  }

  #showError(err: unknown, fallback: string): void {
    const detail = err instanceof Error ? err.message : fallback;
    this.#messageService.add({ severity: 'error', summary: 'Error', detail });
  }
}
