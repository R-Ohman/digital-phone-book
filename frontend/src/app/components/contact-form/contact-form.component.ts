import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { Contact, ContactCreate } from '@models/contact';
import { ContactFormBuilder } from '@components/contact-form/contact-form-builder.service';

type ContactForm = FormGroup<{ name: FormControl<string>; phoneNumber: FormControl<string> }>;

@Component({
  selector: 'app-contact-form',
  imports: [CommonModule, ReactiveFormsModule, InputTextModule, ButtonModule],
  templateUrl: './contact-form.component.html',
  styleUrl: './contact-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactFormComponent {
  readonly #contactFormBuilder = inject(ContactFormBuilder);

  model = input<Contact>();

  submit = output<ContactCreate>();
  cancel = output<void>();

  protected form = signal<ContactForm>(this.#contactFormBuilder.build());

  constructor() {
    effect(() => {
      this.form.set(this.#contactFormBuilder.build(this.model()));
    });
  }

  onSubmit(): void {
    if (this.form().invalid) return;

    this.submit.emit(this.#contactFormBuilder.toValue(this.form()));
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
