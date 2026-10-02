import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './Components/navbar/navbar';
import { StaffBar } from './Components/staff-bar/staff-bar';
import { Footer } from './Components/footer/footer';
import { ToastHost } from './Components/toast-host/toast-host';
import { AuthService } from './services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, StaffBar, Footer, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private auth = inject(AuthService);

  ngOnInit() {
    // Pick up a role that changed since the last visit (for example a newly approved seller).
    // If the session has ended, the session-expired interceptor signs the browser out.
    if (this.auth.isLoggedIn()) {
      this.auth.refresh().subscribe({ error: () => {} });
    }
  }
}
