import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { LegalTerms, TermsStatus, TermsType } from '../models/models';

// Agreements: anyone can read them; signed-in people accept them; admins publish new versions.
@Injectable({ providedIn: 'root' })
export class LegalService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/legal`;

  current(type: TermsType) {
    return this.http.get<LegalTerms>(`${this.api}/terms/${type}`);
  }

  version(type: TermsType, version: number) {
    return this.http.get<LegalTerms>(`${this.api}/terms/${type}/versions/${version}`);
  }

  status(type: TermsType) {
    return this.http.get<TermsStatus>(`${this.api}/terms/${type}/status`);
  }

  accept(type: TermsType, version: number) {
    return this.http.post<{ type: TermsType; version: number; acceptedAt: string }>(`${this.api}/terms/${type}/accept`, { version });
  }

  // ---------- admin ----------
  all() {
    return this.http.get<Record<TermsType, LegalTerms[]>>(`${this.api}/admin/terms`);
  }

  publish(type: TermsType, body: { title: string; body: string; changeSummary: string }) {
    return this.http.post<LegalTerms>(`${this.api}/admin/terms/${type}`, body);
  }
}
