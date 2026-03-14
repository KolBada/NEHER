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

**Pages with Glassmorphism:**
1. **Home Page** (`HomeBrowser.js`): Section rows, folder rows, toolbar buttons, dialogs, dropdown menus
2. **SSE Upload Page** (`FileUpload.js`): Centered upload box, matching buttons
3. **MEA Upload Page** (`MEAUpload.js`): Fixed Axion CSV parsing, matching layout
4. **Folder Recordings Page**: Glass-styled recording list items, action buttons, context menus
5. **Comparison Page** (`FolderComparison.js`): Summary cards with colored borders, tabs, data tables
6. **Single Recording Page** (`App.js`): Main tabs with glass styling and colored icons
7. **Trace Tab** (`TraceViewer.js`): Glass panel with silver border for trace display
8. **Spontaneous Activity Tab** (`AnalysisPanel.js`): BF/NN charts, baseline/drug readouts, HRV evolution
9. **Export Tab** (`ExportPanel.js`): Available data cards, format descriptions, export buttons

**Glass CSS Classes:**
- `.glass-surface`: Main glass panel with backdrop blur
- `.glass-surface-subtle`: Subtle glass background for cards

## Recent Changes (December 2025)

### Glassmorphism UI/UX Overhaul - Phase 3 (December 2025 - Latest)

**Surface 1: Folder Page Visual Overhaul**
- Added NEHER header branding to Folder page (matching Home page)
- Applied `neher-home-bg` background with glow orbs for ambient atmosphere
- Created glassmorphism toolbar with styled Back button, folder name, and action buttons
- Recording rows now have glass styling with translucent backgrounds, subtle borders, and hover effects
- Recording icon backgrounds color-coded by source type (SSE=peach, MEA=emerald)
- All badges (beats, duration, light stim, drug) use rounded-full pill styling
- Comparison button has emerald glow effect
- Empty state has glass card styling
- Page now visually matches the Home page's premium glassmorphism aesthetic

### Glassmorphism UI/UX Overhaul - Phase 2
1. **Typography System Unified:**
   - Added Space Grotesk (400, 500, 600) for display text (titles, headings)
   - Added DM Sans (400, 500) for body text
   - Applied CSS variables `--font-display` and `--font-body` globally

2. **Comparison Page Cleanup:**
   - Removed colored left border lines from all stat cards (RECORDINGS, hSpOs, hCOs, FUSION AGE)
   - Removed left borders from Spontaneous Activity, Light Stimulus, and Metadata sections
   - Updated typography with proper font families and weights

3. **Single Recording Page:**
   - Top navigation bar now has glassmorphism with backdrop blur
   - File info badge uses monospace font
   - Recording name input properly styled

4. **Trace Tab (Beat Detection Sidebar):**
   - Full glassmorphism applied to Detection Panel
   - Threshold section highlighted with amber tint
   - Signal stats cards with glass styling
   - Preset buttons (Default/Strict/Loose) with glass styling

5. **Spontaneous Activity Tab:**
   - Removed colored left borders from BF and NN chart panels
   - Removed border from "Spontaneous Activity Analysis" header
   - Removed border from "Evolution of HRV Metrics" section
   - Removed border from "Per-Minute Metrics" section

6. **Export Tab:**
   - Removed colored left borders from all sections
   - Applied glass styling to available data cards

### Previous Glassmorphism Updates
- Home page sections and folders
- SSE and MEA upload pages
- Folder recordings view
- Dialogs and dropdown menus

## Pending Tasks

### P2 - Medium Priority
- Refactor oversized files (`HomeBrowser.js` >1700 lines, `export_utils.py`, `LightPanel.js`)
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
        ├── App.js           # Main tabs glassmorphism
        ├── App.css          # Glass helper classes
        ├── index.css        # CSS color variables
        └── components/
            ├── HomeBrowser.js      # Home page (>1700 lines)
            ├── FileUpload.js       # SSE upload
            ├── MEAUpload.js        # MEA upload with Axion parsing
            ├── MEAAnalysis.js      # MEA analysis view
            ├── AnalysisPanel.js    # Spontaneous Activity tab
            ├── FolderComparison.js # Comparison page
            ├── TraceViewer.js      # Trace display
            ├── LightPanel.js       # Light stimulus analysis
            ├── ExportPanel.js      # Export tab
            └── ui/                 # Shadcn components
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
