import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
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

  readonly contactDeleted = output<Contact>();
  readonly contactEdited = output<Contact>();

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
      .subscribe((data) => this.contacts.set(data));
  }

  openAdd(): void {
    this.selectedContact.set(null);
    this.contactFormVisible.set(true);
  }

  openEdit(contact: Contact): void {
    this.selectedContact.set(contact);
    this.contactFormVisible.set(true);
  }

  onSubmit(contact: Contact): void {
    this.contactFormVisible.set(false);
    if (this.selectedContact()) {
      this.contactEdited.emit(contact);
    }
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
      .subscribe(() => {
        this.#messageService.add({
          severity: 'success',
          summary: 'Deleted',
          detail: 'Contact deleted',
        });
        this.contactDeleted.emit(contact);
        this.refresh();
      });
  }
}
