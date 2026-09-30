import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type Star = 'full' | 'half' | 'empty';

@Component({
  selector: 'app-product-rating',
  imports: [RouterLink],
  templateUrl: './product-rating.html',
  styleUrl: './product-rating.css'
})
export class ProductRating {
  reviews = [
    {
      photo: 'Images/Cost(1).jpg',
      rating: 4.5,
      text: 'I love this website! The natural products they offer are of exceptional quality, and the customer service is top-notch. The website is easy to navigate, and I appreciate the detailed information provided about each product. The shipping was fast, and the packaging was eco-friendly. My only suggestion would be to offer more discounts and promotions. Thank you.'
    },
    {
      photo: 'Images/Cost(2).jpg',
      rating: 3,
      text: 'The natural products available on this website are good, but I have had some issues with customer service. It took a while for them to respond to my inquiries, and when I had an issue with a product, the resolution process was slow. The website itself is okay, but it could be more user-friendly. However, their pricing is competitive compared to other sites. Thank you.'
    },
    {
      photo: 'Images/Cost(3).jpg',
      rating: 5,
      text: 'I am extremely satisfied with this website! The natural products I have purchased have been fantastic, and the customer service team is quick to respond and resolve any issues. The website is intuitive and visually appealing, making it enjoyable to browse and shop. The shipping is prompt, and I appreciate the attention to detail in the packaging. Highly recommended!'
    }
  ];

  // 4.5 becomes: full, full, full, full, half
  stars(rating: number): Star[] {
    return [1, 2, 3, 4, 5].map(n => (rating >= n ? 'full' : rating >= n - 0.5 ? 'half' : 'empty'));
  }

  hide(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
