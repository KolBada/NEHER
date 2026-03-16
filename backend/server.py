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
import export_utils
import mea_export_utils

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
    light_enabled: Optional[bool] = True  # Whether light stim is enabled
    light_stim_count: Optional[int] = 0  # Number of stims detected
    light_params: Optional[dict] = None  # Light stimulation parameters (duration, ISI, etc.)
    baseline_enabled: Optional[bool] = True  # Whether baseline is enabled
    drug_readout_enabled: Optional[bool] = False  # Whether drug readout is enabled
    drug_readout_settings: Optional[dict] = None  # Drug readout settings
    summary: Optional[dict] = None
    filename: str = "analysis"
    recording_name: Optional[str] = None
    drug_used: Optional[str] = None
    all_drugs: Optional[List[dict]] = None  # Full drug details with start/delay/end
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


# MEA-specific models
class MEARecordingSaveRequest(BaseModel):
    """Request model for saving an MEA well recording"""
    folder_id: str
    name: str
    well_id: str
    plate_id: str
    source_type: str = "MEA"
    
    # MEA-specific data
    active_electrodes: List[str]
    electrode_filter: dict
    spike_bin_s: int = 5
    burst_bin_s: int = 30
    
    # Config
    config: dict
    
    # Computed metrics
    spike_rate_bins: List[dict]
    burst_rate_bins: List[dict]
    baseline_spike_hz: Optional[float] = None
    baseline_burst_bpm: Optional[float] = None
    stim_metrics: Optional[List[dict]] = None
    drug_metrics: Optional[dict] = None
    correlation: Optional[dict] = None
    
    # Raw data for re-plotting
    spikes: List[dict]
    electrode_bursts: List[dict]
    duration_s: float
    total_spikes: int
    n_electrodes: int
    n_active_electrodes: int


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


@api_router.post("/upload/fuse")
async def fuse_and_upload_files(files: List[UploadFile] = File(...)):
    """
    Upload multiple ABF files and fuse them into a single recording.
    Files are concatenated in the order they are received.
    Maximum 5 files can be fused together.
    """
    import pyabf
    import gc
    
    MAX_FILES = 5
    
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} files can be fused together. Got {len(files)}.")
    
    if len(files) < 1:
        raise HTTPException(400, "At least one file is required.")
    
    # If only one file, use the regular upload logic
    if len(files) == 1:
        uploaded = files[0]
        fname = uploaded.filename or ''
        if not fname.lower().endswith('.abf'):
            raise HTTPException(400, f"Only .abf files are supported. Got: '{fname}'.")
        
        session_id = str(uuid.uuid4())
        sessions[session_id] = {}
        file_id = str(uuid.uuid4())
        
        content = await uploaded.read()
        tmp_path = None
        
        try:
            with tempfile.NamedTemporaryFile(suffix='.abf', delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
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
            
            return {
                'session_id': session_id,
                'files': [{
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
                    'n_beats_detected': len(beat_indices),
                    'fused_from': [uploaded.filename]
                }]
            }
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass
            gc.collect()
    
    # Multiple files - fuse them together
    session_id = str(uuid.uuid4())
    sessions[session_id] = {}
    file_id = str(uuid.uuid4())
    
    all_traces = []
    all_times = []
    fused_filenames = []
    sample_rate = None
    time_offset = 0.0
    
    for i, uploaded in enumerate(files):
        fname = uploaded.filename or f'file_{i}.abf'
        if not fname.lower().endswith('.abf'):
            raise HTTPException(400, f"Only .abf files are supported. Got: '{fname}'.")
        
        fused_filenames.append(fname)
        content = await uploaded.read()
        tmp_path = None
        
        try:
            with tempfile.NamedTemporaryFile(suffix='.abf', delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
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
            file_sample_rate = abf.dataRate
            
            # Check sample rate consistency
            if sample_rate is None:
                sample_rate = file_sample_rate
            elif abs(sample_rate - file_sample_rate) > 0.1:
                logging.warning(f"Sample rate mismatch: file {i+1} has {file_sample_rate} Hz vs {sample_rate} Hz. Using first file's rate.")
            
            # Handle multi-sweep within this file
            if abf.sweepCount > 1:
                file_traces = [trace]
                file_times = [times]
                sweep_offset = times[-1] + 1.0 / file_sample_rate
                for sw in range(1, abf.sweepCount):
                    abf.setSweep(sw, channel=0)
                    file_traces.append(abf.sweepY.copy().astype(np.float64))
                    sw_times = abf.sweepX.copy().astype(np.float64) + sweep_offset
                    file_times.append(sw_times)
                    sweep_offset = sw_times[-1] + 1.0 / file_sample_rate
                trace = np.concatenate(file_traces)
                times = np.concatenate(file_times)
                del file_traces, file_times
                gc.collect()
            
            # Apply time offset for fusion
            times = times + time_offset
            
            all_traces.append(trace)
            all_times.append(times)
            
            # Update offset for next file - add small gap (1 sample)
            time_offset = times[-1] + 1.0 / sample_rate
            
            logging.info(f"Loaded file {i+1}/{len(files)} '{fname}': {len(trace)} samples, ends at {times[-1]:.2f}s")
            
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except:
                    pass
    
    # Concatenate all traces
    fused_trace = np.concatenate(all_traces)
    fused_times = np.concatenate(all_times)
    del all_traces, all_times
    gc.collect()
    
    # Generate fused filename - [name1]_[name2].abf (without _FUSED suffix)
    base_names = [fn.replace('.abf', '').replace('.ABF', '') for fn in fused_filenames]
    if len(base_names) <= 2:
        fused_filename = '_'.join(base_names) + '.abf'
    else:
        fused_filename = '_'.join(base_names[:2]) + f'_+{len(base_names)-2}more.abf'
    
    sessions[session_id][file_id] = {
        'filename': fused_filename,
        'trace': fused_trace,
        'times': fused_times,
        'sample_rate': sample_rate,
        'fused_from': fused_filenames,
    }
    
    # Decimate and detect beats
    dec_times, dec_voltages = analysis.decimate_trace(fused_times, fused_trace)
    beat_indices = analysis.detect_beats(fused_trace, sample_rate)
    beat_times_sec = [float(fused_times[i]) for i in beat_indices if i < len(fused_times)]
    beat_voltages = [float(fused_trace[i]) for i in beat_indices if i < len(fused_trace)]
    
    signal_stats = {
        'min': float(np.min(fused_trace)),
        'max': float(np.max(fused_trace)),
        'mean': float(np.mean(fused_trace)),
        'std': float(np.std(fused_trace))
    }
    
    logging.info(f"Fused {len(files)} files into '{fused_filename}': {len(fused_trace)} samples, {len(beat_indices)} beats, duration {fused_times[-1]:.2f}s")
    
    return {
        'session_id': session_id,
        'files': [{
            'file_id': file_id,
            'filename': fused_filename,
            'sample_rate': sample_rate,
            'duration_sec': float(len(fused_trace) / sample_rate),
            'n_samples': len(fused_trace),
            'n_channels': 1,
            'n_sweeps': len(files),
            'trace_times': dec_times,
            'trace_voltages': dec_voltages,
            'beats': [{'time_sec': t, 'voltage': v} for t, v in zip(beat_times_sec, beat_voltages)],
            'signal_stats': signal_stats,
            'n_beats_detected': len(beat_indices),
            'fused_from': fused_filenames,
            'is_fused': True
        }]
    }


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
        'n_total': len(beat_times_sec),  # Total beats detected
        'n_removed': int(np.sum(~mask_arr)),  # Beats removed by filter
        'n_kept': len(beat_times_sec) - int(np.sum(~mask_arr)),  # Kept = Detected - Removed
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
    
    # Fix n_kept to ensure Detected = Kept + Removed for saved recordings
    if recording.get('analysis_state') and recording['analysis_state'].get('metrics'):
        metrics = recording['analysis_state']['metrics']
        if 'n_total' in metrics and 'n_removed' in metrics:
            # Recalculate n_kept to ensure the equation holds
            metrics['n_kept'] = metrics['n_total'] - metrics['n_removed']
    
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
    excluded_recording_ids: list = []  # List of recording IDs to exclude from export
    source_type: str = None  # 'SSE' or 'MEA' - which type to export


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
    # Check for baseline cardiac arrest
    baseline_cardiac_arrest = state.get('baselineCardiacArrest', False)
    
    if baseline_enabled:
        if baseline_cardiac_arrest:
            # Cardiac arrest: BF = 0, HRV metrics = None (will display as —)
            result['baseline_bf'] = 0
            result['baseline_ln_rmssd70'] = None
            result['baseline_ln_sdnn70'] = None
            result['baseline_pnn50'] = None
        else:
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
    result['baseline_cardiac_arrest'] = baseline_cardiac_arrest
    
    # Spontaneous Activity - Drug metrics
    # Now supports multiple drugs via perDrug settings
    drug_readout = state.get('drugReadoutSettings') or state.get('drug_readout', {})
    hrv_windows = hrv_results.get('windows', [])
    per_minute_data = state.get('perMinuteData') or state.get('per_minute_data', [])
    selected_drugs = state.get('selectedDrugs', [])
    drug_settings_all = state.get('drugSettings', {})
    
    # Initialize default drug metrics (for first drug)
    result['drug_bf'] = None
    result['drug_ln_rmssd70'] = None
    result['drug_ln_sdnn70'] = None
    result['drug_pnn50'] = None
    
    # Store per-drug metrics for multiple drugs
    result['per_drug_metrics'] = []
    
    # Get perDrug settings
    per_drug_settings = drug_readout.get('perDrug', {}) if drug_readout else {}
    
    # Process each drug
    for drug_idx, drug_key in enumerate(selected_drugs):
        drug_settings = drug_settings_all.get(drug_key, {})
        drug_name = drug_settings.get('name', drug_key.replace('_', ' ').title())
        perf_start = drug_settings.get('perfusionStart', 3) or 0
        perf_delay = drug_settings.get('perfusionTime', 3) or 0
        
        # Get per-drug readout settings
        this_drug_readout = per_drug_settings.get(drug_key, {})
        
        # Check if this drug's readout is enabled
        is_enabled = False
        if drug_idx == 0:
            is_enabled = drug_readout.get('enableHrvReadout') or drug_readout.get('enableBfReadout')
        else:
            is_enabled = this_drug_readout.get('enabled', False)
        
        if not is_enabled:
            continue
        
        drug_bf_minute_str = this_drug_readout.get('bfReadoutMinute')
        drug_hrv_minute_str = this_drug_readout.get('hrvReadoutMinute')
        
        # Calculate actual minutes (input + perf_start + perf_delay)
        drug_bf_minute = None
        drug_hrv_minute = None
        try:
            if drug_bf_minute_str not in (None, ''):
                drug_bf_minute = int(float(drug_bf_minute_str) + float(perf_start) + float(perf_delay))
        except (ValueError, TypeError):
            pass
        try:
            if drug_hrv_minute_str not in (None, ''):
                drug_hrv_minute = int(float(drug_hrv_minute_str) + float(perf_start) + float(perf_delay))
        except (ValueError, TypeError):
            pass
        
        drug_metrics = {
            'drug_key': drug_key,
            'drug_name': drug_name,
            'drug_bf': None,
            'drug_ln_rmssd70': None,
            'drug_ln_sdnn70': None,
            'drug_pnn50': None,
            'perf_time': drug_bf_minute_str,  # Store the input perfusion time for metadata display
            'cardiac_arrest': this_drug_readout.get('cardiacArrest', False),  # Store cardiac arrest flag
        }
        
        # Check for cardiac arrest - if true, set BF to 0 and HRV to None
        if this_drug_readout.get('cardiacArrest', False):
            drug_metrics['drug_bf'] = 0
            # HRV metrics remain None (will display as —)
        else:
            # Get drug BF from per_minute_data
            if drug_bf_minute is not None and per_minute_data:
                for pm in per_minute_data:
                    minute_val = pm.get('minute', '0')
                    try:
                        minute_num = int(str(minute_val).split('-')[0])
                        if minute_num == drug_bf_minute:
                            drug_metrics['drug_bf'] = pm.get('avg_bf') or pm.get('mean_bf')
                            break
                    except (ValueError, TypeError, AttributeError):
                        pass
            
            # Get drug HRV from hrv_windows
            if drug_hrv_minute is not None and hrv_windows:
                for w in hrv_windows:
                    if w.get('minute') == drug_hrv_minute:
                        drug_metrics['drug_ln_rmssd70'] = w.get('ln_rmssd70')
                        sdnn = w.get('sdnn')
                        drug_metrics['drug_ln_sdnn70'] = np.log(sdnn) if sdnn and sdnn > 0 else None
                        drug_metrics['drug_pnn50'] = w.get('pnn50')
                        break
        
        result['per_drug_metrics'].append(drug_metrics)
        
        # Set first drug metrics as default (backwards compatibility)
        if drug_idx == 0 or (result['drug_bf'] is None and drug_metrics['drug_bf'] is not None):
            result['drug_bf'] = drug_metrics['drug_bf']
            result['drug_ln_rmssd70'] = drug_metrics['drug_ln_rmssd70']
            result['drug_ln_sdnn70'] = drug_metrics['drug_ln_sdnn70']
            result['drug_pnn50'] = drug_metrics['drug_pnn50']
    
    # Fallback to old logic if no drugs processed via perDrug
    if not result['per_drug_metrics'] and drug_readout and (drug_readout.get('enableHrvReadout') or drug_readout.get('enableBfReadout')):
        # Frontend uses 'bfReadoutMinute' and 'hrvReadoutMinute' (as strings)
        drug_bf_minute_str = drug_readout.get('bfReadoutMinute') or drug_readout.get('bfMinute') or drug_readout.get('bf_minute')
        drug_hrv_minute_str = drug_readout.get('hrvReadoutMinute') or drug_readout.get('hrvMinute') or drug_readout.get('hrv_minute')
        
        # Get perfusion start/delay from first drug
        perf_start = 0
        perf_delay = 0
        if selected_drugs and drug_settings_all:
            first_drug = drug_settings_all.get(selected_drugs[0], {})
            perf_start = first_drug.get('perfusionStart', 3) or 0
            perf_delay = first_drug.get('perfusionTime', 3) or 0
        
        # Convert to int with perfusion offset
        drug_bf_minute = None
        drug_hrv_minute = None
        try:
            if drug_bf_minute_str not in (None, ''):
                drug_bf_minute = int(float(drug_bf_minute_str) + float(perf_start) + float(perf_delay))
        except (ValueError, TypeError):
            pass
        try:
            if drug_hrv_minute_str not in (None, ''):
                drug_hrv_minute = int(float(drug_hrv_minute_str) + float(perf_start) + float(perf_delay))
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
            result['drug_hrv_readout_minute'] = drug_hrv_minute  # Store HRV readout minute
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
    for key in ['light_baseline_bf', 'light_avg_bf', 'light_avg_norm', 'light_peak_bf', 'light_peak_norm', 
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
            result['light_avg_norm'] = mean_metrics.get('avg_norm_pct')
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
                result['light_stim_count'] = len(per_stim)  # Add stim count
        elif per_stim:
            # Fallback: compute from per_stim if mean_metrics not present
            valid_resp = [r for r in per_stim if r is not None and isinstance(r, dict)]
            if valid_resp:
                result['light_stim_count'] = len(valid_resp)  # Add stim count
                result['light_baseline_bf'] = light_response.get('baseline_bf') or baseline.get('baseline_bf')
                
                avg_bf_vals = [r.get('avg_bf') for r in valid_resp if r.get('avg_bf') is not None]
                result['light_avg_bf'] = float(np.mean(avg_bf_vals)) if avg_bf_vals else None
                
                avg_norm_vals = [r.get('avg_norm_pct') for r in valid_resp if r.get('avg_norm_pct') is not None]
                result['light_avg_norm'] = float(np.mean(avg_norm_vals)) if avg_norm_vals else None
                
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
    
    # Per-Stim HRA data for comparison tables
    result['per_stim_hra'] = []
    if light_response and isinstance(light_response, dict):
        per_stim = light_response.get('per_stim', [])
        baseline_bf = light_response.get('baseline_bf') or result.get('light_baseline_bf')
        for i, stim in enumerate(per_stim):
            if stim is not None and isinstance(stim, dict):
                result['per_stim_hra'].append({
                    'stim_index': i + 1,
                    'baseline_bf': baseline_bf,
                    'avg_bf': stim.get('avg_bf'),
                    'avg_norm_pct': stim.get('avg_norm_pct'),
                    'peak_bf': stim.get('peak_bf'),
                    'peak_norm': stim.get('peak_norm_pct'),
                    'ttp': stim.get('time_to_peak_sec'),
                    'recovery_bf': stim.get('bf_end'),
                    'recovery_pct': stim.get('bf_end_pct'),
                    'amplitude': stim.get('amplitude'),
                    'roc': stim.get('rate_of_change'),
                })
            else:
                result['per_stim_hra'].append(None)
    
    # Per-Stim HRV data for comparison tables
    result['per_stim_hrv'] = []
    if light_hrv_detrended and light_hrv_detrended.get('per_pulse'):
        per_pulse = light_hrv_detrended.get('per_pulse', [])
        for i, pulse in enumerate(per_pulse):
            if pulse is not None and isinstance(pulse, dict):
                result['per_stim_hrv'].append({
                    'stim_index': i + 1,
                    'ln_rmssd70': pulse.get('ln_rmssd70_detrended'),
                    'ln_sdnn70': pulse.get('ln_sdnn70_detrended'),
                    'pnn50': pulse.get('pnn50_detrended'),
                })
            else:
                result['per_stim_hrv'].append(None)
    
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


def extract_mea_comparison_metrics(recording: dict) -> dict:
    """Extract MEA comparison metrics from a recording's analysis_state.
    
    Note: Frontend saves with camelCase keys, so we need to check both cases.
    """
    state = recording.get('analysis_state', {})
    
    # Basic info
    result = {
        'id': recording.get('id', ''),
        'name': recording.get('name', ''),
        'filename': recording.get('filename', ''),
        'source_type': 'MEA',
    }
    
    # Recording metadata - check both camelCase and snake_case
    result['recording_date'] = state.get('recordingDate') or state.get('recording_date', '')
    result['recording_description'] = state.get('recordingDescription') or state.get('recording_description', '')
    result['fusion_date'] = state.get('fusionDate') or state.get('fusion_date', '')
    result['well_id'] = state.get('well_id') or state.get('selectedWell', '')
    result['plate_id'] = state.get('plate_id', '')
    
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
    
    # Drug info
    selected_drugs = state.get('selectedDrugs') or state.get('selected_drugs', [])
    drug_settings = state.get('drugSettings') or state.get('drug_settings', {})
    drug_enabled = state.get('drugEnabled', False)
    drug_perf_time = state.get('drugPerfTime', 3)
    drug_readout_minute = state.get('drugReadoutMinute', 3)
    
    # Default concentrations for common drugs (fallback if not set)
    # These match the frontend DRUG_CONFIG defaults
    default_concentrations = {
        'tetrodotoxin': '1',
        'isoproterenol': '1',
        'acetylcholine': '1',
        'propranolol': '5',
        'nepicastat': '30',
        'ruxolitinib': '2',
        'carbachol': '10',
        'nifedipine': '1',
        'e4031': '1',
        'dofetilide': '0.01',
    }
    
    result['drug_info'] = []
    result['has_drug'] = drug_enabled and bool(selected_drugs)
    
    if selected_drugs:
        for drug in selected_drugs:
            settings = drug_settings.get(drug, {})
            concentration = settings.get('concentration')
            # Use default concentration if not set
            if concentration is None or concentration == '':
                concentration = default_concentrations.get(drug, '')
            result['drug_info'].append({
                'name': drug,
                'concentration': concentration,
                'perf_time': drug_readout_minute,
            })
    
    if result['drug_info']:
        result['drug_names'] = ', '.join([d['name'] for d in result['drug_info']])
        result['drug_concentrations'] = ', '.join([str(d['concentration']) for d in result['drug_info'] if d['concentration']])
    else:
        result['drug_names'] = ''
        result['drug_concentrations'] = ''
    
    # Light stim info
    light_enabled = state.get('lightEnabled', False)
    light_params = state.get('lightParams') or state.get('light_params', {})
    light_pulses = state.get('lightPulses') or state.get('light_pulses', [])
    
    result['has_light_stim'] = light_enabled and bool(light_pulses)
    result['light_stim_count'] = len(light_pulses) if light_pulses else 0
    
    # Use original search parameters from lightParams
    pulse_duration = light_params.get('pulseDuration', light_params.get('pulse_duration_sec', 20)) if light_params else 20
    result['stim_duration'] = pulse_duration
    
    # Get ISI structure
    interval_setting = light_params.get('interval', 'decreasing') if light_params else 'decreasing'
    if interval_setting == 'decreasing':
        result['isi_structure'] = '60s-30s-20s-10s'
    elif interval_setting == 'constant':
        result['isi_structure'] = 'constant'
    else:
        result['isi_structure'] = interval_setting
    
    # MEA-specific spontaneous activity metrics
    # ALWAYS recompute from bins/raw data to ensure consistency with current settings
    # Do NOT use pre-computed values (baseline_spike_hz, etc.) as they may be stale
    baseline_spike_hz = None
    baseline_burst_bpm = None
    drug_spike_hz = None
    drug_burst_bpm = None
    
    # Baseline settings
    baseline_minute = state.get('baselineMinute', 1)
    baseline_enabled = state.get('baselineEnabled', True)
    
    # Drug settings
    drug_enabled = state.get('drugEnabled', False)
    selected_drugs = state.get('selectedDrugs') or state.get('selected_drugs', [])
    drug_perf_time = state.get('drugPerfTime') or state.get('drug_perf_time', 3)
    drug_readout_minute = state.get('drugReadoutMinute') or state.get('drug_readout_minute', 5)
    
    # Try to compute from bins first
    spike_bins = state.get('spike_rate_bins', [])
    burst_bins = state.get('burst_rate_bins', [])
    
    if spike_bins and baseline_enabled:
        # baseline_minute is the START of the range
        # baseline_minute=1 means window 60-120s (1-2 min)
        baseline_start = baseline_minute * 60
        baseline_end = (baseline_minute + 1) * 60
        baseline_spike_vals = [b.get('spike_rate_hz', 0) for b in spike_bins 
                               if b.get('time', 0) >= baseline_start and b.get('time', 0) < baseline_end]
        if baseline_spike_vals:
            baseline_spike_hz = float(np.mean(baseline_spike_vals))
    
    if burst_bins and baseline_enabled:
        baseline_start = baseline_minute * 60
        baseline_end = (baseline_minute + 1) * 60
        baseline_burst_vals = [b.get('burst_rate_bpm', 0) for b in burst_bins 
                               if b.get('time', 0) >= baseline_start and b.get('time', 0) < baseline_end]
        if baseline_burst_vals:
            baseline_burst_bpm = float(np.mean(baseline_burst_vals))
    
    # Drug metrics - compute from bins
    # drug_readout_minute is the "Perf. Time" - duration after drug addition
    # Total time = drugPerfTime + drugReadoutMinute (e.g., 3 + 5 = 8)
    # The window should be (total - 1) * 60 to total * 60 to match frontend
    # e.g., if total=8, window is 7*60=420s to 8*60=480s (minute 7-8 range)
    if drug_enabled and selected_drugs and spike_bins:
        drug_readout_min = drug_perf_time + drug_readout_minute
        drug_start_time = (drug_readout_min - 1) * 60
        drug_end_time = drug_readout_min * 60
        drug_spike_vals = [b.get('spike_rate_hz', 0) for b in spike_bins 
                          if b.get('time', 0) >= drug_start_time and b.get('time', 0) < drug_end_time]
        if drug_spike_vals:
            drug_spike_hz = float(np.mean(drug_spike_vals))
    
    if drug_enabled and selected_drugs and burst_bins:
        drug_readout_min = drug_perf_time + drug_readout_minute
        drug_start_time = (drug_readout_min - 1) * 60
        drug_end_time = drug_readout_min * 60
        drug_burst_vals = [b.get('burst_rate_bpm', 0) for b in burst_bins 
                          if b.get('time', 0) >= drug_start_time and b.get('time', 0) < drug_end_time]
        if drug_burst_vals:
            drug_burst_bpm = float(np.mean(drug_burst_vals))
    
    # Fallback 2: If still no values, compute from raw spikes/bursts
    if baseline_spike_hz is None and baseline_enabled:
        spikes = state.get('spikes', [])
        electrode_bursts = state.get('electrode_bursts', [])
        duration_s = state.get('duration_s', 0)
        
        if spikes and duration_s > 0:
            # Compute spike rate from raw spikes for baseline window
            # Spikes use 'timestamp' field, not 'time_s'
            # baseline_minute is the START of the range (e.g., 1 means 1-2 min)
            baseline_start = baseline_minute * 60
            baseline_end = (baseline_minute + 1) * 60
            baseline_spikes = [s for s in spikes if baseline_start <= s.get('timestamp', s.get('time_s', 0)) < baseline_end]
            if baseline_end > baseline_start:
                baseline_spike_hz = len(baseline_spikes) / (baseline_end - baseline_start)
        
        if electrode_bursts:
            # Compute burst rate from raw bursts for baseline window
            # Bursts use 'start_time' or 'start_time_s'
            baseline_start = baseline_minute * 60
            baseline_end = (baseline_minute + 1) * 60
            baseline_bursts = [b for b in electrode_bursts if baseline_start <= b.get('start_time', b.get('start_time_s', 0)) < baseline_end]
            if baseline_end > baseline_start:
                baseline_burst_bpm = len(baseline_bursts) / ((baseline_end - baseline_start) / 60)
        
        # Drug metrics from raw data
        if drug_enabled and selected_drugs and spikes:
            drug_readout_min = drug_perf_time + drug_readout_minute
            drug_start_time = (drug_readout_min - 1) * 60
            drug_end_time = drug_readout_min * 60
            drug_spikes = [s for s in spikes if drug_start_time <= s.get('timestamp', s.get('time_s', 0)) < drug_end_time]
            if drug_end_time > drug_start_time:
                drug_spike_hz = len(drug_spikes) / (drug_end_time - drug_start_time)
        
        if drug_enabled and selected_drugs and electrode_bursts:
            drug_readout_min = drug_perf_time + drug_readout_minute
            drug_start_time = (drug_readout_min - 1) * 60
            drug_end_time = drug_readout_min * 60
            drug_bursts = [b for b in electrode_bursts if drug_start_time <= b.get('start_time', b.get('start_time_s', 0)) < drug_end_time]
            if drug_end_time > drug_start_time:
                drug_burst_bpm = len(drug_bursts) / ((drug_end_time - drug_start_time) / 60)
    
    result['baseline_spike_hz'] = baseline_spike_hz
    result['baseline_burst_bpm'] = baseline_burst_bpm
    result['drug_spike_hz'] = drug_spike_hz
    result['drug_burst_bpm'] = drug_burst_bpm
    result['baseline_enabled'] = baseline_enabled
    
    # Light stimulus metrics (from lightMetrics)
    light_metrics = state.get('lightMetrics') or {}
    avg_metrics = light_metrics.get('avg', {})
    per_stim = light_metrics.get('perStim', [])
    
    # Light baseline and averages
    result['light_baseline_spike_hz'] = avg_metrics.get('baselineSpikeHz')
    result['light_avg_spike_hz'] = avg_metrics.get('avgSpikeHz')
    result['light_max_spike_hz'] = avg_metrics.get('maxSpikeHz')
    result['light_spike_change_pct'] = avg_metrics.get('spikeChangePct')
    result['light_peak_spike_change_pct'] = avg_metrics.get('maxSpikeChangePct')
    result['light_spike_time_to_peak'] = avg_metrics.get('spikeTimeToPeak')
    
    result['light_baseline_burst_bpm'] = avg_metrics.get('baselineBurstBpm')
    result['light_avg_burst_bpm'] = avg_metrics.get('avgBurstBpm')
    result['light_max_burst_bpm'] = avg_metrics.get('maxBurstBpm')
    result['light_burst_change_pct'] = avg_metrics.get('burstChangePct')
    result['light_peak_burst_change_pct'] = avg_metrics.get('maxBurstChangePct')
    result['light_burst_time_to_peak'] = avg_metrics.get('burstTimeToPeak')
    
    # Fallback: Compute light metrics from raw data if not available
    if result['light_baseline_spike_hz'] is None and light_pulses and light_enabled:
        spikes = state.get('spikes', [])
        electrode_bursts = state.get('electrode_bursts', [])
        
        if spikes and light_pulses:
            # Get first light pulse start time
            first_pulse_start = light_pulses[0].get('start_sec', 0)
            
            # Compute baseline: -2 to -1 minute before first stim
            bl_start = first_pulse_start - 120
            bl_end = first_pulse_start - 60
            
            baseline_spikes = [s for s in spikes if bl_start <= s.get('timestamp', s.get('time_s', 0)) < bl_end]
            if bl_end > bl_start:
                result['light_baseline_spike_hz'] = len(baseline_spikes) / (bl_end - bl_start)
            
            if electrode_bursts:
                baseline_bursts = [b for b in electrode_bursts if bl_start <= b.get('start_time', b.get('start_time_s', 0)) < bl_end]
                if bl_end > bl_start:
                    result['light_baseline_burst_bpm'] = len(baseline_bursts) / ((bl_end - bl_start) / 60)
            
            # Compute avg and max across all stims
            all_stim_spike_rates = []
            max_spike_rates = []
            all_stim_burst_rates = []
            max_burst_rates = []
            
            for pulse in light_pulses:
                pulse_start = pulse.get('start_sec', 0)
                pulse_end = pulse.get('end_sec', pulse_start + 20)
                
                # Spikes during this pulse
                pulse_spikes = [s for s in spikes if pulse_start <= s.get('timestamp', s.get('time_s', 0)) < pulse_end]
                duration = pulse_end - pulse_start
                if duration > 0:
                    rate = len(pulse_spikes) / duration
                    all_stim_spike_rates.append(rate)
                    max_spike_rates.append(rate)  # For simplicity, same as avg
                
                # Bursts during this pulse
                if electrode_bursts:
                    pulse_bursts = [b for b in electrode_bursts if pulse_start <= b.get('start_time', b.get('start_time_s', 0)) < pulse_end]
                    if duration > 0:
                        burst_rate = len(pulse_bursts) / (duration / 60)
                        all_stim_burst_rates.append(burst_rate)
                        max_burst_rates.append(burst_rate)
            
            if all_stim_spike_rates:
                result['light_avg_spike_hz'] = float(np.mean(all_stim_spike_rates))
                result['light_max_spike_hz'] = float(max(all_stim_spike_rates))
                
                # Calculate change percentages
                if result['light_baseline_spike_hz'] and result['light_baseline_spike_hz'] > 0:
                    result['light_spike_change_pct'] = 100 * (result['light_avg_spike_hz'] - result['light_baseline_spike_hz']) / result['light_baseline_spike_hz']
                    result['light_peak_spike_change_pct'] = 100 * (result['light_max_spike_hz'] - result['light_baseline_spike_hz']) / result['light_baseline_spike_hz']
            
            if all_stim_burst_rates:
                result['light_avg_burst_bpm'] = float(np.mean(all_stim_burst_rates))
                result['light_max_burst_bpm'] = float(max(all_stim_burst_rates))
                
                # Calculate change percentages
                if result['light_baseline_burst_bpm'] and result['light_baseline_burst_bpm'] > 0:
                    result['light_burst_change_pct'] = 100 * (result['light_avg_burst_bpm'] - result['light_baseline_burst_bpm']) / result['light_baseline_burst_bpm']
                    result['light_peak_burst_change_pct'] = 100 * (result['light_max_burst_bpm'] - result['light_baseline_burst_bpm']) / result['light_baseline_burst_bpm']
    
    # Per-stim data for charts
    result['per_stim_spike'] = []
    result['per_stim_burst'] = []
    
    for i, stim in enumerate(per_stim):
        if stim:
            result['per_stim_spike'].append({
                'stim_index': i + 1,
                'baseline': stim.get('baselineSpikeHz'),
                'avg': stim.get('avgSpikeHz'),
                'max': stim.get('maxSpikeHz'),
                'change_pct': stim.get('spikeChangePct'),
                'peak_change_pct': stim.get('maxSpikeChangePct'),
                'time_to_peak': stim.get('spikeTimeToPeak'),
            })
            result['per_stim_burst'].append({
                'stim_index': i + 1,
                'baseline': stim.get('baselineBurstBpm'),
                'avg': stim.get('avgBurstBpm'),
                'max': stim.get('maxBurstBpm'),
                'change_pct': stim.get('burstChangePct'),
                'peak_change_pct': stim.get('maxBurstChangePct'),
                'time_to_peak': stim.get('burstTimeToPeak'),
            })
        else:
            result['per_stim_spike'].append(None)
            result['per_stim_burst'].append(None)
    
    return result


@api_router.get("/folders/{folder_id}/comparison")
async def get_folder_comparison(folder_id: str, source_type: str = None):
    """Get comparison data for all recordings in a folder.
    
    Args:
        folder_id: The folder ID
        source_type: Filter by recording type ('SSE' or 'MEA'). If None, returns SSE by default.
    """
    # Get folder info
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Count recordings by type for the type switcher
    sse_count = 0
    mea_count = 0
    
    # Get all recordings with full analysis_state (limit to 500 for performance)
    all_recordings = []
    async for rec in db.recordings.find({"folder_id": folder_id}).limit(500):
        rec_source_type = rec.get("source_type") or rec.get("analysis_state", {}).get("source_type") or rec.get("analysis_state", {}).get("type")
        # Default to SSE if not specified
        if not rec_source_type or rec_source_type not in ['MEA', 'mea']:
            rec_source_type = 'SSE'
        else:
            rec_source_type = 'MEA'
        
        all_recordings.append({
            "rec": rec,
            "source_type": rec_source_type
        })
        
        if rec_source_type == 'MEA':
            mea_count += 1
        else:
            sse_count += 1
    
    # Determine which type to return (default to SSE if not specified)
    requested_type = source_type.upper() if source_type else ('MEA' if mea_count > 0 and sse_count == 0 else 'SSE')
    
    # Filter and extract metrics based on type
    recordings_data = []
    for item in all_recordings:
        if item['source_type'] != requested_type:
            continue
        
        rec = item['rec']
        recording = {
            "id": str(rec["_id"]),
            "name": rec["name"],
            "filename": rec["filename"],
            "analysis_state": rec.get("analysis_state", {}),
        }
        
        if requested_type == 'MEA':
            metrics = extract_mea_comparison_metrics(recording)
        else:
            metrics = extract_comparison_metrics(recording)
        
        recordings_data.append(metrics)
    
    # Compute age ranges
    hspo_ages = [r['hspo_age'] for r in recordings_data if r.get('hspo_age') is not None]
    hco_ages = [r['hco_age'] for r in recordings_data if r.get('hco_age') is not None]
    fusion_ages = [r['fusion_age'] for r in recordings_data if r.get('fusion_age') is not None]
    
    # Build response based on type
    if requested_type == 'MEA':
        # MEA spontaneous metrics
        spontaneous_spike_metrics = ['baseline_spike_hz', 'drug_spike_hz']
        spontaneous_burst_metrics = ['baseline_burst_bpm', 'drug_burst_bpm']
        spontaneous_spike_averages = compute_folder_averages(recordings_data, spontaneous_spike_metrics)
        spontaneous_burst_averages = compute_folder_averages(recordings_data, spontaneous_burst_metrics)
        
        # MEA light stimulus spike metrics
        light_spike_metrics = [
            'light_baseline_spike_hz', 'light_avg_spike_hz', 'light_max_spike_hz',
            'light_spike_change_pct', 'light_peak_spike_change_pct', 'light_spike_time_to_peak'
        ]
        light_spike_averages = compute_folder_averages(recordings_data, light_spike_metrics)
        
        # MEA light stimulus burst metrics
        light_burst_metrics = [
            'light_baseline_burst_bpm', 'light_avg_burst_bpm', 'light_max_burst_bpm',
            'light_burst_change_pct', 'light_peak_burst_change_pct', 'light_burst_time_to_peak'
        ]
        light_burst_averages = compute_folder_averages(recordings_data, light_burst_metrics)
        
        return {
            "folder": folder,
            "source_type": "MEA",
            "type_counts": {"sse": sse_count, "mea": mea_count},
            "summary": {
                "recording_count": len(recordings_data),
                "hspo_age_range": {"min": min(hspo_ages) if hspo_ages else None, "max": max(hspo_ages) if hspo_ages else None, "n": len(hspo_ages)},
                "hco_age_range": {"min": min(hco_ages) if hco_ages else None, "max": max(hco_ages) if hco_ages else None, "n": len(hco_ages)},
                "fusion_age_range": {"min": min(fusion_ages) if fusion_ages else None, "max": max(fusion_ages) if fusion_ages else None, "n": len(fusion_ages)},
            },
            "recordings": recordings_data,
            "spontaneous_spike_averages": spontaneous_spike_averages,
            "spontaneous_burst_averages": spontaneous_burst_averages,
            "light_spike_averages": light_spike_averages,
            "light_burst_averages": light_burst_averages,
        }
    else:
        # SSE metrics (original behavior)
        spontaneous_metrics = [
            'baseline_bf', 'baseline_ln_rmssd70', 'baseline_ln_sdnn70', 'baseline_pnn50',
            'drug_bf', 'drug_ln_rmssd70', 'drug_ln_sdnn70', 'drug_pnn50'
        ]
        spontaneous_averages = compute_folder_averages(recordings_data, spontaneous_metrics)
        
        light_hra_metrics = [
            'light_baseline_bf', 'light_avg_bf', 'light_peak_bf', 'light_peak_norm',
            'light_ttp_first', 'light_ttp_avg', 'light_recovery_bf', 'light_recovery_pct',
            'light_amplitude', 'light_roc'
        ]
        light_hra_averages = compute_folder_averages(recordings_data, light_hra_metrics)
        
        light_hrv_metrics = ['light_hrv_ln_rmssd70', 'light_hrv_ln_sdnn70', 'light_hrv_pnn50']
        light_hrv_averages = compute_folder_averages(recordings_data, light_hrv_metrics)
        
        return {
            "folder": folder,
            "source_type": "SSE",
            "type_counts": {"sse": sse_count, "mea": mea_count},
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
    """Export folder comparison data to Excel - separate by source_type (SSE or MEA)."""
    # ALWAYS fetch fresh data from database to ensure exports are up-to-date
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Get list of excluded recording IDs
    excluded_ids = set(request.excluded_recording_ids or [])
    
    # Determine source type to export
    export_source_type = request.source_type or 'SSE'  # Default to SSE if not specified
    
    recordings_data = []
    async for rec in db.recordings.find({"folder_id": folder_id}).limit(500):
        rec_id = str(rec["_id"])
        # Skip excluded recordings
        if rec_id in excluded_ids:
            continue
        
        # Get source type from analysis_state
        rec_source_type = rec.get("analysis_state", {}).get("source_type") or rec.get("analysis_state", {}).get("type", "SSE")
        # Skip recordings that don't match the export source type
        if rec_source_type != export_source_type:
            continue
            
        recording = {
            "id": rec_id,
            "name": rec["name"],
            "filename": rec["filename"],
            "analysis_state": rec.get("analysis_state", {}),
            "source_type": rec_source_type,
        }
        
        if export_source_type == 'MEA':
            metrics = extract_mea_comparison_metrics(recording)
        else:
            metrics = extract_comparison_metrics(recording)
        recordings_data.append(metrics)
    
    # Compute age ranges
    hspo_ages = [r['hspo_age'] for r in recordings_data if r.get('hspo_age') is not None]
    hco_ages = [r['hco_age'] for r in recordings_data if r.get('hco_age') is not None]
    fusion_ages = [r['fusion_age'] for r in recordings_data if r.get('fusion_age') is not None]
    
    if export_source_type == 'MEA':
        # MEA-specific averages
        spike_metrics = ['baseline_spike_hz', 'drug_spike_hz']
        burst_metrics = ['baseline_burst_bpm', 'drug_burst_bpm']
        light_spike_metrics = ['light_baseline_spike_hz', 'light_avg_spike_hz', 'light_max_spike_hz', 
                               'light_spike_delta_pct', 'light_spike_peak_delta_pct', 'light_ttp_spike']
        light_burst_metrics = ['light_baseline_burst_bpm', 'light_avg_burst_bpm', 'light_max_burst_bpm',
                               'light_burst_delta_pct', 'light_burst_peak_delta_pct', 'light_ttp_burst']
        
        spike_averages = compute_folder_averages(recordings_data, spike_metrics)
        burst_averages = compute_folder_averages(recordings_data, burst_metrics)
        light_spike_averages = compute_folder_averages(recordings_data, light_spike_metrics)
        light_burst_averages = compute_folder_averages(recordings_data, light_burst_metrics)
        
        comparison_data = {
            "folder": folder,
            "source_type": "MEA",
            "summary": {
                "recording_count": len(recordings_data),
                "hspo_age_range": {"min": min(hspo_ages) if hspo_ages else None, "max": max(hspo_ages) if hspo_ages else None, "n": len(hspo_ages)},
                "hco_age_range": {"min": min(hco_ages) if hco_ages else None, "max": max(hco_ages) if hco_ages else None, "n": len(hco_ages)},
                "fusion_age_range": {"min": min(fusion_ages) if fusion_ages else None, "max": max(fusion_ages) if fusion_ages else None, "n": len(fusion_ages)},
            },
            "recordings": recordings_data,
            "spike_averages": spike_averages,
            "burst_averages": burst_averages,
            "light_spike_averages": light_spike_averages,
            "light_burst_averages": light_burst_averages,
        }
        
        output = export_utils.create_mea_comparison_xlsx(request.folder_name, comparison_data)
        filename = f"{request.folder_name}_MEA_comparison.xlsx".replace(' ', '_')
    else:
        # SSE-specific averages (original logic)
        spontaneous_metrics = ['baseline_bf', 'baseline_ln_rmssd70', 'baseline_ln_sdnn70', 'baseline_pnn50',
                              'drug_bf', 'drug_ln_rmssd70', 'drug_ln_sdnn70', 'drug_pnn50']
        spontaneous_averages = compute_folder_averages(recordings_data, spontaneous_metrics)
        
        light_hra_metrics = ['light_baseline_bf', 'light_avg_bf', 'light_peak_bf', 'light_peak_norm',
                            'light_ttp_first', 'light_ttp_avg', 'light_recovery_bf', 'light_recovery_pct',
                            'light_amplitude', 'light_roc']
        light_hra_averages = compute_folder_averages(recordings_data, light_hra_metrics)
        
        light_hrv_metrics = ['light_hrv_ln_rmssd70', 'light_hrv_ln_sdnn70', 'light_hrv_pnn50']
        light_hrv_averages = compute_folder_averages(recordings_data, light_hrv_metrics)
        
        comparison_data = {
            "folder": folder,
            "source_type": "SSE",
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
        
        output = export_utils.create_comparison_xlsx(request.folder_name, comparison_data)
        filename = f"{request.folder_name}_SSE_comparison.xlsx".replace(' ', '_')
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.post("/folders/{folder_id}/export/pdf")
async def export_folder_comparison_pdf(folder_id: str, request: FolderComparisonExportRequest):
    """Export folder comparison data to PDF - separate by source_type (SSE or MEA)."""
    # ALWAYS fetch fresh data from database to ensure exports are up-to-date
    folder = await storage.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Get list of excluded recording IDs
    excluded_ids = set(request.excluded_recording_ids or [])
    
    # Determine source type to export
    export_source_type = request.source_type or 'SSE'  # Default to SSE if not specified
    
    recordings_data = []
    async for rec in db.recordings.find({"folder_id": folder_id}).limit(500):
        rec_id = str(rec["_id"])
        # Skip excluded recordings
        if rec_id in excluded_ids:
            continue
        
        # Get source type from analysis_state
        rec_source_type = rec.get("analysis_state", {}).get("source_type") or rec.get("analysis_state", {}).get("type", "SSE")
        # Skip recordings that don't match the export source type
        if rec_source_type != export_source_type:
            continue
            
        recording = {
            "id": rec_id,
            "name": rec["name"],
            "filename": rec["filename"],
            "analysis_state": rec.get("analysis_state", {}),
            "source_type": rec_source_type,
        }
        
        if export_source_type == 'MEA':
            metrics = extract_mea_comparison_metrics(recording)
        else:
            metrics = extract_comparison_metrics(recording)
        recordings_data.append(metrics)
    
    # Compute age ranges
    hspo_ages = [r['hspo_age'] for r in recordings_data if r.get('hspo_age') is not None]
    hco_ages = [r['hco_age'] for r in recordings_data if r.get('hco_age') is not None]
    fusion_ages = [r['fusion_age'] for r in recordings_data if r.get('fusion_age') is not None]
    
    if export_source_type == 'MEA':
        # MEA-specific averages
        spike_metrics = ['baseline_spike_hz', 'drug_spike_hz']
        burst_metrics = ['baseline_burst_bpm', 'drug_burst_bpm']
        light_spike_metrics = ['light_baseline_spike_hz', 'light_avg_spike_hz', 'light_max_spike_hz', 
                               'light_spike_delta_pct', 'light_spike_peak_delta_pct', 'light_ttp_spike']
        light_burst_metrics = ['light_baseline_burst_bpm', 'light_avg_burst_bpm', 'light_max_burst_bpm',
                               'light_burst_delta_pct', 'light_burst_peak_delta_pct', 'light_ttp_burst']
        
        spike_averages = compute_folder_averages(recordings_data, spike_metrics)
        burst_averages = compute_folder_averages(recordings_data, burst_metrics)
        light_spike_averages = compute_folder_averages(recordings_data, light_spike_metrics)
        light_burst_averages = compute_folder_averages(recordings_data, light_burst_metrics)
        
        comparison_data = {
            "folder": folder,
            "source_type": "MEA",
            "summary": {
                "recording_count": len(recordings_data),
                "hspo_age_range": {"min": min(hspo_ages) if hspo_ages else None, "max": max(hspo_ages) if hspo_ages else None, "n": len(hspo_ages)},
                "hco_age_range": {"min": min(hco_ages) if hco_ages else None, "max": max(hco_ages) if hco_ages else None, "n": len(hco_ages)},
                "fusion_age_range": {"min": min(fusion_ages) if fusion_ages else None, "max": max(fusion_ages) if fusion_ages else None, "n": len(fusion_ages)},
            },
            "recordings": recordings_data,
            "spike_averages": spike_averages,
            "burst_averages": burst_averages,
            "light_spike_averages": light_spike_averages,
            "light_burst_averages": light_burst_averages,
        }
        
        output = export_utils.create_mea_comparison_pdf(request.folder_name, comparison_data)
        filename = f"{request.folder_name}_MEA_comparison.pdf".replace(' ', '_')
    else:
        # SSE-specific averages (original logic)
        spontaneous_metrics = ['baseline_bf', 'baseline_ln_rmssd70', 'baseline_ln_sdnn70', 'baseline_pnn50',
                              'drug_bf', 'drug_ln_rmssd70', 'drug_ln_sdnn70', 'drug_pnn50']
        spontaneous_averages = compute_folder_averages(recordings_data, spontaneous_metrics)
        
        light_hra_metrics = ['light_baseline_bf', 'light_avg_bf', 'light_peak_bf', 'light_peak_norm',
                            'light_ttp_first', 'light_ttp_avg', 'light_recovery_bf', 'light_recovery_pct',
                            'light_amplitude', 'light_roc']
        light_hra_averages = compute_folder_averages(recordings_data, light_hra_metrics)
        
        light_hrv_metrics = ['light_hrv_ln_rmssd70', 'light_hrv_ln_sdnn70', 'light_hrv_pnn50']
        light_hrv_averages = compute_folder_averages(recordings_data, light_hrv_metrics)
        
        comparison_data = {
            "folder": folder,
            "source_type": "SSE",
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
        
        output = export_utils.create_comparison_pdf(request.folder_name, comparison_data)
        filename = f"{request.folder_name}_SSE_comparison.pdf".replace(' ', '_')
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.post("/export/csv")
async def export_csv(request: ExportRequest):
    """Clean Nature-style CSV export"""
    buf = export_utils.create_nature_csv(request)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.csv"}
    )


@api_router.post("/export/xlsx")
async def export_xlsx(request: ExportRequest):
    """Clean Nature-style Excel export"""
    buf = export_utils.create_nature_excel(request)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.xlsx"}
    )


@api_router.post("/export/pdf")
async def export_pdf(request: ExportRequest):
    """Clean Nature-style PDF export"""
    buf = export_utils.create_nature_pdf(request)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={request.filename}.pdf"}
    )


# =============================================================================
# MEA EXPORT ENDPOINTS
# =============================================================================

class MEAExportRequest(BaseModel):
    analysis_state: dict
    well_analysis: dict


@api_router.post("/mea/export/csv")
async def mea_export_csv(request: MEAExportRequest):
    """Export MEA data as a single CSV file (SSE style)"""
    try:
        csv_bytes = mea_export_utils.generate_mea_csv_export(
            request.analysis_state, 
            request.well_analysis
        )
        recording_name = request.analysis_state.get('recordingName', 'MEA_Export')
        selected_well = request.analysis_state.get('selectedWell', '')
        filename = f"{recording_name}_{selected_well}.csv"
        
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/mea/export/xlsx")
async def mea_export_xlsx(request: MEAExportRequest):
    """Export MEA data as Excel workbook"""
    try:
        xlsx_bytes = mea_export_utils.generate_mea_xlsx_export(
            request.analysis_state,
            request.well_analysis
        )
        recording_name = request.analysis_state.get('recordingName', 'MEA_Export')
        selected_well = request.analysis_state.get('selectedWell', '')
        filename = f"{recording_name}_{selected_well}.xlsx"
        
        return StreamingResponse(
            io.BytesIO(xlsx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/mea/export/pdf")
async def mea_export_pdf(request: MEAExportRequest):
    """Export MEA data as PDF report"""
    try:
        pdf_bytes = mea_export_utils.generate_mea_pdf_export(
            request.analysis_state,
            request.well_analysis
        )
        recording_name = request.analysis_state.get('recordingName', 'MEA_Export')
        selected_well = request.analysis_state.get('selectedWell', '')
        filename = f"{recording_name}_{selected_well}.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
