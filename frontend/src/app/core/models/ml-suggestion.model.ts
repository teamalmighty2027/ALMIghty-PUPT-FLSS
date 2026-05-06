// Encoder metadata from encoders.json
export interface EncoderMetadata {
  model_version: string;
  exported_at: string;
  total_rows: number;
  average_match_score: number;
  training_years: string[];
  training_semesters: number[];
  day_encoding: Record<string, number>;
  schema: string[];
}

// Prediction output
export interface MlSuggestion {
  preferredDay: string;
  preferredStartMin: number;
  preferredEndMin: number;
  confidence: number;      // 0.0 – 1.0
  modelVersion: string;
}
