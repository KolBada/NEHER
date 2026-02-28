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
    light_response: Optional[List[dict]] = None
    light_pulses: Optional[List[dict]] = None  # For showing light stim zones on charts
    summary: Optional[dict] = None
    filename: str = "analysis"
    recording_name: Optional[str] = None
    drug_used: Optional[str] = None
    per_minute_data: Optional[List[dict]] = None
    baseline: Optional[dict] = None


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
    
    # Compute baseline metrics
    baseline = analysis.compute_baseline_metrics(
        request.beat_times_min, request.bf_filtered,
        hrv_start=request.baseline_hrv_start,
        hrv_end=request.baseline_hrv_end,
        bf_start=request.baseline_bf_start,
        bf_end=request.baseline_bf_end
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


@api_router.post("/per-minute-metrics")
async def per_minute_metrics_endpoint(request: PerMinuteRequest):
    if len(request.beat_times_min) < 2:
        raise HTTPException(400, "Need at least 2 beats")
    # per_minute_aggregation requires nn_70, compute it from bf_filtered
    nn_values = analysis.bf_to_nn(request.bf_filtered)
    nn_70 = analysis.normalize_nn_70_windowing(request.beat_times_min, nn_values)
    rows = analysis.per_minute_aggregation(request.beat_times_min, request.bf_filtered, nn_70)
    return {'rows': rows}


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
    
    # Baseline metrics section
    if request.baseline:
        ws_summary[f'A{current_row}'] = 'Baseline Metrics'
        ws_summary[f'A{current_row}'].font = subtitle_font
        current_row += 1
        
        ws_summary[f'A{current_row}'] = 'Metric'
        ws_summary[f'B{current_row}'] = 'Value'
        ws_summary[f'C{current_row}'] = 'Time Window'
        style_header(ws_summary, current_row)
        current_row += 1
        
        baseline_data = [
            ('Beat Frequency', f"{request.baseline.get('baseline_bf', 0):.1f} bpm", request.baseline.get('baseline_bf_range', '1-2 min')),
            ('ln(RMSSD₇₀)', f"{request.baseline.get('baseline_ln_rmssd70', 0):.3f}", request.baseline.get('baseline_hrv_range', '0-3 min')),
            ('RMSSD₇₀', f"{request.baseline.get('baseline_rmssd70', 0):.2f} ms", ''),
            ('SDNN', f"{request.baseline.get('baseline_sdnn', 0):.2f} ms", ''),
            ('pNN50', f"{request.baseline.get('baseline_pnn50', 0):.1f}%", ''),
        ]
        
        for label, value, window in baseline_data:
            ws_summary[f'A{current_row}'] = label
            ws_summary[f'B{current_row}'] = value
            ws_summary[f'C{current_row}'] = window
            for col in ['A', 'B', 'C']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
            current_row += 1
        
        current_row += 1
    
    if request.summary:
        ws_summary[f'A{current_row}'] = 'Analysis Summary'
        ws_summary[f'A{current_row}'].font = subtitle_font
        current_row += 1
        
        ws_summary[f'A{current_row}'] = 'Parameter'
        ws_summary[f'B{current_row}'] = 'Value'
        style_header(ws_summary, current_row)
        current_row += 1
        
        for k, v in request.summary.items():
            ws_summary[f'A{current_row}'] = k
            ws_summary[f'B{current_row}'] = str(v) if v is not None else '—'
            for col in ['A', 'B']:
                ws_summary[f'{col}{current_row}'].font = data_font
                ws_summary[f'{col}{current_row}'].border = thin_border
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

    # Per-minute sheet
    if request.per_minute_data:
        ws_pm = wb.create_sheet("Per-Minute Analysis")
        headers = ['Time Window', 'Beat Count', 'Mean BF (bpm)', 'Mean NN (ms)', 'Mean NN₇₀ (ms)']
        for col, h in enumerate(headers, 1):
            ws_pm.cell(row=1, column=col, value=h)
        style_header(ws_pm, 1)
        
        for row_idx, row in enumerate(request.per_minute_data, 2):
            ws_pm.cell(row=row_idx, column=1, value=row.get('label', ''))
            ws_pm.cell(row=row_idx, column=2, value=row.get('n_beats', 0))
            ws_pm.cell(row=row_idx, column=3, value=f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—')
            ws_pm.cell(row=row_idx, column=4, value=f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—')
            ws_pm.cell(row=row_idx, column=5, value=f"{row.get('avg_nn_70', 0):.1f}" if row.get('avg_nn_70') else '—')
        
        style_data_rows(ws_pm, 2)
        auto_width(ws_pm)

    # HRV windows
    if request.hrv_windows:
        ws2 = wb.create_sheet("HRV Analysis")
        headers = ['Time Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀ (ms)', 'SDNN (ms)', 'pNN50 (%)', 'Mean BF (bpm)', 'Beat Count']
        for col, h in enumerate(headers, 1):
            ws2.cell(row=1, column=col, value=h)
        style_header(ws2, 1, fill=header_fill_purple)
        
        for row_idx, row in enumerate(request.hrv_windows, 2):
            ws2.cell(row=row_idx, column=1, value=row.get('window', ''))
            ws2.cell(row=row_idx, column=2, value=f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—')
            ws2.cell(row=row_idx, column=3, value=f"{row.get('rmssd70', 0):.2f}" if row.get('rmssd70') else '—')
            ws2.cell(row=row_idx, column=4, value=f"{row.get('sdnn', 0):.2f}" if row.get('sdnn') else '—')
            ws2.cell(row=row_idx, column=5, value=f"{row.get('pnn50', 0):.1f}" if row.get('pnn50') else '—')
            ws2.cell(row=row_idx, column=6, value=f"{row.get('mean_bf', 0):.1f}" if row.get('mean_bf') else '—')
            ws2.cell(row=row_idx, column=7, value=row.get('n_beats', 0))
        
        style_data_rows(ws2, 2)
        auto_width(ws2)

    # Light HRV metrics
    if request.light_metrics:
        ws3 = wb.create_sheet("Light Stim HRV")
        valid = [m for m in request.light_metrics if m is not None]
        if valid:
            headers = ['Pulse #', 'RMSSD₇₀ (ms)', 'ln(RMSSD₇₀)', 'SDNN (ms)', 'pNN50 (%)', 'Beat Count']
            for col, h in enumerate(headers, 1):
                ws3.cell(row=1, column=col, value=h)
            style_header(ws3, 1, fill=header_fill_cyan)
            
            for row_idx, row in enumerate(valid, 2):
                ws3.cell(row=row_idx, column=1, value=row_idx - 1)
                ws3.cell(row=row_idx, column=2, value=f"{row.get('rmssd70', 0):.2f}")
                ws3.cell(row=row_idx, column=3, value=f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—')
                ws3.cell(row=row_idx, column=4, value=f"{row.get('sdnn', 0):.2f}")
                ws3.cell(row=row_idx, column=5, value=f"{row.get('pnn50', 0):.1f}")
                ws3.cell(row=row_idx, column=6, value=row.get('n_beats', 0))
            
            style_data_rows(ws3, 2)
            auto_width(ws3)

    # Light response
    if request.light_response:
        ws4 = wb.create_sheet("Light Stim Response")
        valid = [m for m in request.light_response if m is not None]
        if valid:
            headers = ['Stim #', 'Beats', 'Mean BF (bpm)', 'Mean NN (ms)', 'NN₇₀ (ms)', 'Peak BF (bpm)', 'Peak (%)', 'Time to Peak (s)', 'Amplitude (bpm)', 'Norm. Slope']
            for col, h in enumerate(headers, 1):
                ws4.cell(row=1, column=col, value=h)
            style_header(ws4, 1, fill=header_fill_amber)
            
            for row_idx, row in enumerate(valid, 2):
                ws4.cell(row=row_idx, column=1, value=row_idx - 1)
                ws4.cell(row=row_idx, column=2, value=row.get('n_beats', 0))
                ws4.cell(row=row_idx, column=3, value=f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—')
                ws4.cell(row=row_idx, column=4, value=f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—')
                ws4.cell(row=row_idx, column=5, value=f"{row.get('nn_70', 0):.1f}" if row.get('nn_70') else '—')
                ws4.cell(row=row_idx, column=6, value=f"{row.get('peak_bf', 0):.1f}")
                ws4.cell(row=row_idx, column=7, value=f"{row.get('peak_norm_pct', 0):.1f}" if row.get('peak_norm_pct') else '—')
                ws4.cell(row=row_idx, column=8, value=f"{row.get('time_to_peak_sec', 0):.1f}")
                ws4.cell(row=row_idx, column=9, value=f"{row.get('amplitude', 0):.1f}" if row.get('amplitude') else '—')
                ws4.cell(row=row_idx, column=10, value=f"{row.get('norm_slope', 0):.4f}" if row.get('norm_slope') else '—')
            
            style_data_rows(ws4, 2)
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

        # Summary metrics in a clean table format
        if request.baseline or request.summary:
            ax_summary = fig1.add_axes([0.1, 0.45, 0.8, 0.35])
            ax_summary.axis('off')
            
            # Build summary data
            summary_rows = []
            
            if request.baseline:
                b = request.baseline
                if b.get('baseline_bf'):
                    summary_rows.append(['Baseline BF', f"{b['baseline_bf']:.1f} bpm", b.get('baseline_bf_range', '1-2 min')])
                if b.get('baseline_ln_rmssd70'):
                    summary_rows.append(['Baseline ln(RMSSD₇₀)', f"{b['baseline_ln_rmssd70']:.3f}", b.get('baseline_hrv_range', '0-3 min')])
                if b.get('baseline_rmssd70'):
                    summary_rows.append(['Baseline RMSSD₇₀', f"{b['baseline_rmssd70']:.2f} ms", ''])
                if b.get('baseline_sdnn'):
                    summary_rows.append(['Baseline SDNN', f"{b['baseline_sdnn']:.2f} ms", ''])
                if b.get('baseline_pnn50') is not None:
                    summary_rows.append(['Baseline pNN50', f"{b['baseline_pnn50']:.1f}%", ''])
            
            if request.summary:
                for k, v in request.summary.items():
                    if v is not None and k not in ['Recording Name', 'Drug(s) Used']:
                        summary_rows.append([k, str(v), ''])
            
            if summary_rows:
                table = ax_summary.table(
                    cellText=summary_rows,
                    colLabels=['Metric', 'Value', 'Time Window'],
                    loc='center',
                    cellLoc='left',
                    colWidths=[0.4, 0.3, 0.3]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(10)
                table.scale(1.0, 2.0)
                
                # CELL style table formatting
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#e0e0e0')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#2563eb')
                        cell.set_height(0.08)
                    else:
                        cell.set_facecolor('#ffffff' if row % 2 == 1 else '#f8fafc')
                        cell.set_height(0.06)

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

        # Page 3: HRV evolution with FIXED Y-AXIS SCALES
        if request.hrv_windows:
            fig3, axes3 = plt.subplots(3, 1, figsize=(8.5, 11))
            fig3.suptitle('HRV Metrics Evolution\n(3-min Sliding Windows, Normalized to 70 bpm)', 
                          fontsize=14, fontweight='bold', y=0.97)
            
            minutes = [w.get('minute', 0) for w in request.hrv_windows]
            ln_rmssd = [w.get('ln_rmssd70') for w in request.hrv_windows]
            sdnn = [w.get('sdnn', 0) for w in request.hrv_windows]
            pnn50 = [w.get('pnn50', 0) for w in request.hrv_windows]

            # ln(RMSSD) - FIXED Y-AXIS 0-8
            axes3[0].plot(minutes, ln_rmssd, 'o-', color='#0ea5e9', markersize=4, linewidth=1.5)
            axes3[0].fill_between(minutes, ln_rmssd, alpha=0.2, color='#0ea5e9')
            axes3[0].set_ylabel('ln(RMSSD₇₀)', fontsize=11, fontweight='bold')
            axes3[0].set_ylim(0, 8)  # FIXED Y-AXIS
            axes3[0].set_title('Parasympathetic Activity Index', fontsize=11, pad=10)
            axes3[0].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[0].set_facecolor('#fafafa')
            axes3[0].spines['top'].set_visible(False)
            axes3[0].spines['right'].set_visible(False)

            # SDNN - FIXED Y-AXIS 0-300
            axes3[1].plot(minutes, sdnn, 'o-', color='#a855f7', markersize=4, linewidth=1.5)
            axes3[1].fill_between(minutes, sdnn, alpha=0.2, color='#a855f7')
            axes3[1].set_ylabel('SDNN (ms)', fontsize=11, fontweight='bold')
            axes3[1].set_ylim(0, 300)  # FIXED Y-AXIS
            axes3[1].set_title('Overall HRV', fontsize=11, pad=10)
            axes3[1].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[1].set_facecolor('#fafafa')
            axes3[1].spines['top'].set_visible(False)
            axes3[1].spines['right'].set_visible(False)

            # pNN50 - FIXED Y-AXIS 0-100
            axes3[2].plot(minutes, pnn50, 'o-', color='#f97316', markersize=4, linewidth=1.5)
            axes3[2].fill_between(minutes, pnn50, alpha=0.2, color='#f97316')
            axes3[2].set_xlabel('Window Start (min)', fontsize=11)
            axes3[2].set_ylabel('pNN50 (%)', fontsize=11, fontweight='bold')
            axes3[2].set_ylim(0, 100)  # FIXED Y-AXIS
            axes3[2].set_title('Beat-to-Beat Variability', fontsize=11, pad=10)
            axes3[2].grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            axes3[2].set_facecolor('#fafafa')
            axes3[2].spines['top'].set_visible(False)
            axes3[2].spines['right'].set_visible(False)

            plt.tight_layout(rect=[0, 0.02, 1, 0.93])
            pdf.savefig(fig3)
            plt.close(fig3)

        # Page 4: Light Response (CELL magazine style table)
        if request.light_response:
            valid = [m for m in request.light_response if m is not None]
            if valid:
                fig4 = plt.figure(figsize=(8.5, 11))
                fig4.suptitle('Light Stimulation Response Analysis', fontsize=14, fontweight='bold', y=0.96)
                
                ax4 = fig4.add_axes([0.08, 0.4, 0.84, 0.45])
                ax4.axis('off')
                
                headers = ['Stim #', 'Beats', 'Avg BF\n(bpm)', 'Peak BF\n(bpm)', 'Peak\n(%)', 'Time to\nPeak (s)', 'Amplitude\n(bpm)']
                table_data = []
                for i, row in enumerate(valid):
                    table_data.append([
                        str(i + 1),
                        str(row.get('n_beats', 0)),
                        f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—',
                        f"{row.get('peak_bf', 0):.1f}",
                        f"{row.get('peak_norm_pct', 0):.1f}" if row.get('peak_norm_pct') else '—',
                        f"{row.get('time_to_peak_sec', 0):.1f}",
                        f"{row.get('amplitude', 0):.1f}" if row.get('amplitude') else '—',
                    ])
                
                table = ax4.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='center',
                    cellLoc='center',
                    colWidths=[0.1, 0.1, 0.14, 0.14, 0.12, 0.14, 0.14]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(9)
                table.scale(1.0, 2.5)
                
                # CELL style formatting
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#d97706')
                        cell.set_height(0.1)
                    else:
                        cell.set_facecolor('#fffbeb' if row % 2 == 0 else '#ffffff')
                        cell.set_height(0.07)
                
                # Add summary stats below table
                ax_stats = fig4.add_axes([0.1, 0.15, 0.8, 0.15])
                ax_stats.axis('off')
                
                # Calculate averages
                avg_peak = np.mean([r['peak_bf'] for r in valid if r.get('peak_bf')])
                avg_ttp = np.mean([r['time_to_peak_sec'] for r in valid if r.get('time_to_peak_sec')])
                avg_amp = np.mean([r['amplitude'] for r in valid if r.get('amplitude')])
                
                stats_text = "Summary Statistics:\n"
                stats_text += f"Average Peak BF: {avg_peak:.1f} bpm  |  "
                stats_text += f"Average Time to Peak: {avg_ttp:.1f} s  |  "
                stats_text += f"Average Amplitude: {avg_amp:.1f} bpm"
                ax_stats.text(0.5, 0.5, stats_text, ha='center', va='center', fontsize=10, 
                             fontweight='bold', color='#374151',
                             bbox=dict(boxstyle='round,pad=0.5', facecolor='#f3f4f6', edgecolor='#d1d5db'))
                
                pdf.savefig(fig4)
                plt.close(fig4)

        # Page 5: Light HRV metrics (if available)
        if request.light_metrics:
            valid_hrv = [m for m in request.light_metrics if m is not None]
            if valid_hrv:
                fig5 = plt.figure(figsize=(8.5, 11))
                fig5.suptitle('Light-Induced HRV Analysis', fontsize=14, fontweight='bold', y=0.96)
                
                ax5 = fig5.add_axes([0.1, 0.5, 0.8, 0.35])
                ax5.axis('off')
                
                headers = ['Pulse #', 'RMSSD₇₀\n(ms)', 'ln(RMSSD₇₀)', 'SDNN\n(ms)', 'pNN50\n(%)', 'Beats']
                table_data = []
                for i, row in enumerate(valid_hrv):
                    table_data.append([
                        str(i + 1),
                        f"{row.get('rmssd70', 0):.2f}",
                        f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—',
                        f"{row.get('sdnn', 0):.2f}",
                        f"{row.get('pnn50', 0):.1f}",
                        str(row.get('n_beats', 0)),
                    ])
                
                table = ax5.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='center',
                    cellLoc='center',
                    colWidths=[0.12, 0.18, 0.18, 0.16, 0.16, 0.12]
                )
                table.auto_set_font_size(False)
                table.set_fontsize(9)
                table.scale(1.0, 2.5)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#d1d5db')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#0891b2')
                        cell.set_height(0.1)
                    else:
                        cell.set_facecolor('#ecfeff' if row % 2 == 0 else '#ffffff')
                        cell.set_height(0.07)
                
                pdf.savefig(fig5)
                plt.close(fig5)

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
