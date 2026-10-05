import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-our-services',
  imports: [RouterLink],
  templateUrl: './our-services.html',
  styleUrl: './our-services.css'
})
export class OurServices {
  services = [
    {
      icon: 'fa-globe',
      title: 'Online services',
      points: ['Online payment', 'Online marketplace', 'Online booking platforms', 'Online grocery shopping'],
      button: 'Order now',
      link: '/products'
    },
    {
      icon: 'fa-handshake',
      title: 'Delivery and payment',
      points: [
        'A wide range of products, with same-day shipping, store pickup and safe delivery.',
        'Pay online from your own bank account through the RMA Payment Gateway, before delivery.'
      ],
      button: 'Read more',
      link: '/about'
    },
    {
      icon: 'fa-star',
      title: 'Reviews and ratings',
      points: ['Customer reviews and ratings build trust, help people decide, and show how others found us.'],
      button: 'Read the reviews',
      link: '/reviews'
    }
  ];
}
