import { TestBed } from '@angular/core/testing';

import { DesigneeRoleService } from './designee-role.service';

describe('DesigneeRoleService', () => {
  let service: DesigneeRoleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DesigneeRoleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
