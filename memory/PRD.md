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
- **Multi-Drug Readout Feature Complete:**
  - **UI Spacing:** Added `mt-10` margin between drug readout metrics rows in `AnalysisPanel.js` to improve visual separation
  - **PDF Multi-Drug Readouts:** Modified `export_utils.py` to loop through ALL enabled drugs and create separate "DRUG READOUT" sections (like Drug Perfusion)
  - **PDF Mean BF Fix:** Each drug's Mean BF now correctly uses its own per-drug `bfReadoutMinute + perf_start + perf_delay`
  - **PDF Table Highlighting:** Per-Minute BF table and Per-Three Minutes HRV table now highlight ALL drug readout rows with light purple (#e8d5f5) and bold text
  - **Testing:** All 18 backend tests passed for multi-drug PDF export

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
