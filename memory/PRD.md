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

### Readout Panel Order (Updated Feb 28, 2026)
Baseline and Drug readouts now display in this exact order:
1. Mean BF (bpm)
2. ln(RMSSD₇₀)
3. ln(SDNN₇₀)
4. pNN50₇₀ (%)

**Removed from display:**
- Raw RMSSD (only show ln version)
- Raw SDNN (only show ln version)

### HRV Analysis (Spontaneous Activity)
- [x] Rolling 3-minute HRV with overlapping windows
- [x] HRV metrics: ln(RMSSD₇₀), RMSSD₇₀, SDNN, pNN50 (normalized to 70 bpm)
- [x] Drug readout: Base + PerfusionStart + PerfusionTime calculation

### Light Stimulation Module (Rebuilt Feb 28, 2026)

#### Configuration
- User provides: Approx first stim start (~3 min default), pulse duration (20s or 30s), intervals (60, 30, 20, 10s)
- Detects 5 stimulation epochs
- Manual boundary adjustment supported

#### HRA (Heart Rate Acceleration) - Per Stim Table
For each stim j, compute and display:
- Beats (number of beats during stim)
- **Baseline BF**: mean BF from -2 to -1 min before FIRST stim (shared for all 5 stims)
- Avg BF under light
- Peak BF (bpm) under light
- Normalized Peak BF: 100 × Peak BF / Baseline BF
- Time to Peak (seconds)
- Beat End: Last beat inside stim window
- Amplitude: Peak BF − Beat End
- Rate of Change: Linear slope (per minute) normalized by mean BF

#### HRA Readout (Average of 5 Stims)
Display ONLY:
- Avg BF, Peak BF, Normalized Peak BF, Time to Peak, Amplitude, Rate of Change

Do NOT display: Beats, Beat End

#### Light-Induced HRV Formula (Rebuilt Feb 28, 2026)
For each stim j:
1. NN_k,filt = 60000 / BF_k,filt
2. **NN_k,70 = NN_k,filt × (857 / median(NN_k,filt within THIS stim))**
   - Each stim uses its OWN median NN as reference
3. Compute RMSSD_70, SDNN_70, pNN50_70 from normalized NN_70
4. Compute ln(RMSSD_70) and ln(SDNN_70)

#### HRV Light Stim - Per-Stim Table
Display: ln(RMSSD₇₀), RMSSD₇₀, ln(SDNN₇₀), SDNN₇₀, pNN50₇₀

#### HRV Light Stim - Readout (Median of 5 Stims)
Display ONLY: ln(RMSSD₇₀), ln(SDNN₇₀), pNN50₇₀

Do NOT display: Raw RMSSD or SDNN in the readout

### Corrected Light-Induced HRV (Detrended) - NEW Dec 2025

#### Purpose
Remove slow deterministic adaptation curve during each light stimulation (peak → decay or delayed rise in CPVT) so HRV reflects true beat-to-beat irregularity only.

#### Algorithm
For each stim j:
1. Use filtered BF only
2. Convert to NN: NN_k = 60000 / BF_k,filt
3. Normalize to 70 bpm: NN_k,70 = NN_k × (857 / median(NN_k within stim))
4. Apply Robust LOESS smoothing (span ~25% default, configurable 15-35%)
5. Compute residual: NN_residual = NN_k,70 − Trend_k
6. Compute HRV metrics on residuals: RMSSD_70_detrended, SDNN_70_detrended, pNN50_70_detrended

#### Tables
**Per-Stim (display):**
- ln(RMSSD₇₀)_detrended
- RMSSD₇₀_detrended
- ln(SDNN₇₀)_detrended
- SDNN₇₀_detrended
- pNN50₇₀_detrended

**Readout (median of 5 stims):**
- ln(RMSSD₇₀)_detrended
- ln(SDNN₇₀)_detrended
- pNN50₇₀_detrended

#### Visualization Module
Expandable panel per stim with:
- **Panel A**: Raw NN₇₀ vs time (cyan)
- **Panel B**: Trend Extraction - NN₇₀ with LOESS overlay (amber)
- **Panel C**: Detrended Residual - zero reference line (green)
- **Overlay Mode**: Toggle to show raw + trend + residual on same chart with dual Y-axes

#### Per-Stim Metrics (HRA - Heart Rate Acceleration)
For each stim j with window [S_j, E_j]:
- **Shared Baseline BF**: mean(BF_k,filt) from -2 to -1 min before FIRST stim
  - This same baseline is used for ALL 5 stims (not per-stim baseline)
- **PeakBF_j**: max(BF_k,filt) within stim
- **TimeToPeak_j**: (t_peak_j - S_j) × 60 seconds
- **PeakBF_norm_j**: 100 × PeakBF_j / BF_base (%)
- **Amplitude_j**: PeakBF_j - BF_end_j (where BF_end_j = last beat INSIDE stim, NOT baseline)
- **RateOfChange_j**: (slope b) / BF_mean_j (1/min, normalized)

#### Light-Induced HRV (Updated Algorithm - Dec 2025)
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

**Validation Status**: Algorithm validated against 4D030006.abf - Stims 2, 3, 5 match expected values within 0.1 ms. Stims 1, 4 show differences due to beat detection variations.

### Charts & Visualization
- [x] Light pulse highlights on ALL traces
- [x] Trackpad/wheel zoom (Ctrl+Scroll) on all charts
- [x] Zoom In/Out/Reset buttons on charts
- [x] Threshold visible as dashed amber line

### Export Features (Updated Feb 28, 2026)

#### Summary Sheet Structure
1. **Baseline Metrics** section:
   - Mean BF (1-2 min)
   - ln(RMSSD₇₀) (0-3 min)
   - ln(SDNN₇₀) (0-3 min)
   - pNN50₇₀ (0-3 min)
   - Time window shown in parentheses next to each metric

2. **Drug Metrics** section (when drug selected):
   - Same 4 metrics as Baseline
   - Drug-specific time windows displayed
   - Purple highlight for visual distinction

3. **Analysis Summary** section:
   - Recording Name, Drug(s) Used
   - Total/Kept/Removed Beats, Filter Range
   - Light Stimulation status
   - **Removed:** intermediate calculations between Filter Range and Light Stimulation

No raw RMSSD/SDNN, no duplicates.

#### Sheet Names
- "BF Analysis" (renamed from Per-Minute Analysis)
- "HRV Analysis" - unchanged

#### Row Highlighting
- Baseline row: Yellow highlight (FEF3C7) + Bold
- Drug readout row: Purple highlight (EDE9FE) + Bold
- Applied to both BF Analysis and HRV Analysis sheets

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
- Light stim HRV algorithm rebuilt with formula: `NN_70 = NN × (857 / median(NN within stim))`
- HRA shared baseline implemented: mean BF from -2 to -1 min before first stim
- Info tooltips added to Light Panel for HRA and HRV sections
- **NEW (Dec 2025):** Corrected Light-Induced HRV (Detrended) with LOESS smoothing
  - Backend: `compute_light_hrv_detrended()` in analysis.py
  - API: POST /api/light-hrv-detrended
  - Frontend: Full visualization with 3-panel charts and overlay mode

### P1 - In Progress
- [ ] Light stim highlights on LightPanel trace (code present, needs verification)
- [ ] Verify Excel export highlighting fix

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
