import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// The website's own pages that staff can change (the About page).

export interface TeamPerson {
  id: number;
  name: string;
  role: string;
  bio?: string | null;
  photo?: string | null; // "/uploads/team-…" (uploaded) or "Images/…" (a picture of the website)
  visible: boolean;
  sortOrder: number;
}

// Counted from the shop; a number that is 0 is not shown
export interface ShopNumbers { products: number; sellers: number; delivered: number; rating?: number | null; ratings: number; }

export interface AboutPage {
  intro: string;
  mission: string;
  vision: string;
  showNumbers: boolean;
  numbers?: ShopNumbers | null;
  team: TeamPerson[];
}

export interface AboutTexts { intro: string; mission: string; vision: string; showNumbers: boolean; }

export interface AboutAdmin {
  page: AboutPage;
  team: TeamPerson[];
  updatedBy?: string | null;
  updatedAt?: string | null;
  defaults: Record<string, string>; // the original wording, by key: about.intro, about.mission, about.vision
}

export interface PersonForm { name: string; role: string; bio: string; visible: boolean; photo?: File | null; removePhoto?: boolean; }

@Injectable({ providedIn: 'root' })
export class SiteService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/api/site`;

  about() {
    return this.http.get<AboutPage>(`${this.api}/about`);
  }

  // A photo's address on this website
  photoUrl(path?: string | null): string | null {
    if (!path) return null;
    return path.startsWith('/uploads/') ? environment.imageBase + path : path;
  }

  // ---------- staff (site.manage) ----------

  forStaff() {
    return this.http.get<AboutAdmin>(`${this.api}/admin/about`);
  }

  saveTexts(texts: AboutTexts) {
    return this.http.put<AboutAdmin>(`${this.api}/admin/about`, texts);
  }

  addPerson(p: PersonForm) {
    return this.http.post<TeamPerson>(`${this.api}/admin/team`, this.form(p));
  }

  updatePerson(id: number, p: PersonForm) {
    return this.http.put<TeamPerson>(`${this.api}/admin/team/${id}`, this.form(p));
  }

  removePerson(id: number) {
    return this.http.delete<{ message: string }>(`${this.api}/admin/team/${id}`);
  }

  reorder(ids: number[]) {
    return this.http.put<TeamPerson[]>(`${this.api}/admin/team/order`, { ids });
  }

  private form(p: PersonForm) {
    const f = new FormData();
    f.append('name', p.name.trim());
    f.append('role', p.role.trim());
    f.append('bio', p.bio.trim());
    f.append('visible', String(p.visible));
    if (p.removePhoto) f.append('removePhoto', 'true');
    if (p.photo) f.append('photo', p.photo);
    return f;
  }
}
