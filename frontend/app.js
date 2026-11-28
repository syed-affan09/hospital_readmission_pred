/**
 * ==============================================================================
 * MEDIPREDICT — APPLICATION JAVASCRIPT
 * Pure Vanilla JavaScript (ES6) — No External Frameworks
 *
 * Modules:
 * 1. CONFIG: Automatic API URL detection (Local vs Deployed)
 * 2. DATASET_FIELDS: Metadata for all 50 clinical dataset features
 * 3. ApiService: Native fetch() client for FastAPI (/health, /predict, /audit-trail)
 * 4. UI: Shared visualization, risk gauge, toast, and strict status indicator
 * 5. MediApp: Master Four-Tab Application Controller
 * ==============================================================================
 */

/* ------------------------------------------------------------------------------
   1. CONFIGURATION MODULE
   ------------------------------------------------------------------------------ */
const CONFIG = {
  MODEL_THRESHOLD: 0.46,

  /**
   * Automatically select the correct API Base URL:
   * - Localhost or 127.0.0.1: uses http://127.0.0.1:8000
   * - Deployed environment fallback: https://hospital-readmission-pred.onrender.com
   */
  getApiBaseUrl() {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "") {
      return "http://127.0.0.1:8000";
    }
    return "https://hospital-readmission-pred.onrender.com";
  }
};

/* ------------------------------------------------------------------------------
   2. DATASET METADATA (ALL 50 CLINICAL FIELDS FROM diabetic_data.csv)
   ------------------------------------------------------------------------------ */
const DATASET_FIELDS = [
  // 1. Demographics & Identifiers (6)
  { key: "patient_nbr", label: "Patient ID (Number)", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "Unique numerical patient identifier." },
  { key: "encounter_id", label: "Encounter ID", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "Hospital visit encounter identifier." },
  { key: "gender", label: "Gender", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "Biological gender at admission." },
  { key: "age", label: "Age Bracket", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "10-year age band (e.g. [50-60))." },
  { key: "race", label: "Race / Ethnicity", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "Self-reported ethnic background." },
  { key: "weight", label: "Weight", category: "demographics", categoryLabel: "Demographics & Identifiers", description: "Weight in pounds or weight bracket." },

  // 2. Admission & Encounter Details (6)
  { key: "admission_type_id", label: "Admission Type ID", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Clinical admission classification (1=Emergency, 2=Urgent, 3=Elective)." },
  { key: "discharge_disposition_id", label: "Discharge Disposition ID", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Discharge destination (1=Home, 2=Hospital, 3=SNF, 6=Home Health)." },
  { key: "admission_source_id", label: "Admission Source ID", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Referral source (7=Emergency Room, 1=Physician, 2=Clinic)." },
  { key: "time_in_hospital", label: "Length of Stay (Days)", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Hospital duration between admission and discharge (1-14 days)." },
  { key: "payer_code", label: "Payer Code", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Health insurance or coverage code." },
  { key: "medical_specialty", label: "Admitting Medical Specialty", category: "admission", categoryLabel: "Admission & Encounter Details", description: "Specialty of admitting healthcare professional." },

  // 3. Clinical Utilization & History (6)
  { key: "num_lab_procedures", label: "Lab Procedures Count", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Total number of laboratory tests performed." },
  { key: "num_procedures", label: "Non-Lab Procedures Count", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Count of non-lab medical procedures during encounter." },
  { key: "num_medications", label: "Total Distinct Medications", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Number of distinct administered medications." },
  { key: "number_outpatient", label: "Prior Outpatient Visits", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Outpatient encounters in preceding 12 months." },
  { key: "number_emergency", label: "Prior Emergency Visits", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Emergency department visits in preceding 12 months." },
  { key: "number_inpatient", label: "Prior Inpatient Admissions", category: "utilization", categoryLabel: "Clinical Utilization & History", description: "Inpatient admissions in preceding 12 months." },

  // 4. Diagnoses & Lab Results (6)
  { key: "diag_1", label: "Primary Diagnosis (ICD-9)", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Primary discharge ICD-9 diagnostic code." },
  { key: "diag_2", label: "Secondary Diagnosis (ICD-9)", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Secondary ICD-9 diagnostic code." },
  { key: "diag_3", label: "Additional Diagnosis (ICD-9)", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Additional ICD-9 diagnostic code." },
  { key: "number_diagnoses", label: "Total Diagnoses Entered", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Total number of recorded diagnoses." },
  { key: "max_glu_serum", label: "Max Glucose Serum Result", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Serum glucose test result (None, Norm, >200, >300)." },
  { key: "A1Cresult", label: "HbA1c Control Test Result", category: "diagnoses", categoryLabel: "Diagnoses & Lab Results", description: "Glycated hemoglobin 3-month test (None, Norm, >7, >8)." },

  // 5. 23 Diabetic Medications (23)
  ...[
    "metformin", "repaglinide", "nateglinide", "chlorpropamide", "glimepiride",
    "acetohexamide", "glipizide", "glyburide", "tolbutamide", "pioglitazone",
    "rosiglitazone", "acarbose", "miglitol", "troglitazone", "tolazamide",
    "examide", "citoglipton", "insulin", "glyburide-metformin", "glipizide-metformin",
    "glimepiride-pioglitazone", "metformin-rosiglitazone", "metformin-pioglitazone"
  ].map(med => ({
    key: med,
    label: med.charAt(0).toUpperCase() + med.slice(1),
    category: "medications",
    categoryLabel: "Diabetic Medications",
    description: `Dosage status for ${med} (No, Steady, Up, Down).`
  })),

  // 6. Treatment Status & Outcome (3)
  { key: "change", label: "Medication Change (Adjusted Rx)", category: "treatment", categoryLabel: "Treatment & Outcome Record", description: "Indicates whether diabetic medication dosage was adjusted." },
  { key: "diabetesMed", label: "Diabetes Med Prescribed", category: "treatment", categoryLabel: "Treatment & Outcome Record", description: "Whether any diabetic medication was prescribed." },
  { key: "readmitted", label: "Historical Readmission Record", category: "treatment", categoryLabel: "Treatment & Outcome Record", description: "Historical dataset target (<30, >30, NO) from diabetic_data.csv." }
];

/* ------------------------------------------------------------------------------
   3. CENTRALIZED API SERVICE (FastAPI Client)
   ------------------------------------------------------------------------------ */
const ApiService = {
  getBaseUrl() {
    return CONFIG.getApiBaseUrl();
  },

  async request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const config = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(options.headers || {})
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      let data = null;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { message: text };
      }

      if (!response.ok) {
        const errorDetail = data?.detail || data?.message || `HTTP ${response.status} (${response.statusText})`;
        const error = new Error(typeof errorDetail === "object" ? JSON.stringify(errorDetail) : errorDetail);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (!err.status) {
        err.isNetworkError = true;
        err.message = `Cannot connect to backend server at ${baseUrl}. Ensure backend is running.`;
      }
      throw err;
    }
  },

  /**
   * GET /health — Checks backend status and model readiness
   */
  async checkHealth() {
    return this.request("/health", { method: "GET" });
  },

  /**
   * POST /predict — Executes readmission risk evaluation using real dataset and trained pipeline
   */
  async predictReadmission(patientId, encounterId = null) {
    const payload = { patient_id: parseInt(patientId, 10) };
    if (encounterId) payload.encounter_id = parseInt(encounterId, 10);
    return this.request("/predict", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  /**
   * GET /audit-trail — Retrieves SQLite prediction history records
   */
  async getAuditTrail(patientId = null, limit = 150) {
    let endpoint = `/audit-trail?limit=${limit}`;
    if (patientId) endpoint += `&patient_id=${patientId}`;
    return this.request(endpoint, { method: "GET" });
  },

  /**
   * POST /recommendations — Saves a doctor's clinical follow-up recommendation into SQLite
   */
  async saveRecommendation(patientId, primaryRecommendation, additionalRecommendation = "") {
    return this.request("/recommendations", {
      method: "POST",
      body: JSON.stringify({
        patient_id: parseInt(patientId, 10),
        primary_recommendation: primaryRecommendation,
        additional_recommendation: additionalRecommendation || null
      })
    });
  },

  /**
   * GET /recommendations/{patientId} — Retrieves previous follow-up recommendations for patient
   */
  async getRecommendations(patientId) {
    return this.request(`/recommendations/${parseInt(patientId, 10)}`, {
      method: "GET"
    });
  }
};

/* ------------------------------------------------------------------------------
   4. UI UTILITIES & STRICT STATUS INDICATOR
   ------------------------------------------------------------------------------ */
const UI = {
  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  initToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    return container;
  },

  toast(title, message, type = "info", durationMs = 4000) {
    const container = this.initToastContainer();
    const toastEl = document.createElement("div");
    toastEl.className = `toast toast-${type}`;
    toastEl.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${this.escapeHtml(title)}</div>
        <div class="toast-message">${this.escapeHtml(message)}</div>
      </div>
      <button class="toast-close" title="Dismiss">&times;</button>
    `;

    const closeBtn = toastEl.querySelector(".toast-close");
    const removeToast = () => {
      toastEl.style.opacity = "0";
      toastEl.style.transform = "translateX(20px)";
      setTimeout(() => toastEl.remove(), 250);
    };

    closeBtn.addEventListener("click", removeToast);
    container.appendChild(toastEl);
    if (durationMs > 0) setTimeout(removeToast, durationMs);
  },

  /**
   * Renders circular SVG risk gauge
   */
  renderRiskGauge(container, probability, threshold = 0.46, risk = null) {
    if (!container) return;
    const pct = Math.round(probability * 100);
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const isHighRisk = (risk && risk.toLowerCase() === "high") || probability >= threshold;
    const strokeColor = isHighRisk ? "#dc2626" : "#0d9488";

    container.innerHTML = `
      <div class="circular-gauge">
        <svg viewBox="0 0 130 130" width="130" height="130">
          <circle class="gauge-bg" cx="65" cy="65" r="${radius}" stroke="#e2e8f0" stroke-width="10" fill="none" />
          <circle class="gauge-progress" cx="65" cy="65" r="${radius}"
                  stroke="${strokeColor}" stroke-width="10" fill="none" stroke-linecap="round"
                  style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; transform: rotate(-90deg); transform-origin: 65px 65px; transition: stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1);" />
        </svg>
        <div class="gauge-text">
          <div class="gauge-value" style="color: ${strokeColor};">${pct}%</div>
          <div class="gauge-label">30-Day Risk</div>
        </div>
      </div>
    `;
  },

  /**
   * Strict Backend Status Indicator:
   * Displays ONLY:
   * - "Backend: Online"
   * - "Backend: Offline"
   */
  async checkBackendStatus() {
    const statusDot = document.getElementById("api-status-dot");
    const statusText = document.getElementById("api-status-text");
    if (!statusDot || !statusText) return;

    try {
      const data = await ApiService.checkHealth();
      if (data && data.status === "running") {
        statusDot.className = "status-dot online";
        statusText.textContent = "Backend: Online";

        // Dynamically update model name from backend reflection
        if (data.model_name) {
          const footerModelEl = document.getElementById("footer-model-name");
          if (footerModelEl) footerModelEl.textContent = `Model: ${data.model_name}`;
          const specModelEl = document.getElementById("audit-spec-model-name");
          if (specModelEl) specModelEl.textContent = data.model_name;
        }
      } else {
        statusDot.className = "status-dot offline";
        statusText.textContent = "Backend: Offline";
      }
    } catch (err) {
      statusDot.className = "status-dot offline";
      statusText.textContent = "Backend: Offline";
    }
  }
};

/* ------------------------------------------------------------------------------
   5. MEDIPREDICT MASTER APPLICATION CONTROLLER
   ------------------------------------------------------------------------------ */
const MediApp = {
  currentTab: "overview",
  activePatientData: null,
  activeFilterCategory: "all",
  activeSearchKeyword: "",
  auditRecords: [],

  init() {
    // 1. Initial health check & recurring ping
    UI.checkBackendStatus();
    setInterval(() => UI.checkBackendStatus(), 15000);

    // 2. Setup Doctor search form listeners
    this.setupDoctorListeners();

    // 3. Initialize Simulator with default values
    this.updateSimulator();

    // 4. Load initial SQLite audit trail stats
    this.refreshAuditTrail(false);

    // 5. Check if URL specifies a tab or patient
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    const patientParam = urlParams.get("patient_id");

    if (tabParam && ["overview", "doctor", "model", "audit"].includes(tabParam)) {
      this.switchTab(tabParam);
    } else {
      this.switchTab("overview"); // Tab 1 by default
    }

    if (patientParam) {
      this.switchTab("doctor");
      this.loadPatient(patientParam);
    }
  },

  /* --------------------------------------------------------------------------
     A. HORIZONTAL TAB SWITCHING (Smooth & No Page Reloads)
     -------------------------------------------------------------------------- */
  switchTab(tabId) {
    if (!["overview", "doctor", "model", "audit"].includes(tabId)) return;
    this.currentTab = tabId;

    // Update Nav Buttons
    const navButtons = document.querySelectorAll(".nav-tab-btn");
    navButtons.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // Update Tab Views
    const tabViews = {
      overview: document.getElementById("tab-overview"),
      doctor: document.getElementById("tab-doctor"),
      model: document.getElementById("tab-model"),
      audit: document.getElementById("tab-audit")
    };

    Object.keys(tabViews).forEach(key => {
      const viewEl = tabViews[key];
      if (viewEl) {
        if (key === tabId) {
          viewEl.classList.add("active");
          viewEl.classList.remove("hidden");
        } else {
          viewEl.classList.remove("active");
          viewEl.classList.add("hidden");
        }
      }
    });

    // Specific on-switch triggers
    if (tabId === "audit") {
      this.refreshAuditTrail();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  /* --------------------------------------------------------------------------
     B. TAB 2: DOCTOR PORTAL LOGIC
     -------------------------------------------------------------------------- */
  setupDoctorListeners() {
    const searchForm = document.getElementById("doctor-search-form");
    const searchInput = document.getElementById("search-patient-id");

    if (searchForm && searchInput) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = searchInput.value.trim();
        if (!id) {
          UI.toast("Input Required", "Please enter a valid Patient ID.", "warning");
          return;
        }
        this.loadPatient(id);
      });
    }

    // 50-field category filters
    const filterButtons = document.querySelectorAll(".fields-tab-btn");
    filterButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        filterButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.activeFilterCategory = btn.dataset.category || "all";
        if (this.activePatientData) {
          this.render50Fields(this.activePatientData);
        }
      });
    });

    // 50-field search box
    const fieldSearchInput = document.getElementById("fields-search-input");
    if (fieldSearchInput) {
      fieldSearchInput.addEventListener("input", (e) => {
        this.activeSearchKeyword = e.target.value.trim();
        if (this.activePatientData) {
          this.render50Fields(this.activePatientData);
        }
      });
    }
  },

  async loadPatient(patientId) {
    this.switchTab("doctor");

    const searchInput = document.getElementById("search-patient-id");
    if (searchInput) searchInput.value = patientId;

    const loadingEl = document.getElementById("patient-loading");
    const errorEl = document.getElementById("patient-error");
    const contentEl = document.getElementById("patient-content");

    if (loadingEl) loadingEl.classList.remove("hidden");
    if (errorEl) errorEl.classList.add("hidden");
    if (contentEl) contentEl.classList.add("hidden");

    try {
      const predResponse = await ApiService.predictReadmission(patientId);
      this.activePatientData = predResponse;

      // 1. Render Prediction Result Card
      this.renderPredictionResult(predResponse);

      // 2. Load Any Prior Recommendations for this Patient
      this.loadPatientRecommendations(predResponse.patient_id);

      // 3. Render Patient Demographic & Admission Cards
      this.renderPatientDossier(predResponse);

      // 4. Render 50 Clinical Dataset Fields
      this.render50Fields(predResponse);

      if (loadingEl) loadingEl.classList.add("hidden");
      if (contentEl) {
        contentEl.classList.remove("hidden");
        const predCard = document.getElementById("patient-prediction-card");
        if (predCard) {
          predCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      UI.toast("Patient File Loaded", `Successfully retrieved record for Patient #${patientId}`, "success");

      // Immediately refresh audit trail in background so new prediction appears with accurate IST timestamp
      this.refreshAuditTrail(false);
    } catch (err) {
      if (loadingEl) loadingEl.classList.add("hidden");
      if (errorEl) {
        errorEl.classList.remove("hidden");
        errorEl.innerHTML = `
          <strong>Notice:</strong> Unable to retrieve record: ${UI.escapeHtml(err.message)}
          <div class="mt-2 text-xs">
            Verify that Patient ID exists in <code>diabetic_data.csv</code> (e.g. sample IDs <code>8222157</code>, <code>85504905</code>, <code>55629189</code>, or <code>86047875</code>).
          </div>
        `;
      }
      UI.toast("Patient Query Error", err.message, "error");
    }
  },

  renderPredictionResult(predData) {
    const container = document.getElementById("patient-prediction-card");
    if (!container) return;

    const prob = predData.readmission_prediction.readmission_probability;
    const threshold = predData.readmission_prediction.threshold;
    const risk = predData.readmission_prediction.risk;
    const isHigh = risk.toLowerCase() === "high";
    const info = predData.patient_information;

    container.innerHTML = `
      <div class="card mb-6 prediction-result-card ${isHigh ? 'risk-card-high' : 'risk-card-low'}">
        <div class="card-header">
          <div class="flex items-center gap-2">
            <span class="prediction-status-icon ${isHigh ? 'text-danger' : 'text-teal'}">
              ${isHigh 
                ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' 
                : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'}
            </span>
            <div>
              <h3 class="card-title">Readmission Risk Assessment &bull; Patient #${predData.patient_id}</h3>
              <div class="text-xs text-muted">Evaluated Inpatient Encounter #${info.encounter_id}</div>
            </div>
          </div>
          <span class="badge ${isHigh ? 'badge-high-subtle' : 'badge-low-subtle'}">
            <span class="status-dot-indicator ${isHigh ? 'dot-high' : 'dot-low'}"></span>
            ${isHigh ? 'High Risk Assessment' : 'Low Risk Assessment'}
          </span>
        </div>
        <div class="card-body">
          <div class="prediction-summary-grid">
            <div class="prediction-gauge-box" id="doctor-risk-gauge"></div>
            <div class="prediction-details-box">
              <div class="risk-stat-row">
                <span class="risk-stat-label">30-Day Readmission Probability:</span>
                <span class="risk-stat-value font-bold">${Math.round(prob * 100)}% (${prob.toFixed(2)})</span>
              </div>
              <div class="risk-stat-row">
                <span class="risk-stat-label">Decision Threshold:</span>
                <span class="risk-stat-value">${threshold.toFixed(2)} (46% F2-Tuned)</span>
              </div>
              <div class="risk-stat-row">
                <span class="risk-stat-label">Clinical Risk Classification:</span>
                <span class="risk-stat-value ${isHigh ? 'text-danger' : 'text-teal'} font-bold">
                  ${risk} Risk (${prob >= threshold ? 'Exceeds threshold \u2265 0.46' : 'Below threshold < 0.46'})
                </span>
              </div>
              <div class="risk-stat-row">
                <span class="risk-stat-label">Length of Inpatient Stay:</span>
                <span class="risk-stat-value">${info.time_in_hospital} Day(s)</span>
              </div>
            </div>
          </div>
          <div class="alert ${isHigh ? 'alert-danger' : 'alert-success'} mt-4">
            <div class="flex items-start gap-2">
              <span class="alert-icon-inline mt-0.5">
                ${isHigh 
                  ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' 
                  : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'}
              </span>
              <div>
                <strong>Clinical Decision Guidance:</strong>
                <p class="text-xs mt-1">
                  ${isHigh
                    ? 'Patient is categorized as High Risk for 30-day hospital readmission. Recommend scheduling early post-discharge physician follow-up within 7 days, conducting discharge medication reconciliation, and providing structured diabetic self-management education.'
                    : 'Patient is categorized as Low Risk for 30-day hospital readmission. Standard outpatient follow-up instructions and routine primary care check-ups recommended.'}
                </p>
              </div>
            </div>
          </div>

          <!-- ================================================================
               PATIENT FOLLOW-UP RECOMMENDATIONS (Doctor Action Section)
               ================================================================ -->
          <div class="patient-recommendations-section mt-5 pt-4 border-t border-slate-200">
            <div class="recommendations-header flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="rec-header-icon text-teal">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </span>
                <h4 class="rec-section-title font-bold text-navy text-base">Patient Follow-up Recommendations</h4>
              </div>
              <span class="badge badge-teal">Clinical Protocol</span>
            </div>

            <!-- Recommendation Form -->
            <form id="doctor-recommendation-form" class="recommendations-form" onsubmit="MediApp.handleSendRecommendation(event, ${predData.patient_id})">
              <!-- Primary Recommendation (Required Dropdown) -->
              <div class="form-group mb-3">
                <label for="rec-primary-select" class="form-label font-medium text-sm flex items-center justify-between mb-1">
                  <span>Primary Recommendation <span class="text-danger">*</span></span>
                  <span class="text-xs text-muted font-normal">Required</span>
                </label>
                <select id="rec-primary-select" class="form-control rec-select-input" required onchange="MediApp.handlePrimaryRecChange(this)">
                  <option value="" disabled selected>-- Select a primary recommendation --</option>
                  <option value="Schedule physician follow-up within 7 days.">Schedule physician follow-up within 7 days.</option>
                  <option value="Conduct discharge medication reconciliation.">Conduct discharge medication reconciliation.</option>
                  <option value="Provide diabetic self-management education.">Provide diabetic self-management education.</option>
                  <option value="Monitor blood glucose regularly.">Monitor blood glucose regularly.</option>
                  <option value="Arrange a post-discharge clinical assessment.">Arrange a post-discharge clinical assessment.</option>
                  <option value="Review medication adherence.">Review medication adherence.</option>
                  <option value="Other (specify)">Other (specify)...</option>
                </select>
                <!-- Custom text input displayed only if 'Other (specify)' is selected -->
                <div id="rec-other-container" class="hidden mt-2">
                  <input type="text" id="rec-other-input" class="form-control" placeholder="Specify custom primary recommendation..." maxlength="255">
                </div>
              </div>

              <!-- Additional Recommendation (Optional Textarea) -->
              <div class="form-group mb-3">
                <label for="rec-additional-text" class="form-label font-medium text-sm flex items-center justify-between mb-1">
                  <span>Additional Recommendation</span>
                  <span class="text-xs text-muted font-normal">Optional</span>
                </label>
                <textarea id="rec-additional-text" class="form-control rec-textarea-input" rows="3" placeholder="Enter any additional instructions or recommendations for this patient..."></textarea>
              </div>

              <!-- Submit Button & Loading State -->
              <div class="rec-actions-row flex items-center gap-3">
                <button type="submit" id="btn-send-recommendation" class="btn btn-teal font-semibold flex items-center gap-2">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  <span>Send Recommendation</span>
                </button>
                <div id="rec-loading-spinner" class="hidden text-sm text-muted flex items-center gap-2">
                  <span class="circular-spinner-small"></span>
                  <span>Sending recommendation to patient file...</span>
                </div>
              </div>
            </form>

            <!-- Success Notification (Dynamically shown) -->
            <div id="rec-success-notification" class="rec-success-notification hidden mt-4"></div>

            <!-- Error Notification Alert (Dynamically shown) -->
            <div id="rec-error-notification" class="alert alert-danger hidden mt-4"></div>

            <!-- Previous Stored Recommendations (History for this patient) -->
            <div id="rec-history-container" class="rec-history-container hidden mt-4 pt-3 border-t border-slate-100">
              <h5 class="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Previous Recommendations on File:</h5>
              <div id="rec-history-list" class="rec-history-list"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const gaugeBox = document.getElementById("doctor-risk-gauge");
    if (gaugeBox) UI.renderRiskGauge(gaugeBox, prob, threshold, risk);
  },

  handlePrimaryRecChange(selectEl) {
    const otherContainer = document.getElementById("rec-other-container");
    const otherInput = document.getElementById("rec-other-input");
    if (!otherContainer) return;
    if (selectEl.value === "Other (specify)") {
      otherContainer.classList.remove("hidden");
      if (otherInput) otherInput.focus();
    } else {
      otherContainer.classList.add("hidden");
      if (otherInput) otherInput.value = "";
    }
  },

  async handleSendRecommendation(event, patientId) {
    if (event) event.preventDefault();

    const selectEl = document.getElementById("rec-primary-select");
    const otherInput = document.getElementById("rec-other-input");
    const additionalTextEl = document.getElementById("rec-additional-text");
    const btnSend = document.getElementById("btn-send-recommendation");
    const spinner = document.getElementById("rec-loading-spinner");
    const successBox = document.getElementById("rec-success-notification");
    const errorBox = document.getElementById("rec-error-notification");

    // Hide any previous notifications
    if (successBox) {
      successBox.classList.add("hidden");
      successBox.innerHTML = "";
    }
    if (errorBox) {
      errorBox.classList.add("hidden");
      errorBox.innerHTML = "";
    }

    // Dynamic Patient ID verification
    const activePid = patientId || this.activePatientData?.patient_id;
    if (!activePid) {
      if (errorBox) {
        errorBox.textContent = "Error: No active patient evaluated. Please search and evaluate a patient first.";
        errorBox.classList.remove("hidden");
      }
      return;
    }

    // Validation 1: Primary recommendation
    let primaryRec = selectEl ? selectEl.value : "";
    if (!primaryRec || primaryRec.trim() === "") {
      if (errorBox) {
        errorBox.textContent = "Please select a primary recommendation from the dropdown.";
        errorBox.classList.remove("hidden");
      }
      if (selectEl) selectEl.focus();
      return;
    }

    // Handle "Other (specify)"
    if (primaryRec === "Other (specify)") {
      const customVal = otherInput ? otherInput.value.trim() : "";
      if (!customVal) {
        if (errorBox) {
          errorBox.textContent = "Please specify the custom primary recommendation.";
          errorBox.classList.remove("hidden");
        }
        if (otherInput) otherInput.focus();
        return;
      }
      primaryRec = customVal;
    }

    const additionalRec = additionalTextEl ? additionalTextEl.value.trim() : "";

    // Show loading state
    if (btnSend) btnSend.disabled = true;
    if (spinner) spinner.classList.remove("hidden");

    try {
      const result = await ApiService.saveRecommendation(activePid, primaryRec, additionalRec);
      const saved = result.recommendation;

      if (successBox) {
        successBox.innerHTML = `
          <div class="rec-success-card">
            <div class="rec-success-banner">
              <div class="flex items-center gap-2">
                <span class="rec-success-check-icon">✓</span>
                <strong class="rec-success-heading">Recommendation sent successfully!</strong>
              </div>
              <span class="badge badge-teal">Sent Successfully</span>
            </div>
            <p class="rec-success-note text-xs text-muted mt-1">
              Recommendation sent and recorded for Patient #${activePid} (Inpatient Care Registry).
            </p>
            <div class="rec-card-details mt-3">
              <div class="rec-detail-row">
                <span class="rec-detail-label">Patient ID:</span>
                <span class="rec-detail-value font-bold text-navy">#${activePid}</span>
              </div>
              <div class="rec-detail-section mt-2">
                <span class="rec-detail-label">Primary Recommendation:</span>
                <div class="rec-detail-box">${UI.escapeHtml(saved.primary_recommendation)}</div>
              </div>
              <div class="rec-detail-section mt-2">
                <span class="rec-detail-label">Additional Recommendation:</span>
                <div class="rec-detail-box ${saved.additional_recommendation ? '' : 'text-muted italic'}">${saved.additional_recommendation ? UI.escapeHtml(saved.additional_recommendation) : 'None provided'}</div>
              </div>
              <div class="rec-detail-meta mt-3 pt-2 border-t border-emerald-100 flex items-center justify-between text-xs text-muted">
                <span><strong>Sent at:</strong> ${UI.escapeHtml(saved.sent_at_ist)}</span>
                <span><strong>Status:</strong> ${UI.escapeHtml(saved.status || 'Sent')}</span>
              </div>
            </div>
          </div>
        `;
        successBox.classList.remove("hidden");
        successBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      UI.toast("Recommendation Sent", `Recommendation sent successfully to Patient #${activePid}`, "success");

      // Reset form controls
      if (selectEl) selectEl.selectedIndex = 0;
      if (otherInput) {
        otherInput.value = "";
        const otherContainer = document.getElementById("rec-other-container");
        if (otherContainer) otherContainer.classList.add("hidden");
      }
      if (additionalTextEl) additionalTextEl.value = "";

      // Refresh history for this patient
      this.loadPatientRecommendations(activePid);
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = `Error saving recommendation: ${err.message || 'Database write error'}`;
        errorBox.classList.remove("hidden");
      }
      UI.toast("Save Failed", err.message || "Failed to record recommendation", "error");
    } finally {
      if (btnSend) btnSend.disabled = false;
      if (spinner) spinner.classList.add("hidden");
    }
  },

  async loadPatientRecommendations(patientId) {
    const historyContainer = document.getElementById("rec-history-container");
    const historyList = document.getElementById("rec-history-list");
    if (!historyContainer || !historyList) return;

    try {
      const data = await ApiService.getRecommendations(patientId);
      const recs = data.recommendations || [];
      if (recs.length === 0) {
        historyContainer.classList.add("hidden");
        historyList.innerHTML = "";
        return;
      }

      historyContainer.classList.remove("hidden");
      historyList.innerHTML = recs.map(r => `
        <div class="rec-history-item mb-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold text-navy">${UI.escapeHtml(r.primary_recommendation)}</span>
            <span class="text-muted text-2xs">${UI.escapeHtml(r.sent_at_ist)}</span>
          </div>
          ${r.additional_recommendation ? `<div class="text-secondary mt-1">${UI.escapeHtml(r.additional_recommendation)}</div>` : ''}
        </div>
      `).join("");
    } catch (err) {
      console.warn("Could not load previous recommendations:", err);
    }
  },

  renderPatientDossier(predData) {
    const info = predData.patient_information || {};
    const clin = predData.clinical_data || {};

    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== null && val !== undefined && val !== "" ? val : "Not Recorded";
    };

    // Patient Information
    setText("doc-patient-id", `#${predData.patient_id}`);
    setText("doc-encounter-id", `#${info.encounter_id}`);
    setText("doc-gender", info.gender);
    setText("doc-age", info.age);
    setText("doc-race", info.race);
    setText("doc-weight", clin.weight || "Not Recorded");

    // Admission Details
    setText("doc-admission-type", clin.admission_type_id ? `Type ID: ${clin.admission_type_id}` : "Not Recorded");
    setText("doc-admission-source", clin.admission_source_id ? `Source ID: ${clin.admission_source_id}` : "Not Recorded");
    setText("doc-discharge-disp", clin.discharge_disposition_id ? `Disposition ID: ${clin.discharge_disposition_id}` : "Not Recorded");
    setText("doc-time-hospital", `${info.time_in_hospital} Day(s)`);
    setText("doc-payer-code", clin.payer_code || "Self-Pay / Not Recorded");
    setText("doc-medical-specialty", clin.medical_specialty || "General Inpatient");

    // Medical Details
    setText("doc-diag-1", clin.diag_1 ? `ICD-9: ${clin.diag_1}` : "Not Recorded");
    setText("doc-diag-2", clin.diag_2 ? `ICD-9: ${clin.diag_2}` : "Not Recorded");
    setText("doc-num-diagnoses", `${clin.number_diagnoses || 0} Diagnoses`);
    setText("doc-num-labs", `${clin.num_lab_procedures || 0} Procedures`);
    setText("doc-num-procedures", `${clin.num_procedures || 0} Non-Lab`);
    setText("doc-num-meds", `${clin.num_medications || 0} Distinct Meds`);

    const fieldsPatId = document.getElementById("fields-patient-id");
    if (fieldsPatId) fieldsPatId.textContent = predData.patient_id;
  },

  render50Fields(predResponse) {
    const gridContainer = document.getElementById("clinical-fields-grid");
    const countBadge = document.getElementById("fields-count-badge");
    if (!gridContainer) return;

    const clinical = predResponse.clinical_data || {};
    const mergedData = {
      patient_nbr: predResponse.patient_id,
      encounter_id: predResponse.patient_information?.encounter_id,
      gender: predResponse.patient_information?.gender,
      age: predResponse.patient_information?.age,
      race: predResponse.patient_information?.race,
      time_in_hospital: predResponse.patient_information?.time_in_hospital,
      ...clinical
    };

    const fieldsToRender = DATASET_FIELDS.filter(field => {
      if (this.activeFilterCategory !== "all" && field.category !== this.activeFilterCategory) return false;
      if (this.activeSearchKeyword) {
        const kw = this.activeSearchKeyword.toLowerCase();
        const matchesKey = field.key.toLowerCase().includes(kw);
        const matchesLabel = field.label.toLowerCase().includes(kw);
        const matchesDesc = (field.description || "").toLowerCase().includes(kw);
        if (!matchesKey && !matchesLabel && !matchesDesc) return false;
      }
      return true;
    });

    if (countBadge) countBadge.textContent = `${fieldsToRender.length} of 50 Fields`;

    gridContainer.innerHTML = fieldsToRender.map(field => {
      const val = mergedData[field.key];
      const hasValue = val !== undefined && val !== null && val !== "" && val !== "?";
      const displayVal = hasValue ? UI.escapeHtml(val) : "Not Recorded";

      return `
        <div class="clinical-field-card ${!hasValue ? 'is-empty' : ''}">
          <div class="field-name">${UI.escapeHtml(field.key)}</div>
          <div class="field-label">${UI.escapeHtml(field.label)}</div>
          <div class="field-value ${!hasValue ? 'null-val' : ''}">${displayVal}</div>
          <div class="field-badge-group mt-2">
            <span class="badge badge-neutral text-xs">${UI.escapeHtml(field.categoryLabel)}</span>
            <span class="badge ${hasValue ? 'badge-success' : 'badge-neutral'} text-xs">${hasValue ? 'Recorded' : 'Not Recorded'}</span>
          </div>
        </div>
      `;
    }).join("");
  },

  /* --------------------------------------------------------------------------
     C. TAB 3: AI MODEL SIMULATOR & SCENARIOS
     -------------------------------------------------------------------------- */
  applyScenario(type) {
    const sStay = document.getElementById("slider-stay");
    const sInpatient = document.getElementById("slider-inpatient");
    const sMeds = document.getElementById("slider-meds");
    const sDiag = document.getElementById("slider-diag");
    const badge = document.getElementById("sim-scenario-badge");

    if (type === "severe") {
      if (sStay) sStay.value = 7;
      if (sInpatient) sInpatient.value = 3;
      if (sMeds) sMeds.value = 21;
      if (sDiag) sDiag.value = 9;
      if (badge) badge.textContent = "Scenario: High Risk (#85504905)";
    } else if (type === "moderate") {
      if (sStay) sStay.value = 3;
      if (sInpatient) sInpatient.value = 1;
      if (sMeds) sMeds.value = 14;
      if (sDiag) sDiag.value = 6;
      if (badge) badge.textContent = "Scenario: Borderline (#55629189)";
    } else if (type === "optimal") {
      if (sStay) sStay.value = 1;
      if (sInpatient) sInpatient.value = 0;
      if (sMeds) sMeds.value = 7;
      if (sDiag) sDiag.value = 3;
      if (badge) badge.textContent = "Scenario: Low Risk (#8222157)";
    }

    this.updateSimulator();
  },

  resetSimulator() {
    const sStay = document.getElementById("slider-stay");
    const sInpatient = document.getElementById("slider-inpatient");
    const sMeds = document.getElementById("slider-meds");
    const sDiag = document.getElementById("slider-diag");
    const badge = document.getElementById("sim-scenario-badge");

    if (sStay) sStay.value = 4;
    if (sInpatient) sInpatient.value = 1;
    if (sMeds) sMeds.value = 15;
    if (sDiag) sDiag.value = 6;
    if (badge) badge.textContent = "Active Case: Standard";

    this.updateSimulator();
  },

  updateSimulator() {
    const stay = parseInt(document.getElementById("slider-stay")?.value || 4, 10);
    const inpatient = parseInt(document.getElementById("slider-inpatient")?.value || 1, 10);
    const meds = parseInt(document.getElementById("slider-meds")?.value || 15, 10);
    const diag = parseInt(document.getElementById("slider-diag")?.value || 6, 10);

    // Update labels
    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setText("val-stay", `${stay} ${stay === 1 ? 'Day' : 'Days'}`);
    setText("val-inpatient", `${inpatient} ${inpatient === 1 ? 'Admission' : 'Admissions'}`);
    setText("val-meds", `${meds} Medications`);
    setText("val-diag", `${diag} Diagnoses`);

    // Calibrated simulation aligned with the trained Random Forest feature importances
    // Inpatient (importance ~6%), Stay (~3.7%), Meds (~3.1%), Diag (~2.5%)
    let baseRisk = 18.0;
    baseRisk += inpatient * 11.5;   // Strongest utilization driver
    baseRisk += (stay - 1) * 2.8;   // Length of stay effect
    baseRisk += (meds - 5) * 0.45;  // Medication burden
    baseRisk += (diag - 3) * 1.4;   // Diagnostic complexity

    // Clamp risk between 8% and 92%
    const computedScore = Math.min(92.0, Math.max(8.0, baseRisk));
    const scoreVal = round(computedScore, 1);
    const isHigh = scoreVal >= 46.0;

    // Update UI elements
    const scoreDisplay = document.getElementById("sim-score-display");
    if (scoreDisplay) scoreDisplay.innerHTML = `${scoreVal}<span class="text-sm text-muted"> / 100</span>`;

    const meterBar = document.getElementById("sim-meter-bar");
    if (meterBar) meterBar.style.width = `${scoreVal}%`;

    const statusBadge = document.getElementById("sim-status-badge");
    if (statusBadge) {
      statusBadge.className = `badge ${isHigh ? 'badge-danger' : 'badge-success'} text-sm font-bold`;
      statusBadge.textContent = isHigh ? "HIGH RISK" : "LOW RISK";
    }

    const priorityText = document.getElementById("sim-priority-text");
    const guidanceText = document.getElementById("sim-guidance-text");
    const guidanceBox = document.getElementById("sim-guidance-box");

    if (isHigh) {
      if (guidanceBox) guidanceBox.className = "alert alert-danger mt-4";
      if (priorityText) priorityText.textContent = "Priority: High (Post-Discharge Follow-up within 7 Days)";
      if (guidanceText) {
        guidanceText.textContent = `Simulated risk score (${scoreVal}%) exceeds the 0.46 decision threshold. Increased prior admissions (${inpatient}) and extended stay (${stay}d) drive clinical readmission risk. Recommend early follow-up call within 72 hours.`;
      }
    } else {
      if (guidanceBox) guidanceBox.className = "alert alert-info mt-4";
      if (priorityText) priorityText.textContent = "Priority: Standard (Routine Outpatient Review)";
      if (guidanceText) {
        guidanceText.textContent = `Simulated risk score (${scoreVal}%) is within the safe range below the 0.46 decision threshold. Standard outpatient discharge instructions and routine diabetic care recommended.`;
      }
    }
  },

  /* --------------------------------------------------------------------------
     D. TAB 4: SQL DATABASE AUDIT TRAIL LOGIC (Modern Clinical Dashboard)
     -------------------------------------------------------------------------- */
  auditRecords: [],
  filteredAuditRecords: [],
  auditPage: 1,
  auditPageSize: 8,

  /**
   * Formats any UTC timestamp string into formatted Indian Standard Time (IST).
   * Example: '27 Nov 2026, 10:27:21 AM IST'
   */
  formatTimestampIST(rawTs, backendIst) {
    if (backendIst && typeof backendIst === "string" && backendIst.includes("IST")) {
      return backendIst;
    }
    if (!rawTs) return "-";
    try {
      let iso = String(rawTs).trim();
      if (!iso.includes("T")) iso = iso.replace(" ", "T");
      if (!iso.endsWith("Z") && !iso.includes("+")) iso += "Z";
      const d = new Date(iso);
      if (isNaN(d.getTime())) return String(rawTs);

      const parts = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(d);

      return `${parts} IST`;
    } catch (e) {
      return String(rawTs);
    }
  },

  async refreshAuditTrail(showToast = true) {
    const spinner = document.getElementById("refresh-spinner");
    if (spinner) spinner.classList.add("spinning");

    try {
      const res = await ApiService.getAuditTrail();
      if (res && res.status === "success") {
        this.auditRecords = res.records || [];
        this.renderAuditSummary(res.summary);

        // Update Model Metadata dynamically in specs card & footer
        if (res.model_info) {
          const modelName = res.model_info.model_name || "Random Forest Classifier (Ensemble Pipeline)";
          const specModelEl = document.getElementById("audit-spec-model-name");
          if (specModelEl) specModelEl.textContent = modelName;

          const footerModelEl = document.getElementById("footer-model-name");
          if (footerModelEl) footerModelEl.textContent = `Model: ${modelName}`;
        }

        this.filterAuditTable();

        if (showToast) {
          UI.toast("Audit Trail Synchronized", `Successfully queried ${this.auditRecords.length} records from SQLite`, "info");
        }
      }
    } catch (err) {
      console.warn("Audit trail sync warning:", err);
      const tbody = document.getElementById("audit-table-body");
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-8 text-danger">
              <strong>Database Connection Notice:</strong> ${UI.escapeHtml(err.message)}
            </td>
          </tr>
        `;
      }
    } finally {
      if (spinner) {
        setTimeout(() => spinner.classList.remove("spinning"), 400);
      }
    }
  },

  renderAuditSummary(summary) {
    if (!summary) return;
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText("audit-total-count", summary.total_records || 0);
    setText("audit-high-count", summary.high_risk_count || 0);
    setText("audit-low-count", summary.low_risk_count || 0);
    setText("audit-avg-risk", `${Number(summary.average_risk_percentage || 0).toFixed(1)}%`);
  },

  filterAuditTable() {
    const searchVal = document.getElementById("audit-search-input")?.value.trim().toLowerCase() || "";
    const statusVal = document.getElementById("audit-status-filter")?.value || "all";
    const sortVal = document.getElementById("audit-sort-order")?.value || "newest";

    let filtered = [...this.auditRecords];

    // Filter by Patient ID search
    if (searchVal) {
      filtered = filtered.filter(r => String(r.patient_id).includes(searchVal));
    }

    // Filter by Risk Category
    if (statusVal !== "all") {
      filtered = filtered.filter(r => r.risk_status && r.risk_status.toLowerCase() === statusVal.toLowerCase());
    }

    // Apply Sorting
    if (sortVal === "oldest") {
      filtered.sort((a, b) => a.id - b.id);
    } else if (sortVal === "risk-desc") {
      filtered.sort((a, b) => (parseFloat(b.risk_percentage) || 0) - (parseFloat(a.risk_percentage) || 0));
    } else if (sortVal === "risk-asc") {
      filtered.sort((a, b) => (parseFloat(a.risk_percentage) || 0) - (parseFloat(b.risk_percentage) || 0));
    } else {
      // Default: newest first
      filtered.sort((a, b) => b.id - a.id);
    }

    this.filteredAuditRecords = filtered;
    this.auditPage = 1; // Reset to page 1 on filter/sort change
    this.renderAuditTableCurrentPage();
  },

  resetAuditFilters() {
    const searchInput = document.getElementById("audit-search-input");
    const statusSelect = document.getElementById("audit-status-filter");
    const sortSelect = document.getElementById("audit-sort-order");

    if (searchInput) searchInput.value = "";
    if (statusSelect) statusSelect.value = "all";
    if (sortSelect) sortSelect.value = "newest";

    this.filterAuditTable();
    UI.toast("Filters Cleared", "Displaying all audit records sorted by newest.", "info");
  },

  renderAuditTableCurrentPage() {
    const tbody = document.getElementById("audit-table-body");
    const countBadge = document.getElementById("audit-table-count");
    if (!tbody) return;

    const totalCount = this.filteredAuditRecords.length;
    if (countBadge) countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'Record' : 'Records'}`;

    if (totalCount === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-muted">
            <div class="empty-state-icon mb-2">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <p class="font-bold text-sm">No Matching Audit Records Found</p>
            <p class="text-xs text-muted mt-1">Try clearing your filters or search for another Patient ID.</p>
          </td>
        </tr>
      `;
      this.renderAuditPagination(0, 0, 0);
      return;
    }

    // Pagination calculations
    const startIndex = (this.auditPage - 1) * this.auditPageSize;
    const endIndex = Math.min(startIndex + this.auditPageSize, totalCount);
    const pageRecords = this.filteredAuditRecords.slice(startIndex, endIndex);

    tbody.innerHTML = pageRecords.map(r => {
      const isHigh = r.risk_status && r.risk_status.toLowerCase() === "high";
      const predId = r.prediction_id || `PRED_${String(r.id).padStart(4, '0')}`;
      const pct = parseFloat(r.risk_percentage) || 0;
      const istTime = this.formatTimestampIST(r.searched_at, r.searched_at_ist);

      return `
        <tr>
          <td><strong class="pred-id-mono">${UI.escapeHtml(predId)}</strong></td>
          <td>
            <a href="javascript:void(0)" class="patient-id-link" onclick="MediApp.loadPatient(${r.patient_id})" title="Click to load Patient #${r.patient_id}">
              #${r.patient_id}
            </a>
          </td>
          <td>
            <div class="flex items-center gap-2">
              <span class="font-bold" style="min-width: 52px;">${pct.toFixed(2)}%</span>
              <div class="audit-risk-bar">
                <div class="audit-risk-fill ${isHigh ? 'fill-danger' : 'fill-teal'}" style="width: ${Math.min(100, pct)}%;"></div>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${isHigh ? 'badge-high-subtle' : 'badge-low-subtle'}">
              <span class="status-dot-indicator ${isHigh ? 'dot-high' : 'dot-low'}"></span>
              ${isHigh ? 'High Risk' : 'Low Risk'}
            </span>
          </td>
          <td>
            <span class="audit-timestamp-text">${UI.escapeHtml(istTime)}</span>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="MediApp.loadPatient(${r.patient_id})" title="Inspect full clinical dossier">
              Inspect &rarr;
            </button>
          </td>
        </tr>
      `;
    }).join("");

    this.renderAuditPagination(startIndex + 1, endIndex, totalCount);
  },

  renderAuditPagination(start, end, total) {
    const infoEl = document.getElementById("audit-pagination-info");
    const btnsEl = document.getElementById("audit-pagination-btns");

    if (infoEl) {
      if (total === 0) {
        infoEl.textContent = "No records to display";
      } else {
        infoEl.textContent = `Showing ${start}–${end} of ${total} records`;
      }
    }

    if (!btnsEl) return;
    if (total === 0) {
      btnsEl.innerHTML = "";
      return;
    }

    const totalPages = Math.ceil(total / this.auditPageSize);
    let html = `
      <button type="button" class="pagination-btn" ${this.auditPage <= 1 ? 'disabled' : ''} onclick="MediApp.goToAuditPage(${this.auditPage - 1})">
        &larr; Prev
      </button>
    `;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= this.auditPage - 1 && p <= this.auditPage + 1)) {
        html += `
          <button type="button" class="pagination-btn ${p === this.auditPage ? 'active' : ''}" onclick="MediApp.goToAuditPage(${p})">
            ${p}
          </button>
        `;
      } else if (p === this.auditPage - 2 || p === this.auditPage + 2) {
        html += `<span class="text-xs text-muted">...</span>`;
      }
    }

    html += `
      <button type="button" class="pagination-btn" ${this.auditPage >= totalPages ? 'disabled' : ''} onclick="MediApp.goToAuditPage(${this.auditPage + 1})">
        Next &rarr;
      </button>
    `;

    btnsEl.innerHTML = html;
  },

  goToAuditPage(page) {
    const totalPages = Math.ceil(this.filteredAuditRecords.length / this.auditPageSize);
    if (page < 1 || page > totalPages) return;
    this.auditPage = page;
    this.renderAuditTableCurrentPage();
  },

  exportAuditCSV() {
    if (!this.auditRecords || this.auditRecords.length === 0) {
      UI.toast("Export Notice", "No audit records available in SQLite database to export.", "warning");
      return;
    }

    const headers = ["Prediction ID", "Patient ID", "Risk Percentage", "Risk Status", "Timestamp (IST)", "Timestamp (UTC)"];
    const rows = this.auditRecords.map(r => {
      const predId = r.prediction_id || `PRED_${String(r.id).padStart(4, '0')}`;
      const istTime = this.formatTimestampIST(r.searched_at, r.searched_at_ist);
      return [
        predId,
        r.patient_id,
        r.risk_percentage,
        r.risk_status,
        `"${istTime}"`,
        `"${r.searched_at}"`
      ];
    });

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `medipredict_audit_trail_ist_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UI.toast("CSV Exported", `Exported ${this.auditRecords.length} audit records formatted in IST.`, "success");
  }
};

function round(num, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/* ------------------------------------------------------------------------------
   6. GLOBAL INITIALIZATION
   ------------------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  MediApp.init();
});
