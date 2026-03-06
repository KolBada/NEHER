# NEHER - Cardiac Electrophysiology Analysis Platform

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings. The application supports uploading `.abf` files, filtering voltage traces, detecting beats, and performing detailed analysis with persistent storage in MongoDB.

## Core Features
1. **ABF File Processing:** Upload and analyze `.abf` files up to 200MB using chunked uploads
2. **Beat Detection:** Automatic detection with manual editing capabilities
3. **Spontaneous Activity Analysis:** BF & HRV metrics with baseline/drug readouts
4. **Light Stimulation Analysis:** Pulse detection and HRV response analysis
5. **Folder Comparison:** Aggregated analysis across multiple recordings
6. **Export:** PDF, Excel, CSV exports for single recordings and comparisons

## Tech Stack
- **Frontend:** React, Tailwind CSS, shadcn/ui, Recharts
- **Backend:** FastAPI (Python), pyABF
- **Database:** MongoDB
- **Deployment:** Kubernetes

## What's Been Implemented

### March 6, 2026
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
- Drug readout input values not clearing properly
- Beat Frequency chart brush not interactive
- Brush/slider zoom state resets on data changes
- Cannot delete a beat if activeDot is on it

### P2 - Medium Priority
- Extend synchronized zoom to Spontaneous Activity and Light Stimulus tabs
- Refactor large components (App.js ~1900 lines, export_utils.py ~4200 lines)

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
