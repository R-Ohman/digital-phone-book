import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { Contact, ContactDto, toDto, toModel } from '@models/contact';

@Injectable({ providedIn: 'root' })
export class ContactsApi {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/contacts';

  getAll(): Observable<Contact[]> {
    return this.#http.get<ContactDto[]>(this.#base).pipe(map((dtos) => dtos.map(toModel)));
  }

  create(contact: Omit<Contact, 'id'>): Observable<Contact> {
    return this.#http.post<ContactDto>(this.#base, toDto(contact)).pipe(map(toModel));
  }

  update(id: string, contact: Partial<Contact>): Observable<Contact> {
    return this.#http.patch<ContactDto>(`${this.#base}/${id}`, toDto(contact)).pipe(map(toModel));
  }

  delete(id: string): Observable<void> {
    return this.#http.delete<void>(`${this.#base}/${id}`);
  }
}
