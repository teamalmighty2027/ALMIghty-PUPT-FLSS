# PUPT-FLSS: Model Training & Retraining Guide

**Model Type:** XGBoost Regression  
**Training Platform:** Google Colab (or Kaggle Kernels)  
**Output:** `model.onnx` + `encoders.json`  
**Retraining Cadence:** Once per semester, after schedule publishing

---

> [!IMPORTANT]
> This guide is self-contained. Follow it top-to-bottom for first-time
> training. For retraining, jump to the
> [Retraining Checklist](#retraining-checklist) at the bottom.

---

## Prerequisites

Before opening Google Colab, you must have:

1. **Laravel export command run successfully:**
   ```bash
   php artisan ml:export-dataset --all
   ```
2. **Two files available** in `backend/public/storage/ml/`:
   - `scheduling_dataset.csv` — the training dataset
   - `encoders.json` — the feature schema and encoding map
3. **A Google or Kaggle account** for cloud training.

---

## Step 1: Upload Files to Google Drive

1. Open [Google Drive](https://drive.google.com).
2. Create a folder: `My Drive/ml/`.
3. Upload both files into that folder:
   - `scheduling_dataset.csv`
   - `encoders.json`

---

## Step 2: Open Google Colab

1. Go to [colab.research.google.com](https://colab.research.google.com).
2. Create a **New Notebook**.
3. Rename it: `train_schedule_model.ipynb`.

> [!TIP]
> Commit this notebook to the repo under `ml-notebooks/` so the
> training process is version-controlled and reproducible each semester.

---

## Step 3: Install Dependencies

Run this in the **first cell**. Colab does not include ONNX tools
by default.

```python
# Cell 1: Install dependencies
!pip install onnxruntime onnxmltools skl2onnx xgboost scikit-learn
```

---

## Step 4: Mount Drive and Load Data

```python
# Cell 2: Mount Google Drive and load data
from google.colab import drive
import pandas as pd
import json

drive.mount('/content/drive')

# --- Update these paths if your folder structure is different ---
CSV_PATH = '/content/drive/MyDrive/ml/scheduling_dataset.csv'
JSON_PATH = '/content/drive/MyDrive/ml/encoders.json'
# ---------------------------------------------------------------

df = pd.read_csv(CSV_PATH)

# Load encoders to get the exact column schema and day encoding
with open(JSON_PATH, 'r') as f:
    encoders = json.load(f)

schema = encoders['schema']
day_encoding = encoders['day_encoding']

print(f"✅ Loaded {len(df)} rows")
print(f"📋 Schema: {schema}")
print(f"📅 Day encoding: {day_encoding}")
```

**Expected output:**
```
✅ Loaded 1719 rows
📋 Schema: ['faculty_id', 'academic_year_id', 'semester_id', ...]
📅 Day encoding: {'Monday': 0, 'Tuesday': 1, ...}
```

---

## Step 5: Prepare Features and Target

> [!NOTE]
> We use **Regression** (not Classification) so the model predicts
> a continuous confidence score between 0.0 and 1.0, not just Yes/No.
> This lets the Angular UI display "82% Match Confidence" directly
> from the model output.

```python
# Cell 3: Prepare features (X) and target (y)

# Target: the continuous match score (0.0 to 1.0)
y = df['match_score']

# Features: all columns EXCEPT the target, in the same order as the schema
# This ordering is critical — Angular must send features in this exact order
features_list = [col for col in schema if col != 'match_score']
X = df[features_list]

print(f"✅ Features ({len(features_list)} columns): {features_list}")
print(f"✅ Target distribution:")
print(y.describe())
```

---

## Step 6: Validation Split

We split by **Academic Year** because scheduling patterns are most
consistent when comparing one full year to the next.

> [!IMPORTANT]
> **Why Academic Year Split?**
> Semesters (Sem 1 vs Sem 2) often have completely different course
> offerings and faculty loads. Splitting by Semester often results in
> a **Negative R²** because the model can't generalize between them.
> Splitting by Year is the "Gold Standard" for this model.

```python
# Cell 4: Temporal split by Academic Year
# Train on the earlier year, test on the latest year
unique_years = sorted(df['academic_year_id'].unique())

if len(unique_years) > 1:
    train_year = unique_years[-2]
    test_year  = unique_years[-1]
    
    train_mask = df['academic_year_id'] <= train_year
    test_mask  = df['academic_year_id'] == test_year
    
    print(f"✅ Splitting by Year: Training on <= {train_year}, Testing on {test_year}")
else:
    # Fallback if you only have ONE year of data
    print("⚠️ Only one year found. Falling back to Semester Split (S1 -> S2)")
    train_mask = df['semester_id'] == 1
    test_mask  = df['semester_id'] == 2

X_train, y_train = X[train_mask], y[train_mask]
X_test,  y_test  = X[test_mask],  y[test_mask]

print(f"🎓 Training rows  : {len(X_train)}")
print(f"🧪 Test rows      : {len(X_test)}")
```

---

## Step 7: Train the Model

```python
# Cell 5: Train XGBoost Regressor
from xgboost import XGBRegressor

model = XGBRegressor(
    n_estimators=100,
    max_depth=5,
    learning_rate=0.1,
    objective='reg:squarederror',  # Continuous output (0.0–1.0)
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42
)

model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=20           # Print progress every 20 rounds
)

print("✅ Training complete!")
```

---

## Step 8: Evaluate the Model

```python
# Cell 6: Evaluate model quality
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np

preds = model.predict(X_test)

rmse = np.sqrt(mean_squared_error(y_test, preds))
r2   = r2_score(y_test, preds)

print("=" * 40)
print(f"  RMSE (lower is better)  : {rmse:.4f}")
print(f"  R² Score (1.0 = perfect): {r2:.4f}")
print("=" * 40)

# Flag prediction range issues
clipped = ((preds < 0) | (preds > 1)).sum()
print(f"  Out-of-range predictions: {clipped} rows "
      f"(Angular will clip these to 0–1)")
```

**Interpreting results:**

| RMSE | Assessment |
|---|---|
| < 0.15 | ✅ Excellent — safe to deploy |
| 0.15 – 0.25 | ⚠️ Acceptable — monitor after deploy |
| > 0.25 | ❌ Poor — review data quality before deploying |

> [!CAUTION]
> **Red Flag:** If the model predicts nearly identical values for
> every row (e.g., all ~0.27), it has overfit to the mean.
> Check that your feature columns are not all zero or identical.

---

## Step 9: Feature Importance (Optional but Useful)

```python
# Cell 7: Feature importance — understand which features the model uses
import matplotlib.pyplot as plt

importances = model.feature_importances_
feat_df = pd.DataFrame({
    'Feature': features_list,
    'Importance': importances
}).sort_values('Importance', ascending=True)

feat_df.plot(
    kind='barh', x='Feature', y='Importance',
    title='Feature Importance', figsize=(8, 5), legend=False
)
plt.tight_layout()
plt.show()
```

> [!TIP]
> If `preferred_day_encoded` and `preferred_start_min` are not near
> the top, your features may not be encoding correctly. Cross-check
> the `day_encoding` map in `encoders.json`.

---

## Step 10: Convert to ONNX

```python
# Cell 8: Convert to ONNX for Angular/ONNX Runtime Web
import onnxmltools
from onnxmltools.convert.common.data_types import FloatTensorType

# Rename model's internal feature names to f0, f1, ...
# This aligns with onnxmltools's expectation for XGBoost feature names.
# It's important that the order of these renamed features matches the
# order of features in `features_list` and during model training.
feature_names_for_onnx = [f'f{i}' for i in range(len(features_list))]
model.get_booster().feature_names = feature_names_for_onnx

# Number of input features must match Angular's Float32Array size
n_features = len(features_list)
initial_type = [('float_input', FloatTensorType([None, n_features]))]

onnx_model = onnxmltools.convert_xgboost(
    model, initial_types=initial_type
)

# Define the path where the ONNX model will be saved
# You can change this to a specific folder in your Drive
ONNX_SAVE_PATH = '/content/model.onnx' 

with open(ONNX_SAVE_PATH, "wb") as f:
    f.write(onnx_model.SerializeToString())

print(f"✅ model.onnx saved to {ONNX_SAVE_PATH}! (Input shape: [batch, {n_features}])")
print(f"📋 Feature order Angular must follow: {features_list}")
```

---

## Step 11: Download Output Files

After running all cells:

1. In the Colab **Files panel** (left sidebar → folder icon).
2. Right-click `model.onnx` → **Download**.
3. Place the downloaded file at:
   ```
   frontend/src/assets/ml/model.onnx
   ```
4. The `encoders.json` file from Laravel is already correct — commit
   it alongside `model.onnx`.

---

## Step 12: Validation Checklist (Run Before Committing)

### Layer 1 — Label Audit (Pre-Training)
- [ ] Open `scheduling_dataset.csv` in Excel/Google Sheets
- [ ] Randomly pick 50 rows
- [ ] For each row, manually check: does the `match_score` feel
      right given the `preferred_day` vs `actual_day`?
- [ ] **Pass condition:** ≥ 90% of rows have scores that match
      your intuition of "was this preference satisfied?"

### Layer 2 — Held-out Academic Year Test (Post-Training)
- [ ] RMSE < 0.25 on the test year
- [ ] R² > 0.40 on the test year
- [ ] Feature importance shows `preferred_day_encoded` and
      `preferred_start_min` in the top 5 features
- [ ] No "collapse" (all predictions stuck near one value)

### Layer 3 — Ghost Schedule Test (Post-Angular Integration)
- [ ] In Angular, enter **Draft Mode** on a fully scheduled section
- [ ] Manually clear 5 slots (set Day to "Not set")
- [ ] Click the **Suggest** button on each cleared slot
- [ ] Compare the ML suggestion to what was actually scheduled
- [ ] **Pass condition:** ≥ 80% of suggestions match the historical
      outcome for that faculty + course combination

---

## Retraining Checklist

Run this checklist at the **end of every semester**, after schedules
are finalized and published.

```
[ ] 1. Run:  php artisan ml:export-dataset --all
[ ] 2. Verify row count has increased vs last training
[ ] 3. Upload new scheduling_dataset.csv + encoders.json to Drive
[ ] 4. Open train_schedule_model.ipynb in Colab
[ ] 5. Run all cells top to bottom
[ ] 6. Check RMSE and R² — compare vs previous run's metrics
[ ] 7. Run Feature Importance cell — confirm top features unchanged
[ ] 8. Download new model.onnx
[ ] 9. Replace frontend/src/assets/ml/model.onnx
[ ] 10. Commit: git commit -m "feat(ml): retrain model for [semester]"
[ ] 11. Run Ghost Schedule Test to confirm quality
```

> [!IMPORTANT]
> Keep a record of your metrics each time you retrain.
> If RMSE gets **worse** with more data, it may indicate the label
> formula needs to be tuned or that data quality has degraded.

---

## Metric History Log

Update this table each time you retrain:

| Date | Train Rows | Test Rows | Split | RMSE | R² | Notes |
|---|---|---|---|---|---|---|
| 2026-05-04 | 1,021 | 698 | S1→S2 | 0.3063 | -0.2610 | Fallback split used; negative R² found |

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


