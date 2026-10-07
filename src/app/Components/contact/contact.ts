import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ContactService } from '../../services/contact';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { focusFirstError } from '../../utils/focus-error';

@Component({
  selector: 'app-contact',
  imports: [FormsModule, RouterLink],
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class Contact implements OnInit {
  auth = inject(AuthService);
  private contactService = inject(ContactService);
  private route = inject(ActivatedRoute);
  private toasts = inject(ToastService);
  private host = inject(ElementRef);

  form = { name: '', email: '', message: '' };
  sending = signal(false);
  submitted = signal(false); // field errors only show after the first attempt
  done = signal(false);      // the confirmation shown after a message is sent
  orderRef = signal<string | null>(null);

  ngOnInit() {
    // Signed-in customers do not have to type their name and email again
    this.form.name = this.auth.name() ?? '';
    this.form.email = this.auth.email() ?? '';

    // Coming from an order ("Reply to us"): start the message with the order number,
    // so the team knows which order it is about
    const order = this.route.snapshot.queryParamMap.get('order');
    if (order && /^[0-9]+$/.test(order)) {
      this.orderRef.set(order);
      this.form.message = `About order #${order}: `;
    }

    // Coming from "Forgot password": say so, so the team knows to reset it
    const subject = this.route.snapshot.queryParamMap.get('subject');
    if (!this.form.message && subject === 'Forgot my password') {
      this.form.message = 'I forgot my password. Please reset it. My account email or phone: ';
    }
  }

  errors() {
    const e: { name?: string; email?: string; message?: string } = {};
    if (!this.form.name.trim()) e.name = 'Enter your name.';
    const email = this.form.email.trim();
    if (!email) e.email = 'Enter your email address, so we can reply.';
    else if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    // the "About order #6:" start does not count as a message
    const body = this.form.message.replace(/^About order #\d+:\s*/i, '').trim();
    if (!body) e.message = 'Write your message.';
    return e;
  }

  submit() {
    if (this.sending()) return;

    this.submitted.set(true);
    if (Object.keys(this.errors()).length > 0) {
      focusFirstError(this.host.nativeElement);
      return;
    }

    this.sending.set(true);
    this.contactService.send({
      name: this.form.name.trim(),
      email: this.form.email.trim(),
      message: this.form.message.trim()
    }).subscribe({
      next: () => {
        this.sending.set(false);
        this.done.set(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.toasts.error(err.status === 0
          ? errorText(err)
          : 'We could not send your message. Please try again.');
      }
    });
  }

  // "Send another message": keep the name and email, clear the message
  sendAnother() {
    this.form.message = '';
    this.orderRef.set(null);
    this.submitted.set(false);
    this.done.set(false);
  }
}
