import { useState, useMemo, useCallback, useRef } from 'react';
import { Zap, Loader2, Search, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RotateCcw, Minus, Plus, Info, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';

// Format time in minutes only (e.g., 0.0, 0.5, 1.0, 2.0)
function formatTimeMin(minutes) {
  return `${minutes.toFixed(1)} min`;
}

// Format time for display in configuration (minutes only)
function formatTimeConfig(minutes) {
  return `${minutes.toFixed(1)}`;
}

function MetricCard({ label, value, unit, tooltip }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 flex items-center gap-1">
        {label}
        {tooltip && (
          <TooltipProvider delayDuration={100}>
            <ShadcnTooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex">
                  <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                <p>{tooltip}</p>
              </TooltipContent>
            </ShadcnTooltip>
          </TooltipProvider>
        )}
      </p>
      <p className="text-base font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

// Detrending Visualization Component
function DetrendingVisualization({ vizData, showOverlay, stimIdx }) {
  // Transform data for charts
  const chartData = useMemo(() => {
    if (!vizData || !vizData.time_rel || !vizData.nn_70) return [];
    return vizData.time_rel.map((t, i) => ({
      time: t,
      nn_70: vizData.nn_70[i],
      trend: vizData.trend[i],
      residual: vizData.residual[i],
    }));
  }, [vizData]);

  // Calculate Y-axis bounds
  const yBounds = useMemo(() => {
    if (!chartData.length) return { nn: [800, 900], residual: [-50, 50] };
    
    const nn70Values = chartData.map(d => d.nn_70).filter(v => !isNaN(v));
    const trendValues = chartData.map(d => d.trend).filter(v => !isNaN(v));
    const residualValues = chartData.map(d => d.residual).filter(v => !isNaN(v));
    
    const nnMin = Math.min(...nn70Values, ...trendValues);
    const nnMax = Math.max(...nn70Values, ...trendValues);
    const nnPadding = (nnMax - nnMin) * 0.1;
    
    const resMin = Math.min(...residualValues);
    const resMax = Math.max(...residualValues);
    const resPadding = Math.max(Math.abs(resMax), Math.abs(resMin)) * 0.2;
    
    return {
      nn: [Math.floor(nnMin - nnPadding), Math.ceil(nnMax + nnPadding)],
      residual: [Math.floor(resMin - resPadding), Math.ceil(resMax + resPadding)],
    };
  }, [chartData]);

  if (!chartData.length) {
    return <div className="text-zinc-500 text-sm text-center py-4">No visualization data available</div>;
  }

  if (showOverlay) {
    // Overlay mode: Raw NN_70 and detrended NN_residual plotted together
    return (
      <div className="space-y-2">
        <p className="text-[9px] text-zinc-500 text-center uppercase tracking-wider mb-1">
          Overlay: Raw NN₇₀ (cyan) vs Detrended Residual (green, shifted for visibility)
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, fill: '#52525b', fontSize: 8 }}
            />
            <YAxis 
              yAxisId="nn"
              tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }} 
              width={50}
              domain={yBounds.nn}
              label={{ value: 'NN₇₀ (ms)', angle: -90, fill: '#52525b', fontSize: 8, position: 'insideLeft' }}
            />
            <YAxis 
              yAxisId="residual"
              orientation="right"
              tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }} 
              width={50}
              domain={yBounds.residual}
              label={{ value: 'Residual (ms)', angle: 90, fill: '#52525b', fontSize: 8, position: 'insideRight' }}
            />
            <RechartsTooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 9, fontFamily: 'JetBrains Mono' }}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) : v, name]}
            />
            <ReferenceLine yAxisId="residual" y={0} stroke="#52525b" strokeDasharray="3 3" />
            <Line yAxisId="nn" type="monotone" dataKey="nn_70" name="Raw NN₇₀" stroke="#22d3ee" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line yAxisId="nn" type="monotone" dataKey="trend" name="LOESS Trend" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray="5 5" />
            <Line yAxisId="residual" type="monotone" dataKey="residual" name="Residual" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Three-panel view
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Panel A: Raw Data */}
      <div className="bg-zinc-950/50 p-2 rounded-sm border border-zinc-800">
        <p className="text-[9px] text-cyan-400 text-center uppercase tracking-wider mb-1 font-medium">
          Panel A: Raw NN₇₀
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <YAxis 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }} 
              width={40}
              domain={yBounds.nn}
            />
            <RechartsTooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 8, fontFamily: 'JetBrains Mono' }}
              formatter={(v) => [typeof v === 'number' ? v.toFixed(2) + ' ms' : v, 'NN₇₀']}
            />
            <Line type="monotone" dataKey="nn_70" stroke="#22d3ee" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[8px] text-zinc-600 text-center">Time (s) from stim start</p>
      </div>

      {/* Panel B: Trend Extraction */}
      <div className="bg-zinc-950/50 p-2 rounded-sm border border-zinc-800">
        <p className="text-[9px] text-amber-400 text-center uppercase tracking-wider mb-1 font-medium">
          Panel B: Trend Extraction
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <YAxis 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }} 
              width={40}
              domain={yBounds.nn}
            />
            <RechartsTooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 8, fontFamily: 'JetBrains Mono' }}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) + ' ms' : v, name]}
            />
            <Line type="monotone" dataKey="nn_70" name="Raw" stroke="#22d3ee" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.5} />
            <Line type="monotone" dataKey="trend" name="LOESS" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[8px] text-zinc-600 text-center">LOESS smoothed trend overlay</p>
      </div>

      {/* Panel C: Detrended Signal */}
      <div className="bg-zinc-950/50 p-2 rounded-sm border border-zinc-800">
        <p className="text-[9px] text-emerald-400 text-center uppercase tracking-wider mb-1 font-medium">
          Panel C: Detrended Residual
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
            <XAxis 
              dataKey="time" 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <YAxis 
              tick={{ fill: '#71717a', fontSize: 7, fontFamily: 'JetBrains Mono' }} 
              width={40}
              domain={yBounds.residual}
            />
            <RechartsTooltip
              contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 8, fontFamily: 'JetBrains Mono' }}
              formatter={(v) => [typeof v === 'number' ? v.toFixed(2) + ' ms' : v, 'Residual']}
            />
            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="residual" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[8px] text-zinc-600 text-center">NN₇₀ - Trend (zero reference)</p>
      </div>
    </div>
  );
}

export default function LightPanel({
  lightParams, onParamsChange,
  pulses, onDetectPulses, onPulsesUpdate,
  lightHrv, lightHrvDetrended, lightResponse,
  onComputeLightHRV, onComputeLightHRVDetrended, onComputeLightResponse,
  loading, metrics, lightEnabled, onLightEnabledChange
}) {
  const [localParams, setLocalParams] = useState(lightParams || {
    startTime: 180,
    pulseDuration: 20,
    interval: 'decreasing',
    nPulses: 5,
    autoDetect: true,
    searchRange: 20,
  });
  const [selectedPulseIdx, setSelectedPulseIdx] = useState(null);
  
  // State for detrended visualization expansion
  const [expandedStim, setExpandedStim] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loessFrac, setLoessFrac] = useState(0.25);
  const [localPulses, setLocalPulses] = useState(null);
  const [originalPulses, setOriginalPulses] = useState(null);
  
  // State for interactive chart editing
  const [editMode, setEditMode] = useState(null); // null | 'start' | 'end'
  const chartContainerRef = useRef(null);

  // Sync local pulses with prop
  useMemo(() => {
    if (pulses && !localPulses) {
      setLocalPulses(pulses);
      setOriginalPulses(pulses);
    }
  }, [pulses, localPulses]);

  // Transform pulses to ensure they have start_min and end_min
  const displayPulses = useMemo(() => {
    const sourcePulses = localPulses || pulses;
    if (!sourcePulses) return null;
    return sourcePulses.map(p => ({
      ...p,
      start_min: p.start_min !== undefined ? p.start_min : (p.start_sec / 60),
      end_min: p.end_min !== undefined ? p.end_min : (p.end_sec / 60),
    }));
  }, [localPulses, pulses]);

  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    if (onParamsChange) onParamsChange(updated);
  };

  // BF chart data
  const bfChartData = useMemo(() => {
    if (!metrics) return [];
    return metrics.filtered_beat_times_min.map((t, i) => ({
      time: t,
      bf: metrics.filtered_bf_bpm[i],
    }));
  }, [metrics]);

  // Get beat times array for beat-by-beat navigation
  const beatTimesMin = useMemo(() => {
    if (!metrics) return [];
    return metrics.filtered_beat_times_min;
  }, [metrics]);

  // Find nearest beat index for a given time
  const findNearestBeatIdx = useCallback((timeMin) => {
    if (!beatTimesMin.length) return -1;
    let nearestIdx = 0;
    let nearestDist = Math.abs(beatTimesMin[0] - timeMin);
    for (let i = 1; i < beatTimesMin.length; i++) {
      const dist = Math.abs(beatTimesMin[i] - timeMin);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    return nearestIdx;
  }, [beatTimesMin]);

  // Handle pulse adjustment by beats (+1/-1 beat)
  const handleAdjustPulseByBeat = useCallback((beatDelta) => {
    if (selectedPulseIdx === null || !displayPulses || !beatTimesMin.length) return;
    
    const pulse = displayPulses[selectedPulseIdx];
    const pulseDuration = pulse.end_min - pulse.start_min;
    
    // Find current start beat index
    const currentBeatIdx = findNearestBeatIdx(pulse.start_min);
    const newBeatIdx = Math.max(0, Math.min(beatTimesMin.length - 1, currentBeatIdx + beatDelta));
    
    const newStartMin = beatTimesMin[newBeatIdx];
    const newEndMin = newStartMin + pulseDuration;
    const delta = newStartMin - pulse.start_min;
    
    // Update this pulse and cascade to all future pulses
    const updatedPulses = displayPulses.map((p, i) => {
      if (i < selectedPulseIdx) {
        // Previous pulses stay the same
        return p;
      } else {
        // This pulse and all future pulses shift by delta
        const newStart = p.start_min + delta;
        const newEnd = p.end_min + delta;
        return {
          ...p,
          start_sec: newStart * 60,
          end_sec: newEnd * 60,
          start_min: newStart,
          end_min: newEnd,
        };
      }
    });
    
    setLocalPulses(updatedPulses);
  }, [selectedPulseIdx, displayPulses, beatTimesMin, findNearestBeatIdx]);

  // Handle pulse adjustment by fixed seconds (for coarse adjustment)
  const handleAdjustPulseBySeconds = useCallback((secondsDelta) => {
    if (selectedPulseIdx === null || !displayPulses) return;
    
    const pulse = displayPulses[selectedPulseIdx];
    const delta = secondsDelta / 60.0; // Convert to minutes
    
    // Update this pulse and cascade to all future pulses
    const updatedPulses = displayPulses.map((p, i) => {
      if (i < selectedPulseIdx) {
        return p;
      } else {
        const newStart = p.start_min + delta;
        const newEnd = p.end_min + delta;
        return {
          ...p,
          start_sec: newStart * 60,
          end_sec: newEnd * 60,
          start_min: newStart,
          end_min: newEnd,
        };
      }
    });
    
    setLocalPulses(updatedPulses);
  }, [selectedPulseIdx, displayPulses]);

  // Reset pulses to original detection
  const handleResetPulses = useCallback(() => {
    setLocalPulses(originalPulses);
    setSelectedPulseIdx(null);
  }, [originalPulses]);

  // Apply local pulses changes
  const handleApplyPulseChanges = useCallback(() => {
    if (localPulses && onPulsesUpdate) {
      onPulsesUpdate(localPulses);
      setOriginalPulses(localPulses);
    }
    setSelectedPulseIdx(null);
  }, [localPulses, onPulsesUpdate]);

  // Handle manual edit of pulse start/end times
  const handleManualPulseEdit = useCallback((pulseIdx, field, value) => {
    if (!displayPulses || isNaN(value)) return;
    
    const updatedPulses = displayPulses.map((p, i) => {
      if (i !== pulseIdx) return p;
      
      const newPulse = { ...p };
      if (field === 'start_min') {
        newPulse.start_min = value;
        newPulse.start_sec = value * 60;
      } else if (field === 'end_min') {
        newPulse.end_min = value;
        newPulse.end_sec = value * 60;
      }
      return newPulse;
    });
    
    setLocalPulses(updatedPulses);
  }, [displayPulses]);

  // Handle chart click to set stim boundary
  const handleChartClick = useCallback((e) => {
    if (selectedPulseIdx === null || !displayPulses || !editMode) return;
    if (!e || !e.activeLabel) return;
    
    const clickedTime = e.activeLabel; // Time in minutes from chart
    
    const updatedPulses = displayPulses.map((p, i) => {
      if (i !== selectedPulseIdx) return p;
      
      const newPulse = { ...p };
      if (editMode === 'start') {
        // Set start, ensure it's before end
        const newStart = Math.min(clickedTime, p.end_min - 0.01);
        newPulse.start_min = newStart;
        newPulse.start_sec = newStart * 60;
      } else if (editMode === 'end') {
        // Set end, ensure it's after start
        const newEnd = Math.max(clickedTime, p.start_min + 0.01);
        newPulse.end_min = newEnd;
        newPulse.end_sec = newEnd * 60;
      }
      return newPulse;
    });
    
    setLocalPulses(updatedPulses);
    
    // After setting start, switch to end mode; after end, exit edit mode
    if (editMode === 'start') {
      setEditMode('end');
    } else {
      setEditMode(null);
    }
  }, [selectedPulseIdx, displayPulses, editMode]);

  // Toggle edit mode for a specific boundary
  const toggleEditMode = useCallback((mode) => {
    if (editMode === mode) {
      setEditMode(null);
    } else {
      setEditMode(mode);
    }
  }, [editMode]);

  // Check if pulses have been modified
  const pulsesModified = useMemo(() => {
    if (!localPulses || !originalPulses) return false;
    return JSON.stringify(localPulses) !== JSON.stringify(originalPulses);
  }, [localPulses, originalPulses]);

  // Median light-induced HRV
  const medianHrv = lightHrv?.final;

  // Average Heart Rate Adaptation (was light response)
  const avgHra = lightResponse?.mean_metrics;

  const isLightEnabled = lightEnabled !== false;

  // X-axis tick formatter for min:sec
  const xAxisTickFormatter = (value) => {
    return formatTimeConfig(value);
  };

  return (
    <div className="space-y-4" data-testid="light-panel">
      {/* Enable/Disable Light Stim */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${isLightEnabled ? 'text-yellow-400' : 'text-zinc-600'}`} />
              <span className="text-sm font-medium text-zinc-200">Light Stimulation Analysis</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-zinc-500">
                {isLightEnabled ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                data-testid="light-enabled-switch"
                checked={isLightEnabled}
                onCheckedChange={onLightEnabledChange}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLightEnabled ? (
        <div className="flex items-center justify-center h-32 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-sm">
          Light stimulation analysis is disabled. Enable it above to continue.
        </div>
      ) : (
        <>
          {/* BF Chart with Pulse Regions */}
          {metrics && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
                  Beat Frequency - bpm vs time
                  {displayPulses && (
                    <Badge variant="outline" className="font-data text-[9px] border-yellow-700 text-yellow-400">
                      {displayPulses.length} pulses detected
                    </Badge>
                  )}
                  {pulsesModified && (
                    <Badge variant="outline" className="font-data text-[9px] border-orange-700 text-orange-400">
                      Modified
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {/* Edit mode indicator */}
                {editMode && selectedPulseIdx !== null && (
                  <div className="mb-2 p-2 bg-yellow-950/30 border border-yellow-700/50 rounded-sm">
                    <p className="text-[10px] text-yellow-400 text-center">
                      Click on the chart to set the <strong>{editMode === 'start' ? 'START' : 'END'}</strong> of Stim {selectedPulseIdx + 1}
                    </p>
                  </div>
                )}
                
                <div ref={chartContainerRef}>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart 
                      data={bfChartData}
                      onClick={editMode ? handleChartClick : undefined}
                      style={{ cursor: editMode ? 'crosshair' : 'default' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                      <XAxis 
                        dataKey="time" 
                        tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                        tickFormatter={xAxisTickFormatter}
                        interval="preserveStartEnd"
                      />
                      <YAxis 
                        tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} 
                        width={45}
                        label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} 
                      />
                      <RechartsTooltip
                        contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                        labelFormatter={(v) => formatTimeMin(v)}
                        formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']}
                      />
                      {/* Highlight pulse regions */}
                      {displayPulses && displayPulses.map((pulse, i) => (
                        <ReferenceArea
                          key={`pulse-${i}`}
                          x1={pulse.start_min}
                          x2={pulse.end_min}
                          fill={selectedPulseIdx === i ? '#facc15' : '#facc15'}
                          fillOpacity={selectedPulseIdx === i ? 0.35 : 0.18}
                          stroke="#facc15"
                          strokeOpacity={selectedPulseIdx === i ? 0.9 : 0.5}
                          strokeWidth={selectedPulseIdx === i ? 2 : 1}
                          onClick={() => {
                            setSelectedPulseIdx(i);
                            setEditMode(null);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                      <Line 
                        type="monotone" 
                        dataKey="bf" 
                        stroke="#22d3ee" 
                        strokeWidth={1} 
                        dot={false} 
                        isAnimationActive={false} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Pulse adjustment controls */}
                {selectedPulseIdx !== null && displayPulses && (
                  <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-zinc-900/50 rounded-sm border border-zinc-800">
                    <span className="text-[10px] text-zinc-400">
                      Stim {selectedPulseIdx + 1}:
                    </span>
                    
                    {/* Beat-by-beat adjustment */}
                    <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
                      <span className="text-[9px] text-zinc-500">Beat:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => handleAdjustPulseByBeat(-1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => handleAdjustPulseByBeat(1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {/* Coarse adjustment (5s) */}
                    <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
                      <span className="text-[9px] text-zinc-500">±5s:</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => handleAdjustPulseBySeconds(-5)}
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                        onClick={() => handleAdjustPulseBySeconds(5)}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {/* Click-to-edit on chart */}
                    <div className="flex items-center gap-1 border-r border-zinc-700 pr-2">
                      <span className="text-[9px] text-zinc-500">Click:</span>
                      <Button
                        variant={editMode === 'start' ? 'default' : 'outline'}
                        size="sm"
                        className={`h-6 px-2 text-[9px] ${editMode === 'start' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                        onClick={() => toggleEditMode('start')}
                      >
                        Start
                      </Button>
                      <Button
                        variant={editMode === 'end' ? 'default' : 'outline'}
                        size="sm"
                        className={`h-6 px-2 text-[9px] ${editMode === 'end' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                        onClick={() => toggleEditMode('end')}
                      >
                        End
                      </Button>
                    </div>
                    
                    <span className="text-[10px] font-data text-yellow-400 min-w-[100px] text-center">
                      {formatTimeConfig(displayPulses[selectedPulseIdx].start_min)} - {formatTimeConfig(displayPulses[selectedPulseIdx].end_min)} min
                    </span>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] text-zinc-500 hover:text-zinc-300"
                      onClick={() => setSelectedPulseIdx(null)}
                    >
                      <X className="w-3 h-3 mr-1" /> Deselect
                    </Button>
                  </div>
                )}
                
                {/* Info about cascade */}
                {selectedPulseIdx !== null && selectedPulseIdx < (displayPulses?.length || 0) - 1 && (
                  <p className="text-[9px] text-zinc-600 text-center mt-1">
                    Note: Moving this pulse will automatically shift all following pulses to maintain intervals.
                  </p>
                )}
                
                {/* Apply/Reset buttons when modified */}
                {pulsesModified && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-zinc-700 hover:bg-zinc-800"
                      onClick={handleResetPulses}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Reset
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-black"
                      onClick={handleApplyPulseChanges}
                    >
                      Apply Changes & Recompute
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Configuration */}
          <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
                <Zap className="w-4 h-4 text-yellow-400" />
                Light Stimulation Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Approx. Start (s)</Label>
                  <Input
                    data-testid="light-start-time"
                    type="number"
                    value={localParams.startTime}
                    onChange={(e) => updateParam('startTime', parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Pulse Duration (s)</Label>
                  <Select
                    value={String(localParams.pulseDuration)}
                    onValueChange={(v) => updateParam('pulseDuration', parseInt(v))}
                  >
                    <SelectTrigger data-testid="light-pulse-duration" className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20s</SelectItem>
                      <SelectItem value="30">30s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Intervals</Label>
                  <Select
                    value={localParams.interval}
                    onValueChange={(v) => updateParam('interval', v)}
                  >
                    <SelectTrigger data-testid="light-interval" className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="decreasing">60s-30s-20s-10s</SelectItem>
                      <SelectItem value="60">Uniform 60s</SelectItem>
                      <SelectItem value="30">Uniform 30s</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Pulses</Label>
                  <Input
                    data-testid="light-n-pulses"
                    type="number"
                    value={localParams.nPulses}
                    onChange={(e) => updateParam('nPulses', parseInt(e.target.value) || 5)}
                    className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                    min={1} max={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Search Range (s)</Label>
                  <Input
                    data-testid="light-search-range"
                    type="number"
                    value={localParams.searchRange || 20}
                    onChange={(e) => updateParam('searchRange', parseFloat(e.target.value) || 20)}
                    className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Switch
                    data-testid="auto-detect-switch"
                    checked={localParams.autoDetect}
                    onCheckedChange={(v) => updateParam('autoDetect', v)}
                  />
                  <Label className="text-[10px] text-zinc-400">Auto-detect start from BF increase</Label>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  data-testid="detect-pulses-btn"
                  className="h-7 text-xs rounded-sm bg-yellow-600 hover:bg-yellow-700 text-black font-medium"
                  onClick={() => {
                    setLocalPulses(null);
                    setOriginalPulses(null);
                    onDetectPulses(localParams);
                  }}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                  Detect Pulses
                </Button>
                {displayPulses && (
                  <>
                    <Button
                      data-testid="compute-light-hrv-btn"
                      variant="secondary"
                      className="h-7 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                      onClick={onComputeLightHRV}
                      disabled={loading}
                    >
                      Compute Light HRV
                    </Button>
                    <Button
                      data-testid="compute-light-response-btn"
                      variant="secondary"
                      className="h-7 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                      onClick={onComputeLightResponse}
                      disabled={loading}
                    >
                      Compute Heart Rate Adaptation
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pulse list */}
          {displayPulses && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
                  Detected Pulses
                  <Badge variant="outline" className="font-data text-[10px] border-yellow-700 text-yellow-400">
                    {displayPulses.length} pulses
                  </Badge>
                  {displayPulses.length >= 2 && (
                    <span className="text-[10px] font-data text-zinc-500">
                      Intervals: {displayPulses.slice(0, -1).map((p, i) => `${(displayPulses[i+1].start_sec - p.end_sec).toFixed(0)}s`).join(' \u2192 ')}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Visual pulse cards */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                  {displayPulses.map((p, i) => (
                    <div 
                      key={i} 
                      className={`bg-zinc-900/50 border rounded-sm p-2 text-center cursor-pointer transition-colors ${
                        selectedPulseIdx === i 
                          ? 'border-yellow-500 bg-yellow-950/20' 
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                      onClick={() => setSelectedPulseIdx(selectedPulseIdx === i ? null : i)}
                    >
                      <p className="text-[9px] text-zinc-500">Stim {i + 1}</p>
                      <p className="text-[10px] font-data text-yellow-400">
                        {formatTimeMinSec(p.start_min)} - {formatTimeMinSec(p.end_min)}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Manual edit table */}
                <Separator className="bg-zinc-800 my-3" />
                <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider flex items-center gap-2">
                  Manual Stim Boundaries
                  <TooltipProvider delayDuration={100}>
                    <ShadcnTooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Info className="w-3 h-3 text-zinc-600 hover:text-zinc-400 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                        Edit the start and end times directly. Changes apply after clicking "Apply Changes".
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7 w-16">Stim</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Start (min)</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">End (min)</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Duration (s)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayPulses.map((p, i) => (
                        <TableRow 
                          key={i} 
                          className={`border-zinc-800/50 ${selectedPulseIdx === i ? 'bg-yellow-950/20' : ''}`}
                        >
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                          <TableCell className="py-1">
                            <Input
                              type="number"
                              step="0.01"
                              value={p.start_min.toFixed(2)}
                              onChange={(e) => handleManualPulseEdit(i, 'start_min', parseFloat(e.target.value))}
                              className="h-6 w-20 text-[10px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
                            />
                          </TableCell>
                          <TableCell className="py-1">
                            <Input
                              type="number"
                              step="0.01"
                              value={p.end_min.toFixed(2)}
                              onChange={(e) => handleManualPulseEdit(i, 'end_min', parseFloat(e.target.value))}
                              className="h-6 w-20 text-[10px] font-data bg-zinc-950 border-zinc-800 rounded-sm"
                            />
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">
                            {((p.end_min - p.start_min) * 60).toFixed(1)}s
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Apply/Reset buttons */}
                {pulsesModified && (
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-zinc-700 hover:bg-zinc-800"
                      onClick={handleResetPulses}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Reset
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-black"
                      onClick={handleApplyPulseChanges}
                    >
                      Apply Changes & Recompute
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Light Induced Heart Rate Adaptation - using BPM */}
          {lightResponse && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
                  Light Induced Heart Rate Adaptation
                  <TooltipProvider delayDuration={100}>
                    <ShadcnTooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                        <p className="font-semibold mb-1">Heart Rate Adaptation Calculation:</p>
                        <ul className="list-disc pl-3 space-y-0.5 text-zinc-200">
                          <li><strong>Baseline BF:</strong> Mean BF from -2 to -1 min before first stim (shared for all stims)</li>
                          <li><strong>Peak%:</strong> 100 × Peak BF / Baseline BF</li>
                          <li><strong>Amplitude:</strong> Peak BF - Last BF in stim window</li>
                          <li><strong>Rate of Change:</strong> (Slope of BF) / Mean BF</li>
                        </ul>
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Mean Heart Rate Adaptation metrics - readout (average of 5 stims) */}
                {avgHra && (
                  <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2 mb-4">
                    <MetricCard 
                      label="Baseline BF" 
                      value={avgHra.baseline_bf} 
                      unit="bpm"
                      tooltip="Shared baseline BF: Mean BF from -2 to -1 min before the first light stimulation"
                    />
                    <MetricCard 
                      label="Avg BF" 
                      value={avgHra.avg_bf} 
                      unit="bpm"
                      tooltip="Average beat frequency during light stimulation"
                    />
                    <MetricCard 
                      label="Peak BF" 
                      value={avgHra.peak_bf} 
                      unit="bpm"
                      tooltip="Maximum beat frequency reached during light stimulation"
                    />
                    <MetricCard 
                      label="Peak %" 
                      value={avgHra.peak_norm_pct} 
                      unit="%"
                      tooltip="Peak BF normalized to baseline: 100 × Peak BF / Baseline BF"
                    />
                    <MetricCard 
                      label="Time to Peak (1st)" 
                      value={lightResponse?.per_stim?.[0]?.time_to_peak_sec} 
                      unit="s"
                      tooltip="Time to peak for the first light stimulation only"
                    />
                    <MetricCard 
                      label="Time to Peak (avg)" 
                      value={avgHra.time_to_peak_sec} 
                      unit="s"
                      tooltip="Average time from stimulation start to peak beat frequency (all 5 stims)"
                    />
                    <MetricCard 
                      label="Recovery BF" 
                      value={avgHra.bf_end} 
                      unit="bpm"
                      tooltip="Beat frequency at end of stimulation window (recovery)"
                    />
                    <MetricCard 
                      label="Recovery %" 
                      value={avgHra.bf_end_pct} 
                      unit="%"
                      tooltip="Recovery BF normalized to baseline: 100 × Recovery BF / Baseline BF"
                    />
                    <MetricCard 
                      label="Amplitude" 
                      value={avgHra.amplitude} 
                      unit="bpm"
                      tooltip="Peak BF − Recovery BF"
                    />
                    <MetricCard 
                      label="Rate of Change" 
                      value={avgHra.rate_of_change} 
                      unit="1/min"
                      tooltip="Linear slope (per minute) normalized by mean BF during stimulation"
                    />
                  </div>
                )}

                <Separator className="bg-zinc-800 my-3" />
                <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation Heart Rate Adaptation</p>
                
                <ScrollArea className="max-h-[250px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Beats</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Baseline BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Avg BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak %</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Time to Peak</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Recovery BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Recovery %</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Amplitude</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Rate of Change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lightResponse.per_stim.map((s, i) => (
                        <TableRow 
                          key={i} 
                          className={`border-zinc-800/50 data-row ${selectedPulseIdx === i ? 'bg-yellow-950/20' : ''}`}
                          onClick={() => setSelectedPulseIdx(i)}
                        >
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.n_beats : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">
                            {s ? s.baseline_bf?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.avg_bf?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.peak_bf?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.peak_norm_pct != null ? s.peak_norm_pct.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? `${s.time_to_peak_sec?.toFixed(1)}s` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.bf_end?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.bf_end_pct != null ? s.bf_end_pct.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.amplitude != null ? s.amplitude.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.rate_of_change != null ? s.rate_of_change.toFixed(4) : '\u2014'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Light HRV results (using NN_70) - Median style */}
          {lightHrv && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
                  Light-Induced HRV (NN₇₀, median across pulses)
                  <TooltipProvider delayDuration={100}>
                    <ShadcnTooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                        <p className="font-semibold mb-1">Light HRV Formula:</p>
                        <ul className="list-disc pl-3 space-y-0.5 text-zinc-200">
                          <li><strong>NN₇₀ = NN × (857 / median(NN))</strong> for each stim</li>
                          <li>Each stim uses its OWN median NN as reference</li>
                          <li>SDNN, RMSSD, pNN50 computed from normalized NN₇₀</li>
                          <li>Final values = <strong>median</strong> across all stims</li>
                        </ul>
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Readout (median of 5 stims) */}
                {medianHrv && (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <MetricCard 
                      label="ln(RMSSD₇₀)" 
                      value={medianHrv.ln_rmssd70}
                      tooltip="Log-transformed short-term beat-to-beat variability normalized to 70 bpm"
                    />
                    <MetricCard 
                      label="ln(SDNN₇₀)" 
                      value={medianHrv.ln_sdnn70}
                      tooltip="Log-transformed overall variability normalized to 70 bpm"
                    />
                    <MetricCard 
                      label="pNN50₇₀" 
                      value={medianHrv.pnn50}
                      unit="%"
                      tooltip="Percentage of successive intervals differing >50 ms (after 70 bpm normalization)"
                    />
                  </div>
                )}

                <Separator className="bg-zinc-800 my-3" />
                <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation HRV (using NN₇₀)</p>
                <ScrollArea className="h-[160px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">
                          <span className="flex items-center gap-1">
                            ln(RMSSD₇₀)
                            <TooltipProvider delayDuration={100}>
                              <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex">
                                    <Info className="w-2.5 h-2.5 text-zinc-600 hover:text-zinc-400 cursor-help" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                                  Log-transformed RMSSD₇₀
                                </TooltipContent>
                              </ShadcnTooltip>
                            </TooltipProvider>
                          </span>
                        </TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">RMSSD₇₀</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">
                          <span className="flex items-center gap-1">
                            ln(SDNN₇₀)
                            <TooltipProvider delayDuration={100}>
                              <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex">
                                    <Info className="w-2.5 h-2.5 text-zinc-600 hover:text-zinc-400 cursor-help" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                                  Log-transformed SDNN₇₀
                                </TooltipContent>
                              </ShadcnTooltip>
                            </TooltipProvider>
                          </span>
                        </TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">SDNN₇₀</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">
                          <span className="flex items-center gap-1">
                            pNN50₇₀
                            <TooltipProvider delayDuration={100}>
                              <ShadcnTooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="inline-flex">
                                    <Info className="w-2.5 h-2.5 text-zinc-600 hover:text-zinc-400 cursor-help" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                                  Percentage of successive intervals differing &gt;50 ms (after 70 bpm normalization)
                                </TooltipContent>
                              </ShadcnTooltip>
                            </TooltipProvider>
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lightHrv.per_pulse.map((p, i) => (
                        <TableRow 
                          key={i} 
                          className={`border-zinc-800/50 data-row ${selectedPulseIdx === i ? 'bg-yellow-950/20' : ''}`}
                        >
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_rmssd70?.toFixed(3) ?? '\u2014') : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.rmssd70.toFixed(3) : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_sdnn70?.toFixed(3) ?? '\u2014') : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.sdnn.toFixed(3) : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.pnn50.toFixed(3) : '\u2014'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Corrected Light-Induced HRV (Detrended) Section */}
          {lightHrv && displayPulses && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm border-t-2 border-t-emerald-600">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  Corrected Light-Induced HRV (Detrended)
                  <TooltipProvider delayDuration={100}>
                    <ShadcnTooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Info className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-help" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm text-xs bg-zinc-900 border-zinc-700 z-50 text-zinc-100">
                        <p className="font-semibold mb-1">Detrending Purpose:</p>
                        <p className="text-zinc-300 mb-2">Removes slow deterministic adaptation curve (peak → decay or delayed rise in CPVT) so HRV reflects true beat-to-beat irregularity only.</p>
                        <p className="font-semibold mb-1">Algorithm:</p>
                        <ul className="list-disc pl-3 space-y-0.5 text-zinc-200">
                          <li>Convert BF → NN: NN_k = 60000 / BF_k</li>
                          <li>Normalize: NN₇₀ = NN × (857 / median(NN))</li>
                          <li>Apply Robust LOESS smoothing (span ~25%)</li>
                          <li>Residual: NN_residual = NN₇₀ - Trend</li>
                          <li>HRV metrics computed on residuals</li>
                        </ul>
                      </TooltipContent>
                    </ShadcnTooltip>
                  </TooltipProvider>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Configuration and Compute Button */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] text-zinc-500">LOESS Span:</Label>
                    <Select
                      value={String(loessFrac)}
                      onValueChange={(v) => setLoessFrac(parseFloat(v))}
                    >
                      <SelectTrigger className="h-6 w-20 text-[10px] font-data bg-zinc-950 border-zinc-800 rounded-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.15">15%</SelectItem>
                        <SelectItem value="0.2">20%</SelectItem>
                        <SelectItem value="0.25">25%</SelectItem>
                        <SelectItem value="0.3">30%</SelectItem>
                        <SelectItem value="0.35">35%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    data-testid="compute-detrended-hrv-btn"
                    className="h-7 text-xs rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    onClick={() => onComputeLightHRVDetrended(loessFrac)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    Compute Detrended HRV
                  </Button>
                </div>

                {lightHrvDetrended ? (
                  <>
                    {/* Readout (median of 5 stims) */}
                    {lightHrvDetrended.final && (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <MetricCard 
                          label="ln(RMSSD₇₀) detrended" 
                          value={lightHrvDetrended.final.ln_rmssd70_detrended}
                          tooltip="Log-transformed RMSSD after removing trend - reflects pure beat-to-beat variability"
                        />
                        <MetricCard 
                          label="ln(SDNN₇₀) detrended" 
                          value={lightHrvDetrended.final.ln_sdnn70_detrended}
                          tooltip="Log-transformed SDNN after removing trend - reflects residual overall variability"
                        />
                        <MetricCard 
                          label="pNN50₇₀ detrended" 
                          value={lightHrvDetrended.final.pnn50_detrended}
                          unit="%"
                          tooltip="Percentage of successive detrended intervals differing >50 ms"
                        />
                      </div>
                    )}

                    <Separator className="bg-zinc-800 my-3" />
                    <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation Detrended HRV</p>
                    
                    {/* Per-stim table */}
                    <ScrollArea className="h-[160px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800 hover:bg-transparent">
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">ln(RMSSD₇₀)_det</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">RMSSD₇₀_det</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">ln(SDNN₇₀)_det</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">SDNN₇₀_det</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7">pNN50₇₀_det</TableHead>
                            <TableHead className="text-[10px] font-data text-zinc-500 h-7 w-20">Visualize</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lightHrvDetrended.per_pulse.map((p, i) => (
                            <TableRow 
                              key={i} 
                              className={`border-zinc-800/50 data-row ${expandedStim === i ? 'bg-emerald-950/20' : ''}`}
                            >
                              <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                              <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_rmssd70_detrended?.toFixed(3) ?? '\u2014') : '\u2014'}</TableCell>
                              <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.rmssd70_detrended?.toFixed(3) : '\u2014'}</TableCell>
                              <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_sdnn70_detrended?.toFixed(3) ?? '\u2014') : '\u2014'}</TableCell>
                              <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.sdnn_detrended?.toFixed(3) : '\u2014'}</TableCell>
                              <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.pnn50_detrended?.toFixed(3) : '\u2014'}</TableCell>
                              <TableCell className="py-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-5 text-[9px] px-2 ${expandedStim === i ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                  onClick={() => setExpandedStim(expandedStim === i ? null : i)}
                                  disabled={!p || !p.viz}
                                >
                                  {expandedStim === i ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>

                    {/* Expandable Visualization Panel */}
                    {expandedStim !== null && lightHrvDetrended.per_pulse[expandedStim]?.viz && (
                      <div className="mt-4 p-3 bg-zinc-900/50 rounded-sm border border-emerald-800/50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">
                            Detrending Visualization — Stim {expandedStim + 1}
                          </p>
                          <div className="flex items-center gap-2">
                            <Switch
                              id="overlay-toggle"
                              checked={showOverlay}
                              onCheckedChange={setShowOverlay}
                              className="h-4 w-7"
                            />
                            <Label htmlFor="overlay-toggle" className="text-[9px] text-zinc-400 cursor-pointer">
                              Overlay Mode
                            </Label>
                          </div>
                        </div>

                        {/* Visualization Charts */}
                        <DetrendingVisualization 
                          vizData={lightHrvDetrended.per_pulse[expandedStim].viz}
                          showOverlay={showOverlay}
                          stimIdx={expandedStim}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-zinc-600 text-sm">
                    Click "Compute Detrended HRV" above to calculate corrected HRV metrics with trend removal.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
