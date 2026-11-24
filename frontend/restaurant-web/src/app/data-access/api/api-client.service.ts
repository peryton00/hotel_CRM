import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { ToastService } from '../../core/services/toast.service';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private router = inject(Router, { optional: true });
  private toastService = inject(ToastService, { optional: true });
  private auth = inject(AdminAuthService, { optional: true });
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

    return this.http.get<any>(`${environment.supabaseUrl}/rest/v1/${table}`, { headers }).pipe(
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
        catchError((err) => {
          const errMsg = (
            (err?.message || '') +
            ' ' +
            (typeof err === 'string' ? err : '') +
            ' ' +
            (typeof err?.error === 'string' ? err.error : '') +
            ' ' +
            (err?.error?.message || '')
          ).toLowerCase();

          const isConnErr =
            errMsg.includes('os error 11001') ||
            errMsg.includes('no such host is known') ||
            errMsg.includes('error communicating with database');

          if (!isConnErr) {
            const fallback = this.fallbackSupabasePost<T>(endpoint, body);
            if (
              fallback &&
              (err.status === 0 || err.status === 502 || err.status === 503)
            ) {
              return fallback;
            }
          }
          return this.handleError(err);
        }),
      );
  }

  put<T>(endpoint: string, body: any): Observable<T> {
    return this.http
      .put<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          const fallback = this.fallbackSupabasePut<T>(endpoint, body);
          if (
            fallback &&
            (err.status === 0 || err.status === 502 || err.status === 503)
          ) {
            return fallback;
          }
          return this.handleError(err);
        }),
      );
  }

  private fallbackSupabasePut<T>(endpoint: string, body: any): Observable<T> | null {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;

    const headers = new HttpHeaders({
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${environment.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    });

    const clean = endpoint.split('?')[0].replace(/^\//, '');
    const restaurantId =
      localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001';

    if (clean === 'restaurants' || clean === 'restaurants/settings') {
      return this.http
        .patch<any>(`${environment.supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}`, body, {
          headers,
        })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('menu/items/') && clean.endsWith('/availability')) {
      const id = clean.split('/')[2];
      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/menu_items?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          { is_available: body.is_available, updated_at: new Date().toISOString() },
          { headers },
        )
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('menu/items/')) {
      const id = clean.split('/')[2];
      const payload: any = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) payload.name = body.name;
      if (body.description !== undefined) payload.description = body.description;
      if (body.category_id !== undefined) payload.category_id = body.category_id;
      if (body.base_price_paise !== undefined) {
        payload.base_price_paise = body.base_price_paise;
        payload.price_paise = body.base_price_paise;
      }
      if (body.tax_rate_percent !== undefined) payload.tax_rate_percent = body.tax_rate_percent;
      if (body.is_veg !== undefined) {
        payload.is_veg = body.is_veg;
        payload.dietary = body.is_veg ? 'VEG' : 'NON_VEG';
      }
      if (body.is_available !== undefined) payload.is_available = body.is_available;
      if (body.image_url !== undefined) payload.image_url = body.image_url;
      if (body.preparation_time_minutes !== undefined)
        payload.preparation_time_minutes = body.preparation_time_minutes;

      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/menu_items?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          payload,
          { headers },
        )
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('tables/') && clean.endsWith('/status')) {
      const id = clean.split('/')[1];
      const payload: any = { updated_at: new Date().toISOString() };
      if (body.status !== undefined) payload.status = body.status;
      if (body.active_order_id !== undefined) payload.active_order_id = body.active_order_id;
      if (body.assigned_staff_id !== undefined) payload.assigned_staff_id = body.assigned_staff_id;
      if (body.ordering_enabled !== undefined) payload.ordering_enabled = body.ordering_enabled;

      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/tables?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          payload,
          { headers },
        )
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('coupons/') && clean.endsWith('/status')) {
      const id = clean.split('/')[1];
      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/coupons?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          { is_active: body.is_active, updated_at: new Date().toISOString() },
          { headers },
        )
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('feedback/') && clean.endsWith('/reply')) {
      const id = clean.split('/')[1];
      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/customer_feedback?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          {
            resolution_note: body.resolution_note,
            is_resolved: true,
            updated_at: new Date().toISOString(),
          },
          { headers },
        )
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    return null;
  }

  private fallbackSupabasePost<T>(endpoint: string, body: any): Observable<T> | null {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;

    const headers = new HttpHeaders({
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${environment.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    });

    const clean = endpoint.split('?')[0].replace(/^\//, '');
    const restaurantId =
      localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001';

    if (clean === 'menu/items') {
      const payload = {
        restaurant_id: restaurantId,
        category_id: body.category_id,
        name: body.name,
        description: body.description,
        price_paise: body.base_price_paise,
        base_price_paise: body.base_price_paise,
        tax_rate_percent: body.tax_rate_percent || 5.0,
        dietary: body.is_veg === false ? 'NON_VEG' : 'VEG',
        is_veg: body.is_veg !== false,
        is_available: body.is_available !== false,
        image_url: body.image_url,
        preparation_time_minutes: body.preparation_time_minutes || 15,
        display_order: body.display_order || 0,
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/menu_items`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean === 'menu/categories') {
      const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const payload = {
        restaurant_id: restaurantId,
        name: body.name,
        slug,
        display_order: body.display_order || 0,
        is_active: true,
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/menu_categories`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean === 'tables') {
      const token =
        body.qr_code_identifier ||
        `tbl-${body.table_number.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const payload = {
        restaurant_id: restaurantId,
        number: body.table_number,
        capacity: body.capacity || 4,
        section: body.section || 'Main Dining',
        qr_token: token,
        qr_code_identifier: token,
        status: 'AVAILABLE',
        ordering_enabled: true,
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/tables`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean === 'reservations') {
      const payload = {
        restaurant_id: restaurantId,
        table_id: body.table_id || null,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        customer_phone_e164: body.customer_phone,
        party_size: body.guest_count || 2,
        reservation_time: body.reservation_time,
        special_requests: body.special_requests,
        status: 'CONFIRMED',
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/reservations`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean === 'coupons') {
      const payload = {
        restaurant_id: restaurantId,
        code: (body.code || '').toUpperCase(),
        description: body.description || '',
        discount_type: body.discount_type || 'PERCENTAGE',
        discount_value: body.discount_value || 0,
        min_order_amount_paise: body.min_order_amount_paise || 0,
        max_discount_paise: body.max_discount_amount_paise,
        one_time_per_customer: body.one_time_per_customer !== false,
        is_active: true,
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/coupons`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean === 'feedback') {
      const payload = {
        restaurant_id: restaurantId,
        order_id: body.order_id,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        rating: body.rating || 5,
        comments: body.comments || '',
        is_resolved: false,
      };
      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/customer_feedback`, payload, { headers })
        .pipe(map((res) => (Array.isArray(res) ? res[0] : res) as T));
    }

    if (clean.startsWith('customers/') && clean.endsWith('/points')) {
      const id = clean.split('/')[1];
      return this.http
        .post<any>(
          `${environment.supabaseUrl}/rest/v1/rpc/increment_customer_points`,
          {
            p_customer_id: id,
            p_points: body.points,
          },
          { headers },
        )
        .pipe(map((res) => res as T));
    }

    if (clean === 'orders') {
      const orderPayload: any = {
        id: body.id || undefined,
        restaurant_id: restaurantId,
        order_number:
          body.order_number ||
          `ORD-${(body.id || Math.random().toString(36).substring(2, 10)).substring(0, 8).toUpperCase()}`,
        table_id: body.table_id || null,
        customer_id: body.customer_id || null,
        customer_name: body.customer_name || 'Walk-in Guest',
        customer_phone: body.customer_phone || null,
        customer_phone_e164: body.customer_phone || body.customer_phone_e164 || null,
        order_type: (body.order_type || 'DINE_IN').toUpperCase(),
        status: (body.status || 'CONFIRMED').toUpperCase(),
        payment_status: (body.payment_status || 'PENDING').toUpperCase(),
        subtotal_paise: body.subtotal_paise || 0,
        discount_paise: body.discount_paise || 0,
        tax_paise: body.tax_paise || 0,
        total_amount_paise: body.total_amount_paise || 0,
        notes: body.notes || '',
      };
      if (body.seating_session_id) orderPayload.seating_session_id = body.seating_session_id;
      if (body.server_staff_id) orderPayload.server_staff_id = body.server_staff_id;

      return this.http
        .post<any>(`${environment.supabaseUrl}/rest/v1/orders`, orderPayload, { headers })
        .pipe(
          map((res) => {
            const created = Array.isArray(res) ? res[0] : res;
            if (created && created.id && Array.isArray(body.items) && body.items.length > 0) {
              const itemRows = body.items.map((it: any) => ({
                order_id: created.id,
                menu_item_id: it.menu_item_id || null,
                name: it.item_name || it.name || 'Dish Item',
                quantity: it.quantity || 1,
                unit_price_paise: it.unit_price_paise || 0,
                item_total_paise: (it.unit_price_paise || 0) * (it.quantity || 1),
                total_paise: (it.unit_price_paise || 0) * (it.quantity || 1),
                subtotal_paise: (it.unit_price_paise || 0) * (it.quantity || 1),
                notes: it.notes || '',
              }));
              this.http
                .post(`${environment.supabaseUrl}/rest/v1/order_items`, itemRows, { headers })
                .subscribe({ error: () => {} });
            }
            return (created || body) as T;
          }),
        );
    }

    return null;
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http
      .delete<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          const fallback = this.fallbackSupabaseDelete<T>(endpoint);
          if (
            fallback &&
            (err.status === 0 || err.status === 502 || err.status === 503)
          ) {
            return fallback;
          }
          return this.handleError(err);
        }),
      );
  }

  private fallbackSupabaseDelete<T>(endpoint: string): Observable<T> | null {
    if (!environment.supabaseUrl || !environment.supabaseAnonKey) return null;

    const headers = new HttpHeaders({
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${environment.supabaseAnonKey}`,
    });

    const clean = endpoint.split('?')[0].replace(/^\//, '');
    const restaurantId =
      localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001';

    if (clean.startsWith('menu/items/')) {
      const id = clean.split('/')[2];
      return this.http
        .patch<any>(
          `${environment.supabaseUrl}/rest/v1/order_items?menu_item_id=eq.${id}`,
          { menu_item_id: null },
          { headers },
        )
        .pipe(
          catchError(() => of(null)),
          switchMap(() =>
            this.http.delete<any>(
              `${environment.supabaseUrl}/rest/v1/menu_items?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
              { headers },
            ),
          ),
          map(() => ({ deleted: true }) as unknown as T),
        );
    }

    if (clean.startsWith('menu/categories/')) {
      const id = clean.split('/')[2];
      return this.http
        .delete<any>(
          `${environment.supabaseUrl}/rest/v1/menu_categories?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          { headers },
        )
        .pipe(map(() => ({ deleted: true }) as unknown as T));
    }

    if (clean.startsWith('tables/')) {
      const id = clean.split('/')[1];
      return this.http
        .delete<any>(
          `${environment.supabaseUrl}/rest/v1/tables?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          { headers },
        )
        .pipe(map(() => ({ deleted: true }) as unknown as T));
    }

    if (clean.startsWith('coupons/')) {
      const id = clean.split('/')[1];
      return this.http
        .delete<any>(
          `${environment.supabaseUrl}/rest/v1/coupons?id=eq.${id}&restaurant_id=eq.${restaurantId}`,
          { headers },
        )
        .pipe(map(() => ({ deleted: true }) as unknown as T));
    }

    return null;
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

    if (error?.status === 401) {
      const currentRoute = this.router?.url || '';
      const currentUser = localStorage.getItem('staff_user');
      const token = localStorage.getItem('sb-access-token') || '';
      const isPosStaffSession =
        !!currentUser && (token.startsWith('sb_jwt_') || environment.isDesktop);

      if (!currentRoute.includes('/admin/login') && !isPosStaffSession) {
        this.handleSessionExpired();
      } else if (isPosStaffSession) {
        console.warn(
          '[ApiClient] 401 received while POS staff session is active. Preserving local terminal state.',
        );
      }
    }

    const errObj: any = new Error(errorMsg);
    errObj.status = error?.status;
    errObj.originalError = error;
    return throwError(() => errObj);
  }

  private handleSessionExpired(): void {
    if (this.auth) {
      this.auth.logout(true);
    } else {
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('supabase_auth_token');
      localStorage.removeItem('staff_role');
      localStorage.removeItem('staff_user');
      this.router?.navigate(['/admin/login'], { queryParams: { expired: 'true' } });
    }
    this.toastService?.warning(
      'Your session has expired. Please sign in again.',
      'Authentication Expired',
    );
  }
}
