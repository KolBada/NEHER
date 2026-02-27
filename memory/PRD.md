# NeuroVoltage - Electrophysiology Analysis Platform PRD

## Original Problem Statement
Build a production-ready web application for electrophysiology analysis of sharp-electrode extracellular ABF recordings (WinLTP/Digidata). Scientific-grade, reliable, large-file capable.

## User Personas
- Electrophysiology researchers analyzing cardiac recordings
- Lab technicians processing WinLTP/Digidata ABF data
- Cardiac scientists studying HRV and light stimulation responses

## Architecture
- **Frontend**: React + Tailwind + shadcn/ui + Recharts
- **Backend**: FastAPI + pyABF + NumPy/SciPy
- **Database**: MongoDB (metadata only, files temporary)
- **Export**: openpyxl (XLSX), matplotlib (PDF)

## Core Requirements
1. ABF file upload (single/multiple)
2. Automatic beat detection with adjustable parameters
3. Manual beat add/delete by clicking
4. Beat validation → NN/BF computation
5. Artifact filtering (local median, ±5 window)
6. Spontaneous HRV analysis (sliding 3-min windows, RMSSD70, SDNN, pNN50)
7. Light stimulation mode (pulse detection, per-pulse HRV)
8. Light response metrics (peak BF, slope, amplitude)
9. Export: CSV, XLSX, PDF with representative graphs

## What's Been Implemented (Jan 2026)
- [x] ABF file upload with pyABF parsing (multi-sweep support)
- [x] Min-max trace decimation for efficient display
- [x] Auto beat detection using scipy.signal.find_peaks
- [x] Detection parameter controls (threshold, min distance, prominence, invert)
- [x] Manual beat editing (click to add/remove)
- [x] Beat validation → NN intervals, beat frequency computation
- [x] Artifact filtering (local median, 11-beat window)
- [x] Spontaneous HRV analysis (sliding 3-min windows)
- [x] HRV metrics: ln(RMSSD70), SDNN, pNN50, mean BF
- [x] 70 bpm normalization (857ms reference)
- [x] Light stimulation mode (configurable pulses)
- [x] Light-induced HRV (per-pulse + median across pulses)
- [x] Light response metrics (peak BF, normalized peak, time to peak, slope, amplitude)
- [x] Interactive trace viewer with Recharts (zoom via Brush, beat markers)
- [x] Dark scientific UI theme (Manrope/Inter/JetBrains Mono fonts)
- [x] CSV, XLSX, PDF export with summary tables and graphs
- [x] File selector for multi-file support
- [x] Per-beat data table with filter status

## Prioritized Backlog
### P0 (Completed)
All core workflow features implemented and tested.

### P1 (Next)
- Drug workflow support (baseline → light → drug → stabilization → on-drug)
- Propranolol (12 min) and Nepicastat (42 min) stabilization
- Cohort-normalized beat frequency
- Merged multi-file analysis

### P2 (Enhancement)
- Manual epoch boundary adjustment for light pulses
- Drag-to-select time regions
- Configurable artifact filter window size
- Session persistence (save/load analysis state)
- Batch processing mode
