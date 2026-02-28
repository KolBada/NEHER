# NeuCarS - Cardiac Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui + Recharts
- **Backend**: FastAPI + pyABF + NumPy/SciPy
- **Export**: openpyxl (XLSX), matplotlib (PDF)

## What's Been Implemented (Dec 2025)

### Core Features
- [x] ABF file upload with pyABF parsing
- [x] Auto beat detection with configurable threshold (visible on trace)
- [x] Manual beat editing - click to add, click markers to remove
- [x] Beat validation → NN intervals, beat frequency computation

### Baseline Settings (Simplified)
- [x] **HRV readout at minute 0** (uses 0-3min window for 3-min HRV)
- [x] **BF readout at minute 1** (uses 1-2min for mean BF)
- [x] Single minute input controls with window badges showing the range used

### HRV Analysis
- [x] Rolling 3-minute HRV with overlapping windows
- [x] HRV metrics: ln(RMSSD₇₀), RMSSD₇₀, SDNN, pNN50 (normalized to 70 bpm)
- [x] Per-minute table aligns with baseline at corresponding minutes
- [x] Drug readout: Base + PerfusionStart + PerfusionTime calculation

### Light Stimulation HRV (Fixed Algorithm)
- [x] **For each stimulus, isolate NN intervals**
- [x] **Calculate median_nn_isolated from the isolated data**
- [x] **Scale to 857ms (70bpm) to get NN_70 for that stimulus**
- [x] **Calculate RMSSD, SDNN, pNN50 from isolated NN_70**
- [x] **Return median across all stimulations for final metrics**
- [x] Returns n_pulses_valid count in final metrics

### Charts & Visualization
- [x] **Light pulse highlights on ALL traces** (main trace, BF chart, NN chart, Light Stim chart)
- [x] **Trackpad/wheel zoom (Ctrl+Scroll)** on all charts in Analysis section
- [x] **Zoom In/Out/Reset buttons** on charts
- [x] Threshold visible as dashed amber line on main trace

### Export (CELL Magazine Style)
- [x] PDF excludes filtered/artifact beats from charts
- [x] Light stim zones highlighted on PDF charts
- [x] Fixed Y-axis scales: LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300
- [x] CELL magazine style formatting

## Backend API Changes (Current)

### HRVAnalysisRequest Parameters
```python
baseline_hrv_minute: int = 0  # HRV readout at this minute (uses 3-min window)
baseline_bf_minute: int = 1   # BF readout at this minute
```

### compute_light_hrv Algorithm
```python
# For each pulse:
1. Isolate NN intervals within stimulus time window
2. Calculate median_nn_isolated = median(nn_valid)
3. nn_70_isolated = nn_valid * (857.0 / median_nn_isolated)
4. Calculate HRV metrics from nn_70_isolated
5. Store per_pulse metrics including median_nn_isolated

# Final metrics:
- Take median across all valid pulses for RMSSD, SDNN, pNN50
- Return n_pulses_valid count
```

## Prioritized Backlog

### P0 - Completed ✅
All core workflow features implemented and tested.

### P1 - Completed ✅
- Baseline simplified to single minute readouts
- Light HRV algorithm fixed (isolated NN_70 per stimulus)
- Light pulse highlights on all charts
- Zoom controls on all charts

### P2 (Future)
- [ ] Save/Load analysis state functionality
- [ ] Cohort normalization
- [ ] Batch processing mode

## API Endpoints
- `POST /api/upload` - Upload ABF files
- `POST /api/detect-beats` - Re-detect beats with parameters
- `POST /api/compute-metrics` - Compute NN/BF with configurable filter
- `POST /api/hrv-analysis` - HRV with baseline_hrv_minute, baseline_bf_minute
- `POST /api/per-minute-metrics` - Per-minute averages
- `POST /api/light-detect` - Detect light pulses
- `POST /api/light-hrv` - Per-pulse HRV (isolated NN_70)
- `POST /api/light-response` - HRA metrics
- `POST /api/export/pdf` - CELL-style PDF with light zones
- `POST /api/export/xlsx` - CELL-style XLSX

## Key Files
- `/app/backend/analysis.py` - Scientific computations including fixed light HRV
- `/app/backend/server.py` - FastAPI routes
- `/app/frontend/src/components/AnalysisPanel.js` - HRV with zoom and light highlights
- `/app/frontend/src/components/LightPanel.js` - Light Induced HRA
- `/app/frontend/src/components/TraceViewer.js` - Main trace with threshold

## Test Reports
- `/app/test_reports/iteration_9.json` - Latest (100% pass, 48 backend tests)
