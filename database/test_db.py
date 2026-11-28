# ==============================================================================
# MEDIPREDICT — DATABASE CONNECTION & SMOKE TEST (SQLite 3 & IST Timestamps)
# ==============================================================================

from database import get_db_connection, init_db, save_prediction, get_prediction_history, get_audit_summary, format_utc_to_ist

print("Initializing SQLite Database...")
init_db()

conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='prediction_history';")
table = cursor.fetchone()
conn.close()

if table:
    print(f"SUCCESS: SQLite Table '{table[0]}' exists!")
    
    records = get_prediction_history(limit=5)
    print(f"Retrieved {len(records)} audit record(s):")
    for r in records:
        print(f"  [{r['prediction_id']}] Patient #{r['patient_id']} | Risk: {r['risk_percentage']}% ({r['risk_status']}) | IST Time: {r['searched_at_ist']} (UTC: {r['searched_at']})")
        
    summary = get_audit_summary()
    print("Audit Summary:", summary)
else:
    print("FAILED: Table 'prediction_history' was not found.")
