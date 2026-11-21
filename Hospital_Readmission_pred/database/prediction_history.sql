CREATE DATABASE hospital_readmission_db;

USE hospital_readmission_db;

CREATE TABLE prediction_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT NOT NULL,
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    risk_percentage DECIMAL(5,2) NOT NULL,
    risk_status VARCHAR(10) NOT NULL
);