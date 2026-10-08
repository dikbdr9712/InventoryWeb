import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withNavigationErrorHandler } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { credentialsInterceptor } from './interceptors/credentials';
import { sessionExpiredInterceptor } from './interceptors/session-expired';
import { pageLoadFailed } from './utils/page-load';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // scroll to top when changing page; a page that cannot be downloaded gets a message, not a blank screen
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withNavigationErrorHandler(pageLoadFailed)),
    // send the login session cookie with every request (like credentials: 'include')
    provideHttpClient(withInterceptors([credentialsInterceptor, sessionExpiredInterceptor])),
    // the installable app: keeps the website's files on the phone so it opens fast (never the API's answers),
    // and finds new versions (services/app-install.ts). Only in the real build, not with ng serve.
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })
  ]
};
