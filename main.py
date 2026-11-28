
# ==============================================================================
# HOSPITAL READMISSION PREDICTION API
# FastAPI Backend Application for Model Serving and Real-Time Inference
#
# Objective: Serve predictions for hospital readmission risk (<30 days)
#            using the pre-trained pipeline saved in 'hospital_readmission_model.pkl'.
# ==============================================================================

import os
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database.database import (
    get_db_connection,
    save_prediction,
    get_prediction_history,
    get_audit_summary,
    save_recommendation,
    get_patient_recommendations
)


# ------------------------------------------------------------------------------
# 1. APPLICATION SETUP & SWAGGER DOCUMENTATION
# ------------------------------------------------------------------------------

app = FastAPI(
    title="Hospital Readmission Prediction API",
    description="Predict whether a hospitalized diabetic patient will be readmitted within 30 days of discharge.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


# Configure CORS for local development and production environments
origins = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://hospital-readmission-pred.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Resolve all project files relative to main.py
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"

MODEL_FILE_PATH = str(BASE_DIR / "hospital_readmission_model.pkl")
DATASET_FILE_PATH = str(BASE_DIR / "diabetic_data.csv")


# Global variables for loaded artifacts
model_pipeline = None
optimal_threshold = None
expected_features = None
target_mapping = None
patient_dataset = None


# ------------------------------------------------------------------------------
# 2. LOAD TRAINED MODEL AND DATASET
# ------------------------------------------------------------------------------

def load_artifacts():
    """
    Loads the saved model package and diabetic_data.csv into memory.
    The model is not retrained inside main.py.
    """

    global model_pipeline
    global optimal_threshold
    global expected_features
    global target_mapping
    global patient_dataset

    # Check model file
    if not os.path.exists(MODEL_FILE_PATH):
        raise FileNotFoundError(
            f"Trained model file '{MODEL_FILE_PATH}' was not found. "
            "Please ensure the model file exists."
        )

    # Load trained model
    try:
        saved_package = joblib.load(MODEL_FILE_PATH)

        model_pipeline = saved_package["model"]
        optimal_threshold = float(saved_package["threshold"])
        expected_features = list(saved_package["feature_columns"])

        target_mapping = saved_package.get(
            "target_mapping",
            {"<30": 1, "NO": 0, ">30": 0}
        )

    except Exception as e:
        raise RuntimeError(
            f"Failed to load or parse model file: {str(e)}"
        )

    # Check dataset file
    if not os.path.exists(DATASET_FILE_PATH):
        raise FileNotFoundError(
            f"Dataset file '{DATASET_FILE_PATH}' was not found."
        )

    # Load dataset
    try:
        patient_dataset = pd.read_csv(DATASET_FILE_PATH)

    except Exception as e:
        raise RuntimeError(
            f"Failed to read dataset file: {str(e)}"
        )


# Load model and dataset during application startup
try:
    load_artifacts()

    print("SUCCESS: Model pipeline and patient dataset loaded.")
    print(f"Optimal Decision Threshold: {optimal_threshold}")
    print(
        f"Expected Input Features ({len(expected_features)}): "
        f"{expected_features[:5]}..."
    )

except Exception as startup_error:
    print(f"STARTUP WARNING: {startup_error}")


# ------------------------------------------------------------------------------
# 3. PYDANTIC REQUEST AND RESPONSE SCHEMAS
# ------------------------------------------------------------------------------

class PatientPredictionRequest(BaseModel):
    """
    Accepts Patient ID and optional encounter ID.
    """

    patient_id: int = Field(
        ...,
        gt=0,
        description="Patient ID corresponding to patient_nbr in diabetic_data.csv",
        examples=[8222157]
    )

    encounter_id: Optional[int] = Field(
        None,
        gt=0,
        description="Optional encounter ID",
        examples=[2278392]
    )


class PatientInformation(BaseModel):
    """Patient demographic and hospital encounter information."""

    encounter_id: int
    gender: str
    age: str
    race: str
    time_in_hospital: int


class ReadmissionPrediction(BaseModel):
    """Readmission prediction details."""

    risk: str = Field(
        ...,
        description="'High' or 'Low'"
    )

    readmission_probability: float = Field(
        ...,
        description="Predicted probability of 30-day readmission"
    )

    threshold: float = Field(
        ...,
        description="Decision threshold used by the model"
    )


class PatientRecommendationRequest(BaseModel):
    """Doctor follow-up recommendation request."""

    patient_id: int = Field(
        ...,
        gt=0,
        description="Patient ID corresponding to patient_nbr",
        examples=[86047875]
    )

    primary_recommendation: str = Field(
        ...,
        min_length=3,
        description="Required primary clinical recommendation",
        examples=["Schedule physician follow-up within 7 days."]
    )

    additional_recommendation: Optional[str] = Field(
        None,
        description="Optional custom doctor instructions",
        examples=[
            "Patient advised to maintain strict fasting blood glucose log."
        ]
    )


class PatientPredictionResponse(BaseModel):
    """Complete patient prediction response."""

    patient_id: int
    patient_information: PatientInformation
    readmission_prediction: ReadmissionPrediction
    clinical_data: Optional[dict] = None


# ------------------------------------------------------------------------------
# 4. FRONTEND ROUTE
# ------------------------------------------------------------------------------

@app.get("/", tags=["Frontend"], include_in_schema=False)
def serve_frontend():
    """
    Serves frontend/index.html through the same FastAPI application.
    """

    index_file = FRONTEND_DIR / "index.html"

    if not index_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Frontend file not found. "
                "Ensure frontend/index.html exists in the repository."
            )
        )

    return FileResponse(index_file)


# ------------------------------------------------------------------------------
# 5. MODEL METADATA
# ------------------------------------------------------------------------------

def get_model_metadata():
    """Extracts model details from the loaded model artifact."""

    global model_pipeline
    global optimal_threshold
    global expected_features

    model_name = "Trained ML Pipeline"
    classifier_name = "Unknown"

    if model_pipeline is not None:

        if (
            hasattr(model_pipeline, "named_steps")
            and "classifier" in model_pipeline.named_steps
        ):

            clf = model_pipeline.named_steps["classifier"]
            classifier_name = clf.__class__.__name__

            if classifier_name == "RandomForestClassifier":
                model_name = (
                    "Random Forest Classifier (Ensemble Pipeline)"
                )

            elif "LGBM" in classifier_name or "LightGBM" in classifier_name:
                model_name = "LightGBM Classifier Pipeline"

            elif classifier_name == "DecisionTreeClassifier":
                model_name = "Decision Tree Classifier"

            elif classifier_name == "LogisticRegression":
                model_name = "Logistic Regression Pipeline"

            else:
                model_name = f"{classifier_name} Pipeline"

        elif hasattr(model_pipeline, "__class__"):
            classifier_name = model_pipeline.__class__.__name__
            model_name = f"{classifier_name} Pipeline"

    return {
        "model_name": model_name,
        "classifier_class": classifier_name,
        "decision_threshold": (
            optimal_threshold if optimal_threshold is not None else 0.46
        ),
        "features_count": (
            len(expected_features) if expected_features else 44
        ),
        "file": MODEL_FILE_PATH
    }


# ------------------------------------------------------------------------------
# 6. HEALTH CHECK ENDPOINT
# ------------------------------------------------------------------------------

@app.get("/health", tags=["General"])
def health_check():
    """Checks backend and model status."""

    meta = get_model_metadata()

    return {
        "status": "running",
        "model_loaded": model_pipeline is not None,
        "dataset_loaded": patient_dataset is not None,
        "optimal_threshold": meta["decision_threshold"],
        "total_features": meta["features_count"],
        "model_name": meta["model_name"],
        "classifier_class": meta["classifier_class"],
        "database": "sqlite"
    }


# ------------------------------------------------------------------------------
# 7. PATIENT READMISSION PREDICTION
# ------------------------------------------------------------------------------

@app.post(
    "/predict",
    response_model=PatientPredictionResponse,
    status_code=status.HTTP_200_OK,
    tags=["Prediction"],
    summary="Predict 30-day hospital readmission risk for a patient"
)
def predict_readmission(request: PatientPredictionRequest):
    """
    Accepts Patient ID, retrieves the corresponding dataset record,
    and predicts the patient's 30-day readmission risk.
    """

    # Step 1: Ensure model and dataset are loaded
    if model_pipeline is None or patient_dataset is None:

        try:
            load_artifacts()

        except FileNotFoundError as fnf_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(fnf_error)
            )

        except Exception as load_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Service initialization error: {str(load_error)}"
            )

    # Step 2: Validate Patient ID
    patient_id = request.patient_id

    if patient_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient ID must be a positive integer."
        )

    # Step 3: Search for patient
    matching_records = patient_dataset[
        patient_dataset["patient_nbr"] == patient_id
    ]

    if matching_records.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Patient ID {patient_id} was not found "
                "in the hospital records."
            )
        )

    # Step 4: Select encounter
    if request.encounter_id is not None:

        encounter_match = matching_records[
            matching_records["encounter_id"] == request.encounter_id
        ]

        if encounter_match.empty:

            available_encounters = (
                matching_records["encounter_id"].tolist()
            )

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Encounter ID {request.encounter_id} does not belong "
                    f"to Patient ID {patient_id}. "
                    f"Available encounter IDs: {available_encounters}"
                )
            )

        selected_encounter = encounter_match.iloc[0]

    else:
        selected_encounter = matching_records.iloc[0]

    # Step 5: Check required patient information
    required_info_fields = [
        "gender",
        "age",
        "race",
        "time_in_hospital"
    ]

    missing_fields = []

    for field_name in required_info_fields:

        val = selected_encounter.get(field_name)

        if pd.isna(val) or val == "" or str(val).strip() == "":
            missing_fields.append(field_name)

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Required patient information is missing "
                f"for Patient ID {patient_id}: {missing_fields}"
            )
        )

    # Step 6: Verify model features
    missing_features = [
        col for col in expected_features
        if col not in selected_encounter.index
    ]

    if missing_features:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"Dataset is missing required feature columns: "
                f"{missing_features}"
            )
        )

    # Step 7: Prepare feature vector
    patient_feature_df = pd.DataFrame(
        [selected_encounter[expected_features]]
    )

    patient_feature_df.replace("?", np.nan, inplace=True)

    # Convert nominal ID columns to strings
    for nominal_col in [
        "admission_type_id",
        "discharge_disposition_id",
        "admission_source_id"
    ]:

        if nominal_col in patient_feature_df.columns:
            patient_feature_df[nominal_col] = (
                patient_feature_df[nominal_col].astype(str)
            )

    # Step 8: Predict probability
    try:

        probabilities = model_pipeline.predict_proba(
            patient_feature_df
        )[0]

        readmission_probability = float(probabilities[1])

    except Exception as pred_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing model prediction: {str(pred_err)}"
        )

    # Step 9: Determine risk
    risk_assessment = (
        "High"
        if readmission_probability >= optimal_threshold
        else "Low"
    )

    risk_percentage = round(
        readmission_probability * 100,
        2
    )

    # Step 10: Save prediction in SQLite audit trail
    try:

        record_id = save_prediction(
            patient_id=int(patient_id),
            risk_percentage=risk_percentage,
            risk_status=risk_assessment
        )

        if record_id:
            print(
                f"Prediction logged to SQLite audit trail "
                f"[ID #{record_id}] for Patient #{patient_id}"
            )

    except Exception as db_err:
        print(f"SQLite audit trail warning: {db_err}")

    # Step 11: Format race information
    race_val = selected_encounter["race"]

    if pd.isna(race_val) or str(race_val).strip() in ["?", ""]:
        race_str = "Unknown"
    else:
        race_str = str(race_val)

    # Step 12: Convert clinical data to JSON-serializable values
    clinical_data = {}

    for col, val in selected_encounter.items():

        if pd.isna(val) or str(val).strip() in ["?", ""]:
            clinical_data[col] = None

        elif isinstance(val, (np.integer, int)):
            clinical_data[col] = int(val)

        elif isinstance(val, (np.floating, float)):
            clinical_data[col] = float(val)

        else:
            clinical_data[col] = str(val)

    # Step 13: Construct response
    response_payload = {

        "patient_id": int(patient_id),

        "patient_information": {
            "encounter_id": int(selected_encounter["encounter_id"]),
            "gender": str(selected_encounter["gender"]),
            "age": str(selected_encounter["age"]),
            "race": race_str,
            "time_in_hospital": int(
                selected_encounter["time_in_hospital"]
            )
        },

        "readmission_prediction": {
            "risk": risk_assessment,
            "readmission_probability": round(
                readmission_probability,
                2
            ),
            "threshold": round(optimal_threshold, 2)
        },

        "clinical_data": clinical_data
    }

    return response_payload


# ------------------------------------------------------------------------------
# 8. SQLITE PREDICTION AUDIT TRAIL
# ------------------------------------------------------------------------------

@app.get(
    "/audit-trail",
    tags=["Audit Trail"],
    summary="Retrieve SQL database audit trail records and summary metrics"
)
def get_audit_trail(
    patient_id: Optional[int] = None,
    risk_status: Optional[str] = None,
    sort_by: str = "newest",
    limit: int = 500
):
    """
    Retrieves prediction history from SQLite.
    Supports patient ID, risk status, sorting, and limit filters.
    """

    try:

        records = get_prediction_history(
            patient_id=patient_id,
            risk_status=risk_status,
            sort_by=sort_by,
            limit=limit
        )

        summary = get_audit_summary()
        meta = get_model_metadata()

        return {
            "status": "success",
            "database": "SQLite 3",
            "database_file": "hospital_readmission.db",
            "table": "prediction_history",
            "model_info": meta,
            "timezone": "IST (UTC+05:30)",
            "summary": summary,
            "total_returned": len(records),
            "records": records
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query SQLite audit trail: {str(e)}"
        )


# ------------------------------------------------------------------------------
# 9. SAVE DOCTOR FOLLOW-UP RECOMMENDATION
# ------------------------------------------------------------------------------

@app.post(
    "/recommendations",
    tags=["Doctor Recommendations"],
    summary="Save a doctor's clinical follow-up recommendation"
)
def create_patient_recommendation(
    payload: PatientRecommendationRequest
):
    """
    Saves a doctor's follow-up recommendation in SQLite.
    """

    try:

        primary_rec = payload.primary_recommendation.strip()

        if not primary_rec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Primary recommendation is required "
                    "and cannot be empty."
                )
            )

        saved = save_recommendation(
            patient_id=payload.patient_id,
            primary_recommendation=primary_rec,
            additional_recommendation=(
                payload.additional_recommendation
            ),
            status="Sent"
        )

        return {
            "status": "success",
            "message": (
                f"Recommendation sent successfully "
                f"to Patient #{payload.patient_id}"
            ),
            "recommendation": saved
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"Failed to save recommendation in database: {str(e)}"
            )
        )


# ------------------------------------------------------------------------------
# 10. GET PATIENT RECOMMENDATIONS
# ------------------------------------------------------------------------------

@app.get(
    "/recommendations/{patient_id}",
    tags=["Doctor Recommendations"],
    summary="Retrieve recommendations for a specific patient"
)
def get_recommendations_for_patient(patient_id: int):

    """
    Retrieves follow-up recommendations associated with a Patient ID.
    """

    try:

        recs = get_patient_recommendations(
            patient_id=patient_id,
            limit=50
        )

        return {
            "status": "success",
            "patient_id": patient_id,
            "total": len(recs),
            "recommendations": recs
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"Failed to retrieve recommendations "
                f"for Patient #{patient_id}: {str(e)}"
            )
        )


# ------------------------------------------------------------------------------
# 11. SERVE FRONTEND CSS, JAVASCRIPT AND OTHER ASSETS
# ------------------------------------------------------------------------------

# Register this AFTER the API routes so it does not intercept them.
# The frontend folder contains index.html, app.js, style.css, etc.

if FRONTEND_DIR.is_dir():

    app.mount(
        "/",
        StaticFiles(
            directory=str(FRONTEND_DIR),
            html=True
        ),
        name="frontend-assets"
    )

else:
    print(
        f"FRONTEND WARNING: folder not found: {FRONTEND_DIR}"
    )


# ------------------------------------------------------------------------------
# 12. LOCAL SERVER EXECUTION
# ------------------------------------------------------------------------------

if __name__ == "__main__":

    import uvicorn

    print(
        "\nStarting Uvicorn server on http://127.0.0.1:8000 ..."
    )

    print(
        "Swagger documentation: http://127.0.0.1:8000/docs"
    )

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )
