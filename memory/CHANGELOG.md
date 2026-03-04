# NEHER Changelog

## Mar 3, 2026

### X-Axis Label Overlap Fix
- **Fixed P0 Issue:** The "(min)" label on chart X-axes was being overlapped by the brush/slider component
- **Solution:** Changed label positioning from `insideBottomRight` to `insideBottom` with `offset: -45`
- **Label text:** Changed from "min" to "(min)" for better visual clarity
- **Files modified:**
  - `/app/frontend/src/components/TraceViewer.js` (line 443)
  - `/app/frontend/src/components/AnalysisPanel.js` (lines 426, 502, 827)
  - `/app/frontend/src/components/LightPanel.js` (line 675)
- **Testing:** Verified via screenshots across Trace, Spontaneous Activity, and Light Stimulus tabs

## Mar 2, 2026

### Synchronized Zooming Implementation
- Implemented synchronized zoom between main beat detection trace and BF chart in Trace tab
- Lifted zoom state (`sharedZoomDomain`) to App.js for cross-component sharing
- Fixed BF chart zoom by adding `allowDataOverflow={true}` to XAxis
- Removed non-interactive BF chart brush (now controlled by main trace's brush)

### BF Chart Persistence
- BF chart now remains visible after "Reset Validation" click
- Shows "(previous detection)" label when not validated but metrics exist

### UI/UX Refinements
- Changed trace colors: Beat detection (silver), BF charts (emerald green), NN chart (forest green)
- Standardized brush/slider styling: grey borders, white handles, larger text
- Redesigned Baseline/Drug readout boxes with toggle buttons
- Added yellow "Light" badge and purple drug badge to header
- Swapped comparison table baseline colors: Spontaneous (blue), Light Stim (yellow)
