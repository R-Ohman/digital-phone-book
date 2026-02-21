import { inject, Injectable } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Contact, ContactCreate } from '@models/contact';

export type ContactForm = FormGroup<{
  name: FormControl<string>;
  phoneNumber: FormControl<string>;
}>;

@Injectable({ providedIn: 'root' })
export class ContactFormBuilder {
  readonly #formBuilder = inject(FormBuilder).nonNullable;

  build(contact?: Contact): ContactForm {
    return this.#formBuilder.group({
      name: this.#formBuilder.control(contact?.name ?? '', [
        Validators.required,
        Validators.maxLength(100),
      ]),
      phoneNumber: this.#formBuilder.control(contact?.phoneNumber ?? '', [
        Validators.required,
        Validators.pattern(/^(\+)?\d+$/),
        Validators.minLength(3),
        Validators.maxLength(20),
      ]),
    });
  }

  toValue(form: ContactForm): ContactCreate {
    return {
      ...form.getRawValue(),
    };
  }
}
