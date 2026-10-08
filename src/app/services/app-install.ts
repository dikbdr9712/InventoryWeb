import { Injectable, inject, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

// What Chrome, Edge and Samsung Internet give us when the site can be installed (not in the standard types yet)
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'appBannerDismissedAt';
const QUIET_DAYS = 30; // after "Not now", the install banner stays away this long

// The website as an app on the phone (or computer): installing it, and new versions.
//   Android, computers: the browser offers an install prompt; we show it from our own button.
//   iPhone, iPad: Safari has no prompt; people use Share > Add to Home Screen (the /app page shows how).
@Injectable({ providedIn: 'root' })
export class AppInstall {
  private updates = inject(SwUpdate);
  private router = inject(Router);
  private promptEvent: InstallPromptEvent | null = null;

  canPrompt = signal(false);           // our Install button can open the browser's install window
  installed = signal(this.standalone()); // opened from the home screen icon
  updateReady = signal(false);         // a new version is downloaded: reload to use it

  readonly ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPads say they are Macs
  readonly android = /android/i.test(navigator.userAgent);
  readonly phone = this.ios || this.android || /mobile/i.test(navigator.userAgent);

  constructor() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); // no mini bar from the browser: our banner and the /app page offer it
      this.promptEvent = event as InstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.promptEvent = null;
      this.canPrompt.set(false);
      this.installed.set(true);
    });

    if (!this.updates.isEnabled) return; // ng serve, or a browser without service workers
    this.updates.versionUpdates.pipe(filter(e => e.type === 'VERSION_READY')).subscribe(() => this.updateReady.set(true));
    // a new version is ready: the next page change loads it in full (nothing typed is lost: that page is being left)
    this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(e => {
      if (this.updateReady()) location.assign((e as NavigationStart).url);
    });
    // the files on the phone no longer match the website (rare): start again from the website
    this.updates.unrecoverable.subscribe(() => location.reload());
    // look for a new version when the app comes back to the screen, and every 30 minutes while it is open
    const check = () => this.updates.checkForUpdate().catch(() => false);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60 * 1000);
  }

  // Opens the browser's install window. False when the browser cannot (iPhone, already installed).
  async install(): Promise<boolean> {
    const event = this.promptEvent;
    if (!event) return false;
    this.promptEvent = null; // the browser allows each prompt once
    this.canPrompt.set(false);
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome === 'accepted';
  }

  reload() {
    location.reload();
  }

  // The banner is shown on phones, outside the app, unless "Not now" was tapped lately
  bannerWanted(): boolean {
    if (this.installed() || !this.phone) return false;
    try {
      const at = Number(localStorage.getItem(DISMISSED_KEY));
      return !at || Date.now() - at > QUIET_DAYS * 24 * 60 * 60 * 1000;
    } catch {
      return true;
    }
  }

  notNow() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // private mode: it simply shows again next time
    }
  }

  private standalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  }
}
