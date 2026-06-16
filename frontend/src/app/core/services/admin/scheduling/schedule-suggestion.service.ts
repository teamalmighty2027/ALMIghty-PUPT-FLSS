import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, from, of, firstValueFrom } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import * as ort from 'onnxruntime-web';
import { EncoderMetadata, MlSuggestion } from '../../../models/ml-suggestion.model';

@Injectable({
  providedIn: 'root'
})
export class ScheduleSuggestionService {
  private session: ort.InferenceSession | null = null;
  private encoders: EncoderMetadata | null = null;
  private initPromise: Promise<void> | null = null;
  
  private isModelReadySubject = new BehaviorSubject<boolean>(false);
  public isModelReady$ = this.isModelReadySubject.asObservable();

  constructor(private http: HttpClient) {
    // Set WASM paths for onnxruntime-web
    ort.env.wasm.wasmPaths = 'assets/onnxruntime-wasm/';
  }

  /**
   * Initializes the ONNX session and loads encoder metadata.
   * Both assets are loaded lazily on the first request.
   */
  public async ensureInitialized(): Promise<void> {
    if (this.session && this.encoders) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Load encoders.json first to get the schema
        const encodersJson = await firstValueFrom(
          this.http.get<EncoderMetadata>('assets/ml/encoders.json')
        );

        if (!encodersJson) {
          throw new Error('Failed to load encoders.json');
        }
        this.encoders = encodersJson;

        // Load model.onnx
        this.session = await ort.InferenceSession.create('assets/ml/model.onnx');
        
        this.isModelReadySubject.next(true);
      } catch (error) {
        this.initPromise = null; // Allow retry on failure
        console.error('Failed to initialize ML suggestion service:', error);
        this.isModelReadySubject.next(false);
        throw error;
      }
    })();

    return this.initPromise;
  }

  public predict(
    faculty_id: number,
    academic_year_id: number,
    semester_id: number,
    active_semester_id: number,
    course_id: number,
    program_id: number,
    year_level: number,
    day: string,
    start_time_min: number,
    end_time_min: number
  ): Observable<MlSuggestion | null> {
    return from(this.ensureInitialized()).pipe(
      switchMap(() => {
        if (!this.session || !this.encoders) {
          return of(null);
        }

        const features = this.encodeFeatures(
          faculty_id,
          academic_year_id,
          semester_id,
          active_semester_id,
          course_id,
          program_id,
          year_level,
          day,
          start_time_min,
          end_time_min
        );

        // Convert features to Float32Array
        const inputTensor = new ort.Tensor(
          'float32',
          features,
          [1, features.length]
        );
        
        return from(this.session.run({ float_input: inputTensor })).pipe(
          map(output => {
            const result = output[Object.keys(output)[0]];
            const score = Array.from(result.data as Float32Array)[0];

            return {
              preferredDay: day,
              preferredStartMin: start_time_min,
              preferredEndMin: end_time_min,
              confidence: Math.max(0, Math.min(1, score)),
              modelVersion: this.encoders?.model_version || 'unknown'
            };
          })
        );
      }),
      catchError(err => {
        console.error('Prediction failed:', err);
        return of(null);
      })
    );
  }

  /**
   * Predicts match scores for a batch of candidates using ONNX.
   */
  public predictBatch(
    candidates: {
      faculty_id: number;
      academic_year_id: number;
      semester_id: number;
      active_semester_id: number;
      course_id: number;
      program_id: number;
      year_level: number;
      day: string;
      start_time_min: number;
      end_time_min: number;
    }[]
  ): Observable<(MlSuggestion | null)[]> {
    return from(this.ensureInitialized()).pipe(
      switchMap(() => {
        if (!this.session || !this.encoders || candidates.length === 0) {
          return of([]);
        }

        const featureCount = this.encoders.schema
          .filter(k => k !== 'match_score').length;
        const flatFeatures = new Float32Array(
          candidates.length * featureCount
        );

        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          const features = this.encodeFeatures(
            c.faculty_id,
            c.academic_year_id,
            c.semester_id,
            c.active_semester_id,
            c.course_id,
            c.program_id,
            c.year_level,
            c.day,
            c.start_time_min,
            c.end_time_min
          );
          flatFeatures.set(features, i * featureCount);
        }

        const inputTensor = new ort.Tensor(
          'float32',
          flatFeatures,
          [candidates.length, featureCount]
        );

        return from(this.session.run({ float_input: inputTensor })).pipe(
          map(output => {
            const result = output[Object.keys(output)[0]];
            const scores = Array.from(result.data as Float32Array);

            return candidates.map((c, i) => ({
              preferredDay: c.day,
              preferredStartMin: c.start_time_min,
              preferredEndMin: c.end_time_min,
              confidence: Math.max(0, Math.min(1, scores[i] ?? 0)),
              modelVersion: this.encoders?.model_version || 'unknown'
            }));
          })
        );
      }),
      catchError(err => {
        console.error('Batch prediction failed:', err);
        return of([]);
      })
    );
  }

  /**
   * Encodes raw inputs into a numeric feature array matching the model schema.
   */
  private encodeFeatures(
    faculty_id: number,
    academic_year_id: number,
    semester_id: number,
    active_semester_id: number,
    course_id: number,
    program_id: number,
    year_level: number,
    day: string,
    start_time_min: number,
    end_time_min: number
  ): Float32Array {
    if (!this.encoders) return new Float32Array(0);

    // Pull encoding directly from encoders.json
    const dayEncoded = this.encoders.day_encoding[day] ?? -1;
    const duration = Math.max(0, end_time_min - start_time_min);

    /**
     * The keys here must match the column names exported by PHP.
     * The order doesn't matter here; it's handled in the next step.
     */
    const featureValues: Record<string, number> = {
      'faculty_id': faculty_id,
      'academic_year_id': academic_year_id,
      'semester_id': semester_id,
      'active_semester_id': active_semester_id,
      'course_id': course_id,
      'program_id': program_id,
      'year_level': year_level,
      'day_encoded': dayEncoded,
      'start_time_min': start_time_min,
      'end_time_min': end_time_min,
      'duration_min': duration
    };

    /**
     * ! CRITICAL: Build the array based on the ORDER defined in the JSON schema.
     * This ensures parity between Python training and Angular inference.
     */
    const data = this.encoders.schema
      .filter(key => key !== 'match_score')
      .map(key => {
        if (!(key in featureValues)) {
          console.warn(
            `Feature key "${key}" found in schema but not in UI map.`
          );
        }
        return featureValues[key] ?? 0;
      });

    return new Float32Array(data);
  }
}
