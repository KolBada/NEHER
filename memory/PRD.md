# NeuroVoltage - Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

## User Personas
- Electrophysiology researchers analyzing cardiac recordings
- Lab technicians processing WinLTP/Digidata ABF data
- Cardiac scientists studying HRV and light stimulation responses

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui + Recharts
- **Backend**: FastAPI + pyABF + NumPy/SciPy
- **Database**: MongoDB (metadata only, files temporary)
- **Export**: openpyxl (XLSX), matplotlib (PDF)

## Core Requirements
1. ABF file upload (single/multiple)
2. Automatic beat detection with adjustable parameters
3. Manual beat add/delete by clicking
4. Beat validation → NN/BF computation
5. Artifact filtering (local median, configurable strictness)
6. Spontaneous HRV analysis (sliding 3-min windows, RMSSD70, SDNN, pNN50)
7. Light stimulation mode (pulse detection, per-pulse HRV)
8. Light response metrics (peak BF, slope, amplitude)
9. Export: CSV, XLSX, PDF with representative graphs
10. Recording metadata (name, drug used)

## What's Been Implemented (Feb 2026 Update)

### Core Features
- [x] ABF file upload with pyABF parsing (multi-sweep support)
- [x] Min-max trace decimation for efficient display
- [x] Auto beat detection using scipy.signal.find_peaks with bandpass filter
- [x] Detection parameter controls (threshold, min distance, prominence, invert)
- [x] Manual beat editing (click to add/remove with visual selection)
- [x] Beat validation → NN intervals, beat frequency computation

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
- [x] Baseline readout displayed alongside readout values

### Light Stimulation
- [x] **Enable/disable toggle** for light stimulation analysis
- [x] Light stimulation mode with configurable pulses (start, duration, intervals)
- [x] Improved auto-detection algorithm (finds BF rise above baseline)
- [x] **BPM vs time chart with pulse region highlighting**
- [x] Light-induced HRV (per-pulse + median across pulses)
- [x] **Enhanced light response metrics**: n_beats, avg_bf, avg_nn, nn_70
- [x] Response metrics using BPM: peak BF, normalized peak, time to peak, slope, amplitude
- [x] HRV metrics using NN₇₀ normalization
- [x] **Amplitude calculation**: peak BF - last beat before drop (not baseline)

### Recording Metadata
- [x] **Recording name input field**
- [x] **Drug used dropdown** (None, Isoproterenol, Carbachol, Propranolol, Atropine, Other)

### UI/UX
- [x] Interactive trace viewer with Recharts (zoom via Brush, beat markers)
- [x] Dark scientific UI theme (Manrope/Inter/JetBrains Mono fonts)
- [x] Time axes in minutes throughout
- [x] Per-beat data table with filter status
- [x] File selector for multi-file support

### Export
- [x] **Improved XLSX export** with styled headers, multiple sheets (Summary, Per-Beat, Per-Minute, HRV Windows, Light metrics)
- [x] **Improved PDF report** with title page, recording info, colored charts, styled tables
- [x] Recording name and drug included in exports

## Prioritized Backlog

### P0 (Completed)
All core workflow features implemented and tested.

### P1 (Next)
- Drug workflow support (baseline → light → drug → stabilization → on-drug)
- Propranolol (12 min) and Nepicastat (42 min) stabilization
- Cohort-normalized beat frequency
- Merged multi-file analysis

### P2 (Enhancement)
- Drag-to-adjust light pulse boundaries (movable epoch selection)
- Drag-to-select time regions for custom analysis
- Configurable artifact filter window size (currently 5)
- Session persistence (save/load analysis state)
- Batch processing mode

## API Endpoints
- `POST /api/upload` - Upload ABF files
- `POST /api/detect-beats` - Re-detect beats with parameters
- `POST /api/compute-metrics` - Compute NN/BF with configurable filter
- `POST /api/hrv-analysis` - HRV with configurable baseline
- `POST /api/per-minute-metrics` - Per-minute averages
- `POST /api/light-detect` - Detect light pulses
- `POST /api/light-hrv` - Per-pulse HRV
- `POST /api/light-response` - Response metrics (enhanced)
- `POST /api/export/csv` - CSV export
- `POST /api/export/xlsx` - Styled XLSX export
- `POST /api/export/pdf` - PDF report

## Key Files
- `/app/backend/server.py` - FastAPI routes
- `/app/backend/analysis.py` - Scientific computations
- `/app/frontend/src/App.js` - Main React component
- `/app/frontend/src/components/` - UI components
