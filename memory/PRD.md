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

### Phase 1-8: MEA Analysis Pipeline (Complete)
- CSV file upload with suffix matching for flexible filenames
- Support for Axion Biosystems MEA format (complex CSV with mixed metadata)
- Well extraction from electrode column (e.g., `A2_44` → well `A2`)
- Electrode filtering by firing rate
- Burst detection (electrode and network level)
- Environmental data parsing

### Phase 9: MEA Workflow Redesign (December 2025)
**Workflow Simplification:**
- Removed "Configure MEA Analysis" page entirely
- Select Wells page now includes: Electrode Filter + Binning Settings
- New flow: Upload CSVs → Select Wells (with config) → Run Analysis → MEA Analysis

**New MEA Analysis Page Architecture:**
- Fixed glassmorphic top bar with well selector chips
- 4 tabs only (matching SSE structure): Spontaneous Activity, Light Stimulus, Save Recording, Export

### MEA Export System (March 2026 - COMPLETED)
**Backend API Endpoints:**
- `POST /api/mea/export/csv` → Single CSV file with all sections (SSE-style format)
- `POST /api/mea/export/xlsx` → Multi-sheet Excel workbook with styled tables
- `POST /api/mea/export/pdf` → 7-page Nature Magazine style PDF report

**Export Content Structure (matching SSE):**
- Summary: Recording Info, Tissue Info, Drug Perfusion, Light Stim, Readouts
- Spike Evolution: Raw trace and normalized-to-baseline charts
- Burst Evolution: Raw trace and normalized-to-baseline charts
- Data Tables: Per-Minute Spike, Per-Minute Burst, Light Spike Response, Light Burst Response

**Frontend UI (`MEAExportPanel.js`):**
- Recording info strip with well selector and CSV file badges
- "Available Data" cards (Spike/Burst counts, Per Bin, Per Minute metrics)
- Export format descriptions (CSV, Excel, PDF)
- Simplified Summary Preview (removed Baseline/Drug/Light fields per user request)

### Light Stimulus Data Persistence (March 2026)
- `lightMetrics` (computed spike/burst response data) now saved with recording
- Restored automatically when reopening saved recordings
- No need to re-compute spike and burst metrics after loading

### Glassmorphism UI/UX (COMPLETE - December 2025)
Applied comprehensive glassmorphism dark theme across ALL pages.

## Recent Changes (March 2026)

### MEA Export Redesign
- Rewrote `mea_export_utils.py` to match SSE export design philosophy
- CSV now single file (not ZIP) with clear section headers
- Excel has colored headers (emerald=spike, orange=burst, amber=light, sky=baseline)
- PDF follows Nature Magazine style with professional layout

### Light Metrics Persistence
- Added `lightMetrics` to `getAnalysisState()` to include in save data
- Added restoration of `lightMetrics` from `savedRecordingData`
- Updated dependency arrays for proper re-render

## File Structure
```
/app
├── backend/
│   ├── server.py           # FastAPI endpoints (including MEA export)
│   ├── export_utils.py     # SSE export utilities
│   └── mea_export_utils.py # MEA export utilities (CSV, XLSX, PDF) - REDESIGNED
└── frontend/
    └── src/
        ├── App.js
        └── components/
            ├── HomeBrowser.js      # Home page (>1900 lines)
            ├── MEAAnalysis.js      # MEA analysis view (~3000 lines)
            ├── MEAExportPanel.js   # MEA export tab UI
            ├── ExportPanel.js      # SSE export tab
            └── ...
```

## Pending Tasks

### P0 - Completed
- ✅ MEA Export redesigned to match SSE style
- ✅ Light stimulus data persistence implemented

### P1 - High Priority (Upcoming)
- **MEA Comparison feature:** Build side-by-side comparison for multiple MEA recordings (currently disabled button)

### P2 - Medium Priority
- Refactor oversized files (`HomeBrowser.js` >1900 lines, `MEAAnalysis.js` ~3000 lines)

### P3 - Low Priority
- Minor UI improvements and edge case fixes
