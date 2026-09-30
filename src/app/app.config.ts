import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { credentialsInterceptor } from './interceptors/credentials';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // scroll to top when changing page
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // send the login session cookie with every request (like credentials: 'include')
    provideHttpClient(withInterceptors([credentialsInterceptor]))
  ]
};
