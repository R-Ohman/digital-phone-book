import { ChangeDetectionStrategy, Component, viewChild, ViewEncapsulation } from '@angular/core';
import { ChatPanelComponent } from '@components/chat-panel/chat-panel.component';
import { ContactListComponent } from '@components/contact-list/contact-list.component';
import { Contact } from '@models/contact';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SplitterModule } from 'primeng/splitter';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [
    SplitterModule,
    ToastModule,
    ConfirmDialogModule,
    ContactListComponent,
    ChatPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class AppComponent {
  contactList = viewChild.required<ContactListComponent>(ContactListComponent);
  chatPanel = viewChild.required<ChatPanelComponent>(ChatPanelComponent);

  onChatRefresh(): void {
    this.contactList().refresh();
  }

  onContactDeleted(contact: Contact): void {
    this.chatPanel().onContactDeleted(contact);
  }

  onContactEdited(contact: Contact): void {
    this.chatPanel().onContactEdited(contact);
  }
}
