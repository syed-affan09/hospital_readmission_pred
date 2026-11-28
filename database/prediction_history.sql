-- ==============================================================================
-- MEDIPREDICT — RELATIONAL DATABASE SCHEMA (SQLite 3)
-- Database File: database/hospital_readmission.db
-- Table: prediction_history
-- ==============================================================================

CREATE TABLE IF NOT EXISTS prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    risk_percentage REAL NOT NULL,
    risk_status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pred_patient_id ON prediction_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_pred_searched_at ON prediction_history(searched_at DESC);
