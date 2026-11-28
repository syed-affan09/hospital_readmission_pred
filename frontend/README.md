# MediPredict — Hospital Readmission Risk Evaluation System

An AI-powered, government-portal-inspired clinical decision support system for evaluating 30-day diabetic patient hospital readmission risk.

Built strictly using:
- **Frontend:** HTML5, CSS3, and Vanilla JavaScript (ES6) — zero external UI frameworks, zero build tools.
- **Backend:** FastAPI, Python, Trained Random Forest Ensemble Pipeline (`hospital_readmission_model.pkl`), and `diabetic_data.csv`.
- **Database:** SQLite 3 (`database/hospital_readmission.db`) via Python's built-in `sqlite3` library.

---

## 1. Application Architecture

```text
Hospital_Readmission_pred/
│
├── database/
│   ├── database.py                 # SQLite connection, de-duplicated persistence, & queries
│   ├── hospital_readmission.db     # SQLite database file (prediction_history table)
│   ├── prediction_history.sql      # SQLite schema DDL
│   └── test_db.py                  # Smoke test for SQLite connection & schema
│
├── frontend/
│   ├── app.js                      # 4-Tab controller, telemetry simulator, API client, & CSV export
│   ├── doctor.html                 # Legacy route redirecting to index.html?tab=doctor
│   ├── index.html                  # Main Four-Tab Application (Opens directly at http://127.0.0.1:3000)
│   ├── patient.html                # Legacy route redirecting to index.html
│   ├── README.md                   # System documentation & execution instructions
│   └── style.css                   # Medical government-portal stylesheet
│
├── .env
├── .gitignore
├── diabetic_data.csv               # 101,766 inpatient encounters
├── hospital_readmission.ipynb      # Training notebook & verified benchmark evaluations
├── hospital_readmission_model.pkl  # Trained ML pipeline (Threshold 0.46)
├── main.py                         # FastAPI backend with /health, /predict, & /audit-trail
└── requirements.txt
```

---

## 2. Four Horizontal Tabs Structure

When opening `http://127.0.0.1:3000`, the application directly displays the full MediPredict platform with four horizontal navigation tabs:

1. **Problem Statement & Overview (Default):**
   - High-level clinical problem statement and machine learning solution.
   - 4 Scope Cards (Dataset Scope: 101,766 records, Champion Model: Random Forest, Decision Threshold: 0.46, Storage: SQLite 3.x).
   - 6 Core Objectives and 6 Verified Technical Innovations.
   - 4-Step Decision Support Pipeline workflow diagram.
   - Real dataset statistics, target distribution (<30, >30, NO), and feature selection criteria (44 features used, 6 excluded).

2. **Doctor Portal:**
   - 1-Click sample patient cards (`#8222157`, `#85504905`, `#55629189`, `#86047875`) displayed without risk percentages.
   - Real-time Patient ID search querying `diabetic_data.csv` and running the ML inference pipeline.
   - Structured Patient Dossier: Demographics, Hospital Admission details, and Medical/Clinical attributes.
   - Dynamic Prediction Card with animated circular risk gauge, 0.46 threshold comparison, and tailored clinical guidance.
   - Comprehensive 50-field clinical dataset inspector with search filtering and categorization.

3. **AI Model & Prediction Insights:**
   - 1-Click Clinical Scenarios (High Risk, Borderline, Low Risk).
   - Interactive Clinical Telemetry Simulator: Sliders for Length of Stay, Prior Inpatient Admissions, Medications Count, and Diagnoses Count.
   - Live clinical diagnosis display with real-time risk score, progress bar, threshold marker (46%), and follow-up guidance.
   - Machine Learning Model Tournament table benchmarking Random Forest (Champion: 79.03% Recall, F2=0.3630), Decision Tree, and Logistic Regression.
   - Gini feature importance ranking showing the top 12 drivers of readmission risk.
   - Decision threshold explanation (0.46 tuned using $F_2$ score on 3-fold cross validation to prioritize Recall).
   - Confusion matrix breakdown evaluated on 14,304 holdout test records.

4. **SQL Database Audit Trail:**
   - Real relational SQLite database (`database/hospital_readmission.db`) storing the `prediction_history` table.
   - 4 Live Metric Cards: Total Predictions Logged, High-Risk Count, Low-Risk Count, Average Risk Score.
   - Real-time search by Patient ID, status filtering (High/Low risk), and date sorting.
   - One-click CSV export of all audit records.
   - "Inspect" button to load any past evaluated patient into the Doctor Portal.

---

## 3. How to Run Locally in VS Code

### Step 1: Start the FastAPI Backend
Open a terminal in the project root directory:
```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
- API Base: `http://127.0.0.1:8000`
- Health Endpoint: `http://127.0.0.1:8000/health`
- Audit Trail: `http://127.0.0.1:8000/audit-trail`

### Step 2: Start the Frontend HTTP Server
Open a second terminal in the project root directory:
```bash
python -m http.server 3000 --directory frontend
```

### Step 3: Access MediPredict
Open your browser and navigate to:
```
http://127.0.0.1:3000
```

---

## 4. Verified Sample Patient IDs

| Patient ID | Risk Status | Readmission Prob | Stay Length | Demographics & Clinical Summary |
| :--- | :--- | :--- | :--- | :--- |
| **`#8222157`** | **Low Risk** | **28.7%** (`0.29`) | 1 Day | Female, Age `[0-10)`, Caucasian, low utilization |
| **`#85504905`** | **High Risk** | **63.2%** (`0.63`) | 7 Days | Female, Age `[40-50)`, Caucasian, prior admissions |
| **`#55629189`** | **High Risk** | **47.5%** (`0.48`) | 3 Days | Female, Age `[10-20)`, Caucasian, borderline threshold |
| **`#86047875`** | **High Risk** | **46.9%** (`0.47`) | 2 Days | Female, Age `[20-30)`, AfricanAmerican, near threshold |
