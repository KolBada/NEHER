import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Brush, ReferenceArea
} from 'recharts';
import { Loader2, Info, RotateCcw, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Helper component for inline info tooltips
function InfoTip({ text, children }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help whitespace-nowrap">
            {children}
            <Info className="w-3 h-3 text-white/70 hover:text-white flex-shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const CHART_COLORS = {
  bf: '#10b981',  // emerald green
  nn: '#228b22',  // forest green
  lnRmssd: '#fa8072',  // salmon
  sdnn: '#fa8072',     // salmon
  pnn50: '#fa8072',    // salmon
};

function MetricCard({ label, value, unit, sublabel, highlight, highlightColor = 'cyan', tooltip }) {
  const colorClasses = {
    cyan: {
      bg: 'bg-cyan-950/30 border-cyan-800',
      label: 'text-cyan-400',
      value: 'text-cyan-100'
    },
    purple: {
      bg: 'bg-purple-950/30 border-purple-800',
      label: 'text-purple-400',
      value: 'text-purple-100'
    }
  };
  const colors = highlight ? colorClasses[highlightColor] : { bg: 'bg-zinc-900/50 border-zinc-800', label: 'text-zinc-500', value: 'text-zinc-100' };
  
  const labelContent = tooltip ? (
    <InfoTip text={tooltip}>{label}</InfoTip>
  ) : label;
  
  return (
    <div className={`border rounded-sm p-3 ${colors.bg}`}>
      <p className={`text-[9px] uppercase tracking-wider font-bold ${colors.label}`}>{labelContent}</p>
      {sublabel && <p className="text-[8px] text-zinc-600">{sublabel}</p>}
      <p className={`text-lg font-data mt-1 ${colors.value}`}>
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

function SmallMetricCard({ label, value, unit }) {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-sm p-2">
      <p className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="text-sm font-data text-zinc-400">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
        {unit && <span className="text-[8px] text-zinc-600 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

// Info popover for HRV metrics explanation
function HrvInfoPopover({ metric }) {
  const info = {
    'SDNN': 'Standard deviation of NN intervals. Computed over a 3-minute sliding window, normalized to 70 bpm.',
    'RMSSD': 'Root mean square of successive NN differences. Computed over a 3-minute sliding window, normalized to 70 bpm.',
    'pNN50': 'Percentage of successive NN intervals differing by >50ms. Computed over a 3-minute sliding window, normalized to 70 bpm.',
  };
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-zinc-500 hover:text-zinc-300">
          <Info className="w-3 h-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-zinc-900 border-zinc-700 text-zinc-100 text-[10px] p-3">
        <p className="font-medium mb-1 text-zinc-100">{metric}</p>
        <p className="text-zinc-300">{info[metric] || 'HRV metric computed over 3-minute window, normalized to 70 bpm.'}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function AnalysisPanel({
  metrics, hrvResults, perMinuteData,
  onComputeHRV, analysisLoading, filterSettings, hasDrug,
  drugSettings, selectedDrugs, otherDrugs, DRUG_CONFIG, lightPulses,
  drugReadoutSettings, onDrugReadoutSettingsChange,
  baselineEnabled, onBaselineEnabledChange
}) {
  // Use drugReadoutSettings from props, with local fallbacks for backwards compatibility
  const hrvReadoutMinute = drugReadoutSettings?.hrvReadoutMinute ?? '';
  const bfReadoutMinute = drugReadoutSettings?.bfReadoutMinute ?? '';
  const enableHrvReadout = drugReadoutSettings?.enableHrvReadout ?? false;
  const enableBfReadout = drugReadoutSettings?.enableBfReadout ?? false;
  
  // Update functions that call parent callback
  const setHrvReadoutMinute = (val) => {
    onDrugReadoutSettingsChange?.({ ...drugReadoutSettings, hrvReadoutMinute: val });
  };
  const setBfReadoutMinute = (val) => {
    onDrugReadoutSettingsChange?.({ ...drugReadoutSettings, bfReadoutMinute: val });
  };
  const setEnableHrvReadout = (val) => {
    onDrugReadoutSettingsChange?.({ ...drugReadoutSettings, enableHrvReadout: val });
  };
  const setEnableBfReadout = (val) => {
    onDrugReadoutSettingsChange?.({ ...drugReadoutSettings, enableBfReadout: val });
  };
  
  // Baseline settings - HRV readout at minute 0, BF readout at minute 1
  const [baselineHrvMinute, setBaselineHrvMinute] = useState(0);
  const [baselineBfMinute, setBaselineBfMinute] = useState(1);

  // Zoom state for charts (shared across all charts)
  const [zoomDomain, setZoomDomain] = useState(null);
  const chartContainerRef = useRef(null);
  
  // Time bounds for charts
  const timeBounds = useMemo(() => {
    if (!hrvResults?.windows || hrvResults.windows.length === 0) return { min: 0, max: 10 };
    const mins = hrvResults.windows.map(w => w.minute);
    return { min: Math.min(...mins), max: Math.max(...mins) + 3 };
  }, [hrvResults]);

  // Handle wheel zoom (trackpad)
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50) return;
    e.preventDefault();
    
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const currentRange = currentMax - currentMin;
    
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const newRange = Math.max(1, Math.min(timeBounds.max - timeBounds.min, currentRange * zoomFactor));
    
    const center = (currentMin + currentMax) / 2;
    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;
    
    if (newMin < timeBounds.min) { newMin = timeBounds.min; newMax = newMin + newRange; }
    if (newMax > timeBounds.max) { newMax = timeBounds.max; newMin = newMax - newRange; }
    
    if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) {
      setZoomDomain(null);
    } else {
      setZoomDomain([newMin, newMax]);
    }
  }, [zoomDomain, timeBounds]);

  const handleResetZoom = useCallback(() => setZoomDomain(null), []);
  const handleZoomIn = useCallback(() => {
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const newRange = (currentMax - currentMin) * 0.7;
    const center = (currentMin + currentMax) / 2;
    setZoomDomain([Math.max(timeBounds.min, center - newRange/2), Math.min(timeBounds.max, center + newRange/2)]);
  }, [zoomDomain, timeBounds]);
  const handleZoomOut = useCallback(() => {
    if (!zoomDomain) return;
    const newRange = Math.min(timeBounds.max - timeBounds.min, (zoomDomain[1] - zoomDomain[0]) * 1.5);
    const center = (zoomDomain[0] + zoomDomain[1]) / 2;
    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;
    if (newMin < timeBounds.min) { newMin = timeBounds.min; newMax = newMin + newRange; }
    if (newMax > timeBounds.max) { newMax = timeBounds.max; newMin = newMax - newRange; }
    if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) setZoomDomain(null);
    else setZoomDomain([newMin, newMax]);
  }, [zoomDomain, timeBounds]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Data for BF and NN charts - must be defined before brush handlers
  const filteredBfData = useMemo(() => {
    if (!metrics) return [];
    return metrics.filtered_beat_times_min.map((t, i) => ({
      time: t,
      bf: metrics.filtered_bf_bpm[i],
    }));
  }, [metrics]);

  const filteredNnData = useMemo(() => {
    if (!metrics) return [];
    return metrics.filtered_beat_times_min.map((t, i) => ({
      time: t,
      nn: metrics.filtered_nn_ms[i],
    }));
  }, [metrics]);

  // Handle brush change for navigation
  const handleBfBrushChange = useCallback((brushArea) => {
    if (brushArea && brushArea.startIndex !== undefined && brushArea.endIndex !== undefined) {
      const startTime = filteredBfData[brushArea.startIndex]?.time;
      const endTime = filteredBfData[brushArea.endIndex]?.time;
      if (startTime !== undefined && endTime !== undefined) {
        setZoomDomain([startTime, endTime]);
      }
    }
  }, [filteredBfData]);

  const handleNnBrushChange = useCallback((brushArea) => {
    if (brushArea && brushArea.startIndex !== undefined && brushArea.endIndex !== undefined) {
      const startTime = filteredNnData[brushArea.startIndex]?.time;
      const endTime = filteredNnData[brushArea.endIndex]?.time;
      if (startTime !== undefined && endTime !== undefined) {
        setZoomDomain([startTime, endTime]);
      }
    }
  }, [filteredNnData]);

  // Calculate brush indices from zoom domain
  const bfBrushIndices = useMemo(() => {
    if (!filteredBfData.length) return { start: 0, end: 0 };
    if (!zoomDomain) return { start: 0, end: filteredBfData.length - 1 };
    let startIdx = filteredBfData.findIndex(d => d.time >= zoomDomain[0]);
    let endIdx = filteredBfData.findIndex(d => d.time >= zoomDomain[1]);
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = filteredBfData.length - 1;
    return { start: Math.max(0, startIdx), end: Math.min(filteredBfData.length - 1, endIdx) };
  }, [filteredBfData, zoomDomain]);

  const nnBrushIndices = useMemo(() => {
    if (!filteredNnData.length) return { start: 0, end: 0 };
    if (!zoomDomain) return { start: 0, end: filteredNnData.length - 1 };
    let startIdx = filteredNnData.findIndex(d => d.time >= zoomDomain[0]);
    let endIdx = filteredNnData.findIndex(d => d.time >= zoomDomain[1]);
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = filteredNnData.length - 1;
    return { start: Math.max(0, startIdx), end: Math.min(filteredNnData.length - 1, endIdx) };
  }, [filteredNnData, zoomDomain]);

  const hrvChartData = useMemo(() => {
    if (!hrvResults || !hrvResults.windows) return [];
    // Add ln_sdnn for the chart
    return hrvResults.windows.map(w => ({
      ...w,
      ln_sdnn: w.sdnn && w.sdnn > 0 ? Math.log(w.sdnn) : null,
    }));
  }, [hrvResults]);

  const perBeatTable = useMemo(() => {
    if (!metrics) return [];
    return metrics.beat_times_min.slice(0, -1).map((t, i) => ({
      index: i,
      time_min: t,
      bf_bpm: metrics.beat_freq_bpm[i],
      nn_ms: metrics.nn_intervals_ms[i],
      kept: metrics.artifact_mask[i],
    }));
  }, [metrics]);

  // Merge per-minute data with HRV window data
  const perMinuteTable = useMemo(() => {
    if (!perMinuteData) return [];
    const hrvMap = {};
    if (hrvResults?.windows) {
      hrvResults.windows.forEach(w => { hrvMap[w.minute] = w; });
    }
    return perMinuteData.map(row => ({
      ...row,
      hrv: hrvMap[row.minute] || null,
    }));
  }, [perMinuteData, hrvResults]);

  // Get specific readouts - use calculated drug readout time
  const hrvReadout = useMemo(() => {
    if (!enableHrvReadout || !hrvResults?.windows) return null;
    // Calculate actual readout minute: base + perfusion start + perfusion time
    const baseMinute = parseInt(hrvReadoutMinute) || 0;
    let actualMinute = baseMinute;
    
    if (selectedDrugs?.length > 0) {
      const firstDrugKey = selectedDrugs[0];
      const settings = drugSettings?.[firstDrugKey] || {};
      const perfusionStart = settings.perfusionStart ?? 3;
      const perfusionTime = settings.perfusionTime ?? 3;
      actualMinute = baseMinute + perfusionStart + perfusionTime;
    }
    
    return {
      data: hrvResults.windows.find(w => w.minute === actualMinute) || null,
      requestedMinute: baseMinute,
      actualMinute: actualMinute,
    };
  }, [hrvResults, hrvReadoutMinute, enableHrvReadout, selectedDrugs, drugSettings]);

  const bfReadout = useMemo(() => {
    if (!enableBfReadout || !perMinuteData) return null;
    // Calculate actual readout minute: base + perfusion start + perfusion time
    const baseMinute = parseInt(bfReadoutMinute) || 0;
    let actualMinute = baseMinute;
    
    if (selectedDrugs?.length > 0) {
      const firstDrugKey = selectedDrugs[0];
      const settings = drugSettings?.[firstDrugKey] || {};
      const perfusionStart = settings.perfusionStart ?? 3;
      const perfusionTime = settings.perfusionTime ?? 3;
      actualMinute = baseMinute + perfusionStart + perfusionTime;
    }
    
    return {
      data: perMinuteData.find(r => r.minute === actualMinute) || null,
      requestedMinute: baseMinute,
      actualMinute: actualMinute,
    };
  }, [perMinuteData, bfReadoutMinute, enableBfReadout, selectedDrugs, drugSettings]);

  if (!metrics) return (
    <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
      Validate beats first to see analysis results
    </div>
  );

  const baseline = hrvResults?.baseline;
  const filterInfo = metrics?.filter_settings || filterSettings;

  return (
    <div className="space-y-4" data-testid="analysis-panel">
      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
          {metrics.n_total} total beats
        </Badge>
        {filterInfo && (
          <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
            Filter: {filterInfo.lower_pct || filterInfo.lowerPct}%-{filterInfo.upper_pct || filterInfo.upperPct}%
          </Badge>
        )}
      </div>

      {/* BF + NN charts (filtered) with light stim highlights and zoom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" ref={chartContainerRef}>
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                Beat Frequency (Filtered) - bpm vs min
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                      <p>Beat frequency (BF) = 60000 / NN interval. Filtered using artifact rejection to remove outliers.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline" className="font-data text-[9px] border-zinc-700 text-zinc-500">
                  {metrics.n_kept} beats
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleZoomIn} title="Zoom In">
                  <Plus className="w-3 h-3 text-zinc-500" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleZoomOut} disabled={!zoomDomain} title="Zoom Out">
                  <Minus className="w-3 h-3 text-zinc-500" />
                </Button>
                {zoomDomain && (
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={handleResetZoom}>
                    <RotateCcw className="w-3 h-3 mr-1" />Reset
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={filteredBfData} margin={{ top: 10, right: 35, left: 15, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  domain={zoomDomain || ['dataMin', 'dataMax']}
                  tickFormatter={(v) => v.toFixed(1)}
                  label={{ value: 'min', fill: '#a1a1aa', fontSize: 10, position: 'insideBottom', offset: -13 }}
                  type="number" allowDataOverflow />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45}
                  label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
                <RechartsTooltip
                  contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
                  formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']}
                />
                {lightPulses && lightPulses.map((pulse, i) => (
                  <ReferenceArea key={`bf-pulse-${i}`}
                    x1={pulse.start_min ?? (pulse.start_sec / 60)}
                    x2={pulse.end_min ?? (pulse.end_sec / 60)}
                    fill="#facc15" fillOpacity={0.15} stroke="#facc15" strokeOpacity={0.5}
                  />
                ))}
                <Line type="monotone" dataKey="bf" stroke={CHART_COLORS.bf} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Brush 
                  dataKey="time" 
                  height={20} 
                  stroke="#52525b"
                  fill="#0c0c0e" 
                  tickFormatter={(v) => v.toFixed(1)}
                  startIndex={bfBrushIndices.start}
                  endIndex={bfBrushIndices.end}
                  onChange={handleBfBrushChange}
                  travellerWidth={8}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                NN Intervals (Filtered) - ms vs min
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex">
                        <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                      <p>NN intervals = time between successive beats in milliseconds. Used for HRV calculations.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline" className="font-data text-[9px] border-zinc-700 text-zinc-500">
                  {metrics.n_kept} intervals
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleZoomIn} title="Zoom In">
                  <Plus className="w-3 h-3 text-zinc-500" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={handleZoomOut} disabled={!zoomDomain} title="Zoom Out">
                  <Minus className="w-3 h-3 text-zinc-500" />
                </Button>
                {zoomDomain && (
                  <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px] text-zinc-400 hover:text-zinc-200" onClick={handleResetZoom}>
                    <RotateCcw className="w-3 h-3 mr-1" />Reset
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={filteredNnData} margin={{ top: 10, right: 35, left: 15, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  domain={zoomDomain || ['dataMin', 'dataMax']}
                  tickFormatter={(v) => v.toFixed(1)}
                  label={{ value: 'min', fill: '#a1a1aa', fontSize: 10, position: 'insideBottom', offset: -13 }}
                  type="number" allowDataOverflow />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45}
                  label={{ value: 'ms', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
                <RechartsTooltip
                  contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
                  formatter={(v) => [`${Number(v).toFixed(1)} ms`, 'NN']}
                />
                {lightPulses && lightPulses.map((pulse, i) => (
                  <ReferenceArea key={`nn-pulse-${i}`}
                    x1={pulse.start_min ?? (pulse.start_sec / 60)}
                    x2={pulse.end_min ?? (pulse.end_sec / 60)}
                    fill="#facc15" fillOpacity={0.15} stroke="#facc15" strokeOpacity={0.5}
                  />
                ))}
                <Line type="monotone" dataKey="nn" stroke={CHART_COLORS.nn} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Brush 
                  dataKey="time" 
                  height={20} 
                  stroke="#52525b"
                  fill="#0c0c0e" 
                  tickFormatter={(v) => v.toFixed(1)}
                  startIndex={nnBrushIndices.start}
                  endIndex={nnBrushIndices.end}
                  onChange={handleNnBrushChange}
                  travellerWidth={8}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* HRV Analysis with Readout Controls */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
            HRV Analysis (Sliding 3-min Windows, Normalized to 70 bpm)
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex">
                    <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-help" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="w-80 bg-zinc-900 border-zinc-700 text-zinc-100 text-[10px] p-3 z-50">
                  <p className="font-medium mb-2 text-zinc-100">Why baseline differs from per-minute values?</p>
                  <p className="text-zinc-200 mb-2">
                    <strong>Baseline:</strong> Computed directly over the specified time range (e.g., 0-3 min) using all beats in that range.
                  </p>
                  <p className="text-zinc-200 mb-2">
                    <strong>Per-minute table:</strong> Shows HRV for each minute's 3-min sliding window (e.g., minute 0 = 0-3min window, minute 1 = 1-4min window).
                  </p>
                  <p className="text-zinc-200">
                    The values may differ because the baseline uses a fixed range while per-minute uses overlapping sliding windows.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Controls row */}
          <div className="flex flex-wrap items-start gap-4 mb-4">
            {/* Baseline settings - single minute readouts */}
            <div className={`p-3 rounded-sm border transition-all duration-200 w-[280px] ${
              baselineEnabled 
                ? 'bg-cyan-950/20 border-cyan-800/50' 
                : 'bg-zinc-900/50 border-zinc-700/50 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[9px] uppercase tracking-wider font-bold ${baselineEnabled ? 'text-cyan-400' : 'text-zinc-400'}`}>
                  Baseline Readout
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onBaselineEnabledChange(!baselineEnabled)}
                  className={`h-5 px-2 text-[9px] rounded-full transition-all ${
                    baselineEnabled 
                      ? 'bg-cyan-600/30 text-cyan-300 hover:bg-cyan-600/40' 
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {baselineEnabled ? 'ON' : 'OFF'}
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className={`text-[9px] w-8 ${baselineEnabled ? 'text-zinc-400' : 'text-zinc-500'}`}>HRV:</Label>
                  <Input
                    type="number"
                    value={baselineHrvMinute}
                    onChange={(e) => setBaselineHrvMinute(parseInt(e.target.value) || 0)}
                    className="w-12 h-6 text-[10px] font-data bg-zinc-950 border-zinc-700 rounded-sm"
                    disabled={!baselineEnabled}
                  />
                  <span className={`text-[9px] ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  <Badge variant="outline" className={`text-[8px] ${baselineEnabled ? 'border-cyan-700/50 text-cyan-400/80' : 'border-zinc-700 text-zinc-500'}`}>
                    {baselineHrvMinute}-{baselineHrvMinute + 3}min
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label className={`text-[9px] w-8 ${baselineEnabled ? 'text-zinc-400' : 'text-zinc-500'}`}>BF:</Label>
                  <Input
                    type="number"
                    value={baselineBfMinute}
                    onChange={(e) => setBaselineBfMinute(parseInt(e.target.value) || 1)}
                    className="w-12 h-6 text-[10px] font-data bg-zinc-950 border-zinc-700 rounded-sm"
                    disabled={!baselineEnabled}
                  />
                  <span className={`text-[9px] ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  <Badge variant="outline" className={`text-[8px] ${baselineEnabled ? 'border-cyan-700/50 text-cyan-400/80' : 'border-zinc-700 text-zinc-500'}`}>
                    {baselineBfMinute}-{baselineBfMinute + 1}min
                  </Badge>
                </div>
                <p className={`text-[8px] mt-2 ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>
                  Time = Recording start time
                </p>
              </div>
            </div>

            {/* Drug readout controls */}
            <div className={`p-3 rounded-sm border transition-all duration-200 w-[280px] ${
              (enableHrvReadout || enableBfReadout) 
                ? 'bg-purple-950/20 border-purple-800/50' 
                : 'bg-zinc-900/50 border-zinc-700/50 opacity-75'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-[9px] uppercase tracking-wider font-bold ${(enableHrvReadout || enableBfReadout) ? 'text-purple-400' : 'text-zinc-400'}`}>
                  Drug Readout
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newState = !(enableHrvReadout || enableBfReadout);
                    setEnableHrvReadout(newState);
                    setEnableBfReadout(newState);
                  }}
                  className={`h-5 px-2 text-[9px] rounded-full transition-all ${
                    (enableHrvReadout || enableBfReadout) 
                      ? 'bg-purple-600/30 text-purple-300 hover:bg-purple-600/40' 
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {(enableHrvReadout || enableBfReadout) ? 'ON' : 'OFF'}
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className={`text-[9px] w-8 ${(enableHrvReadout || enableBfReadout) ? 'text-zinc-400' : 'text-zinc-500'}`}>HRV:</Label>
                  <Input
                    type="number"
                    value={hrvReadoutMinute}
                    onChange={(e) => setHrvReadoutMinute(e.target.value)}
                    disabled={!(enableHrvReadout || enableBfReadout)}
                    className="w-12 h-6 text-[10px] font-data bg-zinc-950 border-zinc-800 rounded-sm disabled:opacity-50"
                    placeholder="12"
                  />
                  <span className={`text-[9px] ${(enableHrvReadout || enableBfReadout) ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  {(enableHrvReadout || enableBfReadout) && selectedDrugs?.length > 0 && hrvReadoutMinute && (
                    <Badge variant="outline" className="text-[8px] border-purple-700/50 text-purple-400/80">
                      → {parseInt(hrvReadoutMinute || 0) + (drugSettings?.[selectedDrugs[0]]?.perfusionStart ?? 3) + (drugSettings?.[selectedDrugs[0]]?.perfusionTime ?? 3)}min
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Label className={`text-[9px] w-8 ${(enableHrvReadout || enableBfReadout) ? 'text-zinc-400' : 'text-zinc-500'}`}>BF:</Label>
                  <Input
                    type="number"
                    value={bfReadoutMinute}
                    onChange={(e) => setBfReadoutMinute(e.target.value)}
                    disabled={!(enableHrvReadout || enableBfReadout)}
                    className="w-12 h-6 text-[10px] font-data bg-zinc-950 border-zinc-800 rounded-sm disabled:opacity-50"
                    placeholder="14"
                  />
                  <span className={`text-[9px] ${(enableHrvReadout || enableBfReadout) ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  {(enableHrvReadout || enableBfReadout) && selectedDrugs?.length > 0 && bfReadoutMinute && (
                    <Badge variant="outline" className="text-[8px] border-purple-700/50 text-purple-400/80">
                      → {parseInt(bfReadoutMinute || 0) + (drugSettings?.[selectedDrugs[0]]?.perfusionStart ?? 3) + (drugSettings?.[selectedDrugs[0]]?.perfusionTime ?? 3)}min
                    </Badge>
                  )}
                </div>
                <p className={`text-[8px] mt-2 ${(enableHrvReadout || enableBfReadout) ? 'text-zinc-500' : 'text-zinc-600'}`}>
                  Time = Perf.Time + Perf.Start + Perf.Delay
                </p>
              </div>
            </div>

            <Button
              data-testid="compute-hrv-btn"
              className="h-8 text-xs rounded-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 self-end"
              onClick={() => onComputeHRV(
                (enableHrvReadout || enableBfReadout) && hrvReadoutMinute ? parseInt(hrvReadoutMinute) : null,
                { 
                  hrvMinute: baselineHrvMinute, 
                  bfMinute: baselineBfMinute 
                }
              )}
              disabled={analysisLoading}
            >
              {analysisLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Compute HRV
            </Button>
          </div>

          {/* Results display - Baseline and Drug Readout side by side, same prominence */}
          <div className="space-y-4">
            {/* Baseline - prominent */}
            {baselineEnabled && baseline && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-cyan-500">
                  Baseline Metrics
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <MetricCard 
                    label="Mean BF" 
                    sublabel={`@${baselineBfMinute}-${baselineBfMinute+1}min`}
                    value={baseline.baseline_bf} 
                    unit="bpm"
                    highlight
                    tooltip="Beat Frequency (bpm)"
                  />
                  <MetricCard 
                    label="ln(RMSSD₇₀)" 
                    sublabel={`@${baselineHrvMinute}-${baselineHrvMinute+3}min`}
                    value={baseline.baseline_ln_rmssd70}
                    highlight
                    tooltip="Root Mean Square of Successive Differences (normalized to 70 bpm)"
                  />
                  <MetricCard 
                    label="ln(SDNN₇₀)" 
                    sublabel={`@${baselineHrvMinute}-${baselineHrvMinute+3}min`}
                    value={baseline.baseline_sdnn ? Math.log(baseline.baseline_sdnn) : null}
                    highlight
                    tooltip="Standard Deviation of NN intervals (normalized to 70 bpm)"
                  />
                  <MetricCard 
                    label="pNN50₇₀" 
                    sublabel={`@${baselineHrvMinute}-${baselineHrvMinute+3}min`}
                    value={baseline.baseline_pnn50} 
                    unit="%"
                    highlight
                    tooltip="% of successive NN > 50ms (normalized to 70 bpm)"
                  />
                </div>
              </div>
            )}

            {/* Drug readout - same size as baseline when enabled */}
            {(hrvReadout?.data || bfReadout?.data) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-purple-500">
                    Drug Readout Metrics
                  </p>
                  {selectedDrugs?.length > 0 && (
                    <Badge variant="outline" className="text-[8px] border-purple-700 text-purple-400">
                      Perf.Time + Perf.Start + Perf.Delay
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {bfReadout?.data && (
                    <MetricCard 
                      label="Mean BF" 
                      sublabel={`@${bfReadout.actualMinute}-${bfReadout.actualMinute+1}min`}
                      value={bfReadout.data.avg_bf} 
                      unit="bpm"
                      highlight
                      highlightColor="purple"
                      tooltip="Beat Frequency (bpm)"
                    />
                  )}
                  {hrvReadout?.data && (
                    <>
                      <MetricCard 
                        label="ln(RMSSD₇₀)" 
                        sublabel={`@${hrvReadout.actualMinute}-${hrvReadout.actualMinute+3}min`}
                        value={hrvReadout.data.ln_rmssd70}
                        highlight
                        highlightColor="purple"
                        tooltip="Root Mean Square of Successive Differences (normalized to 70 bpm)"
                      />
                      <MetricCard 
                        label="ln(SDNN₇₀)" 
                        sublabel={`@${hrvReadout.actualMinute}-${hrvReadout.actualMinute+3}min`}
                        value={hrvReadout.data.sdnn ? Math.log(hrvReadout.data.sdnn) : null}
                        highlight
                        highlightColor="purple"
                        tooltip="Standard Deviation of NN intervals (normalized to 70 bpm)"
                      />
                      <MetricCard 
                        label="pNN50₇₀" 
                        sublabel={`@${hrvReadout.actualMinute}-${hrvReadout.actualMinute+3}min`}
                        value={hrvReadout.data.pnn50} 
                        unit="%"
                        highlight
                        highlightColor="purple"
                        tooltip="% of successive NN > 50ms (normalized to 70 bpm)"
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* HRV Evolution Charts */}
          {hrvChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {[
                { key: 'ln_rmssd70', label: 'ln(RMSSD₇₀)', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.lnRmssd },
                { key: 'ln_sdnn', label: 'ln(SDNN₇₀)', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.sdnn },
                { key: 'pnn50', label: 'pNN50₇₀ (%)', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.pnn50 },
              ].map(({ key, label, sublabel, color }) => (
                <div key={key} className="bg-black border border-zinc-800 rounded-sm p-2">
                  <p className="text-[10px] text-zinc-400 font-medium mb-0.5">{label}</p>
                  <p className="text-[8px] text-zinc-600 mb-1">{sublabel}</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={hrvChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                      <XAxis dataKey="minute" tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                        label={{ value: 'min', fill: '#a1a1aa', fontSize: 9, position: 'insideBottomRight', offset: -5 }} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }} width={40} />
                      <RechartsTooltip
                        contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 9, fontFamily: 'JetBrains Mono' }}
                      />
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={{ r: 1.5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-minute metrics table */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
            Per-Minute Metrics
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex">
                    <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="w-72 bg-zinc-900 border-zinc-700 text-zinc-100 text-[10px] p-3 z-50">
                  <p className="font-medium mb-2 text-zinc-100">Table Columns Explained</p>
                  <p className="text-zinc-200 mb-1"><strong>Beats, BF, NN, NN₇₀:</strong> Values for that specific 1-minute window.</p>
                  <p className="text-zinc-200"><strong>SDNN₇₀, RMSSD₇₀, pNN50₇₀:</strong> Computed over a 3-minute sliding window starting at that minute (e.g., row "0-1 min" uses data from 0-3 min).</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="per-minute">
            <TabsList className="bg-zinc-900/50 border border-zinc-800 h-7 mb-3">
              <TabsTrigger value="per-minute" className="text-[10px] rounded-sm h-5 data-[state=active]:bg-zinc-700">
                Per Minute
              </TabsTrigger>
              <TabsTrigger value="per-beat" className="text-[10px] rounded-sm h-5 data-[state=active]:bg-zinc-700">
                Per Beat
              </TabsTrigger>
            </TabsList>

            <TabsContent value="per-minute">
              <ScrollArea className="h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">Time</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">Beats</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">BF (bpm)</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">NN (ms)</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">NN₇₀ (ms)</TableHead>
                      <TableHead className="text-[10px] font-data text-red-400 h-7">
                        <span className="flex items-center gap-1">
                          RMSSD₇₀ <HrvInfoPopover metric="RMSSD" />
                        </span>
                      </TableHead>
                      <TableHead className="text-[10px] font-data text-red-400 h-7">
                        <span className="flex items-center gap-1">
                          SDNN₇₀ <HrvInfoPopover metric="SDNN" />
                        </span>
                      </TableHead>
                      <TableHead className="text-[10px] font-data text-red-400 h-7">
                        <span className="flex items-center gap-1">
                          pNN50₇₀ <HrvInfoPopover metric="pNN50" />
                        </span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perMinuteTable.map((row) => (
                      <TableRow key={row.minute} className="border-zinc-800/50 data-row">
                        <TableCell className="text-[10px] font-data text-zinc-400 py-1">{row.label} min</TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-500 py-1">{row.n_beats}</TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                          {row.avg_bf != null ? row.avg_bf.toFixed(1) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                          {row.avg_nn != null ? row.avg_nn.toFixed(1) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                          {row.avg_nn_70 != null ? row.avg_nn_70.toFixed(1) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-red-300 py-1">
                          {row.hrv ? row.hrv.rmssd70.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-red-300 py-1">
                          {row.hrv ? row.hrv.sdnn?.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-red-300 py-1">
                          {row.hrv ? row.hrv.pnn50.toFixed(1) : '\u2014'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="per-beat">
              <ScrollArea className="h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">#</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">Time (min)</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">BF (bpm)</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">NN (ms)</TableHead>
                      <TableHead className="text-[10px] font-data text-zinc-500 h-7">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perBeatTable.map((row) => (
                      <TableRow key={row.index} className="border-zinc-800/50 data-row">
                        <TableCell className="text-[10px] font-data text-zinc-400 py-1">{row.index}</TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">{row.time_min.toFixed(4)}</TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">{row.bf_bpm.toFixed(1)}</TableCell>
                        <TableCell className="text-[10px] font-data text-zinc-300 py-1">{row.nn_ms.toFixed(1)}</TableCell>
                        <TableCell className="py-1">
                          <Badge
                            variant="outline"
                            className={`text-[8px] font-data px-1.5 py-0 ${
                              row.kept ? 'border-emerald-800 text-emerald-400' : 'border-red-800 text-red-400'
                            }`}
                          >
                            {row.kept ? 'kept' : 'filtered'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
