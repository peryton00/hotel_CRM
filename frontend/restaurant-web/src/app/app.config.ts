import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import {
  RESTAURANT_REPO,
  CUSTOMER_REPO,
  TABLE_REPO,
  MENU_REPO,
  ORDER_REPO,
  COUPON_REPO,
  BILLING_REPO,
  RESERVATION_REPO,
  LOYALTY_REPO,
  FEEDBACK_REPO,
  STAFF_REPO,
} from './data-access/repositories';
import {
  ApiRestaurantRepository,
  ApiCustomerRepository,
  ApiTableRepository,
  ApiMenuRepository,
  ApiOrderRepository,
  ApiCouponRepository,
  ApiBillingRepository,
  ApiReservationRepository,
  ApiLoyaltyRepository,
  ApiFeedbackRepository,
  ApiStaffRepository,
} from './data-access/api/api-repositories';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: RESTAURANT_REPO, useClass: ApiRestaurantRepository },
    { provide: CUSTOMER_REPO, useClass: ApiCustomerRepository },
    { provide: TABLE_REPO, useClass: ApiTableRepository },
    { provide: MENU_REPO, useClass: ApiMenuRepository },
    { provide: ORDER_REPO, useClass: ApiOrderRepository },
    { provide: COUPON_REPO, useClass: ApiCouponRepository },
    { provide: BILLING_REPO, useClass: ApiBillingRepository },
    { provide: RESERVATION_REPO, useClass: ApiReservationRepository },
    { provide: LOYALTY_REPO, useClass: ApiLoyaltyRepository },
    { provide: FEEDBACK_REPO, useClass: ApiFeedbackRepository },
    { provide: STAFF_REPO, useClass: ApiStaffRepository },
  ],
};
