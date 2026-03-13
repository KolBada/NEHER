# NEHER - Cardiac Electrophysiology Analysis Platform

## Overview
A full-stack electrophysiology analysis tool supporting two workflows:
- **SEM (Sharp Extracellular Microelectrode)**: For `.abf` files from cardiac activity recordings
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

### UI/UX (Partial)
- Glassmorphism dark theme applied to:
  - Home page (`HomeBrowser.js`)
  - SEM upload page (`FileUpload.js`)
  - MEA upload page (`MEAUpload.js`)
- Google Fonts integration (Space Grotesk, DM Sans)

## Recent Changes (December 2025)

### Fixed: MEA CSV Parsing for Axion Biosystems Format
- **Problem**: Parser expected standard CSV but Axion files have:
  - Metadata in columns 1-2
  - Data in columns 3+
  - Well ID embedded in Electrode column (e.g., `A2_44`)
- **Solution**: 
  - New `parseAxionCSV()` function to handle mixed format
  - New `extractWellFromElectrode()` to parse electrode strings
  - New `parseSpikeCountsAxion()` for wide-format spike counts

## Pending Tasks

### P1 - High Priority
- Apply glassmorphism theme to remaining pages:
  - `MEAAnalysis.js`
  - `AnalysisPanel.js`
  - `FolderComparison.js`

### P2 - Medium Priority
- Refactor oversized files (`export_utils.py`, `LightPanel.js`)
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
│   └── server.py
└── frontend/
    ├── public/
    │   └── index.html
    └── src/
        ├── App.js
        ├── App.css
        ├── index.css
        └── components/
            ├── HomeBrowser.js
            ├── FileUpload.js
            ├── MEAUpload.js      # Main fix location
            ├── MEAAnalysis.js
            ├── AnalysisPanel.js
            ├── FolderComparison.js
            └── ui/               # Shadcn components
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
