import { Component, computed, inject, signal } from '@angular/core';
import { AppInstall } from '../../services/app-install';
import { ToastService } from '../../services/toast';

type Device = 'android' | 'iphone' | 'computer';

// "Get the app": install the website as an app, with the steps for each kind of device.
// A page to share: drukbazaars.com/app
@Component({
  selector: 'app-get-app',
  templateUrl: './get-app.html',
  styleUrl: './get-app.css'
})
export class GetApp {
  app = inject(AppInstall);
  private toasts = inject(ToastService);

  // the steps for this device first; the others can be opened
  device = signal<Device>(this.app.ios ? 'iphone' : this.app.android ? 'android' : 'computer');
  readonly devices: { key: Device; label: string; icon: string }[] = [
    { key: 'android', label: 'Android', icon: 'fa-android' },
    { key: 'iphone', label: 'iPhone, iPad', icon: 'fa-apple' },
    { key: 'computer', label: 'Computer', icon: 'fa-desktop' }
  ];
  thisDevice = computed(() => this.device() === (this.app.ios ? 'iphone' : this.app.android ? 'android' : 'computer'));

  async install() {
    if (await this.app.install()) this.toasts.success('Installed. Find DP DrukBazaars on your home screen.');
  }
}
