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

  /**
   * Predicts a match score for a given schedule slot using the ONNX model.
   */
  public predict(
    faculty_id: number,
    academic_year_id: number,
    semester_id: number,
    active_semester_id: number,
    course_assignment_id: number,
    sections_per_program_year_id: number,
    is_ignored: boolean,
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
          course_assignment_id,
          sections_per_program_year_id,
          is_ignored,
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
   * Encodes raw inputs into a numeric feature array matching the model schema.
   */
  private encodeFeatures(
    faculty_id: number,
    academic_year_id: number,
    semester_id: number,
    active_semester_id: number,
    course_assignment_id: number,
    sections_per_program_year_id: number,
    is_ignored: boolean,
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
      'course_assignment_id': course_assignment_id,
      'sections_per_program_year_id': sections_per_program_year_id,
      'is_ignored': is_ignored ? 1 : 0,
      'preferred_day_encoded': dayEncoded,
      'preferred_start_min': start_time_min,
      'preferred_end_min': end_time_min,
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
