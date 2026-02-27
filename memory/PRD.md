# NeuCarS - Cardiac Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

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
- [x] Detection parameter controls (threshold visible on trace, min distance, prominence, invert)
- [x] Manual beat editing - click to add beats, click markers to remove
- [x] Beat validation → NN intervals, beat frequency computation

### Backend Analysis (8-Step Scientific Workflow - Per Document)
- [x] **Beat Frequency Cleaning**: ±5 beat local median filter, 50-200% range
- [x] **NN Conversion**: BF to NN intervals (ms)
- [x] **Short Time-Bin Normalization**: 30-second bins, normalize to 70 bpm (857ms reference)
- [x] **Per-Minute Aggregation**: Minute-by-minute summaries
- [x] **Rolling 3-Minute HRV**: Overlapping windows, advance by 1 minute
- [x] **HRV Metrics**: SDNN, RMSSD, pNN50 (all normalized to 70 bpm)
- [x] Fixed array alignment issues (N beats vs N-1 intervals)

### Detection Panel & Threshold
- [x] **Threshold visible on trace as dashed amber line**
- [x] **Direct threshold input field (editable)**
- [x] **Prominent amber-highlighted threshold control section**
- [x] Configurable artifact filter strictness (default 50-200% of local median)

### Trace Viewer
- [x] **Trackpad/wheel zoom (Ctrl+Scroll to zoom)**
- [x] **Zoom In/Out buttons + Reset Zoom button**
- [x] Beat markers with click-to-select for deletion
- [x] Light pulse highlights with "Stim N" labels

### HRV Analysis
- [x] **Baseline HRV at minute 0** (0-3min window by default)
- [x] **Baseline BF at minute 1** (1-2min window by default)
- [x] Per-minute table aligns with baseline at corresponding minutes
- [x] **Drug readout time calculation**: Base + PerfusionStart + PerfusionTime
- [x] **Visual badge showing calculated time** (e.g., 12 + 3 + 3 → 18min)
- [x] Drug readout displays with same prominence as baseline (purple theme)

### Light Stimulation (Light Induced HRA)
- [x] **BPM trace with pulse regions highlighted**
- [x] **Pulse highlights visible on main trace AND Light Stim section**
- [x] Beat-by-beat pulse adjustment (+1/-1 beat buttons)
- [x] ±5s coarse adjustment buttons
- [x] Cascade to future pulses
- [x] Pre-light baseline: -2 to -1 min before first stimulation

### Drug Configuration
- [x] **Drug inputs editable** (concentration, perfusion start/time)
- [x] 5 predefined drugs + "Other" option
- [x] Independent perfusion settings per drug

### Export (CELL Magazine Style)
- [x] **PDF excludes filtered/artifact beats from trace charts**
- [x] **Light stim zones highlighted on PDF charts** (BF and NN plots)
- [x] **Fixed Y-axis scales**: LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300
- [x] **CELL magazine style formatting** - clean tables, proper headers
- [x] **Excel export with styled sheets** - Summary, Filtered Beat Data, Per-Minute, HRV Analysis, Light Stim

## Analysis Workflow (Per User Document)

### Beat Frequency Cleaning
- Local filtering with ±5 beat symmetric window
- Keep values within 50-200% of local median
- Replace outliers with missing

### NN Conversion
- Convert filtered BF to inter-beat intervals (ms)
- Missing BF → Missing NN

### Short Time-Bin Normalization
- 30-second bins
- Scale NN relative to bin median
- Normalize to 70 bpm reference (857ms)

### Per-Minute Aggregation
- Minute-by-minute summaries
- Ignore missing values

### Rolling 3-Minute HRV
- Overlapping 3-minute windows
- Advance by 1 minute
- Aggregate sub-windows using median

### Light Stimulation Analysis
- Isolate each stimulation epoch
- Recompute filtered BF, NN, normalized NN
- Average BF metrics across 5 stimulations
- Median HRV metrics across stimulations
- **Additional metrics**: Peak HR, Time to Peak, Rate of Change (slope)

## Prioritized Backlog

### P0 - Completed ✅
All core workflow features implemented and tested.

### P1 - Completed ✅
- Export enhancements with CELL magazine style
- Light stim zones on PDF exports
- Drug readout time calculation

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
- `POST /api/export/pdf` - CELL-style PDF with light zones

## Key Files
- `/app/backend/server.py` - FastAPI routes with CELL-style exports
- `/app/backend/analysis.py` - 8-step scientific workflow
- `/app/frontend/src/App.js` - Main React component
- `/app/frontend/src/components/TraceViewer.js` - Trace with threshold, zoom
- `/app/frontend/src/components/AnalysisPanel.js` - HRV with drug readout calculation
- `/app/frontend/src/components/LightPanel.js` - Light Induced HRA with BPM trace

## Test Reports
- `/app/test_reports/iteration_8.json` - Latest (100% pass, 37 backend tests)
