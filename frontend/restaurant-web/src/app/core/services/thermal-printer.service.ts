import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  EscPosPrinterConfig,
  DEFAULT_PRINTER_CONFIG,
  buildEscPosReceipt,
  buildEscPosTestReceipt,
} from '../utils/escpos.util';
import { Order } from '../models/order.model';
import { Restaurant } from '../models/restaurant.model';

export interface SystemPrinterInfo {
  name: string;
  is_default: boolean;
  port_name?: string;
}

export interface ThermalPrintResult {
  success: boolean;
  message: string;
  bytes_written?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ThermalPrinterService {
  private get requestOptions() {
    return { headers: { Authorization: `Bearer ${localStorage.getItem('sb-access-token') || ''}` } };
  }

  private http = inject(HttpClient);
  private storageKey = 'hotel_crm_printer_config';

  config = signal<EscPosPrinterConfig>(this.loadConfig());
  systemPrinters = signal<SystemPrinterInfo[]>([]);
  isLoadingPrinters = signal<boolean>(false);

  constructor() {
    this.loadSystemPrinters();
  }

  loadSystemPrinters(): void {
    this.isLoadingPrinters.set(true);
    this.getSystemPrinters().subscribe({
      next: (list) => {
        this.systemPrinters.set(list);
        this.isLoadingPrinters.set(false);
        if (!this.config().printerName && list.length > 0) {
          const def = list.find((p) => p.is_default) || list[0];
          if (def) {
            this.saveConfig({ printerName: def.name });
          }
        }
      },
      error: () => this.isLoadingPrinters.set(false),
    });
  }

  loadConfig(): EscPosPrinterConfig {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_PRINTER_CONFIG, ...parsed };
      }
    } catch {}
    return { ...DEFAULT_PRINTER_CONFIG };
  }

  saveConfig(newConfig: Partial<EscPosPrinterConfig>): EscPosPrinterConfig {
    const updated = { ...this.config(), ...newConfig };
    this.config.set(updated);
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(updated));
    } catch {}
    return updated;
  }

  /**
   * Fetches the list of installed printers on the host system
   */
  getSystemPrinters(): Observable<SystemPrinterInfo[]> {
    const url = `${environment.apiBaseUrl}/printer/list`;
    return this.http.get<SystemPrinterInfo[]>(url, this.requestOptions).pipe(
      catchError(() => {
        // Fallback or empty if offline
        return of([]);
      }),
    );
  }

  /**
   * Send raw ESC/POS bytes directly to the thermal receipt printer
   */
  printEscPosBytes(rawBytes: Uint8Array): Observable<ThermalPrintResult> {
    const cfg = this.config();
    const bytesArray = Array.from(rawBytes);

    // 1. Try Tauri native print_escpos_raw if running in Tauri desktop shell
    const w = typeof window !== 'undefined' ? (window as any) : null;
    const tauriInvoke =
      w?.__TAURI__?.core?.invoke || w?.__TAURI__?.invoke || w?.__TAURI_INTERNALS__?.invoke;

    if (typeof tauriInvoke === 'function') {
      return from(
        tauriInvoke('print_escpos_raw', {
          target: cfg.target,
          printerName: cfg.printerName || null,
          networkAddress: cfg.networkAddress || null,
          rawBytes: bytesArray,
        }) as Promise<ThermalPrintResult>,
      ).pipe(
        catchError((err) => {
          console.warn('[ThermalPrinter] Tauri direct print failed, trying backend API:', err);
          return this.sendToBackendApi(cfg, bytesArray);
        }),
      );
    }

    // 2. Otherwise send via local Backend API
    return this.sendToBackendApi(cfg, bytesArray);
  }

  private sendToBackendApi(
    cfg: EscPosPrinterConfig,
    rawBytes: number[],
  ): Observable<ThermalPrintResult> {
    const url = `${environment.apiBaseUrl}/printer/print`;
    return this.http
      .post<ThermalPrintResult>(url, {
        target: cfg.target,
        printer_name: cfg.printerName || null,
        network_address: cfg.networkAddress || null,
        raw_bytes: rawBytes,
      }, this.requestOptions)
      .pipe(
        catchError((err) => {
          const msg =
            err?.error?.error ||
            err?.message ||
            'Failed to communicate with thermal printer hardware.';
          return of({
            success: false,
            message: msg,
          });
        }),
      );
  }

  /**
   * Print Order Receipt on Hardware Thermal Printer
   */
  printOrderReceipt(
    restaurant: Partial<Restaurant>,
    order: Order,
    split?: {
      splitIndex?: number;
      splitTotalCount?: number;
      totalAmount?: number;
      paymentStatus?: string;
      paymentMethod?: string;
      printCount?: number;
    } | null,
  ): Observable<ThermalPrintResult> {
    const cfg = this.config();
    if (cfg.target === 'BROWSER') {
      // In BROWSER mode, signal fallback to window.print()
      return of({
        success: true,
        message: 'Browser print mode active',
      });
    }

    const raw = buildEscPosReceipt(restaurant, order, split, cfg);
    return this.printEscPosBytes(raw);
  }

  /**
   * Send Test Receipt to Hardware Printer
   */
  testPrint(restaurantName?: string): Observable<ThermalPrintResult> {
    const cfg = this.config();
    const raw = buildEscPosTestReceipt(restaurantName || 'Hotel CRM Thermal POS', cfg.paperWidth);
    return this.printEscPosBytes(raw);
  }
}
