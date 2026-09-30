import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../services/toast';
import { ConfirmService } from '../../services/confirm';

// Placed once in app.html. Shows short messages (toasts) and the confirmation dialog.
@Component({
  selector: 'app-toast-host',
  imports: [RouterLink],
  templateUrl: './toast-host.html',
  styleUrl: './toast-host.css'
})
export class ToastHost {
  toastService = inject(ToastService);
  confirm = inject(ConfirmService);

  private okButton = viewChild<ElementRef<HTMLButtonElement>>('okButton');
  private promptBox = viewChild<ElementRef<HTMLTextAreaElement>>('promptBox');

  constructor() {
    // Put the keyboard focus on the main button when a dialog opens
    effect(() => {
      const dialog = this.confirm.current();
      if (dialog) {
        // a prompt starts in its text box, other dialogs on the main button
        setTimeout(() => (dialog.prompt ? this.promptBox() : this.okButton())?.nativeElement.focus(), 0);
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.confirm.current()) this.confirm.answer(false);
  }
}
