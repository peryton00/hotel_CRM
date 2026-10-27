import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

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
  MockRestaurantRepository,
  MockCustomerRepository,
  MockTableRepository,
  MockMenuRepository,
  MockOrderRepository,
  MockCouponRepository,
  MockBillingRepository,
  MockReservationRepository,
  MockLoyaltyRepository,
  MockFeedbackRepository,
  MockStaffRepository,
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
  ApiStaffRepository,
} from './data-access/api/api-repositories';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: RESTAURANT_REPO,
      useClass: environment.useMockRepositories
        ? MockRestaurantRepository
        : ApiRestaurantRepository,
    },
    {
      provide: CUSTOMER_REPO,
      useClass: environment.useMockRepositories ? MockCustomerRepository : ApiCustomerRepository,
    },
    {
      provide: TABLE_REPO,
      useClass: environment.useMockRepositories ? MockTableRepository : ApiTableRepository,
    },
    {
      provide: MENU_REPO,
      useClass: environment.useMockRepositories ? MockMenuRepository : ApiMenuRepository,
    },
    {
      provide: ORDER_REPO,
      useClass: environment.useMockRepositories ? MockOrderRepository : ApiOrderRepository,
    },
    {
      provide: COUPON_REPO,
      useClass: environment.useMockRepositories ? MockCouponRepository : ApiCouponRepository,
    },
    {
      provide: BILLING_REPO,
      useClass: environment.useMockRepositories ? MockBillingRepository : ApiBillingRepository,
    },
    {
      provide: RESERVATION_REPO,
      useClass: environment.useMockRepositories
        ? MockReservationRepository
        : ApiReservationRepository,
    },
    { provide: LOYALTY_REPO, useClass: MockLoyaltyRepository },
    { provide: FEEDBACK_REPO, useClass: MockFeedbackRepository },
    {
      provide: STAFF_REPO,
      useClass: environment.useMockRepositories ? MockStaffRepository : ApiStaffRepository,
    },
  ],
};
