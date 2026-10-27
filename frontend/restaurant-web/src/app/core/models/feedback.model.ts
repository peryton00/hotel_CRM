export interface Feedback {
  id: string;
  orderId?: string;
  orderNumber?: string;
  customerName: string;
  rating: number; // 1-5
  foodRating?: number;
  ambianceRating?: number;
  serviceRating?: number;
  comment: string;
  createdAt: string;
  status: 'PENDING' | 'PUBLISHED' | 'ARCHIVED';
  adminResponse?: string;
}
