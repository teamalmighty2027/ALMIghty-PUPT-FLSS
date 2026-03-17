import { Injectable } from '@angular/core';
import { CanActivate, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { RoleService } from '../services/role/role.service';

@Injectable({
  providedIn: 'root',
})
export class UnauthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private roleService: RoleService
  ) {}

  canActivate(): boolean | UrlTree {
    if (this.authService.isAuthenticated()) {
      const userRole = this.authService.getUserRole() || '';
      return this.roleService.getHomeUrlForRole(userRole);
    }
    return true;
  }
}

