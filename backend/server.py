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
    baseline_hrv_start: float = 0.0
    baseline_hrv_end: float = 3.0
    baseline_bf_start: float = 1.0
    baseline_bf_end: float = 2.0


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
    summary: Optional[dict] = None
    filename: str = "analysis"
    recording_name: Optional[str] = None
    drug_used: Optional[str] = None
    per_minute_data: Optional[List[dict]] = None
    baseline: Optional[dict] = None


# --- Endpoints ---
@api_router.get("/")
async def root():
    return {"message": "NeuroVoltage API"}


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
    filter_mask = analysis.artifact_filter(
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

    pulses = analysis.compute_light_pulses(
        start_sec, request.pulse_duration_sec,
        interval_sec=interval_arg, n_pulses=request.n_pulses
    )
    return {'pulses': pulses, 'detected_start_sec': start_sec}


@api_router.post("/light-hrv")
async def light_hrv_endpoint(request: LightHRVRequest):
    per_pulse, final = analysis.compute_light_hrv(
        request.beat_times_min, request.bf_filtered, request.pulses
    )
    return {'per_pulse': per_pulse, 'final': final}


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
    rows = analysis.compute_per_minute_table(request.beat_times_min, request.bf_filtered)
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
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    
    wb = openpyxl.Workbook()
    
    # Style definitions
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    data_fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    def style_header(ws, row=1):
        for cell in ws[row]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal='center')
            cell.border = thin_border
    
    def auto_width(ws):
        for column in ws.columns:
            max_length = 0
            column_letter = get_column_letter(column[0].column)
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 30)
            ws.column_dimensions[column_letter].width = adjusted_width

    # Summary sheet (first)
    ws_summary = wb.active
    ws_summary.title = "Summary"
    ws_summary.append(["Electrophysiology Analysis Summary"])
    ws_summary['A1'].font = Font(bold=True, size=14)
    ws_summary.append([])
    
    if request.recording_name:
        ws_summary.append(["Recording Name", request.recording_name])
    if request.drug_used:
        ws_summary.append(["Drug Used", request.drug_used])
    ws_summary.append([])
    
    if request.summary:
        ws_summary.append(["Metric", "Value"])
        style_header(ws_summary, ws_summary.max_row)
        for k, v in request.summary.items():
            ws_summary.append([k, v if v is not None else "—"])
    
    if request.baseline:
        ws_summary.append([])
        ws_summary.append(["Baseline Metrics"])
        ws_summary[f'A{ws_summary.max_row}'].font = Font(bold=True)
        for k, v in request.baseline.items():
            if v is not None:
                ws_summary.append([k.replace('baseline_', '').replace('_', ' ').title(), 
                                  f"{v:.3f}" if isinstance(v, float) else v])
    
    auto_width(ws_summary)

    # Per-beat sheet
    if request.per_beat_data:
        ws = wb.create_sheet("Per-Beat Data")
        keys = ['time_min', 'bf_bpm', 'nn_ms', 'status']
        headers = ['Time (min)', 'BF (bpm)', 'NN (ms)', 'Status']
        ws.append(headers)
        style_header(ws)
        for row in request.per_beat_data:
            ws.append([row.get(k) for k in keys])
        auto_width(ws)

    # Per-minute sheet
    if request.per_minute_data:
        ws_pm = wb.create_sheet("Per-Minute Data")
        headers = ['Minute', 'Beats', 'Avg BF (bpm)', 'Avg NN (ms)', 'Avg NN₇₀ (ms)']
        ws_pm.append(headers)
        style_header(ws_pm)
        for row in request.per_minute_data:
            ws_pm.append([
                row.get('label', ''),
                row.get('n_beats', 0),
                f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—',
                f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—',
                f"{row.get('avg_nn_70', 0):.1f}" if row.get('avg_nn_70') else '—',
            ])
        auto_width(ws_pm)

    # HRV windows
    if request.hrv_windows:
        ws2 = wb.create_sheet("HRV Windows (3-min)")
        headers = ['Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'SDNN', 'pNN50 (%)', 'Mean BF', 'Beats']
        ws2.append(headers)
        style_header(ws2)
        for row in request.hrv_windows:
            ws2.append([
                row.get('window', ''),
                f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—',
                f"{row.get('rmssd70', 0):.2f}" if row.get('rmssd70') else '—',
                f"{row.get('sdnn', 0):.2f}" if row.get('sdnn') else '—',
                f"{row.get('pnn50', 0):.1f}" if row.get('pnn50') else '—',
                f"{row.get('mean_bf', 0):.1f}" if row.get('mean_bf') else '—',
                row.get('n_beats', 0),
            ])
        auto_width(ws2)

    # Light HRV metrics
    if request.light_metrics:
        ws3 = wb.create_sheet("Light HRV")
        valid = [m for m in request.light_metrics if m is not None]
        if valid:
            headers = ['Pulse', 'RMSSD₇₀', 'ln(RMSSD₇₀)', 'SDNN', 'pNN50 (%)', 'Beats']
            ws3.append(headers)
            style_header(ws3)
            for i, row in enumerate(valid):
                ws3.append([
                    i + 1,
                    f"{row.get('rmssd70', 0):.2f}",
                    f"{row.get('ln_rmssd70', 0):.3f}" if row.get('ln_rmssd70') else '—',
                    f"{row.get('sdnn', 0):.2f}",
                    f"{row.get('pnn50', 0):.1f}",
                    row.get('n_beats', 0),
                ])
            auto_width(ws3)

    # Light response
    if request.light_response:
        ws4 = wb.create_sheet("Light Response")
        valid = [m for m in request.light_response if m is not None]
        if valid:
            headers = ['Stim', 'Beats', 'BF', 'NN', 'NN₇₀', 'Peak BF', 'Peak %', 'Time to Peak (s)', 'Amplitude', 'Slope (norm)']
            ws4.append(headers)
            style_header(ws4)
            for i, row in enumerate(valid):
                ws4.append([
                    i + 1,
                    row.get('n_beats', 0),
                    f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—',
                    f"{row.get('avg_nn', 0):.1f}" if row.get('avg_nn') else '—',
                    f"{row.get('nn_70', 0):.1f}" if row.get('nn_70') else '—',
                    f"{row.get('peak_bf', 0):.1f}",
                    f"{row.get('peak_norm_pct', 0):.1f}" if row.get('peak_norm_pct') else '—',
                    f"{row.get('time_to_peak_sec', 0):.1f}",
                    f"{row.get('amplitude', 0):.1f}" if row.get('amplitude') else '—',
                    f"{row.get('norm_slope', 0):.4f}" if row.get('norm_slope') else '—',
                ])
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

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        # Page 1: Title and Summary
        fig1 = plt.figure(figsize=(11, 8.5))
        fig1.patch.set_facecolor('white')
        
        # Title
        title = request.recording_name or request.filename or 'Electrophysiology Analysis'
        fig1.text(0.5, 0.92, title, ha='center', fontsize=18, fontweight='bold')
        fig1.text(0.5, 0.88, f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}', 
                  ha='center', fontsize=10, color='gray')
        
        if request.drug_used:
            fig1.text(0.5, 0.84, f'Drug: {request.drug_used}', ha='center', fontsize=11, 
                      style='italic', color='#6B46C1')
        
        # Summary table
        if request.summary:
            ax1 = fig1.add_axes([0.15, 0.35, 0.7, 0.4])
            ax1.axis('off')
            
            table_data = [[k, str(v) if v is not None else '—'] for k, v in request.summary.items()]
            table = ax1.table(
                cellText=table_data,
                colLabels=['Metric', 'Value'],
                loc='center',
                cellLoc='left',
                colWidths=[0.5, 0.5]
            )
            table.auto_set_font_size(False)
            table.set_fontsize(10)
            table.scale(1.2, 1.8)
            
            # Style header
            for (row, col), cell in table.get_celld().items():
                if row == 0:
                    cell.set_text_props(fontweight='bold', color='white')
                    cell.set_facecolor('#1E3A5F')
                else:
                    cell.set_facecolor('#F8F9FA' if row % 2 == 0 else 'white')
        
        # Baseline section if available
        if request.baseline:
            ax_baseline = fig1.add_axes([0.15, 0.08, 0.7, 0.2])
            ax_baseline.axis('off')
            ax_baseline.text(0, 0.9, 'Baseline Metrics', fontsize=12, fontweight='bold')
            
            baseline_text = []
            if request.baseline.get('baseline_bf'):
                baseline_text.append(f"BF ({request.baseline.get('baseline_bf_range', '1-2 min')}): {request.baseline['baseline_bf']:.1f} bpm")
            if request.baseline.get('baseline_ln_rmssd70'):
                baseline_text.append(f"ln(RMSSD₇₀) ({request.baseline.get('baseline_hrv_range', '0-3 min')}): {request.baseline['baseline_ln_rmssd70']:.3f}")
            if request.baseline.get('baseline_sdnn'):
                baseline_text.append(f"SDNN: {request.baseline['baseline_sdnn']:.2f} ms")
            
            ax_baseline.text(0, 0.5, '\n'.join(baseline_text), fontsize=10, color='#374151')
        
        pdf.savefig(fig1)
        plt.close(fig1)

        # Page 2: BF and NN plots
        if request.per_beat_data:
            fig2, axes = plt.subplots(2, 1, figsize=(11, 8.5))
            fig2.suptitle('Beat Frequency and NN Intervals', fontsize=14, fontweight='bold')
            
            times = [r.get('time_min', 0) for r in request.per_beat_data]
            bfs = [r.get('bf_bpm', 0) for r in request.per_beat_data]
            nns = [r.get('nn_ms', 0) for r in request.per_beat_data]
            statuses = [r.get('status', 'kept') for r in request.per_beat_data]
            
            # Color by status
            colors_bf = ['#22D3EE' if s == 'kept' else '#EF4444' for s in statuses]
            colors_nn = ['#A3E635' if s == 'kept' else '#EF4444' for s in statuses]

            axes[0].scatter(times, bfs, c=colors_bf, s=2, alpha=0.7)
            axes[0].set_xlabel('Time (min)', fontsize=10)
            axes[0].set_ylabel('Beat Frequency (bpm)', fontsize=10)
            axes[0].set_title('Beat Frequency vs Time (cyan=kept, red=filtered)', fontsize=10)
            axes[0].grid(True, alpha=0.3)
            axes[0].set_facecolor('#FAFAFA')

            axes[1].scatter(times, nns, c=colors_nn, s=2, alpha=0.7)
            axes[1].set_xlabel('Time (min)', fontsize=10)
            axes[1].set_ylabel('NN Interval (ms)', fontsize=10)
            axes[1].set_title('NN Intervals vs Time (green=kept, red=filtered)', fontsize=10)
            axes[1].grid(True, alpha=0.3)
            axes[1].set_facecolor('#FAFAFA')

            plt.tight_layout()
            pdf.savefig(fig2)
            plt.close(fig2)

        # Page 3: HRV evolution
        if request.hrv_windows:
            fig3, axes3 = plt.subplots(3, 1, figsize=(11, 8.5))
            fig3.suptitle('HRV Evolution (3-min Sliding Windows, Normalized to 70 bpm)', 
                          fontsize=14, fontweight='bold')
            
            minutes = [w.get('minute', 0) for w in request.hrv_windows]
            ln_rmssd = [w.get('ln_rmssd70') for w in request.hrv_windows]
            sdnn = [w.get('sdnn', 0) for w in request.hrv_windows]
            pnn50 = [w.get('pnn50', 0) for w in request.hrv_windows]

            axes3[0].plot(minutes, ln_rmssd, 'o-', color='#22D3EE', markersize=4, linewidth=1.5)
            axes3[0].set_ylabel('ln(RMSSD₇₀)', fontsize=10)
            axes3[0].grid(True, alpha=0.3)
            axes3[0].set_facecolor('#FAFAFA')

            axes3[1].plot(minutes, sdnn, 'o-', color='#C084FC', markersize=4, linewidth=1.5)
            axes3[1].set_ylabel('SDNN (ms)', fontsize=10)
            axes3[1].grid(True, alpha=0.3)
            axes3[1].set_facecolor('#FAFAFA')

            axes3[2].plot(minutes, pnn50, 'o-', color='#FB923C', markersize=4, linewidth=1.5)
            axes3[2].set_xlabel('Window Start (min)', fontsize=10)
            axes3[2].set_ylabel('pNN50 (%)', fontsize=10)
            axes3[2].grid(True, alpha=0.3)
            axes3[2].set_facecolor('#FAFAFA')

            plt.tight_layout()
            pdf.savefig(fig3)
            plt.close(fig3)

        # Page 4: Light Response (if available)
        if request.light_response:
            valid = [m for m in request.light_response if m is not None]
            if valid:
                fig4, ax4 = plt.subplots(figsize=(11, 8.5))
                fig4.suptitle('Light Stimulation Response', fontsize=14, fontweight='bold')
                ax4.axis('off')
                
                headers = ['Stim', 'Beats', 'BF', 'Peak BF', 'Peak %', 'Time to Peak', 'Amplitude']
                table_data = []
                for i, row in enumerate(valid):
                    table_data.append([
                        str(i + 1),
                        str(row.get('n_beats', 0)),
                        f"{row.get('avg_bf', 0):.1f}" if row.get('avg_bf') else '—',
                        f"{row.get('peak_bf', 0):.1f}",
                        f"{row.get('peak_norm_pct', 0):.1f}%" if row.get('peak_norm_pct') else '—',
                        f"{row.get('time_to_peak_sec', 0):.1f}s",
                        f"{row.get('amplitude', 0):.1f}" if row.get('amplitude') else '—',
                    ])
                
                table = ax4.table(
                    cellText=table_data,
                    colLabels=headers,
                    loc='center',
                    cellLoc='center'
                )
                table.auto_set_font_size(False)
                table.set_fontsize(10)
                table.scale(1.2, 2.0)
                
                for (row, col), cell in table.get_celld().items():
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor('#B45309')
                    else:
                        cell.set_facecolor('#FEF3C7' if row % 2 == 0 else 'white')
                
                pdf.savefig(fig4)
                plt.close(fig4)

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
