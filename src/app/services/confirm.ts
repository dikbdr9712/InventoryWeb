import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions extends ConfirmOptions {
  label: string;            // label above the text box
  placeholder?: string;
  templates?: string[];     // quick answers the person can tap to fill the box
}

export interface DialogRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  // present only for prompts
  prompt: { label: string; placeholder: string; templates: string[] } | null;
  resolve: (answer: boolean) => void;
}

// Replaces window.confirm() and window.prompt().
//   if (await this.dialog.ask({ title: 'Ship order', message: '...' })) { ... }
//   const text = await this.dialog.prompt({ title: '...', message: '...', label: 'Reason' });  // null if cancelled
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  current = signal<DialogRequest | null>(null);
  text = signal(''); // what has been typed in a prompt

  ask(options: ConfirmOptions): Promise<boolean> {
    return this.open(options, null);
  }

  async prompt(options: PromptOptions): Promise<string | null> {
    const ok = await this.open(options, {
      label: options.label,
      placeholder: options.placeholder ?? '',
      templates: options.templates ?? []
    });
    return ok ? this.text().trim() : null;
  }

  // The dialog calls this with the person's choice
  answer(value: boolean) {
    const request = this.current();
    // a prompt needs some text before it can be confirmed
    if (value && request?.prompt && !this.text().trim()) return;
    this.current.set(null);
    request?.resolve(value);
  }

  setText(value: string) {
    this.text.set(value);
  }

  private open(options: ConfirmOptions, prompt: DialogRequest['prompt']): Promise<boolean> {
    return new Promise(resolve => {
      this.text.set('');
      this.current.set({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: options.danger ?? false,
        prompt,
        resolve
      });
    });
  }
}
