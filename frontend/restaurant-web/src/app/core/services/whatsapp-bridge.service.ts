import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { Order } from '../models/order.model';
import { buildWhatsAppBillMessage, getWhatsAppPhoneDigits } from '../utils/whatsapp-bill.util';

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
