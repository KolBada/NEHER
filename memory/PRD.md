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

### P1 - High Priority (Upcoming)
- **MEA Comparison feature:** Side-by-side comparison for multiple recordings

### P2 - Medium Priority
- Refactor `MEAAnalysis.js` (~3130 lines)

### P3 - Low Priority
- Minor UI improvements
