# ==============================================================================
# HOSPITAL READMISSION PREDICTION API
# FastAPI Backend Application for Model Serving and Real-Time Inference
#
# Objective: Serve predictions for hospital readmission risk (<30 days)
#            using the pre-trained pipeline saved in 'hospital_readmission_model.pkl'.
# ==============================================================================

import os
from typing import Optional
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from pydantic import BaseModel, Field
from database.database import get_db_connection


# ------------------------------------------------------------------------------
# 1. APPLICATION SETUP & SWAGGER DOCUMENTATION
# ------------------------------------------------------------------------------
# Swagger UI is automatically available at http://127.0.0.1:8000/docs
app = FastAPI(
    title="Hospital Readmission Prediction API",
    description="Predict whether a hospitalized diabetic patient will be readmitted within 30 days of discharge.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# File paths
MODEL_FILE_PATH = "hospital_readmission_model.pkl"
DATASET_FILE_PATH = "diabetic_data.csv"

# Global variables for loaded artifacts (cached in memory)
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
    Loads the serialized model package and diabetic_data.csv into memory.
    Ensures that files exist and that the model is never retrained inside main.py.
    """
    global model_pipeline, optimal_threshold, expected_features, target_mapping, patient_dataset

    # Verify model file existence
    if not os.path.exists(MODEL_FILE_PATH):
        raise FileNotFoundError(
            f"Trained model file '{MODEL_FILE_PATH}' was not found. "
            "Please run testmodel.py first to generate the model file."
        )

    # Load model dictionary using joblib
    try:
        saved_package = joblib.load(MODEL_FILE_PATH)
        model_pipeline = saved_package["model"]
        optimal_threshold = float(saved_package["threshold"])
        expected_features = list(saved_package["feature_columns"])
        target_mapping = saved_package.get("target_mapping", {"<30": 1, "NO": 0, ">30": 0})
    except Exception as e:
        raise RuntimeError(f"Failed to load or parse '{MODEL_FILE_PATH}': {str(e)}")

    # Verify dataset file existence
    if not os.path.exists(DATASET_FILE_PATH):
        raise FileNotFoundError(
            f"Dataset file '{DATASET_FILE_PATH}' was not found. "
            "Please ensure the CSV dataset is located in the working directory."
        )

    # Load dataset using pandas
    try:
        patient_dataset = pd.read_csv(DATASET_FILE_PATH)
    except Exception as e:
        raise RuntimeError(f"Failed to read dataset file '{DATASET_FILE_PATH}': {str(e)}")


# Load artifacts immediately at application startup
try:
    load_artifacts()
    print("SUCCESS: Model pipeline and patient dataset loaded into memory.")
    print(f"Optimal Decision Threshold: {optimal_threshold}")
    print(f"Expected Input Features ({len(expected_features)}): {expected_features[:5]}...")
except Exception as startup_error:
    print(f"STARTUP WARNING: {startup_error}")


# ------------------------------------------------------------------------------
# 3. PYDANTIC SCHEMAS (REQUEST & RESPONSE MODELS)
# ------------------------------------------------------------------------------
class PatientPredictionRequest(BaseModel):
    """
    Request payload accepting only the Patient ID (matches patient_nbr in dataset).
    An optional encounter_id can be provided if a patient has multiple hospital visits.
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
        description="Optional encounter_id to select a specific hospital encounter if multiple exist",
        examples=[2278392]
    )


class PatientInformation(BaseModel):
    """Demographic and hospital encounter summary."""
    encounter_id: int
    gender: str
    age: str
    race: str
    time_in_hospital: int


class ReadmissionPrediction(BaseModel):
    """
    Model prediction details.
    NOTE: Numeric class labels and 'predicted_class' are strictly excluded.
    """
    risk: str = Field(..., description="'High' if probability >= threshold, else 'Low'")
    readmission_probability: float = Field(..., description="Predicted probability of 30-day readmission")
    threshold: float = Field(..., description="Decision threshold tuned during model validation")


class PatientPredictionResponse(BaseModel):
    """Exact expected JSON response structure."""
    patient_id: int
    patient_information: PatientInformation
    readmission_prediction: ReadmissionPrediction


# ------------------------------------------------------------------------------
# 4. API ENDPOINTS
# ------------------------------------------------------------------------------

# GET / : Welcome Endpoint
@app.get("/", tags=["General"])
def welcome_message():
    """Welcome endpoint displaying system info and documentation link."""
    return {
        "message": "Welcome to the Hospital Readmission Prediction API",
        "documentation": "/docs",
        "health_check": "/health",
        "prediction_endpoint": "/predict"
    }


# GET /health : Health Check Endpoint
@app.get("/health", tags=["General"])
def health_check():
    """Health check endpoint confirming that the service and model are active."""
    return {
        "status": "running",
        "model_loaded": model_pipeline is not None,
        "dataset_loaded": patient_dataset is not None,
        "optimal_threshold": optimal_threshold,
        "total_features": len(expected_features) if expected_features else 0
    }


# POST /predict : Readmission Prediction Endpoint
@app.post(
    "/predict",
    response_model=PatientPredictionResponse,
    status_code=status.HTTP_200_OK,
    tags=["Prediction"],
    summary="Predict 30-day hospital readmission risk for a patient"
)
def predict_readmission(request: PatientPredictionRequest):
    """
    Accepts a Patient ID, searches for the patient in diabetic_data.csv,
    retrieves their hospital encounter information, extracts the exact
    features required by the trained model, and outputs risk assessment.
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
            detail="Invalid Patient ID. Patient ID must be a positive integer."
        )

    # Step 3: Search for the patient in diabetic_data.csv
    matching_records = patient_dataset[patient_dataset["patient_nbr"] == patient_id]

    # Return 404 if patient is not found
    if matching_records.empty:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient ID {patient_id} was not found in the hospital records."
        )

    # Step 4: Handle encounters (support single or multiple hospital visits)
    if request.encounter_id is not None:
        # User specified a specific encounter to predict
        encounter_match = matching_records[matching_records["encounter_id"] == request.encounter_id]
        if encounter_match.empty:
            available_encounters = matching_records["encounter_id"].tolist()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Encounter ID {request.encounter_id} does not belong to Patient ID {patient_id}. "
                    f"Available encounter IDs for this patient: {available_encounters}"
                )
            )
        selected_encounter = encounter_match.iloc[0]
    else:
        # If multiple encounters exist, evaluate the first/initial encounter and identify it clearly
        selected_encounter = matching_records.iloc[0]

    # Step 5: Check that required patient information is not missing
    required_info_fields = ["gender", "age", "race", "time_in_hospital"]
    missing_fields = []
    for field_name in required_info_fields:
        val = selected_encounter.get(field_name)
        if pd.isna(val) or val == "" or str(val).strip() == "":
            missing_fields.append(field_name)

    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Required patient information is missing for Patient ID {patient_id}: {missing_fields}"
        )

    # Step 6: Verify all expected features are present in the dataset record
    missing_features = [col for col in expected_features if col not in selected_encounter.index]
    if missing_features:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dataset is missing required feature columns: {missing_features}"
        )

    # Step 7: Prepare feature vector for model input
    # Select exactly the features stored in expected_features
    # Note: Excludes patient_nbr, encounter_id, and actual readmitted outcomes to prevent leakage
    patient_feature_df = pd.DataFrame([selected_encounter[expected_features]])

    # Replace missing representation '?' with NaN
    patient_feature_df.replace("?", np.nan, inplace=True)

    # Convert nominal ID columns to strings, matching training pipeline preprocessing
    for nominal_col in ["admission_type_id", "discharge_disposition_id", "admission_source_id"]:
        if nominal_col in patient_feature_df.columns:
            patient_feature_df[nominal_col] = patient_feature_df[nominal_col].astype(str)

    # Step 8: Calculate readmission probability using predict_proba()
    try:
        probabilities = model_pipeline.predict_proba(patient_feature_df)[0]
        # In binary classification, index 1 corresponds to readmission within 30 days (<30)
        readmission_probability = float(probabilities[1])
    except Exception as pred_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error executing model prediction: {str(pred_err)}"
        )

    # Step 9: Compare probability against the saved threshold to determine risk
    # Probability >= saved threshold -> High Risk; otherwise -> Low Risk
    risk_assessment = "High" if readmission_probability >= optimal_threshold else "Low"
    # Step 9.1: Save prediction history in MySQL

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        risk_percentage = round(readmission_probability * 100, 2)

        insert_query = """
            INSERT INTO prediction_history
            (patient_id, risk_percentage, risk_status)
            VALUES (%s, %s, %s)
        """

        cursor.execute(
            insert_query,
            (int(patient_id), risk_percentage, risk_assessment)
        )

        connection.commit()

        print(f"Prediction saved for Patient ID: {patient_id}")

    except Exception as db_error:
        if connection is not None and connection.is_connected():
            connection.rollback()

        print(f"Database saving failed: {db_error}")

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None and connection.is_connected():
            connection.close()

    # Step 10: Format and return expected JSON response
    # Strictly returns: patient_id, patient_information, risk, readmission_probability, threshold
    # IMPORTANT: predicted_class and numeric class labels are never returned
    race_val = selected_encounter["race"]
    if pd.isna(race_val) or str(race_val).strip() in ["?", ""]:
        race_str = "Unknown"
    else:
        race_str = str(race_val)

    response_payload = {
        "patient_id": int(patient_id),
        "patient_information": {
            "encounter_id": int(selected_encounter["encounter_id"]),
            "gender": str(selected_encounter["gender"]),
            "age": str(selected_encounter["age"]),
            "race": race_str,
            "time_in_hospital": int(selected_encounter["time_in_hospital"])
        },
        "readmission_prediction": {
            "risk": risk_assessment,
            "readmission_probability": round(readmission_probability, 2),
            "threshold": round(optimal_threshold, 2)
        }
    }

    return response_payload


# ------------------------------------------------------------------------------
# 5. LOCAL SERVER EXECUTION ENTRY POINT
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print("\nStarting Uvicorn server on http://127.0.0.1:8000 ...")
    print("Swagger documentation: http://127.0.0.1:8000/docs")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
