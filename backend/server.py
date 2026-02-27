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


class HRVAnalysisRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    readout_minute: Optional[int] = None


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


class ExportRequest(BaseModel):
    per_beat_data: Optional[List[dict]] = None
    hrv_windows: Optional[List[dict]] = None
    light_metrics: Optional[List[dict]] = None
    light_response: Optional[List[dict]] = None
    summary: Optional[dict] = None
    filename: str = "analysis"


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
    filter_mask = analysis.artifact_filter(bf_bpm)

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
        'n_removed': int(np.sum(~mask_arr))
    }


@api_router.post("/hrv-analysis")
async def hrv_analysis_endpoint(request: HRVAnalysisRequest):
    if len(request.beat_times_min) < 6:
        raise HTTPException(400, "Need at least 6 beats for HRV")
    results, readout = analysis.spontaneous_hrv_analysis(
        request.beat_times_min, request.bf_filtered, request.readout_minute
    )
    return {'windows': results, 'readout': readout}


@api_router.post("/light-detect")
async def light_detect_endpoint(request: LightDetectRequest):
    pulses = analysis.compute_light_pulses(
        request.start_time_sec, request.pulse_duration_sec,
        request.interval_sec, request.n_pulses
    )
    return {'pulses': pulses}


@api_router.post("/light-hrv")
async def light_hrv_endpoint(request: LightHRVRequest):
    per_pulse, final = analysis.compute_light_hrv(
        request.beat_times_min, request.bf_filtered, request.pulses
    )
    return {'per_pulse': per_pulse, 'final': final}


@api_router.post("/light-response")
async def light_response_endpoint(request: LightResponseRequest):
    per_stim, mean_metrics, baseline_bf = analysis.compute_light_response(
        request.beat_times_min, request.bf_filtered, request.pulses
    )
    return {
        'per_stim': per_stim,
        'mean_metrics': mean_metrics,
        'baseline_bf': baseline_bf
    }


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
    wb = openpyxl.Workbook()

    # Per-beat sheet
    if request.per_beat_data:
        ws = wb.active
        ws.title = "Per-Beat Data"
        keys = list(request.per_beat_data[0].keys())
        ws.append(keys)
        for row in request.per_beat_data:
            ws.append([row.get(k) for k in keys])

    # HRV windows
    if request.hrv_windows:
        ws2 = wb.create_sheet("HRV Windows")
        keys = list(request.hrv_windows[0].keys())
        ws2.append(keys)
        for row in request.hrv_windows:
            ws2.append([row.get(k) for k in keys])

    # Light metrics
    if request.light_metrics:
        ws3 = wb.create_sheet("Light Metrics")
        valid = [m for m in request.light_metrics if m is not None]
        if valid:
            keys = list(valid[0].keys())
            ws3.append(keys)
            for row in valid:
                ws3.append([row.get(k) for k in keys])

    # Light response
    if request.light_response:
        ws4 = wb.create_sheet("Light Response")
        valid = [m for m in request.light_response if m is not None]
        if valid:
            keys = list(valid[0].keys())
            ws4.append(keys)
            for row in valid:
                ws4.append([row.get(k) for k in keys])

    # Summary
    if request.summary:
        ws5 = wb.create_sheet("Summary")
        ws5.append(["Metric", "Value"])
        for k, v in request.summary.items():
            ws5.append([k, v])

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

    buf = io.BytesIO()
    with PdfPages(buf) as pdf:
        # Page 1: BF vs Time + Summary
        fig, axes = plt.subplots(2, 1, figsize=(11, 8.5))
        fig.suptitle('Electrophysiology Analysis Report', fontsize=14, fontweight='bold')

        if request.per_beat_data:
            times = [r.get('time_min', 0) for r in request.per_beat_data]
            bfs = [r.get('bf_bpm', 0) for r in request.per_beat_data]
            nns = [r.get('nn_ms', 0) for r in request.per_beat_data]

            axes[0].plot(times, bfs, 'b-', linewidth=0.5, alpha=0.8)
            axes[0].set_xlabel('Time (min)')
            axes[0].set_ylabel('Beat Frequency (bpm)')
            axes[0].set_title('Beat Frequency vs Time')
            axes[0].grid(True, alpha=0.3)

            axes[1].plot(times, nns, 'r-', linewidth=0.5, alpha=0.8)
            axes[1].set_xlabel('Time (min)')
            axes[1].set_ylabel('NN Interval (ms)')
            axes[1].set_title('NN Intervals vs Time')
            axes[1].grid(True, alpha=0.3)

        plt.tight_layout()
        pdf.savefig(fig)
        plt.close(fig)

        # Page 2: HRV evolution
        if request.hrv_windows:
            fig2, axes2 = plt.subplots(3, 1, figsize=(11, 8.5))
            minutes = [w.get('minute', 0) for w in request.hrv_windows]
            ln_rmssd = [w.get('ln_rmssd70') for w in request.hrv_windows]
            sdnn = [w.get('sdnn', 0) for w in request.hrv_windows]
            pnn50 = [w.get('pnn50', 0) for w in request.hrv_windows]

            axes2[0].plot(minutes, ln_rmssd, 'g-o', markersize=2)
            axes2[0].set_ylabel('ln(RMSSD70)')
            axes2[0].set_title('HRV Evolution')
            axes2[0].grid(True, alpha=0.3)

            axes2[1].plot(minutes, sdnn, 'm-o', markersize=2)
            axes2[1].set_ylabel('SDNN')
            axes2[1].grid(True, alpha=0.3)

            axes2[2].plot(minutes, pnn50, 'c-o', markersize=2)
            axes2[2].set_xlabel('Window Start (min)')
            axes2[2].set_ylabel('pNN50 (%)')
            axes2[2].grid(True, alpha=0.3)

            plt.tight_layout()
            pdf.savefig(fig2)
            plt.close(fig2)

        # Page 3: Summary table
        if request.summary:
            fig3, ax3 = plt.subplots(figsize=(11, 8.5))
            ax3.axis('off')
            ax3.set_title('Summary Metrics', fontsize=14, fontweight='bold', pad=20)

            table_data = [[k, str(v)] for k, v in request.summary.items()]
            table = ax3.table(cellText=table_data, colLabels=['Metric', 'Value'],
                              loc='center', cellLoc='left')
            table.auto_set_font_size(False)
            table.set_fontsize(10)
            table.scale(1, 1.5)
            pdf.savefig(fig3)
            plt.close(fig3)

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
