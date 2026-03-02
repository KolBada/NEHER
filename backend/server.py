from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import tempfile
import io
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
import numpy as np

import analysis
import storage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# In-memory session store
sessions = {}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Pydantic Models ---
class DetectBeatsRequest(BaseModel):
    session_id: str
    file_id: str
    threshold: Optional[float] = None
    min_distance: Optional[float] = None
    prominence: Optional[float] = None
    invert: bool = False


class ComputeMetricsRequest(BaseModel):
    beat_times_sec: List[float]
    filter_lower_pct: float = 50.0
    filter_upper_pct: float = 200.0


class HRVAnalysisRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    readout_minute: Optional[int] = None
    baseline_hrv_minute: int = 0  # HRV readout at this minute (uses 3-min window)
    baseline_bf_minute: int = 1   # BF readout at this minute


class LightDetectRequest(BaseModel):
    start_time_sec: float = 180.0
    pulse_duration_sec: float = 20.0
    interval_sec: Optional[str] = 'decreasing'
    n_pulses: int = 5
    auto_detect: bool = False
    beat_times_min: Optional[List[float]] = None
    bf_filtered: Optional[List[float]] = None
    search_range_sec: float = 20.0


class LightHRVRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    pulses: List[dict]


class LightResponseRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    pulses: List[dict]


class PerMinuteRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]


class ExportRequest(BaseModel):
    per_beat_data: Optional[List[dict]] = None
    hrv_windows: Optional[List[dict]] = None
    light_metrics: Optional[List[dict]] = None
    light_metrics_detrended: Optional[dict] = None  # Corrected HRV (Detrended) data
    light_response: Optional[List[dict]] = None
    light_pulses: Optional[List[dict]] = None  # For showing light stim zones on charts
    summary: Optional[dict] = None
    filename: str = "analysis"
    recording_name: Optional[str] = None
    drug_used: Optional[str] = None
    per_minute_data: Optional[List[dict]] = None
    baseline: Optional[dict] = None
    drug_readout: Optional[dict] = None  # Drug readout timing info for highlighting
    perfusion_params: Optional[dict] = None  # Perfusion parameters for export
    # Full recording beat-by-beat data
    full_recording_data: Optional[List[dict]] = None
    # Light stim isolated beat-by-beat data
    light_stim_data: Optional[List[dict]] = None
    # Original ABF filename
    original_filename: Optional[str] = None
    # Recording metadata
    recording_date: Optional[str] = None  # Date of recording
    fusion_date: Optional[str] = None  # Fusion date (shared for all samples)
    days_since_fusion: Optional[int] = None  # Calculated days since fusion
    organoid_info: Optional[List[dict]] = None  # List of sample info with transfection
    recording_description: Optional[str] = None  # Description/notes


# --- Endpoints ---
@api_router.get("/")
async def root():
    return {"message": "NeuCarS API"}


@api_router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    import pyabf

    session_id = str(uuid.uuid4())
    sessions[session_id] = {}
    result_files = []

    for uploaded in files:
        fname = uploaded.filename or ''
        if not fname.lower().endswith('.abf'):
            raise HTTPException(400, f"Only .abf files are supported. Got: '{fname}'. Please rename your file with .abf extension if needed.")

        file_id = str(uuid.uuid4())
        content = await uploaded.read()

        with tempfile.NamedTemporaryFile(suffix='.abf', delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            try:
                abf = pyabf.ABF(tmp_path)
            except Exception as parse_err:
                raise HTTPException(400, f"Failed to parse ABF file '{fname}': {str(parse_err)}")
            abf.setSweep(0, channel=0)
            trace = abf.sweepY.copy().astype(np.float64)
            times = abf.sweepX.copy().astype(np.float64)
            sample_rate = abf.dataRate

            # Handle multi-sweep by concatenating
            if abf.sweepCount > 1:
                all_traces = [trace]
                all_times = [times]
                offset = times[-1] + 1.0 / sample_rate
                for sw in range(1, abf.sweepCount):
                    abf.setSweep(sw, channel=0)
                    all_traces.append(abf.sweepY.copy().astype(np.float64))
                    sw_times = abf.sweepX.copy().astype(np.float64) + offset
                    all_times.append(sw_times)
                    offset = sw_times[-1] + 1.0 / sample_rate
                trace = np.concatenate(all_traces)
                times = np.concatenate(all_times)

            sessions[session_id][file_id] = {
                'filename': uploaded.filename,
                'trace': trace,
                'times': times,
                'sample_rate': sample_rate,
            }

            dec_times, dec_voltages = analysis.decimate_trace(times, trace)
            beat_indices = analysis.detect_beats(trace, sample_rate)
            beat_times_sec = [float(times[i]) for i in beat_indices if i < len(times)]
            beat_voltages = [float(trace[i]) for i in beat_indices if i < len(trace)]

            signal_stats = {
                'min': float(np.min(trace)),
                'max': float(np.max(trace)),
                'mean': float(np.mean(trace)),
                'std': float(np.std(trace))
            }

            result_files.append({
                'file_id': file_id,
                'filename': uploaded.filename,
                'sample_rate': sample_rate,
                'duration_sec': float(len(trace) / sample_rate),
                'n_samples': len(trace),
                'n_channels': abf.channelCount,
                'n_sweeps': abf.sweepCount,
                'trace_times': dec_times,
                'trace_voltages': dec_voltages,
                'beats': [{'time_sec': t, 'voltage': v} for t, v in zip(beat_times_sec, beat_voltages)],
                'signal_stats': signal_stats,
                'n_beats_detected': len(beat_indices)
            })
        finally:
            os.unlink(tmp_path)

    return {'session_id': session_id, 'files': result_files}


@api_router.post("/detect-beats")
async def detect_beats_endpoint(request: DetectBeatsRequest):
    session = sessions.get(request.session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    file_data = session.get(request.file_id)
    if not file_data:
        raise HTTPException(404, "File not found")

    trace = file_data['trace']
    times = file_data['times']
    sr = file_data['sample_rate']

    min_dist = int(request.min_distance * sr) if request.min_distance else None
    beat_indices = analysis.detect_beats(
        trace, sr,
        threshold=request.threshold,
        min_distance=min_dist,
        prominence=request.prominence,
        invert=request.invert
    )

    beat_times_sec = [float(times[i]) for i in beat_indices if i < len(times)]
    beat_voltages = [float(trace[i]) for i in beat_indices if i < len(trace)]

    return {
        'beats': [{'time_sec': t, 'voltage': v} for t, v in zip(beat_times_sec, beat_voltages)],
        'n_beats': len(beat_indices)
    }


@api_router.post("/compute-metrics")
async def compute_metrics_endpoint(request: ComputeMetricsRequest):
    if len(request.beat_times_sec) < 2:
        raise HTTPException(400, "Need at least 2 beats")

    beat_times_sec = sorted(request.beat_times_sec)
    beat_times_min, nn_ms, bf_bpm = analysis.compute_beat_metrics(beat_times_sec)
    # artifact_filter returns (mask, filtered_bf)
    filter_mask, _ = analysis.artifact_filter(
        bf_bpm, 
        lower_pct=request.filter_lower_pct, 
        upper_pct=request.filter_upper_pct
    )

    bt_arr = np.array(beat_times_min)
    nn_arr = np.array(nn_ms)
    bf_arr = np.array(bf_bpm)
    mask_arr = np.array(filter_mask)

    # Filtered values (NN/BF arrays are N-1, correspond to intervals starting at beat k)
    filtered_bt = bt_arr[:-1][mask_arr].tolist()
    filtered_nn = nn_arr[mask_arr].tolist()
    filtered_bf = bf_arr[mask_arr].tolist()

    return {
        'beat_times_min': [float(x) for x in beat_times_min],
        'nn_intervals_ms': [float(x) for x in nn_ms],
        'beat_freq_bpm': [float(x) for x in bf_bpm],
        'artifact_mask': filter_mask,
        'filtered_beat_times_min': [float(x) for x in filtered_bt],
        'filtered_nn_ms': [float(x) for x in filtered_nn],
        'filtered_bf_bpm': [float(x) for x in filtered_bf],
        'n_total': len(beat_times_sec),
        'n_kept': int(np.sum(mask_arr)),
        'n_removed': int(np.sum(~mask_arr)),
        'filter_settings': {
            'lower_pct': request.filter_lower_pct,
            'upper_pct': request.filter_upper_pct
        }
    }


@api_router.post("/hrv-analysis")
async def hrv_analysis_endpoint(request: HRVAnalysisRequest):
    if len(request.beat_times_min) < 6:
        raise HTTPException(400, "Need at least 6 beats for HRV")
    results, readout = analysis.spontaneous_hrv_analysis(
        request.beat_times_min, request.bf_filtered, request.readout_minute
    )
    
    # Compute baseline metrics - pass hrv_windows to ensure numerical consistency
    baseline = analysis.compute_baseline_metrics(
        request.beat_times_min, request.bf_filtered,
        hrv_windows=results,  # Pass pre-computed windows for HRV baseline lookup
        hrv_minute=request.baseline_hrv_minute,
        bf_minute=request.baseline_bf_minute
    )
    
    return {'windows': results, 'readout': readout, 'baseline': baseline}


@api_router.post("/light-detect")
async def light_detect_endpoint(request: LightDetectRequest):
    start_sec = request.start_time_sec

    # Auto-detect light start from BF increase
    if request.auto_detect and request.beat_times_min and request.bf_filtered:
        start_sec = analysis.auto_detect_light_start(
            request.beat_times_min, request.bf_filtered,
            request.start_time_sec, request.search_range_sec
        )

    # Parse interval
    interval_arg = request.interval_sec
    if interval_arg == 'decreasing' or interval_arg is None:
        interval_arg = None  # Will use default decreasing
    else:
        try:
            interval_arg = float(interval_arg)
        except (ValueError, TypeError):
            interval_arg = None

    pulses = analysis.generate_pulses(
        start_sec, request.pulse_duration_sec,
        interval_pattern=interval_arg if interval_arg else 'decreasing', 
        n_pulses=request.n_pulses
    )
    return {'pulses': pulses, 'detected_start_sec': start_sec}


@api_router.post("/light-hrv")
async def light_hrv_endpoint(request: LightHRVRequest):
    hrv_result = analysis.compute_light_hrv(
        request.beat_times_min, request.bf_filtered, request.pulses
    )
    return {'per_pulse': hrv_result['per_pulse'], 'final': hrv_result['final']}


@api_router.post("/light-response")
async def light_response_endpoint(request: LightResponseRequest):
    per_stim, mean_metrics, baseline_bf = analysis.compute_light_response_v2(
        request.beat_times_min, request.bf_filtered, request.pulses
    )
    return {
        'per_stim': per_stim,
        'mean_metrics': mean_metrics,
        'baseline_bf': baseline_bf
    }


class LightHRVDetrendedRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    pulses: List[dict]
    loess_frac: float = 0.25  # LOESS span (20-30% of stim duration)


@api_router.post("/light-hrv-detrended")
async def light_hrv_detrended_endpoint(request: LightHRVDetrendedRequest):
    """
    Compute Corrected Light-Induced HRV using LOESS detrending.
    Removes slow deterministic adaptation curves to isolate true beat-to-beat variability.
    """
    result = analysis.compute_light_hrv_detrended(
        request.beat_times_min, request.bf_filtered, request.pulses, request.loess_frac
    )
    return {'per_pulse': result['per_pulse'], 'final': result['final']}


@api_router.post("/per-minute-metrics")
async def per_minute_metrics_endpoint(request: PerMinuteRequest):
    if len(request.beat_times_min) < 2:
        raise HTTPException(400, "Need at least 2 beats")
    # per_minute_aggregation requires nn_70, compute it from bf_filtered
    nn_values = analysis.bf_to_nn(request.bf_filtered)
    nn_70 = analysis.normalize_nn_70_windowing(request.beat_times_min, nn_values)
    rows = analysis.per_minute_aggregation(request.beat_times_min, request.bf_filtered, nn_70)
    return {'rows': rows}


# ==============================================================================
# STORAGE API - Folders and Recordings
# ==============================================================================

@api_router.get("/folders")
async def get_folders_endpoint():
    """Get all folders with recording counts."""
    folders = await storage.get_folders(db)
    return {"folders": folders}


@api_router.post("/folders")
async def create_folder_endpoint(request: storage.FolderCreate):
    """Create a new folder."""
    folder = await storage.create_folder(db, request.name)
    return folder


@api_router.get("/folders/{folder_id}")
async def get_folder_endpoint(folder_id: str):
    """Get a single folder."""
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return folder


@api_router.put("/folders/{folder_id}")
async def update_folder_endpoint(folder_id: str, request: storage.FolderUpdate):
    """Update a folder's name."""
    folder = await storage.update_folder(db, folder_id, request.name)
    if not folder:
        raise HTTPException(404, "Folder not found")
    return folder


@api_router.delete("/folders/{folder_id}")
async def delete_folder_endpoint(folder_id: str):
    """Delete a folder and all its recordings."""
    success = await storage.delete_folder(db, folder_id)
    if not success:
        raise HTTPException(404, "Folder not found")
    return {"success": True}


@api_router.get("/folders/{folder_id}/recordings")
async def get_recordings_endpoint(folder_id: str):
    """Get all recordings in a folder."""
    # Verify folder exists
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    recordings = await storage.get_recordings_in_folder(db, folder_id)
    return {"folder": folder, "recordings": recordings}


@api_router.post("/recordings")
async def create_recording_endpoint(request: storage.RecordingCreate):
    """Create a new recording in a folder."""
    # Verify folder exists
    folder = await storage.get_folder(db, request.folder_id)
    if not folder:
        raise HTTPException(404, "Folder not found")
    
    # Check for duplicates
    is_duplicate = await storage.check_duplicate_recording(db, request.folder_id, request.filename)
    if is_duplicate:
        raise HTTPException(400, f"A recording with filename '{request.filename}' already exists in this folder")
    
    recording = await storage.create_recording(db, request.folder_id, request.name, request.filename, request.analysis_state)
    return recording


@api_router.get("/recordings/{recording_id}")
async def get_recording_endpoint(recording_id: str):
    """Get a single recording with full analysis state."""
    recording = await storage.get_recording(db, recording_id)
    if not recording:
        raise HTTPException(404, "Recording not found")
    return recording


@api_router.put("/recordings/{recording_id}")
async def update_recording_endpoint(recording_id: str, request: storage.RecordingUpdate):
    """Update a recording's name and/or analysis state."""
    recording = await storage.update_recording(db, recording_id, request.name, request.analysis_state)
    if not recording:
        raise HTTPException(404, "Recording not found")
    return recording


@api_router.delete("/recordings/{recording_id}")
async def delete_recording_endpoint(recording_id: str):
    """Delete a recording."""
    success = await storage.delete_recording(db, recording_id)
    if not success:
        raise HTTPException(404, "Recording not found")
    return {"success": True}


@api_router.post("/recordings/{recording_id}/move")
async def move_recording_endpoint(recording_id: str, request: storage.RecordingMove):
    """Move a recording to a different folder."""
    recording = await storage.move_recording(db, recording_id, request.target_folder_id)
    if not recording:
        raise HTTPException(400, "Could not move recording. Target folder may not exist or a duplicate filename exists.")
    return recording


@api_router.post("/recordings/batch-update")
async def batch_update_recordings():
    """
    Check all recordings for outdated metrics and recompute them.
    Only recomputes sections that were already computed in each recording.
    Returns list of updated recording names.
    """
    import logging
    
    outdated = await storage.get_outdated_recordings(db)
    updated_recordings = []
    
    for rec in outdated:
        try:
            state = rec["analysis_state"]
            recording_name = rec["name"]
            updated_sections = []
            
            # Get the required data for recomputation
            metrics = state.get("metrics")
            if not metrics:
                continue  # Can't recompute without base metrics
            
            beat_times_min = metrics.get("filtered_beat_times_min", [])
            bf_filtered = metrics.get("filtered_bf_bpm", [])
            
            if not beat_times_min or not bf_filtered:
                continue  # Can't recompute without beat data
            
            # Check and recompute HRV results (Spontaneous Activity)
            if state.get("hrvResults"):
                try:
                    hrv_windows = analysis.compute_rolling_hrv(beat_times_min, bf_filtered)
                    baseline = None
                    if hrv_windows:
                        baseline = analysis.compute_baseline_metrics(
                            beat_times_min, bf_filtered, 
                            hrv_windows=hrv_windows, hrv_minute=0, bf_minute=1
                        )
                    state["hrvResults"] = {
                        "windows": hrv_windows,
                        "baseline": baseline
                    }
                    updated_sections.append("HRV")
                except Exception as e:
                    logging.warning(f"HRV recomputation failed for {recording_name}: {e}")
            
            # Check and recompute Light Response (HRA)
            if state.get("lightResponse") and state.get("lightPulses"):
                try:
                    pulses = state["lightPulses"]
                    per_stim, mean_metrics, baseline_bf = analysis.compute_light_response_v2(
                        beat_times_min, bf_filtered, pulses
                    )
                    state["lightResponse"] = {
                        "per_stim": per_stim,
                        "mean_metrics": mean_metrics,
                        "baseline_bf": baseline_bf
                    }
                    updated_sections.append("Light HRA")
                except Exception as e:
                    logging.warning(f"Light HRA recomputation failed for {recording_name}: {e}")
            
            # Check and recompute Light HRV
            if state.get("lightHrv") and state.get("lightPulses"):
                try:
                    pulses = state["lightPulses"]
                    per_pulse, final_metrics = analysis.compute_light_hrv(
                        beat_times_min, bf_filtered, pulses
                    )
                    state["lightHrv"] = {
                        "per_pulse": per_pulse,
                        "final": final_metrics
                    }
                    updated_sections.append("Light HRV")
                except Exception as e:
                    logging.warning(f"Light HRV recomputation failed for {recording_name}: {e}")
            
            # Check and recompute Detrended HRV
            if state.get("lightHrvDetrended") and state.get("lightPulses"):
                try:
                    pulses = state["lightPulses"]
                    loess_frac = state.get("lightParams", {}).get("loessFrac", 0.25)
                    detrended_results = analysis.compute_light_hrv_detrended(
                        beat_times_min, bf_filtered, pulses, loess_frac
                    )
                    state["lightHrvDetrended"] = detrended_results
                    updated_sections.append("Detrended HRV")
                except Exception as e:
                    logging.warning(f"Detrended HRV recomputation failed for {recording_name}: {e}")
            
            # Save updated state if any sections were updated
            if updated_sections:
                success = await storage.update_recording_metrics_version(db, rec["id"], state)
                if success:
                    updated_recordings.append({
                        "name": recording_name,
                        "sections": updated_sections
                    })
                    logging.info(f"Updated recording '{recording_name}': {', '.join(updated_sections)}")
        
        except Exception as e:
            logging.error(f"Error updating recording {rec.get('name', 'unknown')}: {e}")
            continue
    
    return {
        "updated_count": len(updated_recordings),
        "current_version": storage.METRICS_VERSION,
        "recordings": updated_recordings
    }


# ==============================================================================
# EXPORT API
# ==============================================================================

@api_router.post("/export/csv")
async def export_csv(request: ExportRequest):
    output = io.StringIO()
    if request.per_beat_data:
        keys = request.per_beat_data[0].keys() if request.per_beat_data else []
        output.write(','.join(keys) + '\n')
        for row in request.per_beat_data:
            output.write(','.join(str(row.get(k, '')) for k in keys) + '\n')

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.csv"}
    )


@api_router.post("/export/xlsx")
async def export_xlsx(request: ExportRequest):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, NamedStyle
    from openpyxl.utils import get_column_letter
    import numpy as np
    
    wb = openpyxl.Workbook()
    
    # CELL magazine style definitions
    header_font = Font(bold=True, color="FFFFFF", size=11, name='Arial')
    header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    header_fill_purple = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
    header_fill_amber = PatternFill(start_color="D97706", end_color="D97706", fill_type="solid")
    header_fill_cyan = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")
    
    data_font = Font(size=10, name='Arial')
    title_font = Font(bold=True, size=14, name='Arial')
    subtitle_font = Font(bold=True, size=12, name='Arial', color="374151")
    
    thin_border = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )
    
    alt_row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    
    def style_header(ws, row=1, fill=header_fill):
        for cell in ws[row]:
            cell.font = header_font
            cell.fill = fill
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            cell.border = thin_border
    
    def style_data_rows(ws, start_row=2):
        for row_idx, row in enumerate(ws.iter_rows(min_row=start_row), start=0):
            for cell in row:
                cell.font = data_font
                cell.border = thin_border
                cell.alignment = Alignment(horizontal='center', vertical='center')
                if row_idx % 2 == 0:
                    cell.fill = alt_row_fill
    
    def auto_width(ws, min_width=10, max_width=25):
        for column in ws.columns:
            max_length = 0
            column_letter = get_column_letter(column[0].column)
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except TypeError:
                    pass
            adjusted_width = min(max(max_length + 2, min_width), max_width)
            ws.column_dimensions[column_letter].width = adjusted_width

    # Summary sheet (first) - CELL style
    ws_summary = wb.active
    ws_summary.title = "Summary"
    
    # Title
    ws_summary.merge_cells('A1:D1')
    ws_summary['A1'] = request.recording_name or 'Electrophysiology Analysis'
    ws_summary['A1'].font = title_font
    ws_summary['A1'].alignment = Alignment(horizontal='center')
    ws_summary.row_dimensions[1].height = 30
    
    ws_summary.merge_cells('A2:D2')
    ws_summary['A2'] = 'Cardiac Electrophysiology Analysis Report'
    ws_summary['A2'].font = subtitle_font
    ws_summary['A2'].alignment = Alignment(horizontal='center')
    
    current_row = 4
    
    if request.drug_used:
        ws_summary[f'A{current_row}'] = 'Treatment:'
        ws_summary[f'A{current_row}'].font = Font(bold=True, size=10, name='Arial')
        ws_summary[f'B{current_row}'] = request.drug_used
        ws_summary[f'B{current_row}'].font = Font(bold=True, size=10, name='Arial', color='7C3AED')
        current_row += 2
    
    # Analysis Summary - only include essential info (no intermediate calculations)
    if request.summary or request.perfusion_params or request.original_filename:
        ws_summary[f'A{current_row}'] = 'Analysis Summary'
        ws_summary[f'A{current_row}'].font = subtitle_font
        current_row += 1
        
        ws_summary[f'A{current_row}'] = 'Parameter'
        ws_summary[f'B{current_row}'] = 'Value'
        style_header(ws_summary, current_row)
        current_row += 1
        
        # Add original ABF filename first
        if request.original_filename:
            ws_summary[f'A{current_row}'] = 'Original File'
            ws_summary[f'B{current_row}'] = request.original_filename
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
        
        # Only include: Recording Name, Drug(s) Used, Total/Kept/Removed Beats, Filter Range
        if request.summary:
            allowed_keys = ['Recording Name', 'Drug(s) Used', 'Total Beats', 'Kept Beats', 'Removed Beats', 'Filter Range']
            
            for k, v in request.summary.items():
                if k in allowed_keys:
                    ws_summary[f'A{current_row}'] = k
                    ws_summary[f'B{current_row}'] = str(v) if v is not None else '—'
                    for col in ['A', 'B']:
                        ws_summary[f'{col}{current_row}'].font = data_font
                        ws_summary[f'{col}{current_row}'].border = thin_border
                    current_row += 1
        
        # Add perfusion parameters
        if request.perfusion_params:
            pp = request.perfusion_params
            perf_data = [
                ('Perfusion Start', f"{pp.get('perfusion_start', 0)} min"),
                ('Perfusion Delay', f"{pp.get('perfusion_delay', 0)} min"),
                ('Perfusion Time (BF)', f"{pp.get('perfusion_time_bf', '—')} min" if pp.get('perfusion_time_bf') is not None else '—'),
                ('Perfusion Time (HRV)', f"{pp.get('perfusion_time_hrv', '—')} min" if pp.get('perfusion_time_hrv') is not None else '—'),
            ]
            for label, value in perf_data:
                ws_summary[f'A{current_row}'] = label
                ws_summary[f'B{current_row}'] = value
                for col in ['A', 'B']:
                    ws_summary[f'{col}{current_row}'].font = data_font
                    ws_summary[f'{col}{current_row}'].border = thin_border
                current_row += 1
        
        # Light Stimulation status
        if request.summary and 'Light Stimulation' in request.summary:
            ws_summary[f'A{current_row}'] = 'Light Stimulation'
            ws_summary[f'B{current_row}'] = str(request.summary['Light Stimulation'])
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
        
        current_row += 1
    
    # Organoid/Cell Information section
    if request.recording_date or request.organoid_info or request.fusion_date or request.recording_description:
        ws_summary[f'A{current_row}'] = 'Organoid/Cell Information'
        ws_summary[f'A{current_row}'].font = subtitle_font
        current_row += 1
        
        ws_summary[f'A{current_row}'] = 'Field'
        ws_summary[f'B{current_row}'] = 'Value'
        style_header(ws_summary, current_row)
        current_row += 1
        
        if request.recording_date:
            ws_summary[f'A{current_row}'] = 'Recording Date'
            ws_summary[f'B{current_row}'] = request.recording_date
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
        
        if request.organoid_info:
            for idx, info in enumerate(request.organoid_info, 1):
                cell_type = info.get('cell_type', '')
                other_cell_type = info.get('other_cell_type', '')
                line_name = info.get('line_name', '')
                passage_number = info.get('passage_number')
                age_at_recording = info.get('age_at_recording')
                transfection = info.get('transfection')
                
                # Resolve cell type display name
                cell_type_display = ''
                if cell_type == 'hSpO':
                    cell_type_display = 'hSpO'
                elif cell_type == 'hCO':
                    cell_type_display = 'hCO'
                elif cell_type == 'other' and other_cell_type:
                    cell_type_display = other_cell_type
                elif cell_type and cell_type not in ['hSpO', 'hCO', 'other']:
                    cell_type_display = cell_type  # Legacy support
                
                label = f'Sample {idx}' if len(request.organoid_info) > 1 else 'Sample'
                
                # Build value string: Type - Line - P# - Age
                parts = []
                if cell_type_display:
                    parts.append(cell_type_display)
                if line_name:
                    parts.append(line_name)
                if passage_number:
                    parts.append(f"P{passage_number}")
                if age_at_recording is not None:
                    parts.append(f"D{age_at_recording}")
                
                value = ' - '.join(parts) if parts else '—'
                
                ws_summary[f'A{current_row}'] = label
                ws_summary[f'B{current_row}'] = value
                for col in ['A', 'B']:
                    ws_summary[f'{col}{current_row}'].font = data_font
                    ws_summary[f'{col}{current_row}'].border = thin_border
                current_row += 1
                
                # Add transfection info if present
                if transfection and transfection.get('technique'):
                    technique = transfection.get('technique', '')
                    if technique == 'other':
                        technique = transfection.get('other_technique', 'Other')
                    trans_name = transfection.get('name', '')
                    trans_amount = transfection.get('amount', '')
                    trans_days = transfection.get('days_since_transfection')
                    
                    trans_parts = [technique.capitalize()]
                    if trans_name:
                        trans_parts.append(trans_name)
                    if trans_amount:
                        trans_parts.append(f"{trans_amount} µL")
                    if trans_days is not None:
                        trans_parts.append(f"D{trans_days}")
                    
                    trans_label = '  └ Transfection' if len(request.organoid_info) > 1 else 'Transfection'
                    ws_summary[f'A{current_row}'] = trans_label
                    ws_summary[f'B{current_row}'] = ' - '.join(trans_parts)
                    for col in ['A', 'B']:
                        ws_summary[f'{col}{current_row}'].font = data_font
                        ws_summary[f'{col}{current_row}'].border = thin_border
                    current_row += 1
        
        # Fusion date (shared for all samples)
        if request.fusion_date or request.days_since_fusion is not None:
            fusion_value = request.fusion_date or ''
            if request.days_since_fusion is not None:
                fusion_value = f"{fusion_value} (D{request.days_since_fusion})" if fusion_value else f"D{request.days_since_fusion}"
            ws_summary[f'A{current_row}'] = 'Fusion Date'
            ws_summary[f'B{current_row}'] = fusion_value
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
        
        if request.recording_description:
            ws_summary[f'A{current_row}'] = 'Description'
            ws_summary[f'B{current_row}'] = request.recording_description
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
    
    # Baseline Metrics section
    current_row += 1
    ws_summary[f'A{current_row}'] = 'Baseline Metrics'
    ws_summary[f'A{current_row}'].font = subtitle_font
    current_row += 1
    
    ws_summary[f'A{current_row}'] = 'Metric'
    ws_summary[f'B{current_row}'] = 'Value'
    style_header(ws_summary, current_row)
    current_row += 1
    
    if request.baseline:
        baseline_data = [
            ('Mean BF (bpm)', f"{request.baseline.get('baseline_bf', 0):.1f}" if request.baseline.get('baseline_bf') is not None else '—', request.baseline.get('baseline_bf_range', '1-2 min')),
            ('ln(RMSSD₇₀)', f"{request.baseline.get('baseline_ln_rmssd70', 0):.3f}" if request.baseline.get('baseline_ln_rmssd70') is not None else '—', request.baseline.get('baseline_hrv_range', '0-3 min')),
            ('ln(SDNN₇₀)', f"{np.log(request.baseline.get('baseline_sdnn', 1)):.3f}" if request.baseline.get('baseline_sdnn') is not None and request.baseline.get('baseline_sdnn') > 0 else '—', request.baseline.get('baseline_hrv_range', '0-3 min')),
            ('pNN50₇₀ (%)', f"{request.baseline.get('baseline_pnn50', 0):.1f}" if request.baseline.get('baseline_pnn50') is not None else '—', request.baseline.get('baseline_hrv_range', '0-3 min')),
        ]
        for label, value, time_range in baseline_data:
            ws_summary[f'A{current_row}'] = f"{label} ({time_range})"
            ws_summary[f'B{current_row}'] = value
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            # Yellow highlight for baseline
            ws_summary[f'A{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
            ws_summary[f'B{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
            current_row += 1
    else:
        ws_summary[f'A{current_row}'] = 'Not available'
        ws_summary[f'B{current_row}'] = '—'
        for col in ['A', 'B']:
            ws_summary[f'{col}{current_row}'].font = data_font
            ws_summary[f'{col}{current_row}'].border = thin_border
        current_row += 1
    
    # Drug Metrics section
    current_row += 1
    ws_summary[f'A{current_row}'] = 'Drug Metrics'
    ws_summary[f'A{current_row}'].font = subtitle_font
    current_row += 1
    
    ws_summary[f'A{current_row}'] = 'Metric'
    ws_summary[f'B{current_row}'] = 'Value'
    style_header(ws_summary, current_row, fill=header_fill_purple)
    current_row += 1
    
    # Drug metrics - get from HRV windows if drug_readout is available
    drug_metrics_available = False
    if request.drug_readout and request.hrv_windows:
        drug_bf_minute = request.drug_readout.get('bf_minute')
        drug_hrv_minute = request.drug_readout.get('hrv_minute')
        
        # Find HRV values for drug readout minute
        drug_hrv_data = None
        if drug_hrv_minute is not None:
            for w in request.hrv_windows:
                if w.get('minute') == drug_hrv_minute:
                    drug_hrv_data = w
                    break
        
        # Find BF value for drug readout minute
        drug_bf = None
        if drug_bf_minute is not None and request.per_minute_data:
            for pm in request.per_minute_data:
                minute_str = pm.get('minute', '0')
                try:
                    minute_num = int(minute_str.split('-')[0]) if '-' in str(minute_str) else int(minute_str)
                    if minute_num == drug_bf_minute:
                        drug_bf = pm.get('mean_bf')
                        break
                except (ValueError, TypeError, AttributeError):
                    pass
        
        if drug_hrv_data or drug_bf is not None:
            drug_metrics_available = True
            drug_bf_range = f"{drug_bf_minute}-{drug_bf_minute+1} min" if drug_bf_minute is not None else '—'
            drug_hrv_range = f"{drug_hrv_minute}-{drug_hrv_minute+3} min" if drug_hrv_minute is not None else '—'
            
            drug_data = [
                ('Mean BF (bpm)', f"{drug_bf:.1f}" if drug_bf is not None else '—', drug_bf_range),
                ('ln(RMSSD₇₀)', f"{drug_hrv_data.get('ln_rmssd70', 0):.3f}" if drug_hrv_data and drug_hrv_data.get('ln_rmssd70') is not None else '—', drug_hrv_range),
                ('ln(SDNN₇₀)', f"{np.log(drug_hrv_data.get('sdnn', 1)):.3f}" if drug_hrv_data and drug_hrv_data.get('sdnn') and drug_hrv_data.get('sdnn') > 0 else '—', drug_hrv_range),
                ('pNN50₇₀ (%)', f"{drug_hrv_data.get('pnn50', 0):.1f}" if drug_hrv_data and drug_hrv_data.get('pnn50') is not None else '—', drug_hrv_range),
            ]
            for label, value, time_range in drug_data:
                ws_summary[f'A{current_row}'] = f"{label} ({time_range})"
                ws_summary[f'B{current_row}'] = value
                for col in ['A', 'B']:
                    ws_summary[f'{col}{current_row}'].font = data_font
                    ws_summary[f'{col}{current_row}'].border = thin_border
                # Purple highlight for drug
                ws_summary[f'A{current_row}'].fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
                ws_summary[f'B{current_row}'].fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
                current_row += 1
    
    if not drug_metrics_available:
        ws_summary[f'A{current_row}'] = 'Status'
        ws_summary[f'B{current_row}'] = 'Disabled'
        for col in ['A', 'B']:
            ws_summary[f'{col}{current_row}'].font = data_font
            ws_summary[f'{col}{current_row}'].border = thin_border
            ws_summary[f'{col}{current_row}'].fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
        current_row += 1
    
    # Light Metrics section
    current_row += 1
    ws_summary[f'A{current_row}'] = 'Light Metrics'
    ws_summary[f'A{current_row}'].font = subtitle_font
    current_row += 1
    
    ws_summary[f'A{current_row}'] = 'Metric'
    ws_summary[f'B{current_row}'] = 'Value'
    style_header(ws_summary, current_row, fill=header_fill_amber)
    current_row += 1
    
    light_metrics_available = False
    if request.light_response or request.light_metrics_detrended:
        light_metrics_available = True
        
        # HRA metrics (from light_response) - compute averages
        if request.light_response:
            valid_response = [m for m in request.light_response if m is not None]
            if valid_response:
                avg_bf = np.mean([r.get('avg_bf', 0) for r in valid_response if r.get('avg_bf') is not None])
                peak_bf = np.mean([r.get('peak_bf', 0) for r in valid_response if r.get('peak_bf') is not None])
                # Use peak_norm_pct (correct field name)
                peak_norm_vals = [r.get('peak_norm_pct') for r in valid_response if r.get('peak_norm_pct') is not None]
                peak_bf_norm = np.mean(peak_norm_vals) if peak_norm_vals else None
                time_to_peak_avg = np.mean([r.get('time_to_peak_sec', 0) for r in valid_response if r.get('time_to_peak_sec') is not None])
                # Time to Peak (1st stim)
                time_to_peak_1st = valid_response[0].get('time_to_peak_sec') if valid_response else None
                # Recovery BF, Recovery %, Amplitude, Rate of Change - averages
                recovery_bf_vals = [r.get('bf_end') for r in valid_response if r.get('bf_end') is not None]
                recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                recovery_pct_vals = [r.get('bf_end_pct') for r in valid_response if r.get('bf_end_pct') is not None]
                recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                amplitude_vals = [r.get('amplitude') for r in valid_response if r.get('amplitude') is not None]
                amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                roc_vals = [r.get('rate_of_change') for r in valid_response if r.get('rate_of_change') is not None]
                rate_of_change = np.mean(roc_vals) if roc_vals else None
                
                hra_data = [
                    ('Avg BF (bpm)', f"{avg_bf:.1f}"),
                    ('Peak BF (bpm)', f"{peak_bf:.1f}"),
                    ('Normalized Peak (%)', f"{peak_bf_norm:.1f}" if peak_bf_norm is not None else '—'),
                    ('Time to Peak (s)', f"{time_to_peak_avg:.1f}"),
                    ('Time to Peak 1st (s)', f"{time_to_peak_1st:.1f}" if time_to_peak_1st is not None else '—'),
                    ('Recovery BF (bpm)', f"{recovery_bf:.1f}" if recovery_bf is not None else '—'),
                    ('Recovery (%)', f"{recovery_pct:.1f}" if recovery_pct is not None else '—'),
                    ('Amplitude (bpm)', f"{amplitude:.1f}" if amplitude is not None else '—'),
                    ('Rate of Change (1/min)', f"{rate_of_change:.4f}" if rate_of_change is not None else '—'),
                ]
                for label, value in hra_data:
                    ws_summary[f'A{current_row}'] = label
                    ws_summary[f'B{current_row}'] = value
                    for col in ['A', 'B']:
                        ws_summary[f'{col}{current_row}'].font = data_font
                        ws_summary[f'{col}{current_row}'].border = thin_border
                    # Amber highlight for light metrics
                    ws_summary[f'A{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                    ws_summary[f'B{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                    current_row += 1
        
        # Corrected HRV metrics (detrended) - use final medians
        if request.light_metrics_detrended and request.light_metrics_detrended.get('final'):
            final_det = request.light_metrics_detrended.get('final', {})
            ln_rmssd_det = final_det.get('ln_rmssd70_detrended')
            ln_sdnn_det = final_det.get('ln_sdnn70_detrended')
            pnn50_det = final_det.get('pnn50_detrended')
            
            hrv_data = [
                ('ln(RMSSD₇₀) corrected', f"{ln_rmssd_det:.3f}" if ln_rmssd_det is not None else '—'),
                ('ln(SDNN₇₀) corrected', f"{ln_sdnn_det:.3f}" if ln_sdnn_det is not None else '—'),
                ('pNN50₇₀ corrected (%)', f"{pnn50_det:.1f}" if pnn50_det is not None else '—'),
            ]
            for label, value in hrv_data:
                ws_summary[f'A{current_row}'] = label
                ws_summary[f'B{current_row}'] = value
                for col in ['A', 'B']:
                    ws_summary[f'{col}{current_row}'].font = data_font
                    ws_summary[f'{col}{current_row}'].border = thin_border
                # Amber highlight
                ws_summary[f'A{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                ws_summary[f'B{current_row}'].fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                current_row += 1
    
    if not light_metrics_available:
        ws_summary[f'A{current_row}'] = 'Status'
        ws_summary[f'B{current_row}'] = 'Disabled'
        for col in ['A', 'B']:
            ws_summary[f'{col}{current_row}'].font = data_font
            ws_summary[f'{col}{current_row}'].border = thin_border
            ws_summary[f'{col}{current_row}'].fill = PatternFill(start_color="F3F4F6", end_color="F3F4F6", fill_type="solid")
        current_row += 1
    
    auto_width(ws_summary)

    # Per-beat sheet (only kept beats)
    if request.per_beat_data:
        ws = wb.create_sheet("Filtered Beat Data")
        headers = ['Time (min)', 'BF (bpm)', 'NN (ms)', 'Status']
        for col, h in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=h)
        style_header(ws, 1)
        
        # Only include kept beats
        kept_data = [r for r in request.per_beat_data if r.get('status') == 'kept']
        for row_idx, row in enumerate(kept_data, 2):
            ws.cell(row=row_idx, column=1, value=f"{row.get('time_min', 0):.4f}")
            ws.cell(row=row_idx, column=2, value=f"{row.get('bf_bpm', 0):.1f}")
            ws.cell(row=row_idx, column=3, value=f"{row.get('nn_ms', 0):.1f}")
            ws.cell(row=row_idx, column=4, value='kept')
        
        style_data_rows(ws, 2)
        auto_width(ws)

    # Per-minute sheet - renamed to "BF Analysis"
    if request.per_minute_data:
        ws_pm = wb.create_sheet("BF Analysis")
        headers = ['Time Window', 'Beat Count', 'Mean BF (bpm)', 'Mean NN (ms)', 'Mean NN₇₀ (ms)']
        for col, h in enumerate(headers, 1):
            ws_pm.cell(row=1, column=col, value=h)
        style_header(ws_pm, 1)
        
        # Get baseline and drug readout minutes for highlighting
        baseline_bf_minute = request.baseline.get('baseline_bf_minute', 1) if request.baseline else 1
        drug_readout_minute = None
        if request.drug_readout:
            drug_readout_minute = request.drug_readout.get('bf_minute')
        
        for row_idx, row in enumerate(request.per_minute_data, 2):
            ws_pm.cell(row=row_idx, column=1, value=row.get('label', ''))
            ws_pm.cell(row=row_idx, column=2, value=row.get('n_beats', 0))
            ws_pm.cell(row=row_idx, column=3, value=f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—')
            ws_pm.cell(row=row_idx, column=4, value=f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—')
            ws_pm.cell(row=row_idx, column=5, value=f"{row.get('avg_nn_70', 0):.1f}" if row.get('avg_nn_70') else '—')
        
        style_data_rows(ws_pm, 2)
        auto_width(ws_pm)
        
        # Apply highlighting AFTER style_data_rows (so it doesn't get overwritten)
        for row_idx, row in enumerate(request.per_minute_data, 2):
            row_minute = row.get('minute', -1)
            is_baseline = row_minute == baseline_bf_minute
            is_drug = drug_readout_minute is not None and row_minute == drug_readout_minute
            
            if is_baseline:
                # Yellow/amber highlight for baseline
                highlight_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                for col in range(1, 6):
                    cell = ws_pm.cell(row=row_idx, column=col)
                    cell.fill = highlight_fill
                    cell.font = Font(bold=True, size=10, name='Arial')
            elif is_drug:
                # Purple highlight for drug readout
                highlight_fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
                for col in range(1, 6):
                    cell = ws_pm.cell(row=row_idx, column=col)
                    cell.fill = highlight_fill
                    cell.font = Font(bold=True, size=10, name='Arial')

    # HRV windows
    if request.hrv_windows:
        ws2 = wb.create_sheet("HRV Analysis")
        headers = ['Time Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀ (ms)', 'ln(SDNN₇₀)', 'SDNN (ms)', 'pNN50₇₀ (%)', 'Mean BF (bpm)', 'Beat Count']
        for col, h in enumerate(headers, 1):
            ws2.cell(row=1, column=col, value=h)
        style_header(ws2, 1, fill=header_fill_purple)
        
        # Get baseline and drug readout minutes for highlighting
        baseline_hrv_minute = request.baseline.get('baseline_hrv_minute', 0) if request.baseline else 0
        drug_readout_minute = None
        if request.drug_readout:
            drug_readout_minute = request.drug_readout.get('hrv_minute')
        
        for row_idx, row in enumerate(request.hrv_windows, 2):
            sdnn_val = row.get('sdnn')
            ln_sdnn = np.log(sdnn_val) if sdnn_val and sdnn_val > 0 else None
            
            ws2.cell(row=row_idx, column=1, value=row.get('window', ''))
            ws2.cell(row=row_idx, column=2, value=f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—')
            ws2.cell(row=row_idx, column=3, value=f"{row.get('rmssd70', 0):.2f}" if row.get('rmssd70') else '—')
            ws2.cell(row=row_idx, column=4, value=f"{ln_sdnn:.3f}" if ln_sdnn else '—')
            ws2.cell(row=row_idx, column=5, value=f"{row.get('sdnn', 0):.2f}" if row.get('sdnn') else '—')
            # Always show pNN50 value even if 0
            pnn50_val = row.get('pnn50')
            ws2.cell(row=row_idx, column=6, value=f"{pnn50_val:.1f}" if pnn50_val is not None else '0.0')
            ws2.cell(row=row_idx, column=7, value=f"{row.get('mean_bf', 0):.1f}" if row.get('mean_bf') else '—')
            ws2.cell(row=row_idx, column=8, value=row.get('n_beats', 0))
        
        style_data_rows(ws2, 2)
        auto_width(ws2)
        
        # Apply highlighting AFTER style_data_rows (so it doesn't get overwritten)
        for row_idx, row in enumerate(request.hrv_windows, 2):
            row_minute = row.get('minute', -1)
            is_baseline = row_minute == baseline_hrv_minute
            is_drug = drug_readout_minute is not None and row_minute == drug_readout_minute
            
            if is_baseline:
                # Yellow/amber highlight for baseline
                highlight_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                for col in range(1, 9):
                    cell = ws2.cell(row=row_idx, column=col)
                    cell.fill = highlight_fill
                    cell.font = Font(bold=True, size=10, name='Arial')
            elif is_drug:
                # Purple highlight for drug readout
                highlight_fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
                for col in range(1, 9):
                    cell = ws2.cell(row=row_idx, column=col)
                    cell.fill = highlight_fill
                    cell.font = Font(bold=True, size=10, name='Arial')

    # Light response - HRA (Heart Rate Acceleration) - BEFORE HRV sheet
    if request.light_response:
        ws3 = wb.create_sheet("Light Stimulus HRA")
        valid = [m for m in request.light_response if m is not None]
        if valid:
            # Per-stim HRA columns as specified
            headers = ['Stim #', 'Beats', 'Baseline BF (bpm)', 'Avg BF (bpm)', 'Peak BF (bpm)', 
                       'Normalized Peak (%)', 'Time to Peak (s)', 'Beat End (bpm)', 'Amplitude (bpm)', 'Rate of Change (1/min)']
            for col, h in enumerate(headers, 1):
                ws3.cell(row=1, column=col, value=h)
            style_header(ws3, 1, fill=header_fill_amber)
            
            for row_idx, row in enumerate(valid, 2):
                ws3.cell(row=row_idx, column=1, value=row_idx - 1)
                ws3.cell(row=row_idx, column=2, value=row.get('n_beats', 0))
                ws3.cell(row=row_idx, column=3, value=f"{row.get('baseline_bf', 0):.1f}")
                ws3.cell(row=row_idx, column=4, value=f"{row.get('avg_bf', 0):.1f}")
                ws3.cell(row=row_idx, column=5, value=f"{row.get('peak_bf', 0):.1f}")
                ws3.cell(row=row_idx, column=6, value=f"{row.get('peak_norm_pct', 0):.1f}")
                ws3.cell(row=row_idx, column=7, value=f"{row.get('time_to_peak_sec', 0):.1f}")
                ws3.cell(row=row_idx, column=8, value=f"{row.get('bf_end', 0):.1f}")
                ws3.cell(row=row_idx, column=9, value=f"{row.get('amplitude', 0):.1f}")
                ws3.cell(row=row_idx, column=10, value=f"{row.get('rate_of_change', 0):.4f}")
            
            # Average row - ALL metrics with values (even if 0)
            avg_row = len(valid) + 2
            ws3.cell(row=avg_row, column=1, value="Average")
            ws3.cell(row=avg_row, column=1).font = Font(bold=True)
            
            # Calculate averages for ALL metrics
            beats_vals = [r.get('n_beats', 0) for r in valid]
            baseline_vals = [r.get('baseline_bf', 0) for r in valid]
            avg_bf_vals = [r.get('avg_bf', 0) for r in valid]
            peak_bf_vals = [r.get('peak_bf', 0) for r in valid]
            peak_norm_vals = [r.get('peak_norm_pct', 0) for r in valid]
            ttp_vals = [r.get('time_to_peak_sec', 0) for r in valid]
            bf_end_vals = [r.get('bf_end', 0) for r in valid]
            amp_vals = [r.get('amplitude', 0) for r in valid]
            roc_vals = [r.get('rate_of_change', 0) for r in valid]
            
            ws3.cell(row=avg_row, column=2, value=f"{np.mean(beats_vals):.1f}")
            ws3.cell(row=avg_row, column=3, value=f"{np.mean(baseline_vals):.1f}")
            ws3.cell(row=avg_row, column=4, value=f"{np.mean(avg_bf_vals):.1f}")
            ws3.cell(row=avg_row, column=5, value=f"{np.mean(peak_bf_vals):.1f}")
            ws3.cell(row=avg_row, column=6, value=f"{np.mean(peak_norm_vals):.1f}")
            ws3.cell(row=avg_row, column=7, value=f"{np.mean(ttp_vals):.1f}")
            ws3.cell(row=avg_row, column=8, value=f"{np.mean(bf_end_vals):.1f}")
            ws3.cell(row=avg_row, column=9, value=f"{np.mean(amp_vals):.1f}")
            ws3.cell(row=avg_row, column=10, value=f"{np.mean(roc_vals):.4f}")
            
            # Style average row
            for col in range(1, 11):
                cell = ws3.cell(row=avg_row, column=col)
                cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
            
            style_data_rows(ws3, 2)
            auto_width(ws3)

    # Light HRV metrics - AFTER HRA sheet
    if request.light_metrics:
        ws4 = wb.create_sheet("Light Stimulus HRV")
        valid = [m for m in request.light_metrics if m is not None]
        if valid:
            # Per-stim HRV columns: ln(RMSSD_70), RMSSD_70, ln(SDNN_70), SDNN_70, pNN50_70
            headers = ['Stim #', 'ln(RMSSD₇₀)', 'RMSSD₇₀ (ms)', 'ln(SDNN₇₀)', 'SDNN₇₀ (ms)', 'pNN50₇₀ (%)']
            for col, h in enumerate(headers, 1):
                ws4.cell(row=1, column=col, value=h)
            style_header(ws4, 1, fill=header_fill_cyan)
            
            for row_idx, row in enumerate(valid, 2):
                ws4.cell(row=row_idx, column=1, value=row_idx - 1)
                ln_rmssd = row.get('ln_rmssd70')
                ws4.cell(row=row_idx, column=2, value=f"{ln_rmssd:.3f}" if ln_rmssd is not None else "0.000")
                ws4.cell(row=row_idx, column=3, value=f"{row.get('rmssd70', 0):.3f}")
                ln_sdnn = row.get('ln_sdnn70')
                ws4.cell(row=row_idx, column=4, value=f"{ln_sdnn:.3f}" if ln_sdnn is not None else "0.000")
                ws4.cell(row=row_idx, column=5, value=f"{row.get('sdnn', 0):.3f}")
                ws4.cell(row=row_idx, column=6, value=f"{row.get('pnn50', 0):.3f}")
            
            # Median row (Readout) - ALL metrics
            median_row = len(valid) + 2
            ws4.cell(row=median_row, column=1, value="Median")
            ws4.cell(row=median_row, column=1).font = Font(bold=True)
            
            rmssd_vals = [r.get('rmssd70', 0) for r in valid]
            sdnn_vals = [r.get('sdnn', 0) for r in valid]
            pnn50_vals = [r.get('pnn50', 0) for r in valid]
            
            median_rmssd = float(np.median(rmssd_vals)) if rmssd_vals else 0
            median_sdnn = float(np.median(sdnn_vals)) if sdnn_vals else 0
            median_pnn50 = float(np.median(pnn50_vals)) if pnn50_vals else 0
            ln_median_rmssd = float(np.log(median_rmssd)) if median_rmssd > 0 else 0
            ln_median_sdnn = float(np.log(median_sdnn)) if median_sdnn > 0 else 0
            
            ws4.cell(row=median_row, column=2, value=f"{ln_median_rmssd:.3f}")
            ws4.cell(row=median_row, column=3, value=f"{median_rmssd:.3f}")
            ws4.cell(row=median_row, column=4, value=f"{ln_median_sdnn:.3f}")
            ws4.cell(row=median_row, column=5, value=f"{median_sdnn:.3f}")
            ws4.cell(row=median_row, column=6, value=f"{median_pnn50:.3f}")
            
            # Style median row
            for col in range(1, 7):
                cell = ws4.cell(row=median_row, column=col)
                cell.fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
            
            style_data_rows(ws4, 2)
            
            # Add Corrected HRV (Detrended) section below original HRV
            if request.light_metrics_detrended and request.light_metrics_detrended.get('per_pulse'):
                detrended_start_row = median_row + 3
                
                # Section title
                ws4.cell(row=detrended_start_row, column=1, value="Corrected Light-Induced HRV (Detrended)")
                ws4.merge_cells(start_row=detrended_start_row, start_column=1, end_row=detrended_start_row, end_column=6)
                ws4.cell(row=detrended_start_row, column=1).font = Font(bold=True, color="10B981")
                ws4.cell(row=detrended_start_row, column=1).fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
                
                # Headers for detrended
                detrended_headers = ['Stim #', 'ln(RMSSD₇₀)_det', 'RMSSD₇₀_det (ms)', 'ln(SDNN₇₀)_det', 'SDNN₇₀_det (ms)', 'pNN50₇₀_det (%)']
                header_row = detrended_start_row + 1
                for col, h in enumerate(detrended_headers, 1):
                    ws4.cell(row=header_row, column=col, value=h)
                style_header(ws4, header_row, fill=PatternFill(start_color="059669", end_color="059669", fill_type="solid"))
                
                # Per-stim detrended data
                per_pulse_det = request.light_metrics_detrended['per_pulse']
                for row_idx, row in enumerate(per_pulse_det, header_row + 1):
                    ws4.cell(row=row_idx, column=1, value=row_idx - header_row)
                    if row:
                        ln_rmssd_det = row.get('ln_rmssd70_detrended')
                        ln_sdnn_det = row.get('ln_sdnn70_detrended')
                        ws4.cell(row=row_idx, column=2, value=f"{ln_rmssd_det:.3f}" if ln_rmssd_det is not None else "—")
                        ws4.cell(row=row_idx, column=3, value=f"{row.get('rmssd70_detrended', 0):.3f}")
                        ws4.cell(row=row_idx, column=4, value=f"{ln_sdnn_det:.3f}" if ln_sdnn_det is not None else "—")
                        ws4.cell(row=row_idx, column=5, value=f"{row.get('sdnn_detrended', 0):.3f}")
                        ws4.cell(row=row_idx, column=6, value=f"{row.get('pnn50_detrended', 0):.3f}")
                    else:
                        for col in range(2, 7):
                            ws4.cell(row=row_idx, column=col, value="—")
                
                # Detrended median row (Readout)
                det_median_row = header_row + 1 + len(per_pulse_det)
                final_det = request.light_metrics_detrended.get('final', {})
                ws4.cell(row=det_median_row, column=1, value="Median")
                ws4.cell(row=det_median_row, column=1).font = Font(bold=True)
                
                if final_det:
                    ln_rmssd_med = final_det.get('ln_rmssd70_detrended')
                    ln_sdnn_med = final_det.get('ln_sdnn70_detrended')
                    ws4.cell(row=det_median_row, column=2, value=f"{ln_rmssd_med:.3f}" if ln_rmssd_med is not None else "—")
                    ws4.cell(row=det_median_row, column=3, value=f"{final_det.get('rmssd70_detrended', 0):.3f}")
                    ws4.cell(row=det_median_row, column=4, value=f"{ln_sdnn_med:.3f}" if ln_sdnn_med is not None else "—")
                    ws4.cell(row=det_median_row, column=5, value=f"{final_det.get('sdnn_detrended', 0):.3f}")
                    ws4.cell(row=det_median_row, column=6, value=f"{final_det.get('pnn50_detrended', 0):.3f}")
                
                # Style detrended median row
                for col in range(1, 7):
                    cell = ws4.cell(row=det_median_row, column=col)
                    cell.fill = PatternFill(start_color="A7F3D0", end_color="A7F3D0", fill_type="solid")
                
                # Style detrended data rows
                for row_idx in range(header_row + 1, det_median_row):
                    for col in range(1, 7):
                        cell = ws4.cell(row=row_idx, column=col)
                        cell.font = Font(name='Arial', size=10)
                        cell.alignment = Alignment(horizontal='center', vertical='center')
                        cell.border = Border(
                            bottom=Side(style='thin', color='E5E7EB')
                        )
            
            auto_width(ws4)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.xlsx"}
    )


@api_router.post("/export/pdf")
async def export_pdf(request: ExportRequest):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    from datetime import datetime
    import matplotlib.font_manager as fm

    # CELL magazine style settings
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Arial', 'Helvetica', 'DejaVu Sans'],
        'font.size': 10,
        'axes.labelsize': 11,
        'axes.titlesize': 12,
        'axes.linewidth': 1,
        'xtick.labelsize': 9,
        'ytick.labelsize': 9,
        'legend.fontsize': 9,
        'figure.titlesize': 14,
        'axes.spines.top': False,
        'axes.spines.right': False,
    })

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        # Page 1: Title and Summary (CELL style)
        fig1 = plt.figure(figsize=(8.5, 11))
        fig1.patch.set_facecolor('white')
        
        # Title section
        title = request.recording_name or request.filename or 'Electrophysiology Analysis'
        fig1.text(0.5, 0.95, title, ha='center', fontsize=20, fontweight='bold', color='#1a1a1a')
        fig1.text(0.5, 0.92, 'Cardiac Electrophysiology Analysis Report', 
                  ha='center', fontsize=12, color='#4a4a4a', style='italic')
        fig1.text(0.5, 0.89, f'Generated: {datetime.now().strftime("%B %d, %Y at %H:%M")}', 
                  ha='center', fontsize=9, color='#6a6a6a')
        
        if request.drug_used:
            fig1.text(0.5, 0.86, f'Treatment: {request.drug_used}', ha='center', fontsize=11, 
                      fontweight='bold', color='#7c3aed')

        # Summary metrics in a clean two-column layout (Cell magazine style)
        # Left column: Analysis Summary + Organoid/Cell Info
        # Right column: Baseline Metrics + Drug Metrics + Light Metrics
        
        # Helper function to wrap long text for PDF table
        def wrap_text(text, max_chars=40):
            """Wrap text to fit in table cell."""
            if not text or len(str(text)) <= max_chars:
                return str(text) if text else ''
            words = str(text).split(' ')
            lines = []
            current_line = ""
            for word in words:
                if len(current_line) + len(word) + 1 <= max_chars:
                    current_line = f"{current_line} {word}".strip()
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            return '\n'.join(lines)
        
        # LEFT COLUMN: Analysis Summary + Organoid/Cell Info
        ax_left = fig1.add_axes([0.05, 0.12, 0.42, 0.7])
        ax_left.axis('off')
        
        left_rows = []
        left_rows.append(['ANALYSIS SUMMARY', ''])
        
        if request.original_filename:
            left_rows.append(['Original File', request.original_filename])
        
        if request.summary:
            allowed_keys = ['Total Beats', 'Kept Beats', 'Removed Beats', 'Filter Range']
            for k, v in request.summary.items():
                if v is not None and k in allowed_keys:
                    left_rows.append([k, str(v)])
        
        # Perfusion parameters
        if request.perfusion_params:
            pp = request.perfusion_params
            left_rows.append(['Perfusion Start', f"{pp.get('perfusion_start', 0)} min"])
            left_rows.append(['Perfusion Delay', f"{pp.get('perfusion_delay', 0)} min"])
        
        # Light Stimulation status
        if request.summary and 'Light Stimulation' in request.summary:
            left_rows.append(['Light Stimulation', str(request.summary['Light Stimulation'])])
        
        # Organoid/Cell Info section
        if request.recording_date or request.organoid_info or request.fusion_date or request.recording_description:
            left_rows.append(['', ''])
            left_rows.append(['SAMPLE INFO', ''])  # Shortened title
            
            if request.recording_date:
                left_rows.append(['Recording Date', request.recording_date])
            
            if request.organoid_info:
                for idx, info in enumerate(request.organoid_info, 1):
                    cell_type = info.get('cell_type', '')
                    other_cell_type = info.get('other_cell_type', '')
                    line_name = info.get('line_name', '')
                    passage_number = info.get('passage_number')
                    age_at_recording = info.get('age_at_recording')
                    transfection = info.get('transfection')
                    
                    cell_type_display = ''
                    if cell_type == 'hSpO':
                        cell_type_display = 'hSpO'
                    elif cell_type == 'hCO':
                        cell_type_display = 'hCO'
                    elif cell_type == 'other' and other_cell_type:
                        cell_type_display = other_cell_type
                    elif cell_type and cell_type not in ['hSpO', 'hCO', 'other']:
                        cell_type_display = cell_type
                    
                    label = f'Sample {idx}' if len(request.organoid_info) > 1 else 'Sample'
                    parts = []
                    if cell_type_display:
                        parts.append(cell_type_display)
                    if line_name:
                        parts.append(line_name)
                    if passage_number:
                        parts.append(f"P{passage_number}")
                    if age_at_recording is not None:
                        parts.append(f"D{age_at_recording}")
                    
                    left_rows.append([label, ' - '.join(parts) if parts else '—'])
                    
                    if transfection and transfection.get('technique'):
                        technique = transfection.get('technique', '')
                        if technique == 'other':
                            technique = transfection.get('other_technique', 'Other')
                        trans_name = transfection.get('name', '')
                        trans_amount = transfection.get('amount', '')
                        trans_days = transfection.get('days_since_transfection')
                        
                        trans_parts = [technique.capitalize()]
                        if trans_name:
                            trans_parts.append(trans_name)
                        if trans_amount:
                            trans_parts.append(f"{trans_amount} µL")
                        if trans_days is not None:
                            trans_parts.append(f"D{trans_days}")
                        
                        left_rows.append(['  └ Transfection', ' - '.join(trans_parts)])
            
            if request.fusion_date or request.days_since_fusion is not None:
                fusion_value = request.fusion_date or ''
                if request.days_since_fusion is not None:
                    fusion_value = f"{fusion_value} (D{request.days_since_fusion})" if fusion_value else f"D{request.days_since_fusion}"
                left_rows.append(['Fusion Date', fusion_value])
            
            if request.recording_description:
                left_rows.append(['Description', wrap_text(request.recording_description, 35)])
        
        # Create left table with better text fitting
        if left_rows:
            wrapped_left = [[wrap_text(m, 18), wrap_text(v, 30)] for m, v in left_rows]
            table_left = ax_left.table(
                cellText=wrapped_left,
                loc='upper center',
                cellLoc='left',
                colWidths=[0.4, 0.6]
            )
            table_left.auto_set_font_size(False)
            table_left.set_fontsize(7)
            table_left.scale(1.0, 1.3)
            
            for (row, col), cell in table_left.get_celld().items():
                cell.set_edgecolor('#e0e0e0')
                text = cell.get_text().get_text()
                if text in ['ANALYSIS SUMMARY', 'ORGANOID/CELL INFO']:
                    cell.set_text_props(fontweight='bold', color='#1a1a1a', fontsize=8)
                    cell.set_facecolor('#f0f0f0')
                elif text == '':
                    cell.set_facecolor('white')
                    cell.set_height(0.012)
                else:
                    cell.set_facecolor('white')
                    if col == 0:
                        cell.set_text_props(color='#6b7280', fontsize=7)
                    else:
                        cell.set_text_props(color='#1f2937', fontsize=7)
        
        # RIGHT COLUMN: Baseline + Drug + Light Metrics
        ax_right = fig1.add_axes([0.52, 0.08, 0.43, 0.76])
        ax_right.axis('off')
        
        right_rows = []
        
        # Baseline Metrics - shortened labels
        right_rows.append(['BASELINE METRICS', ''])
        if request.baseline:
            bf_val = request.baseline.get('baseline_bf')
            ln_rmssd = request.baseline.get('baseline_ln_rmssd70')
            sdnn = request.baseline.get('baseline_sdnn')
            pnn50 = request.baseline.get('baseline_pnn50')
            
            right_rows.append(['Mean BF', f"{bf_val:.1f} bpm" if bf_val is not None else '—'])
            right_rows.append(['ln(RMSSD₇₀)', f"{ln_rmssd:.3f}" if ln_rmssd is not None else '—'])
            right_rows.append(['ln(SDNN₇₀)', f"{np.log(sdnn):.3f}" if sdnn and sdnn > 0 else '—'])
            right_rows.append(['pNN50₇₀', f"{pnn50:.1f}%" if pnn50 is not None else '—'])
        else:
            right_rows.append(['Status', 'Not available'])
        
        # Drug Metrics
        right_rows.append(['', ''])
        right_rows.append(['DRUG METRICS', ''])
        
        drug_metrics_available = False
        if request.drug_readout and request.hrv_windows:
            drug_bf_minute = request.drug_readout.get('bf_minute')
            drug_hrv_minute = request.drug_readout.get('hrv_minute')
            
            drug_hrv_data = None
            if drug_hrv_minute is not None:
                for w in request.hrv_windows:
                    if w.get('minute') == drug_hrv_minute:
                        drug_hrv_data = w
                        break
            
            drug_bf = None
            if drug_bf_minute is not None and request.per_minute_data:
                for pm in request.per_minute_data:
                    minute_str = pm.get('minute', '0')
                    try:
                        minute_num = int(str(minute_str).split('-')[0])
                        if minute_num == drug_bf_minute:
                            drug_bf = pm.get('mean_bf')
                            break
                    except (ValueError, TypeError, AttributeError):
                        pass
            
            if drug_hrv_data or drug_bf is not None:
                drug_metrics_available = True
                
                right_rows.append(['Mean BF', f"{drug_bf:.1f} bpm" if drug_bf is not None else '—'])
                if drug_hrv_data:
                    right_rows.append(['ln(RMSSD₇₀)', f"{drug_hrv_data.get('ln_rmssd70', 0):.3f}" if drug_hrv_data.get('ln_rmssd70') is not None else '—'])
                    sdnn_d = drug_hrv_data.get('sdnn')
                    right_rows.append(['ln(SDNN₇₀)', f"{np.log(sdnn_d):.3f}" if sdnn_d and sdnn_d > 0 else '—'])
                    right_rows.append(['pNN50₇₀', f"{drug_hrv_data.get('pnn50', 0):.1f}%" if drug_hrv_data.get('pnn50') is not None else '—'])
        
        if not drug_metrics_available:
            right_rows.append(['Status', 'Disabled'])
        
        # Light Metrics
        right_rows.append(['', ''])
        right_rows.append(['LIGHT METRICS', ''])
        
        light_metrics_available = False
        if request.light_response or request.light_metrics_detrended:
            light_metrics_available = True
            
            # HRA metrics - averages
            if request.light_response:
                valid_resp = [m for m in request.light_response if m is not None]
                if valid_resp:
                    avg_bf = np.mean([r.get('avg_bf', 0) for r in valid_resp if r.get('avg_bf') is not None])
                    peak_bf = np.mean([r.get('peak_bf', 0) for r in valid_resp if r.get('peak_bf') is not None])
                    peak_norm_vals = [r.get('peak_norm_pct') for r in valid_resp if r.get('peak_norm_pct') is not None]
                    peak_norm = np.mean(peak_norm_vals) if peak_norm_vals else None
                    ttp = np.mean([r.get('time_to_peak_sec', 0) for r in valid_resp if r.get('time_to_peak_sec') is not None])
                    # Time to Peak (1st stim)
                    ttp_1st = valid_resp[0].get('time_to_peak_sec') if valid_resp else None
                    # Recovery BF, Recovery %, Amplitude, Rate of Change
                    recovery_bf_vals = [r.get('bf_end') for r in valid_resp if r.get('bf_end') is not None]
                    recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                    recovery_pct_vals = [r.get('bf_end_pct') for r in valid_resp if r.get('bf_end_pct') is not None]
                    recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                    amplitude_vals = [r.get('amplitude') for r in valid_resp if r.get('amplitude') is not None]
                    amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                    roc_vals = [r.get('rate_of_change') for r in valid_resp if r.get('rate_of_change') is not None]
                    rate_of_change = np.mean(roc_vals) if roc_vals else None
                    
                    right_rows.append(['Avg BF', f"{avg_bf:.1f} bpm"])
                    right_rows.append(['Peak BF', f"{peak_bf:.1f} bpm"])
                    right_rows.append(['Norm. Peak', f"{peak_norm:.1f}%" if peak_norm is not None else '—'])
                    right_rows.append(['Time to Peak', f"{ttp:.1f} s"])
                    right_rows.append(['Time to Peak 1st', f"{ttp_1st:.1f} s" if ttp_1st is not None else '—'])
                    right_rows.append(['Recovery BF', f"{recovery_bf:.1f} bpm" if recovery_bf is not None else '—'])
                    right_rows.append(['Recovery %', f"{recovery_pct:.1f}%" if recovery_pct is not None else '—'])
                    right_rows.append(['Amplitude', f"{amplitude:.1f} bpm" if amplitude is not None else '—'])
                    right_rows.append(['Rate of Change', f"{rate_of_change:.4f}" if rate_of_change is not None else '—'])
            
            # Corrected HRV metrics (detrended) - use final medians
            if request.light_metrics_detrended and request.light_metrics_detrended.get('final'):
                final_det = request.light_metrics_detrended.get('final', {})
                ln_rmssd_det = final_det.get('ln_rmssd70_detrended')
                ln_sdnn_det = final_det.get('ln_sdnn70_detrended')
                pnn50_det = final_det.get('pnn50_detrended')
                
                right_rows.append(['ln(RMSSD₇₀) corr.', f"{ln_rmssd_det:.3f}" if ln_rmssd_det is not None else '—'])
                right_rows.append(['ln(SDNN₇₀) corr.', f"{ln_sdnn_det:.3f}" if ln_sdnn_det is not None else '—'])
                right_rows.append(['pNN50₇₀ corr.', f"{pnn50_det:.1f}%" if pnn50_det is not None else '—'])
        
        if not light_metrics_available:
            right_rows.append(['Status', 'Disabled'])
        
        # Create right table with adjusted column widths for text fitting
        if right_rows:
            wrapped_right = [[wrap_text(m, 18), wrap_text(v, 15)] for m, v in right_rows]
            table_right = ax_right.table(
                cellText=wrapped_right,
                loc='upper center',
                cellLoc='left',
                colWidths=[0.55, 0.45]
            )
            table_right.auto_set_font_size(False)
            table_right.set_fontsize(7)
            table_right.scale(1.0, 1.3)
            
            # Style right table with color coding
            section_headers = ['BASELINE METRICS', 'DRUG METRICS', 'LIGHT METRICS']
            baseline_color = '#FEF3C7'  # Yellow
            drug_color = '#EDE9FE'  # Purple
            light_color = '#FEF3C7'  # Amber
            
            current_section = None
            for (row, col), cell in table_right.get_celld().items():
                cell.set_edgecolor('#e0e0e0')
                text = cell.get_text().get_text()
                
                if text in section_headers:
                    cell.set_text_props(fontweight='bold', color='#1a1a1a', fontsize=8)
                    cell.set_facecolor('#f0f0f0')
                    current_section = text
                elif text == '':
                    cell.set_facecolor('white')
                    cell.set_height(0.012)
                else:
                    # Apply section-specific colors
                    if current_section == 'BASELINE METRICS':
                        cell.set_facecolor(baseline_color)
                    elif current_section == 'DRUG METRICS':
                        cell.set_facecolor(drug_color)
                    elif current_section == 'LIGHT METRICS':
                        cell.set_facecolor(light_color)
                    else:
                        cell.set_facecolor('white')
                    
                    if col == 0:
                        cell.set_text_props(color='#374151', fontsize=7)
                    else:
                        cell.set_text_props(color='#1f2937', fontsize=7, fontweight='bold')

        # Footer
        fig1.text(0.5, 0.02, 'NeuCarS - Cardiac Electrophysiology Analysis Platform', 
                  ha='center', fontsize=8, color='#9ca3af')
        
        pdf.savefig(fig1)
        plt.close(fig1)

        # Page 2: BF and NN plots (ONLY KEPT BEATS - exclude filtered) with Light Stim zones
        if request.per_beat_data:
            fig2, axes = plt.subplots(2, 1, figsize=(8.5, 11))
            fig2.suptitle('Beat Frequency and NN Intervals (Filtered Data Only)', fontsize=14, fontweight='bold', y=0.96)
            
            # Filter to only kept beats
            kept_data = [r for r in request.per_beat_data if r.get('status') == 'kept']
            
            if kept_data:
                times = [r.get('time_min', 0) for r in kept_data]
                bfs = [r.get('bf_bpm', 0) for r in kept_data]
                nns = [r.get('nn_ms', 0) for r in kept_data]

                # BF plot - clean CELL style
                axes[0].plot(times, bfs, 'o-', color='#0ea5e9', markersize=2, linewidth=0.8, alpha=0.8)
                axes[0].set_xlabel('Time (min)', fontsize=11)
                axes[0].set_ylabel('Beat Frequency (bpm)', fontsize=11)
                axes[0].set_title('Beat Frequency Evolution', fontsize=12, fontweight='bold', pad=10)
                axes[0].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
                axes[0].set_facecolor('#fafafa')
                axes[0].spines['top'].set_visible(False)
                axes[0].spines['right'].set_visible(False)
                
                # Add light stimulation zones to BF plot
                if request.light_pulses:
                    for i, pulse in enumerate(request.light_pulses):
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        axes[0].axvspan(start_min, end_min, alpha=0.15, color='#f59e0b', label=f'Stim {i+1}' if i == 0 else None)
                        axes[0].axvline(x=start_min, color='#f59e0b', linestyle='--', linewidth=0.8, alpha=0.6)
                    if len(request.light_pulses) > 0:
                        axes[0].legend(loc='upper right', fontsize=8)

                # NN plot - clean CELL style
                axes[1].plot(times, nns, 'o-', color='#22c55e', markersize=2, linewidth=0.8, alpha=0.8)
                axes[1].set_xlabel('Time (min)', fontsize=11)
                axes[1].set_ylabel('NN Interval (ms)', fontsize=11)
                axes[1].set_title('NN Interval Evolution', fontsize=12, fontweight='bold', pad=10)
                axes[1].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
                axes[1].set_facecolor('#fafafa')
                axes[1].spines['top'].set_visible(False)
                axes[1].spines['right'].set_visible(False)
                
                # Add light stimulation zones to NN plot
                if request.light_pulses:
                    for i, pulse in enumerate(request.light_pulses):
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        axes[1].axvspan(start_min, end_min, alpha=0.15, color='#f59e0b')
                        axes[1].axvline(x=start_min, color='#f59e0b', linestyle='--', linewidth=0.8, alpha=0.6)

            plt.tight_layout(rect=[0, 0.02, 1, 0.94])
            pdf.savefig(fig2)
            plt.close(fig2)

        # Page 2b: Normalized BF and NN (baseline = AVG between 1-2 min)
        if request.per_beat_data:
            kept_data = [r for r in request.per_beat_data if r.get('status') == 'kept']
            
            if kept_data:
                times = [r.get('time_min', 0) for r in kept_data]
                bfs = [r.get('bf_bpm', 0) for r in kept_data]
                nns = [r.get('nn_ms', 0) for r in kept_data]
                
                # Calculate baseline (AVG between 1-2 min)
                baseline_bf_vals = [bf for t, bf in zip(times, bfs) if 1.0 <= t < 2.0]
                baseline_nn_vals = [nn for t, nn in zip(times, nns) if 1.0 <= t < 2.0]
                
                baseline_bf = np.mean(baseline_bf_vals) if baseline_bf_vals else np.mean(bfs)
                baseline_nn = np.mean(baseline_nn_vals) if baseline_nn_vals else np.mean(nns)
                
                # Normalize: value / baseline * 100 (as percentage)
                bfs_norm = [(bf / baseline_bf * 100) if baseline_bf > 0 else 100 for bf in bfs]
                nns_norm = [(nn / baseline_nn * 100) if baseline_nn > 0 else 100 for nn in nns]
                
                fig2b, axes2b = plt.subplots(2, 1, figsize=(8.5, 11))
                fig2b.suptitle('Normalized Beat Frequency and NN Intervals\n(Baseline: AVG between 1-2 min)', 
                              fontsize=14, fontweight='bold', y=0.96)
                
                # Normalized BF plot
                axes2b[0].plot(times, bfs_norm, 'o-', color='#0ea5e9', markersize=2, linewidth=0.8, alpha=0.8)
                axes2b[0].axhline(y=100, color='#64748b', linestyle='--', linewidth=1, alpha=0.7, label='Baseline (100%)')
                axes2b[0].set_xlabel('Time (min)', fontsize=11)
                axes2b[0].set_ylabel('Normalized BF (%)', fontsize=11)
                axes2b[0].set_ylim(0, 200)  # Fixed Y-axis 0-200%
                axes2b[0].set_title(f'Normalized Beat Frequency (Baseline: {baseline_bf:.1f} bpm)', fontsize=12, fontweight='bold', pad=10)
                axes2b[0].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
                axes2b[0].set_facecolor('#fafafa')
                axes2b[0].spines['top'].set_visible(False)
                axes2b[0].spines['right'].set_visible(False)
                axes2b[0].legend(loc='upper right', fontsize=8)
                
                # Add light stimulation zones to normalized BF plot
                if request.light_pulses:
                    for i, pulse in enumerate(request.light_pulses):
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        axes2b[0].axvspan(start_min, end_min, alpha=0.15, color='#f59e0b')
                        axes2b[0].axvline(x=start_min, color='#f59e0b', linestyle='--', linewidth=0.8, alpha=0.6)
                
                # Normalized NN plot
                axes2b[1].plot(times, nns_norm, 'o-', color='#22c55e', markersize=2, linewidth=0.8, alpha=0.8)
                axes2b[1].axhline(y=100, color='#64748b', linestyle='--', linewidth=1, alpha=0.7, label='Baseline (100%)')
                axes2b[1].set_xlabel('Time (min)', fontsize=11)
                axes2b[1].set_ylabel('Normalized NN (%)', fontsize=11)
                axes2b[1].set_ylim(0, 200)  # Fixed Y-axis 0-200%
                axes2b[1].set_title(f'Normalized NN Interval (Baseline: {baseline_nn:.1f} ms)', fontsize=12, fontweight='bold', pad=10)
                axes2b[1].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
                axes2b[1].set_facecolor('#fafafa')
                axes2b[1].spines['top'].set_visible(False)
                axes2b[1].spines['right'].set_visible(False)
                axes2b[1].legend(loc='upper right', fontsize=8)
                
                # Add light stimulation zones to normalized NN plot
                if request.light_pulses:
                    for i, pulse in enumerate(request.light_pulses):
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        axes2b[1].axvspan(start_min, end_min, alpha=0.15, color='#f59e0b')
                        axes2b[1].axvline(x=start_min, color='#f59e0b', linestyle='--', linewidth=0.8, alpha=0.6)
                
                plt.tight_layout(rect=[0, 0.02, 1, 0.94])
                pdf.savefig(fig2b)
                plt.close(fig2b)

        # Page 3: HRV evolution with FIXED Y-AXIS SCALES
        if request.hrv_windows:
            fig3, axes3 = plt.subplots(3, 1, figsize=(8.5, 11))
            fig3.suptitle('HRV Metrics Evolution\n(3-min Sliding Windows, Normalized to 70 bpm)', 
                          fontsize=14, fontweight='bold', y=0.97)
            
            minutes = [w.get('minute', 0) for w in request.hrv_windows]
            ln_rmssd = [w.get('ln_rmssd70') for w in request.hrv_windows]
            # Calculate ln(SDNN) for the chart
            ln_sdnn = [np.log(w.get('sdnn', 0)) if w.get('sdnn') and w.get('sdnn') > 0 else None for w in request.hrv_windows]
            pnn50 = [w.get('pnn50', 0) for w in request.hrv_windows]

            # ln(RMSSD₇₀) - FIXED Y-AXIS 0-8
            axes3[0].plot(minutes, ln_rmssd, 'o-', color='#0ea5e9', markersize=4, linewidth=1.5)
            axes3[0].fill_between(minutes, ln_rmssd, alpha=0.2, color='#0ea5e9')
            axes3[0].set_ylabel('ln(RMSSD₇₀)', fontsize=11, fontweight='bold')
            axes3[0].set_ylim(0, 8)  # FIXED Y-AXIS
            # No title for chart
            axes3[0].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[0].set_facecolor('#fafafa')
            axes3[0].spines['top'].set_visible(False)
            axes3[0].spines['right'].set_visible(False)

            # ln(SDNN₇₀) - FIXED Y-AXIS 0-8 (changed from SDNN 0-300)
            # Filter out None values for plotting
            valid_minutes = [m for m, s in zip(minutes, ln_sdnn) if s is not None]
            valid_ln_sdnn = [s for s in ln_sdnn if s is not None]
            if valid_ln_sdnn:
                axes3[1].plot(valid_minutes, valid_ln_sdnn, 'o-', color='#a855f7', markersize=4, linewidth=1.5)
                axes3[1].fill_between(valid_minutes, valid_ln_sdnn, alpha=0.2, color='#a855f7')
            axes3[1].set_ylabel('ln(SDNN₇₀)', fontsize=11, fontweight='bold')
            axes3[1].set_ylim(0, 8)  # FIXED Y-AXIS 0-8
            # No title for chart
            axes3[1].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[1].set_facecolor('#fafafa')
            axes3[1].spines['top'].set_visible(False)
            axes3[1].spines['right'].set_visible(False)

            # pNN50₇₀ - FIXED Y-AXIS 0-100
            axes3[2].plot(minutes, pnn50, 'o-', color='#f97316', markersize=4, linewidth=1.5)
            axes3[2].fill_between(minutes, pnn50, alpha=0.2, color='#f97316')
            axes3[2].set_xlabel('Time (min)', fontsize=11)
            axes3[2].set_ylabel('pNN50₇₀ (%)', fontsize=11, fontweight='bold')
            axes3[2].set_ylim(0, 100)  # FIXED Y-AXIS
            # No title for chart 2
            axes3[2].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[2].set_facecolor('#fafafa')
            axes3[2].spines['top'].set_visible(False)
            axes3[2].spines['right'].set_visible(False)

            plt.tight_layout(rect=[0, 0.02, 1, 0.93])
            pdf.savefig(fig3)
            plt.close(fig3)

        # Page 3b: Detrending Visualization (5 stim panels A, B, C) - AFTER HRV Evolution, BEFORE HRA
        if request.light_metrics_detrended and request.light_metrics_detrended.get('per_pulse'):
            per_pulse_det = request.light_metrics_detrended['per_pulse']
            valid_viz = [(i, p) for i, p in enumerate(per_pulse_det) if p and p.get('viz')]
            
            if valid_viz:
                fig3b = plt.figure(figsize=(8.5, 11))
                fig3b.suptitle('Detrending Visualization\n(LOESS Trend Removal per Stimulation)', fontsize=14, fontweight='bold', y=0.98)
                
                n_stims = len(valid_viz)
                # Adjusted layout: start lower (0.78 instead of 0.82) to avoid title overlap
                row_height = 0.15
                start_y = 0.78
                
                for plot_idx, (stim_idx, pulse_data) in enumerate(valid_viz):
                    viz = pulse_data['viz']
                    time_rel = np.array(viz['time_rel'])  # in seconds
                    nn_70 = np.array(viz['nn_70'])
                    trend = np.array(viz['trend'])
                    residual = np.array(viz['residual'])
                    
                    # Calculate row position (5 rows, each with 3 panels)
                    row_bottom = start_y - (plot_idx * row_height)
                    
                    # Panel A: Raw NN_70
                    ax_a = fig3b.add_axes([0.08, row_bottom, 0.26, row_height - 0.03])
                    ax_a.plot(time_rel, nn_70, color='#22d3ee', linewidth=1)
                    ax_a.set_ylabel(f'Stim {stim_idx + 1}', fontsize=8, fontweight='bold')
                    ax_a.tick_params(axis='both', labelsize=6)
                    ax_a.set_facecolor('#fafafa')
                    ax_a.spines['top'].set_visible(False)
                    ax_a.spines['right'].set_visible(False)
                    if plot_idx == 0:
                        ax_a.set_title('Panel A: Raw NN₇₀', fontsize=8, fontweight='bold', color='#22d3ee', pad=8)
                    if plot_idx == n_stims - 1:
                        ax_a.set_xlabel('Time (s)', fontsize=7)
                    
                    # Panel B: Trend Extraction
                    ax_b = fig3b.add_axes([0.40, row_bottom, 0.26, row_height - 0.03])
                    ax_b.plot(time_rel, nn_70, color='#22d3ee', linewidth=0.8, alpha=0.5, label='Raw')
                    ax_b.plot(time_rel, trend, color='#f59e0b', linewidth=1.5, label='LOESS')
                    ax_b.tick_params(axis='both', labelsize=6)
                    ax_b.set_facecolor('#fafafa')
                    ax_b.spines['top'].set_visible(False)
                    ax_b.spines['right'].set_visible(False)
                    if plot_idx == 0:
                        ax_b.set_title('Panel B: Trend Extraction', fontsize=8, fontweight='bold', color='#f59e0b', pad=8)
                    if plot_idx == n_stims - 1:
                        ax_b.set_xlabel('Time (s)', fontsize=7)
                    
                    # Panel C: Detrended Residual
                    ax_c = fig3b.add_axes([0.72, row_bottom, 0.26, row_height - 0.03])
                    ax_c.plot(time_rel, residual, color='#10b981', linewidth=1)
                    ax_c.axhline(y=0, color='#6b7280', linestyle='--', linewidth=0.5)
                    ax_c.tick_params(axis='both', labelsize=6)
                    ax_c.set_facecolor('#fafafa')
                    ax_c.spines['top'].set_visible(False)
                    ax_c.spines['right'].set_visible(False)
                    if plot_idx == 0:
                        ax_c.set_title('Panel C: Detrended Residual', fontsize=8, fontweight='bold', color='#10b981', pad=8)
                    if plot_idx == n_stims - 1:
                        ax_c.set_xlabel('Time (s)', fontsize=7)
                
                pdf.savefig(fig3b)
                plt.close(fig3b)

        # Page 4: Light HRA (Heart Rate Acceleration) Analysis
        if request.light_response:
            valid = [m for m in request.light_response if m is not None]
            if valid:
                fig4 = plt.figure(figsize=(8.5, 11))
                fig4.suptitle('Light-Induced HRA Analysis', fontsize=14, fontweight='bold', y=0.96)
                
                ax4 = fig4.add_axes([0.05, 0.4, 0.9, 0.45])
                ax4.axis('off')
                
                # Per-stim columns as specified
                headers = ['Stim #', 'Beats', 'Baseline\nBF', 'Avg BF\n(bpm)', 'Peak BF\n(bpm)', 'Peak\n(%)', 'Time to\nPeak (s)', 'Beat End\n(bpm)', 'Amplitude\n(bpm)', 'Rate of\nChange']
                table_data = []
                for i, row in enumerate(valid):
                    table_data.append([
                        str(i + 1),
                        str(row.get('n_beats', 0)),
                        f"{row.get('baseline_bf', 0):.1f}",
                        f"{row.get('avg_bf', 0):.1f}",
                        f"{row.get('peak_bf', 0):.1f}",
                        f"{row.get('peak_norm_pct', 0):.1f}",
                        f"{row.get('time_to_peak_sec', 0):.1f}",
                        f"{row.get('bf_end', 0):.1f}",
                        f"{row.get('amplitude', 0):.1f}",
                        f"{row.get('rate_of_change', 0):.3f}",
                    ])
                
                # Add average row - ALL metrics with values (even if 0)
                avg_beats = np.mean([r.get('n_beats', 0) for r in valid])
                avg_baseline = np.mean([r.get('baseline_bf', 0) for r in valid])
                avg_bf = np.mean([r.get('avg_bf', 0) for r in valid])
                avg_peak = np.mean([r.get('peak_bf', 0) for r in valid])
                avg_peak_pct = np.mean([r.get('peak_norm_pct', 0) for r in valid])
                avg_ttp = np.mean([r.get('time_to_peak_sec', 0) for r in valid])
                avg_bf_end = np.mean([r.get('bf_end', 0) for r in valid])
                avg_amp = np.mean([r.get('amplitude', 0) for r in valid])
                avg_roc = np.mean([r.get('rate_of_change', 0) for r in valid])
                
                table_data.append([
                    'Avg',
                    f"{avg_beats:.1f}",
                    f"{avg_baseline:.1f}",
                    f"{avg_bf:.1f}",
                    f"{avg_peak:.1f}",
                    f"{avg_peak_pct:.1f}",
                    f"{avg_ttp:.1f}",
                    f"{avg_bf_end:.1f}",
                    f"{avg_amp:.1f}",
                    f"{avg_roc:.3f}",
                ])
                
                table = ax4.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='center',
                    cellLoc='center',
                    colWidths=[0.08, 0.08, 0.10, 0.10, 0.10, 0.10, 0.11, 0.10, 0.11, 0.11]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(8)
                table.scale(1.0, 2.2)
                
                # CELL style formatting
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#d97706')
                        cell.set_height(0.09)
                    elif row == len(table_data):  # Average row
                        cell.set_text_props(fontweight='bold')
                        cell.set_facecolor('#fef3c7')
                        cell.set_height(0.07)
                    else:
                        cell.set_facecolor('#fffbeb' if row % 2 == 0 else '#ffffff')
                        cell.set_height(0.06)
                
                pdf.savefig(fig4)
                plt.close(fig4)

        # Page 5: Light HRV metrics (if available) - includes both original and detrended
        if request.light_metrics:
            valid_hrv = [m for m in request.light_metrics if m is not None]
            if valid_hrv:
                fig5 = plt.figure(figsize=(8.5, 11))
                fig5.suptitle('Light-Induced HRV Analysis', fontsize=14, fontweight='bold', y=0.96)
                
                # Original HRV table - upper portion
                ax5 = fig5.add_axes([0.08, 0.58, 0.84, 0.30])
                ax5.axis('off')
                ax5.text(0.5, 1.05, 'Original HRV (NN₇₀ Normalized)', ha='center', fontsize=10, fontweight='bold', color='#0891b2', transform=ax5.transAxes)
                
                # Per-stim columns as specified: ln(RMSSD_70), RMSSD_70, ln(SDNN_70), SDNN_70, pNN50_70
                headers = ['Stim #', 'ln(RMSSD₇₀)', 'RMSSD₇₀\n(ms)', 'ln(SDNN₇₀)', 'SDNN₇₀\n(ms)', 'pNN50₇₀\n(%)']
                table_data = []
                for i, row in enumerate(valid_hrv):
                    ln_rmssd = row.get('ln_rmssd70')
                    ln_sdnn = row.get('ln_sdnn70')
                    table_data.append([
                        str(i + 1),
                        f"{ln_rmssd:.3f}" if ln_rmssd is not None else "0.000",
                        f"{row.get('rmssd70', 0):.3f}",
                        f"{ln_sdnn:.3f}" if ln_sdnn is not None else "0.000",
                        f"{row.get('sdnn', 0):.3f}",
                        f"{row.get('pnn50', 0):.3f}",
                    ])
                
                # Add median row (Readout) - ALL metrics with values (even if 0)
                rmssd_vals = [r.get('rmssd70', 0) for r in valid_hrv]
                sdnn_vals = [r.get('sdnn', 0) for r in valid_hrv]
                pnn50_vals = [r.get('pnn50', 0) for r in valid_hrv]
                
                median_rmssd = float(np.median(rmssd_vals)) if rmssd_vals else 0
                median_sdnn = float(np.median(sdnn_vals)) if sdnn_vals else 0
                median_pnn50 = float(np.median(pnn50_vals)) if pnn50_vals else 0
                ln_median_rmssd = float(np.log(median_rmssd)) if median_rmssd > 0 else 0
                ln_median_sdnn = float(np.log(median_sdnn)) if median_sdnn > 0 else 0
                
                table_data.append([
                    'Median',
                    f"{ln_median_rmssd:.3f}",
                    f"{median_rmssd:.3f}",
                    f"{ln_median_sdnn:.3f}",
                    f"{median_sdnn:.3f}",
                    f"{median_pnn50:.3f}",
                ])
                
                table = ax5.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='center',
                    cellLoc='center',
                    colWidths=[0.12, 0.17, 0.17, 0.17, 0.17, 0.14]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(9)
                table.scale(1.0, 1.8)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#0891b2')
                        cell.set_height(0.09)
                    elif row == len(table_data):  # Median row
                        cell.set_text_props(fontweight='bold')
                        cell.set_facecolor('#e0f2fe')
                        cell.set_height(0.07)
                    else:
                        cell.set_facecolor('#ecfeff' if row % 2 == 0 else '#ffffff')
                        cell.set_height(0.06)
                
                # Corrected HRV (Detrended) table - lower portion
                if request.light_metrics_detrended and request.light_metrics_detrended.get('per_pulse'):
                    ax5b = fig5.add_axes([0.08, 0.12, 0.84, 0.30])
                    ax5b.axis('off')
                    ax5b.text(0.5, 1.05, 'Corrected HRV (LOESS Detrended)', ha='center', fontsize=10, fontweight='bold', color='#059669', transform=ax5b.transAxes)
                    
                    per_pulse_det = request.light_metrics_detrended['per_pulse']
                    final_det = request.light_metrics_detrended.get('final', {})
                    
                    headers_det = ['Stim #', 'ln(RMSSD₇₀)\ndetrended', 'RMSSD₇₀\ndet (ms)', 'ln(SDNN₇₀)\ndetrended', 'SDNN₇₀\ndet (ms)', 'pNN50₇₀\ndet (%)']
                    table_data_det = []
                    
                    for i, row in enumerate(per_pulse_det):
                        if row:
                            ln_rmssd_det = row.get('ln_rmssd70_detrended')
                            ln_sdnn_det = row.get('ln_sdnn70_detrended')
                            table_data_det.append([
                                str(i + 1),
                                f"{ln_rmssd_det:.3f}" if ln_rmssd_det is not None else "—",
                                f"{row.get('rmssd70_detrended', 0):.3f}",
                                f"{ln_sdnn_det:.3f}" if ln_sdnn_det is not None else "—",
                                f"{row.get('sdnn_detrended', 0):.3f}",
                                f"{row.get('pnn50_detrended', 0):.3f}",
                            ])
                        else:
                            table_data_det.append([str(i + 1), "—", "—", "—", "—", "—"])
                    
                    # Median row for detrended
                    if final_det:
                        ln_rmssd_med = final_det.get('ln_rmssd70_detrended')
                        ln_sdnn_med = final_det.get('ln_sdnn70_detrended')
                        table_data_det.append([
                            'Median',
                            f"{ln_rmssd_med:.3f}" if ln_rmssd_med is not None else "—",
                            f"{final_det.get('rmssd70_detrended', 0):.3f}",
                            f"{ln_sdnn_med:.3f}" if ln_sdnn_med is not None else "—",
                            f"{final_det.get('sdnn_detrended', 0):.3f}",
                            f"{final_det.get('pnn50_detrended', 0):.3f}",
                        ])
                    
                    table_det = ax5b.table(
                        cellText=table_data_det,
                        colLabels=headers_det,
                        loc='center',
                        cellLoc='center',
                        colWidths=[0.12, 0.17, 0.17, 0.17, 0.17, 0.14]
                    )
                    table_det.auto_set_font_size(False)
                    table_det.set_fontsize(9)
                    table_det.scale(1.0, 1.8)
                    
                    for (row, col), cell in table_det.get_celld().items():
                        cell.set_edgecolor('#d1d5db')
                        if row == 0:
                            cell.set_text_props(fontweight='bold', color='white')
                            cell.set_facecolor('#059669')
                            cell.set_height(0.09)
                        elif row == len(table_data_det):  # Median row
                            cell.set_text_props(fontweight='bold')
                            cell.set_facecolor('#a7f3d0')
                            cell.set_height(0.07)
                        else:
                            cell.set_facecolor('#d1fae5' if row % 2 == 0 else '#ffffff')
                            cell.set_height(0.06)
                
                pdf.savefig(fig5)
                plt.close(fig5)

        # Page 6: BF Analysis Table (per-minute data)
        if request.per_minute_data:
            fig6 = plt.figure(figsize=(8.5, 11))
            fig6.suptitle('BF Analysis\n(Per-Minute Beat Frequency Data)', fontsize=14, fontweight='bold', y=0.97)
            
            ax6 = fig6.add_axes([0.08, 0.15, 0.84, 0.75])
            ax6.axis('off')
            
            # Get baseline and drug readout minutes for highlighting
            baseline_bf_minute = request.baseline.get('baseline_bf_minute', 1) if request.baseline else 1
            drug_readout_minute = None
            if request.drug_readout:
                drug_readout_minute = request.drug_readout.get('bf_minute')
            
            headers = ['Time Window', 'Beat Count', 'Mean BF (bpm)', 'Mean NN (ms)', 'Mean NN₇₀ (ms)']
            table_data = []
            row_colors = []
            
            for row in request.per_minute_data:
                row_minute = row.get('minute', -1)
                is_baseline = row_minute == baseline_bf_minute
                is_drug = drug_readout_minute is not None and row_minute == drug_readout_minute
                
                table_data.append([
                    row.get('label', ''),
                    str(row.get('n_beats', 0)),
                    f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—',
                    f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—',
                    f"{row.get('avg_nn_70', 0):.1f}" if row.get('avg_nn_70') else '—',
                ])
                
                if is_baseline or is_drug:
                    row_colors.append('#ede9fe')  # Purple for both baseline and drug
                else:
                    row_colors.append('#ffffff' if len(row_colors) % 2 == 0 else '#f8fafc')
            
            if table_data:
                table = ax6.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='upper center',
                    cellLoc='center',
                    colWidths=[0.22, 0.18, 0.20, 0.20, 0.20]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(8)
                table.scale(1.0, 1.8)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#2563eb')
                        cell.set_height(0.04)
                    else:
                        cell.set_facecolor(row_colors[row - 1])
                        # Bold for highlighted rows
                        if row_colors[row - 1] == '#ede9fe':
                            cell.set_text_props(fontweight='bold')
                        cell.set_height(0.03)
                
                pdf.savefig(fig6)
                plt.close(fig6)

        # Page 7: HRV Analysis Table
        if request.hrv_windows:
            fig7 = plt.figure(figsize=(8.5, 11))
            fig7.suptitle('HRV Analysis\n(3-min Sliding Windows, Normalized to 70 bpm)', fontsize=14, fontweight='bold', y=0.97)
            
            ax7 = fig7.add_axes([0.05, 0.15, 0.90, 0.75])
            ax7.axis('off')
            
            # Get baseline and drug readout minutes for highlighting
            baseline_hrv_minute = request.baseline.get('baseline_hrv_minute', 0) if request.baseline else 0
            drug_readout_minute = None
            if request.drug_readout:
                drug_readout_minute = request.drug_readout.get('hrv_minute')
            
            headers = ['Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀', 'BF', 'Beats']
            table_data = []
            row_colors = []
            
            for row in request.hrv_windows:
                row_minute = row.get('minute', -1)
                is_baseline = row_minute == baseline_hrv_minute
                is_drug = drug_readout_minute is not None and row_minute == drug_readout_minute
                
                sdnn_val = row.get('sdnn')
                ln_sdnn = np.log(sdnn_val) if sdnn_val and sdnn_val > 0 else None
                pnn50_val = row.get('pnn50')
                
                table_data.append([
                    row.get('window', ''),
                    f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—',
                    f"{row.get('rmssd70', 0):.1f}" if row.get('rmssd70') else '—',
                    f"{ln_sdnn:.3f}" if ln_sdnn else '—',
                    f"{sdnn_val:.1f}" if sdnn_val else '—',
                    f"{pnn50_val:.1f}" if pnn50_val is not None else '0.0',
                    f"{row.get('mean_bf', 0):.1f}" if row.get('mean_bf') else '—',
                    str(row.get('n_beats', 0)),
                ])
                
                if is_baseline or is_drug:
                    row_colors.append('#ede9fe')  # Purple for both baseline and drug
                else:
                    row_colors.append('#ffffff' if len(row_colors) % 2 == 0 else '#f8fafc')
            
            if table_data:
                table = ax7.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='upper center',
                    cellLoc='center',
                    colWidths=[0.14, 0.13, 0.11, 0.13, 0.10, 0.11, 0.10, 0.10]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(7)
                table.scale(1.0, 1.6)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#7c3aed')  # Purple header
                        cell.set_height(0.035)
                    else:
                        cell.set_facecolor(row_colors[row - 1])
                        # Bold for highlighted rows
                        if row_colors[row - 1] == '#ede9fe':
                            cell.set_text_props(fontweight='bold')
                        cell.set_height(0.025)
                
                pdf.savefig(fig7)
                plt.close(fig7)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.pdf"}
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
