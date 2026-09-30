import { Component, ViewEncapsulation, input } from '@angular/core';
import { RouterLink } from '@angular/router';

// The frame shared by Login and Signup: a brand panel beside the form.
// Usage:  <app-auth-layout title="Sign in" subtitle="..."> ...form... </app-auth-layout>
// Encapsulation is off on purpose, so the form styles below also reach the projected form.
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
  encapsulation: ViewEncapsulation.None
})
export class AuthLayout {
  title = input('');
  subtitle = input('');

  points = [
    'Follow every order from placed to delivered',
    'Check out in a few taps',
    'Natural products, handled with care'
  ];
}
