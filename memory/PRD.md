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
- 2025-12-05: **New Single Recording Excel Export matching PDF structure**:
  - Rewrote `create_nature_excel` function in `export_utils.py` with 6 sheets:
    - Summary: Recording info, tissue info, drug perfusion, light stim, readouts
    - Spontaneous BF: Per-minute BF data with normalization
    - Spontaneous HRV: Per-minute HRV data (RMSSD, SDNN, pNN50)
    - Light HRA: Per-stimulus HRA data with averages
    - Light Corrected HRV: Per-stimulus corrected HRV with medians
    - Per-Beat: **Kept beats only** with Beat #, Time, BF, NN values
  - Reduced file from ~4600 lines to ~4050 lines by removing duplicate code
- 2025-12-05: **New Comparison Excel Export matching PDF structure** (5 sheets)
- 2025-12-05: **Exports now always fetch fresh data from database**
- 2025-12-05: Fixed "Perf. Time" data consistency across ALL exports
- 2025-12-04: Fixed PDF Table 4 positioning
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
