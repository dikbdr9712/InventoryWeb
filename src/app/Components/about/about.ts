import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css'
})
export class About {
  team = [
    { name: 'Dik Bdr Galley', role: 'System designer and developer', photo: 'Images/Dik(me1).jpg' },
    { name: 'Pharmith Lepcha', role: 'System designer and counsellor', photo: 'Images/Pharmith.jpg' }
  ];

  // If a photo is missing, show the person's initials instead of a broken picture
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  hide(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
