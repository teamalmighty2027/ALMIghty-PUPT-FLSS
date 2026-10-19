import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { DesigneeRoleService } from './designee-role.service';

describe('DesigneeRoleService', () => {
  let service: DesigneeRoleService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DesigneeRoleService]
    });
    service = TestBed.inject(DesigneeRoleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
