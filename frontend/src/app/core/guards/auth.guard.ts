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

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const isAuthenticated = this.authService.isAuthenticated();
    const userRole = this.authService.getUserRole() || '';
    const expectedRole = next.data['role'] as string;
    const requiredPermission = next.data['requirePermission'] as string;
    const userRoles = this.authService.getUserRoles();

    if (!isAuthenticated) {
      return this.isLoginRoute(next)
        ? true
        : this.router.createUrlTree(['/login']);
    }

    if (
      expectedRole &&
      !this.roleService.hasRequiredRole(userRoles, expectedRole)
    ) {
      return this.router.createUrlTree(['/forbidden']);
    }

    // Check for required permission
    if (requiredPermission && !this.permissionService.hasPermission(requiredPermission)) {
      return this.router.createUrlTree(['/forbidden']);
    }

    return this.isLoginRoute(next)
      ? this.roleService.getHomeUrlForRole(userRole)
      : true;
  }

  private isLoginRoute(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.path === 'login';
  }
}
