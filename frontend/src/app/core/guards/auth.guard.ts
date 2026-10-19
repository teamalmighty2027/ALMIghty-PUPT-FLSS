import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { RoleService } from '../services/role/role.service';
import { PermissionService } from '../services/permission/permission.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService,
    private roleService: RoleService,
    private permissionService: PermissionService,
  ) {}

  // Validate authentication, token expiration, and role permissions.
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const isLogin = this.isLoginRoute(next);
    const isAuthenticated = this.authService.isAuthenticated();
    const isExpired = this.authService.isTokenExpired();

    if (!isAuthenticated || isExpired) {
      if (isAuthenticated && isExpired) {
        this.authService.expireSession();
      }

      return isLogin ? true : this.router.createUrlTree(['/login']);
    }

    const userRole = this.authService.getUserRole() || '';
    const expectedRole = next.data['role'] as string;
    const requiredPermission = next.data['requirePermission'] as
      string | string[] | undefined;
    const userRoles = this.authService.getUserRoles();

    if (
      expectedRole &&
      !this.roleService.hasRequiredRole(userRoles, expectedRole)
    ) {
      return this.router.createUrlTree(['/forbidden']);
    }

    // Check for required permission
    if (
      requiredPermission &&
      !this.permissionService.hasAnyPermission(
        Array.isArray(requiredPermission)
          ? requiredPermission
          : [requiredPermission]
      )
    ) {
      return this.router.createUrlTree(['/forbidden']);
    }

    return isLogin
      ? this.roleService.getHomeUrlForRole(userRole)
      : true;
  }

  private isLoginRoute(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.path === 'login';
  }
}
