import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShopDetails } from '../../services/shop-details';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css'
})
export class Footer {
  year = new Date().getFullYear();
  readonly shop = inject(ShopDetails);
}
