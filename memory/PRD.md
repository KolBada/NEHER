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

**Spontaneous Activity Tab:**
- Row 1: Spike Trace + Burst Trace (glassmorphic charts)
- Row 2: Spike Raster + Burst Raster
- Row 3: Readout Configuration (baseline & drug windows for spike/burst)
- Row 4: Metric cards (baseline/drug spike/burst rates)
- Row 5: Spike/Burst distribution bar charts
- Row 6: Spike-Burst Correlation scatter plot (full width)
- Row 7: Per-Minute / Per-Bin tables with toggle switch

**Light Stimulus Tab:** Structure ready for light-induced analysis
**Save Recording & Export Tabs:** Placeholder UI matching SSE patterns

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

### MEA Analysis Page Redesign - Session 26 (December 2025)

**UI/UX Changes:**
- **Top Bar:** Reduced spacing between "Unsaved" badge and well chips, moved them directly adjacent
- **Drug Badge:** Simplified to just drug name + X button
- **Drug Readout:** Changed labels to "Perf. Start/Perf. Time" matching SSE
- **Parameters Tab:** Changed to 2-column layout (Spike Trace 2/3, Parameters 1/3)
- **Color Scheme:** Changed cyan (#00b8c4) to emerald (#10b981) for spike-related elements throughout
- **Readout Configuration:** Border and icon change to magenta when drugs selected

**Bug Fixes:**
- Fixed burst data parsing in `MEAUpload.js` (lines 483-530)
  - Now correctly uses `row.stop` field when available instead of calculating from duration
  - **Added burst timestamp correction:** Detects offset between file-referenced burst timestamps and experiment-referenced spike timestamps, applies correction automatically
  - Applies same correction to network_burst_list.csv
- Created separate `SpikeRasterPlot` and `BurstRasterPlot` components in `MEAAnalysis.js`
  - Spike raster shows vertical ticks at spike timestamps
  - Burst raster shows horizontal bars from start to stop times

**Light Stimulus Tab - Full Implementation (December 2025):**
- Complete rebuild following SSE Light Stimulus workflow:
  1. **Spike Trace + Burst Trace** with synchronized light pulse overlays
  2. **Zoom controls** for detailed inspection of stimuli
  3. **Detected stim editor boxes** below each trace for pulse adjustment
  4. **Light Stimulation Analysis block** with:
     - Approx. Start time, Pulse Duration, Intervals, Pulses, Search Range
     - AI light stim detector toggle
     - "Detect Light Stimulus" and "Compute Spike and Burst" buttons
  5. **Light Metrics Cards** showing:
     - Baseline/Avg/Max spike rates and change percentages
     - Baseline/Avg/Max burst rates and change percentages
     - Time to peak metrics
  6. **Per-Stim Table** with individual stim metrics
  7. Baseline calculation: -2 to -1 minute before first light stimulation

**MEA Analysis Components Implemented:**
1. **Parameters Tab:** Spike trace chart, bin size controls, electrode filter, well info, validate button
2. **Spontaneous Activity Tab:**
   - Spike Trace + Burst Trace charts (side by side)
   - Spike Raster + Burst Raster plots (side by side)
   - Readout Configuration box (baseline & drug settings)
   - Spike-Burst Correlation scatter plot
   - Per-Minute / Per-Bin metric tables with toggle switch
3. **Light Stimulus Tab:** Placeholder with light enable toggle
4. **Save Recording Tab:** Placeholder with save button
5. **Export Tab:** Placeholder with Excel/PDF buttons

**Verified Working (Test Report #26):**
- MEA Upload page loads correctly with 5 required CSV files
- Glassmorphism styling matches app theme
- File drop zone functional with .csv filter
- Back button navigation
- Analyze Files button state management

### Glassmorphism UI/UX Overhaul - Phase 3 (December 2025 - Latest)

**Light Stimulus Tab Overhaul (December 2025):**
- **Fused Panel:** Combined "Light Stimulation Analysis" header, Configuration, and "Detected Light Stims" into a single glassmorphic panel with amber (3px) left border accent
- **HR Divider:** Added subtle horizontal rule separator between Configuration and Detected Stims sections
- **Brush Transparency:** Changed the chart Brush component fill to transparent (was #0c0c0e)
- **Stim Editing Controls:** Applied glassmorphism to the pulse adjustment controls bar (transparent background with blur)
- **DetrendingVisualization:** Updated container to `glass-surface-subtle` with emerald left border accent
- **Three-Panel View:** Updated Panel A/B/C detrending charts to glassmorphic styling with proper color-coded headers (emerald for Panel A, secondary for Panel B, amber for Panel C)
- **Chart Tooltips:** Updated all tooltips to glassmorphic style with backdrop blur

**Final MEA Light Stimulus Polish Pass (December 2025):**
Comprehensive UI/UX polish implementing SSE-style features:
1. **Unified Stim Editor Controls:** Both spike and burst traces now have identical SSE-style Start/End buttons (removed +/- 5s from burst trace)
2. **Light Boxes on Rasters:** Yellow stimulus overlay boxes now appear on both spike and burst rasters in Light Stimulus tab
3. **Synchronized Zoom:** All 4 charts in Light Stimulus tab share `lightZoomDomain` state for synchronized zoom/pan
4. **Corrected Metric Formulas:** Changed from `100 * (avg - baseline) / baseline` to `100 * avg / baseline`
5. **Extended Per-Stim Table:** Added 6 new columns: Spike Δ%, Burst Δ%, Peak Spike Δ%, Peak Burst Δ%, Time→Peak Spike, Time→Peak Burst
6. **Raster Y-Axis Labels:** Now show "Electrode (n=X)" format where X is electrode count
7. **Drug Boxes in Spontaneous Activity:** Purple drug overlay boxes appear on rasters when drug is selected
8. **Parameters Tab:** Now shows stacked Spike and Burst traces in "All Electrodes Trace" section

**MEA Drug/Light Overlay Fixes (December 2025):**
1. **Drug Window Logic Fixed:** Perf. Start = when drug added (purple box starts), Perf. Time = offset from Perf. Start for readout (so if Perf.Start=3min and Perf.Time=4min, readout at 7min), purple box extends to END of recording
2. **Purple Drug Boxes on ALL Traces:** Now appear on Spike/Burst traces in Spontaneous Activity AND Light Stimulus tabs
3. **Amber Light Boxes in Spontaneous Activity:** Light stim boxes now show on traces AND rasters
4. **Parameters Tab Overlays:** Both drug (purple) and light (amber) boxes appear on traces
5. **Button Renamed:** "Validate Parameters" → "Update Parameters"
6. **SSE-Style Stim Editor:** Added Start: () < > | End: () < > | or Click Start End layout with ±bin controls (spike trace uses spike bin, burst trace uses burst bin)

**MEA Zoom Controls and Save Recording (December 2025):**
1. **New Zoom Chart Components:** Created SpikeTraceChartWithZoom, BurstTraceChartWithZoom, SpikeRasterPlotWithZoom, BurstRasterPlotWithZoom with + - buttons (Reset shows only when zoomed)
2. **Parameters Tab:** Both Spike and Burst traces now have zoom controls with synchronized zoom via `parametersZoomDomain`
3. **Spontaneous Activity Tab:** All 4 charts (spike trace, burst trace, spike raster, burst raster) now have zoom controls synchronized via `spontaneousZoomDomain`
4. **Light Stimulus Tab:** Rasters now use zoom components synchronized with traces via `lightZoomDomain`
5. **Save Recording Tab:** Now uses full SaveRecording component with:
   - Tissue Information (Fusion Date, Sample Info with cell type, line name, passage, differentiation date, transfection)
   - Recording Information (date, name, description, folder selection)

**MEA Final Fixes (December 2025):**
1. **MEA Recording Routing Fixed:** Added `source_type: 'MEA'` to getAnalysisState so saved MEA recordings open in MEA analysis (not SSE)
2. **Save Recording Emerald Colors:** Added `isMEA` prop to SaveRecording component - icons and buttons now use emerald (#10b981) for MEA
3. **Sliding Bar Removed:** Removed Brush/slider from all 6 traces (Parameters, Spontaneous, Light Stimulus)
4. **Drug Overlay Fixed:** Purple drug box now shows on ALL traces (including Spike traces in all 3 sections)
5. **Drug Overlay on Zoom Fixed:** ReferenceArea now uses clipped bounds (Math.max/min with zoomDomain) and `ifOverflow="hidden"`
6. **Reset Button:** Now only shows when zoomed (isZoomed check)
7. **Time Axis Format:** X-axis now shows 1 decimal place via `tickFormatter={(v) => v.toFixed(1)}`

**MEA Chart Badges & UI Polish (December 2025):**
1. **Stim Count Badges:** Added "X stims" amber badge to all traces and rasters (Parameters, Spontaneous, Light Stimulus)
2. **Drug Name Badges:** Added purple drug name badge to all traces and rasters when drug is selected
3. **Stim Editor Values:** Start/End now show actual time values like `Start: (180.0s)` instead of empty `()`
4. **Info Tooltip:** Added (i) tooltip explaining manual light detection (arrows adjust by bin, click sets exact position)
5. **MEA File Saving Fixed:** Now saves actual CSV file names instead of "unknown.abf" - uses `source_files` from meaData
6. **SSE Badge:** Added "SSE" badge (in F4CEA2 color) for non-MEA recordings in folder view
7. **Save Success Glassmorphism:** Updated save confirmation box to use glassmorphism styling with accent color border

**Bug Fixes (December 2025):**
- Fixed React hooks violation: Moved `useMemo` in BurstRasterPlot before early return (was causing app crash)
- Fixed crash with 0 active electrodes: Added all required properties to wellAnalysis early return object

**Latest UI Polish Pass (December 2025):**
- **Top Bar:** Improved sticky top bar with darker glassmorphic background for better differentiation
- **Drug Boxes:** Compact inline drug chips without running bar effect, properly spaced
- **Tab Bar:** Cleaner tab styling, removed unnecessary inner effects
- **Trace Tab:** Edit Beats button now uses black/dark background for differentiation; Brush sliders now transparent
- **Spontaneous Activity Tab:** Fused section with cyan/magenta accent line based on drug state; Purple icon
- **Save Recording Tab:** +Add Sample button white, proper spacing; hSpO styling emerald, hCO cyan; Update button emerald
- **Export Tab:** Summary Preview has more spacing; Recording names white

**Previous Fix (December 2025):**
- Aligned MEA upload card with SSE upload card by adding `pt-16` top padding
- Changed SSE "Analyze File" button from green gradient to neutral glassmorphic style

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

### P0 - In Progress (MEA Redesign)
- [ ] Build MEA Light Stimulus Tab - implement light stimulus analysis matching SSE workflow
- [ ] Build MEA Save Recording Tab - adapt SSE SaveRecording.js for MEA data
- [ ] Build MEA Export Tab - adapt SSE ExportPanel.js for MEA data

### P1 - Verified/Completed
- ✅ Light Stimulus tab UI overhaul (fused sections, amber accent, glassmorphism)
- ✅ SSE uploaded file state styling (already glassmorphic in FileUpload.js)
- ✅ MEA burst data parsing fix (December 2025)
- ✅ MEA Spontaneous Activity tab implementation (December 2025)
- ✅ MEA Parameters tab implementation (December 2025)
- ✅ MEA Light Stimulus tab full implementation with SSE-style features (December 2025)
- ✅ Unified stim editor controls across spike/burst traces (December 2025)
- ✅ Synchronized zoom/pan across Light Stimulus charts (December 2025)
- ✅ Extended per-stim metrics table with additional columns (December 2025)
- ✅ Drug/Light overlay boxes on rasters (December 2025)
- ✅ Fixed drug selection error (MEA_DRUGS → DRUG_CONFIG) (December 2025)
- ✅ Fixed saved MEA recording loading (source_files now restored) (December 2025)
- ✅ Fixed Tooltip error in stim editor (wrapped in TooltipProvider) (December 2025)
- ✅ Fixed MEA file names display (now show on separate lines) (December 2025)
- ✅ Fixed MEA save to include all well data (spikes, bursts, active_electrodes) (December 2025)

### P1 - High Priority (Upcoming)
- Build MEA Save Recording tab (adapt from SSE SaveRecording.js)
- Build MEA Export tab (adapt from SSE ExportPanel.js)

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
