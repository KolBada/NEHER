# NEHER - Cardiac Electrophysiology Analysis Platform

## Original Problem Statement
Build a comprehensive electrophysiology analysis platform supporting both Sharp Single Electrode (SSE) and Multi-Electrode Array (MEA) recording analysis with comparison, export, and visualization features.

## Current Session - Corrective Polish Pass (2025-12-17)

### Latest Update:
- **MEA Comparison Export Redesign**: Rewrote MEA comparison PDF and Excel export functions to use the EXACT same design as SSE exports (bioptima style). Includes:
  - Summary page with folder overview, age ranges, parameters, spontaneous activity, and light stimulus sections
  - Metadata table with recording information
  - Spontaneous activity tables (raw + normalized)
  - Light stimulus spike/burst tables (raw + normalized)
  - Consistent styling, colors, fonts, and layout matching SSE

### Fixes Applied This Session:
1. **Baseline Readout Label**: Changed "Minute" → "Perf. Time" with correct range display
2. **Drug Readout Range**: Fixed calculation to show correct range (frontend + backend aligned)
3. **Recording Name in Top Bar**: Now shows editable recording name instead of well ID
4. **Comparison Modal**: Removed duplicate close/export buttons, applied dark blue background
5. **MEA Per Stimuli Charts**: Added cyan baseline reference line to legend for all spike/burst metrics
6. **Backend Data Consistency**: Corrected drug time window calculation
7. **MEA Export Design**: Unified MEA comparison exports to match SSE bioptima-style design

### Pending Verification:
- MEA comparison PDF/Excel export testing (user verification needed)

## Core Features Implemented:

### SSE Analysis
- .abf file upload and parsing
- Beat detection with filtering
- Beat frequency and HRV analysis
- Drug response tracking
- Light stimulus analysis
- Per-minute metrics tables
- Export to Excel/PDF

### MEA Analysis
- 5-CSV file upload (spike list, burst list, etc.)
- Multi-well support with well selection
- Spike and burst rate analysis
- Light stimulus per-electrode analysis
- Drug perfusion tracking
- Comparison modal from single recording view
- Export to Excel/PDF

### Folder Comparison System
- SSE and MEA comparison pages
- Normalized metrics tables
- Per-metric visualization charts with baseline reference lines
- Recording inclusion/exclusion toggles
- Export aggregated data

## Technical Architecture:
- Frontend: React + Shadcn UI + Recharts
- Backend: FastAPI + Python
- Database: MongoDB
- State: Local component state with prop drilling

## Key Files:
- `/app/frontend/src/components/MEAAnalysis.js` (~3300 lines)
- `/app/frontend/src/components/FolderComparison.js` (~3600 lines)
- `/app/backend/server.py` (~2500 lines)

## Backlog:
- P1: Refactor large components into smaller modules
- P2: Add more drug configurations
- P2: Improve export file naming consistency
