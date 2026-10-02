import { HttpErrorResponse } from '@angular/common/http';

// Turns an HTTP error into a readable message (server text if it sent one)
export function errorText(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Could not connect to server. Is Spring Boot running on port 8080?';
  if (typeof err.error === 'string' && err.error) return err.error;
  if (typeof err.error?.message === 'string' && err.error.message) return err.error.message; // { message: '...' } answers
  return err.message;
}
