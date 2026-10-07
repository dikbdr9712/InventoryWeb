import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AboutAdmin as AboutAdminData, SiteService, TeamPerson } from '../../services/site';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { errorText } from '../../utils/http-error';
import { ShopDetails, ShopDetailsData } from '../../services/shop-details';

const MAX_PHOTO = 5 * 1024 * 1024;
const LIMITS = { intro: 600, mission: 800, vision: 800, bio: 400 };

type TextKey = 'intro' | 'mission' | 'vision';

interface Draft { name: string; role: string; bio: string; visible: boolean; photo: File | null; preview: string | null; removePhoto: boolean; current: string | null; }

// Staff with "site.manage": the About page's texts, the live numbers, and the team (photos, order, shown or hidden).
@Component({
  selector: 'app-about-admin',
  imports: [FormsModule, RouterLink, DatePipe, NgTemplateOutlet],
  templateUrl: './about-admin.html',
  styleUrl: './about-admin.css'
})
export class AboutAdmin implements OnInit {
  private site = inject(SiteService);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  private shopDetails = inject(ShopDetails);

  // the shop's contact details and links (footer, Contact page, receipts)
  contact: ShopDetailsData = { ...this.shopDetails.details() };
  savingContact = signal(false);
  contactTried = signal(false);
  readonly linkFields: { key: 'facebook' | 'instagram' | 'youtube' | 'tiktok'; label: string; icon: string; example: string }[] = [
    { key: 'facebook', label: 'Facebook', icon: 'fa-facebook-f', example: 'https://www.facebook.com/yourpage' },
    { key: 'instagram', label: 'Instagram', icon: 'fa-instagram', example: 'https://www.instagram.com/yourpage' },
    { key: 'youtube', label: 'YouTube', icon: 'fa-youtube', example: 'https://www.youtube.com/@yourchannel' },
    { key: 'tiktok', label: 'TikTok', icon: 'fa-tiktok', example: 'https://www.tiktok.com/@yourpage' }
  ];
  private destroyRef = inject(DestroyRef);

  readonly limits = LIMITS;
  readonly fields: { key: TextKey; label: string; hint: string; rows: number }[] = [
    { key: 'intro', label: 'Introduction', hint: 'The first lines under "Online shopping, made in Bhutan".', rows: 3 },
    { key: 'mission', label: 'Our mission', hint: 'What you do for customers and sellers, today.', rows: 4 },
    { key: 'vision', label: 'Our vision', hint: 'Where you want DP DrukBazaars to be in the future.', rows: 3 }
  ];
  data = signal<AboutAdminData | null>(null);
  error = signal('');

  // the texts being edited
  intro = '';
  mission = '';
  vision = '';
  showNumbers = true;
  savingTexts = signal(false);
  textsTried = signal(false);
  private saved = signal({ intro: '', mission: '', vision: '', showNumbers: true });
  private edits = signal(0); // bumped on every keystroke, so "changed" is worked out again

  // the team
  team = signal<TeamPerson[]>([]);
  editing = signal<number | 'new' | null>(null);
  draft: Draft = this.emptyDraft();
  draftTried = signal(false);
  savingPerson = signal(false);
  busy = signal<number | null>(null);

  changed = computed(() => {
    this.edits();
    const s = this.saved();
    return this.intro !== s.intro || this.mission !== s.mission || this.vision !== s.vision || this.showNumbers !== s.showNumbers;
  });

  ngOnInit() {
    this.load();
    // the latest details from the server (the shared copy may still be loading)
    this.site.shopInfo().subscribe({ next: d => this.contact = { ...this.contact, ...d }, error: () => {} });
    this.destroyRef.onDestroy(() => this.dropPreview());
  }

  load() {
    this.error.set('');
    this.site.forStaff().subscribe({
      next: d => this.apply(d),
      error: (err: HttpErrorResponse) => this.error.set(errorText(err))
    });
  }

  private apply(d: AboutAdminData) {
    this.data.set(d);
    this.intro = d.page.intro;
    this.mission = d.page.mission;
    this.vision = d.page.vision;
    this.showNumbers = d.page.showNumbers;
    this.saved.set({ intro: this.intro, mission: this.mission, vision: this.vision, showNumbers: this.showNumbers });
    this.team.set(d.team);
  }

  // ---------- texts ----------

  touched() {
    this.edits.update(n => n + 1);
  }

  text(which: TextKey) {
    return this[which];
  }

  setText(which: TextKey, value: string) {
    this[which] = value;
    this.touched();
  }

  textError(which: TextKey) {
    const v = this[which].trim();
    if (!v) return 'This cannot be empty.';
    if (v.length > LIMITS[which]) return `Keep it under ${LIMITS[which]} characters.`;
    return '';
  }

  isOriginal(which: TextKey) {
    return this[which].trim() === (this.data()?.defaults['about.' + which] ?? '').trim();
  }

  useOriginal(which: TextKey) {
    this[which] = this.data()?.defaults['about.' + which] ?? this[which];
    this.touched();
  }

  saveTexts() {
    this.textsTried.set(true);
    if (this.textError('intro') || this.textError('mission') || this.textError('vision') || this.savingTexts()) return;
    this.savingTexts.set(true);
    this.site.saveTexts({ intro: this.intro, mission: this.mission, vision: this.vision, showNumbers: this.showNumbers }).subscribe({
      next: d => {
        this.savingTexts.set(false);
        this.textsTried.set(false);
        this.apply(d);
        this.toasts.success('The About page is updated.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingTexts.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  undoTexts() {
    const s = this.saved();
    this.intro = s.intro;
    this.mission = s.mission;
    this.vision = s.vision;
    this.showNumbers = s.showNumbers;
    this.textsTried.set(false);
    this.touched();
  }

  // ---------- contact details and links ----------

  contactError(field: 'phone' | 'email' | 'address' | 'otherPhones' | 'facebook' | 'instagram' | 'youtube' | 'tiktok') {
    const v = (this.contact[field] ?? '').trim();
    switch (field) {
      case 'phone': return /^\+?[0-9 ]{7,20}$/.test(v) ? '' : 'Enter the phone number (digits only).';
      case 'email': return /^\S+@\S+\.\S+$/.test(v) ? '' : 'Enter the email address.';
      case 'address': return v ? (v.length > 200 ? 'Keep it under 200 characters.' : '') : 'Enter the address.';
      case 'otherPhones': return v.split(',').map(p => p.trim()).filter(Boolean).every(p => /^\+?[0-9 ]{7,20}$/.test(p))
        ? '' : 'Phone numbers only, separated by commas.';
      default: return !v || /^https:\/\/\S+$/.test(v) ? '' : 'A full address starting with https://, or leave it empty.';
    }
  }

  saveContact() {
    this.contactTried.set(true);
    const fields = ['phone', 'otherPhones', 'email', 'address', 'facebook', 'instagram', 'youtube', 'tiktok'] as const;
    if (fields.some(f => this.contactError(f)) || this.savingContact()) return;
    this.savingContact.set(true);
    this.shopDetails.save(this.contact).subscribe({
      next: d => {
        this.savingContact.set(false);
        this.contactTried.set(false);
        this.contact = { ...d };
        this.shopDetails.set(d); // the footer and the rest update at once
        this.toasts.success('Contact details and links saved.');
      },
      error: (err: HttpErrorResponse) => {
        this.savingContact.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  // ---------- team ----------

  photo(p: { photo?: string | null }) {
    return this.site.photoUrl(p.photo);
  }

  initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  add() {
    this.startEdit('new', null);
  }

  edit(p: TeamPerson) {
    this.startEdit(p.id, p);
  }

  private startEdit(which: number | 'new', p: TeamPerson | null) {
    this.dropPreview();
    this.draft = p
      ? { name: p.name, role: p.role, bio: p.bio ?? '', visible: p.visible, photo: null, preview: null, removePhoto: false, current: p.photo ?? null }
      : this.emptyDraft();
    this.draftTried.set(false);
    this.editing.set(which);
    setTimeout(() => document.getElementById('person-name')?.focus());
  }

  cancelEdit() {
    this.dropPreview();
    this.editing.set(null);
  }

  pickPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (file.size > MAX_PHOTO) {
      this.toasts.error('That photo is too big. Choose one under 5 MB.');
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      this.toasts.error('Choose a JPG, PNG, WEBP or GIF photo.');
      return;
    }
    this.dropPreview();
    this.draft.photo = file;
    this.draft.preview = URL.createObjectURL(file);
    this.draft.removePhoto = false;
  }

  removePhoto() {
    this.dropPreview();
    this.draft.photo = null;
    this.draft.removePhoto = !!this.draft.current;
    this.draft.current = null;
  }

  draftPhoto() {
    return this.draft.preview ?? this.site.photoUrl(this.draft.current);
  }

  draftError(field: 'name' | 'role' | 'bio') {
    const v = this.draft[field].trim();
    if (field !== 'bio' && !v) return field === 'name' ? 'Enter the name.' : 'Enter what they do.';
    if (field === 'bio' && v.length > LIMITS.bio) return `Keep it under ${LIMITS.bio} characters.`;
    if (field !== 'bio' && v.length > 80) return 'Keep it under 80 characters.';
    return '';
  }

  savePerson() {
    this.draftTried.set(true);
    if (this.draftError('name') || this.draftError('role') || this.draftError('bio') || this.savingPerson()) return;
    const which = this.editing();
    if (which === null) return;
    this.savingPerson.set(true);
    const form = { name: this.draft.name, role: this.draft.role, bio: this.draft.bio, visible: this.draft.visible, photo: this.draft.photo, removePhoto: this.draft.removePhoto };
    const call = which === 'new' ? this.site.addPerson(form) : this.site.updatePerson(which, form);
    call.subscribe({
      next: saved => {
        this.savingPerson.set(false);
        this.team.update(list => which === 'new' ? [...list, saved] : list.map(p => p.id === saved.id ? saved : p));
        this.toasts.success(which === 'new' ? `${saved.name} is added to the team.` : `${saved.name} is updated.`);
        this.cancelEdit();
      },
      error: (err: HttpErrorResponse) => {
        this.savingPerson.set(false);
        this.toasts.error(errorText(err));
      }
    });
  }

  toggleVisible(p: TeamPerson) {
    this.busy.set(p.id);
    this.site.updatePerson(p.id, { name: p.name, role: p.role, bio: p.bio ?? '', visible: !p.visible }).subscribe({
      next: saved => {
        this.busy.set(null);
        this.team.update(list => list.map(x => x.id === saved.id ? saved : x));
        this.toasts.success(saved.visible ? `${saved.name} is shown on the page again.` : `${saved.name} is hidden from the page.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  move(index: number, step: -1 | 1) {
    const list = [...this.team()];
    const to = index + step;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    this.team.set(list); // move at once; put back if the server says no
    this.site.reorder(list.map(p => p.id)).subscribe({
      next: saved => this.team.set(saved),
      error: (err: HttpErrorResponse) => {
        this.toasts.error(errorText(err));
        this.load();
      }
    });
  }

  async remove(p: TeamPerson) {
    if (!await this.confirm.ask({
      title: `Remove ${p.name} from the team?`,
      message: 'They are taken off the About page and their uploaded photo is deleted. To take them off for a while, hide them instead.',
      confirmLabel: 'Remove', danger: true
    })) return;
    this.busy.set(p.id);
    this.site.removePerson(p.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.team.update(list => list.filter(x => x.id !== p.id));
        if (this.editing() === p.id) this.cancelEdit();
        this.toasts.success(`${p.name} is removed from the team.`);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
      }
    });
  }

  private emptyDraft(): Draft {
    return { name: '', role: '', bio: '', visible: true, photo: null, preview: null, removePhoto: false, current: null };
  }

  private dropPreview() {
    if (this.draft?.preview) URL.revokeObjectURL(this.draft.preview);
    if (this.draft) this.draft.preview = null;
  }
}
