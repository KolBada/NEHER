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
- `POST /api/mea/export/csv` → ZIP containing Summary, Spontaneous Spike/Burst, Light Spike/Burst CSVs
- `POST /api/mea/export/xlsx` → Multi-sheet Excel workbook with styled tables
- `POST /api/mea/export/pdf` → 7-page PDF report with graphs and tables

**Frontend UI (`MEAExportPanel.js`):**
- Recording info strip with well selector and CSV file badges
- "Available Data" cards (Spike/Burst counts, Per Bin, Per Minute, Baseline, Drug, Light metrics)
- Export format descriptions (CSV, Excel, PDF)
- Summary Preview section (Baseline/Drug/Light fields removed per user request)

### Glassmorphism UI/UX (COMPLETE - December 2025)
Applied comprehensive glassmorphism dark theme across ALL pages:

**Color Scheme:**
- F4CEA2 (peach): Cardiac/BPM indicators
- Emerald (#10b981): Neuronal/Spike indicators, positive states
- Cyan (#22d3ee): Baseline metrics
- Magenta (#d946ef): Drug-related indicators
- Amber (#f59e0b): Light stimulus indicators
- Green: Saved/ON/Positive/Beating states
- Red (#ef4444): Unsaved/OFF/Negative/Cardiac Arrest states
- Orange: Edit mode
- Teal: Small action icons (New Section, New Folder)
- Silver (#c0c0c0): Trace/Beat detection
- Brown: NN intervals

**Glass CSS Classes:**
- `.glass-surface`: Main glass panel with backdrop blur
- `.glass-surface-subtle`: Subtle glass background for cards

## Recent Changes (March 2026)

### MEA Export API Endpoints Added
- Added `mea_export_utils` import to server.py
- Created `MEAExportRequest` Pydantic model
- Implemented 3 new endpoints for MEA export (CSV/XLSX/PDF)
- Installed `reportlab` dependency for PDF generation
- Removed Baseline/Drug/Light metric fields from Summary Preview in frontend

## Pending Tasks

### P0 - Completed
- ✅ MEA Export API endpoints working
- ✅ Summary Preview cleanup (removed Baseline/Drug/Light fields)

### P1 - High Priority (Upcoming)
- **MEA Comparison feature:** Build side-by-side comparison for multiple MEA recordings (currently disabled button)

### P2 - Medium Priority
- Refactor oversized files (`HomeBrowser.js` >1900 lines, `MEAAnalysis.js` >2900 lines)
- Fix Section Drag-and-Drop (recurring)
- Fix Excel export corruption (recurring)

### P3 - Low Priority
- Drug readout input values not clearing after being disabled
- Beat Frequency chart brush not interactive
- Brush/slider in TraceViewer.js resets zoom state on data changes
- Cannot delete a beat if activeDot is on it

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
            ├── MEAAnalysis.js      # MEA analysis view (>2900 lines)
            ├── MEAExportPanel.js   # MEA export tab UI
            ├── ExportPanel.js      # SSE export tab
            └── ...
```

## MEA CSV Format (Axion Biosystems)

### File Types Required
1. `*_spike_list.csv` - Spike timestamps per electrode
2. `*_electrode_burst_list.csv` - Burst events per electrode
3. `*_network_burst_list.csv` - Network-level burst events
4. `*_spike_counts.csv` - Spike counts for filtering
5. `*_environmental_data.csv` - Environmental conditions

### Format Notes
- First 2 columns contain metadata (Investigator, Recording Name, etc.)
- Data starts at column 3
- Electrode format: `WellRowWellCol_ElectrodeNum` (e.g., `A2_44`)
- Well ID extracted by parsing electrode string
