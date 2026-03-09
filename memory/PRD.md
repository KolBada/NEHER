# NEHER - Cardiac Electrophysiology Analysis Platform

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings. The application supports uploading `.abf` files, filtering voltage traces, detecting beats, and performing detailed analysis with persistent storage in MongoDB.

## Core Features
1. **ABF File Processing:** Upload and analyze `.abf` files up to 200MB using chunked uploads
2. **Beat Detection:** Automatic detection with manual editing capabilities
3. **Spontaneous Activity Analysis:** BF & HRV metrics with baseline/drug readouts
4. **Light Stimulation Analysis:** Pulse detection and HRV response analysis
5. **Folder Comparison:** Aggregated analysis across multiple recordings with global ON/OFF toggle for recordings
6. **Export:** PDF, Excel, CSV exports for single recordings and comparisons

## Tech Stack
- **Frontend:** React, Tailwind CSS, shadcn/ui, Recharts
- **Backend:** FastAPI (Python), pyABF
- **Database:** MongoDB
- **Deployment:** Kubernetes

## What's Been Implemented

### March 9, 2026 (Current Session)
- **PDF Header Wrap Fix (VERIFIED):**
  - Fixed text overflow in PDF table headers by adding `\n` characters
  - **Table 3 (Per-Stimulus HRA Data)** in single recording PDF: headers now properly split
  - **Table 4 (Light-Induced HRA Data)** in comparison PDF: headers now properly split
  - Header format: "Baseline\nBF", "Avg\n%", "1st TTP\n(s)" etc.
  - Tested with curl and pdftotext - all headers within cell boundaries

- **Previous Session (March 7-9, 2026):**
  - Added "Amp. %" metric (100 × Amplitude / Baseline)
  - Added "Avg %" metric (100 × Avg BF / Baseline)
  - Implemented on-the-fly calculation for backward compatibility
  - Reordered HRA readout metrics (absolute vs normalized values)
  - Changed "Baseline BF" to cyan throughout
  - Renamed "Stim Average" to "All Stims Average"
  - Renamed "Per Metrics" to "Per Metrics for each Stimuli"
  - Renamed "Normalized to Baseline" to "Normalized to Average Baseline" with info tooltip

### March 7, 2026
- **Global ON/OFF Toggle for Folder Comparison:**
  - Added global `excludedRecordings` state in `FolderComparison.js` that synchronizes across ALL tables
  - Created `RecordingToggle` component with ON/OFF button for each recording row
  - Added toggle column to all 6 comparison tables:
    - Spontaneous Activity Comparison (for each drug)
    - Spontaneous Activity Comparison - Normalized to Baseline (for each drug)
    - Light-Induced Heart Rate Adaptation (HRA)
    - Light-Induced Heart Rate Adaptation (HRA) - Normalized to Baseline
    - Corrected Light-Induced Heart Rate Variability (HRV)
    - Recording Metadata
  - Excluded recordings are grayed out (opacity-40) in all tables
  - Folder Average row dynamically updates (n count and values) when recordings are toggled
  - Updated all `useMemo` hooks to filter excluded recordings from calculations
  - Added `excluded_recording_ids` field to `FolderComparisonExportRequest` model in `server.py`
  - Both Excel and PDF exports filter out excluded recordings before generating output
  - **Testing:** All tests passed (100% frontend success rate)

- **Per Metrics for each Stimuli Tables for HRA and HRV (UPDATED March 9, 2026):**
  - Renamed "Per Metrics" to **"Per Metrics for each Stimuli"**
  - Added "Per Metrics for each Stimuli" expandable sections under both HRA and Corrected HRV cards in the Light Stimulus tab
  - **HRA Per Metrics for each Stimuli:** Shows 9 tables (one per metric), each with:
    - Columns: Recording, Stim 1, Stim 2, Stim 3, Stim 4, Stim 5, **Average** (6th column = row average)
    - Metrics: Avg BF, **Avg %** (new), Peak BF, Peak %, TTP, Rec. BF, Rec. %, Amp., RoC
    - "Folder Average" row at bottom with column averages
    - Line chart visualization with **three traces**:
      1. **Per Stim Average** (orange solid line) - average of all recordings for each stimulation
      2. **Stim Average** (yellow dashed line) - overall average across all 5 stimulations
      3. **Baseline BF** (cyan dashed, for Avg BF, Peak BF, Rec. BF charts)
      4. **Baseline (100%)** reference line (cyan, for Avg %, Peak % and Rec. % charts)
    - Global ON/OFF toggles synchronized with all other tables
  - **HRV Per Metrics for each Stimuli:** Shows 3 tables (one per metric), each with:
    - Columns: Recording, Stim 1, Stim 2, Stim 3, Stim 4, Stim 5, **Median** (6th column = row median)
    - Metrics: ln(RMSSD₇₀) corr., ln(SDNN₇₀) corr., pNN50₇₀ corr. (%)
    - "Folder Median" row at bottom with column medians
    - Line chart visualization with **two traces**:
      1. **Per Stim Median** (orange solid line) - median of all recordings for each stimulation
      2. **Stim Median** (yellow dashed line) - overall median across all 5 stimulations
    - Global ON/OFF toggles synchronized with all other tables
  - Backend `server.py` provides `per_stim_hra` and `per_stim_hrv` data
  - Added Recharts imports for LineChart, ResponsiveContainer, ReferenceLine visualizations

- **New Metric: Avg % (Normalized Avg) - March 9, 2026:**
  - Formula: **100 × Avg BF / Baseline BF**
  - Added to backend `analysis.py` as `avg_norm_pct` in per-stim data and mean_metrics
  - Added to backend `server.py` for comparison data extraction
  - Added to single recording:
    - LightPanel.js metric card with info tooltip
    - Per-stimulation table column
    - PDF export (Light Stimulus HRA section)
    - Excel export (Light Stimulus HRA section)
    - CSV export (Light Stimulus HRA section)
  - Added to comparison folder:
    - Light-Induced HRA table (header + data + folder average)
    - Per Metrics for each Stimuli section
    - PDF comparison export (summary and Table 4)
    - Excel comparison export (summary and Light HRA sheet)

- **UI Naming & Color Updates (March 9, 2026):**
  - Renamed "Normalized to Baseline" → **"Normalized to Average Baseline"** in:
    - Spontaneous Activity tab (all drug sections)
    - Light Stimulus tab (HRA section)
    - PDF comparison exports
    - Excel comparison exports
  - Added info tooltip (ⓘ) explaining "Values normalized to the average baseline across all included recordings"
  - Changed "Stim Average" / "Stim Median" line color from purple (#a855f7) to **yellow** (#eab308) in Per Metrics charts

- **Baseline BF Color & Chart Enhancements:**
  - Changed Baseline BF color from amber to **cyan** throughout Light Stimulus section
  - Added **Baseline BF reference trace** (cyan dashed line) to charts for Avg BF, Peak BF, and Recovery BF metrics
  - Added **Baseline (100%)** reference line to Peak % and Rec. % charts
  - Configured **fixed Y-axis scales** for Per Metrics charts:
    - Peak %: 0 to 200
    - TTP: 0 to 30
    - Rec. %: 0 to 200
    - RoC: -2 to 2
    - ln(RMSSD₇₀): 0 to 8
    - ln(SDNN₇₀): 0 to 8
    - pNN50₇₀: 0 to 100

### March 6, 2026 (Session 2)
- **Bug Fixes for Readout Controls:**
  - **Decimal Minute Computation Fix:** Backend `analysis.py` now uses `int(hrv_minute)` for HRV window lookup
  - **Per-Drug Perfusion Time in Comparison:** Backend `server.py` includes `perf_time` in `per_drug_metrics`
  - **UI Label Update:** Changed "Readout:" to "Readout Time Range:" in baseline and drug readout sections
  - **Removed Leading Zeros:** Time range displays now show "1-2min" instead of "01-02min"
  - **Wider Input Fields:** Increased readout input width from `w-14` to `w-16` to accommodate decimal values like 2.5
  - **Comparison Metadata Fix:** Frontend `FolderComparison.js` now displays per-drug perfusion time from `per_drug_metrics` instead of using global value

### March 6, 2026 (Session 1)
- **Multi-File Fusion Feature:**
  - **Backend:** Added new `/api/upload/fuse` endpoint that accepts up to 5 ABF files and concatenates them into a single recording
  - **Backend:** Validates max 5 files limit, rejects non-.abf files, returns `fused_from` array and `is_fused: true` flag
  - **Frontend:** Updated `FileUpload.js` with:
    - FUSION MODE badge when multiple files selected
    - File count indicator (X / 5 files)
    - Drag-and-drop reordering of files
    - Move up/down buttons for precise ordering
    - GripVertical drag handles
  - **API:** Updated `api.js` with `fusedUpload` function that posts to `/api/upload/fuse`
  - **Testing:** All 11 backend tests passed for fusion upload

- **Multi-Drug Readout Feature Complete:**
  - **UI Spacing:** Changed margin between drug readout metrics rows from `mt-6` to `mt-4` (30% reduction)
  - **UI Default Values:** Changed drug readout input placeholders from "12"/"14" to "0" for HRV/BF
  - **Decimal Minute Support:** All readout minute inputs now accept decimal values (0.5, 1.5, 2.5, etc.) with `step="0.5"` attribute and `parseFloat()` parsing
  - **PDF Multi-Drug Readouts:** Single "DRUG READOUT" header with per-drug colored boxes (like Drug Perfusion)
  - **PDF BF Evolution Legend:** Each drug now shows in legend as "[drug name] perfusion" with unique colors
  - **Consistent Per-Drug Colors:** Added `DRUG_COLORS` array with 4 purple shades used consistently across:
    - Drug Perfusion section
    - Drug Readout section
    - BF Evolution chart regions and legend
    - Per-Minute BF table row highlighting
    - Per-Three Minutes HRV table row highlighting
  - **Color scheme:** Drug 1=#F3E8FF, Drug 2=#EDE9FE, Drug 3=#E9D5FF, Drug 4=#DDD6FE
  - **Excel Export Updated:** 
    - Added `drug_fills` array with 4 PatternFill objects
    - Drug Perfusion and Drug Readout sections use per-drug colors
    - Spontaneous BF sheet: drug readout rows highlighted with per-drug fills + bold font
    - Spontaneous HRV sheet: drug readout rows highlighted with per-drug fills + bold font
  - **CSV Export Updated:** Drug Readout section now outputs data for each enabled drug with drug name
  - **Testing:** All tests passed for PDF, Excel, and CSV per-drug colors

### March 5, 2026
- **Fixed Spontaneous Activity Bug:** Automatic HRV computation after validation
  - Modified `handleValidate` in App.js to call `hrvAnalysis` and `perMinuteMetrics` automatically
  - Enhanced button visibility in AnalysisPanel.js with CSS fixes
- **Previous Session:** Fixed "Perf. Time" display, refactored comparison exports, redesigned Excel exports

### Previous Sessions
- Complete ABF file upload with chunked upload for large files
- Beat detection and validation workflow
- HRV analysis with baseline and drug readouts
- Light stimulation detection and analysis
- Folder/Section organization system
- PDF, Excel, CSV exports for all data types
- Synchronized zoom across charts

## Known Issues (Prioritized Backlog)

### P0 - Critical
- **Section Drag-and-Drop Bug** (`HomeBrowser.js`): Sections at the bottom of the list cannot be dragged. Multiple fix attempts have failed.

### P1 - High Priority
- Excel export potential corruption (testing pending with complex exports)
- Add "Per Metrics for each Stimuli" data to comparison exports (PDF/Excel)
- Drug readout input values not clearing properly
- Beat Frequency chart brush not interactive
- Brush/slider zoom state resets on data changes
- Cannot delete a beat if activeDot is on it

### P2 - Medium Priority
- Extend synchronized zoom to Spontaneous Activity and Light Stimulus tabs
- Refactor large components:
  - `export_utils.py` (~5200 lines) - critical, should split into smaller modules
  - `LightPanel.js` (~1750 lines) - should decompose into smaller components
  - `FolderComparison.js` (~1650 lines) - should decompose into smaller components
  - `App.js` (~1900 lines)

### P3 - Low Priority/Future
- Add Cohort Normalization functionality
- Implement Batch Processing for multiple files
- Add more chart types for analysis visualization

## Code Architecture
```
/app
├── backend/
│   ├── server.py        # FastAPI endpoints
│   ├── analysis.py      # Beat detection & HRV computation
│   └── export_utils.py  # PDF, Excel, CSV generation (updated for multi-drug)
└── frontend/
    ├── src/
    │   ├── App.js           # Main state management
    │   ├── api.js           # API client
    │   └── components/
    │       ├── AnalysisPanel.js     # Spontaneous Activity tab (spacing fix)
    │       ├── HomeBrowser.js       # Folder/Section navigation
    │       ├── FolderComparison.js  # Comparison view
    │       └── ...
```

## Key API Endpoints
- `POST /api/upload/init|chunk|complete` - Chunked file upload
- `POST /api/compute-metrics` - Beat validation
- `POST /api/hrv-analysis` - HRV computation
- `POST /api/per-minute-metrics` - Per-minute BF metrics
- `POST /api/light-detect` - Light pulse detection
- `GET /api/folders/{id}/comparison` - Folder comparison data
- `POST /api/folders/{id}/export/pdf|xlsx` - Comparison exports
- `POST /api/export/pdf|xlsx|csv` - Single recording exports

## Database Schema
- **sections:** `{_id, name, order, expanded}`
- **folders:** `{_id, name, section_id, color, created_at, updated_at}`
- **recordings:** `{_id, name, folder_id, filename, analysis_state, created_at, updated_at}`

## Drug Readout State Structure
```javascript
drugReadoutSettings: {
  enableHrvReadout: boolean,  // Global enable for first drug
  enableBfReadout: boolean,   // Global enable for first drug
  perDrug: {
    [drugKey]: {
      hrvReadoutMinute: string,  // Input value (minutes after effect)
      bfReadoutMinute: string,   // Input value
      enabled: boolean           // For non-first drugs
    }
  }
}
```
