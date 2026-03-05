# NEHER - Electrophysiology Analysis Application

## Original Problem Statement
Build a production-ready web application, **NEHER**, for electrophysiology analysis of sharp-electrode extracellular ABF recordings. The application must support uploading `.abf` files, filtering the voltage trace, detecting beats, and performing detailed analysis with persistent storage in MongoDB.

## Core Workflow
Upload -> Analyze (Spontaneous, Light Stim, Drug) -> Export -> Save/Load analysis sessions from folders

## Key Features Implemented
- ABF file upload and processing
- Voltage trace visualization with unified zoom
- Beat detection and editing
- Spontaneous Activity analysis
- Light Stimulation analysis
- Drug analysis
- Folder organization with collapsible Sections
- PDF and Excel exports with professional formatting
- Comparison view for folder aggregation

## Technical Stack
- **Frontend:** React, Tailwind CSS, shadcn/ui, Recharts, lucide-react
- **Backend:** FastAPI (Python), Matplotlib, openpyxl
- **Database:** MongoDB

## Recent Changes (December 2025)
- 2025-12-05: **Exports now always fetch fresh data from database**:
  - Comparison PDF/Excel exports fetch latest recordings data on each export (not from frontend state)
  - This ensures exports always reflect current database state after updates/deletes/adds
  - Single recording exports continue to use current app state (which is up-to-date with UI)
- 2025-12-05: Fixed "Perf. Time" data consistency across ALL exports:
  - **Frontend (FolderComparison.js)**: Fixed to use `drug_hrv_readout_minute` with explicit null checks
  - **Comparison PDF (export_utils.py)**: Fixed to use `drug_hrv_readout_minute` with explicit null checks
  - **Comparison Excel (server.py)**: Fixed to use `drug_hrv_readout_minute` with explicit null checks
  - **Single Recording PDF (export_utils.py)**: Updated to use HRV readout minute from `drug_readout_settings`
  - **Single Recording Excel (export_utils.py)**: Updated to use HRV readout minute from `drug_readout_settings`
  - **Single Recording CSV (export_utils.py)**: Updated to use HRV readout minute from `drug_readout_settings`
  - Root cause: Both JavaScript `||` and Python `or` operators treat `0` as falsy, causing fallback to wrong values
- 2025-12-04: Fixed PDF Table 4 positioning (`loc='top'` -> `loc='upper center'`)
- Previous: Exhaustive redesign of single-recording PDF export with bioptima aesthetic

## Pending Issues
### P0 (High Priority)
- Section Drag-and-Drop partially broken in `HomeBrowser.js` (recurring issue)

### P1 (Medium Priority)
- PDF data table positioning refinements (if needed)
- Drug readout input values not clearing
- BF/NN charts data visibility on new recordings

### P2 (Lower Priority)
- Beat Frequency chart brush not interactive
- Brush/slider in TraceViewer.js resets on data changes
- Cannot delete beat if activeDot is on it
- Extend synchronized zoom to more tabs

## Backlog / Future
- Component refactoring (App.js, HomeBrowser.js, AnalysisPanel.js)
- Cohort Normalization functionality
- Batch Processing for multiple ABF files
- export_utils.py refactoring (3000+ lines, should be modularized)

## Key Files
- `/app/backend/export_utils.py` - PDF/Excel export logic
- `/app/frontend/src/components/HomeBrowser.js` - Section/folder management
- `/app/backend/server.py` - FastAPI routes
- `/app/backend/analysis.py` - Analysis algorithms

## Database Schema
- `sections`: {_id, name, order, expanded}
- `folders`: {_id, name, section_id, color}
- `recordings`: {_id, name, folder_id, abf_file_path, analysis_state}
