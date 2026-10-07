import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../services/auth';
import { ConfirmService } from '../../services/confirm';
import { ToastService } from '../../services/toast';
import { BoardItem, BoardRider, BoardStage, DeliverySizeName, OrderBoard, OrderBoardService } from '../../services/order-board';
import { errorText } from '../../utils/http-error';
import { mapLink } from '../../utils/package-status';
import { printElement } from '../../utils/print-area';
import { SHOP } from '../../utils/shop-info';

type View = 'action' | 'mine' | 'late' | 'active' | 'drivers' | 'done';
type StageGroup = 'PAYMENT_DUE' | 'VERIFY' | 'PACK' | 'PACKED' | 'ON_THE_WAY' | 'DELIVERED';
type Period = 'today' | 'week' | 'month' | 'year' | 'custom';

interface StageInfo { key: BoardStage; title: string; icon: string; help: string; }

// The steps in the order they happen. Each item is in exactly one.
const STAGES: StageInfo[] = [
  { key: 'PAYMENT_DUE', title: 'Awaiting payment', icon: 'fa-hourglass-start', help: 'Placed, the customer has not paid yet.' },
  { key: 'VERIFY', title: 'Verify payment', icon: 'fa-magnifying-glass-dollar', help: 'A payment to check before packing.' },
  { key: 'PACK', title: 'To pack', icon: 'fa-box-open', help: 'Paid: pick the items and pack them.' },
  { key: 'READY', title: 'Packed, needs a driver', icon: 'fa-box', help: 'Packed. Give it to a driver, or deliver it ourselves.' },
  { key: 'ASSIGNED', title: 'Driver coming to collect', icon: 'fa-person-walking-arrow-right', help: 'A driver has the job and is coming for it.' },
  { key: 'ON_THE_WAY', title: 'On the way', icon: 'fa-truck-fast', help: 'Picked up, going to the customer.' },
  { key: 'DELIVERED', title: 'Delivered', icon: 'fa-circle-check', help: 'With the customer.' },
  { key: 'CANCELLED', title: 'Cancelled', icon: 'fa-ban', help: 'Cancelled.' }
];
const STAGE_ORDER = STAGES.map(s => s.key);
const SIZE_ORDER: DeliverySizeName[] = ['SMALL', 'MEDIUM', 'LARGE', 'BULKY'];
const GROUP_STAGES: Record<StageGroup, BoardStage[]> = {
  PAYMENT_DUE: ['PAYMENT_DUE'], VERIFY: ['VERIFY'], PACK: ['PACK'], PACKED: ['READY', 'ASSIGNED'],
  ON_THE_WAY: ['ON_THE_WAY'], DELIVERED: ['DELIVERED']
};
// steps where a package is with (or going to) a driver or our staff courier
const DELIVERY_STAGES: BoardStage[] = ['ASSIGNED', 'ON_THE_WAY', 'DELIVERED'];

// yyyy-mm-dd of a day in the shop's time (Bhutan)
function day(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Thimphu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Every online order from payment to the door: one list per step, who has each one, what is late,
// and the buttons for the next step. Orders are chosen by the day they were placed (today, this week, ...).
@Component({
  selector: 'app-order-board',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './order-board.html',
  styleUrl: './order-board.css'
})
export class OrderBoardPage implements OnInit {
  private api = inject(OrderBoardService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private toasts = inject(ToastService);
  auth = inject(AuthService);

  private slip = viewChild<ElementRef<HTMLElement>>('slip');

  readonly stages = STAGES;
  readonly shop = SHOP;
  readonly mapLink = mapLink;
  readonly periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' },
    { key: 'year', label: 'This year' }, { key: 'custom', label: 'Custom' }
  ];

  board = signal<OrderBoard | null>(null);
  loading = signal(true);
  error = signal('');
  busy = signal<string | null>(null);      // the item being changed
  view = signal<View>('action');
  group = signal<StageGroup | null>(null); // a step chosen in the pipeline
  search = signal('');
  openKey = signal<string | null>(null);   // the item shown in the side panel

  // ---- the period: which orders, by the day they were placed ----
  period = signal<Period>('month');
  customFrom = signal(day(new Date(Date.now() - 6 * 86400000)));
  customTo = signal(day(new Date()));
  includeOlder = signal(false);
  riderFilter = signal<string>(''); // Drivers view: '' all, a driver id, or 'staff'

  canFulfil = this.auth.can('orders.fulfil');
  canVerify = this.auth.can('payments.verify');

  counts = computed(() => this.board()?.counts);
  me = computed(() => (this.board()?.me ?? '').toLowerCase());

  private activeItems = computed(() => (this.board()?.items ?? []).filter(i => i.stage !== 'DELIVERED' && i.stage !== 'CANCELLED'));
  mine = computed(() => this.activeItems().filter(i => this.isMine(i)));
  late = computed(() => this.activeItems().filter(i => i.late && i.stage !== 'PAYMENT_DUE'));

  // Every package a driver (or our staff) took, newest first: who has it, from where to where
  deliveries = computed(() => {
    const f = this.riderFilter();
    return (this.board()?.items ?? [])
      .filter(i => DELIVERY_STAGES.includes(i.stage) && (i.riderId != null || !!i.courierName))
      .filter(i => !f || (f === 'staff' ? i.riderId == null : String(i.riderId) === f))
      .filter(i => this.matches(i))
      .sort((a, b) => (b.assignedAt ?? b.pickedUpAt ?? b.stageSince ?? '').localeCompare(a.assignedAt ?? a.pickedUpAt ?? a.stageSince ?? ''));
  });

  // What the list shows: the chosen tab or step, then the search
  visible = computed(() => {
    const all = this.board()?.items ?? [];
    const group = this.group();
    let list: BoardItem[];
    if (group) {
      list = all.filter(i => GROUP_STAGES[group].includes(i.stage));
    } else {
      switch (this.view()) {
        case 'mine': list = this.mine(); break;
        case 'late': list = this.late(); break;
        case 'active': list = this.activeItems(); break;
        case 'done': list = all.filter(i => i.stage === 'DELIVERED' || i.stage === 'CANCELLED'); break;
        default: list = this.activeItems().filter(i => this.needsAction(i));
      }
    }
    return list.filter(i => this.matches(i));
  });

  // The list in sections, one per step, in the order the steps happen
  sections = computed(() => {
    const byStage = new Map<BoardStage, BoardItem[]>();
    for (const item of this.visible()) {
      const list = byStage.get(item.stage) ?? [];
      list.push(item);
      byStage.set(item.stage, list);
    }
    return STAGE_ORDER.filter(s => byStage.has(s)).map(s => ({ info: STAGES.find(x => x.key === s)!, items: byStage.get(s)! }));
  });

  open = computed(() => (this.board()?.items ?? []).find(i => i.key === this.openKey()) ?? null);

  constructor() {
    // keep it current while it is open (every minute), without a full reload
    const timer = setInterval(() => { if (!document.hidden && !this.busy()) this.load(true); }, 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const q = params.get('q');
    if (q) {
      this.search.set(q);
      this.view.set('active');
      this.period.set('year');
      this.includeOlder.set(true);
    }
    const stage = params.get('stage') as StageGroup | null;
    if (stage && stage in GROUP_STAGES) this.group.set(stage);
    const period = params.get('period') as Period | null;
    if (period && this.periods.some(p => p.key === period)) this.period.set(period);
    if (period === 'custom' && params.get('from') && params.get('to')) {
      this.customFrom.set(params.get('from')!);
      this.customTo.set(params.get('to')!);
    }
    this.load();
  }

  // The first and last day (both included) of the chosen period, in the shop's time
  range(): { from: string; to: string } {
    const today = day(new Date());
    const [y, m, d] = today.split('-').map(Number);
    switch (this.period()) {
      case 'today': return { from: today, to: today };
      case 'week': {
        const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
        return { from: day(new Date(Date.UTC(y, m - 1, d - weekday, 6))), to: today };
      }
      case 'year': return { from: `${y}-01-01`, to: today };
      case 'custom': return { from: this.customFrom(), to: this.customTo() };
      default: return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };
    }
  }

  load(quiet = false) {
    if (!quiet) this.loading.set(true);
    const { from, to } = this.range();
    this.api.board(from, to, this.includeOlder()).subscribe({
      next: b => {
        this.board.set(b);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (!quiet) this.error.set(errorText(err));
      }
    });
  }

  // ---------- Choosing what to see ----------
  choosePeriod(p: Period) {
    this.period.set(p);
    if (p !== 'custom') this.applyPeriod();
  }

  setCustom(which: 'from' | 'to', value: string) {
    if (!value) return;
    (which === 'from' ? this.customFrom : this.customTo).set(value);
  }

  applyPeriod() {
    const p = this.period();
    const query: Record<string, string | null> = { period: p === 'month' ? null : p, from: null, to: null, stage: this.group() };
    if (p === 'custom') {
      query['from'] = this.customFrom();
      query['to'] = this.customTo();
    }
    this.router.navigate([], { queryParams: query, queryParamsHandling: 'merge', replaceUrl: true });
    this.load();
  }

  toggleOlder() {
    this.includeOlder.set(!this.includeOlder());
    this.load();
  }

  periodLabel(): string {
    const b = this.board();
    const name = this.periods.find(p => p.key === this.period())?.label ?? '';
    return b ? `${this.period() === 'custom' ? '' : name + ': '}${this.shortDate(b.from)}${b.from === b.to ? '' : ' to ' + this.shortDate(b.to)}` : name;
  }

  private shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
  }

  showView(v: View) {
    this.view.set(v);
    this.group.set(null);
  }

  showGroup(g: StageGroup) {
    this.group.set(this.group() === g ? null : g);
    this.router.navigate([], { queryParams: { stage: this.group() }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  clearGroup() {
    this.group.set(null);
    this.router.navigate([], { queryParams: { stage: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  showDriver(r: BoardRider | 'staff') {
    this.riderFilter.set(r === 'staff' ? 'staff' : String(r.id));
    this.showView('drivers');
  }

  groupTitle(g: StageGroup): string {
    return { PAYMENT_DUE: 'Awaiting payment', VERIFY: 'Verify payment', PACK: 'To pack', PACKED: 'Packed', ON_THE_WAY: 'On the way', DELIVERED: 'Delivered' }[g];
  }

  // ---------- Reading an item ----------
  private matches(i: BoardItem): boolean {
    const q = this.search().trim().toLowerCase().replace(/^#/, '');
    if (!q) return true;
    return String(i.orderId) === q || String(i.orderId).startsWith(q)
      || [i.customerName, i.customerPhone, i.customerEmail, i.journal, i.sellerName, i.riderName, i.riderPhone, i.packerName, i.courierName, i.dropAddress]
        .some(v => (v ?? '').toLowerCase().includes(q))
      || i.lines.some(l => l.name.toLowerCase().includes(q));
  }

  needsAction(i: BoardItem): boolean {
    return i.stage === 'VERIFY' || i.stage === 'PACK' || i.stage === 'READY' || i.late;
  }

  isMine(i: BoardItem): boolean {
    return !!i.packerEmail && i.packerEmail.toLowerCase() === this.me() && i.stage === 'PACK';
  }

  ownShop(i: BoardItem): boolean {
    return i.packageId != null && !i.sellerId;
  }

  // a package that is packed: show where it goes from and to
  hasRoute(i: BoardItem): boolean {
    return i.packageId != null && ['READY', 'ASSIGNED', 'ON_THE_WAY', 'DELIVERED'].includes(i.stage);
  }

  fromLabel(i: BoardItem): string {
    return (i.sellerName ?? 'DP DrukBazaars') + (i.pickupTown ? ', ' + i.pickupTown : '');
  }

  duration(minutes: number): string {
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    if (h < 48) return `${h} h ${minutes % 60 ? (minutes % 60) + ' min' : ''}`.trim();
    return `${Math.floor(h / 24)} days`;
  }

  waitLabel(i: BoardItem): string {
    switch (i.stage) {
      case 'PAYMENT_DUE': return 'placed';
      case 'VERIFY': return 'waiting';
      case 'PACK': return 'paid';
      case 'READY': case 'ASSIGNED': return 'packed';
      case 'ON_THE_WAY': return 'on the way';
      default: return '';
    }
  }

  summary(i: BoardItem): string {
    const parts = i.lines.slice(0, 3).map(l => `${l.quantity} × ${l.name}`);
    return parts.join(', ') + (i.lines.length > 3 ? ` and ${i.lines.length - 3} more` : '');
  }

  stageTitle(stage: BoardStage): string {
    return STAGES.find(s => s.key === stage)?.title ?? stage;
  }

  // Drivers who can carry this package, free ones first
  ridersFor(i: BoardItem): BoardRider[] {
    const size = SIZE_ORDER.indexOf(i.deliverySize ?? 'SMALL');
    return (this.board()?.riders ?? []).filter(r => r.id !== i.riderId && SIZE_ORDER.indexOf(r.carries) >= size);
  }

  riderName(id: string): string {
    if (id === 'staff') return 'Our staff';
    return this.board()?.riders.find(r => String(r.id) === id)?.name ?? 'Driver';
  }

  sizeLabel(size?: DeliverySizeName | null): string {
    return { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', BULKY: 'Bulky' }[size ?? 'SMALL'];
  }

  // ---------- Doing the next step ----------
  take(i: BoardItem) {
    this.run(i, this.api.take(i.packageId!), `Order #${i.orderId} is yours to pack.`);
  }

  async giveBack(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Give it back?', message: `Order #${i.orderId} goes back to "not started" so someone else can pack it.`, confirmLabel: 'Give back' })) return;
    this.run(i, this.api.release(i.packageId!), `Order #${i.orderId} is back in the list.`);
  }

  assignPacker(i: BoardItem, email: string, select: HTMLSelectElement) {
    select.value = '';
    if (!email) return;
    const name = this.board()?.packers.find(p => p.email === email)?.name ?? email;
    this.run(i, this.api.assignPacker(i.packageId!, email), `Order #${i.orderId} given to ${name}.`);
  }

  async packed(i: BoardItem) {
    const forSeller = !!i.sellerId;
    if (!await this.confirm.ask({
      title: forSeller ? `Mark packed for ${i.sellerName}?` : 'Packed?',
      message: `Every item of order #${i.orderId}${i.packageCount > 1 ? ' (package ' + i.packageNo + ' of ' + i.packageCount + ')' : ''} is in the package and it is ready to go. Drivers will see the job.`,
      confirmLabel: 'Packed'
    })) return;
    this.run(i, this.api.packed(i.packageId!), `Order #${i.orderId} is packed.`);
  }

  assignRider(i: BoardItem, riderId: string, select: HTMLSelectElement) {
    select.value = '';
    if (!riderId) return;
    const rider = this.board()?.riders.find(r => r.id === Number(riderId));
    this.run(i, this.api.assignRider(i.packageId!, Number(riderId)), `${rider?.name ?? 'The driver'} will collect order #${i.orderId}.`);
  }

  async removeRider(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Take it off the driver?', message: `${i.riderName} will be told not to collect order #${i.orderId}. It goes back to "needs a driver".`, confirmLabel: 'Take off', danger: true })) return;
    this.run(i, this.api.removeRider(i.packageId!), `Order #${i.orderId} needs a driver again.`);
  }

  async weDeliver(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Deliver it ourselves?', message: `You are taking order #${i.orderId} to the customer now. No driver is paid for it.`, confirmLabel: 'I am taking it' })) return;
    this.run(i, this.api.pickUp(i.packageId!), `Order #${i.orderId} is on the way with you.`);
  }

  async collected(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Collected by the driver?', message: `${i.riderName} has order #${i.orderId} in hand. Use this when the driver could not press it.`, confirmLabel: 'Collected' })) return;
    this.run(i, this.api.pickUp(i.packageId!), `Order #${i.orderId} is on the way.`);
  }

  async delivered(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Delivered?', message: `Only when the customer has order #${i.orderId} in hand. This books the seller's and driver's earnings.`, confirmLabel: 'Delivered' })) return;
    const call = i.legacy ? this.api.orderAction(i.orderId, 'complete') : this.api.delivered(i.packageId!);
    this.run(i, call, `Order #${i.orderId} delivered.`);
  }

  async ship(i: BoardItem) {
    if (!await this.confirm.ask({ title: 'Send it?', message: `Order #${i.orderId} is packed and leaves now.`, confirmLabel: 'Sent' })) return;
    this.run(i, this.api.orderAction(i.orderId, 'ship'), `Order #${i.orderId} is on the way.`);
  }

  async paymentReceived(i: BoardItem) {
    if (!await this.confirm.ask({
      title: 'Has the money arrived?',
      message: `Nu. ${i.orderTotal}${i.journal ? ', journal ' + i.journal : ''}. Check it in the bank account first. The order is then confirmed and goes to packing.`,
      confirmLabel: 'Money arrived'
    })) return;
    this.run(i, this.api.orderAction(i.orderId, 'confirm-payment'), `Order #${i.orderId} is paid and goes to packing.`);
  }

  async cancel(i: BoardItem) {
    if (!await this.confirm.ask({ title: `Cancel order #${i.orderId}?`, message: 'The customer is told and the stock goes back. This cannot be undone.', confirmLabel: 'Cancel order', danger: true })) return;
    this.run(i, this.api.orderAction(i.orderId, 'cancel'), `Order #${i.orderId} cancelled.`);
  }

  private run(i: BoardItem, call: Observable<unknown>, done: string) {
    this.busy.set(i.key);
    call.subscribe({
      next: () => {
        this.busy.set(null);
        this.toasts.success(done);
        this.load(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        this.toasts.error(errorText(err));
        this.load(true);
      }
    });
  }

  // ---------- Side panel ----------
  show(i: BoardItem) {
    this.openKey.set(i.key);
  }

  close() {
    this.openKey.set(null);
  }

  printSlip() {
    const el = this.slip()?.nativeElement;
    if (el) printElement(el, 'a4');
  }
}
