# NeuCarS - Cardiac Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

## User Personas
- Electrophysiology researchers analyzing cardiac organoid recordings
- Lab technicians processing WinLTP/Digidata ABF data
- Cardiac scientists studying HRV and light stimulation responses

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui + Recharts
- **Backend**: FastAPI + pyABF + NumPy/SciPy
- **Database**: MongoDB (metadata only, files temporary)
- **Export**: openpyxl (XLSX), matplotlib (PDF)

## What's Been Implemented (Dec 2025)

### Core Features
- [x] ABF file upload with pyABF parsing (multi-sweep support)
- [x] Min-max trace decimation for efficient display
- [x] Auto beat detection using scipy.signal.find_peaks with bandpass filter
- [x] Detection parameter controls (threshold, min distance, prominence, invert)
- [x] **Manual beat editing - click to add beats, click markers to remove**
- [x] Beat validation → NN intervals, beat frequency computation

### Backend Analysis (8-Step Scientific Workflow)
- [x] Step 1: Beat Frequency Cleaning with Local Median Filter
- [x] Step 2: Conversion to NN Intervals (BF to NN)
- [x] Step 3: Short Time-Bin Normalization (30-second windows to 70 bpm)
- [x] Step 4: Per-Minute Aggregation with aligned arrays
- [x] Step 5: Rolling 3-Minute HRV with Overlapping Windows
- [x] Steps 6-7: Light Stimulation Analysis
- [x] Baseline Metrics Computation
- [x] Fixed array alignment issues (N beats vs N-1 intervals)

### Detection Panel & Threshold
- [x] **Threshold visible on trace as dashed amber line**
- [x] **Direct threshold input field (editable)**
- [x] **Prominent amber-highlighted threshold control section**
- [x] Configurable artifact filter strictness (default 50-200% of local median)
- [x] Preset buttons (Default 50-200%, Strict 70-150%, Loose 30-250%)

### Trace Viewer
- [x] **Trackpad/wheel zoom (Ctrl+Scroll to zoom)**
- [x] **Zoom In/Out buttons**
- [x] **Reset Zoom button**
- [x] Beat markers with click-to-select for deletion
- [x] Light pulse highlights with "Stim N" labels

### HRV Analysis
- [x] Spontaneous HRV analysis (sliding 3-min windows)
- [x] HRV metrics: ln(RMSSD₇₀), SDNN₇₀, pNN50₇₀, mean BF
- [x] 70 bpm normalization (857ms reference)
- [x] Per-minute metrics table with clear 3-min window labeling
- [x] **Configurable baseline metrics** (HRV 0-3min, BF 1-2min defaults)
- [x] **Baseline readout prominent, Drug readout same size when enabled**
- [x] **Drug readout with purple color theme matching baseline prominence**

### Light Stimulation (Light Induced HRA)
- [x] **Enable/disable toggle** for light stimulation analysis
- [x] **BPM vs time chart with pulse regions highlighted**
- [x] Light pulse highlights on main trace with "Stim N" labels
- [x] Beat-by-beat pulse adjustment (+1/-1 beat buttons)
- [x] ±5s coarse adjustment buttons
- [x] Cascade to future pulses - moving one pulse shifts all following

### Drug Configuration
- [x] **Drug configuration inputs now editable** (concentration, perfusion start/time)
- [x] 5 predefined drugs + "Other" option
- [x] Multiple drug selection with checkboxes
- [x] Independent perfusion settings per drug

### Export (CELL Magazine Style)
- [x] **PDF excludes filtered/artifact beats from trace charts**
- [x] **Fixed Y-axis scales**: LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300
- [x] **CELL magazine style formatting** - clean tables, proper headers
- [x] **Excel export with styled sheets** - Summary, Filtered Beat Data, Per-Minute, HRV Analysis, Light Stim
- [x] Title page with recording name, drug, timestamp
- [x] Baseline metrics summary table
- [x] Per-pulse light response table with statistics summary

## Prioritized Backlog

### P0 - Completed ✅
All core workflow features implemented and tested.

### P1 - Completed ✅
- Export enhancements with CELL magazine style
- Fixed Y-axis scales in HRV charts
- Drug readout UI consistency

### P2 (Future)
- [ ] Save/Load analysis state functionality
- [ ] Cohort normalization
- [ ] Batch processing mode
- [ ] Drag-to-adjust light pulse boundaries

## API Endpoints
- `POST /api/upload` - Upload ABF files
- `POST /api/detect-beats` - Re-detect beats with parameters
- `POST /api/compute-metrics` - Compute NN/BF with configurable filter
- `POST /api/hrv-analysis` - HRV with configurable baseline
- `POST /api/per-minute-metrics` - Per-minute averages
- `POST /api/light-detect` - Detect light pulses
- `POST /api/light-hrv` - Per-pulse HRV
- `POST /api/light-response` - HRA metrics
- `POST /api/export/csv` - CSV export
- `POST /api/export/xlsx` - CELL-style XLSX export
- `POST /api/export/pdf` - CELL-style PDF report

## Key Files
- `/app/backend/server.py` - FastAPI routes with CELL-style exports
- `/app/backend/analysis.py` - Scientific computations (8-step workflow)
- `/app/frontend/src/App.js` - Main React component with drug config
- `/app/frontend/src/components/TraceViewer.js` - Trace with threshold, zoom, beat editing
- `/app/frontend/src/components/DetectionPanel.js` - Prominent threshold control
- `/app/frontend/src/components/AnalysisPanel.js` - HRV with baseline/drug readout
- `/app/frontend/src/components/LightPanel.js` - Light Induced HRA with BPM trace

## Test Reports
- `/app/test_reports/iteration_7.json` - Latest test results (100% pass rate)
- `/app/backend/tests/test_electrophysiology_api.py` - Backend unit tests
- `/app/backend/tests/test_iteration7_features.py` - Feature validation tests
