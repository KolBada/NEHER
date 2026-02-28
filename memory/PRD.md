# NeuCarS - Cardiac Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui + Recharts
- **Backend**: FastAPI + pyABF + NumPy/SciPy
- **Export**: openpyxl (XLSX), matplotlib (PDF)

## What's Been Implemented (Feb 2026)

### Core Features
- [x] ABF file upload with pyABF parsing
- [x] Auto beat detection with configurable threshold (visible on trace)
- [x] Manual beat editing - click to add, click markers to remove
- [x] Beat validation → NN intervals, beat frequency computation
- [x] Artifact filtering

### UI Changes (Feb 28, 2026)
- [x] **Renamed "Analysis" tab to "Spontaneous Activity"**
- [x] Spontaneous activity logic unchanged

### Baseline Settings (Updated Feb 28, 2026)
- [x] **HRV baseline**: From sliding 3-min window where WindowStart = 0 (direct reference, no recomputation)
- [x] **BF baseline**: mean(BF_k,filt) for 1.0 ≤ t_k < 2.0 min
- [x] HRV baseline guaranteed to be numerically identical to sliding HRV table value

### HRV Analysis (Spontaneous Activity)
- [x] Rolling 3-minute HRV with overlapping windows
- [x] HRV metrics: ln(RMSSD₇₀), RMSSD₇₀, SDNN, pNN50 (normalized to 70 bpm)
- [x] Drug readout: Base + PerfusionStart + PerfusionTime calculation

### Light Stimulation Module (Updated Feb 28, 2026)

#### Configuration
- User provides: Approx first stim start (~3 min default), pulse duration (20s or 30s), intervals (60, 30, 20, 10s)
- Detects 5 stimulation epochs
- Manual boundary adjustment supported

#### Per-Stim Metrics (HRA - Heart Rate Adaptation)
For each stim j with window [S_j, E_j]:
- **Baseline BF**: mean(BF_k,filt) in [S_j - 1 min, S_j)
- **PeakBF_j**: max(BF_k,filt) within stim
- **TimeToPeak_j**: (t_peak_j - S_j) × 60 seconds
- **PeakBF_norm_j**: 100 × PeakBF_j / BF_base_j (%)
- **Amplitude_j**: PeakBF_j - BF_end_j (where BF_end_j = last beat INSIDE stim, NOT baseline)
- **RateOfChange_j**: (slope b) / BF_mean_j (1/min, normalized)

#### Light-Induced HRV (Updated Algorithm - VERIFIED)
For each stim j:
1. NN_k,filt = 60000 / BF_k,filt
2. **NN_k,70 = NN_k,filt × (857 / median(NN_k,filt within THIS stim))**
   - Each stim uses its OWN median NN as reference
3. Compute RMSSD_j, SDNN_j, pNN50_j from normalized NN_70

Aggregate:
- RMSSD70,win_light = median(RMSSD_j)
- HRV_light = ln(RMSSD70,win_light)
- SDNN_light = median(SDNN_j)
- pNN50_light = median(pNN50_j)

**Algorithm Verified**: Tested against F18 Excel data - all 5 stims match expected values exactly when using same input data.

### Charts & Visualization
- [x] Light pulse highlights on ALL traces
- [x] Trackpad/wheel zoom (Ctrl+Scroll) on all charts
- [x] Zoom In/Out/Reset buttons on charts
- [x] Threshold visible as dashed amber line

### Export (CELL Magazine Style)
- [x] PDF excludes filtered/artifact beats from charts
- [x] Light stim zones highlighted on PDF charts
- [x] Fixed Y-axis scales: LN(RMSSD): 0-8, pNN50: 0-100, SDNN/RMSSD: 0-300
- [x] One Excel file per recording (not combined)

## Backend API

### compute_light_hrv Algorithm (Feb 28, 2026)
```python
def compute_light_hrv(beat_times_min_list, bf_filtered_list, pulses):
    # For each pulse:
    # 1. Extract NN values within pulse time window
    # 2. median_nn_stim = median(NN within this stim only)
    # 3. nn_70 = nn * (857.0 / median_nn_stim)
    # 4. Compute RMSSD, SDNN, pNN50 from nn_70
    
    # Final = median across 5 stims
```

### compute_baseline_metrics (Feb 28, 2026)
```python
def compute_baseline_metrics(beat_times_min_list, bf_filtered_list, 
                            hrv_windows=None, hrv_minute=0, bf_minute=1):
    # HRV: Direct lookup from pre-computed hrv_windows where minute=hrv_minute
    #      NO recomputation - ensures numerical equality
    # BF: mean(BF_k,filt) for bf_minute <= t < bf_minute+1
```

### compute_light_response_v2 (Feb 28, 2026)
```python
def compute_light_response_v2(beat_times_min_list, bf_filtered_list, pulses):
    # For each stim:
    #   - Baseline: [S_j - 1min, S_j)
    #   - PeakBF, TimeToPeak, PeakNorm%
    #   - Amplitude = PeakBF - last BF inside stim
    #   - RateOfChange = slope / BF_mean (1/min)
```

## Prioritized Backlog

### P0 - Completed ✅
- All core workflow features implemented
- Light stim HRV algorithm verified against Excel

### P1 - In Progress
- [ ] Match Excel export format exactly to Results.xlsx template
- [ ] Light stim highlights on LightPanel trace (code present, needs verification)

### P2 (Future)
- [ ] Synchronized zoom across all charts
- [ ] Save/Load analysis state functionality
- [ ] Cohort normalization
- [ ] Batch processing mode

## Test Files Provided
- `/app/4D030006.abf`, `4D030007.abf`, `4D030008.abf`
- `/app/55140001.abf`, `55140002.abf`, `55140003.abf` (F18 recordings)
- `/app/Results.xlsx` - Expected output format
- `/app/CPVT_NeuCars_Light_Ruxolitinib.xlsx` - Excel with formulas (F18)

## Key Files
- `/app/backend/analysis.py` - Scientific computations
- `/app/backend/server.py` - FastAPI routes
- `/app/frontend/src/App.js` - Main component (tab renamed to "Spontaneous Activity")
- `/app/frontend/src/components/AnalysisPanel.js` - Spontaneous Activity panel
- `/app/frontend/src/components/LightPanel.js` - Light Stimulation analysis

## Test Reports
- `/app/test_reports/iteration_9.json` - Previous (100% pass)
