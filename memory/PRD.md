# NEHER - Cardiac Electrophysiology Analysis Platform

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings. The application supports uploading `.abf` files, filtering voltage traces, detecting beats, and performing detailed analysis with persistent storage in MongoDB.

## Core Features
1. **Core Workflow:** Upload -> Analyze (Spontaneous, Light Stim, Drug) -> Export -> Save/Load analysis sessions from folders
2. **Folder Comparison:** Aggregated data tables, folder averages, expandable normalized data, PDF/Excel exports
3. **Trace Visualization:** Unified zoom system, full-duration timeline slider, decimal minute time axes
4. **Folder Organization:** Collapsible sections, customizable folder colors, drag-and-drop reordering
5. **Sorting:** Alphabetical, date created, last modified for folders and recordings

## Tech Stack
- **Frontend:** React, Tailwind CSS, shadcn/ui, Recharts, lucide-react
- **Backend:** FastAPI (Python)
- **Database:** MongoDB

## What's Been Implemented

### Session: December 2025 - UI/UX Improvements
- ✅ Conditional labels on Save Recording screen
- ✅ "Edit" indicator with "Cancel" feature to revert unsaved changes
- ✅ State management refactor (loessFrac, baseline minutes lifted to App.js)
- ✅ UI layout refactoring in AnalysisPanel and LightPanel
- ✅ Baseline metrics bug fix (now correctly updates on re-compute)
- ✅ Delayed BF computation (only on button click)
- ✅ Drug Readout toggle guards and state management
- ✅ Spontaneous Activity UI fixes (March 4, 2026):
  - Full-width separator line between header and controls (touches borders)
  - Increased spacing between Baseline Metrics and Drug Metrics sections (space-y-8)
  - Drug Readout input labels now show "HRV (Perf.T):" and "BF (Perf.T):"
  - Drug Readout time badges show ranges: HRV "→ X-(X+3)min", BF "→ X-(X+1)min"
  - Helper text with tooltip: "Input = Perf. Time (after Perf. Start + Perf. Delay)"
  - Tooltip explains: Perf. Time, Perf. Start, Perf. Delay definitions
  - Drug Readout box widened to 320px for badge visibility

## Known Issues / Bugs
1. **P0 - Section Drag-and-Drop:** Only first 2 of 4 sections can be dragged on home page
2. **P1 - Drug readout inputs:** Not clearing values when enabled
3. **P1 - BF/NN chart visibility:** Needs verification for new uploads
4. **P1 - Beat Frequency chart brush:** Not interactive
5. **P1 - TraceViewer brush reset:** Zoom state resets on beat edits
6. **P1 - Beat deletion:** Cannot delete beat when activeDot is on it

## Upcoming Tasks (P1)
- Add light stimulation highlights to main TraceViewer
- Extend synchronized zoom to Spontaneous/Light tabs

## Future/Backlog (P2-P3)
- Refactor App.js (1700+ lines) - extract into custom hooks
- Refactor HomeBrowser.js drag-and-drop (consider dnd-kit library)
- Cohort Normalization functionality
- Batch Processing for multiple .abf files

## Key Files
- `frontend/src/App.js` - Main state management hub
- `frontend/src/components/AnalysisPanel.js` - Spontaneous Activity analysis
- `frontend/src/components/HomeBrowser.js` - Home page with sections/folders
- `frontend/src/components/LightPanel.js` - Light Stimulus analysis
- `frontend/src/components/TraceViewer.js` - Voltage trace visualization
- `backend/server.py` - FastAPI backend
- `backend/analysis.py` - Analysis computations
