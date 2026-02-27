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

## What's Been Implemented (Latest Update - Dec 2025)

### Core Features
- [x] ABF file upload with pyABF parsing (multi-sweep support)
- [x] Min-max trace decimation for efficient display
- [x] Auto beat detection using scipy.signal.find_peaks with bandpass filter
- [x] Detection parameter controls (threshold, min distance, prominence, invert)
- [x] Manual beat editing (click to add/remove with visual selection)
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

### Artifact Filtering
- [x] **Configurable artifact filter strictness** (default 50-200% of local median)
- [x] UI sliders for lower/upper bounds
- [x] Preset buttons (Default 50-200%, Strict 70-150%, Loose 30-250%)

### HRV Analysis
- [x] Spontaneous HRV analysis (sliding 3-min windows)
- [x] HRV metrics: ln(RMSSD₇₀), SDNN₇₀, pNN50₇₀, mean BF
- [x] 70 bpm normalization (857ms reference)
- [x] Per-minute metrics table with clear 3-min window labeling
- [x] **Configurable baseline metrics** (HRV 0-3min, BF 1-2min defaults)
- [x] **Separate HRV and BF readout controls** with enable/disable checkboxes
- [x] Baseline readout prominently displayed, drug readout smaller on right
- [x] **Popover info tooltips** for SDNN, RMSSD, pNN50 explaining 3-min window

### Light Stimulation (Light Induced HRA)
- [x] **Enable/disable toggle** for light stimulation analysis
- [x] Light stimulation mode with configurable pulses (start, duration, intervals)
- [x] Improved auto-detection algorithm (finds BF rise above baseline)
- [x] **BPM vs time chart with min:sec X-axis formatting**
- [x] **Light pulse highlights on main trace** with "Stim N" labels
- [x] **Beat-by-beat pulse adjustment** (+1/-1 beat buttons)
- [x] **±5s coarse adjustment** buttons
- [x] **Cascade to future pulses** - moving one pulse shifts all following
- [x] Per-stim metrics: Beats, BF, NN, NN₇₀, peak BF, amplitude, slope

### Recording Metadata & Drug Configuration
- [x] **Recording name input field**
- [x] **Drug configuration with 5 predefined options + Other**
- [x] **Editable drug concentrations in µM**
- [x] **Multiple drug selection** with checkboxes
- [x] **Independent perfusion settings per drug** (start and time)
- [x] **Multiple "Other" drugs** can be added with custom names

### UI/UX
- [x] **App named NeuCarS**
- [x] Interactive trace viewer with Recharts
- [x] **Zoom via Brush with Reset Zoom button** (FIXED)
- [x] Dark scientific UI theme (Manrope/Inter/JetBrains Mono fonts)
- [x] Time axes in minutes throughout

### Export
- [x] **Improved XLSX export** with styled headers, multiple sheets
- [x] **Improved PDF report** with title page, recording info, colored charts
- [x] Recording name and drug info included in exports

## Prioritized Backlog

### P0 (Completed)
All core workflow features implemented and tested.

### P1 (Next - Export Enhancement)
- [ ] Graphs in exports should not include filtered-out/artifact beats
- [ ] Fixed Y-axis scales (LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300)
- [ ] "CELL magazine style" export formatting

### P2 (Enhancement)
- [ ] Drug workflow support with automated readout calculations
- [ ] Cohort-normalized beat frequency
- [ ] Drag-to-adjust light pulse boundaries
- [ ] Session persistence (save/load analysis state)
- [ ] Batch processing mode

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
- `POST /api/export/xlsx` - Styled XLSX export
- `POST /api/export/pdf` - PDF report

## Key Files
- `/app/backend/server.py` - FastAPI routes
- `/app/backend/analysis.py` - Scientific computations (8-step workflow)
- `/app/frontend/src/App.js` - Main React component with drug config
- `/app/frontend/src/components/LightPanel.js` - Light Induced HRA
- `/app/frontend/src/components/AnalysisPanel.js` - HRV with baseline
- `/app/frontend/src/components/TraceViewer.js` - Trace with zoom fix

## Test Reports
- `/app/test_reports/iteration_6.json` - Latest test results (100% pass rate)
