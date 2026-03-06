import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Brush, ReferenceArea
} from 'recharts';
import { Loader2, Info, RotateCcw, Plus, Minus, BarChart3, RefreshCw } from 'lucide-react';
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
import { toast } from 'sonner';

// Helper component for inline info tooltips
function InfoTip({ text, children }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help whitespace-nowrap">
            {children}
            <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 flex-shrink-0" />
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
  nn: '#c0c0c0',  // silver
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
    },
    'purple-light': {
      bg: 'bg-purple-900/30 border-purple-700',
      label: 'text-purple-300',
      value: 'text-purple-100'
    },
    violet: {
      bg: 'bg-violet-950/30 border-violet-800',
      label: 'text-violet-400',
      value: 'text-violet-100'
    },
    'violet-light': {
      bg: 'bg-violet-900/30 border-violet-700',
      label: 'text-violet-300',
      value: 'text-violet-100'
    }
  };
  const colors = highlight ? (colorClasses[highlightColor] || colorClasses.purple) : { bg: 'bg-zinc-900/50 border-zinc-800', label: 'text-zinc-500', value: 'text-zinc-100' };
  
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

// Info popover for HRV metrics explanation - now uses Tooltip (hover) instead of Popover (click)
function HrvInfoPopover({ metric }) {
  const info = {
    'SDNN': 'Standard deviation of NN intervals. Computed over a 3-minute sliding window, normalized to 70 bpm.',
    'RMSSD': 'Root mean square of successive NN differences. Computed over a 3-minute sliding window, normalized to 70 bpm.',
    'pNN50': 'Percentage of successive NN intervals differing by >50ms. Computed over a 3-minute sliding window, normalized to 70 bpm.',
  };
  
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex h-4 w-4 p-0 text-zinc-500 hover:text-zinc-300">
            <Info className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white">
          <p className="font-medium mb-1">{metric}</p>
          <p>{info[metric] || 'HRV metric computed over 3-minute window, normalized to 70 bpm.'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AnalysisPanel({
  metrics, hrvResults, perMinuteData,
  onComputeHRV, analysisLoading, filterSettings, hasDrug,
  drugSettings, selectedDrugs, otherDrugs, DRUG_CONFIG, lightPulses, lightEnabled,
  drugReadoutSettings, onDrugReadoutSettingsChange,
  baselineEnabled, onBaselineEnabledChange,
  baselineHrvMinute, onBaselineHrvMinuteChange,
  baselineBfMinute, onBaselineBfMinuteChange
}) {
  // Use drugReadoutSettings from props, with local fallbacks for backwards compatibility
  // Use drugReadoutSettings from parent via callback
  const enableHrvReadout = drugReadoutSettings?.enableHrvReadout ?? false;
  const enableBfReadout = drugReadoutSettings?.enableBfReadout ?? false;

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

  // Data for BF and NN charts - show when metrics are available
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
    // Get HRV readout minute from first drug's per-drug settings
    const firstDrugKey = selectedDrugs?.[0];
    const perDrugSettings = drugReadoutSettings?.perDrug?.[firstDrugKey] || {};
    const baseMinute = parseFloat(perDrugSettings.hrvReadoutMinute) || 0;
    let actualMinute = baseMinute;
    
    if (firstDrugKey) {
      const settings = drugSettings?.[firstDrugKey] || {};
      const perfusionStart = settings.perfusionStart ?? 3;
      const perfusionTime = settings.perfusionTime ?? 3;
      actualMinute = baseMinute + perfusionStart + perfusionTime;
    }
    
    // For HRV lookup, use floor since windows are at integer minutes
    const hrvLookupMinute = Math.floor(actualMinute);
    
    return {
      data: hrvResults.windows.find(w => w.minute === hrvLookupMinute) || null,
      requestedMinute: baseMinute,
      actualMinute: actualMinute,
    };
  }, [hrvResults, drugReadoutSettings, enableHrvReadout, selectedDrugs, drugSettings]);

  const bfReadout = useMemo(() => {
    if (!enableBfReadout || !perMinuteData) return null;
    // Get BF readout minute from first drug's per-drug settings
    const firstDrugKey = selectedDrugs?.[0];
    const perDrugSettings = drugReadoutSettings?.perDrug?.[firstDrugKey] || {};
    const baseMinute = parseFloat(perDrugSettings.bfReadoutMinute) || 0;
    let actualMinute = baseMinute;
    
    if (firstDrugKey) {
      const settings = drugSettings?.[firstDrugKey] || {};
      const perfusionStart = settings.perfusionStart ?? 3;
      const perfusionTime = settings.perfusionTime ?? 3;
      actualMinute = baseMinute + perfusionStart + perfusionTime;
    }
    
    // For BF lookup, use floor since data is at integer minutes
    const bfLookupMinute = Math.floor(actualMinute);
    
    return {
      data: perMinuteData.find(r => r.minute === bfLookupMinute) || null,
      requestedMinute: baseMinute,
      actualMinute: actualMinute,
    };
  }, [perMinuteData, drugReadoutSettings, enableBfReadout, selectedDrugs, drugSettings]);

  // Calculate readouts for ALL drugs
  const allDrugReadouts = useMemo(() => {
    if (!selectedDrugs || selectedDrugs.length === 0) return [];
    
    const colorSchemes = [
      { bg: 'bg-purple-950/20', border: 'border-purple-500', text: 'text-purple-400', highlight: 'purple' },
      { bg: 'bg-purple-900/20', border: 'border-purple-400', text: 'text-purple-300', highlight: 'purple-light' },
      { bg: 'bg-violet-950/20', border: 'border-violet-600', text: 'text-violet-400', highlight: 'violet' },
      { bg: 'bg-violet-900/20', border: 'border-violet-500', text: 'text-violet-300', highlight: 'violet-light' },
    ];
    
    return selectedDrugs.map((drugKey, idx) => {
      const drugConfig = DRUG_CONFIG?.[drugKey] || {};
      const drugName = drugConfig.name || drugKey;
      const settings = drugSettings?.[drugKey] || {};
      const perDrugSettings = drugReadoutSettings?.perDrug?.[drugKey] || {};
      const colors = colorSchemes[idx % colorSchemes.length];
      
      // Per-drug enable state (fallback to global for first drug)
      const isDrugEnabled = idx === 0 
        ? (enableHrvReadout || enableBfReadout) 
        : (perDrugSettings.enabled ?? false);
      
      if (!isDrugEnabled) {
        return {
          drugKey,
          drugName,
          colors,
          hrvData: null,
          hrvActualMinute: 0,
          bfData: null,
          bfActualMinute: 0,
          hasData: false,
        };
      }
      
      const perfusionStart = settings.perfusionStart ?? 3;
      const perfusionTime = settings.perfusionTime ?? 3;
      
      // Calculate HRV readout - support decimal minutes (e.g., 1.5)
      let hrvData = null;
      let hrvActualMinute = 0;
      if (hrvResults?.windows) {
        const baseMinute = parseFloat(perDrugSettings.hrvReadoutMinute) || 0;
        hrvActualMinute = baseMinute + perfusionStart + perfusionTime;
        // For HRV lookup, use floor since windows are at integer minutes
        const hrvLookupMinute = Math.floor(hrvActualMinute);
        hrvData = hrvResults.windows.find(w => w.minute === hrvLookupMinute) || null;
      }
      
      // Calculate BF readout - support decimal minutes (e.g., 1.5)
      let bfData = null;
      let bfActualMinute = 0;
      if (perMinuteData) {
        const baseMinute = parseFloat(perDrugSettings.bfReadoutMinute) || 0;
        bfActualMinute = baseMinute + perfusionStart + perfusionTime;
        // For BF lookup, use floor since data is at integer minutes
        const bfLookupMinute = Math.floor(bfActualMinute);
        bfData = perMinuteData.find(r => r.minute === bfLookupMinute) || null;
      }
      
      return {
        drugKey,
        drugName,
        colors,
        hrvData,
        hrvActualMinute,
        bfData,
        bfActualMinute,
        hasData: hrvData || bfData,
      };
    });
  }, [selectedDrugs, drugSettings, drugReadoutSettings, enableHrvReadout, enableBfReadout, hrvResults, perMinuteData]);

  // Build array of all drugs with their settings and colors - MUST be before early return
  const DRUG_PURPLE_COLORS = [
    { fill: '#a855f7', border: 'border-purple-500', text: 'text-purple-400' },   // Purple 500
    { fill: '#c084fc', border: 'border-purple-400', text: 'text-purple-300' },   // Purple 400 (lighter)
    { fill: '#7c3aed', border: 'border-violet-600', text: 'text-violet-400' },   // Violet 600 (darker)
    { fill: '#8b5cf6', border: 'border-violet-500', text: 'text-violet-300' },   // Violet 500
  ];
  
  const allDrugsForViz = useMemo(() => {
    const drugs = [];
    // Add selected drugs from DRUG_CONFIG
    if (selectedDrugs?.length > 0) {
      selectedDrugs.forEach((drugKey, idx) => {
        const settings = drugSettings?.[drugKey] || {};
        const config = DRUG_CONFIG?.[drugKey] || {};
        drugs.push({
          key: drugKey,
          label: config.label || drugKey,
          perfStart: settings.perfusionStart ?? 3,
          perfDelay: settings.perfusionTime ?? 3,
          perfEnd: settings.perfusionEnd ?? null,
          color: DRUG_PURPLE_COLORS[idx % DRUG_PURPLE_COLORS.length],
        });
      });
    }
    // Add other (custom) drugs
    if (otherDrugs?.length > 0) {
      otherDrugs.forEach((drug, idx) => {
        const colorIdx = (selectedDrugs?.length || 0) + idx;
        drugs.push({
          key: drug.id || `other-${idx}`,
          label: drug.name || `Drug ${idx + 1}`,
          perfStart: drug.perfusionStart ?? 3,
          perfDelay: drug.perfusionTime ?? 3,
          perfEnd: drug.perfusionEnd ?? null,
          color: DRUG_PURPLE_COLORS[colorIdx % DRUG_PURPLE_COLORS.length],
        });
      });
    }
    return drugs;
  }, [selectedDrugs, drugSettings, DRUG_CONFIG, otherDrugs]);

  const drugPresent = allDrugsForViz.length > 0;

  if (!metrics) return (
    <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
      Validate beats first to see analysis results
    </div>
  );

  const baseline = hrvResults?.baseline;
  const filterInfo = metrics?.filter_settings || filterSettings;

  // Calculate drug phase boundaries for visualization - support multiple drugs
  // Use multiple sources for recording end time to handle saved recordings
  const recordingEndMin = filteredBfData.length > 0 
    ? Math.max(...filteredBfData.map(d => d.time))
    : (metrics?.filtered_beat_times_min?.length > 0 
        ? Math.max(...metrics.filtered_beat_times_min)
        : (metrics?.beat_times_min?.length > 0 
            ? Math.max(...metrics.beat_times_min) 
            : 10));

  return (
    <div className="space-y-4" data-testid="analysis-panel">

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
                        <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                      <p>Beat frequency (BF) = 60000 / NN interval. Filtered using artifact rejection to remove outliers.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline" className="font-data text-[9px] border-emerald-700 text-emerald-400">
                  {metrics.n_kept} beats
                </Badge>
                {/* Light stim badge - amber - only when light stim is enabled */}
                {lightEnabled && lightPulses && lightPulses.length > 0 && (
                  <Badge variant="outline" className="font-data text-[9px] border-amber-700 text-amber-400">
                    {lightPulses.length} stims
                  </Badge>
                )}
                {/* Drug badges - one per drug with different purples */}
                {allDrugsForViz.map((drug) => (
                  <Badge 
                    key={drug.key}
                    variant="outline" 
                    className={`font-data text-[9px] ${drug.color.border} ${drug.color.text}`}
                  >
                    {drug.label} perfusion
                  </Badge>
                ))}
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
                {/* Drug effect regions (purple) - one per drug with different colors */}
                {allDrugsForViz.map((drug, idx) => (
                  <ReferenceArea 
                    key={`bf-drug-${drug.key}`}
                    x1={drug.perfStart + drug.perfDelay} 
                    x2={drug.perfEnd !== null ? drug.perfEnd : recordingEndMin} 
                    fill={drug.color.fill} 
                    fillOpacity={0.15 + (idx * 0.05)} 
                    stroke="none" 
                    ifOverflow="hidden" 
                  />
                ))}
                {/* Light stim highlights - only when light stim is enabled */}
                {lightEnabled && lightPulses && lightPulses.map((pulse, i) => (
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
                        <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                      <p>NN intervals = time between successive beats in milliseconds. Used for HRV calculations.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Badge variant="outline" className="font-data text-[9px] border-zinc-500 text-zinc-400">
                  {metrics.n_kept} intervals
                </Badge>
                {/* Light stim badge - amber - only when light stim is enabled */}
                {lightEnabled && lightPulses && lightPulses.length > 0 && (
                  <Badge variant="outline" className="font-data text-[9px] border-amber-700 text-amber-400">
                    {lightPulses.length} stims
                  </Badge>
                )}
                {/* Drug badges - one per drug with different purples */}
                {allDrugsForViz.map((drug) => (
                  <Badge 
                    key={drug.key}
                    variant="outline" 
                    className={`font-data text-[9px] ${drug.color.border} ${drug.color.text}`}
                  >
                    {drug.label} perfusion
                  </Badge>
                ))}
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
                {/* Drug effect regions (purple) - one per drug with different colors */}
                {allDrugsForViz.map((drug, idx) => (
                  <ReferenceArea 
                    key={`nn-drug-${drug.key}`}
                    x1={drug.perfStart + drug.perfDelay} 
                    x2={drug.perfEnd !== null ? drug.perfEnd : recordingEndMin} 
                    fill={drug.color.fill} 
                    fillOpacity={0.15 + (idx * 0.05)} 
                    stroke="none" 
                    ifOverflow="hidden" 
                  />
                ))}
                {/* Light stim highlights - only when light stim is enabled */}
                {lightEnabled && lightPulses && lightPulses.map((pulse, i) => (
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

      {/* Spontaneous Activity Analysis - Header + Controls joined */}
      <div>
        {/* Header */}
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm rounded-b-none border-b-0">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-zinc-200">Spontaneous Activity Analysis (BF & HRV)</span>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex">
                      <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                    <p className="font-medium mb-2">BF & HRV Metrics</p>
                    <p className="mb-2">
                      <strong>BF (Beat Frequency):</strong> Heart rate in beats per minute (bpm), computed as the inverse of inter-beat intervals.
                    </p>
                    <p className="mb-2">
                      <strong>HRV (Heart Rate Variability):</strong> Metrics computed using sliding 3-min windows with NN intervals normalized to 70 bpm. Includes RMSSD, SDNN, and pNN50.</p>
                    <p className="mb-2">
                      <strong>Per-minute table:</strong> Shows HRV for each minute's 3-min sliding window (e.g., minute 0 = 0-3min window, minute 1 = 1-4min window).
                    </p>
                    <p>
                      The values may differ because the baseline uses a fixed range while per-minute uses overlapping sliding windows.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Auto-computing indicator - shows only when loading */}
              {analysisLoading && (
                <div className="ml-auto flex items-center gap-1 text-cyan-400 text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Computing...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Divider line - full width */}
        <div className="h-px bg-zinc-700" />

        {/* Controls */}
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm rounded-t-none border-t-0">
          <CardContent className="pt-4">
          {/* Controls row */}
          <div className="flex flex-wrap items-start gap-4 mb-4">
            {/* Baseline settings - single minute readouts */}
            <div className={`p-3 rounded-sm border transition-all duration-200 w-[340px] ${
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
                    step="0.5"
                    value={baselineHrvMinute}
                    onChange={(e) => onBaselineHrvMinuteChange(parseFloat(e.target.value) || 0)}
                    className="w-14 h-6 text-[10px] font-data bg-zinc-950 border-zinc-700 rounded-sm number-input-white-arrows"
                    disabled={!baselineEnabled}
                  />
                  <span className={`text-[9px] ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  <Badge variant="outline" className={`text-[8px] ${baselineEnabled ? 'border-cyan-700/50 text-cyan-400/80' : 'border-zinc-700 text-zinc-500'}`}>
                    Readout Time Range: {baselineHrvMinute}-{baselineHrvMinute + 3}min
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label className={`text-[9px] w-8 ${baselineEnabled ? 'text-zinc-400' : 'text-zinc-500'}`}>BF:</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={baselineBfMinute}
                    onChange={(e) => onBaselineBfMinuteChange(parseFloat(e.target.value) || 1)}
                    className="w-14 h-6 text-[10px] font-data bg-zinc-950 border-zinc-700 rounded-sm number-input-white-arrows"
                    disabled={!baselineEnabled}
                  />
                  <span className={`text-[9px] ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                  <Badge variant="outline" className={`text-[8px] ${baselineEnabled ? 'border-cyan-700/50 text-cyan-400/80' : 'border-zinc-700 text-zinc-500'}`}>
                    Readout Time Range: {baselineBfMinute}-{baselineBfMinute + 1}min
                  </Badge>
                </div>
                <p className={`text-[8px] mt-2 ${baselineEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>
                  Input = Baseline Readout Start Time
                </p>
                <div className="h-[6px]"></div>
              </div>
            </div>

            {/* Drug readout controls - one box per drug, horizontally arranged */}
            {selectedDrugs && selectedDrugs.length > 0 ? (
              <div className="flex flex-row flex-wrap gap-4">
                {selectedDrugs.map((drugKey, idx) => {
                  const drugConfig = DRUG_CONFIG?.[drugKey] || {};
                  const drugName = drugConfig.name || drugKey;
                  const settings = drugSettings?.[drugKey] || {};
                  
                  // Get per-drug readout settings
                  const perDrugSettings = drugReadoutSettings?.perDrug?.[drugKey] || { hrvReadoutMinute: '', bfReadoutMinute: '', enabled: false };
                  const hrvReadoutValue = perDrugSettings.hrvReadoutMinute ?? '';
                  const bfReadoutValue = perDrugSettings.bfReadoutMinute ?? '';
                  // Per-drug enable state (fallback to global for first drug for backwards compatibility)
                  const isDrugEnabled = idx === 0 
                    ? (enableHrvReadout || enableBfReadout) 
                    : (perDrugSettings.enabled ?? false);
                  
                  // Color schemes matching the top bar badges
                  const colorSchemes = [
                    { bg: 'bg-purple-950/20', border: 'border-purple-500/50', text: 'text-purple-400', textLight: 'text-purple-300', badge: 'border-purple-500 bg-purple-900/30 text-purple-300' },
                    { bg: 'bg-purple-900/20', border: 'border-purple-400/50', text: 'text-purple-300', textLight: 'text-purple-200', badge: 'border-purple-400 bg-purple-800/30 text-purple-200' },
                    { bg: 'bg-violet-950/20', border: 'border-violet-600/50', text: 'text-violet-400', textLight: 'text-violet-300', badge: 'border-violet-600 bg-violet-900/30 text-violet-300' },
                    { bg: 'bg-violet-900/20', border: 'border-violet-500/50', text: 'text-violet-300', textLight: 'text-violet-200', badge: 'border-violet-500 bg-violet-800/30 text-violet-200' },
                  ];
                  const colors = colorSchemes[idx % colorSchemes.length];
                  
                  const perfStart = settings.perfusionStart ?? 3;
                  const perfDelay = settings.perfusionTime ?? 3;
                  
                  // Handler to update per-drug readout settings
                  const updatePerDrugSetting = (field, value) => {
                    onDrugReadoutSettingsChange?.({
                      ...drugReadoutSettings,
                      perDrug: {
                        ...drugReadoutSettings?.perDrug,
                        [drugKey]: {
                          ...perDrugSettings,
                          [field]: value,
                        }
                      }
                    });
                  };
                  
                  // Toggle handler for per-drug enable
                  const toggleDrugEnabled = () => {
                    if (idx === 0) {
                      // First drug uses global toggle
                      const isCurrentlyOn = enableHrvReadout || enableBfReadout;
                      onDrugReadoutSettingsChange?.({
                        ...drugReadoutSettings,
                        enableHrvReadout: !isCurrentlyOn,
                        enableBfReadout: !isCurrentlyOn,
                      });
                    } else {
                      // Other drugs use per-drug enable
                      updatePerDrugSetting('enabled', !isDrugEnabled);
                    }
                  };
                  
                  return (
                    <div key={drugKey} className={`p-3 rounded-sm border transition-all duration-200 w-[340px] ${
                      isDrugEnabled 
                        ? `${colors.bg} ${colors.border}` 
                        : 'bg-zinc-900/50 border-zinc-700/50 opacity-75'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <p className={`text-[9px] uppercase tracking-wider font-bold ${isDrugEnabled ? colors.text : 'text-zinc-400'}`}>
                            Drug Readout
                          </p>
                          <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${isDrugEnabled ? colors.badge : 'border-zinc-600 bg-zinc-800/30 text-zinc-400'}`}>
                            {drugName}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`drug-readout-toggle-${idx}`}
                          onClick={toggleDrugEnabled}
                          className={`h-5 px-2 text-[9px] rounded-full transition-all ${
                            isDrugEnabled 
                              ? `${colors.bg} ${colors.textLight} hover:opacity-80` 
                              : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                          }`}
                        >
                          {isDrugEnabled ? 'ON' : 'OFF'}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className={`text-[9px] w-8 ${isDrugEnabled ? 'text-zinc-400' : 'text-zinc-500'}`}>HRV:</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={hrvReadoutValue}
                            onChange={(e) => updatePerDrugSetting('hrvReadoutMinute', e.target.value)}
                            disabled={!isDrugEnabled}
                            className={`w-14 h-6 text-[10px] font-data bg-zinc-950 rounded-sm disabled:opacity-50 number-input-white-arrows ${isDrugEnabled ? colors.border : 'border-zinc-800'}`}
                            placeholder="0"
                          />
                          <span className={`text-[9px] ${isDrugEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                          {isDrugEnabled && String(hrvReadoutValue).trim() !== '' && (
                            <Badge variant="outline" className={`text-[8px] ${colors.border} ${colors.text}/80`}>
                              Readout: {parseFloat(hrvReadoutValue || 0) + perfStart + perfDelay}-{parseFloat(hrvReadoutValue || 0) + perfStart + perfDelay + 3}min
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className={`text-[9px] w-8 ${isDrugEnabled ? 'text-zinc-400' : 'text-zinc-500'}`}>BF:</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={bfReadoutValue}
                            onChange={(e) => updatePerDrugSetting('bfReadoutMinute', e.target.value)}
                            disabled={!isDrugEnabled}
                            className={`w-14 h-6 text-[10px] font-data bg-zinc-950 rounded-sm disabled:opacity-50 number-input-white-arrows ${isDrugEnabled ? colors.border : 'border-zinc-800'}`}
                            placeholder="0"
                          />
                          <span className={`text-[9px] ${isDrugEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>min</span>
                          {isDrugEnabled && String(bfReadoutValue).trim() !== '' && (
                            <Badge variant="outline" className={`text-[8px] ${colors.border} ${colors.text}/80`}>
                              Readout: {parseFloat(bfReadoutValue || 0) + perfStart + perfDelay}-{parseFloat(bfReadoutValue || 0) + perfStart + perfDelay + 1}min
                            </Badge>
                          )}
                        </div>
                        <div className={`text-[8px] mt-2 ${isDrugEnabled ? 'text-zinc-500' : 'text-zinc-600'}`}>
                          <div className="flex items-center gap-1">
                            <span>Input = Perf. Time</span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span>Drug Readout Time Range = Perf. Start + Perf. Delay + Perf. Time</span>
                            {idx === 0 && (
                              <TooltipProvider delayDuration={100}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button type="button" className="inline-flex">
                                      <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                                    <p className="mb-1"><strong>Perf. Start:</strong> Time point at which drug perfusion begins</p>
                                    <p className="mb-1"><strong>Perf. Delay:</strong> Transit time for drug to reach tissue</p>
                                    <p><strong>Perf. Time:</strong> Duration for drug effect to manifest</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Show disabled placeholder when no drugs selected */
              <div className="p-3 rounded-sm border bg-zinc-900/50 border-zinc-700/50 opacity-75 w-[340px]">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-400">
                    Drug Readout
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    className="h-5 px-2 text-[9px] rounded-full bg-zinc-700 text-zinc-500"
                  >
                    OFF
                  </Button>
                </div>
                <p className="text-[8px] text-zinc-500">Add a drug to enable drug readout</p>
              </div>
            )}
          </div>

          {/* Results display - Baseline and Drug Readout side by side, same prominence */}
          <div className="space-y-8 mt-4">
            {/* Baseline - prominent */}
            {baselineEnabled && baseline && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-cyan-500">
                  Baseline Readout Metrics
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

            {/* Drug readout metrics - one row per drug */}
            {allDrugReadouts.filter(d => d.hasData).length > 0 && (
              <div className="space-y-0 mt-4">
                {allDrugReadouts.filter(d => d.hasData).map((drugReadout, idx) => (
                  <div key={drugReadout.drugKey} className={`space-y-2 ${idx > 0 ? 'mt-4' : ''}`}>
                    <div className="flex items-center gap-2">
                      <p className={`text-[10px] uppercase tracking-wider font-bold ${drugReadout.colors.text}`}>
                        Drug Readout Metrics
                      </p>
                      <Badge variant="outline" className={`text-[8px] ${drugReadout.colors.border} ${drugReadout.colors.text}`}>
                        Perf. Start + Perf. Delay + Perf. Time
                      </Badge>
                      <Badge variant="outline" className={`text-[8px] ${drugReadout.colors.border} ${drugReadout.colors.text} font-medium`}>
                        {drugReadout.drugName}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {drugReadout.bfData && (
                        <MetricCard 
                          label="Mean BF" 
                          sublabel={`@${drugReadout.bfActualMinute}-${drugReadout.bfActualMinute + 1}min`}
                          value={drugReadout.bfData.avg_bf} 
                          unit="bpm"
                          highlight
                          highlightColor={drugReadout.colors.highlight}
                          tooltip="Beat Frequency (bpm)"
                        />
                      )}
                      {drugReadout.hrvData && (
                        <>
                          <MetricCard 
                            label="ln(RMSSD₇₀)" 
                            sublabel={`@${drugReadout.hrvActualMinute}-${drugReadout.hrvActualMinute + 3}min`}
                            value={drugReadout.hrvData.ln_rmssd70}
                            highlight
                            highlightColor={drugReadout.colors.highlight}
                            tooltip="Root Mean Square of Successive Differences (normalized to 70 bpm)"
                          />
                          <MetricCard 
                            label="ln(SDNN₇₀)" 
                            sublabel={`@${drugReadout.hrvActualMinute}-${drugReadout.hrvActualMinute + 3}min`}
                            value={drugReadout.hrvData.sdnn ? Math.log(drugReadout.hrvData.sdnn) : null}
                            highlight
                            highlightColor={drugReadout.colors.highlight}
                            tooltip="Standard Deviation of NN intervals (normalized to 70 bpm)"
                          />
                          <MetricCard 
                            label="pNN50₇₀" 
                            sublabel={`@${drugReadout.hrvActualMinute}-${drugReadout.hrvActualMinute + 3}min`}
                            value={drugReadout.hrvData.pnn50} 
                            unit="%"
                            highlight
                            highlightColor={drugReadout.colors.highlight}
                            tooltip="% of successive NN > 50ms (normalized to 70 bpm)"
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Evolution of HRV Metrics */}
      {hrvChartData.length > 0 && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
              Evolution of HRV Metrics
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex">
                      <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                    <p>Time evolution of HRV metrics computed over 3-minute sliding windows, normalized to 70 bpm.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                      {/* Drug effect regions (purple) - one per drug */}
                      {allDrugsForViz.map((drug, idx) => (
                        <ReferenceArea 
                          key={`hrv-evo-${drug.key}`}
                          x1={drug.perfStart + drug.perfDelay} 
                          x2={drug.perfEnd !== null ? drug.perfEnd : recordingEndMin} 
                          fill={drug.color.fill} 
                          fillOpacity={0.15 + (idx * 0.05)} 
                          stroke="none" 
                          ifOverflow="hidden" 
                        />
                      ))}
                      <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={{ r: 1.5 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-minute metrics table */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm mt-4">
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
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(AnalysisPanel);
