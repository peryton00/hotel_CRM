import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    // Check for Supabase token in localStorage
    const authSessionStr =
      localStorage.getItem('sb-access-token') || localStorage.getItem('supabase_auth_token');
    if (authSessionStr && authSessionStr !== 'undefined' && authSessionStr !== 'null') {
      headers = headers.set('Authorization', `Bearer ${authSessionStr}`);
    }

    const restaurantId =
      localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001';
    headers = headers.set('x-restaurant-id', restaurantId);

    if (!environment.production) {
      headers = headers.set('x-dev-user-id', '00000000-0000-0000-0000-000000000002');
      headers = headers.set('x-dev-role', 'admin');
    }

    return headers;
  }

  get<T>(endpoint: string, params?: { [key: string]: any }): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach((key) => {
        if (params[key] !== undefined && params[key] !== null) {
          httpParams = httpParams.set(key, params[key].toString());
        }
      });
    }

    return this.http
      .get<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, {
        headers: this.getHeaders(),
        params: httpParams,
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          const fallback = this.fallbackSupabaseGet<T>(endpoint);
          if (fallback && (err.status === 0 || err.status === 502 || err.status === 503)) {
            return fallback;
          }
          return this.handleError(err);
        }),
      );
  }

  private fallbackSupabaseGet<T>(endpoint: string): Observable<T> | null {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;

    const headers = new HttpHeaders({
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${environment.supabaseAnonKey}`,
    });

    const clean = endpoint.split('?')[0].replace(/^\//, '');
    let table = '';
    let isSingle = false;

    if (clean === 'restaurants') {
      table = 'restaurants?select=*&limit=1';
      isSingle = true;
    } else if (clean === 'tables') {
      table = 'tables?select=*&order=number.asc';
    } else if (clean === 'menu/categories') {
      table = 'menu_categories?select=*&order=display_order.asc';
    } else if (clean === 'menu/items') {
      table = 'menu_items?select=*&order=display_order.asc';
    } else if (clean === 'orders') {
      table = 'orders?select=*,order_items(*)&order=created_at.desc';
    } else if (clean === 'customers') {
      table = 'customers?select=*&order=created_at.desc';
    } else if (clean === 'coupons') {
      table = 'coupons?select=*&order=created_at.desc';
    } else if (clean === 'reservations') {
      table = 'reservations?select=*&order=reservation_time.asc';
    } else if (clean === 'restaurants/staff') {
      table = 'staff_members?select=*&order=created_at.desc';
    } else if (clean === 'inventory/items') {
      table = 'inventory_items?select=*&order=name.asc';
    } else if (clean === 'inventory/movements') {
      table = 'stock_movements?select=*&order=created_at.desc&limit=50';
    } else {
      return null;
    }

    return this.http
      .get<any>(`${environment.supabaseUrl}/rest/v1/${table}`, { headers })
      .pipe(
        map((res) => {
          if (isSingle) {
            return (Array.isArray(res) ? res[0] : res) as T;
          }
          return res as T;
        }),
      );
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => this.handleError(err)),
      );
  }

  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http
      .put<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => this.handleError(err)),
      );
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http
      .delete<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => this.handleError(err)),
      );
  }

  private handleError(error: any) {
    let errorMsg = 'An unexpected server error occurred';

    if (typeof error?.error === 'string' && error.error.trim()) {
      errorMsg = error.error.trim();
    } else if (error?.error?.error?.message) {
      errorMsg = error.error.error.message;
    } else if (typeof error?.error?.error === 'string' && error.error.error.trim()) {
      errorMsg = error.error.error.trim();
    } else if (error?.error?.message) {
      errorMsg = error.error.message;
    } else if (error?.statusText && error?.status) {
      errorMsg = `Server returned ${error.status}: ${error.statusText}`;
    } else if (error?.message) {
      errorMsg = error.message;
    }

    console.error('API Client Error:', errorMsg, error);
    return throwError(() => new Error(errorMsg));
  }
}
