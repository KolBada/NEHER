import { useState, useCallback } from 'react';
import '@/App.css';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Activity, BarChart3, Zap, Download, FileAudio, RotateCcw, Save, Beaker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import FileUpload from '@/components/FileUpload';
import TraceViewer from '@/components/TraceViewer';
import DetectionPanel from '@/components/DetectionPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import LightPanel from '@/components/LightPanel';
import ExportPanel from '@/components/ExportPanel';
import api, { downloadBlob } from '@/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush
} from 'recharts';

// Inline BF chart component for the Trace tab
function BFChart({ metrics }) {
  const data = metrics.filtered_beat_times_min.map((t, i) => ({
    time: t,
    bf: metrics.filtered_bf_bpm[i],
  }));
  return (
    <div className="trace-container" data-testid="bf-chart">
      <div className="p-2 bg-zinc-900/50 border-b border-zinc-800">
        <span className="text-xs text-zinc-400">Beat Frequency (filtered) &mdash; bpm vs min</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']}
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{ value: 'min', fill: '#52525b', fontSize: 9, position: 'insideBottomRight', offset: -5 }} />
          <YAxis tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }} width={45}
            label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
          <Tooltip
            contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
            labelFormatter={(v) => `${Number(v).toFixed(2)} min`}
            formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']} />
          <Line type="monotone" dataKey="bf" stroke="#22d3ee" strokeWidth={1} dot={false} isAnimationActive={false} />
          <Brush height={20} stroke="#3f3f46" fill="#0c0c0e" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function App() {
  // Session
  const [sessionId, setSessionId] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  // Recording metadata
  const [recordingName, setRecordingName] = useState('');
  const [drugUsed, setDrugUsed] = useState('');

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

  // Light
  const [lightEnabled, setLightEnabled] = useState(true);
  const [lightParams, setLightParams] = useState({
    startTime: 180, pulseDuration: 20, interval: 'decreasing', nPulses: 5,
    autoDetect: true, searchRange: 20,
  });
  const [lightPulses, setLightPulses] = useState(null);
  const [lightHrv, setLightHrv] = useState(null);
  const [lightResponse, setLightResponse] = useState(null);

  // Loading
  const [uploadLoading, setUploadLoading] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const activeFile = files[activeFileIdx] || null;

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
    setLightResponse(null);
    setRecordingName(fileData.filename?.replace('.abf', '') || '');
  }, []);

  // Upload
  const handleUpload = useCallback(async (uploadedFiles) => {
    setUploadLoading(true);
    try {
      const formData = new FormData();
      uploadedFiles.forEach(f => formData.append('files', f));
      const { data } = await api.upload(formData);
      setSessionId(data.session_id);
      setFiles(data.files);
      setActiveFileIdx(0);
      if (data.files.length > 0) loadFileData(data.files[0]);
      toast.success(`Loaded ${data.files.length} file(s) — ${data.files[0]?.n_beats_detected} beats detected`);
    } catch (err) {
      toast.error('Upload failed: ' + (err.response?.data?.detail || err.message));
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
        baseline_hrv_start: baselineParams.hrvStart ?? 0,
        baseline_hrv_end: baselineParams.hrvEnd ?? 3,
        baseline_bf_start: baselineParams.bfStart ?? 1,
        baseline_bf_end: baselineParams.bfEnd ?? 2,
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
      setLightResponse(null);
      const startMin = (data.detected_start_sec / 60).toFixed(2);
      toast.success(`${data.pulses.length} pulses detected (start: ${startMin} min)`);
    } catch (err) {
      toast.error('Pulse detection failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics]);

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
      toast.success('Light response metrics computed');
    } catch (err) {
      toast.error('Light response failed');
    } finally {
      setAnalysisLoading(false);
    }
  }, [metrics, lightPulses]);

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
    if (drugUsed) summary['Drug Used'] = drugUsed;
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

    return {
      per_beat_data: perBeat,
      hrv_windows: hrvResults?.windows || null,
      light_metrics: lightEnabled ? (lightHrv?.per_pulse || null) : null,
      light_response: lightEnabled ? (lightResponse?.per_stim || null) : null,
      summary: Object.keys(summary).length > 0 ? summary : null,
      filename: recordingName || activeFile?.filename?.replace('.abf', '') || 'analysis',
      recording_name: recordingName,
      drug_used: drugUsed,
      per_minute_data: perMinuteData,
      baseline: hrvResults?.baseline,
    };
  }, [metrics, hrvResults, lightHrv, lightResponse, activeFile, recordingName, drugUsed, lightEnabled, perMinuteData]);

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
    setLightResponse(null);
    setRecordingName('');
    setDrugUsed('');
    setLightEnabled(true);
  }, []);

  // --- RENDER ---
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#09090b]">
        <Toaster theme="dark" position="top-right" />
        <FileUpload onUpload={handleUpload} loading={uploadLoading} />
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
            <Activity className="w-5 h-5 text-cyan-400" />
            <h1 className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'Manrope' }}>
              NeuroVoltage
            </h1>
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
            onClick={handleReset}
          >
            <RotateCcw className="w-3 h-3" /> New Session
          </Button>
        </div>
      </header>

      {/* Recording Metadata Bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/50 px-4 py-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Save className="w-3 h-3 text-zinc-500" />
            <Label className="text-[10px] text-zinc-500">Recording Name:</Label>
            <Input
              data-testid="recording-name-input"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              className="h-6 w-48 text-xs font-data bg-zinc-900 border-zinc-800 rounded-sm"
              placeholder="Enter recording name..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Beaker className="w-3 h-3 text-zinc-500" />
            <Label className="text-[10px] text-zinc-500">Drug Used:</Label>
            <Select value={drugUsed} onValueChange={setDrugUsed}>
              <SelectTrigger data-testid="drug-select" className="h-6 w-36 text-xs font-data bg-zinc-900 border-zinc-800 rounded-sm">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="isoproterenol">Isoproterenol</SelectItem>
                <SelectItem value="carbachol">Carbachol</SelectItem>
                <SelectItem value="propranolol">Propranolol</SelectItem>
                <SelectItem value="atropine">Atropine</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {drugUsed === 'other' && (
              <Input
                value={drugUsed}
                onChange={(e) => setDrugUsed(e.target.value)}
                className="h-6 w-32 text-xs font-data bg-zinc-900 border-zinc-800 rounded-sm"
                placeholder="Specify..."
              />
            )}
          </div>
        </div>
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
              <BarChart3 className="w-3 h-3" /> Analysis
            </TabsTrigger>
            <TabsTrigger value="light" className="text-xs rounded-sm gap-1 data-[state=active]:bg-zinc-800"
                         disabled={!isValidated} data-testid="tab-light">
              <Zap className="w-3 h-3" /> Light Stim
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
                />
                {/* BF chart shown after validation */}
                {isValidated && metrics && (
                  <BFChart metrics={metrics} />
                )}
              </div>
            </div>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis">
            <AnalysisPanel
              metrics={metrics}
              hrvResults={hrvResults}
              perMinuteData={perMinuteData}
              onComputeHRV={handleComputeHRV}
              analysisLoading={analysisLoading}
              filterSettings={filterParams}
            />
          </TabsContent>

          {/* Light Tab */}
          <TabsContent value="light">
            <LightPanel
              lightParams={lightParams}
              onParamsChange={setLightParams}
              pulses={lightPulses}
              onDetectPulses={handleDetectPulses}
              lightHrv={lightHrv}
              lightResponse={lightResponse}
              onComputeLightHRV={handleLightHRV}
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
              onExportCsv={handleExportCsv}
              onExportXlsx={handleExportXlsx}
              onExportPdf={handleExportPdf}
              loading={exportLoading}
              recordingName={recordingName}
              drugUsed={drugUsed}
              perMinuteData={perMinuteData}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
