import { ChangeDetectionStrategy, Component, viewChild, ViewEncapsulation } from '@angular/core';
import { SplitterModule } from 'primeng/splitter';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ContactListComponent } from '@components/contact-list/contact-list.component';
import { ChatPanelComponent } from '@components/chat-panel/chat-panel.component';

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

  onChatRefresh(): void {
    this.contactList().refresh();
  }
}
