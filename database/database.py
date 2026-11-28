# ==============================================================================
# MEDIPREDICT — RELATIONAL DATABASE MODULE (SQLite 3)
# Manages connection, schema initialization, audit logging, and IST timestamping.
# ==============================================================================

import os
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any

# Ensure database directory exists and resolve database file path
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(DB_DIR, "hospital_readmission.db")

# Indian Standard Time (IST) offset: UTC+05:30
IST_OFFSET = timezone(timedelta(hours=5, minutes=30))


def get_db_connection() -> sqlite3.Connection:
    """
    Returns an active SQLite connection with row factory enabled for dict-like access.
    timeout=10.0 handles concurrent reads/writes safely during development.
    """
    conn = sqlite3.connect(DB_FILE, timeout=10.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Initializes the SQLite database schema.
    Strictly preserves the original table name and column specifications:
    - id: Unique primary key
    - patient_id: Patient ID searched
    - searched_at: Date and time of prediction (Stored in UTC)
    - risk_percentage: Predicted risk percentage (e.g. 63.17)
    - risk_status: Risk classification ('High' or 'Low')

    Also initializes patient_recommendations table for Doctor Portal clinical follow-ups.
    """
    conn = get_db_connection()
    try:
        with conn:
            # 1. Prediction History Table (Audit Trail)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS prediction_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id INTEGER NOT NULL,
                    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    risk_percentage REAL NOT NULL,
                    risk_status TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pred_patient_id ON prediction_history(patient_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_pred_searched_at ON prediction_history(searched_at DESC);
            """)

            # 2. Patient Recommendations Table (Doctor Portal Clinical Follow-up)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS patient_recommendations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient_id INTEGER NOT NULL,
                    primary_recommendation TEXT NOT NULL,
                    additional_recommendation TEXT,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT NOT NULL DEFAULT 'Sent'
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_rec_patient_id ON patient_recommendations(patient_id);
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_rec_sent_at ON patient_recommendations(sent_at DESC);
            """)
    finally:
        conn.close()


def format_utc_to_ist(utc_str: str) -> str:
    """
    Converts any stored UTC timestamp string (e.g. '2026-11-27 04:57:21' or ISO format)
    into formatted Indian Standard Time (IST):
    Example output: '27 Nov 2026, 10:27:21 AM IST'
    """
    if not utc_str:
        return ""
    try:
        clean_str = str(utc_str).replace("T", " ").replace("Z", "").strip()
        if "." in clean_str:
            clean_str = clean_str.split(".")[0]
        dt_utc = datetime.strptime(clean_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        dt_ist = dt_utc.astimezone(IST_OFFSET)
        return dt_ist.strftime("%d %b %Y, %I:%M:%S %p IST")
    except Exception:
        return str(utc_str)


def save_prediction(patient_id: int, risk_percentage: float, risk_status: str) -> Optional[int]:
    """
    Inserts a successful readmission risk evaluation into prediction_history.
    - Generates and stores the actual UTC prediction timestamp.
    - Prevents duplicate entries caused by repeated rapid clicks or browser reloads
      by checking for identical evaluations for the same patient in the last 10 seconds.
    """
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.cursor()
            # De-duplication check: if identical record was saved within the last 10 seconds, avoid duplicate
            cursor.execute("""
                SELECT id FROM prediction_history
                WHERE patient_id = ?
                  AND risk_status = ?
                  AND datetime(searched_at) >= datetime('now', '-10 seconds')
                ORDER BY id DESC LIMIT 1
            """, (int(patient_id), str(risk_status)))
            existing = cursor.fetchone()
            if existing:
                return existing["id"]

            # Explicitly record exact UTC timestamp at time of prediction
            now_utc = datetime.now(timezone.utc)
            searched_at_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")

            cursor.execute("""
                INSERT INTO prediction_history (patient_id, searched_at, risk_percentage, risk_status)
                VALUES (?, ?, ?, ?)
            """, (int(patient_id), searched_at_str, round(float(risk_percentage), 2), str(risk_status)))
            return cursor.lastrowid
    except Exception as e:
        print(f"[Database Error] Could not save prediction record: {e}")
        return None
    finally:
        conn.close()


def get_prediction_history(
    patient_id: Optional[int] = None,
    risk_status: Optional[str] = None,
    sort_by: str = "newest",
    limit: int = 500
) -> List[Dict[str, Any]]:
    """
    Retrieves prediction audit history with explicit UTC and formatted IST timestamps.
    Supports filtering by patient_id, risk_status, and multi-mode sorting.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        query = "SELECT id, patient_id, searched_at, risk_percentage, risk_status FROM prediction_history WHERE 1=1"
        params: List[Any] = []

        if patient_id is not None and patient_id > 0:
            query += " AND patient_id = ?"
            params.append(int(patient_id))

        if risk_status and risk_status.lower() in ["high", "low"]:
            query += " AND LOWER(risk_status) = ?"
            params.append(risk_status.lower())

        # Determine order clause
        if sort_by == "oldest":
            query += " ORDER BY id ASC"
        elif sort_by in ["risk-desc", "highest-risk"]:
            query += " ORDER BY risk_percentage DESC, id DESC"
        elif sort_by in ["risk-asc", "lowest-risk"]:
            query += " ORDER BY risk_percentage ASC, id DESC"
        else:
            # Default: newest first
            query += " ORDER BY id DESC"

        query += " LIMIT ?"
        params.append(int(limit))

        cursor.execute(query, params)
        rows = cursor.fetchall()

        records = []
        for row in rows:
            raw_ts = str(row["searched_at"])
            # Format ISO UTC for standardized client parsing (e.g. '2026-11-27T04:57:21Z')
            iso_utc = raw_ts.replace(" ", "T") + ("Z" if not raw_ts.endswith("Z") else "")
            ist_formatted = format_utc_to_ist(raw_ts)

            records.append({
                "id": row["id"],
                "prediction_id": f"PRED_{str(row['id']).padStart(4, '0')}" if hasattr(row['id'], 'padStart') else f"PRED_{int(row['id']):04d}",
                "patient_id": row["patient_id"],
                "searched_at": raw_ts,
                "searched_at_utc": iso_utc,
                "searched_at_ist": ist_formatted,
                "risk_percentage": float(row["risk_percentage"]),
                "risk_status": str(row["risk_status"])
            })

        return records
    finally:
        conn.close()


def get_audit_summary() -> Dict[str, Any]:
    """
    Computes aggregate metrics directly from prediction_history for dashboard display:
    - Total predictions logged
    - High-risk predictions count (Risk >= 46% or risk_status = 'High')
    - Low-risk predictions count (Risk < 46% or risk_status = 'Low')
    - Average predicted risk percentage
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM prediction_history")
        total = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM prediction_history WHERE LOWER(risk_status) = 'high' OR risk_percentage >= 46.0")
        high_risk = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM prediction_history WHERE LOWER(risk_status) = 'low' AND risk_percentage < 46.0")
        low_risk = cursor.fetchone()[0]

        cursor.execute("SELECT AVG(risk_percentage) FROM prediction_history")
        avg_val = cursor.fetchone()[0]
        avg_risk = round(avg_val, 2) if avg_val is not None else 0.0

        return {
            "total_records": total,
            "high_risk_count": high_risk,
            "low_risk_count": low_risk,
            "average_risk_percentage": avg_risk
        }
    finally:
        conn.close()


def save_recommendation(
    patient_id: int,
    primary_recommendation: str,
    additional_recommendation: Optional[str] = None,
    status: str = "Sent"
) -> Dict[str, Any]:
    """
    Saves a doctor's follow-up recommendation linked to a specific patient ID in patient_recommendations.
    - Uses parameterized SQL execution.
    - Saves date & time (UTC timestamp).
    - Returns saved record with both UTC timestamp and formatted IST timestamp.
    """
    conn = get_db_connection()
    try:
        with conn:
            cursor = conn.cursor()
            now_utc = datetime.now(timezone.utc)
            sent_at_str = now_utc.strftime("%Y-%m-%d %H:%M:%S")
            additional_clean = additional_recommendation.strip() if additional_recommendation else None

            cursor.execute("""
                INSERT INTO patient_recommendations (
                    patient_id, primary_recommendation, additional_recommendation, sent_at, status
                ) VALUES (?, ?, ?, ?, ?)
            """, (
                int(patient_id),
                str(primary_recommendation).strip(),
                additional_clean,
                sent_at_str,
                str(status)
            ))
            rec_id = cursor.lastrowid

            return {
                "id": rec_id,
                "patient_id": int(patient_id),
                "primary_recommendation": str(primary_recommendation).strip(),
                "additional_recommendation": additional_clean,
                "sent_at": sent_at_str,
                "sent_at_ist": format_utc_to_ist(sent_at_str),
                "status": str(status)
            }
    finally:
        conn.close()


def get_patient_recommendations(
    patient_id: Optional[int] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Retrieves stored follow-up recommendations for a specific patient (or all recent if patient_id is None).
    Timestamps are converted into formatted IST for clinical review.
    """
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if patient_id is not None and int(patient_id) > 0:
            cursor.execute("""
                SELECT id, patient_id, primary_recommendation, additional_recommendation, sent_at, status
                FROM patient_recommendations
                WHERE patient_id = ?
                ORDER BY id DESC
                LIMIT ?
            """, (int(patient_id), int(limit)))
        else:
            cursor.execute("""
                SELECT id, patient_id, primary_recommendation, additional_recommendation, sent_at, status
                FROM patient_recommendations
                ORDER BY id DESC
                LIMIT ?
            """, (int(limit),))

        rows = cursor.fetchall()
        results = []
        for row in rows:
            raw_ts = str(row["sent_at"])
            results.append({
                "id": row["id"],
                "patient_id": row["patient_id"],
                "primary_recommendation": row["primary_recommendation"],
                "additional_recommendation": row["additional_recommendation"],
                "sent_at": raw_ts,
                "sent_at_ist": format_utc_to_ist(raw_ts),
                "status": row["status"]
            })
        return results
    finally:
        conn.close()


# Ensure table exists upon module import
init_db()
