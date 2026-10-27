export type ReservationStatus =
  'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  tableId?: string;
  tableNumber?: string;
  section?: string;
  reservationDate: string;
  specialRequests?: string;
  status: ReservationStatus;
  createdAt: string;
}
