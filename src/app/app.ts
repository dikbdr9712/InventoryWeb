import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './Components/navbar/navbar';
import { StaffBar } from './Components/staff-bar/staff-bar';
import { Footer } from './Components/footer/footer';
import { ToastHost } from './Components/toast-host/toast-host';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, StaffBar, Footer, ToastHost],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
