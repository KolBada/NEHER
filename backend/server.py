from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Depends
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
from datetime import datetime, timezone
import numpy as np

import analysis
import storage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Dependency to get database
async def get_db():
    return db

app = FastAPI()
api_router = APIRouter(prefix="/api")

# In-memory session store (for active analysis sessions only)
sessions = {}

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# --- Chunked Upload Models ---
class ChunkInitRequest(BaseModel):
    filename: str
    total_size: int
    total_chunks: int

class ChunkCompleteRequest(BaseModel):
    upload_id: str


# --- Pydantic Models ---
class DetectBeatsRequest(BaseModel):
    session_id: str
    file_id: str
    threshold: Optional[float] = None
    min_distance: Optional[float] = None
    prominence: Optional[float] = None
    invert: bool = False
    bidirectional: bool = False  # Detect peaks both above AND below threshold


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
    search_range_sec: float = 3.0  # Default search window ±3 seconds


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
    return {"message": "NEHER API"}


# --- Chunked Upload Endpoints (for large files) ---
# Store chunks directly in MongoDB GridFS-style for persistence across restarts

@api_router.post("/upload/init")
async def init_chunked_upload(request: ChunkInitRequest, db=Depends(get_db)):
    """Initialize a chunked upload session - stored in MongoDB for persistence"""
    upload_id = str(uuid.uuid4())
    
    # Store upload session in MongoDB
    await db.upload_sessions.insert_one({
        '_id': upload_id,
        'filename': request.filename,
        'total_size': request.total_size,
        'total_chunks': request.total_chunks,
        'received_chunks': [],
        'created_at': datetime.now(timezone.utc)
    })
    
    logging.info(f"Initialized chunked upload {upload_id} for {request.filename} ({request.total_size} bytes, {request.total_chunks} chunks)")
    
    return {'upload_id': upload_id}


@api_router.post("/upload/chunk/{upload_id}/{chunk_index}")
async def upload_chunk(upload_id: str, chunk_index: int, file: UploadFile = File(...), db=Depends(get_db)):
    """Upload a single chunk - stored in MongoDB for persistence"""
    # Check if session exists
    session = await db.upload_sessions.find_one({'_id': upload_id})
    if not session:
        raise HTTPException(404, "Upload session not found or expired. Please retry the upload.")
    
    if chunk_index < 0 or chunk_index >= session['total_chunks']:
        raise HTTPException(400, f"Invalid chunk index: {chunk_index}")
    
    # Read chunk data
    chunk_data = await file.read()
    
    # Store chunk in MongoDB
    await db.upload_chunks.update_one(
        {'upload_id': upload_id, 'chunk_index': chunk_index},
        {'$set': {
            'upload_id': upload_id,
            'chunk_index': chunk_index,
            'data': chunk_data,
            'size': len(chunk_data)
        }},
        upsert=True
    )
    
    # Update received chunks list
    await db.upload_sessions.update_one(
        {'_id': upload_id},
        {'$addToSet': {'received_chunks': chunk_index}}
    )
    
    # Get updated session
    session = await db.upload_sessions.find_one({'_id': upload_id})
    received_count = len(session.get('received_chunks', []))
    
    logging.info(f"Received chunk {chunk_index + 1}/{session['total_chunks']} for upload {upload_id}")
    
    return {
        'chunk_index': chunk_index,
        'received': received_count,
        'total': session['total_chunks']
    }


@api_router.post("/upload/complete")
async def complete_chunked_upload(request: ChunkCompleteRequest, db=Depends(get_db)):
    """Complete the chunked upload and process the file - reads chunks from MongoDB"""
    import pyabf
    import gc
    
    upload_id = request.upload_id
    
    # Get session from MongoDB
    session = await db.upload_sessions.find_one({'_id': upload_id})
    if not session:
        raise HTTPException(404, "Upload session not found or expired. Please retry the upload.")
    
    # Verify all chunks received
    received_chunks = set(session.get('received_chunks', []))
    total_chunks = session['total_chunks']
    
    if len(received_chunks) != total_chunks:
        missing = set(range(total_chunks)) - received_chunks
        raise HTTPException(400, f"Missing chunks: {sorted(list(missing)[:10])}...")
    
    filename = session['filename']
    temp_path = None
    
    try:
        # Reassemble file from MongoDB chunks
        temp_path = os.path.join(tempfile.gettempdir(), f"assembled_{upload_id}.abf")
        
        with open(temp_path, 'wb') as f:
            for chunk_index in range(total_chunks):
                chunk_doc = await db.upload_chunks.find_one({
                    'upload_id': upload_id,
                    'chunk_index': chunk_index
                })
                if chunk_doc and 'data' in chunk_doc:
                    f.write(chunk_doc['data'])
                else:
                    raise HTTPException(500, f"Chunk {chunk_index} data not found")
        
        logging.info(f"Reassembled file {filename} from {total_chunks} chunks")
        
        # Process the assembled file
        session_id = str(uuid.uuid4())
        sessions[session_id] = {}
        file_id = str(uuid.uuid4())
        
        try:
            abf = pyabf.ABF(temp_path)
        except Exception as parse_err:
            logging.error(f"Failed to parse ABF file '{filename}': {parse_err}")
            raise HTTPException(400, f"Failed to parse ABF file '{filename}': {str(parse_err)}")
        
        abf.setSweep(0, channel=0)
        trace = abf.sweepY.copy().astype(np.float64)
        times = abf.sweepX.copy().astype(np.float64)
        sample_rate = abf.dataRate
        
        # Handle multi-sweep
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
            del all_traces, all_times
            gc.collect()
        
        sessions[session_id][file_id] = {
            'filename': filename,
            'trace': trace,
            'times': times,
            'sample_rate': sample_rate,
        }
        
        # Decimate for response
        dec_times, dec_voltages = analysis.decimate_trace(times, trace)
        beat_indices = analysis.detect_beats(trace, sample_rate)
        beat_times_sec = [float(times[i]) for i in beat_indices if i < len(times)]
        beat_voltages = [float(trace[i]) for i in beat_indices if i < len(trace)]
        
        # Use RAW signal stats so threshold slider matches what user sees in the trace
        signal_stats = {
            'min': float(np.min(trace)),
            'max': float(np.max(trace)),
            'mean': float(np.mean(trace)),
            'std': float(np.std(trace))
        }
        
        result = {
            'session_id': session_id,
            'files': [{
                'file_id': file_id,
                'filename': filename,
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
            }]
        }
        
        logging.info(f"Successfully processed chunked upload '{filename}': {len(trace)} samples, {len(beat_indices)} beats")
        
        return result
        
    finally:
        # Cleanup: delete temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass
        
        # Cleanup: delete chunks and session from MongoDB
        try:
            await db.upload_chunks.delete_many({'upload_id': upload_id})
            await db.upload_sessions.delete_one({'_id': upload_id})
        except:
            pass
        
        gc.collect()


@api_router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    import pyabf
    import gc

    session_id = str(uuid.uuid4())
    sessions[session_id] = {}
    result_files = []

    for uploaded in files:
        fname = uploaded.filename or ''
        if not fname.lower().endswith('.abf'):
            raise HTTPException(400, f"Only .abf files are supported. Got: '{fname}'. Please rename your file with .abf extension if needed.")

        file_id = str(uuid.uuid4())
        
        # Read file in chunks to handle large files better
        try:
            content = await uploaded.read()
        except Exception as read_err:
            logging.error(f"Failed to read uploaded file '{fname}': {read_err}")
            raise HTTPException(400, f"Failed to read file '{fname}': {str(read_err)}")

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix='.abf', delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            
            # Free memory from content after writing to temp file
            del content
            gc.collect()

            try:
                abf = pyabf.ABF(tmp_path)
            except Exception as parse_err:
                logging.error(f"Failed to parse ABF file '{fname}': {parse_err}")
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
                # Free memory
                del all_traces, all_times
                gc.collect()

            sessions[session_id][file_id] = {
                'filename': uploaded.filename,
                'trace': trace,
                'times': times,
                'sample_rate': sample_rate,
            }

            # Decimate trace for response (reduce data size significantly)
            dec_times, dec_voltages = analysis.decimate_trace(times, trace)
            beat_indices = analysis.detect_beats(trace, sample_rate)
            beat_times_sec = [float(times[i]) for i in beat_indices if i < len(times)]
            beat_voltages = [float(trace[i]) for i in beat_indices if i < len(trace)]

            # Use RAW signal stats so threshold slider matches what user sees in the trace
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
            
            logging.info(f"Successfully processed file '{fname}': {len(trace)} samples, {len(beat_indices)} beats")
            
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"Unexpected error processing '{fname}': {e}")
            raise HTTPException(500, f"Error processing file '{fname}': {str(e)}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass

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
        invert=request.invert,
        bidirectional=request.bidirectional
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

    # Use guided detection if auto-detect is on and we have BF data
    if request.auto_detect and request.beat_times_min and request.bf_filtered:
        pulses = analysis.generate_pulses_guided(
            start_sec, request.pulse_duration_sec,
            interval_pattern=interval_arg if interval_arg else 'decreasing',
            n_pulses=request.n_pulses,
            beat_times_min_list=request.beat_times_min,
            bf_filtered_list=request.bf_filtered,
            search_window_sec=request.search_range_sec  # Use the request's search range
        )
    else:
        pulses = analysis.generate_pulses(
            start_sec, request.pulse_duration_sec,
            interval_pattern=interval_arg if interval_arg else 'decreasing', 
            n_pulses=request.n_pulses
        )
    return {'pulses': pulses, 'detected_start_sec': start_sec}


class LightAutoDetectAllRequest(BaseModel):
    beat_times_min: List[float]
    bf_filtered: List[float]
    expected_n_pulses: int = 5
    pulse_duration_sec: float = 20.0
    first_pulse_start_sec: Optional[float] = None  # Start time of first pulse (for guided detection)
    pulse_interval_sec: Optional[float] = None      # Interval between pulses (for guided detection)
    search_window_sec: float = 3.0                  # Search window around expected times


@api_router.post("/light-detect-all")
async def light_detect_all_endpoint(request: LightAutoDetectAllRequest):
    """
    Fully automatic detection of all light stimulation pulses.
    Uses BF pattern analysis to find characteristic stim responses.
    
    If first_pulse_start_sec and pulse_interval_sec are provided, uses guided
    detection: searches within ±search_window_sec around each expected pulse time.
    """
    pulses = analysis.auto_detect_all_pulses(
        request.beat_times_min, 
        request.bf_filtered,
        expected_n_pulses=request.expected_n_pulses,
        pulse_duration_sec=request.pulse_duration_sec,
        first_pulse_start_sec=request.first_pulse_start_sec,
        pulse_interval_sec=request.pulse_interval_sec,
        search_window_sec=request.search_window_sec
    )
    
    if pulses:
        return {'success': True, 'pulses': pulses, 'n_detected': len(pulses)}
    else:
        return {'success': False, 'pulses': None, 'message': 'Could not auto-detect pulses. Please set manually.'}


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
    """Update a folder's name, color, or section."""
    folder = await storage.update_folder(db, folder_id, request.name, request.color, request.section_id)
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


# ==============================================================================
# Section Endpoints
# ==============================================================================

@api_router.get("/sections")
async def get_sections_endpoint():
    """Get all sections."""
    sections = await storage.get_sections(db)
    return {"sections": sections}


@api_router.post("/sections")
async def create_section_endpoint(request: storage.SectionCreate):
    """Create a new section."""
    section = await storage.create_section(db, request.name)
    return section


@api_router.put("/sections/{section_id}")
async def update_section_endpoint(section_id: str, request: storage.SectionUpdate):
    """Update a section."""
    section = await storage.update_section(db, section_id, request.name, request.order, request.expanded)
    if not section:
        raise HTTPException(404, "Section not found")
    return section


@api_router.delete("/sections/{section_id}")
async def delete_section_endpoint(section_id: str):
    """Delete a section."""
    success = await storage.delete_section(db, section_id)
    if not success:
        raise HTTPException(404, "Section not found")
    return {"success": True}


@api_router.post("/sections/reorder")
async def reorder_sections_endpoint(section_ids: List[str]):
    """Reorder sections."""
    success = await storage.reorder_sections(db, section_ids)
    if not success:
        raise HTTPException(500, "Failed to reorder sections")
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
    print(f"[DEBUG] Updating recording with ID: {recording_id}")
    print(f"[DEBUG] Request name: {request.name}")
    print(f"[DEBUG] Has analysis_state: {request.analysis_state is not None}")
    recording = await storage.update_recording(db, recording_id, request.name, request.analysis_state)
    if not recording:
        print(f"[DEBUG] Recording not found or update failed for ID: {recording_id}")
        raise HTTPException(404, "Recording not found")
    print(f"[DEBUG] Recording updated successfully: {recording.get('name')}")
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
                    # Compute nn_70 from beat frequency
                    nn_values = analysis.bf_to_nn(bf_filtered)
                    nn_70 = analysis.normalize_nn_70_windowing(beat_times_min, nn_values)
                    hrv_windows = analysis.rolling_3min_hrv(beat_times_min, nn_70, bf_filtered)
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
# FOLDER COMPARISON API
# ==============================================================================

class FolderComparisonExportRequest(BaseModel):
    folder_id: str
    folder_name: str
    comparison_data: dict


def extract_comparison_metrics(recording: dict) -> dict:
    """Extract comparison metrics from a recording's analysis_state.
    
    Note: Frontend saves with camelCase keys, so we need to check both cases.
    """
    state = recording.get('analysis_state', {})
    
    # Basic info
    result = {
        'id': recording.get('id', ''),
        'name': recording.get('name', ''),
        'filename': recording.get('filename', ''),
    }
    
    # Recording metadata - check both camelCase and snake_case
    result['recording_date'] = state.get('recordingDate') or state.get('recording_date', '')
    result['recording_description'] = state.get('recordingDescription') or state.get('recording_description', '')
    result['fusion_date'] = state.get('fusionDate') or state.get('fusion_date', '')
    
    # Calculate fusion age (days from fusion to recording)
    result['fusion_age'] = None
    fusion_date = state.get('fusionDate') or state.get('fusion_date', '')
    rec_date = state.get('recordingDate') or state.get('recording_date', '')
    if fusion_date and rec_date:
        try:
            from datetime import datetime
            fd = datetime.strptime(fusion_date, '%Y-%m-%d')
            rd = datetime.strptime(rec_date, '%Y-%m-%d')
            result['fusion_age'] = (rd - fd).days
        except (ValueError, TypeError):
            pass
    
    # Organoid/Cell info - frontend uses camelCase 'organoidInfo'
    organoid_info = state.get('organoidInfo') or state.get('organoid_info', [])
    
    # Initialize organoid-related fields
    result['hspo_info'] = None
    result['hco_info'] = None
    result['other_info'] = None
    result['hspo_age'] = None
    result['hco_age'] = None
    
    if organoid_info:
        for sample in organoid_info:
            cell_type = sample.get('cell_type', '')
            line_name = sample.get('line_name', '')
            passage = sample.get('passage_number', '')
            
            # Calculate age from birth_date if available
            age = sample.get('age_at_recording')
            if age is None:
                birth_date = sample.get('birth_date') or sample.get('diff_date', '')
                rec_date = state.get('recordingDate') or state.get('recording_date', '')
                if birth_date and rec_date:
                    try:
                        from datetime import datetime
                        bd = datetime.strptime(birth_date, '%Y-%m-%d')
                        rd = datetime.strptime(rec_date, '%Y-%m-%d')
                        age = (rd - bd).days
                    except (ValueError, TypeError):
                        pass
            
            # Check for transduction/transfection
            transfection = sample.get('transfection', {})
            has_transfection = bool(transfection and transfection.get('technique'))
            
            sample_info = {
                'line_name': line_name,
                'passage': passage,
                'age': age,
                'has_transduction': has_transfection,
                'transfection_details': transfection,
            }
            
            if cell_type == 'hSpO':
                result['hspo_info'] = sample_info
                result['hspo_age'] = age
            elif cell_type == 'hCO':
                result['hco_info'] = sample_info
                result['hco_age'] = age
            elif cell_type:
                other_type = sample.get('other_cell_type', cell_type)
                sample_info['cell_type'] = other_type
                result['other_info'] = sample_info
    
    # Drug info - frontend uses camelCase
    selected_drugs = state.get('selectedDrugs') or state.get('selected_drugs', [])
    drug_settings = state.get('drugSettings') or state.get('drug_settings', {})
    other_drugs_list = state.get('otherDrugs') or state.get('other_drugs', [])
    drug_readout_settings = state.get('drugReadoutSettings') or state.get('drug_readout_settings', {})
    
    # DRUG_CONFIG equivalent for BF readout times
    DRUG_BF_READOUTS = {
        'tetrodotoxin': 12,
        'isoproterenol': None,  # manual peak
        'acetylcholine': 3,
        'propranolol': 12,
        'nepicastat': 42,
        'ruxolitinib': 15,
    }
    
    # Build drug info list
    result['drug_info'] = []
    result['has_drug'] = bool(selected_drugs) or bool(other_drugs_list)
    
    if selected_drugs:
        for drug in selected_drugs:
            drug_name = drug
            settings = drug_settings.get(drug, {})
            concentration = settings.get('concentration', '')
            
            # Get BF readout time (perfusion time for BF)
            bf_readout = DRUG_BF_READOUTS.get(drug.lower(), None)
            # Check if there's a custom override in drugReadoutSettings
            custom_bf = drug_readout_settings.get('bfReadoutMinute')
            if custom_bf:
                bf_readout = custom_bf
            
            result['drug_info'].append({
                'name': drug_name,
                'concentration': concentration,
                'bf_readout_time': bf_readout,
            })
    
    # Add other drugs (custom drugs added by user)
    if other_drugs_list and isinstance(other_drugs_list, list):
        for drug in other_drugs_list:
            if isinstance(drug, dict) and drug.get('name'):
                # For custom drugs, use their perfusionTime as bf_readout_time
                perf_time = drug.get('perfusionTime', drug.get('perfusion_time', ''))
                result['drug_info'].append({
                    'name': drug.get('name', ''),
                    'concentration': drug.get('concentration', ''),
                    'bf_readout_time': perf_time if perf_time else None,
                })
    
    if result['drug_info']:
        # For backwards compat
        result['drug_names'] = ', '.join([d['name'] for d in result['drug_info']])
        result['drug_concentrations'] = ', '.join([str(d['concentration']) for d in result['drug_info'] if d['concentration']])
        result['condition'] = f"Drug: {result['drug_names']}"
    else:
        result['drug_names'] = ''
        result['drug_concentrations'] = ''
        result['condition'] = 'Control'
    
    # Light stim info - use ORIGINAL search parameters (not adjusted pulses)
    light_enabled = state.get('lightEnabled', False)
    light_params = state.get('lightParams') or state.get('light_params', {})
    light_pulses = state.get('lightPulses') or state.get('light_pulses', [])
    
    result['has_light_stim'] = light_enabled and bool(light_pulses)
    
    # Use original search parameters from lightParams
    pulse_duration = light_params.get('pulseDuration', light_params.get('pulse_duration_sec', 20)) if light_params else 20
    result['stim_duration'] = pulse_duration
    
    # Get ISI structure from original interval setting, not from calculated pulse timings
    interval_setting = light_params.get('interval', 'decreasing') if light_params else 'decreasing'
    if interval_setting == 'decreasing':
        result['isi_structure'] = '60s-30s-20s-10s'
    elif interval_setting == 'constant':
        result['isi_structure'] = 'constant'
    else:
        # Custom or unknown - fall back to calculated ISI from pulses
        if light_pulses and len(light_pulses) > 1:
            intervals = []
            for i in range(1, min(len(light_pulses), 5)):
                start_curr = light_pulses[i].get('start_min', 0)
                start_prev = light_pulses[i-1].get('start_min', 0)
                interval_sec = (start_curr - start_prev) * 60
                intervals.append(int(round(interval_sec)))
            result['isi_structure'] = '-'.join([f"{i}s" for i in intervals])
        else:
            result['isi_structure'] = ''
    
    # Spontaneous Activity - Baseline metrics from hrvResults
    hrv_results = state.get('hrvResults') or state.get('hrv_results', {})
    baseline = hrv_results.get('baseline', {})
    
    # Check if baseline is enabled (default True for backward compatibility)
    baseline_enabled = state.get('baselineEnabled', True)
    
    if baseline_enabled:
        result['baseline_bf'] = baseline.get('baseline_bf')
        result['baseline_ln_rmssd70'] = baseline.get('baseline_ln_rmssd70')
        baseline_sdnn = baseline.get('baseline_sdnn')
        result['baseline_ln_sdnn70'] = np.log(baseline_sdnn) if baseline_sdnn and baseline_sdnn > 0 else None
        result['baseline_pnn50'] = baseline.get('baseline_pnn50')
    else:
        result['baseline_bf'] = None
        result['baseline_ln_rmssd70'] = None
        result['baseline_ln_sdnn70'] = None
        result['baseline_pnn50'] = None
    
    result['baseline_enabled'] = baseline_enabled
    
    # Spontaneous Activity - Drug metrics
    drug_readout = state.get('drugReadoutSettings') or state.get('drug_readout', {})
    hrv_windows = hrv_results.get('windows', [])
    per_minute_data = state.get('perMinuteData') or state.get('per_minute_data', [])
    
    result['drug_bf'] = None
    result['drug_ln_rmssd70'] = None
    result['drug_ln_sdnn70'] = None
    result['drug_pnn50'] = None
    
    if drug_readout and (drug_readout.get('enableHrvReadout') or drug_readout.get('enableBfReadout')):
        # Frontend uses 'bfReadoutMinute' and 'hrvReadoutMinute' (as strings)
        drug_bf_minute_str = drug_readout.get('bfReadoutMinute') or drug_readout.get('bfMinute') or drug_readout.get('bf_minute')
        drug_hrv_minute_str = drug_readout.get('hrvReadoutMinute') or drug_readout.get('hrvMinute') or drug_readout.get('hrv_minute')
        
        # Convert to int
        drug_bf_minute = None
        drug_hrv_minute = None
        try:
            if drug_bf_minute_str is not None:
                drug_bf_minute = int(drug_bf_minute_str)
        except (ValueError, TypeError):
            pass
        try:
            if drug_hrv_minute_str is not None:
                drug_hrv_minute = int(drug_hrv_minute_str)
        except (ValueError, TypeError):
            pass
        
        # Get drug BF from per_minute_data
        if drug_bf_minute is not None and per_minute_data:
            for pm in per_minute_data:
                minute_val = pm.get('minute', '0')
                try:
                    minute_num = int(str(minute_val).split('-')[0])
                    if minute_num == drug_bf_minute:
                        result['drug_bf'] = pm.get('avg_bf') or pm.get('mean_bf')
                        break
                except (ValueError, TypeError, AttributeError):
                    pass
        
        # Get drug HRV from hrv_windows
        if drug_hrv_minute is not None and hrv_windows:
            for w in hrv_windows:
                if w.get('minute') == drug_hrv_minute:
                    result['drug_ln_rmssd70'] = w.get('ln_rmssd70')
                    sdnn = w.get('sdnn')
                    result['drug_ln_sdnn70'] = np.log(sdnn) if sdnn and sdnn > 0 else None
                    result['drug_pnn50'] = w.get('pnn50')
                    break
    
    # Light HRA metrics - frontend uses camelCase
    # lightResponse is a dict: {per_stim: [...], mean_metrics: {...}, baseline_bf: number}
    light_response = state.get('lightResponse') or state.get('light_response')
    
    # Initialize light metrics
    for key in ['light_baseline_bf', 'light_avg_bf', 'light_peak_bf', 'light_peak_norm', 
               'light_ttp_first', 'light_ttp_avg', 'light_recovery_bf', 'light_recovery_pct',
               'light_amplitude', 'light_roc']:
        result[key] = None
    
    if light_response and isinstance(light_response, dict):
        # Use mean_metrics if available (pre-computed averages)
        mean_metrics = light_response.get('mean_metrics', {})
        per_stim = light_response.get('per_stim', [])
        
        if mean_metrics:
            # Use baseline from lightResponse or fallback to hrvResults baseline
            result['light_baseline_bf'] = light_response.get('baseline_bf') or baseline.get('baseline_bf')
            
            # Direct extraction from mean_metrics
            result['light_avg_bf'] = mean_metrics.get('avg_bf')
            result['light_peak_bf'] = mean_metrics.get('peak_bf')
            result['light_peak_norm'] = mean_metrics.get('peak_norm_pct')
            result['light_ttp_avg'] = mean_metrics.get('time_to_peak_sec')
            result['light_recovery_bf'] = mean_metrics.get('bf_end')
            result['light_recovery_pct'] = mean_metrics.get('bf_end_pct')
            result['light_amplitude'] = mean_metrics.get('amplitude')
            result['light_roc'] = mean_metrics.get('rate_of_change')
            
            # Time to Peak for first stim (from per_stim if available)
            if per_stim and len(per_stim) > 0:
                result['light_ttp_first'] = per_stim[0].get('time_to_peak_sec')
        elif per_stim:
            # Fallback: compute from per_stim if mean_metrics not present
            valid_resp = [r for r in per_stim if r is not None and isinstance(r, dict)]
            if valid_resp:
                result['light_baseline_bf'] = light_response.get('baseline_bf') or baseline.get('baseline_bf')
                
                avg_bf_vals = [r.get('avg_bf') for r in valid_resp if r.get('avg_bf') is not None]
                result['light_avg_bf'] = float(np.mean(avg_bf_vals)) if avg_bf_vals else None
                
                peak_bf_vals = [r.get('peak_bf') for r in valid_resp if r.get('peak_bf') is not None]
                result['light_peak_bf'] = float(np.mean(peak_bf_vals)) if peak_bf_vals else None
                
                peak_norm_vals = [r.get('peak_norm_pct') for r in valid_resp if r.get('peak_norm_pct') is not None]
                result['light_peak_norm'] = float(np.mean(peak_norm_vals)) if peak_norm_vals else None
                
                result['light_ttp_first'] = valid_resp[0].get('time_to_peak_sec') if valid_resp else None
                ttp_vals = [r.get('time_to_peak_sec') for r in valid_resp if r.get('time_to_peak_sec') is not None]
                result['light_ttp_avg'] = float(np.mean(ttp_vals)) if ttp_vals else None
                
                recovery_bf_vals = [r.get('bf_end') for r in valid_resp if r.get('bf_end') is not None]
                result['light_recovery_bf'] = float(np.mean(recovery_bf_vals)) if recovery_bf_vals else None
                
                recovery_pct_vals = [r.get('bf_end_pct') for r in valid_resp if r.get('bf_end_pct') is not None]
                result['light_recovery_pct'] = float(np.mean(recovery_pct_vals)) if recovery_pct_vals else None
                
                amplitude_vals = [r.get('amplitude') for r in valid_resp if r.get('amplitude') is not None]
                result['light_amplitude'] = float(np.mean(amplitude_vals)) if amplitude_vals else None
                
                roc_vals = [r.get('rate_of_change') for r in valid_resp if r.get('rate_of_change') is not None]
                result['light_roc'] = float(np.mean(roc_vals)) if roc_vals else None
    
    # Corrected Light HRV (detrended) - frontend uses camelCase
    light_hrv_detrended = state.get('lightHrvDetrended') or state.get('light_metrics_detrended', {})
    
    result['light_hrv_ln_rmssd70'] = None
    result['light_hrv_ln_sdnn70'] = None
    result['light_hrv_pnn50'] = None
    
    if light_hrv_detrended and light_hrv_detrended.get('final'):
        final = light_hrv_detrended['final']
        result['light_hrv_ln_rmssd70'] = final.get('ln_rmssd70_detrended')
        result['light_hrv_ln_sdnn70'] = final.get('ln_sdnn70_detrended')
        result['light_hrv_pnn50'] = final.get('pnn50_detrended')
    
    return result


def compute_folder_averages(recordings_data: list, metrics: list) -> dict:
    """Compute folder averages for specified metrics, ignoring None values."""
    averages = {}
    counts = {}
    
    for metric in metrics:
        values = [r.get(metric) for r in recordings_data if r.get(metric) is not None]
        if values:
            averages[metric] = float(np.mean(values))
            counts[metric] = len(values)
        else:
            averages[metric] = None
            counts[metric] = 0
    
    return {'averages': averages, 'counts': counts}


@api_router.get("/folders/{folder_id}/comparison")
async def get_folder_comparison(folder_id: str):
    """Get comparison data for all recordings in a folder."""
    # Get folder info
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Get all recordings with full analysis_state (limit to 500 for performance)
    recordings_data = []
    async for rec in db.recordings.find({"folder_id": folder_id}).limit(500):
        recording = {
            "id": str(rec["_id"]),
            "name": rec["name"],
            "filename": rec["filename"],
            "analysis_state": rec.get("analysis_state", {}),
        }
        metrics = extract_comparison_metrics(recording)
        recordings_data.append(metrics)
    
    # Compute age ranges
    hspo_ages = [r['hspo_age'] for r in recordings_data if r.get('hspo_age') is not None]
    hco_ages = [r['hco_age'] for r in recordings_data if r.get('hco_age') is not None]
    fusion_ages = [r['fusion_age'] for r in recordings_data if r.get('fusion_age') is not None]
    
    # Compute averages for spontaneous activity
    spontaneous_metrics = [
        'baseline_bf', 'baseline_ln_rmssd70', 'baseline_ln_sdnn70', 'baseline_pnn50',
        'drug_bf', 'drug_ln_rmssd70', 'drug_ln_sdnn70', 'drug_pnn50'
    ]
    spontaneous_averages = compute_folder_averages(recordings_data, spontaneous_metrics)
    
    # Compute averages for Light HRA
    light_hra_metrics = [
        'light_baseline_bf', 'light_avg_bf', 'light_peak_bf', 'light_peak_norm',
        'light_ttp_first', 'light_ttp_avg', 'light_recovery_bf', 'light_recovery_pct',
        'light_amplitude', 'light_roc'
    ]
    light_hra_averages = compute_folder_averages(recordings_data, light_hra_metrics)
    
    # Compute averages for Corrected Light HRV
    light_hrv_metrics = ['light_hrv_ln_rmssd70', 'light_hrv_ln_sdnn70', 'light_hrv_pnn50']
    light_hrv_averages = compute_folder_averages(recordings_data, light_hrv_metrics)
    
    return {
        "folder": folder,
        "summary": {
            "recording_count": len(recordings_data),
            "hspo_age_range": {"min": min(hspo_ages) if hspo_ages else None, "max": max(hspo_ages) if hspo_ages else None, "n": len(hspo_ages)},
            "hco_age_range": {"min": min(hco_ages) if hco_ages else None, "max": max(hco_ages) if hco_ages else None, "n": len(hco_ages)},
            "fusion_age_range": {"min": min(fusion_ages) if fusion_ages else None, "max": max(fusion_ages) if fusion_ages else None, "n": len(fusion_ages)},
        },
        "recordings": recordings_data,
        "spontaneous_averages": spontaneous_averages,
        "light_hra_averages": light_hra_averages,
        "light_hrv_averages": light_hrv_averages,
    }


@api_router.post("/folders/{folder_id}/export/xlsx")
async def export_folder_comparison_xlsx(folder_id: str, request: FolderComparisonExportRequest):
    """Export folder comparison data to Excel."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from datetime import datetime
    
    data = request.comparison_data
    recordings = data.get('recordings', [])
    summary = data.get('summary', {})
    
    wb = openpyxl.Workbook()
    
    # Styling
    header_font = Font(bold=True, color="FFFFFF", size=10)
    header_fill_baseline = PatternFill(start_color="F59E0B", end_color="F59E0B", fill_type="solid")  # Amber for baseline
    header_fill_drug = PatternFill(start_color="8B5CF6", end_color="8B5CF6", fill_type="solid")  # Purple for drug
    header_fill_light = PatternFill(start_color="06B6D4", end_color="06B6D4", fill_type="solid")  # Cyan for light
    avg_fill = PatternFill(start_color="E5E7EB", end_color="E5E7EB", fill_type="solid")
    data_font = Font(size=9)
    thin_border = Border(
        left=Side(style='thin', color='D1D5DB'),
        right=Side(style='thin', color='D1D5DB'),
        top=Side(style='thin', color='D1D5DB'),
        bottom=Side(style='thin', color='D1D5DB')
    )
    
    def auto_width(ws):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except (TypeError, AttributeError):
                    pass
            ws.column_dimensions[col_letter].width = min(max_len + 2, 30)
    
    def format_value(val, decimals=2):
        if val is None:
            return '—'
        if isinstance(val, (int, float)):
            if decimals == 0:
                return f"{val:.0f}"
            elif decimals == 1:
                return f"{val:.1f}"
            elif decimals == 3:
                return f"{val:.3f}"
            elif decimals == 4:
                return f"{val:.4f}"
            return f"{val:.{decimals}f}"
        return str(val) if val else '—'
    
    # Sheet 1: Folder Summary
    ws_summary = wb.active
    ws_summary.title = "Folder Summary"
    
    # Title styling
    title_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    title_font = Font(bold=True, size=16, color="FFFFFF")
    section_font = Font(bold=True, size=11, color="374151")
    label_font = Font(bold=True, size=10)
    value_font = Font(size=10)
    
    # Title row
    ws_summary.merge_cells('A1:D1')
    ws_summary['A1'] = f'{request.folder_name} - Folder Comparison'
    ws_summary['A1'].font = title_font
    ws_summary['A1'].fill = title_fill
    ws_summary['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws_summary.row_dimensions[1].height = 35
    
    # Section: Overview
    ws_summary['A3'] = 'OVERVIEW'
    ws_summary['A3'].font = section_font
    ws_summary.merge_cells('A3:D3')
    
    overview_data = [
        ('Recordings', summary.get('recording_count', 0), '', ''),
        ('Generated', datetime.now().strftime('%B %d, %Y at %H:%M'), '', ''),
    ]
    
    for row_idx, (label, value, _, _) in enumerate(overview_data, start=4):
        ws_summary[f'A{row_idx}'] = label
        ws_summary[f'B{row_idx}'] = value
        ws_summary[f'A{row_idx}'].font = label_font
        ws_summary[f'B{row_idx}'].font = value_font
        ws_summary[f'A{row_idx}'].border = thin_border
        ws_summary[f'B{row_idx}'].border = thin_border
    
    # Section: Age Ranges
    ws_summary['A7'] = 'AGE RANGES'
    ws_summary['A7'].font = section_font
    ws_summary.merge_cells('A7:D7')
    
    # Helper for age range formatting
    def format_age_range(age_dict):
        if not age_dict or age_dict.get('min') is None:
            return '—'
        return f"{age_dict.get('min')} - {age_dict.get('max')} days"
    
    age_headers = ['Type', 'Range', 'n']
    for col_idx, header in enumerate(age_headers, start=1):
        cell = ws_summary.cell(row=8, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center')
    
    age_data = [
        ('hSpOs', format_age_range(summary.get('hspo_age_range')), summary.get('hspo_age_range', {}).get('n', 0)),
        ('hCOs', format_age_range(summary.get('hco_age_range')), summary.get('hco_age_range', {}).get('n', 0)),
        ('Fusion', format_age_range(summary.get('fusion_age_range')), summary.get('fusion_age_range', {}).get('n', 0)),
    ]
    
    for row_idx, (type_name, range_val, n_val) in enumerate(age_data, start=9):
        ws_summary.cell(row=row_idx, column=1, value=type_name).font = label_font
        ws_summary.cell(row=row_idx, column=2, value=range_val).font = value_font
        ws_summary.cell(row=row_idx, column=3, value=n_val).font = value_font
        for col in range(1, 4):
            ws_summary.cell(row=row_idx, column=col).border = thin_border
            ws_summary.cell(row=row_idx, column=col).alignment = Alignment(horizontal='center' if col > 1 else 'left')
    
    # Section: Folder Averages (Spontaneous)
    spont_averages = data.get('spontaneous_averages', {}).get('averages', {})
    hra_averages = data.get('light_hra_averages', {}).get('averages', {})
    hrv_averages = data.get('light_hrv_averages', {}).get('averages', {})
    
    ws_summary['A13'] = 'FOLDER AVERAGES - SPONTANEOUS ACTIVITY'
    ws_summary['A13'].font = section_font
    ws_summary.merge_cells('A13:D13')
    
    avg_headers = ['Metric', 'Baseline', 'Drug']
    for col_idx, header in enumerate(avg_headers, start=1):
        cell = ws_summary.cell(row=14, column=col_idx, value=header)
        cell.font = header_font
        cell.border = thin_border
        if col_idx == 2:
            cell.fill = header_fill_baseline
        elif col_idx == 3:
            cell.fill = header_fill_drug
        else:
            cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    
    spont_avg_data = [
        ('Mean BF (bpm)', format_value(spont_averages.get('baseline_bf'), 1), format_value(spont_averages.get('drug_bf'), 1)),
        ('ln(RMSSD70)', format_value(spont_averages.get('baseline_ln_rmssd70'), 3), format_value(spont_averages.get('drug_ln_rmssd70'), 3)),
        ('ln(SDNN70)', format_value(spont_averages.get('baseline_ln_sdnn70'), 3), format_value(spont_averages.get('drug_ln_sdnn70'), 3)),
        ('pNN50 (%)', format_value(spont_averages.get('baseline_pnn50'), 1), format_value(spont_averages.get('drug_pnn50'), 1)),
    ]
    
    for row_idx, (metric, baseline, drug) in enumerate(spont_avg_data, start=15):
        ws_summary.cell(row=row_idx, column=1, value=metric).font = label_font
        ws_summary.cell(row=row_idx, column=2, value=baseline).font = value_font
        ws_summary.cell(row=row_idx, column=3, value=drug).font = value_font
        for col in range(1, 4):
            ws_summary.cell(row=row_idx, column=col).border = thin_border
            ws_summary.cell(row=row_idx, column=col).alignment = Alignment(horizontal='center' if col > 1 else 'left')
    
    # Section: Light Metrics Averages (ALL metrics)
    ws_summary['A20'] = 'FOLDER AVERAGES - LIGHT STIMULUS'
    ws_summary['A20'].font = section_font
    ws_summary.merge_cells('A20:D20')
    
    # HRA Metrics subsection
    ws_summary['A21'] = 'Heart Rate Adaptation (HRA)'
    ws_summary['A21'].font = Font(bold=True, size=9, italic=True)
    ws_summary.merge_cells('A21:D21')
    
    hra_headers_sum = ['Metric', 'Value']
    for col_idx, header in enumerate(hra_headers_sum, start=1):
        cell = ws_summary.cell(row=22, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill_light
        cell.border = thin_border
    
    hra_avg_data = [
        ('Baseline BF (bpm)', format_value(hra_averages.get('light_baseline_bf'), 1)),
        ('Avg BF (bpm)', format_value(hra_averages.get('light_avg_bf'), 1)),
        ('Peak BF (bpm)', format_value(hra_averages.get('light_peak_bf'), 1)),
        ('Normalized Peak (%)', format_value(hra_averages.get('light_peak_norm'), 1)),
        ('Time to Peak 1st (s)', format_value(hra_averages.get('light_ttp_first'), 1)),
        ('Time to Peak Avg (s)', format_value(hra_averages.get('light_ttp_avg'), 1)),
        ('Recovery BF (bpm)', format_value(hra_averages.get('light_recovery_bf'), 1)),
        ('Recovery (%)', format_value(hra_averages.get('light_recovery_pct'), 1)),
        ('Amplitude (bpm)', format_value(hra_averages.get('light_amplitude'), 1)),
        ('Rate of Change', format_value(hra_averages.get('light_roc'), 4)),
    ]
    
    for row_idx, (metric, val) in enumerate(hra_avg_data, start=23):
        ws_summary.cell(row=row_idx, column=1, value=metric).font = label_font
        ws_summary.cell(row=row_idx, column=2, value=val).font = value_font
        for col in range(1, 3):
            ws_summary.cell(row=row_idx, column=col).border = thin_border
    
    # Corrected HRV Metrics subsection
    hrv_start = 23 + len(hra_avg_data) + 1
    ws_summary.cell(row=hrv_start, column=1, value='Corrected HRV').font = Font(bold=True, size=9, italic=True)
    ws_summary.merge_cells(f'A{hrv_start}:D{hrv_start}')
    
    for col_idx, header in enumerate(hra_headers_sum, start=1):
        cell = ws_summary.cell(row=hrv_start + 1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill_light
        cell.border = thin_border
    
    hrv_avg_data = [
        ('ln(RMSSD70) corr.', format_value(hrv_averages.get('light_hrv_ln_rmssd70'), 3)),
        ('ln(SDNN70) corr.', format_value(hrv_averages.get('light_hrv_ln_sdnn70'), 3)),
        ('pNN50 corr. (%)', format_value(hrv_averages.get('light_hrv_pnn50'), 1)),
    ]
    
    for row_idx, (metric, val) in enumerate(hrv_avg_data, start=hrv_start + 2):
        ws_summary.cell(row=row_idx, column=1, value=metric).font = label_font
        ws_summary.cell(row=row_idx, column=2, value=val).font = value_font
        for col in range(1, 3):
            ws_summary.cell(row=row_idx, column=col).border = thin_border
    
    # Column widths
    ws_summary.column_dimensions['A'].width = 30
    ws_summary.column_dimensions['B'].width = 20
    ws_summary.column_dimensions['C'].width = 15
    ws_summary.column_dimensions['D'].width = 15
    
    # Sheet 2: Spontaneous Activity Comparison
    ws_spont = wb.create_sheet("Spontaneous Activity")
    
    # Headers
    spont_headers = [
        ('Recording', None),
        ('Baseline BF (bpm)', 'baseline'),
        ('Baseline ln(RMSSD70)', 'baseline'),
        ('Baseline ln(SDNN70)', 'baseline'),
        ('Baseline pNN50 (%)', 'baseline'),
        ('Drug BF (bpm)', 'drug'),
        ('Drug ln(RMSSD70)', 'drug'),
        ('Drug ln(SDNN70)', 'drug'),
        ('Drug pNN50 (%)', 'drug'),
    ]
    
    for col_idx, (header, header_type) in enumerate(spont_headers, start=1):
        cell = ws_spont.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        if header_type == 'baseline':
            cell.fill = header_fill_baseline
        elif header_type == 'drug':
            cell.fill = header_fill_drug
        else:
            cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    
    # Data rows
    spont_averages = data.get('spontaneous_averages', {}).get('averages', {})
    for row_idx, rec in enumerate(recordings, start=2):
        ws_spont.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
        ws_spont.cell(row=row_idx, column=2, value=format_value(rec.get('baseline_bf'), 1)).font = data_font
        ws_spont.cell(row=row_idx, column=3, value=format_value(rec.get('baseline_ln_rmssd70'), 3)).font = data_font
        ws_spont.cell(row=row_idx, column=4, value=format_value(rec.get('baseline_ln_sdnn70'), 3)).font = data_font
        ws_spont.cell(row=row_idx, column=5, value=format_value(rec.get('baseline_pnn50'), 1)).font = data_font
        ws_spont.cell(row=row_idx, column=6, value=format_value(rec.get('drug_bf'), 1)).font = data_font
        ws_spont.cell(row=row_idx, column=7, value=format_value(rec.get('drug_ln_rmssd70'), 3)).font = data_font
        ws_spont.cell(row=row_idx, column=8, value=format_value(rec.get('drug_ln_sdnn70'), 3)).font = data_font
        ws_spont.cell(row=row_idx, column=9, value=format_value(rec.get('drug_pnn50'), 1)).font = data_font
        
        for col in range(1, 10):
            ws_spont.cell(row=row_idx, column=col).border = thin_border
            # Color code baseline vs drug columns
            if 2 <= col <= 5:
                ws_spont.cell(row=row_idx, column=col).fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
            elif 6 <= col <= 9:
                ws_spont.cell(row=row_idx, column=col).fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
    
    # Average row
    avg_row = len(recordings) + 2
    ws_spont.cell(row=avg_row, column=1, value=f"Folder Average (n={len(recordings)})").font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=2, value=format_value(spont_averages.get('baseline_bf'), 1)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=3, value=format_value(spont_averages.get('baseline_ln_rmssd70'), 3)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=4, value=format_value(spont_averages.get('baseline_ln_sdnn70'), 3)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=5, value=format_value(spont_averages.get('baseline_pnn50'), 1)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=6, value=format_value(spont_averages.get('drug_bf'), 1)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=7, value=format_value(spont_averages.get('drug_ln_rmssd70'), 3)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=8, value=format_value(spont_averages.get('drug_ln_sdnn70'), 3)).font = Font(bold=True, size=9)
    ws_spont.cell(row=avg_row, column=9, value=format_value(spont_averages.get('drug_pnn50'), 1)).font = Font(bold=True, size=9)
    
    for col in range(1, 10):
        ws_spont.cell(row=avg_row, column=col).fill = avg_fill
        ws_spont.cell(row=avg_row, column=col).border = thin_border
    
    # Add Normalized to Baseline section below the main table
    norm_start_row = avg_row + 3
    
    # Calculate cohort baseline averages for normalization
    baseline_bfs = [r.get('baseline_bf') for r in recordings if r.get('baseline_bf') is not None]
    baseline_ln_rmssds = [r.get('baseline_ln_rmssd70') for r in recordings if r.get('baseline_ln_rmssd70') is not None]
    baseline_ln_sdnns = [r.get('baseline_ln_sdnn70') for r in recordings if r.get('baseline_ln_sdnn70') is not None]
    baseline_pnn50s = [r.get('baseline_pnn50') for r in recordings if r.get('baseline_pnn50') is not None]
    
    avg_baseline_bf = sum(baseline_bfs) / len(baseline_bfs) if baseline_bfs else 1
    avg_baseline_ln_rmssd = sum(baseline_ln_rmssds) / len(baseline_ln_rmssds) if baseline_ln_rmssds else 1
    avg_baseline_ln_sdnn = sum(baseline_ln_sdnns) / len(baseline_ln_sdnns) if baseline_ln_sdnns else 1
    avg_baseline_pnn50 = sum(baseline_pnn50s) / len(baseline_pnn50s) if baseline_pnn50s else 1
    
    def norm_val(val, avg):
        if val is None or avg == 0:
            return None
        return 100 * val / avg
    
    # Section title
    ws_spont.merge_cells(f'A{norm_start_row}:I{norm_start_row}')
    ws_spont.cell(row=norm_start_row, column=1, value='Normalized to Baseline — Spontaneous Activity').font = Font(bold=True, size=11, color="FFFFFF")
    ws_spont.cell(row=norm_start_row, column=1).fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    ws_spont.cell(row=norm_start_row, column=1).alignment = Alignment(horizontal='center')
    
    norm_spont_headers = [
        ('Recording', None),
        ('Baseline BF (%)', 'baseline'),
        ('Baseline ln(RMSSD) (%)', 'baseline'),
        ('Baseline ln(SDNN) (%)', 'baseline'),
        ('Baseline pNN50 (%)', 'baseline'),
        ('Drug BF (%)', 'drug'),
        ('Drug ln(RMSSD) (%)', 'drug'),
        ('Drug ln(SDNN) (%)', 'drug'),
        ('Drug pNN50 (%)', 'drug'),
    ]
    
    for col_idx, (header, header_type) in enumerate(norm_spont_headers, start=1):
        cell = ws_spont.cell(row=norm_start_row + 1, column=col_idx, value=header)
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        if header_type == 'baseline':
            cell.fill = header_fill_baseline
        elif header_type == 'drug':
            cell.fill = header_fill_drug
        else:
            cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    
    # Data rows with normalized values
    norm_sums = {'baseline_bf': [], 'baseline_ln_rmssd': [], 'baseline_ln_sdnn': [], 'baseline_pnn50': [],
                 'drug_bf': [], 'drug_ln_rmssd': [], 'drug_ln_sdnn': [], 'drug_pnn50': []}
    
    for row_idx, rec in enumerate(recordings, start=norm_start_row + 2):
        ws_spont.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
        
        n_baseline_bf = norm_val(rec.get('baseline_bf'), avg_baseline_bf)
        n_baseline_ln_rmssd = norm_val(rec.get('baseline_ln_rmssd70'), avg_baseline_ln_rmssd)
        n_baseline_ln_sdnn = norm_val(rec.get('baseline_ln_sdnn70'), avg_baseline_ln_sdnn)
        n_baseline_pnn50 = norm_val(rec.get('baseline_pnn50'), avg_baseline_pnn50)
        n_drug_bf = norm_val(rec.get('drug_bf'), avg_baseline_bf)
        n_drug_ln_rmssd = norm_val(rec.get('drug_ln_rmssd70'), avg_baseline_ln_rmssd)
        n_drug_ln_sdnn = norm_val(rec.get('drug_ln_sdnn70'), avg_baseline_ln_sdnn)
        n_drug_pnn50 = norm_val(rec.get('drug_pnn50'), avg_baseline_pnn50)
        
        ws_spont.cell(row=row_idx, column=2, value=format_value(n_baseline_bf, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=3, value=format_value(n_baseline_ln_rmssd, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=4, value=format_value(n_baseline_ln_sdnn, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=5, value=format_value(n_baseline_pnn50, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=6, value=format_value(n_drug_bf, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=7, value=format_value(n_drug_ln_rmssd, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=8, value=format_value(n_drug_ln_sdnn, 1)).font = data_font
        ws_spont.cell(row=row_idx, column=9, value=format_value(n_drug_pnn50, 1)).font = data_font
        
        # Collect for averages
        for key, val in [('baseline_bf', n_baseline_bf), ('baseline_ln_rmssd', n_baseline_ln_rmssd),
                         ('baseline_ln_sdnn', n_baseline_ln_sdnn), ('baseline_pnn50', n_baseline_pnn50),
                         ('drug_bf', n_drug_bf), ('drug_ln_rmssd', n_drug_ln_rmssd),
                         ('drug_ln_sdnn', n_drug_ln_sdnn), ('drug_pnn50', n_drug_pnn50)]:
            if val is not None:
                norm_sums[key].append(val)
        
        for col in range(1, 10):
            ws_spont.cell(row=row_idx, column=col).border = thin_border
            if 2 <= col <= 5:
                ws_spont.cell(row=row_idx, column=col).fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
            elif 6 <= col <= 9:
                ws_spont.cell(row=row_idx, column=col).fill = PatternFill(start_color="EDE9FE", end_color="EDE9FE", fill_type="solid")
    
    # Folder Average row for normalized section
    norm_avg_row = norm_start_row + 2 + len(recordings)
    ws_spont.cell(row=norm_avg_row, column=1, value=f"Folder Average (n={len(recordings)})").font = Font(bold=True, size=9)
    
    for col_idx, key in enumerate(['baseline_bf', 'baseline_ln_rmssd', 'baseline_ln_sdnn', 'baseline_pnn50',
                                   'drug_bf', 'drug_ln_rmssd', 'drug_ln_sdnn', 'drug_pnn50'], start=2):
        avg_val_norm = sum(norm_sums[key]) / len(norm_sums[key]) if norm_sums[key] else None
        ws_spont.cell(row=norm_avg_row, column=col_idx, value=format_value(avg_val_norm, 1)).font = Font(bold=True, size=9)
    
    for col in range(1, 10):
        ws_spont.cell(row=norm_avg_row, column=col).fill = avg_fill
        ws_spont.cell(row=norm_avg_row, column=col).border = thin_border
    
    auto_width(ws_spont)
    
    # Sheet 3: Light Stimulus (Combined HRA and Corrected HRV)
    ws_light = wb.create_sheet("Light Stimulus")
    
    # HRA Section Title
    ws_light.merge_cells('A1:K1')
    ws_light['A1'] = 'Light-Induced Heart Rate Adaptation (HRA)'
    ws_light['A1'].font = Font(bold=True, size=11)
    ws_light['A1'].fill = header_fill_light
    ws_light['A1'].alignment = Alignment(horizontal='center')
    
    hra_headers = [
        'Recording', 'Baseline BF (bpm)', 'Avg BF (bpm)', 'Peak BF (bpm)', 
        'Norm. Peak (%)', 'TTP 1st (s)', 'TTP Avg (s)', 
        'Recovery BF (bpm)', 'Recovery (%)', 'Amplitude (bpm)', 'Rate of Change'
    ]
    
    for col_idx, header in enumerate(hra_headers, start=1):
        cell = ws_light.cell(row=2, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill_light
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
    
    hra_averages = data.get('light_hra_averages', {}).get('averages', {})
    for row_idx, rec in enumerate(recordings, start=3):
        ws_light.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
        ws_light.cell(row=row_idx, column=2, value=format_value(rec.get('light_baseline_bf'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=3, value=format_value(rec.get('light_avg_bf'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=4, value=format_value(rec.get('light_peak_bf'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=5, value=format_value(rec.get('light_peak_norm'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=6, value=format_value(rec.get('light_ttp_first'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=7, value=format_value(rec.get('light_ttp_avg'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=8, value=format_value(rec.get('light_recovery_bf'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=9, value=format_value(rec.get('light_recovery_pct'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=10, value=format_value(rec.get('light_amplitude'), 1)).font = data_font
        ws_light.cell(row=row_idx, column=11, value=format_value(rec.get('light_roc'), 4)).font = data_font
        
        for col in range(1, 12):
            ws_light.cell(row=row_idx, column=col).border = thin_border
    
    # HRA Average row
    hra_avg_row = len(recordings) + 3
    ws_light.cell(row=hra_avg_row, column=1, value=f"Folder Average (n={len(recordings)})").font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=2, value=format_value(hra_averages.get('light_baseline_bf'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=3, value=format_value(hra_averages.get('light_avg_bf'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=4, value=format_value(hra_averages.get('light_peak_bf'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=5, value=format_value(hra_averages.get('light_peak_norm'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=6, value=format_value(hra_averages.get('light_ttp_first'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=7, value=format_value(hra_averages.get('light_ttp_avg'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=8, value=format_value(hra_averages.get('light_recovery_bf'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=9, value=format_value(hra_averages.get('light_recovery_pct'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=10, value=format_value(hra_averages.get('light_amplitude'), 1)).font = Font(bold=True, size=9)
    ws_light.cell(row=hra_avg_row, column=11, value=format_value(hra_averages.get('light_roc'), 4)).font = Font(bold=True, size=9)
    
    for col in range(1, 12):
        ws_light.cell(row=hra_avg_row, column=col).fill = avg_fill
        ws_light.cell(row=hra_avg_row, column=col).border = thin_border
    
    # Add Normalized to Baseline - Light HRA section below the main HRA table
    norm_hra_start_row = hra_avg_row + 3
    
    ws_light.merge_cells(f'A{norm_hra_start_row}:E{norm_hra_start_row}')
    ws_light.cell(row=norm_hra_start_row, column=1, value='Normalized to Baseline — Light-Induced Heart Rate Adaptation (HRA)').font = Font(bold=True, size=11, color="FFFFFF")
    ws_light.cell(row=norm_hra_start_row, column=1).fill = header_fill_light
    ws_light.cell(row=norm_hra_start_row, column=1).alignment = Alignment(horizontal='center')
    
    norm_light_headers = ['Recording', 'Baseline BF (%)', 'Avg BF (%)', 'Peak BF (%)', 'Recovery BF (%)']
    
    for col_idx, header in enumerate(norm_light_headers, start=1):
        cell = ws_light.cell(row=norm_hra_start_row + 1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill_light
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
    
    # Calculate the average of light_baseline_bf for Light HRA normalization
    light_baseline_bfs = [r.get('light_baseline_bf') for r in recordings if r.get('light_baseline_bf') is not None]
    avg_light_baseline_bf = sum(light_baseline_bfs) / len(light_baseline_bfs) if light_baseline_bfs else 1
    
    # Data rows with normalized values (using avg_light_baseline_bf - NOT spontaneous baseline)
    light_norm_sums = {'baseline_bf': [], 'avg_bf': [], 'peak_bf': [], 'recovery_bf': []}
    
    for row_idx, rec in enumerate(recordings, start=norm_hra_start_row + 2):
        ws_light.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
        
        n_light_baseline_bf = norm_val(rec.get('light_baseline_bf'), avg_light_baseline_bf)
        n_light_avg_bf = norm_val(rec.get('light_avg_bf'), avg_light_baseline_bf)
        n_light_peak_bf = norm_val(rec.get('light_peak_bf'), avg_light_baseline_bf)
        n_light_recovery_bf = norm_val(rec.get('light_recovery_bf'), avg_light_baseline_bf)
        
        ws_light.cell(row=row_idx, column=2, value=format_value(n_light_baseline_bf, 1)).font = data_font
        ws_light.cell(row=row_idx, column=3, value=format_value(n_light_avg_bf, 1)).font = data_font
        ws_light.cell(row=row_idx, column=4, value=format_value(n_light_peak_bf, 1)).font = data_font
        ws_light.cell(row=row_idx, column=5, value=format_value(n_light_recovery_bf, 1)).font = data_font
        
        # Collect for averages
        for key, val in [('baseline_bf', n_light_baseline_bf), ('avg_bf', n_light_avg_bf),
                         ('peak_bf', n_light_peak_bf), ('recovery_bf', n_light_recovery_bf)]:
            if val is not None:
                light_norm_sums[key].append(val)
        
        for col in range(1, 6):
            ws_light.cell(row=row_idx, column=col).border = thin_border
    
    # Folder Average row for normalized Light HRA
    light_norm_avg_row = norm_hra_start_row + 2 + len(recordings)
    ws_light.cell(row=light_norm_avg_row, column=1, value=f"Folder Average (n={len(recordings)})").font = Font(bold=True, size=9)
    
    for col_idx, key in enumerate(['baseline_bf', 'avg_bf', 'peak_bf', 'recovery_bf'], start=2):
        avg_val_light = sum(light_norm_sums[key]) / len(light_norm_sums[key]) if light_norm_sums[key] else None
        ws_light.cell(row=light_norm_avg_row, column=col_idx, value=format_value(avg_val_light, 1)).font = Font(bold=True, size=9)
    
    for col in range(1, 6):
        ws_light.cell(row=light_norm_avg_row, column=col).fill = avg_fill
        ws_light.cell(row=light_norm_avg_row, column=col).border = thin_border
    
    # Spacer row - adjust for Corrected HRV section
    hrv_start_row = light_norm_avg_row + 3
    
    # Corrected HRV Section Title
    ws_light.merge_cells(f'A{hrv_start_row}:D{hrv_start_row}')
    ws_light.cell(row=hrv_start_row, column=1, value='Corrected Light-Induced Heart Rate Variability (HRV)').font = Font(bold=True, size=11)
    ws_light.cell(row=hrv_start_row, column=1).fill = header_fill_light
    ws_light.cell(row=hrv_start_row, column=1).alignment = Alignment(horizontal='center')
    
    hrv_headers = ['Recording', 'ln(RMSSD70) corr.', 'ln(SDNN70) corr.', 'pNN50 corr. (%)']
    
    for col_idx, header in enumerate(hrv_headers, start=1):
        cell = ws_light.cell(row=hrv_start_row + 1, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill_light
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
    
    hrv_averages = data.get('light_hrv_averages', {}).get('averages', {})
    for row_idx, rec in enumerate(recordings, start=hrv_start_row + 2):
        actual_rec_idx = row_idx - (hrv_start_row + 2)
        if actual_rec_idx < len(recordings):
            rec = recordings[actual_rec_idx]
            ws_light.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
            ws_light.cell(row=row_idx, column=2, value=format_value(rec.get('light_hrv_ln_rmssd70'), 3)).font = data_font
            ws_light.cell(row=row_idx, column=3, value=format_value(rec.get('light_hrv_ln_sdnn70'), 3)).font = data_font
            ws_light.cell(row=row_idx, column=4, value=format_value(rec.get('light_hrv_pnn50'), 1)).font = data_font
            
            for col in range(1, 5):
                ws_light.cell(row=row_idx, column=col).border = thin_border
    
    # HRV Average row
    hrv_avg_row = hrv_start_row + 2 + len(recordings)
    ws_light.cell(row=hrv_avg_row, column=1, value=f"Folder Average (n={len(recordings)})").font = Font(bold=True, size=9)
    ws_light.cell(row=hrv_avg_row, column=2, value=format_value(hrv_averages.get('light_hrv_ln_rmssd70'), 3)).font = Font(bold=True, size=9)
    ws_light.cell(row=hrv_avg_row, column=3, value=format_value(hrv_averages.get('light_hrv_ln_sdnn70'), 3)).font = Font(bold=True, size=9)
    ws_light.cell(row=hrv_avg_row, column=4, value=format_value(hrv_averages.get('light_hrv_pnn50'), 1)).font = Font(bold=True, size=9)
    
    for col in range(1, 5):
        ws_light.cell(row=hrv_avg_row, column=col).fill = avg_fill
        ws_light.cell(row=hrv_avg_row, column=col).border = thin_border
    
    auto_width(ws_light)
    
    # Sheet 4: Recording Metadata
    ws_meta = wb.create_sheet("Recording Metadata")
    
    meta_headers = [
        'Recording', 'Filename', 'Date', 
        'hSpO Line', 'hSpO P#', 'hSpO Age', 'hSpO Transd.',
        'hCO Line', 'hCO P#', 'hCO Age',
        'Fusion Date', 'Condition',
        'Drug(s)', 'Concentration(s)', 'Perfusion Time(s)',
        'Stim Duration', 'ISI Structure', 'Notes'
    ]
    
    for col_idx, header in enumerate(meta_headers, start=1):
        cell = ws_meta.cell(row=1, column=col_idx, value=header)
        cell.font = header_font
        cell.border = thin_border
        cell.alignment = Alignment(horizontal='center', wrap_text=True)
        # Color code headers
        if 4 <= col_idx <= 7:  # hSpO columns
            cell.fill = header_fill_baseline  # Amber
        elif 8 <= col_idx <= 10:  # hCO columns
            cell.fill = header_fill_drug  # Purple
        elif 13 <= col_idx <= 15:  # Drug columns
            cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")  # Green
        elif 16 <= col_idx <= 17:  # Light columns
            cell.fill = header_fill_light  # Cyan
        else:
            cell.fill = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
    
    for row_idx, rec in enumerate(recordings, start=2):
        ws_meta.cell(row=row_idx, column=1, value=rec.get('name', '')).font = data_font
        ws_meta.cell(row=row_idx, column=2, value=rec.get('filename', '')).font = data_font
        ws_meta.cell(row=row_idx, column=3, value=rec.get('recording_date', '')).font = data_font
        
        # hSpO info
        hspo = rec.get('hspo_info') or {}
        ws_meta.cell(row=row_idx, column=4, value=hspo.get('line_name', '') if hspo else '').font = data_font
        ws_meta.cell(row=row_idx, column=5, value=hspo.get('passage', '') if hspo else '').font = data_font
        ws_meta.cell(row=row_idx, column=6, value=format_value(hspo.get('age'), 0) if hspo and hspo.get('age') else '').font = data_font
        ws_meta.cell(row=row_idx, column=7, value='Yes' if hspo and hspo.get('has_transduction') else '').font = data_font
        
        # hCO info
        hco = rec.get('hco_info') or {}
        ws_meta.cell(row=row_idx, column=8, value=hco.get('line_name', '') if hco else '').font = data_font
        ws_meta.cell(row=row_idx, column=9, value=hco.get('passage', '') if hco else '').font = data_font
        ws_meta.cell(row=row_idx, column=10, value=format_value(hco.get('age'), 0) if hco and hco.get('age') else '').font = data_font
        
        ws_meta.cell(row=row_idx, column=11, value=rec.get('fusion_date', '')).font = data_font
        ws_meta.cell(row=row_idx, column=12, value=rec.get('condition', '')).font = data_font
        
        # Drug info - use dashes if no drug
        drug_info = rec.get('drug_info', [])
        if rec.get('has_drug') and drug_info:
            drug_names = ', '.join([d.get('name', '') for d in drug_info]) if drug_info else ''
            drug_concs = ', '.join([str(d.get('concentration', '')) for d in drug_info if d.get('concentration')]) if drug_info else ''
            drug_times = ', '.join([str(d.get('perfusion_time', '')) for d in drug_info if d.get('perfusion_time')]) if drug_info else ''
        else:
            drug_names = '—'
            drug_concs = '—'
            drug_times = '—'
        ws_meta.cell(row=row_idx, column=13, value=drug_names).font = data_font
        ws_meta.cell(row=row_idx, column=14, value=drug_concs).font = data_font
        ws_meta.cell(row=row_idx, column=15, value=drug_times).font = data_font
        
        # Light stim info - use dashes if no light stim
        if rec.get('has_light_stim'):
            ws_meta.cell(row=row_idx, column=16, value=f"{rec.get('stim_duration', '')}s").font = data_font
            ws_meta.cell(row=row_idx, column=17, value=rec.get('isi_structure', '') or '—').font = data_font
        else:
            ws_meta.cell(row=row_idx, column=16, value='—').font = data_font
            ws_meta.cell(row=row_idx, column=17, value='—').font = data_font
        ws_meta.cell(row=row_idx, column=18, value=rec.get('recording_description', '') or '—').font = data_font
        
        for col in range(1, 19):
            ws_meta.cell(row=row_idx, column=col).border = thin_border
    
    auto_width(ws_meta)
    
    # Save to buffer
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"{request.folder_name}_comparison.xlsx".replace(' ', '_')
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.post("/folders/{folder_id}/export/pdf")
async def export_folder_comparison_pdf(folder_id: str, request: FolderComparisonExportRequest):
    """Export folder comparison data to PDF."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    from datetime import datetime
    
    data = request.comparison_data
    recordings = data.get('recordings', [])
    summary = data.get('summary', {})
    
    output = io.BytesIO()
    
    with PdfPages(output) as pdf:
        # Page 1: Summary - prettier version
        fig1 = plt.figure(figsize=(11, 8.5))
        
        # Title bar
        ax_title = fig1.add_axes([0, 0.88, 1, 0.1])
        ax_title.set_facecolor('#1F2937')
        ax_title.axis('off')
        ax_title.text(0.5, 0.5, f'{request.folder_name}', fontsize=18, fontweight='bold', 
                     color='white', ha='center', va='center', transform=ax_title.transAxes)
        ax_title.text(0.5, 0.1, 'Folder Comparison Report', fontsize=10, color='#9CA3AF', 
                     ha='center', va='center', transform=ax_title.transAxes)
        
        # Overview section
        ax_overview = fig1.add_axes([0.08, 0.68, 0.35, 0.16])
        ax_overview.axis('off')
        ax_overview.text(0, 1, 'OVERVIEW', fontsize=10, fontweight='bold', color='#374151', 
                        transform=ax_overview.transAxes, va='top')
        
        overview_text = [
            ['Recordings', str(summary.get('recording_count', 0))],
            ['Generated', datetime.now().strftime('%B %d, %Y')],
        ]
        table_overview = ax_overview.table(cellText=overview_text, loc='upper left', 
                                           cellLoc='left', colWidths=[0.5, 0.5], 
                                           bbox=[0, 0.1, 1, 0.7])
        table_overview.auto_set_font_size(False)
        table_overview.set_fontsize(9)
        for (row, col), cell in table_overview.get_celld().items():
            cell.set_edgecolor('#E5E7EB')
            if col == 0:
                cell.set_text_props(fontweight='bold')
        
        # Age Ranges section
        ax_ages = fig1.add_axes([0.55, 0.68, 0.38, 0.16])
        ax_ages.axis('off')
        ax_ages.text(0, 1, 'AGE RANGES', fontsize=10, fontweight='bold', color='#374151', 
                    transform=ax_ages.transAxes, va='top')
        
        def fmt_age_range(age_dict):
            if not age_dict or age_dict.get('min') is None:
                return '—'
            return f"{age_dict.get('min')} - {age_dict.get('max')} days"
        
        age_text = [
            ['Type', 'Range', 'n'],
            ['hSpOs', fmt_age_range(summary.get('hspo_age_range')), str(summary.get('hspo_age_range', {}).get('n', 0))],
            ['hCOs', fmt_age_range(summary.get('hco_age_range')), str(summary.get('hco_age_range', {}).get('n', 0))],
            ['Fusion', fmt_age_range(summary.get('fusion_age_range')), str(summary.get('fusion_age_range', {}).get('n', 0))],
        ]
        table_ages = ax_ages.table(cellText=age_text, loc='upper left', cellLoc='center', 
                                   colWidths=[0.3, 0.45, 0.15], bbox=[0, -0.1, 1, 0.85])
        table_ages.auto_set_font_size(False)
        table_ages.set_fontsize(8)
        for (row, col), cell in table_ages.get_celld().items():
            cell.set_edgecolor('#E5E7EB')
            if row == 0:
                cell.set_facecolor('#374151')
                cell.set_text_props(color='white', fontweight='bold')
        
        # Spontaneous Activity Averages - position to avoid overlap
        ax_spont_avg = fig1.add_axes([0.08, 0.32, 0.4, 0.30])
        ax_spont_avg.axis('off')
        ax_spont_avg.text(0, 0.95, 'SPONTANEOUS AVERAGES', fontsize=10, fontweight='bold', 
                         color='#374151', transform=ax_spont_avg.transAxes, va='top')
        
        spont_averages = data.get('spontaneous_averages', {}).get('averages', {})
        
        def fmt_val(val, dec=2):
            if val is None:
                return '—'
            if dec == 1:
                return f"{val:.1f}"
            elif dec == 3:
                return f"{val:.3f}"
            return f"{val:.{dec}f}"
        
        spont_avg_text = [
            ['Metric', 'Baseline', 'Drug'],
            ['Mean BF (bpm)', fmt_val(spont_averages.get('baseline_bf'), 1), fmt_val(spont_averages.get('drug_bf'), 1)],
            ['ln(RMSSD70)', fmt_val(spont_averages.get('baseline_ln_rmssd70'), 3), fmt_val(spont_averages.get('drug_ln_rmssd70'), 3)],
            ['ln(SDNN70)', fmt_val(spont_averages.get('baseline_ln_sdnn70'), 3), fmt_val(spont_averages.get('drug_ln_sdnn70'), 3)],
            ['pNN50 (%)', fmt_val(spont_averages.get('baseline_pnn50'), 1), fmt_val(spont_averages.get('drug_pnn50'), 1)],
        ]
        table_spont_avg = ax_spont_avg.table(cellText=spont_avg_text, loc='upper left', 
                                              cellLoc='center', colWidths=[0.4, 0.3, 0.3], 
                                              bbox=[0, 0.15, 1, 0.75])
        table_spont_avg.auto_set_font_size(False)
        table_spont_avg.set_fontsize(8)
        for (row, col), cell in table_spont_avg.get_celld().items():
            cell.set_edgecolor('#E5E7EB')
            if row == 0:
                if col == 1:
                    cell.set_facecolor('#F59E0B')  # Amber for baseline
                elif col == 2:
                    cell.set_facecolor('#8B5CF6')  # Purple for drug
                else:
                    cell.set_facecolor('#374151')
                cell.set_text_props(color='white', fontweight='bold')
        
        # Light Stimulation Averages - ALL Metrics (split into two sections)
        ax_light_avg = fig1.add_axes([0.55, 0.08, 0.38, 0.56])
        ax_light_avg.axis('off')
        ax_light_avg.text(0, 1, 'LIGHT STIMULUS AVERAGES', fontsize=10, fontweight='bold', 
                         color='#374151', transform=ax_light_avg.transAxes, va='top')
        
        hra_averages = data.get('light_hra_averages', {}).get('averages', {})
        hrv_averages = data.get('light_hrv_averages', {}).get('averages', {})
        
        # HRA Section - subtitle well above table
        ax_light_avg.text(0, 0.92, 'Heart Rate Adaptation (HRA)', fontsize=8, fontstyle='italic', 
                         color='#6B7280', transform=ax_light_avg.transAxes, va='top')
        
        light_hra_text = [
            ['Metric', 'Value'],
            ['Baseline BF (bpm)', fmt_val(hra_averages.get('light_baseline_bf'), 1)],
            ['Avg BF (bpm)', fmt_val(hra_averages.get('light_avg_bf'), 1)],
            ['Peak BF (bpm)', fmt_val(hra_averages.get('light_peak_bf'), 1)],
            ['Normalized Peak (%)', fmt_val(hra_averages.get('light_peak_norm'), 1)],
            ['TTP 1st (s)', fmt_val(hra_averages.get('light_ttp_first'), 1)],
            ['TTP Avg (s)', fmt_val(hra_averages.get('light_ttp_avg'), 1)],
            ['Recovery BF (bpm)', fmt_val(hra_averages.get('light_recovery_bf'), 1)],
            ['Recovery (%)', fmt_val(hra_averages.get('light_recovery_pct'), 1)],
            ['Amplitude (bpm)', fmt_val(hra_averages.get('light_amplitude'), 1)],
            ['Rate of Change', fmt_val(hra_averages.get('light_roc'), 4)],
        ]
        # Table positioned below subtitle: bbox = [left, bottom, width, height]
        # Top of table = bottom + height = 0.40 + 0.48 = 0.88, subtitle at 0.92
        table_light_hra = ax_light_avg.table(cellText=light_hra_text, loc='upper left', 
                                              cellLoc='center', colWidths=[0.6, 0.4], 
                                              bbox=[0, 0.40, 1, 0.48])
        table_light_hra.auto_set_font_size(False)
        table_light_hra.set_fontsize(7)
        for (row, col), cell in table_light_hra.get_celld().items():
            cell.set_edgecolor('#E5E7EB')
            if row == 0:
                cell.set_facecolor('#06B6D4')  # Cyan for light
                cell.set_text_props(color='white', fontweight='bold')
        
        # Corrected HRV Section - subtitle well above table
        ax_light_avg.text(0, 0.36, 'Corrected HRV', fontsize=8, fontstyle='italic', 
                         color='#6B7280', transform=ax_light_avg.transAxes, va='top')
        
        light_hrv_text = [
            ['Metric', 'Value'],
            ['ln(RMSSD70) corr.', fmt_val(hrv_averages.get('light_hrv_ln_rmssd70'), 3)],
            ['ln(SDNN70) corr.', fmt_val(hrv_averages.get('light_hrv_ln_sdnn70'), 3)],
            ['pNN50 corr. (%)', fmt_val(hrv_averages.get('light_hrv_pnn50'), 1)],
        ]
        # Top of table = 0.05 + 0.26 = 0.31, subtitle at 0.36
        table_light_hrv = ax_light_avg.table(cellText=light_hrv_text, loc='upper left', 
                                              cellLoc='center', colWidths=[0.6, 0.4], 
                                              bbox=[0, 0.05, 1, 0.26])
        table_light_hrv.auto_set_font_size(False)
        table_light_hrv.set_fontsize(7)
        for (row, col), cell in table_light_hrv.get_celld().items():
            cell.set_edgecolor('#E5E7EB')
            if row == 0:
                cell.set_facecolor('#06B6D4')  # Cyan for light
                cell.set_text_props(color='white', fontweight='bold')
        
        # Footer
        fig1.text(0.5, 0.02, f'Generated: {datetime.now().strftime("%B %d, %Y at %H:%M")}', 
                 ha='center', fontsize=8, color='gray')
        pdf.savefig(fig1, bbox_inches='tight')
        plt.close(fig1)
        
        # Page 2: Spontaneous Activity Table
        fig2 = plt.figure(figsize=(11, 8.5))
        
        # Add title at top with padding
        fig2.text(0.5, 0.95, 'Spontaneous Activity Comparison', fontsize=14, fontweight='bold', ha='center')
        
        ax_spont = fig2.add_axes([0.03, 0.08, 0.94, 0.82])
        ax_spont.axis('off')
        
        def fmt(val, dec=2):
            if val is None:
                return '—'
            if dec == 0:
                return f"{val:.0f}"
            elif dec == 1:
                return f"{val:.1f}"
            elif dec == 3:
                return f"{val:.3f}"
            return f"{val:.{dec}f}"
        
        spont_headers = ['Recording', 'Base\nBF', 'Base\nRMSSD', 'Base\nSDNN', 'Base\npNN50', 
                        'Drug\nBF', 'Drug\nRMSSD', 'Drug\nSDNN', 'Drug\npNN50']
        spont_data = [spont_headers]
        
        spont_averages = data.get('spontaneous_averages', {}).get('averages', {})
        for rec in recordings:
            spont_data.append([
                rec.get('name', '')[:15],
                fmt(rec.get('baseline_bf'), 1),
                fmt(rec.get('baseline_ln_rmssd70'), 3),
                fmt(rec.get('baseline_ln_sdnn70'), 3),
                fmt(rec.get('baseline_pnn50'), 1),
                fmt(rec.get('drug_bf'), 1),
                fmt(rec.get('drug_ln_rmssd70'), 3),
                fmt(rec.get('drug_ln_sdnn70'), 3),
                fmt(rec.get('drug_pnn50'), 1),
            ])
        
        # Add average row
        spont_data.append([
            f'Average (n={len(recordings)})',
            fmt(spont_averages.get('baseline_bf'), 1),
            fmt(spont_averages.get('baseline_ln_rmssd70'), 3),
            fmt(spont_averages.get('baseline_ln_sdnn70'), 3),
            fmt(spont_averages.get('baseline_pnn50'), 1),
            fmt(spont_averages.get('drug_bf'), 1),
            fmt(spont_averages.get('drug_ln_rmssd70'), 3),
            fmt(spont_averages.get('drug_ln_sdnn70'), 3),
            fmt(spont_averages.get('drug_pnn50'), 1),
        ])
        
        # Calculate row height based on number of rows
        n_rows = len(spont_data)
        row_height = min(0.08, 0.7 / n_rows)
        table_height = row_height * n_rows
        
        table_spont = ax_spont.table(cellText=spont_data, loc='upper center', cellLoc='center',
                                     colWidths=[0.15, 0.09, 0.1, 0.1, 0.1, 0.09, 0.1, 0.1, 0.1],
                                     bbox=[0.02, 1.0 - table_height - 0.05, 0.96, table_height])
        table_spont.auto_set_font_size(False)
        table_spont.set_fontsize(8)
        
        for (row, col), cell in table_spont.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            if row == 0:
                cell.set_facecolor('#374151')
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(spont_data) - 1:
                cell.set_facecolor('#E5E7EB')
                cell.set_text_props(fontweight='bold')
            else:
                if 1 <= col <= 4:
                    cell.set_facecolor('#FEF3C7')  # Baseline amber
                elif 5 <= col <= 8:
                    cell.set_facecolor('#EDE9FE')  # Drug purple
        
        # Calculate position for Normalized section below main table
        norm_start_y = 1.0 - table_height - 0.15
        
        # Add Normalized to Baseline section title
        ax_spont.text(0.02, norm_start_y, 'Normalized to Baseline — Spontaneous Activity', 
                     fontsize=10, fontweight='bold', color='#374151', transform=ax_spont.transAxes)
        
        # Calculate cohort baseline averages for normalization
        baseline_bfs = [r.get('baseline_bf') for r in recordings if r.get('baseline_bf') is not None]
        baseline_ln_rmssds = [r.get('baseline_ln_rmssd70') for r in recordings if r.get('baseline_ln_rmssd70') is not None]
        baseline_ln_sdnns = [r.get('baseline_ln_sdnn70') for r in recordings if r.get('baseline_ln_sdnn70') is not None]
        baseline_pnn50s = [r.get('baseline_pnn50') for r in recordings if r.get('baseline_pnn50') is not None]
        
        avg_baseline_bf_pdf = sum(baseline_bfs) / len(baseline_bfs) if baseline_bfs else 1
        avg_baseline_ln_rmssd_pdf = sum(baseline_ln_rmssds) / len(baseline_ln_rmssds) if baseline_ln_rmssds else 1
        avg_baseline_ln_sdnn_pdf = sum(baseline_ln_sdnns) / len(baseline_ln_sdnns) if baseline_ln_sdnns else 1
        avg_baseline_pnn50_pdf = sum(baseline_pnn50s) / len(baseline_pnn50s) if baseline_pnn50s else 1
        
        def norm_val_pdf(val, avg):
            if val is None or avg == 0:
                return None
            return 100 * val / avg
        
        norm_spont_headers = ['Recording', 'Base\nBF%', 'Base\nRMSSD%', 'Base\nSDNN%', 'Base\npNN50%',
                             'Drug\nBF%', 'Drug\nRMSSD%', 'Drug\nSDNN%', 'Drug\npNN50%']
        norm_spont_data = [norm_spont_headers]
        
        norm_sums_pdf = {'baseline_bf': [], 'baseline_ln_rmssd': [], 'baseline_ln_sdnn': [], 'baseline_pnn50': [],
                         'drug_bf': [], 'drug_ln_rmssd': [], 'drug_ln_sdnn': [], 'drug_pnn50': []}
        
        for rec in recordings:
            n_baseline_bf = norm_val_pdf(rec.get('baseline_bf'), avg_baseline_bf_pdf)
            n_baseline_ln_rmssd = norm_val_pdf(rec.get('baseline_ln_rmssd70'), avg_baseline_ln_rmssd_pdf)
            n_baseline_ln_sdnn = norm_val_pdf(rec.get('baseline_ln_sdnn70'), avg_baseline_ln_sdnn_pdf)
            n_baseline_pnn50 = norm_val_pdf(rec.get('baseline_pnn50'), avg_baseline_pnn50_pdf)
            n_drug_bf = norm_val_pdf(rec.get('drug_bf'), avg_baseline_bf_pdf)
            n_drug_ln_rmssd = norm_val_pdf(rec.get('drug_ln_rmssd70'), avg_baseline_ln_rmssd_pdf)
            n_drug_ln_sdnn = norm_val_pdf(rec.get('drug_ln_sdnn70'), avg_baseline_ln_sdnn_pdf)
            n_drug_pnn50 = norm_val_pdf(rec.get('drug_pnn50'), avg_baseline_pnn50_pdf)
            
            norm_spont_data.append([
                rec.get('name', '')[:15],
                fmt(n_baseline_bf, 1),
                fmt(n_baseline_ln_rmssd, 1),
                fmt(n_baseline_ln_sdnn, 1),
                fmt(n_baseline_pnn50, 1),
                fmt(n_drug_bf, 1),
                fmt(n_drug_ln_rmssd, 1),
                fmt(n_drug_ln_sdnn, 1),
                fmt(n_drug_pnn50, 1),
            ])
            
            # Collect for averages
            for key, val in [('baseline_bf', n_baseline_bf), ('baseline_ln_rmssd', n_baseline_ln_rmssd),
                             ('baseline_ln_sdnn', n_baseline_ln_sdnn), ('baseline_pnn50', n_baseline_pnn50),
                             ('drug_bf', n_drug_bf), ('drug_ln_rmssd', n_drug_ln_rmssd),
                             ('drug_ln_sdnn', n_drug_ln_sdnn), ('drug_pnn50', n_drug_pnn50)]:
                if val is not None:
                    norm_sums_pdf[key].append(val)
        
        # Add average row for normalized section
        norm_spont_data.append([
            f'Average (n={len(recordings)})',
            fmt(sum(norm_sums_pdf['baseline_bf']) / len(norm_sums_pdf['baseline_bf']) if norm_sums_pdf['baseline_bf'] else None, 1),
            fmt(sum(norm_sums_pdf['baseline_ln_rmssd']) / len(norm_sums_pdf['baseline_ln_rmssd']) if norm_sums_pdf['baseline_ln_rmssd'] else None, 1),
            fmt(sum(norm_sums_pdf['baseline_ln_sdnn']) / len(norm_sums_pdf['baseline_ln_sdnn']) if norm_sums_pdf['baseline_ln_sdnn'] else None, 1),
            fmt(sum(norm_sums_pdf['baseline_pnn50']) / len(norm_sums_pdf['baseline_pnn50']) if norm_sums_pdf['baseline_pnn50'] else None, 1),
            fmt(sum(norm_sums_pdf['drug_bf']) / len(norm_sums_pdf['drug_bf']) if norm_sums_pdf['drug_bf'] else None, 1),
            fmt(sum(norm_sums_pdf['drug_ln_rmssd']) / len(norm_sums_pdf['drug_ln_rmssd']) if norm_sums_pdf['drug_ln_rmssd'] else None, 1),
            fmt(sum(norm_sums_pdf['drug_ln_sdnn']) / len(norm_sums_pdf['drug_ln_sdnn']) if norm_sums_pdf['drug_ln_sdnn'] else None, 1),
            fmt(sum(norm_sums_pdf['drug_pnn50']) / len(norm_sums_pdf['drug_pnn50']) if norm_sums_pdf['drug_pnn50'] else None, 1),
        ])
        
        n_norm_rows = len(norm_spont_data)
        norm_row_height = min(0.06, 0.35 / n_norm_rows)
        norm_table_height = norm_row_height * n_norm_rows
        
        table_norm_spont = ax_spont.table(cellText=norm_spont_data, loc='upper center', cellLoc='center',
                                          colWidths=[0.15, 0.09, 0.1, 0.1, 0.1, 0.09, 0.1, 0.1, 0.1],
                                          bbox=[0.02, norm_start_y - norm_table_height - 0.03, 0.96, norm_table_height])
        table_norm_spont.auto_set_font_size(False)
        table_norm_spont.set_fontsize(8)
        
        for (row, col), cell in table_norm_spont.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            if row == 0:
                cell.set_facecolor('#374151')
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(norm_spont_data) - 1:
                cell.set_facecolor('#E5E7EB')
                cell.set_text_props(fontweight='bold')
            else:
                if 1 <= col <= 4:
                    cell.set_facecolor('#FEF3C7')  # Baseline amber
                elif 5 <= col <= 8:
                    cell.set_facecolor('#EDE9FE')  # Drug purple
        
        pdf.savefig(fig2, bbox_inches='tight')
        plt.close(fig2)
        
        # Page 3: Light Stimulus (Combined HRA and Corrected HRV)
        fig3 = plt.figure(figsize=(11, 8.5))
        
        # Main title at very top
        fig3.text(0.5, 0.97, 'Light Stimulus Comparison', fontsize=14, fontweight='bold', ha='center')
        
        # HRA Section - upper half
        ax_hra = fig3.add_axes([0.03, 0.52, 0.94, 0.40])
        ax_hra.axis('off')
        
        # HRA subtitle positioned clearly above table
        fig3.text(0.5, 0.90, 'Light-Induced Heart Rate Adaptation (HRA)', fontsize=11, fontweight='bold', 
                 color='#374151', ha='center')
        
        hra_headers = ['Recording', 'Base BF', 'Avg BF', 'Peak BF', 'Norm%', 'TTP 1st', 'TTP Avg', 
                      'Rec BF', 'Rec%', 'Amp', 'RoC']
        hra_data = [hra_headers]
        
        hra_averages = data.get('light_hra_averages', {}).get('averages', {})
        for rec in recordings:
            hra_data.append([
                rec.get('name', '')[:12],
                fmt(rec.get('light_baseline_bf'), 1),
                fmt(rec.get('light_avg_bf'), 1),
                fmt(rec.get('light_peak_bf'), 1),
                fmt(rec.get('light_peak_norm'), 1),
                fmt(rec.get('light_ttp_first'), 1),
                fmt(rec.get('light_ttp_avg'), 1),
                fmt(rec.get('light_recovery_bf'), 1),
                fmt(rec.get('light_recovery_pct'), 1),
                fmt(rec.get('light_amplitude'), 1),
                fmt(rec.get('light_roc'), 3),
            ])
        
        hra_data.append([
            f'Avg (n={len(recordings)})',
            fmt(hra_averages.get('light_baseline_bf'), 1),
            fmt(hra_averages.get('light_avg_bf'), 1),
            fmt(hra_averages.get('light_peak_bf'), 1),
            fmt(hra_averages.get('light_peak_norm'), 1),
            fmt(hra_averages.get('light_ttp_first'), 1),
            fmt(hra_averages.get('light_ttp_avg'), 1),
            fmt(hra_averages.get('light_recovery_bf'), 1),
            fmt(hra_averages.get('light_recovery_pct'), 1),
            fmt(hra_averages.get('light_amplitude'), 1),
            fmt(hra_averages.get('light_roc'), 3),
        ])
        
        n_hra_rows = len(hra_data)
        hra_row_height = min(0.06, 0.32 / n_hra_rows)
        hra_table_height = hra_row_height * n_hra_rows
        
        table_hra = ax_hra.table(cellText=hra_data, loc='upper center', cellLoc='center',
                                 colWidths=[0.12, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
                                 bbox=[0.02, 1.0 - hra_table_height - 0.08, 0.96, hra_table_height])
        table_hra.auto_set_font_size(False)
        table_hra.set_fontsize(7)
        
        for (row, col), cell in table_hra.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            if row == 0:
                cell.set_facecolor('#06B6D4')
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(hra_data) - 1:
                cell.set_facecolor('#E5E7EB')
                cell.set_text_props(fontweight='bold')
        
        # Add Normalized HRA section below main HRA table
        norm_hra_start_y = 1.0 - hra_table_height - 0.18
        
        # Normalized HRA title
        ax_hra.text(0.02, norm_hra_start_y, 'Normalized to Baseline — Light-Induced HRA', 
                   fontsize=9, fontweight='bold', color='#374151', transform=ax_hra.transAxes)
        
        norm_hra_headers = ['Recording', 'Base BF%', 'Avg BF%', 'Peak BF%', 'Rec BF%']
        norm_hra_data = [norm_hra_headers]
        
        # Calculate the average of light_baseline_bf for Light HRA normalization
        light_baseline_bfs_pdf = [r.get('light_baseline_bf') for r in recordings if r.get('light_baseline_bf') is not None]
        avg_light_baseline_bf_pdf = sum(light_baseline_bfs_pdf) / len(light_baseline_bfs_pdf) if light_baseline_bfs_pdf else 1
        
        light_norm_sums_pdf = {'baseline_bf': [], 'avg_bf': [], 'peak_bf': [], 'recovery_bf': []}
        
        for rec in recordings:
            # Normalize Light HRA values to the average of light_baseline_bf (NOT spontaneous baseline)
            n_light_baseline_bf = norm_val_pdf(rec.get('light_baseline_bf'), avg_light_baseline_bf_pdf)
            n_light_avg_bf = norm_val_pdf(rec.get('light_avg_bf'), avg_light_baseline_bf_pdf)
            n_light_peak_bf = norm_val_pdf(rec.get('light_peak_bf'), avg_light_baseline_bf_pdf)
            n_light_recovery_bf = norm_val_pdf(rec.get('light_recovery_bf'), avg_light_baseline_bf_pdf)
            
            norm_hra_data.append([
                rec.get('name', '')[:12],
                fmt(n_light_baseline_bf, 1),
                fmt(n_light_avg_bf, 1),
                fmt(n_light_peak_bf, 1),
                fmt(n_light_recovery_bf, 1),
            ])
            
            for key, val in [('baseline_bf', n_light_baseline_bf), ('avg_bf', n_light_avg_bf),
                             ('peak_bf', n_light_peak_bf), ('recovery_bf', n_light_recovery_bf)]:
                if val is not None:
                    light_norm_sums_pdf[key].append(val)
        
        norm_hra_data.append([
            f'Avg (n={len(recordings)})',
            fmt(sum(light_norm_sums_pdf['baseline_bf']) / len(light_norm_sums_pdf['baseline_bf']) if light_norm_sums_pdf['baseline_bf'] else None, 1),
            fmt(sum(light_norm_sums_pdf['avg_bf']) / len(light_norm_sums_pdf['avg_bf']) if light_norm_sums_pdf['avg_bf'] else None, 1),
            fmt(sum(light_norm_sums_pdf['peak_bf']) / len(light_norm_sums_pdf['peak_bf']) if light_norm_sums_pdf['peak_bf'] else None, 1),
            fmt(sum(light_norm_sums_pdf['recovery_bf']) / len(light_norm_sums_pdf['recovery_bf']) if light_norm_sums_pdf['recovery_bf'] else None, 1),
        ])
        
        n_norm_hra_rows = len(norm_hra_data)
        norm_hra_row_height = min(0.05, 0.20 / n_norm_hra_rows)
        norm_hra_table_height = norm_hra_row_height * n_norm_hra_rows
        
        table_norm_hra = ax_hra.table(cellText=norm_hra_data, loc='upper center', cellLoc='center',
                                      colWidths=[0.22, 0.18, 0.18, 0.18, 0.18],
                                      bbox=[0.02, norm_hra_start_y - norm_hra_table_height - 0.02, 0.96, norm_hra_table_height])
        table_norm_hra.auto_set_font_size(False)
        table_norm_hra.set_fontsize(7)
        
        for (row, col), cell in table_norm_hra.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            if row == 0:
                cell.set_facecolor('#06B6D4')
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(norm_hra_data) - 1:
                cell.set_facecolor('#E5E7EB')
                cell.set_text_props(fontweight='bold')
        
        # Corrected HRV Section - lower half with more space
        ax_hrv = fig3.add_axes([0.12, 0.05, 0.76, 0.38])
        ax_hrv.axis('off')
        
        # HRV subtitle positioned clearly above table
        fig3.text(0.5, 0.40, 'Corrected Light-Induced Heart Rate Variability (HRV)', fontsize=11, fontweight='bold', 
                 color='#374151', ha='center')
        
        hrv_headers = ['Recording', 'ln(RMSSD70) corr.', 'ln(SDNN70) corr.', 'pNN50-70 corr. (%)']
        hrv_data = [hrv_headers]
        
        hrv_averages = data.get('light_hrv_averages', {}).get('averages', {})
        for rec in recordings:
            hrv_data.append([
                rec.get('name', '')[:18],
                fmt(rec.get('light_hrv_ln_rmssd70'), 3),
                fmt(rec.get('light_hrv_ln_sdnn70'), 3),
                fmt(rec.get('light_hrv_pnn50'), 1),
            ])
        
        hrv_data.append([
            f'Folder Average (n={len(recordings)})',
            fmt(hrv_averages.get('light_hrv_ln_rmssd70'), 3),
            fmt(hrv_averages.get('light_hrv_ln_sdnn70'), 3),
            fmt(hrv_averages.get('light_hrv_pnn50'), 1),
        ])
        
        n_hrv_rows = len(hrv_data)
        hrv_row_height = min(0.06, 0.28 / n_hrv_rows)
        hrv_table_height = hrv_row_height * n_hrv_rows
        
        table_hrv = ax_hrv.table(cellText=hrv_data, loc='upper center', cellLoc='center',
                                 colWidths=[0.30, 0.22, 0.22, 0.22],
                                 bbox=[0.02, 1.0 - hrv_table_height - 0.12, 0.96, hrv_table_height])
        table_hrv.auto_set_font_size(False)
        table_hrv.set_fontsize(8)
        
        for (row, col), cell in table_hrv.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            if row == 0:
                cell.set_facecolor('#06B6D4')
                cell.set_text_props(color='white', fontweight='bold')
            elif row == len(hrv_data) - 1:
                cell.set_facecolor('#E5E7EB')
                cell.set_text_props(fontweight='bold')
        
        pdf.savefig(fig3, bbox_inches='tight')
        plt.close(fig3)
        
        # Page 4: Recording Metadata
        fig4 = plt.figure(figsize=(11, 8.5))
        
        # Main title with more space
        fig4.text(0.5, 0.95, 'Recording Metadata', fontsize=14, fontweight='bold', ha='center')
        
        ax_meta = fig4.add_axes([0.02, 0.05, 0.96, 0.86])
        ax_meta.axis('off')
        
        meta_headers = ['Recording', 'Date', 'hSpO', 'hCO', 'Fusion', 'Drug Info', 'Light Stim', 'Notes']
        meta_data = [meta_headers]
        
        # Helper to wrap text with newlines instead of truncating
        def wrap_text(text, max_chars_per_line):
            if not text:
                return '—'
            text = str(text)
            if len(text) <= max_chars_per_line:
                return text
            # Split into multiple lines
            words = text.split()
            lines = []
            current_line = ""
            for word in words:
                if len(current_line) + len(word) + 1 <= max_chars_per_line:
                    current_line = current_line + " " + word if current_line else word
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word[:max_chars_per_line]  # Handle very long words
            if current_line:
                lines.append(current_line)
            return '\n'.join(lines[:3])  # Max 3 lines
        
        for rec in recordings:
            # Format drug info with wrapping
            if rec.get('has_drug') and rec.get('drug_info'):
                drug_parts = []
                for d in rec.get('drug_info', []):
                    drug_str = d.get('name', '')
                    if d.get('concentration'):
                        drug_str += f" ({d.get('concentration')})"
                    drug_parts.append(drug_str)
                drug_display = '\n'.join(drug_parts) if drug_parts else '—'
            else:
                drug_display = '—'
            
            # Format light stim info with full ISI
            if rec.get('has_light_stim'):
                isi = rec.get('isi_structure', '')
                light_display = f"{rec.get('stim_duration', '')}s stim\nISI: {isi}"
            else:
                light_display = '—'
            
            # Wrap notes/description
            notes = rec.get('recording_description', '')
            notes_display = wrap_text(notes, 25) if notes else '—'
            
            meta_data.append([
                rec.get('name', ''),
                rec.get('recording_date', '')[:10] if rec.get('recording_date') else '—',
                str(rec.get('hspo_age', '')) if rec.get('hspo_age') else '—',
                str(rec.get('hco_age', '')) if rec.get('hco_age') else '—',
                str(rec.get('fusion_age', '')) if rec.get('fusion_age') else '—',
                drug_display,
                light_display,
                notes_display,
            ])
        
        # Calculate row heights - need more space for wrapped text
        n_meta_rows = len(meta_data)
        # Check if any cell has multi-line content
        max_lines = 1
        for row in meta_data:
            for cell in row:
                lines = str(cell).count('\n') + 1
                max_lines = max(max_lines, lines)
        
        base_row_height = 0.04
        row_height = base_row_height * max(1, min(max_lines, 3))
        meta_table_height = min(0.85, row_height * n_meta_rows)
        
        table_meta = ax_meta.table(cellText=meta_data, loc='upper center', cellLoc='center',
                                   colWidths=[0.13, 0.09, 0.06, 0.06, 0.06, 0.15, 0.18, 0.22],
                                   bbox=[0.01, 1.0 - meta_table_height - 0.02, 0.98, meta_table_height])
        table_meta.auto_set_font_size(False)
        table_meta.set_fontsize(7)
        
        for (row, col), cell in table_meta.get_celld().items():
            cell.set_edgecolor('#d0d0d0')
            # Set cell alignment for wrapped text
            cell.set_text_props(verticalalignment='center')
            if row == 0:
                if col == 2:  # hSpO Age
                    cell.set_facecolor('#F59E0B')  # Amber
                elif col == 3:  # hCO Age
                    cell.set_facecolor('#8B5CF6')  # Purple
                elif col == 5:  # Drug Info
                    cell.set_facecolor('#059669')  # Green
                elif col == 6:  # Light Stim Info
                    cell.set_facecolor('#06B6D4')  # Cyan
                else:
                    cell.set_facecolor('#374151')
                cell.set_text_props(color='white', fontweight='bold', fontsize=7, verticalalignment='center')
        
        pdf.savefig(fig4, bbox_inches='tight')
        plt.close(fig4)
    
    output.seek(0)
    filename = f"{request.folder_name}_comparison.pdf".replace(' ', '_')
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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
            """Wrap text to fit in table cell, breaking on spaces and dashes."""
            if not text or len(str(text)) <= max_chars:
                return str(text) if text else ''
            text = str(text)
            # Replace dashes with dash+space for better breaking
            text = text.replace(' - ', '\n')
            # If still too long, do word-based wrapping
            if len(text) > max_chars and '\n' not in text:
                words = text.split(' ')
                lines = []
                current_line = ""
                for word in words:
                    # If single word is too long, break it
                    if len(word) > max_chars:
                        if current_line:
                            lines.append(current_line)
                            current_line = ""
                        # Break long word at max_chars
                        while len(word) > max_chars:
                            lines.append(word[:max_chars-1] + '-')
                            word = word[max_chars-1:]
                        current_line = word
                    elif len(current_line) + len(word) + 1 <= max_chars:
                        current_line = f"{current_line} {word}".strip()
                    else:
                        if current_line:
                            lines.append(current_line)
                        current_line = word
                if current_line:
                    lines.append(current_line)
                return '\n'.join(lines)
            return text
        
        # LEFT COLUMN: Analysis Summary + Organoid/Cell Info
        ax_left = fig1.add_axes([0.05, 0.12, 0.42, 0.7])
        ax_left.axis('off')
        
        left_rows = []
        left_rows.append(['ANALYSIS', ''])  # Shortened title
        
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
                            trans_parts.append(f"{trans_amount}µL")
                        if trans_days is not None:
                            trans_parts.append(f"D{trans_days}")
                        
                        left_rows.append(['  Transf.', ' - '.join(trans_parts)])
            
            if request.fusion_date or request.days_since_fusion is not None:
                fusion_value = request.fusion_date or ''
                if request.days_since_fusion is not None:
                    fusion_value = f"{fusion_value} (D{request.days_since_fusion})" if fusion_value else f"D{request.days_since_fusion}"
                left_rows.append(['Fusion Date', fusion_value])
            
            if request.recording_description:
                left_rows.append(['Description', wrap_text(request.recording_description, 25)])
        
        # Create left table with better text fitting
        if left_rows:
            # Use smaller max chars for wrapping to prevent overflow
            wrapped_left = [[wrap_text(m, 14), wrap_text(v, 22)] for m, v in left_rows]
            table_left = ax_left.table(
                cellText=wrapped_left,
                loc='upper center',
                cellLoc='left',
                colWidths=[0.35, 0.65]
            )
            table_left.auto_set_font_size(False)
            table_left.set_fontsize(6.5)
            table_left.scale(1.0, 1.2)
            
            # First pass: calculate max lines per row
            row_max_lines = {}
            for (row, col), cell in table_left.get_celld().items():
                text = cell.get_text().get_text()
                num_lines = text.count('\n') + 1 if text else 1
                if row not in row_max_lines:
                    row_max_lines[row] = num_lines
                else:
                    row_max_lines[row] = max(row_max_lines[row], num_lines)
            
            # Second pass: apply heights and styling
            base_height = 0.028  # Base height for single line
            for (row, col), cell in table_left.get_celld().items():
                cell.set_edgecolor('#e0e0e0')
                text = cell.get_text().get_text()
                
                # Set row height based on max lines in that row
                num_lines = row_max_lines.get(row, 1)
                cell_height = base_height * max(num_lines, 1)
                
                if text in ['ANALYSIS', 'SAMPLE INFO']:
                    cell.set_text_props(fontweight='bold', color='#1a1a1a', fontsize=7)
                    cell.set_facecolor('#f0f0f0')
                    cell.set_height(base_height)
                elif text == '':
                    cell.set_facecolor('white')
                    cell.set_height(0.012)
                else:
                    cell.set_facecolor('white')
                    cell.set_height(cell_height)
                    if col == 0:
                        cell.set_text_props(color='#6b7280', fontsize=6.5)
                    else:
                        cell.set_text_props(color='#1f2937', fontsize=6.5)
        
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
            right_rows.append(['ln(RMSSD70)', f"{ln_rmssd:.3f}" if ln_rmssd is not None else '—'])
            right_rows.append(['ln(SDNN70)', f"{np.log(sdnn):.3f}" if sdnn and sdnn > 0 else '—'])
            right_rows.append(['pNN50-70', f"{pnn50:.1f}%" if pnn50 is not None else '—'])
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
                    right_rows.append(['ln(RMSSD70)', f"{drug_hrv_data.get('ln_rmssd70', 0):.3f}" if drug_hrv_data.get('ln_rmssd70') is not None else '—'])
                    sdnn_d = drug_hrv_data.get('sdnn')
                    right_rows.append(['ln(SDNN70)', f"{np.log(sdnn_d):.3f}" if sdnn_d and sdnn_d > 0 else '—'])
                    right_rows.append(['pNN50-70', f"{drug_hrv_data.get('pnn50', 0):.1f}%" if drug_hrv_data.get('pnn50') is not None else '—'])
        
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
                
                right_rows.append(['ln(RMSSD70) corr.', f"{ln_rmssd_det:.3f}" if ln_rmssd_det is not None else '—'])
                right_rows.append(['ln(SDNN70) corr.', f"{ln_sdnn_det:.3f}" if ln_sdnn_det is not None else '—'])
                right_rows.append(['pNN50-70 corr.', f"{pnn50_det:.1f}%" if pnn50_det is not None else '—'])
        
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
