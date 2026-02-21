export type ContactCreate = Omit<Contact, 'id'>;

export type Contact = ContactDto;

export interface ContactDto {
  id: string;
  name: string;
  phoneNumber: string;
}

export function toModel(dto: ContactDto): Contact {
  return { ...dto };
}

export function toDto(model: Partial<Contact>): Partial<ContactDto> {
  return { ...model };
}
