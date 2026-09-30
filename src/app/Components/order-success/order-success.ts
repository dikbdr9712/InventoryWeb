import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';

// The page after checkout. URL: /order-success?orderId=12
@Component({
  selector: 'app-order-success',
  imports: [RouterLink],
  templateUrl: './order-success.html',
  styleUrl: './order-success.css'
})
export class OrderSuccess {
  private auth = inject(AuthService);

  orderId = inject(ActivatedRoute).snapshot.queryParamMap.get('orderId');
  firstName = (this.auth.name() ?? '').trim().split(/\s+/)[0];

  // The path an order follows after it is placed
  steps = [
    { title: 'We review your order', text: 'We check the items and, for bank transfers, your payment.' },
    { title: 'We pack and ship it', text: 'Your order is prepared and sent out to you.' },
    { title: 'It arrives', text: 'You receive your order. If you chose cash on delivery, you pay then.' }
  ];
}
