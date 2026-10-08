import { inject } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';
import { ToastService } from '../services/toast';

// A page's code could not be downloaded: no internet, or a new version of the website replaced it.
// Instead of a blank page: load the new version once, or say what is wrong.
export function pageLoadFailed(error: NavigationError): RedirectCommand | void {
  const text = String((error.error as { message?: string } | null)?.message ?? error.error ?? '');
  if (!/dynamically imported module|module script failed|Failed to fetch|Loading chunk/i.test(text)) return;

  let triedAlready = false;
  try {
    triedAlready = sessionStorage.getItem('pageReloadedFor') === error.url;
    sessionStorage.setItem('pageReloadedFor', error.url);
  } catch {
    triedAlready = true; // no storage: never risk reloading in a loop
  }
  if (navigator.onLine && !triedAlready) {
    location.assign(error.url); // the new version
    return;
  }
  inject(ToastService).error(navigator.onLine
    ? 'This page could not be opened. Please try again in a moment.'
    : 'No internet connection. Connect and try again.');
  // the app was just opened on that page: show the home page (always on the phone) instead of nothing
  const router = inject(Router);
  if (!router.navigated) return new RedirectCommand(router.parseUrl('/'));
}
