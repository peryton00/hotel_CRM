import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Order } from '../models/order.model';
import { Reservation } from '../models/reservation.model';
import { buildWhatsAppBillMessage, getWhatsAppPhoneDigits } from '../utils/whatsapp-bill.util';

export const DEFAULT_WA_TEMPLATES = {
  pending:
    'Namaste {customer_name}! 🙏 We have received your reservation request for {restaurant_name} on {date} at {time} for {guests} guests.\n\nOur team is currently reviewing availability. We will confirm your table shortly.\n\nThank you for choosing us!',
  confirmed:
    'Namaste {customer_name}! 🌟 Your reservation at {restaurant_name} is CONFIRMED!\n\n📅 Date: {date}\n⏰ Time: {time}\n👥 Guests: {guests}\n🪑 Allocated Table: Table {table_number} ({section})\n\nWe look forward to serving you! If you need to make changes, please contact us.',
  cancelled:
    'Namaste {customer_name}. We regret to inform you that your reservation request at {restaurant_name} for {date} at {time} could not be confirmed.\n\nPlease contact us directly if you would like to reserve for an alternative slot. We apologize for the inconvenience.',
};

export interface WhatsAppBridgeStatus {
  status: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';
  qr: string | null;
  phone: string | null;
  name: string | null;
}

export interface SendWhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class WhatsAppBridgeService {
  private readonly bridgeUrl = 'http://127.0.0.1:3001';

  // Reactive state signals
  readonly connectionStatus = signal<'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED'>(
    'DISCONNECTED',
  );
  readonly qrCodeDataUrl = signal<string | null>(null);
  readonly connectedPhone = signal<string | null>(null);
  readonly connectedName = signal<string | null>(null);
  readonly isBridgeReachable = signal<boolean>(false);

  private isPollerRunning = false;

  constructor(private http: HttpClient) {}

  /**
   * Starts status polling only when active or requested
   * Uses adaptive backoff: 3s when connecting/scanning QR, 10s when connected, 8s when bridge offline
   */
  startStatusPoller(): void {
    if (this.isPollerRunning) return;
    this.isPollerRunning = true;

    timer(0, 4000)
      .pipe(switchMap(() => this.fetchStatus()))
      .subscribe();
  }

  /**
   * Fetches the current WhatsApp Gateway state and QR code
   */
  fetchStatus(): Observable<WhatsAppBridgeStatus> {
    return this.http.get<WhatsAppBridgeStatus>(`${this.bridgeUrl}/status`).pipe(
      map((res) => {
        this.isBridgeReachable.set(true);
        this.connectionStatus.set(res.status);
        this.qrCodeDataUrl.set(res.qr);
        this.connectedPhone.set(res.phone);
        this.connectedName.set(res.name);
        return res;
      }),
      catchError(() => {
        this.isBridgeReachable.set(false);
        this.connectionStatus.set('DISCONNECTED');
        this.qrCodeDataUrl.set(null);
        return of({
          status: 'DISCONNECTED' as const,
          qr: null,
          phone: null,
          name: null,
        });
      }),
    );
  }

  /**
   * Generic direct text message dispatch to the local Baileys WhatsApp Bridge
   */
  sendMessage(phone: string, message: string): Observable<SendWhatsAppResponse> {
    const cleanDigits = getWhatsAppPhoneDigits(phone);
    if (!cleanDigits || cleanDigits.length < 10) {
      return of({
        success: false,
        error: 'Customer phone number is invalid or has fewer than 10 digits',
      });
    }

    return this.http
      .post<SendWhatsAppResponse>(`${this.bridgeUrl}/send`, {
        phone: cleanDigits,
        message,
      })
      .pipe(
        catchError((err) => {
          return of({
            success: false,
            error:
              err?.error?.error ||
              err?.message ||
              'Local WhatsApp bridge unreachable on 127.0.0.1:3001',
          });
        }),
      );
  }

  /**
   * Dispatches reservation pending acknowledgment via the local WhatsApp Bridge
   */
  sendReservationPending(
    res: Reservation,
    restaurantName: string,
    customTemplate?: string,
  ): Observable<SendWhatsAppResponse> {
    const template = customTemplate || DEFAULT_WA_TEMPLATES.pending;
    const tokens: Record<string, string> = {
      customer_name: res.customerName || 'Valued Guest',
      restaurant_name: restaurantName || 'Our Restaurant',
      date: this.formatReservationDate(res.reservationDate || res.reservationTime),
      time: this.formatReservationTime(res.reservationTime || res.reservationDate),
      guests: String(res.partySize || 2),
    };
    const message = this.interpolateTemplate(template, tokens);
    return this.sendMessage(res.customerPhone, message);
  }

  /**
   * Dispatches reservation confirmation with allocated table details via the local WhatsApp Bridge
   */
  sendReservationConfirmed(
    res: Reservation,
    tableNumber: string,
    section: string,
    restaurantName: string,
    customTemplate?: string,
  ): Observable<SendWhatsAppResponse> {
    const template = customTemplate || DEFAULT_WA_TEMPLATES.confirmed;
    const tokens: Record<string, string> = {
      customer_name: res.customerName || 'Valued Guest',
      restaurant_name: restaurantName || 'Our Restaurant',
      date: this.formatReservationDate(res.reservationDate || res.reservationTime),
      time: this.formatReservationTime(res.reservationTime || res.reservationDate),
      guests: String(res.partySize || 2),
      table_number: tableNumber || 'Assigned Table',
      section: section || 'Main Dining Floor',
    };
    const message = this.interpolateTemplate(template, tokens);
    return this.sendMessage(res.customerPhone, message);
  }

  /**
   * Dispatches reservation cancellation notification via the local WhatsApp Bridge
   */
  sendReservationCancelled(
    res: Reservation,
    restaurantName: string,
    customTemplate?: string,
  ): Observable<SendWhatsAppResponse> {
    const template = customTemplate || DEFAULT_WA_TEMPLATES.cancelled;
    const tokens: Record<string, string> = {
      customer_name: res.customerName || 'Valued Guest',
      restaurant_name: restaurantName || 'Our Restaurant',
      date: this.formatReservationDate(res.reservationDate || res.reservationTime),
      time: this.formatReservationTime(res.reservationTime || res.reservationDate),
      guests: String(res.partySize || 2),
    };
    const message = this.interpolateTemplate(template, tokens);
    return this.sendMessage(res.customerPhone, message);
  }

  interpolateTemplate(template: string, tokens: Record<string, string>): string {
    let result = template;
    for (const [key, val] of Object.entries(tokens)) {
      result = result.split(`{${key}}`).join(val);
    }
    return result;
  }

  private formatReservationDate(dateStr?: string): string {
    if (!dateStr) return 'Upcoming';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch {}
    return dateStr;
  }

  private formatReservationTime(timeStr?: string): string {
    if (!timeStr) return 'Scheduled Time';
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } catch {}
    return timeStr;
  }

  /**
   * Dispatches text bill directly through Baileys (1-click silent background send)
   */
  sendBill(
    phone: string,
    restaurantName: string,
    order: Order,
    split?: {
      splitIndex?: number;
      splitTotalCount?: number;
      totalAmount?: number;
      paymentStatus?: string;
      paymentMethod?: string;
    } | null,
    customMessage?: string,
  ): Observable<SendWhatsAppResponse> {
    const cleanDigits = getWhatsAppPhoneDigits(phone);
    if (!cleanDigits || cleanDigits.length < 10) {
      return of({ success: false, error: 'Customer phone number is invalid or missing' });
    }

    const message = customMessage || buildWhatsAppBillMessage(restaurantName, order, split);

    return this.http
      .post<SendWhatsAppResponse>(`${this.bridgeUrl}/send`, {
        phone: cleanDigits,
        message,
      })
      .pipe(
        catchError((err) => {
          return of({
            success: false,
            error: err?.error?.error || err?.message || 'Failed to dispatch WhatsApp message',
          });
        }),
      );
  }

  /**
   * Logout and clear local session
   */
  logout(): Observable<{ success: boolean; message?: string }> {
    return this.http
      .post<{ success: boolean; message?: string }>(`${this.bridgeUrl}/logout`, {})
      .pipe(
        map((res) => {
          this.fetchStatus().subscribe();
          return res;
        }),
        catchError((err) => of({ success: false, message: err?.message || 'Logout failed' })),
      );
  }
}
