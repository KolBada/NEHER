import { useState, useCallback, useMemo, useRef, useEffect, startTransition, memo } from 'react';
import '@/App.css';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Activity, BarChart3, Zap, Download, FileAudio, RotateCcw, Save, FlaskConical, Clock, Plus, X, Home, Minus, Check, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';

import FileUpload from '@/components/FileUpload';
import TraceViewer from '@/components/TraceViewer';
import DetectionPanel from '@/components/DetectionPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import LightPanel from '@/components/LightPanel';
import ExportPanel from '@/components/ExportPanel';
import HomeBrowser from '@/components/HomeBrowser';
import SaveRecording from '@/components/SaveRecording';
import FolderComparison from '@/components/FolderComparison';
import api, { downloadBlob } from '@/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea
} from 'recharts';

// Drug configurations with default readout times
const DRUG_CONFIG = {
  tetrodotoxin: { name: 'Tetrodotoxin', defaultConc: '1', bfReadout: 12, hrvReadout: 10 },
  isoproterenol: { name: 'Isoproterenol', defaultConc: '1', bfReadout: null, hrvReadout: null, manualPeak: true },
  acetylcholine: { name: 'Acetylcholine', defaultConc: '1', bfReadout: 3, hrvReadout: 2 },
  propranolol: { name: 'Propranolol', defaultConc: '5', bfReadout: 12, hrvReadout: 10 },
  nepicastat: { name: 'Nepicastat', defaultConc: '30', bfReadout: 42, hrvReadout: 40 },
  ruxolitinib: { name: 'Ruxolitinib', defaultConc: '2', bfReadout: 15, hrvReadout: 15 },
};

// Format time as min:sec
// Format time in minutes only (e.g., 0.0, 0.5, 1.0, 2.0)
function formatTimeMin(minutes) {
  return minutes.toFixed(1);
}

// Inline BF chart component for the Trace tab
function BFChart({ metrics, lightPulses, zoomDomain, onZoomChange, isValidated = true }) {
  const containerRef = useRef(null);
  
  const data = metrics.filtered_beat_times_min.map((t, i) => ({
    time: t,
    bf: metrics.filtered_bf_bpm[i],
  }));
  
  const timeBounds = useMemo(() => {
    if (!data.length) return { min: 0, max: 1 };
    return {
      min: Math.min(...data.map(d => d.time)),
      max: Math.max(...data.map(d => d.time))
    };
  }, [data]);
  
  // Filtered data based on zoom
  const filteredData = useMemo(() => {
    if (!zoomDomain) return data;
    return data.filter(d => d.time >= zoomDomain[0] && d.time <= zoomDomain[1]);
  }, [data, zoomDomain]);
  
  // Handle wheel zoom (trackpad) - using useEffect for non-passive listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e) => {
      if (!data.length) return;
      
      // Only zoom with ctrl/cmd key or pinch gesture
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50) return;
      
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const chartWidth = rect.width - 60;
      const mouseRatio = Math.max(0, Math.min(1, (mouseX - 10) / chartWidth));
      
      const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
      const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
      const currentRange = currentMax - currentMin;
      
      const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
      const newRange = Math.max(0.1, Math.min(timeBounds.max - timeBounds.min, currentRange * zoomFactor));
      
      const mouseTime = currentMin + mouseRatio * currentRange;
      let newMin = mouseTime - mouseRatio * newRange;
      let newMax = mouseTime + (1 - mouseRatio) * newRange;
      
      if (newMin < timeBounds.min) {
        newMin = timeBounds.min;
        newMax = Math.min(timeBounds.max, newMin + newRange);
      }
      if (newMax > timeBounds.max) {
        newMax = timeBounds.max;
        newMin = Math.max(timeBounds.min, newMax - newRange);
      }
      
      if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) {
        onZoomChange(null);
      } else {
        onZoomChange([newMin, newMax]);
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [data, zoomDomain, timeBounds, onZoomChange]);

  const handleResetZoom = useCallback(() => {
    onZoomChange(null);
  }, [onZoomChange]);

  // Zoom in/out handlers
  const handleZoomIn = useCallback(() => {
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const currentRange = currentMax - currentMin;
    const newRange = currentRange * 0.7;
    const center = (currentMin + currentMax) / 2;
    const newMin = Math.max(timeBounds.min, center - newRange / 2);
    const newMax = Math.min(timeBounds.max, center + newRange / 2);
    onZoomChange([newMin, newMax]);
  }, [zoomDomain, timeBounds, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    if (!zoomDomain) return;
    const currentRange = zoomDomain[1] - zoomDomain[0];
    const newRange = Math.min(timeBounds.max - timeBounds.min, currentRange * 1.5);
    const center = (zoomDomain[0] + zoomDomain[1]) / 2;
    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;
    if (newMin < timeBounds.min) { newMin = timeBounds.min; newMax = newMin + newRange; }
    if (newMax > timeBounds.max) { newMax = timeBounds.max; newMin = newMax - newRange; }
    if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) {
      onZoomChange(null);
    } else {
      onZoomChange([newMin, newMax]);
    }
  }, [zoomDomain, timeBounds, onZoomChange]);

  // Handle brush change for navigation
  const handleBrushChange = useCallback((brushArea) => {
    if (brushArea && brushArea.startIndex !== undefined && brushArea.endIndex !== undefined) {
      const startTime = data[brushArea.startIndex]?.time;
      const endTime = data[brushArea.endIndex]?.time;
      if (startTime !== undefined && endTime !== undefined) {
        // Check if this represents the full range (reset)
        if (brushArea.startIndex === 0 && brushArea.endIndex === data.length - 1) {
          onZoomChange(null);
        } else {
          onZoomChange([startTime, endTime]);
        }
      }
    }
  }, [data, onZoomChange]);

  // Calculate brush indices from zoom domain
  const brushIndices = useMemo(() => {
    if (!data.length) return { start: 0, end: 0 };
    if (!zoomDomain) return { start: 0, end: data.length - 1 };
    let startIdx = data.findIndex(d => d.time >= zoomDomain[0]);
    let endIdx = data.findIndex(d => d.time >= zoomDomain[1]);
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = data.length - 1;
    return { start: Math.max(0, startIdx), end: Math.min(data.length - 1, endIdx) };
  }, [data, zoomDomain]);

  const isZoomed = zoomDomain !== null;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm" data-testid="bf-chart">
      <div className="p-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Beat Frequency (filtered) &mdash; bpm vs time</span>
          {!isValidated && (
            <span className="text-[9px] text-amber-500/70 italic">(previous detection)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300" onClick={handleZoomIn} title="Zoom In">
            <Plus className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300" onClick={handleZoomOut} disabled={!isZoomed} title="Zoom Out">
            <Minus className="w-4 h-4" />
          </Button>
          {isZoomed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200" onClick={handleResetZoom}>
              <RotateCcw className="w-3 h-3 mr-1" /> Reset
            </Button>
          )}
        </div>
      </div>
      <div ref={containerRef}>
        <ResponsiveContainer width="100%" height={377}>
          <LineChart data={data} margin={{ top: 10, right: 35, left: 15, bottom: 35 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis dataKey="time" type="number" 
              domain={zoomDomain || ['dataMin', 'dataMax']}
              allowDataOverflow={true}
              tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
              tickFormatter={(v) => formatTimeMin(v)}
              label={{ value: 'min', fill: '#a1a1aa', fontSize: 10, position: 'insideBottom', offset: -13 }} />
            <YAxis tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }} width={45}
              domain={['auto', 'auto']}
              label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
              labelFormatter={(v) => `${formatTimeMin(v)} min`}
              formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']} />
            {/* Highlight light pulses */}
            {lightPulses && lightPulses.map((pulse, i) => (
              <ReferenceArea
                key={`pulse-${i}`}
                x1={pulse.start_min}
                x2={pulse.end_min}
                fill="#facc15"
                fillOpacity={0.2}
                stroke="#facc15"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            ))}
            <Line type="monotone" dataKey="bf" stroke="#10b981" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Brush
              dataKey="time"
              height={20}
              stroke="#52525b"
              fill="#0c0c0e"
              tickFormatter={(v) => v.toFixed(1)}
              onChange={handleBrushChange}
              travellerWidth={10}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function App() {
  // App view mode: 'home' (folder browser) or 'analysis' (main analysis view)
  const [appView, setAppView] = useState('home');
  
  // Saved recording info (when editing an existing recording)
  const [savedRecordingId, setSavedRecordingId] = useState(null);
  const [savedFolderId, setSavedFolderId] = useState(null);
  const [savedFolderName, setSavedFolderName] = useState(null);
  const [savedRecordingData, setSavedRecordingData] = useState(null);  // Store original recording for cancel
  const [hasExported, setHasExported] = useState(false);
  const [isModified, setIsModified] = useState(false);  // Track if recording has been modified since last save
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [navigateToFolderId, setNavigateToFolderId] = useState(null);  // For "Go to Folder" navigation

  // Session
  const [sessionId, setSessionId] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  // Recording metadata
  const [recordingName, setRecordingName] = useState('');
  const [recordingDate, setRecordingDate] = useState('');
  const [organoidInfo, setOrganoidInfo] = useState([{ cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
  const [fusionDate, setFusionDate] = useState('');
  const [recordingDescription, setRecordingDescription] = useState('');
  
  // Drug configuration - each drug has its own settings
  const [selectedDrugs, setSelectedDrugs] = useState([]);
  const [drugSettings, setDrugSettings] = useState({});
  // For "Other" drugs - list of custom drugs
  const [otherDrugs, setOtherDrugs] = useState([]);

  // Trace & detection
  const [traceData, setTraceData] = useState(null);
  const [beats, setBeats] = useState([]);
  const [detectionParams, setDetectionParams] = useState({
    threshold: null, minDistance: 0.3, prominence: null, invert: false, bidirectional: false
  });
  const [filterParams, setFilterParams] = useState({
    lowerPct: 50, upperPct: 200
  });
  const [signalStats, setSignalStats] = useState(null);

  // Wrapper functions to mark as modified when params change
  const handleDetectionParamsChange = useCallback((newParams) => {
    setIsModified(true);
    setDetectionParams(newParams);
  }, []);

  const handleFilterParamsChange = useCallback((newParams) => {
    setIsModified(true);
    setFilterParams(newParams);
  }, []);

  // Wrapper functions for metadata changes to mark as modified
  const handleRecordingDateChange = useCallback((value) => {
    setIsModified(true);
    setRecordingDate(value);
  }, []);

  const handleOrganoidInfoChange = useCallback((value) => {
    setIsModified(true);
    setOrganoidInfo(value);
  }, []);

  const handleFusionDateChange = useCallback((value) => {
    setIsModified(true);
    setFusionDate(value);
  }, []);

  const handleRecordingDescriptionChange = useCallback((value) => {
    setIsModified(true);
    setRecordingDescription(value);
  }, []);

  // Wrapper for baseline toggle
  const handleBaselineToggle = useCallback((value) => {
    setIsModified(true);
    setBaselineEnabled(value);
  }, []);

  // Wrappers for baseline minute settings
  const handleBaselineHrvMinuteChange = useCallback((value) => {
    setIsModified(true);
    setBaselineHrvMinute(value);
  }, []);

  const handleBaselineBfMinuteChange = useCallback((value) => {
    setIsModified(true);
    setBaselineBfMinute(value);
  }, []);

  // Wrapper for drug readout settings
  const handleDrugReadoutSettingsChange = useCallback((newSettings) => {
    setIsModified(true);
    setDrugReadoutSettings(newSettings);
  }, []);

  // Wrapper for light enabled toggle
  const handleLightEnabledToggle = useCallback((value) => {
    setIsModified(true);
    setLightEnabled(value);
  }, []);

  // Wrapper for light params change
  const handleLightParamsChange = useCallback((newParams) => {
    setIsModified(true);
    setLightParams(newParams);
  }, []);

  // Wrapper for LOESS frac change
  const handleLoessFracChange = useCallback((value) => {
    setIsModified(true);
    setLoessFrac(value);
  }, []);

  // Validation
  const [isValidated, setIsValidated] = useState(false);
  const [metrics, setMetrics] = useState(null);

  // HRV
  const [hrvResults, setHrvResults] = useState(null);
  const [perMinuteData, setPerMinuteData] = useState(null);
  
  // Baseline/Spontaneous Activity enabled
  const [baselineEnabled, setBaselineEnabled] = useState(true);
  const [baselineHrvMinute, setBaselineHrvMinute] = useState(0);  // Baseline HRV readout minute
  const [baselineBfMinute, setBaselineBfMinute] = useState(1);    // Baseline BF readout minute
  
  // Drug readout settings (for Spontaneous Activity)
  const [drugReadoutSettings, setDrugReadoutSettings] = useState({
    hrvReadoutMinute: '',
    bfReadoutMinute: '',
    enableHrvReadout: false,
    enableBfReadout: false,
  });

  // Light
  const [lightEnabled, setLightEnabled] = useState(true);
  const [lightParams, setLightParams] = useState({
    startTime: 180, pulseDuration: 20, interval: 'decreasing', nPulses: 5,
    autoDetect: true, searchRange: 20,
  });
  const [lightPulses, setLightPulses] = useState(null);
  const [lightHrv, setLightHrv] = useState(null);
  const [lightHrvDetrended, setLightHrvDetrended] = useState(null);
  const [lightResponse, setLightResponse] = useState(null);
  const [loessFrac, setLoessFrac] = useState(0.25);  // LOESS span for corrected HRV

  // Shared zoom state for trace section (TraceViewer + BFChart)
  const [traceZoomDomain, setTraceZoomDomain] = useState(null);

  // Loading
  const [uploadLoading, setUploadLoading] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);  // For opening recordings

  const activeFile = files[activeFileIdx] || null;
  const hasDrug = selectedDrugs.length > 0 || otherDrugs.length > 0;

  // Load file data into state
  const loadFileData = useCallback((fileData) => {
    setTraceData({ times: fileData.trace_times, voltages: fileData.trace_voltages });
    setBeats(fileData.beats.map((b) => ({ timeSec: b.time_sec, voltage: b.voltage })));
    setSignalStats(fileData.signal_stats);
    setIsValidated(false);
    setMetrics(null);
    setHrvResults(null);
    setLightPulses(null);
    setLightHrv(null);
    setLightHrvDetrended(null);
    setLightResponse(null);
    setRecordingName(fileData.filename?.replace('.abf', '') || '');
  }, []);

  // Upload
  const handleUpload = useCallback(async (uploadedFiles) => {
    setUploadLoading(true);
    try {
      const formData = new FormData();
      uploadedFiles.forEach(f => formData.append('files', f));
      
      // Retry logic for large files
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { data } = await api.upload(formData);
          setSessionId(data.session_id);
          setFiles(data.files);
          setActiveFileIdx(0);
          if (data.files.length > 0) loadFileData(data.files[0]);
          toast.success(`Loaded ${data.files.length} file(s) — ${data.files[0]?.n_beats_detected} beats detected`);
          return; // Success, exit
        } catch (err) {
          lastError = err;
          if (attempt < 3 && (err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('Network'))) {
            toast.info(`Upload attempt ${attempt} failed, retrying...`);
            await new Promise(r => setTimeout(r, 1000 * attempt)); // Wait before retry
            continue;
          }
          throw err; // Don't retry for other errors
        }
      }
      throw lastError;
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Unknown error';
      toast.error('Upload failed: ' + errorMsg);
      console.error('Upload error:', err);
    } finally {
      setUploadLoading(false);
    }
  }, [loadFileData]);

  // Switch file
  const handleFileSwitch = useCallback((idx) => {
    setActiveFileIdx(idx);
    loadFileData(files[idx]);
  }, [files, loadFileData]);

  // Re-detect
  const handleDetect = useCallback(async () => {
    if (!sessionId || !activeFile) return;
    setDetectLoading(true);
    setIsModified(true);  // Mark as modified when re-detecting
    try {
      const { data } = await api.detectBeats({
        session_id: sessionId,
        file_id: activeFile.file_id,
        threshold: detectionParams.threshold,
        min_distance: detectionParams.minDistance,
        prominence: detectionParams.prominence,
        invert: detectionParams.invert,
        bidirectional: detectionParams.bidirectional,
      });
      setBeats(data.beats.map(b => ({ timeSec: b.time_sec, voltage: b.voltage })));
      setIsValidated(false);
      setMetrics(null);
      toast.success(`Detected ${data.n_beats} beats`);
    } catch (err) {
      toast.error('Detection failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDetectLoading(false);
    }
  }, [sessionId, activeFile, detectionParams]);

  // Manual beat add/remove
  const handleAddBeat = useCallback((timeSec, voltage) => {
    setIsModified(true);  // Mark as modified
    setBeats(prev => [...prev, { timeSec, voltage }].sort((a, b) => a.timeSec - b.timeSec));
  }, []);

  const handleRemoveBeat = useCallback((idx) => {
    setIsModified(true);  // Mark as modified
    setBeats(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Validate
  const handleValidate = useCallback(async () => {
    if (beats.length < 2) { toast.error('Need at least 2 beats'); return; }
    setAnalysisLoading(true);
    setIsModified(true);  // Mark as modified when validating
    try {
      const { data } = await api.computeMetrics({
        beat_times_sec: beats.map(b => b.timeSec),
        filter_lower_pct: filterParams.lowerPct,
        filter_upper_pct: filterParams.upperPct,
      });
      setMetrics(data);
      setIsValidated(true);

      // Also compute per-minute metrics
      try {
        const pmResp = await api.perMinuteMetrics({
          beat_times_min: data.filtered_beat_times_min,
          bf_filtered: data.filtered_bf_bpm,
        });
        setPerMinuteData(pmResp.data.rows);
      } catch (e) { /* non-critical */ }

      toast.success(`Validated \u2014 ${data.n_kept} beats kept, ${data.n_removed} filtered`);
    } catch (err) {
      toast.error('Validation failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAnalysisLoading(false);
    }
  }, [beats, filterParams]);

  // Unvalidate - allow re-editing beats
  // Keep metrics/BF chart visible as reference until new detection
  const handleUnvalidate = useCallback(() => {
    setIsModified(true);  // Mark as modified when resetting validation
    setIsValidated(false);
    // Don't clear metrics - keep BF chart visible as previous reference
    // setMetrics(null);
    setHrvResults(null);
    setPerMinuteData(null);
    // Keep light pulses visible for reference
    // setLightPulses(null);
    setLightHrv(null);
    setLightHrvDetrended(null);
    setLightResponse(null);
  }, []);

  // HRV
  const handleComputeHRV = useCallback(async (readoutMinute) => {
    if (!metrics) return;
    setAnalysisLoading(true);
    setIsModified(true);  // Mark as modified when computing HRV
    try {
      const { data } = await api.hrvAnalysis({
        beat_times_min: metrics.filtered_beat_times_min,
        bf_filtered: metrics.filtered_bf_bpm,
        readout_minute: readoutMinute,
        baseline_hrv_minute: baselineHrvMinute,
        baseline_bf_minute: baselineBfMinute,
      });
      setHrvResults(data);
      toast.success(`HRV computed — ${data.windows.length} windows`);
    } catch (err) {
      toast.error('HRV failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, baselineHrvMinute, baselineBfMinute]);

  // Light detect
  const handleDetectPulses = useCallback(async (params) => {
    setAnalysisLoading(true);
    setIsModified(true);  // Mark as modified when detecting pulses
    try {
      const { data } = await api.lightDetect({
        start_time_sec: params.startTime,
        pulse_duration_sec: params.pulseDuration,
        interval_sec: params.interval,
        n_pulses: params.nPulses,
        auto_detect: params.autoDetect || false,
        beat_times_min: metrics?.filtered_beat_times_min || [],
        bf_filtered: metrics?.filtered_bf_bpm || [],
        search_range_sec: params.searchRange || 20,
      });
      setLightPulses(data.pulses);
      setLightHrv(null);
      setLightHrvDetrended(null);
      setLightResponse(null);
      const startMin = (data.detected_start_sec / 60).toFixed(2);
      toast.success(`${data.pulses.length} pulses detected (start: ${startMin} min)`);
    } catch (err) {
      toast.error('Pulse detection failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics]);

  // Update pulses from LightPanel
  const handlePulsesUpdate = useCallback((updatedPulses) => {
    setIsModified(true);  // Mark as modified
    setLightPulses(updatedPulses);
    setLightHrv(null);
    setLightHrvDetrended(null);
    setLightResponse(null);
  }, []);

  // Light HRV
  const handleLightHRV = useCallback(async () => {
    if (!metrics || !lightPulses) return;
    setAnalysisLoading(true);
    try {
      const { data } = await api.lightHrv({
        beat_times_min: metrics.filtered_beat_times_min,
        bf_filtered: metrics.filtered_bf_bpm,
        pulses: lightPulses,
      });
      setLightHrv(data);
      setIsModified(true);  // Mark as modified
      toast.success('Light HRV computed');
    } catch (err) {
      toast.error('Light HRV failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, lightPulses]);

  // Light HRV Detrended (Corrected HRV using LOESS)
  const handleLightHRVDetrended = useCallback(async (loessFrac = 0.25) => {
    if (!metrics || !lightPulses) return;
    setAnalysisLoading(true);
    try {
      const { data } = await api.lightHrvDetrended({
        beat_times_min: metrics.filtered_beat_times_min,
        bf_filtered: metrics.filtered_bf_bpm,
        pulses: lightPulses,
        loess_frac: loessFrac,
      });
      setLightHrvDetrended({ ...data, loess_frac_used: loessFrac });  // Store which LOESS was used
      setIsModified(true);  // Mark as modified
      toast.success('Corrected HRV (Detrended) computed');
    } catch (err) {
      toast.error('Detrended HRV failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, lightPulses]);

  // Light Response
  const handleLightResponse = useCallback(async () => {
    if (!metrics || !lightPulses) return;
    setAnalysisLoading(true);
    try {
      const { data } = await api.lightResponse({
        beat_times_min: metrics.filtered_beat_times_min,
        bf_filtered: metrics.filtered_bf_bpm,
        pulses: lightPulses,
      });
      setLightResponse(data);
      setIsModified(true);  // Mark as modified
      toast.success('Light Heart Rate Adaptation computed');
    } catch (err) {
      toast.error('Light Heart Rate Adaptation failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, lightPulses]);

  // Drug selection toggle with default settings
  const toggleDrug = useCallback((drugKey) => {
    setIsModified(true);  // Mark as modified
    setSelectedDrugs(prev => {
      if (prev.includes(drugKey)) {
        // Remove drug settings
        setDrugSettings(s => {
          const newSettings = { ...s };
          delete newSettings[drugKey];
          return newSettings;
        });
        return prev.filter(d => d !== drugKey);
      } else {
        // Add with default settings
        const config = DRUG_CONFIG[drugKey];
        setDrugSettings(s => ({
          ...s,
          [drugKey]: {
            concentration: config?.defaultConc || '1',
            perfusionStart: 3,
            perfusionTime: 3,
          }
        }));
        return [...prev, drugKey];
      }
    });
  }, []);

  // Update drug setting
  const updateDrugSetting = useCallback((drugKey, field, value) => {
    setIsModified(true);  // Mark as modified
    setDrugSettings(s => ({
      ...s,
      [drugKey]: {
        ...s[drugKey],
        [field]: value
      }
    }));
  }, []);

  // Add other drug
  const addOtherDrug = useCallback(() => {
    setIsModified(true);  // Mark as modified
    const newId = `other_${Date.now()}`;
    setOtherDrugs(prev => [...prev, {
      id: newId,
      name: '',
      concentration: '1',
      perfusionStart: 3,
      perfusionTime: 3,
    }]);
  }, []);

  // Remove other drug
  const removeOtherDrug = useCallback((id) => {
    setIsModified(true);  // Mark as modified
    setOtherDrugs(prev => prev.filter(d => d.id !== id));
  }, []);

  // Update other drug
  const updateOtherDrug = useCallback((id, field, value) => {
    setIsModified(true);  // Mark as modified
    setOtherDrugs(prev => prev.map(d => 
      d.id === id ? { ...d, [field]: value } : d
    ));
  }, []);

  // Build export payload
  const buildExportData = useCallback(() => {
    const perBeat = metrics ? metrics.beat_times_min.slice(0, -1).map((t, i) => ({
      time_min: t,
      bf_bpm: metrics.beat_freq_bpm[i],
      nn_ms: metrics.nn_intervals_ms[i],
      status: metrics.artifact_mask[i] ? 'kept' : 'filtered',
    })) : null;

    const summary = {};
    if (recordingName) summary['Recording Name'] = recordingName;
    
    // Drug info
    const allDrugs = [
      ...selectedDrugs.map(d => {
        const config = DRUG_CONFIG[d];
        const settings = drugSettings[d] || {};
        return `${config?.name || d} ${settings.concentration || ''}µM`;
      }),
      ...otherDrugs.filter(d => d.name).map(d => `${d.name} ${d.concentration}µM`)
    ];
    if (allDrugs.length > 0) {
      summary['Drug(s) Used'] = allDrugs.join(', ');
    }
    
    if (metrics) {
      summary['Total Beats'] = metrics.n_total;
      summary['Kept Beats'] = metrics.n_kept;
      summary['Removed Beats'] = metrics.n_removed;
      summary['Filter Range'] = `${metrics.filter_settings?.lower_pct || 50}%-${metrics.filter_settings?.upper_pct || 200}%`;
    }
    if (hrvResults?.readout) {
      summary['ln(RMSSD70)'] = hrvResults.readout.ln_rmssd70;
      summary['SDNN'] = hrvResults.readout.sdnn;
      summary['pNN50'] = hrvResults.readout.pnn50;
      summary['Mean BF'] = hrvResults.readout.mean_bf;
    }
    if (hrvResults?.baseline) {
      summary['Baseline BF'] = hrvResults.baseline.baseline_bf;
      summary['Baseline ln(RMSSD70)'] = hrvResults.baseline.baseline_ln_rmssd70;
    }
    if (!lightEnabled) {
      summary['Light Stimulation'] = 'Disabled';
    }

    // Calculate drug readout timing for export highlighting
    let drugReadout = null;
    let perfusionParams = null;
    if (selectedDrugs.length > 0) {
      const primaryDrug = selectedDrugs[0];
      const config = DRUG_CONFIG[primaryDrug];
      const settings = drugSettings[primaryDrug] || {};
      if (config) {
        const perfStart = settings.perfusionStart ?? config.defaultPerfStart ?? 3;
        const perfDelay = settings.perfusionTime ?? config.defaultPerfTime ?? 3;  // Now called Perfusion Delay
        const baseBfReadout = config.bfReadout;  // This is Perfusion Time for BF
        const baseHrvReadout = config.hrvReadout;  // This is Perfusion Time for HRV
        
        // Store perfusion parameters for export
        perfusionParams = {
          perfusion_start: perfStart,
          perfusion_delay: perfDelay,
          perfusion_time_bf: baseBfReadout,
          perfusion_time_hrv: baseHrvReadout,
        };
        
        if (baseBfReadout !== null) {
          drugReadout = {
            bf_minute: Math.floor(baseBfReadout + perfStart + perfDelay),
            hrv_minute: baseHrvReadout !== null ? Math.floor(baseHrvReadout + perfStart + perfDelay) : null,
          };
        }
      }
    }

    return {
      per_beat_data: perBeat,
      hrv_windows: hrvResults?.windows || null,
      light_metrics: lightEnabled ? (lightHrv?.per_pulse || null) : null,
      light_metrics_detrended: lightEnabled ? lightHrvDetrended : null,  // Corrected HRV (Detrended)
      light_response: lightEnabled ? (lightResponse?.per_stim || null) : null,
      light_pulses: lightEnabled ? lightPulses : null,  // For showing light stim zones on PDF charts
      summary: Object.keys(summary).length > 0 ? summary : null,
      filename: recordingName || activeFile?.filename?.replace('.abf', '') || 'analysis',
      recording_name: recordingName,
      drug_used: allDrugs.length > 0 ? allDrugs.join(',') : null,
      per_minute_data: perMinuteData,
      baseline: hrvResults?.baseline,
      drug_readout: drugReadout,
      perfusion_params: perfusionParams,
      // New metadata fields
      original_filename: activeFile?.filename || null,
      recording_date: recordingDate || null,
      fusion_date: fusionDate || null,
      // Calculate ages from dates for export
      organoid_info: organoidInfo.some(o => o.cell_type || o.birth_date) ? organoidInfo.filter(o => o.cell_type || o.birth_date).map(o => {
        const calculateDays = (from, to) => {
          if (!from || !to) return null;
          const diffTime = new Date(to) - new Date(from);
          const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          return days >= 0 ? days : null;
        };
        return {
          cell_type: o.cell_type || '',
          other_cell_type: o.other_cell_type || null,
          line_name: o.line_name || null,
          passage_number: o.passage_number || null,
          birth_date: o.birth_date || null,
          age_at_recording: calculateDays(o.birth_date, recordingDate),
          // Transfection info
          transfection: o.transfection ? {
            technique: o.transfection.technique || null,
            other_technique: o.transfection.other_technique || null,
            name: o.transfection.name || null,
            amount: o.transfection.amount || null,
            date: o.transfection.date || null,
            days_since_transfection: calculateDays(o.transfection.date, recordingDate),
          } : null,
        };
      }) : null,
      // Calculate fusion days (shared for all samples)
      days_since_fusion: (() => {
        if (!fusionDate || !recordingDate) return null;
        const diffTime = new Date(recordingDate) - new Date(fusionDate);
        const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return days >= 0 ? days : null;
      })(),
      recording_description: recordingDescription || null,
    };
  }, [metrics, hrvResults, lightHrv, lightHrvDetrended, lightResponse, activeFile, recordingName, selectedDrugs, drugSettings, otherDrugs, lightEnabled, perMinuteData, lightPulses, recordingDate, organoidInfo, fusionDate, recordingDescription]);

  // Exports
  const handleExportCsv = useCallback(async () => {
    setExportLoading(true);
    try {
      const { data } = await api.exportCsv(buildExportData());
      downloadBlob(data, `${recordingName || activeFile?.filename?.replace('.abf', '') || 'export'}.csv`);
      toast.success('CSV exported');
    } catch (err) { toast.error('CSV export failed'); }
    finally { setExportLoading(false); }
  }, [buildExportData, activeFile, recordingName]);

  const handleExportXlsx = useCallback(async () => {
    setExportLoading(true);
    try {
      const { data } = await api.exportXlsx(buildExportData());
      downloadBlob(data, `${recordingName || activeFile?.filename?.replace('.abf', '') || 'export'}.xlsx`);
      toast.success('XLSX exported');
    } catch (err) { toast.error('XLSX export failed'); }
    finally { setExportLoading(false); }
  }, [buildExportData, activeFile, recordingName]);

  const handleExportPdf = useCallback(async () => {
    setExportLoading(true);
    try {
      const { data } = await api.exportPdf(buildExportData());
      downloadBlob(data, `${recordingName || activeFile?.filename?.replace('.abf', '') || 'export'}.pdf`);
      toast.success('PDF exported');
    } catch (err) { toast.error('PDF export failed'); }
    finally { setExportLoading(false); }
  }, [buildExportData, activeFile, recordingName]);

  // Reset
  const handleReset = useCallback(() => {
    setSessionId(null);
    setFiles([]);
    setActiveFileIdx(0);
    setTraceData(null);
    setBeats([]);
    setIsValidated(false);
    setMetrics(null);
    setHrvResults(null);
    setPerMinuteData(null);
    setLightPulses(null);
    setLightHrv(null);
    setLightHrvDetrended(null);
    setLightResponse(null);
    setLoessFrac(0.25);  // Reset LOESS span
    setBaselineHrvMinute(0);  // Reset baseline minute settings
    setBaselineBfMinute(1);
    setRecordingName('');
    setRecordingDate('');
    setOrganoidInfo([{ cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
    setFusionDate('');
    setRecordingDescription('');
    setSelectedDrugs([]);
    setDrugSettings({});
    setOtherDrugs([]);
    setDrugReadoutSettings({
      hrvReadoutMinute: '',
      bfReadoutMinute: '',
      enableHrvReadout: false,
      enableBfReadout: false,
    });
    setLightEnabled(true);
    setBaselineEnabled(true);
    setSavedRecordingId(null);
    setSavedFolderId(null);
    setSavedFolderName(null);
    setSavedRecordingData(null);  // Clear saved recording data
    setShowComparisonDialog(false);
    setNavigateToFolderId(null);
    setHasExported(false);
    setIsModified(false);
  }, []);

  // Go back to home view
  const handleGoHome = useCallback(() => {
    handleReset();
    setAppView('home');
  }, [handleReset]);

  // Handle opening a saved recording
  const handleOpenRecording = useCallback(async (recordingData) => {
    setRecordingLoading(true);
    
    try {
      const state = recordingData.analysis_state;
      
      // Set recording identifiers immediately
      setSavedRecordingId(recordingData.id);
      setSavedFolderId(recordingData.folder_id);
      setSavedRecordingData(recordingData);  // Store original for cancel functionality
      setIsModified(false);
      
      // Fetch folder name in parallel (don't block)
      if (recordingData.folder_id) {
        api.getFolder(recordingData.folder_id)
          .then(({ data: folderData }) => setSavedFolderName(folderData.name))
          .catch(() => setSavedFolderName(null));
      } else {
        setSavedFolderName(null);
      }
      
      // Use startTransition for non-urgent UI updates
      startTransition(() => {
        // Restore session info
        setRecordingName(state.recordingName || recordingData.name);
        
        // Restore recording metadata
        setRecordingDate(state.recordingDate || '');
        setOrganoidInfo(state.organoidInfo || [{ cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
        setFusionDate(state.fusionDate || '');
        setRecordingDescription(state.recordingDescription || '');
        
        // Restore file info
        if (state.file_info) {
          setFiles([{
            file_id: state.file_info.file_id || 'restored',
            filename: recordingData.filename,
            ...state.file_info,
          }]);
        }
        
        // Restore trace data
        if (state.trace_data) {
          setTraceData(state.trace_data);
        }
        
        // Restore beats
        if (state.beats) {
          setBeats(state.beats);
        }
        
        // Restore detection params
        if (state.detectionParams) {
          setDetectionParams(state.detectionParams);
        }
        
        // Restore filter params
        if (state.filterParams) {
          setFilterParams(state.filterParams);
        }
        
        // Restore signal stats
        if (state.signalStats) {
          setSignalStats(state.signalStats);
        }
        
        // Restore validation state
        setIsValidated(state.isValidated || false);
        
        // Restore metrics
        if (state.metrics) {
          setMetrics(state.metrics);
        }
        
        // Restore HRV results
        if (state.hrvResults) {
          setHrvResults(state.hrvResults);
        }
        
        // Restore per-minute data
        if (state.perMinuteData) {
          setPerMinuteData(state.perMinuteData);
        }
        
        // Restore drug config
        if (state.selectedDrugs) {
          setSelectedDrugs(state.selectedDrugs);
        }
        if (state.drugSettings) {
          setDrugSettings(state.drugSettings);
        }
        if (state.otherDrugs) {
          setOtherDrugs(state.otherDrugs);
        }
        
        // Restore drug readout settings (Spontaneous Activity)
        if (state.drugReadoutSettings) {
          setDrugReadoutSettings(state.drugReadoutSettings);
        }
        
        // Restore baseline enabled (default to true for backward compatibility)
        setBaselineEnabled(state.baselineEnabled !== false);
        
        // Restore baseline minute settings
        setBaselineHrvMinute(state.baselineHrvMinute ?? 0);
        setBaselineBfMinute(state.baselineBfMinute ?? 1);
        
        // Restore light stim
        setLightEnabled(state.lightEnabled !== false);
        if (state.lightParams) {
          setLightParams(state.lightParams);
        }
        if (state.lightPulses) {
          setLightPulses(state.lightPulses);
        }
        if (state.lightHrv) {
          setLightHrv(state.lightHrv);
        }
        if (state.lightHrvDetrended) {
          setLightHrvDetrended(state.lightHrvDetrended);
        }
        if (state.lightResponse) {
          setLightResponse(state.lightResponse);
        }
        
        // Restore LOESS frac setting (or from detrended results, or default)
        if (state.loessFrac !== undefined) {
          setLoessFrac(state.loessFrac);
        } else if (state.lightHrvDetrended?.loess_frac_used) {
          setLoessFrac(state.lightHrvDetrended.loess_frac_used);
        } else {
          setLoessFrac(0.25);
        }
        
        // Mark as exported if was saved before (since save requires export)
        setHasExported(true);
      });
      
      // Set session and view immediately for faster perceived loading
      setSessionId('restored-' + recordingData.id);
      setAppView('analysis');
      
      toast.success(`Loaded "${recordingData.name}"`);
    } finally {
      setRecordingLoading(false);
    }
  }, []);

  // Cancel edit - revert to saved version
  const handleCancelEdit = useCallback(async () => {
    if (!savedRecordingData) {
      toast.error('No saved version to revert to');
      return;
    }
    
    // Reload the saved recording data
    await handleOpenRecording(savedRecordingData);
    toast.success('Reverted to saved version');
  }, [savedRecordingData, handleOpenRecording]);

  // Build analysis state for saving
  const buildAnalysisState = useCallback(() => {
    return {
      // File info
      file_info: activeFile ? {
        file_id: activeFile.file_id,
        filename: activeFile.filename,
        duration_sec: activeFile.duration_sec,
        sample_rate: activeFile.sample_rate,
        n_samples: activeFile.n_samples,
      } : null,
      filename: activeFile?.filename,
      recordingName,
      
      // Recording metadata
      recordingDate,
      organoidInfo,
      fusionDate,
      recordingDescription,
      
      // Trace data (decimated for storage)
      trace_data: traceData,
      
      // Beats
      beats,
      
      // Detection params
      detectionParams,
      filterParams,
      signalStats,
      
      // Validation
      isValidated,
      
      // Metrics
      metrics,
      
      // HRV
      hrvResults,
      perMinuteData,
      
      // Drug config
      selectedDrugs,
      drugSettings,
      otherDrugs,
      
      // Drug readout settings (Spontaneous Activity)
      drugReadoutSettings,
      
      // Baseline enabled and minute settings
      baselineEnabled,
      baselineHrvMinute,
      baselineBfMinute,
      
      // Light stim
      lightEnabled,
      lightParams,
      lightPulses,
      lightHrv,
      lightHrvDetrended,
      lightResponse,
      loessFrac,  // LOESS span setting
    };
  }, [
    activeFile, recordingName, traceData, beats, detectionParams, filterParams, signalStats,
    isValidated, metrics, hrvResults, perMinuteData, selectedDrugs, drugSettings, otherDrugs,
    drugReadoutSettings, baselineEnabled, baselineHrvMinute, baselineBfMinute,
    lightEnabled, lightParams, lightPulses, lightHrv, lightHrvDetrended, lightResponse,
    recordingDate, organoidInfo, fusionDate, recordingDescription, loessFrac
  ]);

  // Handle save complete
  const handleSaveComplete = useCallback(async (folderId, recordingId) => {
    setSavedFolderId(folderId);
    if (recordingId) {
      setSavedRecordingId(recordingId);
    }
    setIsModified(false);  // Reset modified state after save
    
    // Fetch folder name if folderId exists
    if (folderId) {
      try {
        const { data: folderData } = await api.getFolder(folderId);
        setSavedFolderName(folderData.name);
      } catch (err) {
        console.error('Failed to fetch folder name:', err);
      }
    }
  }, []);

  // --- RENDER ---
  
  // Home view - folder browser
  if (appView === 'home') {
    return (
      <div className="min-h-screen bg-[#09090b]">
        <Toaster theme="dark" position="top-right" />
        <HomeBrowser 
          onNewAnalysis={() => setAppView('upload')}
          onOpenRecording={handleOpenRecording}
          initialFolderId={navigateToFolderId}
        />
      </div>
    );
  }

  // Upload view - file upload screen
  if (appView === 'upload' || !sessionId) {
    return (
      <div className="min-h-screen bg-[#09090b]">
        <Toaster theme="dark" position="top-right" />
        <div className="p-4">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => setAppView('home')}
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
        <FileUpload onUpload={(files) => { handleUpload(files); setAppView('analysis'); }} loading={uploadLoading} appName="NEHER" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <Toaster theme="dark" position="top-right" />

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800 px-4 py-2"
              data-testid="app-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={handleGoHome}
              data-testid="home-btn"
            >
              <Home className="w-4 h-4 text-zinc-400" />
            </Button>
            <h1 className="text-base font-semibold tracking-tight" style={{ fontFamily: 'Manrope' }}>
              NEHER
            </h1>
            <Separator orientation="vertical" className="h-5 bg-zinc-700" />
            {/* Status badge: Saved (emerald), Edit | Cancel (orange), Unsaved (red) */}
            {savedRecordingId && !isModified && (
              <Badge variant="outline" className="h-6 text-[10px] border-emerald-700/50 text-emerald-400 px-2">
                Saved
              </Badge>
            )}
            {savedRecordingId && isModified && (
              <Badge variant="outline" className="h-6 text-[10px] border-orange-700/50 text-orange-400 px-2 flex items-center gap-0">
                <span>Edit</span>
                <Separator orientation="vertical" className="h-3 bg-orange-700/50 mx-1.5" />
                <button 
                  onClick={handleCancelEdit}
                  className="hover:text-orange-200 transition-colors"
                  title="Revert to saved version"
                >
                  Cancel
                </button>
              </Badge>
            )}
            {!savedRecordingId && metrics && (
              <Badge variant="outline" className="h-6 text-[10px] border-red-700/50 text-red-400 px-2">
                Unsaved
              </Badge>
            )}
            {files.length > 1 && (
              <Select
                value={String(activeFileIdx)}
                onValueChange={(v) => handleFileSwitch(parseInt(v))}
              >
                <SelectTrigger data-testid="file-selector" className="h-6 w-48 text-[10px] font-data bg-zinc-900 border-zinc-800 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {files.map((f, i) => (
                    <SelectItem key={i} value={String(i)}>
                      <span className="flex items-center gap-1">
                        <FileAudio className="w-3 h-3" />
                        {f.filename}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {activeFile && (
              <Badge variant="outline" className="h-6 font-data text-[10px] border-zinc-700 text-zinc-400 px-2">
                {activeFile.filename} &middot; {activeFile.duration_sec.toFixed(1)}s &middot; {activeFile.sample_rate}Hz
              </Badge>
            )}
            
            {/* Recording name - inline editable */}
            <Input
              data-testid="recording-name-input"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              className="h-6 w-56 text-[10px] font-data bg-transparent border-none text-zinc-300 px-2 focus:bg-zinc-800/50 focus:ring-1 focus:ring-zinc-700"
              placeholder="Recording name..."
            />
            
            <Separator orientation="vertical" className="h-4 bg-zinc-700" />
            
            {/* Light indicator - show if light is enabled */}
            {lightEnabled && (
              <Badge 
                variant="outline" 
                className="h-6 text-[10px] border-yellow-700 bg-yellow-950/30 text-yellow-400 px-2"
              >
                <Zap className="w-3 h-3 mr-1" /> 
                Light
              </Badge>
            )}
            
            {/* Drug selection */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="h-6 text-[10px] border-zinc-700 text-zinc-400 px-2 cursor-pointer hover:bg-zinc-800/50"
                  >
                    <FlaskConical className="w-3 h-3 mr-1" /> 
                    {selectedDrugs.length + otherDrugs.length > 0 
                      ? `${selectedDrugs.length + otherDrugs.length} Drug${selectedDrugs.length + otherDrugs.length > 1 ? 's' : ''}`
                      : 'Add Drug'
                    }
                    <Plus className="w-3 h-3 ml-1" />
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                  {Object.entries(DRUG_CONFIG).map(([key, config]) => (
                    <DropdownMenuItem
                      key={key}
                      className={`text-xs cursor-pointer ${selectedDrugs.includes(key) ? 'text-purple-400' : 'text-zinc-300'}`}
                      onClick={() => toggleDrug(key)}
                    >
                      {selectedDrugs.includes(key) && <Check className="w-3 h-3 mr-2" />}
                      {!selectedDrugs.includes(key) && <span className="w-3 mr-2" />}
                      {config.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <DropdownMenuItem
                    className="text-xs text-zinc-400 cursor-pointer"
                    onClick={addOtherDrug}
                  >
                    <Plus className="w-3 h-3 mr-2" /> Other (custom)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Show selected drugs as small badges - purple color */}
              {selectedDrugs.map(drugKey => {
                const config = DRUG_CONFIG[drugKey];
                return (
                  <Badge 
                    key={drugKey} 
                    variant="outline" 
                    className="h-6 text-[10px] border-purple-800 bg-purple-950/30 text-purple-400 cursor-pointer hover:bg-purple-950/50 px-2"
                    onClick={() => toggleDrug(drugKey)}
                  >
                    {config.name}
                    <X className="w-2.5 h-2.5 ml-1" />
                  </Badge>
                );
              })}
              {otherDrugs.map(drug => (
                <Badge 
                  key={drug.id} 
                  variant="outline" 
                  className="h-6 text-[10px] border-purple-800 bg-purple-950/30 text-purple-400 cursor-pointer hover:bg-purple-950/50 px-2"
                  onClick={() => removeOtherDrug(drug.id)}
                >
                  {drug.name || 'Other'}
                  <X className="w-2.5 h-2.5 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Go to Folder button - only shown if recording is in a folder */}
            {savedFolderId && (
              <Button
                data-testid="go-to-folder-btn"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-zinc-500 hover:text-zinc-300 rounded-sm gap-1"
                onClick={() => {
                  const targetFolderId = savedFolderId;
                  handleReset();
                  setNavigateToFolderId(targetFolderId);
                  setAppView('home');
                }}
              >
                <FolderOpen className="w-3 h-3" /> Go to Folder
              </Button>
            )}
            {/* Comparison button - only shown if recording is in a folder */}
            {savedFolderId && (
              <Button
                data-testid="comparison-btn"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-950/30 rounded-sm gap-1"
                onClick={() => setShowComparisonDialog(true)}
              >
                <BarChart3 className="w-3 h-3" /> Comparison
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Per-drug settings bar - only shown when drugs are selected */}
      {(selectedDrugs.length > 0 || otherDrugs.length > 0) && (
        <div className="border-b border-zinc-800 bg-zinc-950/50 px-4 py-1.5">
          <ScrollArea className="max-h-[150px]">
            <div className="space-y-2">
              {/* Predefined drugs with settings */}
              {selectedDrugs.map(drugKey => {
                const config = DRUG_CONFIG[drugKey];
                const settings = drugSettings[drugKey] || {};
                return (
                  <div key={drugKey} className="flex items-center gap-3 p-2 bg-zinc-900/30 rounded-sm border border-zinc-800/50 relative z-10">
                    <span className="text-[10px] font-medium text-zinc-300 w-24">{config.name}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        data-testid={`drug-${drugKey}-concentration`}
                        type="text"
                        value={settings.concentration !== undefined ? settings.concentration : config.defaultConc}
                        onChange={(e) => updateDrugSetting(drugKey, 'concentration', e.target.value)}
                        className="h-6 w-14 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                      />
                      <span className="text-[9px] text-zinc-500">µM</span>
                    </div>
                    <Separator orientation="vertical" className="h-4 bg-zinc-700" />
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-600" />
                      <span className="text-[9px] text-zinc-500">Start:</span>
                      <Input
                        data-testid={`drug-${drugKey}-perfusion-start`}
                        type="number"
                        step="0.5"
                        value={settings.perfusionStart !== undefined ? settings.perfusionStart : 3}
                        onChange={(e) => updateDrugSetting(drugKey, 'perfusionStart', parseFloat(e.target.value) || 0)}
                        className="h-6 w-12 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                      />
                      <span className="text-[9px] text-zinc-500">min, Delay:</span>
                      <Input
                        data-testid={`drug-${drugKey}-perfusion-time`}
                        type="number"
                        step="0.5"
                        value={settings.perfusionTime !== undefined ? settings.perfusionTime : 3}
                        onChange={(e) => updateDrugSetting(drugKey, 'perfusionTime', parseFloat(e.target.value) || 0)}
                        className="h-6 w-12 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                      />
                      <span className="text-[9px] text-zinc-500">min</span>
                    </div>
                    <Badge variant="outline" className="text-[8px] border-zinc-700 text-zinc-500">
                      Perf.Time: BF@{config.bfReadout ?? 'peak'}min HRV@{config.hrvReadout ?? 'peak'}min
                    </Badge>
                  </div>
                );
              })}
              
              {/* Other drugs */}
              {otherDrugs.map(drug => (
                <div key={drug.id} className="flex items-center gap-3 p-2 bg-zinc-900/30 rounded-sm border border-zinc-800/50">
                  <Input
                    value={drug.name}
                    onChange={(e) => updateOtherDrug(drug.id, 'name', e.target.value)}
                    className="h-6 w-24 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                    placeholder="Drug name"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={drug.concentration}
                      onChange={(e) => updateOtherDrug(drug.id, 'concentration', e.target.value)}
                      className="h-6 w-14 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                    />
                    <span className="text-[9px] text-zinc-500">µM</span>
                  </div>
                  <Separator orientation="vertical" className="h-4 bg-zinc-700" />
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-600" />
                    <span className="text-[9px] text-zinc-500">Start:</span>
                    <Input
                      type="number"
                      step="0.5"
                      value={drug.perfusionStart}
                      onChange={(e) => updateOtherDrug(drug.id, 'perfusionStart', parseFloat(e.target.value) || 0)}
                      className="h-6 w-12 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                    />
                    <span className="text-[9px] text-zinc-500">min, Delay:</span>
                    <Input
                      type="number"
                      step="0.5"
                      value={drug.perfusionTime}
                      onChange={(e) => updateOtherDrug(drug.id, 'perfusionTime', parseFloat(e.target.value) || 0)}
                      className="h-6 w-12 text-[9px] font-data bg-zinc-950 border-zinc-700 rounded-sm px-2"
                    />
                    <span className="text-[9px] text-zinc-500">min</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-zinc-500 hover:text-red-400"
                    onClick={() => removeOtherDrug(drug.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main content */}
      <main className="p-4 md:p-6 pt-2">
        <Tabs defaultValue="trace" className="w-full">
          <TabsList className="bg-zinc-900/50 border border-zinc-800 rounded-sm h-9 mb-4"
                    data-testid="main-tabs">
            <TabsTrigger value="trace" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         data-testid="tab-trace">
              <Activity className="w-3 h-3" /> Trace
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         disabled={!isValidated} data-testid="tab-analysis">
              <BarChart3 className="w-3 h-3" /> Spontaneous Activity
            </TabsTrigger>
            <TabsTrigger value="light" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         disabled={!isValidated} data-testid="tab-light">
              <Zap className="w-3 h-3" /> Light Stimulus
            </TabsTrigger>
            <TabsTrigger value="save" className="text-xs rounded-sm gap-1 data-[state=active]:bg-emerald-800"
                         disabled={!isValidated} data-testid="tab-save">
              <Save className="w-3 h-3" /> Save Recording
            </TabsTrigger>
            <TabsTrigger value="export" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         disabled={!isValidated} data-testid="tab-export">
              <Download className="w-3 h-3" /> Export
            </TabsTrigger>
          </TabsList>

          {/* Trace Tab */}
          <TabsContent value="trace">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              <DetectionPanel
                params={detectionParams}
                onChange={handleDetectionParamsChange}
                filterParams={filterParams}
                onFilterChange={handleFilterParamsChange}
                signalStats={signalStats}
                onDetect={handleDetect}
                onValidate={handleValidate}
                onUnvalidate={handleUnvalidate}
                isValidated={isValidated}
                detectLoading={detectLoading}
                beats={beats}
              />
              <div className="space-y-10">
                <TraceViewer
                  traceData={traceData}
                  beats={beats}
                  onAddBeat={handleAddBeat}
                  onRemoveBeat={handleRemoveBeat}
                  lightPulses={lightPulses}
                  isValidated={isValidated}
                  threshold={detectionParams.threshold}
                  onThresholdChange={(v) => { setIsModified(true); setDetectionParams(p => ({ ...p, threshold: v })); }}
                  signalStats={signalStats}
                  invert={detectionParams.invert}
                  zoomDomain={traceZoomDomain}
                  onZoomChange={setTraceZoomDomain}
                />
                {/* BF chart shown when metrics exist (kept visible during re-editing as reference) */}
                {metrics && (
                  <div className="mt-4">
                    <BFChart 
                      metrics={metrics} 
                      lightPulses={lightPulses} 
                      zoomDomain={traceZoomDomain}
                      onZoomChange={setTraceZoomDomain}
                      isValidated={isValidated}
                    />
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Spontaneous Activity Tab */}
          <TabsContent value="analysis">
            <AnalysisPanel
              metrics={metrics}
              hrvResults={hrvResults}
              perMinuteData={perMinuteData}
              onComputeHRV={handleComputeHRV}
              baselineEnabled={baselineEnabled}
              onBaselineEnabledChange={handleBaselineToggle}
              baselineHrvMinute={baselineHrvMinute}
              onBaselineHrvMinuteChange={handleBaselineHrvMinuteChange}
              baselineBfMinute={baselineBfMinute}
              onBaselineBfMinuteChange={handleBaselineBfMinuteChange}
              analysisLoading={analysisLoading}
              filterSettings={filterParams}
              hasDrug={hasDrug}
              drugSettings={drugSettings}
              selectedDrugs={selectedDrugs}
              otherDrugs={otherDrugs}
              DRUG_CONFIG={DRUG_CONFIG}
              lightPulses={lightPulses}
              drugReadoutSettings={drugReadoutSettings}
              onDrugReadoutSettingsChange={handleDrugReadoutSettingsChange}
            />
          </TabsContent>

          {/* Light Tab */}
          <TabsContent value="light">
            <LightPanel
              lightParams={lightParams}
              onParamsChange={handleLightParamsChange}
              pulses={lightPulses}
              onDetectPulses={handleDetectPulses}
              onPulsesUpdate={handlePulsesUpdate}
              lightHrv={lightHrv}
              lightHrvDetrended={lightHrvDetrended}
              lightResponse={lightResponse}
              onComputeLightHRV={handleLightHRV}
              onComputeLightHRVDetrended={handleLightHRVDetrended}
              onComputeLightResponse={handleLightResponse}
              loading={analysisLoading}
              metrics={metrics}
              lightEnabled={lightEnabled}
              onLightEnabledChange={handleLightEnabledToggle}
              loessFrac={loessFrac}
              onLoessFracChange={handleLoessFracChange}
            />
          </TabsContent>

          {/* Export Tab */}
          <TabsContent value="export">
            <ExportPanel
              metrics={metrics}
              hrvResults={hrvResults}
              lightHrv={lightEnabled ? lightHrv : null}
              lightResponse={lightEnabled ? lightResponse : null}
              onExportCsv={() => { handleExportCsv(); setHasExported(true); }}
              onExportXlsx={() => { handleExportXlsx(); setHasExported(true); }}
              onExportPdf={() => { handleExportPdf(); setHasExported(true); }}
              loading={exportLoading}
              recordingName={recordingName}
              drugUsed={[...selectedDrugs, ...otherDrugs.map(d => d.name)].filter(Boolean).join(',')}
              perMinuteData={perMinuteData}
              originalFilename={activeFile?.filename}
              drugReadoutSettings={drugReadoutSettings}
            />
          </TabsContent>

          {/* Save Recording Tab */}
          <TabsContent value="save">
            <div className="max-w-lg mx-auto">
              <SaveRecording
                getAnalysisState={buildAnalysisState}
                onSaveComplete={handleSaveComplete}
                existingRecordingId={savedRecordingId}
                existingFolderId={savedFolderId}
                recordingDate={recordingDate}
                setRecordingDate={handleRecordingDateChange}
                organoidInfo={organoidInfo}
                setOrganoidInfo={handleOrganoidInfoChange}
                fusionDate={fusionDate}
                setFusionDate={handleFusionDateChange}
                recordingDescription={recordingDescription}
                setRecordingDescription={handleRecordingDescriptionChange}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Comparison Dialog */}
      <Dialog open={showComparisonDialog} onOpenChange={setShowComparisonDialog}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              Comparison: {savedFolderName || 'Loading...'}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(85vh-100px)]">
            {savedFolderId && (
              <FolderComparison 
                folder={{ id: savedFolderId, name: savedFolderName || '' }}
                onBack={() => setShowComparisonDialog(false)}
                embedded={true}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
