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
      title: 'Shop online',
      points: [
        'Order any time, from your phone or computer.',
        'Products from DP DrukBazaars and checked local sellers.',
        'Follow every order, from packed to delivered.'
      ],
      button: 'Order now',
      link: '/products'
    },
    {
      icon: 'fa-handshake',
      title: 'Delivery and payment',
      points: [
        'Our riders bring your order to your door. Give them the delivery code from your order page, so the package reaches the right person.',
        'Pay online from your own bank account through the RMA Payment Gateway, before delivery.'
      ],
      button: 'Read more',
      link: '/about'
    },
    {
      icon: 'fa-star',
      title: 'Reviews and ratings',
      points: ['Every review comes from a customer who received their order, so you can trust what you read.'],
      button: 'Read the reviews',
      link: '/reviews'
    }
  ];
}
