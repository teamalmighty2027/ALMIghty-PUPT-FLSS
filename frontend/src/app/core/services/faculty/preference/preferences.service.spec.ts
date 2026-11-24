import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { of } from 'rxjs';

import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(PreferencesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Verifies that clearCaches does not throw when cache keys are numbers
  it('should clear caches without error when cache key is a number', () => {
    const cache = (service as any).preferencesCache as Map<any, any>;
    cache.set(12, of({}));
    cache.set('12_term_1', of({}));
    cache.set('99', of({}));

    expect(() => (service as any).clearCaches(12)).not.toThrow();
    expect(cache.has(12)).toBeFalse();
    expect(cache.has('12_term_1')).toBeFalse();
    expect(cache.has('99')).toBeTrue();
  });

  // Verifies that submitSinglePreference clears cache and succeeds
  it('should submit single preference and clear cache cleanly', () => {
    const cache = (service as any).preferencesCache as Map<any, any>;
    cache.set(12, of({}));

    let result: any;
    service
      .submitSinglePreference({
        faculty_id: 12,
        active_semester_id: 1,
        sections_per_program_year_id: 2,
        preferred_days: [],
      })
      .subscribe((res) => {
        result = res;
      });

    const req = httpMock.expectOne(`${service['baseUrl']}/preferences`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true });

    expect(result).toEqual({ success: true });
    expect(cache.has(12)).toBeFalse();
  });
});
