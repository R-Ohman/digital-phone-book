import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToolbarModule } from 'primeng/toolbar';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ContactsApi } from '@api/contacts.api';
import { finalize } from 'rxjs/operators';
import { Contact } from '@models/contact';

@Component({
  selector: 'app-contact-list',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    ToolbarModule,
    ConfirmDialogModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './contact-list.component.html',
  styleUrl: './contact-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactListComponent implements OnInit {
  // State signals
  contacts = signal<Contact[]>([]);
  loading = signal<boolean>(false);
  dialogVisible = signal<boolean>(false);
  saving = signal<boolean>(false);
  editing = signal<boolean>(false);
  selected = signal<Contact | null>(null);
  formDisabled = computed(() => this.saving() || this.loading());
  readonly #contactsApi = inject(ContactsApi);
  readonly #confirmationService = inject(ConfirmationService);
  readonly #messageService = inject(MessageService);
  readonly #formBuilder = inject(FormBuilder).nonNullable;
  // Reactive form
  form: FormGroup = this.#formBuilder.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    phoneNumber: ['', [Validators.required, Validators.maxLength(20)]],
  });

  constructor() {
    // When switching selected/editing, patch form
    effect(() => {
      const contact = this.selected();
      if (contact) {
        this.form.reset({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
        });
      } else {
        this.form.reset({ name: '', phoneNumber: '' });
      }
    });
  }

  get submitDisabled() {
    return this.form.invalid || this.formDisabled();
  }

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

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const value = {
      name: String(this.form.get('name')!.value).trim(),
      phoneNumber: String(this.form.get('phoneNumber')!.value).trim(),
    };
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

  confirmDelete(contact: Contact): void {
    this.#confirmationService.confirm({
      message: `Delete ${contact.name}?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
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
