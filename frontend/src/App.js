import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { Activity, BarChart3, Zap, Download, FileAudio, RotateCcw, Save, Beaker, Clock, Plus, X, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

import FileUpload from '@/components/FileUpload';
import TraceViewer from '@/components/TraceViewer';
import DetectionPanel from '@/components/DetectionPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import LightPanel from '@/components/LightPanel';
import ExportPanel from '@/components/ExportPanel';
import HomeBrowser from '@/components/HomeBrowser';
import SaveRecording from '@/components/SaveRecording';
import api, { downloadBlob } from '@/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea
} from 'recharts';

// Drug configurations with default readout times
const DRUG_CONFIG = {
  propranolol: { name: 'Propranolol', defaultConc: '5', bfReadout: 12, hrvReadout: 10 },
  nepicastat: { name: 'Nepicastat', defaultConc: '30', bfReadout: 42, hrvReadout: 40 },
  tetrodotoxin: { name: 'Tetrodotoxin', defaultConc: '1', bfReadout: 12, hrvReadout: 10 },
  acetylcholine: { name: 'Acetylcholine', defaultConc: '1', bfReadout: 3, hrvReadout: 2 },
  isoproterenol: { name: 'Isoproterenol', defaultConc: '1', bfReadout: null, hrvReadout: null, manualPeak: true },
};

// Format time as min:sec
function formatTimeMinSec(minutes) {
  const totalSec = minutes * 60;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  if (sec === 0) return `${min}min`;
  return `${min}min${sec}s`;
}

// Inline BF chart component for the Trace tab
function BFChart({ metrics, lightPulses }) {
  const [zoomDomain, setZoomDomain] = useState(null);
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
        setZoomDomain(null);
      } else {
        setZoomDomain([newMin, newMax]);
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [data, zoomDomain, timeBounds]);

  const handleResetZoom = useCallback(() => {
    setZoomDomain(null);
  }, []);

  return (
    <div className="trace-container" data-testid="bf-chart">
      <div className="p-2 bg-zinc-900/50 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-400">Beat Frequency (filtered) &mdash; bpm vs time</span>
        <div className="flex items-center gap-2">
          {zoomDomain && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-400" onClick={handleResetZoom}>
              <RotateCcw className="w-3 h-3 mr-1" /> Reset Zoom
            </Button>
          )}
          <span className="text-[9px] text-zinc-600">Ctrl+Scroll to zoom</span>
        </div>
      </div>
      <div ref={containerRef} style={{ touchAction: 'none' }}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={filteredData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis dataKey="time" type="number" 
              domain={zoomDomain || ['dataMin', 'dataMax']}
              tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
              tickFormatter={(v) => formatTimeMinSec(v)} />
            <YAxis tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }} width={45}
              label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
              labelFormatter={(v) => formatTimeMinSec(v)}
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
            <Line type="monotone" dataKey="bf" stroke="#22d3ee" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Brush height={20} stroke="#3f3f46" fill="#0c0c0e" />
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
  const [hasExported, setHasExported] = useState(false);

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
    threshold: null, minDistance: 0.3, prominence: null, invert: false
  });
  const [filterParams, setFilterParams] = useState({
    lowerPct: 50, upperPct: 200
  });
  const [signalStats, setSignalStats] = useState(null);

  // Validation
  const [isValidated, setIsValidated] = useState(false);
  const [metrics, setMetrics] = useState(null);

  // HRV
  const [hrvResults, setHrvResults] = useState(null);
  const [perMinuteData, setPerMinuteData] = useState(null);
  
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

  // Loading
  const [uploadLoading, setUploadLoading] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

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
    try {
      const { data } = await api.detectBeats({
        session_id: sessionId,
        file_id: activeFile.file_id,
        threshold: detectionParams.threshold,
        min_distance: detectionParams.minDistance,
        prominence: detectionParams.prominence,
        invert: detectionParams.invert,
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
    setBeats(prev => [...prev, { timeSec, voltage }].sort((a, b) => a.timeSec - b.timeSec));
  }, []);

  const handleRemoveBeat = useCallback((idx) => {
    setBeats(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Validate
  const handleValidate = useCallback(async () => {
    if (beats.length < 2) { toast.error('Need at least 2 beats'); return; }
    setAnalysisLoading(true);
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
  const handleUnvalidate = useCallback(() => {
    setIsValidated(false);
    setMetrics(null);
    setHrvResults(null);
    setPerMinuteData(null);
    setLightPulses(null);
    setLightHrv(null);
    setLightHrvDetrended(null);
    setLightResponse(null);
  }, []);

  // HRV
  const handleComputeHRV = useCallback(async (readoutMinute, baselineParams = {}) => {
    if (!metrics) return;
    setAnalysisLoading(true);
    try {
      const { data } = await api.hrvAnalysis({
        beat_times_min: metrics.filtered_beat_times_min,
        bf_filtered: metrics.filtered_bf_bpm,
        readout_minute: readoutMinute,
        baseline_hrv_minute: baselineParams.hrvMinute ?? 0,
        baseline_bf_minute: baselineParams.bfMinute ?? 1,
      });
      setHrvResults(data);
      toast.success(`HRV computed — ${data.windows.length} windows`);
    } catch (err) {
      toast.error('HRV failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics]);

  // Light detect
  const handleDetectPulses = useCallback(async (params) => {
    setAnalysisLoading(true);
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
      setLightHrvDetrended(data);
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
      toast.success('Light HRA metrics computed');
    } catch (err) {
      toast.error('Light HRA failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, lightPulses]);

  // Drug selection toggle with default settings
  const toggleDrug = useCallback((drugKey) => {
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
    setOtherDrugs(prev => prev.filter(d => d.id !== id));
  }, []);

  // Update other drug
  const updateOtherDrug = useCallback((id, field, value) => {
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
    setSavedRecordingId(null);
    setSavedFolderId(null);
    setHasExported(false);
  }, []);

  // Go back to home view
  const handleGoHome = useCallback(() => {
    handleReset();
    setAppView('home');
  }, [handleReset]);

  // Handle opening a saved recording
  const handleOpenRecording = useCallback((recordingData) => {
    const state = recordingData.analysis_state;
    
    // Set recording identifiers
    setSavedRecordingId(recordingData.id);
    setSavedFolderId(recordingData.folder_id);
    
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
    
    // Mark as exported if was saved before (since save requires export)
    setHasExported(true);
    
    // Set a dummy session ID to enter analysis view
    setSessionId('restored-' + recordingData.id);
    setAppView('analysis');
    
    toast.success(`Loaded "${recordingData.name}"`);
  }, []);

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
      
      // Light stim
      lightEnabled,
      lightParams,
      lightPulses,
      lightHrv,
      lightHrvDetrended,
      lightResponse,
    };
  }, [
    activeFile, recordingName, traceData, beats, detectionParams, filterParams, signalStats,
    isValidated, metrics, hrvResults, perMinuteData, selectedDrugs, drugSettings, otherDrugs,
    drugReadoutSettings, lightEnabled, lightParams, lightPulses, lightHrv, lightHrvDetrended, lightResponse,
    recordingDate, organoidInfo, fusionDate, recordingDescription
  ]);

  // Handle save complete
  const handleSaveComplete = useCallback((folderId) => {
    setSavedFolderId(folderId);
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
        <FileUpload onUpload={(files) => { handleUpload(files); setAppView('analysis'); }} loading={uploadLoading} appName="NeuCarS" />
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
            <Activity className="w-5 h-5 text-cyan-400" />
            <h1 className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'Manrope' }}>
              NeuCarS
            </h1>
            {savedRecordingId && (
              <Badge variant="outline" className="text-[10px] border-emerald-700/50 text-emerald-400">
                Saved
              </Badge>
            )}
            {files.length > 1 && (
              <Select
                value={String(activeFileIdx)}
                onValueChange={(v) => handleFileSwitch(parseInt(v))}
              >
                <SelectTrigger data-testid="file-selector" className="h-7 w-48 text-xs font-data bg-zinc-900 border-zinc-800 rounded-sm">
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
              <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-500">
                {activeFile.filename} &middot; {activeFile.duration_sec.toFixed(1)}s &middot; {activeFile.sample_rate}Hz
              </Badge>
            )}
          </div>
          <Button
            data-testid="reset-btn"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-zinc-500 hover:text-zinc-300 rounded-sm gap-1"
            onClick={handleGoHome}
          >
            <RotateCcw className="w-3 h-3" /> New Session
          </Button>
        </div>
      </header>

      {/* Recording Metadata Bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-4 py-2">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Recording name */}
          <div className="flex items-center gap-2">
            <Save className="w-3 h-3 text-zinc-500" />
            <Label className="text-[10px] text-zinc-500">Recording:</Label>
            <Input
              data-testid="recording-name-input"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              className="h-6 w-40 text-xs font-data bg-zinc-900 border-zinc-800 rounded-sm"
              placeholder="Enter name..."
            />
          </div>
          
          <Separator orientation="vertical" className="h-8 bg-zinc-800" />
          
          {/* Drug selection */}
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-1">
              <Beaker className="w-3 h-3 text-zinc-500" />
              <Label className="text-[10px] text-zinc-500">Drugs:</Label>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(DRUG_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-1">
                  <Checkbox
                    id={`drug-${key}`}
                    checked={selectedDrugs.includes(key)}
                    onCheckedChange={() => toggleDrug(key)}
                    className="h-3 w-3"
                  />
                  <Label htmlFor={`drug-${key}`} className="text-[9px] text-zinc-400 cursor-pointer">
                    {config.name}
                  </Label>
                </div>
              ))}
              {/* Add Other drug button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] text-zinc-500 hover:text-zinc-300 px-1"
                onClick={addOtherDrug}
              >
                <Plus className="w-3 h-3 mr-0.5" /> Other
              </Button>
            </div>
          </div>
        </div>
        
        {/* Per-drug settings */}
        {(selectedDrugs.length > 0 || otherDrugs.length > 0) && (
          <ScrollArea className="mt-2 max-h-[150px]">
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
                    className="h-5 w-24 text-[9px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
                    placeholder="Drug name"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={drug.concentration}
                      onChange={(e) => updateOtherDrug(drug.id, 'concentration', e.target.value)}
                      className="h-5 w-12 text-[9px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
                    />
                    <span className="text-[9px] text-zinc-500">µM</span>
                  </div>
                  <Separator orientation="vertical" className="h-4 bg-zinc-700" />
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-zinc-600" />
                    <span className="text-[9px] text-zinc-500">Start:</span>
                    <Input
                      type="number"
                      value={drug.perfusionStart}
                      onChange={(e) => updateOtherDrug(drug.id, 'perfusionStart', parseFloat(e.target.value) || 0)}
                      className="h-5 w-10 text-[9px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
                    />
                    <span className="text-[9px] text-zinc-500">min, Delay:</span>
                    <Input
                      type="number"
                      value={drug.perfusionTime}
                      onChange={(e) => updateOtherDrug(drug.id, 'perfusionTime', parseFloat(e.target.value) || 0)}
                      className="h-5 w-10 text-[9px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
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
        )}
      </div>

      {/* Main content */}
      <main className="p-4 md:p-6">
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
            <TabsTrigger value="export" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         disabled={!isValidated} data-testid="tab-export">
              <Download className="w-3 h-3" /> Export
            </TabsTrigger>
            <TabsTrigger value="save" className="text-xs rounded-sm gap-1 data-[state=active]:bg-emerald-800"
                         disabled={!hasExported && !savedRecordingId} data-testid="tab-save">
              <Save className="w-3 h-3" /> Save Recording
            </TabsTrigger>
          </TabsList>

          {/* Trace Tab */}
          <TabsContent value="trace">
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
              <DetectionPanel
                params={detectionParams}
                onChange={setDetectionParams}
                filterParams={filterParams}
                onFilterChange={setFilterParams}
                signalStats={signalStats}
                onDetect={handleDetect}
                onValidate={handleValidate}
                onUnvalidate={handleUnvalidate}
                isValidated={isValidated}
                detectLoading={detectLoading}
                beats={beats}
              />
              <div className="space-y-4">
                <TraceViewer
                  traceData={traceData}
                  beats={beats}
                  onAddBeat={handleAddBeat}
                  onRemoveBeat={handleRemoveBeat}
                  lightPulses={lightPulses}
                  isValidated={isValidated}
                  threshold={detectionParams.threshold}
                  onThresholdChange={(v) => setDetectionParams(p => ({ ...p, threshold: v }))}
                  signalStats={signalStats}
                />
                {/* BF chart shown after validation */}
                {isValidated && metrics && (
                  <BFChart metrics={metrics} lightPulses={lightPulses} />
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
              analysisLoading={analysisLoading}
              filterSettings={filterParams}
              hasDrug={hasDrug}
              drugSettings={drugSettings}
              selectedDrugs={selectedDrugs}
              otherDrugs={otherDrugs}
              DRUG_CONFIG={DRUG_CONFIG}
              lightPulses={lightPulses}
              drugReadoutSettings={drugReadoutSettings}
              onDrugReadoutSettingsChange={setDrugReadoutSettings}
            />
          </TabsContent>

          {/* Light Tab */}
          <TabsContent value="light">
            <LightPanel
              lightParams={lightParams}
              onParamsChange={setLightParams}
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
              onLightEnabledChange={setLightEnabled}
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
              recordingDate={recordingDate}
              setRecordingDate={setRecordingDate}
              organoidInfo={organoidInfo}
              setOrganoidInfo={setOrganoidInfo}
              fusionDate={fusionDate}
              setFusionDate={setFusionDate}
              recordingDescription={recordingDescription}
              setRecordingDescription={setRecordingDescription}
              originalFilename={activeFile?.filename}
            />
          </TabsContent>

          {/* Save Recording Tab */}
          <TabsContent value="save">
            <div className="max-w-lg mx-auto">
              <SaveRecording
                analysisState={buildAnalysisState()}
                onSaveComplete={handleSaveComplete}
                existingRecordingId={savedRecordingId}
                existingFolderId={savedFolderId}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
