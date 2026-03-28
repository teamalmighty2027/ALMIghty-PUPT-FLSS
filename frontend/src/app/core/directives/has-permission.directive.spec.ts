import { HasPermissionDirective } from './has-permission.directive';
import { PermissionService } from '../services/permission/permission.service';

describe('HasPermissionDirective', () => {
  it('should create an instance', () => {
    const directive = new HasPermissionDirective(
      null as any,
      null as any,
      null as unknown as PermissionService,
      null as any,
    );
    expect(directive).toBeTruthy();
  });
});
