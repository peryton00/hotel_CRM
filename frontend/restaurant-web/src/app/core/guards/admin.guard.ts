import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';
import { ToastService } from '../services/toast.service';

export const adminGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!auth.isAuthenticated()) {
    // Redirect unauthenticated visitor to staff login terminal
    router.navigate(['/admin/login']);
    return false;
  }

  // If this is the parent '/admin' shell, authentication is sufficient.
  // Child route activation will enforce RBAC on specific sub-pages.
  if (route.routeConfig?.path === 'admin') {
    return true;
  }

  // Extract the target sub-route from the child route configuration or current state URL
  const rawPath = route.routeConfig?.path || state.url;
  const targetPath = (rawPath || '')
    .toLowerCase()
    .trim()
    .replace(/^\/?admin(\/|$)/, '')
    .replace(/^\//, '')
    .split('/')[0];

  // If visiting the empty path or root without specific page:
  if (!targetPath) {
    const fallback = auth.getDefaultRouteForRole();
    if (state.url !== fallback) {
      router.navigate([fallback]);
    }
    return false;
  }

  if (!auth.canAccess(targetPath)) {
    const roleName = auth.staffRole();
    const fallback = auth.getDefaultRouteForRole();

    // If attempting to go to an explicit forbidden page (other than the default dashboard redirect), notify user
    if (targetPath !== 'dashboard') {
      toast.error(
        `Controlled Access: Your role (${roleName}) does not have permission to view ${targetPath}.`,
      );
    }

    if (state.url !== fallback) {
      router.navigate([fallback]);
    }
    return false;
  }

  return true;
};
