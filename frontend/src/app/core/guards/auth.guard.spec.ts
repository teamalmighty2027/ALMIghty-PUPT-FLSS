import { TestBed } from '@angular/core/testing';
import { AuthGuard } from './auth.guard';
import { Router } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AuthService } from '../services/auth/auth.service';
import { RoleService } from '../services/role/role.service';
import { PermissionService } from '../services/permission/permission.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let router: Router;

  let mockRouter: any;
  let mockAuthService: any;
  let mockRoleService: any;
  let mockPermissionService: any;

  beforeEach(() => {
    mockRouter = {
      navigate: jasmine.createSpy('navigate'),
      createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({})
    };

    mockAuthService = {
      isAuthenticated:
        jasmine.createSpy('isAuthenticated').and.returnValue(true),
      isTokenExpired:
        jasmine.createSpy('isTokenExpired').and.returnValue(false),
      expireSession: jasmine.createSpy('expireSession'),
      getUserRole: jasmine.createSpy('getUserRole').and.returnValue('admin'),
      getUserRoles: jasmine.createSpy('getUserRoles').and.returnValue(['admin'])
    };

    mockRoleService = {
      hasRequiredRole:
        jasmine.createSpy('hasRequiredRole').and.returnValue(true),
      getHomeUrlForRole:
        jasmine.createSpy('getHomeUrlForRole').and.returnValue(true)
    };

    mockPermissionService = {
      hasAnyPermission:
        jasmine.createSpy('hasAnyPermission').and.returnValue(true)
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthGuard,
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: RoleService, useValue: mockRoleService },
        { provide: PermissionService, useValue: mockPermissionService }
      ]
    });
    guard = TestBed.inject(AuthGuard);
    router = TestBed.inject(Router);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('should return true if token exists', () => {
    mockAuthService.isAuthenticated.and.returnValue(true);
    mockAuthService.isTokenExpired.and.returnValue(false);
    const mockRoute = { data: {}, routeConfig: { path: '' } } as any;
    expect(guard.canActivate(mockRoute, null as any)).toBeTrue();
  });

  it('should navigate to login if token does not exist', () => {
    mockAuthService.isAuthenticated.and.returnValue(false);
    mockAuthService.isTokenExpired.and.returnValue(false);
    const mockRoute = { data: {}, routeConfig: { path: '' } } as any;
    const result = guard.canActivate(mockRoute, null as any);
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toEqual({} as any);
  });
});
