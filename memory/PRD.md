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

### MEA Export System (March 2026 - COMPLETED)
**Backend API Endpoints:**
- `POST /api/mea/export/csv` → Single CSV file with all sections (SSE-style format)
- `POST /api/mea/export/xlsx` → Multi-sheet Excel workbook with styled tables
- `POST /api/mea/export/pdf` → 7-page Nature Magazine style PDF report

**Export Content Structure (matching SSE):**
- Summary: Recording Info (each file on own line), Tissue Info, Drug Perfusion, Light Stim, Readouts
- Spike Evolution: Raw trace and normalized-to-baseline charts
- Burst Evolution: Raw trace and normalized-to-baseline charts
- Data Tables:
  - Table 1: Per-Minute Spike Frequency
  - Table 2: Per-Minute Burst Frequency
  - Table 3: Light-Induced Spike Response (per-stim + average)
  - Table 4: Light-Induced Burst Response (per-stim + average)

### MEA Analysis Features (March 2026)
- **Temperature Trace**: New chart showing temperature (°C) over time below Burst Trace
  - Uses environmental_data from CSV upload
  - Red colored trace with proper axis labels
  - Respects zoom domain synchronization

### Light Stimulus Data Persistence (March 2026)
- `lightMetrics` (computed spike/burst response data) saved with recording
- Restored automatically when reopening saved recordings
- No need to re-compute spike and burst metrics after loading

## Recent Changes (March 2026)

### Export Fixes
- Fixed Light Spike/Burst tables missing from all exports
- Each source file now displays on its own line in Summary section
- PDF uses smaller font (6pt) for long filenames to fit table width
- CSV download now uses .csv extension (was incorrectly .zip)

### Temperature Trace
- Added TemperatureTraceChart component to MEAAnalysis.js
- Displays in Spontaneous Activity tab when environmental_data exists
- Shows temperature in Celsius over recording duration

## File Structure
```
/app
├── backend/
│   ├── server.py           # FastAPI endpoints (including MEA export)
│   ├── export_utils.py     # SSE export utilities
│   └── mea_export_utils.py # MEA export utilities (CSV, XLSX, PDF)
└── frontend/
    └── src/
        ├── App.js
        └── components/
            ├── HomeBrowser.js      # Home page (>1900 lines)
            ├── MEAAnalysis.js      # MEA analysis view (~3050 lines)
            ├── MEAExportPanel.js   # MEA export tab UI
            ├── ExportPanel.js      # SSE export tab
            └── ...
```

## Pending Tasks

### P0 - Completed
- ✅ MEA Export with Light Spike/Burst tables
- ✅ File names on separate lines in exports
- ✅ Temperature trace in MEA analysis
- ✅ Light stimulus data persistence

### P1 - High Priority (Upcoming)
- **MEA Comparison feature:** Build side-by-side comparison for multiple MEA recordings

### P2 - Medium Priority
- Refactor oversized files (`MEAAnalysis.js` ~3050 lines)

### P3 - Low Priority
- Minor UI improvements and edge case fixes
