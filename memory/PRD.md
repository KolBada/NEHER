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
- [x] Single minute input controls with window badges

### HRV Analysis
- [x] Rolling 3-minute HRV with overlapping windows
- [x] HRV metrics: ln(RMSSD₇₀), RMSSD₇₀, SDNN, pNN50 (normalized to 70 bpm)
- [x] Drug readout: Base + PerfusionStart + PerfusionTime calculation

### Light Stimulation HRV (Fixed Algorithm)
- [x] **Isolate NN intervals per stimulus**
- [x] **Calculate median_nn_isolated from isolated data**
- [x] **Scale to 857ms (70bpm) to get NN_70 for that stimulus**
- [x] **Calculate RMSSD, SDNN, pNN50 from isolated NN_70**
- [x] **Return median across all stimulations**

### Charts & Visualization
- [x] **Light pulse highlights on ALL traces** (main trace, BF chart, NN chart, Light Stim chart)
- [x] **Trackpad/wheel zoom (Ctrl+Scroll)** on all charts
- [x] **Zoom In/Out/Reset buttons** on charts
- [x] Threshold visible as dashed amber line

### Export (CELL Magazine Style)
- [x] PDF excludes filtered/artifact beats from charts
- [x] Light stim zones highlighted on PDF charts
- [x] Fixed Y-axis scales: LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300
- [x] One Excel file per recording (not combined)

## Backend API

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

### compute_baseline_metrics
```python
def compute_baseline_metrics(beat_times_min_list, bf_filtered_list, hrv_minute=0, bf_minute=1):
    # HRV: uses 3-min window starting at hrv_minute
    # BF: uses 1-min window at bf_minute
```

## Prioritized Backlog

### P0 - Completed ✅
All core workflow features implemented.

### P1 - In Progress
- [ ] Match Excel export format exactly to provided Results.xlsx template
- [ ] Ensure analysis values match expected results from test files

### P2 (Future)
- [ ] Save/Load analysis state functionality
- [ ] Cohort normalization
- [ ] Batch processing mode

## Test Files Provided
- `/tmp/4D030006.abf`
- `/tmp/4D030007.abf`
- `/tmp/4D030008.abf`
- `/tmp/Results.xlsx` - Expected output format

## Key Files
- `/app/backend/analysis.py` - Scientific computations
- `/app/backend/server.py` - FastAPI routes
- `/app/frontend/src/components/AnalysisPanel.js` - HRV with zoom and light highlights
- `/app/frontend/src/components/LightPanel.js` - Light Induced HRA

## Test Reports
- `/app/test_reports/iteration_9.json` - Latest (100% pass)
