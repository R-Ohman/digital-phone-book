import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { ProgressSpinner } from 'primeng/progressspinner';

@Component({
  selector: 'app-chat-loading',
  imports: [ProgressSpinner],
  templateUrl: './chat-loading.component.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatLoadingComponent implements OnInit, OnDestroy {
  textOptions = ['Collecting data', 'Thinking', 'Almost there'];
  intervalId!: number;
  text = signal<string>(this.textOptions[0]);

  ngOnInit(): void {
    let idx = 0;
    const interval = 2000;

    this.intervalId = setInterval(() => {
      this.text.set(this.textOptions[idx]);
      idx = (idx + 1) % this.textOptions.length;
    }, interval);

    setTimeout(() => {
      setInterval(() => {
        this.text.update((t) => t + '.');
      }, interval / 4);
    }, interval / 4);
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
  }
}
