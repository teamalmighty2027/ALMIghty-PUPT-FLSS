# PUPT-FLSS: Model Training & Retraining Guide (v3)

**Model Type:** XGBoost Regression  
**Training Platforms:** Local CLI (`python ml/scripts/train.py`) or Google Colab (`train_schedule_model.ipynb`)  
**Output:** `model.onnx` + `encoders.json`  
**Operational Acceptance Threshold:** `0.30`  
**Retraining Cadence:** Once per semester, after schedule publishing

---

> [!IMPORTANT]
> This guide is self-contained. Follow it top-to-bottom for training.
> For retraining, jump to the [Retraining Checklist](#retraining-checklist)
> at the bottom.

---

## Prerequisites

Before training, generate the latest dataset from your database:

```bash
php artisan ml:export-dataset --all
```

This generates two files in `backend/public/storage/ml/`:
- `scheduling_dataset.csv` — the training dataset (17 columns)
- `encoders.json` — feature schema, day map, and course code map (`<UNKNOWN>` reserved at index `0`)

---

## Option A: Fast Local Training (Recommended)

If you have Python installed locally with dependencies, you can train and deploy the model in a single command:

```bash
# 1. Install dependencies (one-time)
pip install onnxruntime onnxmltools skl2onnx xgboost scikit-learn pandas numpy

# 2. Run training script
python ml/scripts/train.py
```

The script will:
1. Load `backend/public/storage/ml/scheduling_dataset.csv` and `encoders.json`.
2. Split dataset (80% train / 20% test).
3. Train XGBoost Regressor.
4. Output regression metrics (RMSE, MAE, R²).
5. Output threshold sweep (`[0.20, 0.30, 0.40, 0.50, 0.60]`).
6. Display confusion matrix at the operational threshold (`0.30`).
7. Convert model to ONNX format.
8. Automatically save `model.onnx` and `encoders.json` directly into `frontend/src/assets/ml/`.

---

## Option B: Google Colab Training

### Step 1: Upload Files to Google Drive

1. Open [Google Drive](https://drive.google.com).
2. Create folder: `My Drive/FLSS_ML/`.
3. Upload:
   - `backend/public/storage/ml/scheduling_dataset.csv`
   - `backend/public/storage/ml/encoders.json`

### Step 2: Open Google Colab

1. Open [colab.research.google.com](https://colab.research.google.com).
2. Upload and open `ml/notebooks/train_schedule_model.ipynb`.

### Step 3: Install Dependencies

```python
# Cell 1: Install dependencies
!pip install onnxruntime onnxmltools skl2onnx xgboost scikit-learn
```

### Step 4: Mount Drive and Load Data

```python
# Cell 2: Mount Google Drive and load data
from google.colab import drive
import pandas as pd
import json

drive.mount('/content/drive')

CSV_PATH = '/content/drive/MyDrive/FLSS_ML/scheduling_dataset.csv'
JSON_PATH = '/content/drive/MyDrive/FLSS_ML/encoders.json'

df = pd.read_csv(CSV_PATH)

with open(JSON_PATH, 'r') as f:
    encoders = json.load(f)

schema = encoders['schema']
day_encoding = encoders['day_encoding']
course_code_encoding = encoders.get('course_code_encoding', {})

print(f"✅ Loaded {len(df)} rows")
print(f"📋 Schema ({len(schema)} columns): {schema}")
print(f"📚 Course code count: {len(course_code_encoding)}")
```

### Step 5: Prepare Features and Target

```python
# Cell 3: Prepare features (X) and target (y)
y = df['match_score']

features_list = [col for col in schema if col != 'match_score']
X = df[features_list]

print(f"✅ Features ({len(features_list)} columns): {features_list}")
print(f"✅ Target distribution:")
print(y.describe())
```

### Step 6: Validation Split

```python
# Cell 4: Train / test split (80/20 split)
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

print(f"🎓 Training rows : {len(X_train)}")
print(f"🧪 Test rows     : {len(X_test)}")
```

### Step 7: Train the Model

```python
# Cell 5: Train XGBoost Regressor
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
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=20
)

print("✅ Training complete!")
```

### Step 8: Multi-Metric Evaluation (Threshold 0.30)

```python
# Cell 6: Multi-Metric Model Evaluation (Centered at 0.30 Threshold)
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score,
    precision_score, recall_score, f1_score,
    confusion_matrix, ConfusionMatrixDisplay
)

preds = model.predict(X_test)

# 1. Regression Metrics
rmse = np.sqrt(mean_squared_error(y_test, preds))
mae  = mean_absolute_error(y_test, preds)
r2   = r2_score(y_test, preds)

print("=" * 50)
print(f"  RMSE (lower is better)   : {rmse:.4f}")
print(f"  MAE  (lower is better)   : {mae:.4f}")
print(f"  R² Score (1.0 = perfect) : {r2:.4f}")
print("=" * 50)

# 2. Threshold Sweep around 0.30
thresholds = [0.20, 0.30, 0.40, 0.50, 0.60]
print("\n📊 Classification Performance Across Thresholds:")
print(f"{'Threshold':<12}{'Precision':<12}{'Recall':<12}{'F1-Score':<12}")
print("-" * 48)

for t in thresholds:
    y_pred_bin = (preds >= t).astype(int)
    y_true_bin = (y_test >= t).astype(int)
    p = precision_score(y_true_bin, y_pred_bin, zero_division=0)
    r = recall_score(y_true_bin, y_pred_bin, zero_division=0)
    f = f1_score(y_true_bin, y_pred_bin, zero_division=0)
    marker = " 🎯 (Operational)" if t == 0.30 else ""
    print(f"{t:<12.2f}{p:<12.4f}{r:<12.4f}{f:<12.4f}{marker}")

# 3. Confusion Matrix at 0.30 Operational Threshold
OP_THRESHOLD = 0.30
y_pred_op = (preds >= OP_THRESHOLD).astype(int)
y_true_op = (y_test >= OP_THRESHOLD).astype(int)

cm = confusion_matrix(y_true_op, y_pred_op)
disp = ConfusionMatrixDisplay(
    confusion_matrix=cm,
    display_labels=[f'< {OP_THRESHOLD} (Fallback)', f'>= {OP_THRESHOLD} (Accept ML)']
)
disp.plot(cmap='Blues')
plt.title(f'Confusion Matrix @ Operational Threshold ({OP_THRESHOLD})')
plt.tight_layout()
plt.show()
```

### Step 9: Calibration Curve

```python
# Cell 7: Calibration Curve
from sklearn.calibration import calibration_curve
import matplotlib.pyplot as plt
import numpy as np

# Clip regression outputs to [0, 1] as probabilities/confidence scores
preds_clipped = np.clip(preds, 0.0, 1.0)

y_true_op = (y_test >= 0.30).astype(int)
n_bins = min(5, len(np.unique(np.round(preds_clipped, 1))))
prob_true, prob_pred = calibration_curve(y_true_op, preds_clipped, n_bins=n_bins)

plt.figure(figsize=(6, 4))
plt.plot(prob_pred, prob_true, 's-', label='Model Calibration')
plt.plot([0, 1], [0, 1], 'k--', label='Perfect Calibration')
plt.xlabel('Mean Predicted Score')
plt.ylabel('Fraction of Positive Matches')
plt.title('Calibration Curve (@ 0.30 threshold)')
plt.legend()
plt.tight_layout()
plt.show()
```

### Step 10: Convert to ONNX

```python
# Cell 8: Export to ONNX
import onnxmltools
from onnxmltools.convert.common.data_types import FloatTensorType

feature_names_for_onnx = [f'f{i}' for i in range(len(features_list))]
model.get_booster().feature_names = feature_names_for_onnx

n_features = len(features_list)
initial_type = [('float_input', FloatTensorType([None, n_features]))]

onnx_model = onnxmltools.convert_xgboost(
    model, initial_types=initial_type
)

ONNX_SAVE_PATH = '/content/model.onnx'

with open(ONNX_SAVE_PATH, "wb") as f:
    f.write(onnx_model.SerializeToString())

print(f"✅ model.onnx saved to {ONNX_SAVE_PATH}! (Input shape: [batch, {n_features}])")
```

### Step 11: Deploy Output Files
1. Download `model.onnx` from Colab files panel.
2. Place at: `frontend/src/assets/ml/model.onnx`
3. Copy `encoders.json` from `backend/public/storage/ml/encoders.json` to: `frontend/src/assets/ml/encoders.json`.

---

## Retraining Checklist

Run this checklist at the **end of every semester**, after schedules are finalized and published:

```
[ ] 1. Run: php artisan ml:export-dataset --all
[ ] 2. Run local script: python ml/scripts/train.py (or run Colab notebook)
[ ] 3. Review RMSE (< 0.25) and F1 @ 0.30 (> 0.80)
[ ] 4. Confirm frontend/src/assets/ml/model.onnx and encoders.json are updated
[ ] 5. Run: ng build --configuration production
[ ] 6. Test suggestion button in scheduling UI
[ ] 7. Commit: git commit -m "feat(ml): retrain schedule suggestion model v3"
```

---

## Metric History Log

Update this table each time you retrain:

| Date | Train Rows | Test Rows | Split | RMSE | R² | Notes |
|---|---|---|---|---|---|---|
| 2026-05-04 | 1,021 | 698 | S1→S2 | 0.3063 | -0.2610 | Fallback split used; negative R² found |
| 2026-06-30 | 1572  | 393 | Random Split | 0.1797 | 0.4817 | 20% data split |
| 2026-07-10 | 1713  | 429 | Random Split | 0.2063 | 0.4713 | 20% data split |
| 2026-10-22 | 1884  | 472 | Random 80/20 | 0.1864 | 0.5272 | v2 schema (17 cols, 1650 total rows) |

Out-of-range predictions: 27 rows (Angular clips these to 0–1)

> [!WARNING]
> **Interpreting a Negative R² Score:**
> A negative R² means the model is performing worse than if you simply
> predicted the average match score for every row. This often happens
> when:
> 1. There are not enough semesters of data yet (patterns change).
> 2. The features (Day/Time) don't have enough predictive power yet.
> 3. The `match_score` labels are too noisy or sparse.
>
> **Action:** Continue with integration to test the UI, but do not
> rely on these suggestions for critical decisions until R² becomes
> positive (≥ 0.20).

