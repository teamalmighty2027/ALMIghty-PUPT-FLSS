import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScheduleSuggestionService } from './schedule-suggestion.service';
import { EncoderMetadata } from '../../../models/ml-suggestion.model';

describe('ScheduleSuggestionService', () => {
  let service: ScheduleSuggestionService;
  let httpMock: HttpTestingController;

  const mockEncoders: EncoderMetadata = {
    model_version: 'test-1.0',
    exported_at: '2026-05-04',
    total_rows: 100,
    average_match_score: 0.5,
    training_years: ['2025-2026'],
    training_semesters: [1, 2],
    day_encoding: { 'Monday': 0, 'Tuesday': 1 },
    schema: ['faculty_id', 'preferred_day_encoded', 'preferred_start_min', 'match_score']
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ScheduleSuggestionService]
    });
    service = TestBed.inject(ScheduleSuggestionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should encode features in the correct schema order', (done) => {
    // Manually initialize with mock data
    (service as any).encoders = mockEncoders;

    // faculty_id=10, day=Monday(0), start=08:00(480)
    const features = (service as any).encodeFeatures(
      10, 1, 1, 1, 1, 1, false, 'Monday', 480, 600
    );

    expect(features).toBeInstanceOf(Float32Array);
    expect(features.length).toBe(3); // match_score is filtered out
    expect(features[0]).toBe(10);  // faculty_id
    expect(features[1]).toBe(0);   // preferred_day_encoded
    expect(features[2]).toBe(480); // preferred_start_min
    done();
  });

  it('should handle missing day encoding gracefully', (done) => {
    (service as any).encoders = mockEncoders;

    const features = (service as any).encodeFeatures(
      10, 1, 1, 1, 1, 1, false, 'Sunday', 480, 600
    );

    expect(features[1]).toBe(-1); // Unknown day
    done();
  });
});
