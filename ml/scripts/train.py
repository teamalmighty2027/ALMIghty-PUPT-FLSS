"""
PUPT-FLSS: Model v1 Supervised Training & ONNX Export Script.

Trains an XGBoost regression model on exported scheduling preferences,
evaluates performance (regression + threshold sweep + confusion matrix),
and exports the trained model to ONNX format for Angular inference.
"""

import argparse
import json
import os
import shutil
import sys
import numpy as np
import pandas as pd


# Train XGBoost regressor on preference schedule match data
def train_model(X_train, y_train, X_test, y_test):
    """
    Fits an XGBoost regressor using squared error loss.
    """
    from xgboost import XGBRegressor

    model = XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1,
        objective='reg:squarederror',
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False
    )

    return model


# Evaluate model across regression metrics and threshold sweeps
def evaluate_model(model, X_test, y_test, operational_threshold=0.30):
    """
    Evaluates regression accuracy and thresholded classification metrics.
    """
    from sklearn.metrics import (
        mean_squared_error,
        mean_absolute_error,
        r2_score,
        precision_score,
        recall_score,
        f1_score,
        confusion_matrix
    )

    preds = model.predict(X_test)

    # 1. Regression Metrics
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    print("=" * 60)
    print("📈 Model Evaluation Results")
    print("=" * 60)
    print(f"  RMSE (lower is better)   : {rmse:.4f}")
    print(f"  MAE  (lower is better)   : {mae:.4f}")
    print(f"  R² Score (1.0 = perfect) : {r2:.4f}")
    print("=" * 60)

    # 2. Threshold Sweep
    thresholds = [0.20, 0.30, 0.40, 0.50, 0.60]
    print("\n📊 Classification Performance Across Thresholds:")
    print(f"{'Threshold':<12}{'Precision':<12}{'Recall':<12}{'F1-Score':<12}")
    print("-" * 52)

    for t in thresholds:
        y_pred_bin = (preds >= t).astype(int)
        y_true_bin = (y_test >= t).astype(int)

        p = precision_score(y_true_bin, y_pred_bin, zero_division=0)
        r = recall_score(y_true_bin, y_pred_bin, zero_division=0)
        f = f1_score(y_true_bin, y_pred_bin, zero_division=0)

        marker = " 🎯 (Operational)" if abs(t - operational_threshold) < 1e-4 else ""
        print(f"{t:<12.2f}{p:<12.4f}{r:<12.4f}{f:<12.4f}{marker}")

    # 3. Confusion Matrix at Operational Threshold (0.30)
    y_pred_op = (preds >= operational_threshold).astype(int)
    y_true_op = (y_test >= operational_threshold).astype(int)
    cm = confusion_matrix(y_true_op, y_pred_op)

    print(f"\n📋 Confusion Matrix @ {operational_threshold:.2f} Threshold:")
    print(f"  TN (Correctly rejected) : {cm[0][0] if len(cm) > 1 else 'N/A'}")
    print(f"  FP (False acceptances)  : {cm[0][1] if len(cm) > 1 else 'N/A'}")
    print(f"  FN (Missed matches)     : {cm[1][0] if len(cm) > 1 else 'N/A'}")
    print(f"  TP (Correct matches)    : {cm[1][1] if len(cm) > 1 else 'N/A'}")
    print("=" * 60)

    return preds


# Convert fitted XGBoost model to ONNX format
def export_onnx(model, feature_count, save_path):
    """
    Converts trained XGBoost model to an ONNX file for ONNX Runtime Web.
    """
    import onnxmltools
    from onnxmltools.convert.common.data_types import FloatTensorType

    feature_names = [f'f{i}' for i in range(feature_count)]
    model.get_booster().feature_names = feature_names

    initial_type = [('float_input', FloatTensorType([None, feature_count]))]
    onnx_model = onnxmltools.convert_xgboost(
        model,
        initial_types=initial_type
    )

    os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
    with open(save_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())

    print(f"\n✅ Exported ONNX model to: {save_path}")


# Main execution entrypoint
def main():
    parser = argparse.ArgumentParser(
        description="Train PUPT-FLSS Model v1 and export to ONNX"
    )
    parser.add_argument(
        '--data',
        default='backend/public/storage/ml/scheduling_dataset.csv',
        help='Path to the exported scheduling dataset CSV'
    )
    parser.add_argument(
        '--encoders',
        default='backend/public/storage/ml/encoders.json',
        help='Path to encoders.json metadata'
    )
    parser.add_argument(
        '--output-dir',
        default='frontend/src/assets/ml',
        help='Destination directory for model.onnx and encoders.json'
    )
    parser.add_argument(
        '--test-size',
        type=float,
        default=0.2,
        help='Proportion of dataset for testing (default: 0.2)'
    )
    parser.add_argument(
        '--threshold',
        type=float,
        default=0.30,
        help='Operational acceptance threshold (default: 0.30)'
    )

    args = parser.parse_args()

    if not os.path.exists(args.data):
        print(f"❌ Error: Dataset file not found at: {args.data}")
        print("Please run: php artisan ml:export-dataset --all")
        sys.exit(1)

    if not os.path.exists(args.encoders):
        print(f"❌ Error: Encoders file not found at: {args.encoders}")
        sys.exit(1)

    print("🔄 Loading dataset and encoders...")
    df = pd.read_csv(args.data)
    with open(args.encoders, 'r') as f:
        encoders = json.load(f)

    schema = encoders.get('schema', [])
    features_list = [col for col in schema if col != 'match_score']

    print(f"  Total rows: {len(df)}")
    print(f"  Feature count: {len(features_list)}")
    print(f"  Features: {features_list}")

    X = df[features_list]
    y = df['match_score']

    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=42
    )

    print(f"\n🎓 Training samples: {len(X_train)} | 🧪 Test samples: {len(X_test)}")
    print("⏳ Training XGBoost Regressor...")

    model = train_model(X_train, y_train, X_test, y_test)
    evaluate_model(model, X_test, y_test, operational_threshold=args.threshold)

    output_model_path = os.path.join(args.output_dir, 'model.onnx')
    output_encoders_path = os.path.join(args.output_dir, 'encoders.json')

    export_onnx(model, len(features_list), output_model_path)

    os.makedirs(args.output_dir, exist_ok=True)
    shutil.copyfile(args.encoders, output_encoders_path)
    print(f"✅ Copied encoders to: {output_encoders_path}")
    print("\n🎉 Model training and deployment completed successfully!")


if __name__ == '__main__':
    main()
