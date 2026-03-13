# NEHER - Cardiac Electrophysiology Analysis Platform

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings. The application supports uploading `.abf` files, filtering voltage traces, detecting beats, and performing detailed analysis with persistent storage in MongoDB.

**MEA Extension (March 2026):** Added Multi-Electrode Array (MEA) analysis pipeline for network spike and burst analysis.

## Core Features
1. **ABF File Processing (SEM):** Upload and analyze `.abf` files up to 200MB using chunked uploads
2. **Beat Detection (SEM):** Automatic detection with manual editing capabilities
3. **Spontaneous Activity Analysis (SEM):** BF & HRV metrics with baseline/drug readouts
4. **Light Stimulation Analysis (SEM):** Pulse detection and HRV response analysis
5. **MEA Analysis (NEW):** Network spike rate and burst rate analysis from CSV exports
6. **Folder Comparison:** Aggregated analysis across multiple recordings with global ON/OFF toggle
7. **Export:** PDF, Excel, CSV exports for single recordings and comparisons

## Tech Stack
- **Frontend:** React, Tailwind CSS, shadcn/ui, Recharts
- **Backend:** FastAPI (Python), pyABF
- **Database:** MongoDB
- **Deployment:** Kubernetes

---

## What's Been Implemented

### March 13, 2026 - MEA Feature Implementation (Phases 1-8) ✅ COMPLETE

#### Phase 1: Mode Selector ✅
- Added `ModeSelector.js` component with SEM and MEA cards
- SEM card routes to existing SEM upload flow unchanged
- MEA card routes to new MEA upload workflow
- Info tooltips explain each recording type

#### Phase 2: MEA Upload and Parsing ✅
- `MEAUpload.js` component handles 5 required CSV files:
  - spike_list.csv - Spike timestamps per electrode
  - electrode_burst_list.csv - Burst events per electrode
  - network_burst_list.csv - Network-level burst events
  - spike_counts.csv - Spike counts for filtering
  - environmental_data.csv - Environmental conditions
- Drag-and-drop file upload with validation
- Parses well IDs (A1-H12 format)
- Default electrode filter: min_hz=0.05
- Well selection UI with electrode counts and firing rates

#### Phase 3: Analysis Configuration ✅
- `MEAConfig.js` component with 5 configuration sections:
  1. Spontaneous Activity (baseline window)
  2. Light Stimulation (identical to SEM)
  3. Drug Configuration (MEA-specific - no perfusion delay)
  4. Electrode Filter (min_hz, max_hz)
  5. Binning Settings (spike_bin_s, burst_bin_s)

#### Phase 4: Metric Computation ✅
- `computeSpikeRate()` - mean Hz across active electrodes per bin
- `computeBurstRate()` - mean bursts-per-minute per bin
- `computeCorrelation()` - Pearson correlation for spike-burst coupling
- Window mean calculations for baseline, stim epochs, drug windows

#### Phase 5: Single Well Plots ✅
- Spike Raster Plot (time × electrode)
- Spike Rate Trace Plot (time × Hz)
- Burst Rate Trace Plot (time × bpm)
- Spike-Burst Coupling Scatter Plot with correlation stats
- Comparison Bar Charts for baseline vs conditions
- Stimulation and drug window shading on trace plots

#### Phase 6: Recording Persistence and Folders ✅
- `MEASaveDialog.js` component for saving well recordings
- Updated `storage.py` to support `source_type` field ("SEM" or "MEA")
- MEA recordings stored with: well_id, plate_id, active_electrodes, electrode_filter, etc.
- MEA badge displayed in folder view for MEA recordings
- MEA recordings can be saved, loaded, renamed, moved, deleted like SEM recordings

#### Phase 7: Folder Population Analysis ✅
- `MEAPopulationAnalysis.js` component shows when folder has ≥2 MEA recordings
- Population Traces: Mean spike/burst rate across all recordings
- Individual traces shown as faint lines behind mean trace
- Population Comparisons: Baseline vs Light/Drug (mean ± SEM)
- Population Spike-Burst Coupling scatter with combined regression

#### Phase 8: Raw Data Export ✅
- CSV Export dropdown on MEA Analysis page with 3 options:
  1. Spike Rate vs Time (time_bin_start_s, spike_rate_hz)
  2. Burst Rate vs Time (time_bin_start_s, burst_rate_bpm)
  3. Spike Intervals (timestamp_s, electrode, isi_s)

---

### March 9, 2026 - UI Enhancements

- **Renamed "Amp. %" to "Dec. %" (Decrease %)** with formula `100 × Amplitude / Peak BF`
- **Per Metrics Legend Fixes:** Reordered legend, dotted All Stims Average line
- **Export Label Rename:** "Recovery %" → "Rec. (Norm.)" in all exports
- **Amp % Column** added to comparison Light-Induced HRA table
- **Per Metrics Selector:** Replaced auto-display with selectable metric buttons
- **PDF Header Wrap Fix:** Fixed text overflow in table headers

---

## File Architecture

### MEA-Specific Files (NEW)
```
/app/frontend/src/components/
├── ModeSelector.js        # SEM/MEA mode selection
├── MEAUpload.js           # 5-file CSV upload and parsing
├── MEAConfig.js           # MEA analysis configuration
├── MEAAnalysis.js         # MEA metrics, plots, save, export
├── MEASaveDialog.js       # Save well recording dialog
└── MEAPopulationAnalysis.js # Population-level analysis

/app/backend/
└── storage.py             # Updated with source_type support

/app/mea_test_data/        # Test CSV files
├── spike_list.csv
├── electrode_burst_list.csv
├── network_burst_list.csv
├── spike_counts.csv
└── environmental_data.csv
```

### Existing SEM Files (Unchanged)
```
/app/frontend/src/components/
├── FileUpload.js          # SEM .abf file upload
├── AnalysisPanel.js       # SEM beat detection and analysis
├── LightPanel.js          # SEM light stimulation analysis
├── SaveRecording.js       # SEM recording save dialog
├── HomeBrowser.js         # Folder and recording browser
└── FolderComparison.js    # SEM comparison analysis
```

---

## Database Schema

### Recording Document
```javascript
{
  _id: ObjectId,
  folder_id: string,
  name: string,
  filename: string,
  source_type: "SEM" | "MEA",  // NEW FIELD
  analysis_state: {
    // SEM fields (when source_type === "SEM")
    file_info: {...},
    metrics: {...},
    beats: [...],
    light_pulses: [...],
    selected_drugs: [...],
    
    // MEA fields (when source_type === "MEA")
    well_id: string,
    plate_id: string,
    active_electrodes: [...],
    electrode_filter: { min_hz, max_hz },
    config: {...},
    spike_rate_bins: [...],
    burst_rate_bins: [...],
    spikes: [...],
    electrode_bursts: [...],
    network_bursts: [...]
  },
  n_beats: number,          // SEM only
  n_electrodes: number,     // MEA only (NEW)
  duration_sec: number,
  has_light_stim: boolean,
  has_drug_analysis: boolean,
  created_at: ISO string,
  updated_at: ISO string
}
```

---

## Prioritized Backlog

### P0 - Critical (Completed)
- [x] MEA Phase 1: Mode Selector
- [x] MEA Phase 2: Upload and Parsing
- [x] MEA Phase 3: Analysis Configuration
- [x] MEA Phase 4: Metric Computation
- [x] MEA Phase 5: Single Well Plots
- [x] MEA Phase 6: Recording Persistence
- [x] MEA Phase 7: Population Analysis
- [x] MEA Phase 8: Raw Data Export

### P1 - High Priority
- [ ] Refactor `export_utils.py` (5300+ lines) into smaller modules
- [ ] Refactor `LightPanel.js` and `FolderComparison.js` (1800+ lines each)

### P2 - Medium Priority
- [ ] Fix Section Drag-and-Drop in `HomeBrowser.js` (recurring issue)
- [ ] Verify Excel export for complex multi-drug recordings
- [ ] Drug readout input values not clearing after being disabled
- [ ] Beat Frequency chart brush not interactive
- [ ] Brush/slider in TraceViewer resets zoom state on data changes
- [ ] Cannot delete a beat if activeDot is on it

### P3 - Enhancements
- [ ] MEA PDF export (match SEM export quality)
- [ ] MEA Excel export with multiple sheets
- [ ] Folder-level MEA vs SEM comparison
- [ ] Cross-folder MEA population analysis

---

## Testing Reports
- `/app/test_reports/iteration_24.json` - MEA Phases 1-5 verification
- `/app/test_reports/iteration_25.json` - MEA Phases 6-8 verification (latest)

---

## Key API Endpoints

### MEA Endpoints (use existing patterns)
- `POST /api/recordings` - Create recording (supports MEA via source_type)
- `GET /api/recordings/{id}` - Get recording (returns source_type)
- `GET /api/folders/{id}/recordings` - List recordings (includes source_type, n_electrodes)

### SEM Endpoints (unchanged)
- `POST /api/upload_chunk` - Chunked file upload
- `POST /api/process_recording` - Process ABF file
- All folder/recording CRUD operations

---

## Critical Rules
1. **SEM Immutable:** No changes to existing SEM functionality
2. **source_type Field:** All recordings must have source_type ("SEM" or "MEA")
3. **Backward Compatibility:** Existing SEM recordings default to source_type: "SEM"
4. **MEA Well Independence:** Each well is saved as a separate recording
