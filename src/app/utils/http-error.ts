import { HttpErrorResponse } from '@angular/common/http';

// Turns an HTTP error into a readable message (server text if it sent one)
export function errorText(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Could not connect to server. Is Spring Boot running on port 8080?';
  return typeof err.error === 'string' && err.error ? err.error : err.message;
}
