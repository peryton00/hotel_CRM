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
    if (authSessionStr) {
      headers = headers.set('Authorization', `Bearer ${authSessionStr}`);
    }

    const restaurantId =
      localStorage.getItem('active_restaurant_id') || '00000000-0000-0000-0000-000000000001';
    headers = headers.set('x-restaurant-id', restaurantId);

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
        catchError((err) => this.handleError(err)),
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
    const errorMsg =
      error.error?.error?.message || error.message || 'An unexpected server error occurred';
    console.error('API Client Error:', errorMsg, error);
    return throwError(() => new Error(errorMsg));
  }
}
