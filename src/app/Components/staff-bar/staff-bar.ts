import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth';
import { STAFF_GROUPS } from '../../utils/staff-nav';

// The dark bar under the header. It only shows for people who have staff tools,
// and only lists the tools their role allows.
@Component({
  selector: 'app-staff-bar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './staff-bar.html',
  styleUrl: './staff-bar.css'
})
export class StaffBar {
  private auth = inject(AuthService);

  groups = computed(() =>
    STAFF_GROUPS
      .map(group => ({ title: group.title, items: group.items.filter(item => this.auth.can(item.permission)) }))
      .filter(group => group.items.length > 0)
  );
}
