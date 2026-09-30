import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ContactMessage } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/contact`;

  // 'text' so it works whether Spring Boot returns JSON, plain text, or nothing
  send(message: ContactMessage) {
    return this.http.post(this.api, message, { responseType: 'text' });
  }

  getAll() {
    return this.http.get<ContactMessage[]>(`${this.api}/all`);
  }
}