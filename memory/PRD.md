# NEHER - Cardiac Electrophysiology Analysis Platform

## Overview
A full-stack electrophysiology analysis tool supporting two workflows:
- **SSE (Sharp Single Electrode)**: For `.abf` files from cardiac activity recordings
- **MEA (Multi-Electrode Array)**: For `.csv` files from neuronal organoid/neuro-cardiac assembloid recordings

## Tech Stack
- **Frontend**: React with Shadcn/UI, Recharts for visualization
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Styling**: Glassmorphism dark theme with CSS custom properties

## Core Features (Completed)

### MEA Comparison Page (March 2026 - COMPLETED)
**Features:**
- SSE/MEA type switcher (filters recordings by source_type)
- Summary cards: RECORDINGS, HSPO AGE RANGE, HCOS AGE RANGE, FUSION AGE RANGE
- Three tabs: Spontaneous Activity, Light Stimulus, Metadata

**Spontaneous Activity Tab:**
- Spike Rate Comparison table with Baseline/Drug values (Hz)
- Burst Rate Comparison table (bpm)
- Normalized to Average Baseline expandable sections

**Light Stimulus Tab (renamed to "Light Evoke"):**
- Light Evoke Spike Activity: BL, Avg, Max, Spike Δ%, Peak Spike Δ%, TTP
- Light Evoke Burst Activity: same structure
- Normalized to Average Baseline sections
- Per Metrics for each Stimuli with toggle buttons and charts

**Metadata Tab:**
- Recording name with Well ID
- Date, hSpO Info, hCO Info, Fusion, Drug Info, Light Stim Info, Notes
- Drug shows name, concentration, perf time
- Light shows stim count, duration, ISI structure

**Backend Enhancements:**
- `extract_mea_comparison_metrics()` function computes values from:
  1. Pre-computed values (saved with recording)
  2. spike_rate_bins/burst_rate_bins (if available)
  3. Raw spikes/bursts data (fallback for legacy recordings)
- API supports `source_type` filter parameter

**Frontend Enhancements:**
- `getAnalysisState()` now saves pre-computed baseline_spike_hz, drug_spike_hz, etc.
- Comparison button from MEA Analysis navigates to folder comparison
- Background glass lights added to MEA Analysis page (tab-specific colors)

### MEA Export System (March 2026 - COMPLETED)
**Backend API Endpoints:**
- `POST /api/mea/export/csv` → Single CSV file with all sections
- `POST /api/mea/export/xlsx` → Multi-sheet Excel workbook
- `POST /api/mea/export/pdf` → 7-page Nature Magazine style PDF

**Export Content:**
- Summary: Recording Info (files on separate lines), Tissue Info, Drug, Light, Readouts
- Spike Evolution: Raw + normalized charts
- Burst Evolution: Raw + normalized charts
- Data Tables:
  - Table 1: Per-Minute Spike Frequency
  - Table 2: Per-Minute Burst Frequency
  - Table 3: Light-Induced Spike Response (baseline=blue, others=amber)
  - Table 4: Light-Induced Burst Response (baseline=blue, others=amber)

### MEA Analysis Features (March 2026)
- **Temperature Trace**: Chart showing temperature (°C) over time
  - Uses environmental_data from CSV upload
  - Red colored trace (#ef4444)
  - Saved and restored with recordings

- **Auto-compute Light Metrics**: When loading saved recording with light pulses but no metrics, system automatically computes spike/burst response data

### Light Stimulus Data Persistence (March 2026)
- `lightMetrics` saved with recording
- Auto-computed on load if missing but lightPulses exist
- Exported to Light Spike/Burst tables in all formats

## Recent Changes (March 2026)

### Export Fixes
- Light Spike/Burst tables now appear in all exports
- Each source file on separate line in Summary
- Baseline column blue (#0ea5e9), others amber (#f59e0b)

### Auto-compute Light Metrics
- Added useEffect that triggers when:
  - Loading saved recording
  - lightEnabled && lightPulses exist
  - lightMetrics is null
  - wellAnalysis is available
- Computes per-stim metrics and average

### Temperature Trace
- Added TemperatureTraceChart component
- Displays when environmental_data has temperature field
- Uses timestamp for X-axis, temperature for Y-axis

## File Structure
```
/app
├── backend/
│   ├── server.py           # FastAPI endpoints
│   ├── export_utils.py     # SSE export utilities
│   └── mea_export_utils.py # MEA export utilities
└── frontend/
    └── src/
        └── components/
            ├── MEAAnalysis.js      # ~3130 lines (needs refactoring)
            ├── MEAExportPanel.js   # MEA export tab UI
            └── ...
```

## Pending Tasks

### P0 - Completed
- ✅ Light Spike/Burst tables in exports
- ✅ Auto-compute light metrics on load
- ✅ Temperature trace in MEA analysis
- ✅ File names on separate lines
- ✅ **MEA Comparison Page (March 2026)** - Full implementation mirroring SSE Comparison

### P2 - Medium Priority (Future)
- Refactor `MEAAnalysis.js` (~3150 lines)
- Refactor `FolderComparison.js` (~3200 lines after MEA addition)
- Refactor `HomeBrowser.js` (~1915 lines)

### P3 - Low Priority
- Minor UI improvements

---

## MEA Comparison Page (March 2026 - COMPLETED)

### Overview
Full MEA comparison system that mirrors the existing SSE comparison page with MEA-specific metrics.

### Features Implemented

**1. SSE/MEA Type Switcher:**
- Two buttons after Metadata tab: "SSE (n)" and "MEA (n)"
- Correctly filters recordings by source_type
- Disabled button if type not present in folder
- Preserves folder context when switching

**2. Top Summary Cards:**
- RECORDINGS count
- HSPO AGE RANGE with n value
- HCOS AGE RANGE with n value
- FUSION AGE RANGE with n value
- Same glassmorphism styling as SSE

**3. Spontaneous Activity Tab (MEA):**
- **Spike Rate Comparison Table:**
  - Columns: Recording, Baseline Spike (Hz), Drug Spike (Hz)
  - Toggle ON/OFF per recording
  - Folder Average row
  - Normalized to Average Baseline expandable section
- **Burst Rate Comparison Table:**
  - Columns: Recording, Baseline Burst (bpm), Drug Burst (bpm)
  - Same structure as Spike table

**4. Light Stimulus Tab (MEA):**
- **Light-Induced Spike Activity:**
  - Columns: BL Spike (Hz), Avg Spike (Hz), Max Spike (Hz), Spike Δ%, Peak Spike Δ%, TTP (s)
  - Normalized to Average Baseline section
  - Per Metrics for each Stimuli section with metric toggles and charts
- **Light-Induced Burst Activity:**
  - Columns: BL Burst (bpm), Avg Burst (bpm), Max Burst (bpm), Burst Δ%, Peak Burst Δ%, TTP (s)
  - Same structure as Spike section

**5. Metadata Tab (MEA):**
- Columns: Recording, Date, hSpO Info, hCO Info, Fusion, Drug Info, Light Stim Info, Notes
- Well ID displayed under recording name
- Drug Info shows name, concentration, perf time
- Light Stim Info shows stim count, duration, ISI structure

**6. Info Icons/Tooltips:**
- Every metric header has circled info icon
- Tooltips explain metric meaning

### API Changes
- `GET /api/folders/{folder_id}/comparison` now accepts `?source_type=MEA|SSE`
- Returns type-specific metrics and averages
- Returns `type_counts: {sse: n, mea: n}` for switcher UI

### Files Modified
- `/app/backend/server.py`: Added `extract_mea_comparison_metrics()`, modified endpoint
- `/app/frontend/src/components/FolderComparison.js`: Added MEA-specific UI components (~1000 lines added)
- `/app/frontend/src/api.js`: Updated `getFolderComparison` to accept sourceType parameter
