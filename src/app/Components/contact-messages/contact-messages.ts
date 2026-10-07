import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContactService } from '../../services/contact';
import { ContactMessage } from '../../models/models';

@Component({
  selector: 'app-contact-messages',
  imports: [DatePipe, RouterLink],
  templateUrl: './contact-messages.html',
  styleUrl: './contact-messages.css'
})
export class ContactMessages implements OnInit {
  private contactService = inject(ContactService);

  messages = signal<ContactMessage[]>([]);
  loading = signal(true);
  error = signal('');
  searchTerm = signal('');

  // Newest first, narrowed by the search
  visible = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const list = this.messages().filter(m =>
      !term ||
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term) ||
      m.message.toLowerCase().includes(term)
    );
    return [...list].sort((a, b) => this.time(b) - this.time(a) || (b.id ?? 0) - (a.id ?? 0));
  });

  ngOnInit() {
    this.contactService.getAll().subscribe({
      next: data => {
        this.messages.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('We could not load the messages. Please try again in a moment.');
        this.loading.set(false);
      }
    });
  }

  private time(message: ContactMessage): number {
    return message.submittedAt ? new Date(message.submittedAt).getTime() : 0;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  // A reply written from an order page starts with "About order #6:". Find that number.
  orderRef(message: ContactMessage): number | null {
    const match = /order\s*#?\s*(\d+)/i.exec(message.message);
    return match ? Number(match[1]) : null;
  }

  // Opens the person's email app with the reply address and a subject already filled in
  mailto(message: ContactMessage): string {
    const ref = this.orderRef(message);
    const subject = ref ? `Re: your message about order #${ref}` : 'Re: your message to DP DrukBazaars';
    return `mailto:${message.email}?subject=${encodeURIComponent(subject)}`;
  }
}
