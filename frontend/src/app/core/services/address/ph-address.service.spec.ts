import { TestBed } from '@angular/core/testing';

import { PhAddressService } from './ph-address.service';

describe('PhAddressService', () => {
  let service: PhAddressService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PhAddressService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
