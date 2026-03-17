import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { RoleService } from '../services/role/role.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService,
    private roleService: RoleService
  ) {}

  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    const isAuthenticated = this.authService.isAuthenticated();
    const userRole = this.authService.getUserRole() || '';
    const expectedRole = next.data['role'] as string;

    if (!isAuthenticated) {
      return this.isLoginRoute(next)
        ? true
        : this.router.createUrlTree(['/login']);
    }

    if (
      expectedRole &&
      !this.roleService.hasRequiredRole(userRole, expectedRole)
    ) {
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
