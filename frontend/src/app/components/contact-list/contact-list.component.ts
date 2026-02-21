import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ContactsApi } from '@api/contacts.api';
import { finalize } from 'rxjs/operators';
import { Contact } from '@models/contact';
import { ContactFormComponent } from '../contact-form/contact-form.component';

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
    ContactFormComponent,
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
  dialogVisible = signal<boolean>(false);
  saving = signal<boolean>(false);
  editing = signal<boolean>(false);
  selected = signal<Contact | null>(null);

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
    this.editing.set(false);
    this.selected.set(null);
    this.dialogVisible.set(true);
  }

  openEdit(contact: Contact): void {
    this.editing.set(true);
    this.selected.set(contact);
    this.dialogVisible.set(true);
  }

  onSubmit(value: { name: string; phoneNumber: string }): void {
    if (this.saving()) return;
    this.saving.set(true);
    const req$ =
      this.editing() && this.selected()
        ? this.#contactsApi.update(this.selected()!.id, value)
        : this.#contactsApi.create(value);

    req$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.#messageService.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Contact saved',
        });
        this.dialogVisible.set(false);
        this.refresh();
      },
      error: (err: unknown) => this.#showError(err, 'Save failed'),
    });
  }

  onCancel(): void {
    if (!this.saving()) {
      this.dialogVisible.set(false);
    }
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
      },
      acceptButtonProps: {
        label: 'Delete',
        severity: 'danger',
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
