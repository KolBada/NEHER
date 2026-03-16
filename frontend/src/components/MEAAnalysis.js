import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Home, Save, Download, FileSpreadsheet, FileText, Zap, Activity, 
  Info, BarChart3, TrendingUp, Settings2, Check, FolderOpen, 
  FlaskConical, Plus, X, RefreshCw, Search, Loader2, Minus, RotateCcw,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ScatterChart, Scatter, ReferenceArea, Brush
} from 'recharts';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';
import SaveRecording from './SaveRecording';
import MEAExportPanel from './MEAExportPanel';

// ============================================================================
// DRUG CONFIGURATION (matching SSE)
// ============================================================================
const DRUG_CONFIG = {
  tetrodotoxin: { name: 'Tetrodotoxin', defaultConc: '1', unit: 'µM' },
  isoproterenol: { name: 'Isoproterenol', defaultConc: '1', unit: 'µM' },
  acetylcholine: { name: 'Acetylcholine', defaultConc: '1', unit: 'µM' },
  propranolol: { name: 'Propranolol', defaultConc: '5', unit: 'µM' },
  nepicastat: { name: 'Nepicastat', defaultConc: '30', unit: 'µM' },
  ruxolitinib: { name: 'Ruxolitinib', defaultConc: '2', unit: 'µM' },
};

// ============================================================================
// MetricCard Component for Light Stimulus Metrics
// ============================================================================
function LightMetricCard({ label, value, unit, tooltip, color = 'default' }) {
  const labelColor = color === 'cyan' ? '#22d3ee' : color === 'emerald' ? '#10b981' : color === 'amber' ? '#f59e0b' : color === 'orange' ? '#f97316' : 'var(--text-secondary)';
  const valueColor = color === 'cyan' ? '#67e8f9' : color === 'emerald' ? '#34d399' : color === 'amber' ? '#fbbf24' : color === 'orange' ? '#fb923c' : 'var(--text-primary)';
  const bgStyle = color === 'cyan' 
    ? { background: 'rgba(34, 211, 238, 0.08)', border: '1px solid rgba(34, 211, 238, 0.25)' }
    : color === 'emerald'
    ? { background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }
    : color === 'orange'
    ? { background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)' }
    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)' };
  
  return (
    <div className="rounded-xl p-3" style={bgStyle}>
      <p className="text-[9px] uppercase tracking-wider font-medium flex items-center gap-1" style={{ color: labelColor, letterSpacing: '0.08em' }}>
        {label}
        {tooltip && (
          <TooltipProvider delayDuration={100}>
            <TooltipProvider delayDuration={100}>
                            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex">
                  <Info className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs glass-surface z-50" style={{ color: 'var(--text-primary)' }}>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
                          </TooltipProvider>
          </TooltipProvider>
        )}
      </p>
      <p className="text-base font-data mt-1" style={{ color: valueColor, fontWeight: 600 }}>
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{unit}</p>}
    </div>
  );
}

// ============================================================================
// Metric Computation Functions (memoization-friendly pure functions)
// ============================================================================

function computeSpikeRate(spikes, activeElectrodes, binSize, duration) {
  if (!spikes?.length || !activeElectrodes?.length || !duration || duration <= 0) return [];
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    const spikeCount = spikes.filter(s => 
      s.timestamp >= binStart && s.timestamp < binEnd &&
      s.electrode && activeElectrodes.includes(s.electrode)
    ).length;
    
    bins.push({
      time: binStart + binSize / 2,
      bin_start: binStart,
      bin_end: binEnd,
      spike_count: spikeCount,
      spike_rate_hz: spikeCount / (binSize * activeElectrodes.length),
    });
  }
  return bins;
}

function computeBurstRate(bursts, activeElectrodes, binSize, duration) {
  if (!activeElectrodes?.length || !duration || duration <= 0) return [];
  
  // Handle different burst data structures
  const burstList = Array.isArray(bursts) ? bursts : [];
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    // Count bursts that overlap with this bin
    const burstCount = burstList.filter(b => {
      const bStart = b.start ?? b.start_time ?? b.onset ?? 0;
      const bEnd = b.stop ?? b.end_time ?? b.offset ?? bStart + 0.1;
      const electrode = b.electrode ?? b.channel ?? '';
      return bStart < binEnd && bEnd > binStart && 
             (!electrode || activeElectrodes.includes(electrode));
    }).length;
    
    bins.push({
      time: binStart + binSize / 2,
      bin_start: binStart,
      bin_end: binEnd,
      burst_count: burstCount,
      burst_rate_bpm: (burstCount / activeElectrodes.length) / (binSize / 60),
    });
  }
  return bins;
}

function computeWindowMean(timeSeries, key, startTime, endTime) {
  if (!timeSeries?.length) return null;
  const binsInWindow = timeSeries.filter(b => b.bin_start >= startTime && b.bin_end <= endTime);
  if (!binsInWindow.length) return null;
  const values = binsInWindow.map(b => b[key]).filter(v => !isNaN(v) && v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeCorrelation(x, y) {
  if (!x || !y || x.length !== y.length || x.length < 3) return { r: null, n: 0 };
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return { r: null, n };
  return { r: numerator / denominator, n };
}

function buildSpikeRaster(spikes, activeElectrodes) {
  if (!spikes?.length || !activeElectrodes?.length) return [];
  return spikes
    .filter(s => s.electrode && activeElectrodes.includes(s.electrode))
    .map(s => ({
      time: s.timestamp,
      electrodeIndex: activeElectrodes.indexOf(s.electrode),
    }));
}

function buildBurstRaster(bursts, activeElectrodes) {
  if (!activeElectrodes?.length) return [];
  const burstList = Array.isArray(bursts) ? bursts : [];
  return burstList
    .filter(b => {
      const electrode = b.electrode ?? b.channel ?? '';
      return !electrode || activeElectrodes.includes(electrode);
    })
    .map(b => ({
      start: b.start ?? b.start_time ?? b.onset ?? 0,
      stop: b.stop ?? b.end_time ?? b.offset ?? 0.1,
      electrodeIndex: activeElectrodes.indexOf(b.electrode ?? b.channel ?? activeElectrodes[0]),
    }));
}

// ============================================================================
// Memoized Chart Components with Zoom Controls
// ============================================================================

// Enhanced Spike Trace with zoom controls (no brush)
const SpikeTraceChartWithZoom = memo(function SpikeTraceChartWithZoom({ 
  data, duration, drugWindow, lightPulses, zoomDomain, onZoomChange, title = "SPIKE TRACE", drugName = null 
}) {
  const handleZoomIn = () => {
    if (!data?.length) return;
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 0.7;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleZoomOut = () => {
    if (!data?.length) return;
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 1.5;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleReset = () => onZoomChange?.(null);
  
  // Check if zoomed (domain is different from full range)
  const isZoomed = zoomDomain && (zoomDomain[0] > 0 || zoomDomain[1] < duration);

  if (!data?.length) {
    return <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No spike data</div>;
  }

  const stimCount = lightPulses?.length || 0;

  return (
    <div>
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: '#10b981' }} />
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#10b981' }}>{title}</span>
          {stimCount > 0 && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>{stimCount} stims</Badge>
          )}
          {drugName && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>{drugName}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomIn} title="Zoom In">
            <Plus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomOut} title="Zoom Out">
            <Minus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          {isZoomed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 hover:bg-white/10" onClick={handleReset} title="Reset">
              <RotateCcw className="w-3 h-3 mr-1" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Reset</span>
            </Button>
          )}
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="time" 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }}
              domain={zoomDomain || [0, duration]}
              allowDataOverflow
              type="number"
            />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Spike Rate (Hz)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
            <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
            {/* Drug window overlay (purple) - render first so it's behind line */}
            {drugWindow && (
              <ReferenceArea 
                x1={Math.max(drugWindow.start, (zoomDomain?.[0] || 0))} 
                x2={Math.min(drugWindow.end, (zoomDomain?.[1] || duration))} 
                fill="#a855f7" 
                fillOpacity={0.15} 
                ifOverflow="hidden"
              />
            )}
            {/* Light pulse overlays (amber) */}
            {lightPulses && lightPulses.map((pulse, i) => (
              <ReferenceArea 
                key={`st-pulse-${i}`} 
                x1={pulse.start_sec} 
                x2={pulse.end_sec} 
                fill="#facc15" 
                fillOpacity={0.18} 
                ifOverflow="hidden"
              />
            ))}
            <Line type="monotone" dataKey="spike_rate_hz" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Enhanced Burst Trace with zoom controls (no brush)
const BurstTraceChartWithZoom = memo(function BurstTraceChartWithZoom({ 
  data, duration, drugWindow, lightPulses, zoomDomain, onZoomChange, title = "BURST TRACE", drugName = null 
}) {
  const handleZoomIn = () => {
    if (!data?.length) return;
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 0.7;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleZoomOut = () => {
    if (!data?.length) return;
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 1.5;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleReset = () => onZoomChange?.(null);
  
  // Check if zoomed
  const isZoomed = zoomDomain && (zoomDomain[0] > 0 || zoomDomain[1] < duration);

  if (!data?.length) {
    return <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No burst data</div>;
  }

  const stimCount = lightPulses?.length || 0;

  return (
    <div>
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: '#f97316' }} />
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: '#f97316' }}>{title}</span>
          {stimCount > 0 && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>{stimCount} stims</Badge>
          )}
          {drugName && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>{drugName}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomIn} title="Zoom In">
            <Plus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomOut} title="Zoom Out">
            <Minus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          {isZoomed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 hover:bg-white/10" onClick={handleReset} title="Reset">
              <RotateCcw className="w-3 h-3 mr-1" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Reset</span>
            </Button>
          )}
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="time" 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }}
              domain={zoomDomain || [0, duration]}
              allowDataOverflow
              type="number"
            />
            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
            <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
            {/* Drug window overlay (purple) */}
            {drugWindow && (
              <ReferenceArea 
                x1={Math.max(drugWindow.start, (zoomDomain?.[0] || 0))} 
                x2={Math.min(drugWindow.end, (zoomDomain?.[1] || duration))} 
                fill="#a855f7" 
                fillOpacity={0.15} 
                ifOverflow="hidden"
              />
            )}
            {/* Light pulse overlays (amber) */}
            {lightPulses && lightPulses.map((pulse, i) => (
              <ReferenceArea 
                key={`bt-pulse-${i}`} 
                x1={pulse.start_sec} 
                x2={pulse.end_sec} 
                fill="#facc15" 
                fillOpacity={0.18} 
                ifOverflow="hidden"
              />
            ))}
            <Line type="monotone" dataKey="burst_rate_bpm" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Enhanced Spike Raster with zoom controls
const SpikeRasterPlotWithZoom = memo(function SpikeRasterPlotWithZoom({ 
  data, electrodes, duration, lightPulses, drugWindow, zoomDomain, onZoomChange, drugName = null 
}) {
  const handleZoomIn = () => {
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 0.7;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleZoomOut = () => {
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 1.5;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleReset = () => onZoomChange?.(null);
  
  // Check if zoomed
  const isZoomed = zoomDomain && (zoomDomain[0] > 0 || zoomDomain[1] < duration);

  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No spike raster data</div>;
  }
  const color = '#10b981';
  const nElectrodes = electrodes.length;
  const domain = zoomDomain || [0, duration];
  const stimCount = lightPulses?.length || 0;
  
  return (
    <div>
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: '#10b981' }} />
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Spike Raster</span>
          {stimCount > 0 && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>{stimCount} stims</Badge>
          )}
          {drugName && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>{drugName}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomIn} title="Zoom In">
            <Plus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomOut} title="Zoom Out">
            <Minus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          {isZoomed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 hover:bg-white/10" onClick={handleReset} title="Reset">
              <RotateCcw className="w-3 h-3 mr-1" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Reset</span>
            </Button>
          )}
        </div>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="time" 
              type="number" 
              domain={domain} 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} 
              allowDataOverflow 
            />
            <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, nElectrodes - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: `Electrode (n=${nElectrodes})`, angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
            {/* Drug window overlay */}
            {drugWindow && (
              <ReferenceArea 
                x1={Math.max(drugWindow.start, domain[0])} 
                x2={Math.min(drugWindow.end, domain[1])} 
                fill="#a855f7" 
                fillOpacity={0.12} 
                ifOverflow="hidden"
              />
            )}
            {/* Light pulse overlays */}
            {lightPulses && lightPulses.map((pulse, i) => (
              <ReferenceArea key={`sr-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.15} ifOverflow="hidden" />
            ))}
            <Scatter data={data} fill={color} shape={(props) => (
              <rect x={props.cx - 1} y={props.cy - 3} width={2} height={6} fill={color} />
            )} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Enhanced Burst Raster with zoom controls
const BurstRasterPlotWithZoom = memo(function BurstRasterPlotWithZoom({ 
  data, electrodes, duration, lightPulses, drugWindow, zoomDomain, onZoomChange, drugName = null 
}) {
  const handleZoomIn = () => {
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 0.7;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleZoomOut = () => {
    const [min, max] = zoomDomain || [0, duration];
    const range = max - min;
    const newRange = range * 1.5;
    const center = (min + max) / 2;
    onZoomChange?.([Math.max(0, center - newRange/2), Math.min(duration, center + newRange/2)]);
  };
  const handleReset = () => onZoomChange?.(null);
  
  // Check if zoomed
  const isZoomed = zoomDomain && (zoomDomain[0] > 0 || zoomDomain[1] < duration);

  const color = '#f97316';
  const nElectrodes = electrodes?.length || 0;
  const domain = zoomDomain || [0, duration];
  const stimCount = lightPulses?.length || 0;
  
  // Transform burst data to scatter points (use midpoint for positioning)
  const scatterData = useMemo(() => (data || []).map((b, idx) => ({
    time: (b.start + b.stop) / 2,
    startTime: b.start,
    stopTime: b.stop,
    electrodeIndex: b.electrodeIndex,
    key: idx,
  })), [data]);
  
  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No burst raster data</div>;
  }
  
  return (
    <div>
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: '#f97316' }} />
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Burst Raster</span>
          {stimCount > 0 && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>{stimCount} stims</Badge>
          )}
          {drugName && (
            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>{drugName}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomIn} title="Zoom In">
            <Plus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-white/10" onClick={handleZoomOut} title="Zoom Out">
            <Minus className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
          </Button>
          {isZoomed && (
            <Button variant="ghost" size="sm" className="h-6 px-2 hover:bg-white/10" onClick={handleReset} title="Reset">
              <RotateCcw className="w-3 h-3 mr-1" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Reset</span>
            </Button>
          )}
        </div>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="time" 
              type="number" 
              domain={domain} 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} 
              allowDataOverflow 
            />
            <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, nElectrodes - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: `Electrode (n=${nElectrodes})`, angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
            {/* Drug window overlay */}
            {drugWindow && (
              <ReferenceArea 
                x1={Math.max(drugWindow.start, domain[0])} 
                x2={Math.min(drugWindow.end, domain[1])} 
                fill="#a855f7" 
                fillOpacity={0.12} 
                ifOverflow="hidden"
              />
            )}
            {/* Light pulse overlays */}
            {lightPulses && lightPulses.map((pulse, i) => (
              <ReferenceArea key={`br-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.15} ifOverflow="hidden" />
            ))}
            <Scatter data={scatterData} fill={color} shape={(props) => {
              const burstWidth = Math.max(2, (props.payload.stopTime - props.payload.startTime) * 0.5);
              return <rect x={props.cx - burstWidth/2} y={props.cy - 3} width={burstWidth} height={6} fill={color} />;
            }} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Keep original simple components for backwards compatibility
const SpikeTraceChart = memo(function SpikeTraceChart({ data, duration, drugWindow, lightPulses }) {
  if (!data?.length) {
    return <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No spike data</div>;
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} />
          <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Spike Rate (Hz)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
          <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
          {drugWindow && <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#a855f7" fillOpacity={0.15} />}
          {lightPulses && lightPulses.map((pulse, i) => (
            <ReferenceArea key={`st-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.18} />
          ))}
          <Line type="monotone" dataKey="spike_rate_hz" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const BurstTraceChart = memo(function BurstTraceChart({ data, duration, drugWindow, lightPulses }) {
  if (!data?.length) {
    return <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No burst data</div>;
  }
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} />
          <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
          <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
          {drugWindow && <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#a855f7" fillOpacity={0.15} />}
          {lightPulses && lightPulses.map((pulse, i) => (
            <ReferenceArea key={`bt-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.18} />
          ))}
          <Line type="monotone" dataKey="burst_rate_bpm" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const SpikeRasterPlot = memo(function SpikeRasterPlot({ data, electrodes, duration, lightPulses, drugWindow, zoomDomain }) {
  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No spike raster data</div>;
  }
  const color = '#10b981';
  const nElectrodes = electrodes.length;
  const domain = zoomDomain || [0, duration];
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" type="number" domain={domain} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} allowDataOverflow />
          <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, nElectrodes - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: `Electrode (n=${nElectrodes})`, angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
          {/* Drug window overlay */}
          {drugWindow && <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#a855f7" fillOpacity={0.12} />}
          {/* Light pulse overlays */}
          {lightPulses && lightPulses.map((pulse, i) => (
            <ReferenceArea key={`sr-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.15} />
          ))}
          <Scatter data={data} fill={color} shape={(props) => (
            <line x1={props.cx} x2={props.cx} y1={props.cy - 2} y2={props.cy + 2} stroke={color} strokeWidth={1} />
          )} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});

const BurstRasterPlot = memo(function BurstRasterPlot({ data, electrodes, duration, lightPulses, drugWindow, zoomDomain }) {
  // Burst raster shows horizontal lines from start to stop for each burst
  const color = '#f97316';
  const nElectrodes = electrodes?.length || 0;
  const domain = zoomDomain || [0, duration];
  
  // Transform burst data to scatter points (use midpoint for positioning)
  // NOTE: useMemo must be called unconditionally before any early return
  const scatterData = useMemo(() => (data || []).map((b, idx) => ({
    time: (b.start + b.stop) / 2, // midpoint for X positioning
    startTime: b.start,
    stopTime: b.stop,
    electrodeIndex: b.electrodeIndex,
    key: idx,
  })), [data]);
  
  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No burst raster data</div>;
  }
  
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" type="number" domain={domain} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} allowDataOverflow />
          <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, nElectrodes - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: `Electrode (n=${nElectrodes})`, angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
          {/* Drug window overlay */}
          {drugWindow && <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#a855f7" fillOpacity={0.12} />}
          {/* Light pulse overlays */}
          {lightPulses && lightPulses.map((pulse, i) => (
            <ReferenceArea key={`br-pulse-${i}`} x1={pulse.start_sec} x2={pulse.end_sec} fill="#facc15" fillOpacity={0.15} />
          ))}
          <Scatter 
            data={scatterData} 
            fill={color} 
            shape={(props) => {
              // Calculate x positions for start and stop times
              // props.xAxis.scale gives us the scale function
              const xScale = props.xAxis?.scale;
              if (!xScale) {
                // Fallback: draw a vertical tick at the midpoint
                return <line x1={props.cx} x2={props.cx} y1={props.cy - 3} y2={props.cy + 3} stroke={color} strokeWidth={2} />;
              }
              const x1 = xScale(props.payload.startTime);
              const x2 = xScale(props.payload.stopTime);
              // Draw horizontal line for burst duration
              return <line x1={x1} x2={x2} y1={props.cy} y2={props.cy} stroke={color} strokeWidth={2} strokeLinecap="round" />;
            }} 
            isAnimationActive={false} 
          />
          <RechartsTooltip 
            contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} 
            formatter={(value, name, props) => {
              const payload = props.payload;
              return [`${payload.startTime?.toFixed(2)}s - ${payload.stopTime?.toFixed(2)}s`, 'Duration'];
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});

// Temperature trace chart for environmental data
const TemperatureTraceChart = memo(function TemperatureTraceChart({ data, duration, zoomDomain }) {
  if (!data?.length) {
    return <div className="h-32 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No temperature data</div>;
  }
  
  // Filter data to zoom domain if provided
  const domain = zoomDomain || [0, duration];
  const filteredData = data.filter(d => d.timestamp >= domain[0] && d.timestamp <= domain[1]);
  
  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filteredData} margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis 
            dataKey="timestamp" 
            stroke="rgba(255,255,255,0.3)" 
            tick={{ fontSize: 9, fill: '#71717a' }} 
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }}
            domain={domain}
            type="number"
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)" 
            tick={{ fontSize: 9, fill: '#71717a' }} 
            label={{ value: 'Temperature (°C)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }}
            domain={['dataMin - 0.5', 'dataMax + 0.5']}
          />
          <RechartsTooltip 
            contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }}
            formatter={(value) => [`${value.toFixed(2)} °C`, 'Temperature']}
            labelFormatter={(label) => `Time: ${label.toFixed(1)}s`}
          />
          <Line type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const CorrelationScatter = memo(function CorrelationScatter({ spikeData, burstData, correlation }) {
  const scatterData = useMemo(() => {
    if (!spikeData?.length || !burstData?.length) return [];
    return spikeData.map((sr, i) => ({
      x: sr.spike_rate_hz,
      y: burstData[i]?.burst_rate_bpm || 0,
    })).filter(d => !isNaN(d.x) && !isNaN(d.y) && d.x > 0 && d.y > 0);
  }, [spikeData, burstData]);
  
  // Compute linear regression for trend line
  const regression = useMemo(() => {
    if (scatterData.length < 2) return null;
    
    const n = scatterData.length;
    const sumX = scatterData.reduce((acc, d) => acc + d.x, 0);
    const sumY = scatterData.reduce((acc, d) => acc + d.y, 0);
    const sumXY = scatterData.reduce((acc, d) => acc + d.x * d.y, 0);
    const sumX2 = scatterData.reduce((acc, d) => acc + d.x * d.x, 0);
    const sumY2 = scatterData.reduce((acc, d) => acc + d.y * d.y, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Pearson correlation coefficient
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const r = denominator !== 0 ? numerator / denominator : 0;
    
    // t-statistic and p-value approximation
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Two-tailed p-value approximation using t-distribution (simplified)
    const df = n - 2;
    const p = df > 0 ? Math.exp(-0.717 * Math.abs(t) - 0.416 * t * t / df) : 1;
    
    const xMin = Math.min(...scatterData.map(d => d.x));
    const xMax = Math.max(...scatterData.map(d => d.x));
    
    return {
      slope,
      intercept,
      r,
      p: Math.max(0.001, Math.min(1, p)), // Clamp p-value
      n,
      lineData: [
        { x: xMin, y: slope * xMin + intercept },
        { x: xMax, y: slope * xMax + intercept },
      ]
    };
  }, [scatterData]);
  
  if (!scatterData.length) {
    return <div className="h-56 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>Insufficient data</div>;
  }
  
  return (
    <div className="relative">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, left: 55, bottom: 35 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="x" 
              type="number" 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              label={{ value: 'Spike Rate (Hz)', position: 'insideBottom', offset: -8, fontSize: 9, fill: '#71717a' }} 
            />
            <YAxis 
              dataKey="y" 
              type="number" 
              stroke="rgba(255,255,255,0.3)" 
              tick={{ fontSize: 9, fill: '#71717a' }} 
              label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: '#71717a' }} 
            />
            <RechartsTooltip 
              contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} 
              formatter={(value, name) => [value.toFixed(3), name === 'x' ? 'Spike Rate' : 'Burst Rate']}
            />
            <Scatter data={scatterData} fill="#10b981" isAnimationActive={false} />
            {/* Regression Line */}
            {regression && regression.lineData && (
              <Scatter 
                data={regression.lineData} 
                line={{ stroke: '#f59e0b', strokeWidth: 2 }} 
                shape={() => null}
                isAnimationActive={false} 
              />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {/* Pearson r/p inset */}
      {regression && (
        <div 
          className="absolute top-3 right-4 px-3 py-2 rounded-lg text-[10px] font-data"
          style={{ 
            background: 'rgba(0, 0, 0, 0.7)', 
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ color: '#10b981' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>r = </span>
            <span className="font-semibold">{regression.r.toFixed(3)}</span>
          </div>
          <div style={{ color: regression.p < 0.05 ? '#22d3ee' : 'var(--text-tertiary)' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>p </span>
            {regression.p < 0.001 ? '< 0.001' : `= ${regression.p.toFixed(3)}`}
          </div>
          <div style={{ color: 'var(--text-tertiary)' }}>
            n = {regression.n}
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Main MEA Analysis Component
// ============================================================================

export default function MEAAnalysis({ 
  meaData, 
  config, 
  onSave, 
  onHome,
  // Saved recording props
  savedRecordingId = null,
  savedFolderId = null,
  savedFolderName = null,
  savedRecordingData = null,
  isModified = false,
  onModified = () => {},
  onCancelEdit = () => {},
  onSaveComplete: parentOnSaveComplete = () => {},
  onGoToFolder = null,
}) {
  // Well state
  const [selectedWell, setSelectedWell] = useState(Object.keys(meaData?.wells || {})[0] || null);
  const [wellNames, setWellNames] = useState({});
  const [activeTab, setActiveTab] = useState('parameters');
  
  // Per-well parameters (bin sizes can be customized per well)
  const [wellParams, setWellParams] = useState({});
  
  // Shared readout configuration (applies to both spike AND burst)
  const [baselineEnabled, setBaselineEnabled] = useState(true);
  const [baselineMinute, setBaselineMinute] = useState(1); // Minute number (1-based)
  const [drugEnabled, setDrugEnabled] = useState(false);
  const [selectedDrugs, setSelectedDrugs] = useState([]);
  const [drugSettings, setDrugSettings] = useState({});
  const [drugPerfTime, setDrugPerfTime] = useState(3); // Perfusion time in minutes
  const [drugReadoutMinute, setDrugReadoutMinute] = useState(5); // Readout minute
  
  // Light stimulus state
  const [lightEnabled, setLightEnabled] = useState(false);
  const [lightParams, setLightParams] = useState({
    startTime: 300, // Approx start in seconds
    pulseDuration: 20, // Pulse duration in seconds
    interval: 'decreasing', // 'decreasing' or '60' or '30'
    nPulses: 5,
    searchRange: 20, // Search range in seconds
    autoDetect: true, // AI detector
  });
  const [lightPulses, setLightPulses] = useState(null); // Detected pulses
  const [originalLightPulses, setOriginalLightPulses] = useState(null);
  const [selectedPulseIdx, setSelectedPulseIdx] = useState(null);
  const [lightMetrics, setLightMetrics] = useState(null);
  const [lightLoading, setLightLoading] = useState(false);
  const [lightZoomDomain, setLightZoomDomain] = useState(null);
  const [editMode, setEditMode] = useState(null); // 'start' | 'end' | null
  
  // Zoom state for Parameters tab
  const [parametersZoomDomain, setParametersZoomDomain] = useState(null);
  
  // Zoom state for Spontaneous Activity tab
  const [spontaneousZoomDomain, setSpontaneousZoomDomain] = useState(null);
  
  // Table mode
  const [tableMode, setTableMode] = useState('minute');
  
  // Computing flag
  const [isComputing, setIsComputing] = useState(false);
  
  // Save Recording state
  const [recordingName, setRecordingName] = useState('');
  const [recordingDate, setRecordingDate] = useState('');
  const [organoidInfo, setOrganoidInfo] = useState([{ cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
  const [fusionDate, setFusionDate] = useState('');
  const [recordingDescription, setRecordingDescription] = useState('');

  // Track initial state for modification detection
  const [initialStateSnapshot, setInitialStateSnapshot] = useState(null);

  // Initialize state from saved recording data
  useEffect(() => {
    if (savedRecordingData?.analysis_state) {
      const state = savedRecordingData.analysis_state;
      // Restore recording metadata
      if (state.recordingName) setRecordingName(state.recordingName);
      if (state.recordingDate) setRecordingDate(state.recordingDate);
      if (state.organoidInfo) setOrganoidInfo(state.organoidInfo);
      if (state.fusionDate) setFusionDate(state.fusionDate);
      if (state.recordingDescription) setRecordingDescription(state.recordingDescription);
      // Restore well params
      if (state.wellParams) setWellParams(state.wellParams);
      // Restore drug settings
      if (state.drugEnabled !== undefined) setDrugEnabled(state.drugEnabled);
      if (state.selectedDrugs) setSelectedDrugs(state.selectedDrugs);
      if (state.drugSettings) setDrugSettings(state.drugSettings);
      if (state.drugPerfTime !== undefined) setDrugPerfTime(state.drugPerfTime);
      if (state.drugReadoutMinute !== undefined) setDrugReadoutMinute(state.drugReadoutMinute);
      // Restore light settings
      if (state.lightEnabled !== undefined) setLightEnabled(state.lightEnabled);
      if (state.lightParams) setLightParams(state.lightParams);
      if (state.lightPulses) setLightPulses(state.lightPulses);
      if (state.lightMetrics) setLightMetrics(state.lightMetrics); // Restore computed light metrics
      // Restore baseline settings
      if (state.baselineEnabled !== undefined) setBaselineEnabled(state.baselineEnabled);
      if (state.baselineMinute !== undefined) setBaselineMinute(state.baselineMinute);
      
      // Store snapshot of the exact fields we track for modification detection
      // Use a timeout to ensure all state updates have been applied
      setTimeout(() => {
        const snapshot = {
          recordingName: state.recordingName || '',
          recordingDate: state.recordingDate || '',
          organoidInfo: state.organoidInfo || [{ cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }],
          fusionDate: state.fusionDate || '',
          recordingDescription: state.recordingDescription || '',
          wellParams: state.wellParams || {},
          drugEnabled: state.drugEnabled ?? false,
          selectedDrugs: state.selectedDrugs || [],
          drugSettings: state.drugSettings || {},
          drugPerfTime: state.drugPerfTime ?? 3,
          drugReadoutMinute: state.drugReadoutMinute ?? 5,
          lightEnabled: state.lightEnabled ?? false,
          lightParams: state.lightParams || { startTime: 300, pulseDuration: 20, interval: 'decreasing', nPulses: 5, searchRange: 20, autoDetect: true },
          lightPulses: state.lightPulses || null,
          baselineEnabled: state.baselineEnabled ?? true,
          baselineMinute: state.baselineMinute ?? 1,
        };
        setInitialStateSnapshot(JSON.stringify(snapshot));
      }, 100);
    }
  }, [savedRecordingData]);

  // Auto-compute light metrics when loading a saved recording with lightPulses but no lightMetrics
  useEffect(() => {
    if (!savedRecordingData?.analysis_state) return;
    const state = savedRecordingData.analysis_state;
    
    // If we have light enabled and pulses but no metrics, auto-compute them
    // But we need wellAnalysis to be available first
    if (state.lightEnabled && state.lightPulses?.length > 0 && !state.lightMetrics && wellAnalysis) {
      const { spikeRateBins, burstRateBins } = wellAnalysis;
      if (!spikeRateBins?.length || !burstRateBins?.length) return;
      
      const pulses = state.lightPulses;
      const firstStimStart = pulses[0].start_sec;
      
      // Baseline: -2 to -1 min before first stim
      const blStart = Math.max(0, firstStimStart - 120);
      const blEnd = Math.max(0, firstStimStart - 60);
      const baselineSpikeHz = computeWindowMean(spikeRateBins, 'spike_rate_hz', blStart, blEnd) || 0;
      const baselineBurstBpm = computeWindowMean(burstRateBins, 'burst_rate_bpm', blStart, blEnd) || 0;
      
      // Compute per-stim metrics
      const perStim = pulses.map((pulse) => {
        const pStart = pulse.start_sec;
        const pEnd = pulse.end_sec;
        
        const spikeInWindow = spikeRateBins.filter(b => b.time >= pStart && b.time <= pEnd);
        const avgSpikeHz = spikeInWindow.length > 0 
          ? spikeInWindow.reduce((sum, b) => sum + b.spike_rate_hz, 0) / spikeInWindow.length 
          : 0;
        const maxSpikeHz = spikeInWindow.length > 0 
          ? Math.max(...spikeInWindow.map(b => b.spike_rate_hz)) 
          : 0;
        const maxSpikeBin = spikeInWindow.find(b => b.spike_rate_hz === maxSpikeHz);
        const spikeTimeToPeak = maxSpikeBin ? maxSpikeBin.time - pStart : 0;
        
        const burstInWindow = burstRateBins.filter(b => b.time >= pStart && b.time <= pEnd);
        const avgBurstBpm = burstInWindow.length > 0 
          ? burstInWindow.reduce((sum, b) => sum + b.burst_rate_bpm, 0) / burstInWindow.length 
          : 0;
        const maxBurstBpm = burstInWindow.length > 0 
          ? Math.max(...burstInWindow.map(b => b.burst_rate_bpm)) 
          : 0;
        const maxBurstBin = burstInWindow.find(b => b.burst_rate_bpm === maxBurstBpm);
        const burstTimeToPeak = maxBurstBin ? maxBurstBin.time - pStart : 0;
        
        const spikeChangePct = baselineSpikeHz > 0 ? 100 * avgSpikeHz / baselineSpikeHz : 0;
        const maxSpikeChangePct = baselineSpikeHz > 0 ? 100 * maxSpikeHz / baselineSpikeHz : 0;
        const burstChangePct = baselineBurstBpm > 0 ? 100 * avgBurstBpm / baselineBurstBpm : 0;
        const maxBurstChangePct = baselineBurstBpm > 0 ? 100 * maxBurstBpm / baselineBurstBpm : 0;
        
        return {
          baselineSpikeHz, avgSpikeHz, maxSpikeHz, spikeTimeToPeak, spikeChangePct, maxSpikeChangePct,
          baselineBurstBpm, avgBurstBpm, maxBurstBpm, burstTimeToPeak, burstChangePct, maxBurstChangePct,
        };
      });
      
      const n = perStim.length;
      const avgSpikeHzTotal = perStim.reduce((s, p) => s + p.avgSpikeHz, 0) / n;
      const maxSpikeHzTotal = perStim.reduce((s, p) => s + p.maxSpikeHz, 0) / n;
      const avgBurstBpmTotal = perStim.reduce((s, p) => s + p.avgBurstBpm, 0) / n;
      const maxBurstBpmTotal = perStim.reduce((s, p) => s + p.maxBurstBpm, 0) / n;
      
      const avg = {
        baselineSpikeHz,
        avgSpikeHz: avgSpikeHzTotal,
        maxSpikeHz: maxSpikeHzTotal,
        spikeTimeToPeak: perStim.reduce((s, p) => s + p.spikeTimeToPeak, 0) / n,
        spikeChangePct: baselineSpikeHz > 0 ? 100 * avgSpikeHzTotal / baselineSpikeHz : 0,
        maxSpikeChangePct: baselineSpikeHz > 0 ? 100 * maxSpikeHzTotal / baselineSpikeHz : 0,
        baselineBurstBpm,
        avgBurstBpm: avgBurstBpmTotal,
        maxBurstBpm: maxBurstBpmTotal,
        burstTimeToPeak: perStim.reduce((s, p) => s + p.burstTimeToPeak, 0) / n,
        burstChangePct: baselineBurstBpm > 0 ? 100 * avgBurstBpmTotal / baselineBurstBpm : 0,
        maxBurstChangePct: baselineBurstBpm > 0 ? 100 * maxBurstBpmTotal / baselineBurstBpm : 0,
      };
      
      setLightMetrics({ perStim, avg });
    }
  }, [savedRecordingData, wellAnalysis]);

  // Track modifications - notify parent when state changes
  useEffect(() => {
    if (!savedRecordingId || !initialStateSnapshot) return;
    
    const currentState = {
      recordingName,
      recordingDate,
      organoidInfo,
      fusionDate,
      recordingDescription,
      wellParams,
      drugEnabled,
      selectedDrugs,
      drugSettings,
      drugPerfTime,
      drugReadoutMinute,
      lightEnabled,
      lightParams,
      lightPulses,
      baselineEnabled,
      baselineMinute,
    };
    
    const hasChanged = JSON.stringify(currentState) !== initialStateSnapshot;
    onModified(hasChanged);
  }, [
    savedRecordingId, initialStateSnapshot, onModified,
    recordingName, recordingDate, organoidInfo, fusionDate, recordingDescription,
    wellParams, drugEnabled, selectedDrugs, drugSettings, drugPerfTime, drugReadoutMinute,
    lightEnabled, lightParams, lightPulses, baselineEnabled, baselineMinute
  ]);

  // Get current well's bin sizes (with defaults from config)
  const currentParams = useMemo(() => {
    const wp = wellParams[selectedWell] || {};
    return {
      spikeBinS: wp.spikeBinS ?? config?.spike_bin_s ?? 5,
      burstBinS: wp.burstBinS ?? config?.burst_bin_s ?? 30,
      minHz: wp.minHz ?? 0.01,
      maxHz: wp.maxHz ?? null, // null means no limit
    };
  }, [selectedWell, wellParams, config]);

  // Update well params
  const updateWellParam = useCallback((key, value) => {
    setWellParams(prev => ({
      ...prev,
      [selectedWell]: { ...prev[selectedWell], [key]: value }
    }));
  }, [selectedWell]);

  // Drug management
  const toggleDrug = useCallback((drugKey) => {
    setSelectedDrugs(prev => 
      prev.includes(drugKey) ? prev.filter(d => d !== drugKey) : [...prev, drugKey]
    );
    setDrugEnabled(true);
  }, []);

  // Compute all metrics for the selected well (heavily memoized)
  const wellAnalysis = useMemo(() => {
    if (!selectedWell || !meaData?.wells?.[selectedWell]) return null;
    
    const well = meaData.wells[selectedWell];
    const spikes = well.spikes || [];
    const electrode_bursts = well.electrode_bursts || well.bursts || [];
    const active_electrodes = well.active_electrodes || [];
    const duration_s = well.duration_s || 0;
    
    if (active_electrodes.length === 0 || duration_s <= 0) {
      return { 
        well: { ...well, active_electrodes, duration_s }, 
        spikeRateBins: [], 
        burstRateBins: [], 
        spikeRaster: [], 
        burstRaster: [],
        baselineSpikeHz: null,
        baselineBurstBpm: null,
        drugSpikeHz: null,
        drugBurstBpm: null,
        correlation: { r: null, n: 0 },
        perMinuteCombined: [],
      };
    }
    
    const spikeRateBins = computeSpikeRate(spikes, active_electrodes, currentParams.spikeBinS, duration_s);
    const burstRateBins = computeBurstRate(electrode_bursts, active_electrodes, currentParams.burstBinS, duration_s);
    const spikeRaster = buildSpikeRaster(spikes, active_electrodes);
    const burstRaster = buildBurstRaster(electrode_bursts, active_electrodes);
    
    // Baseline metrics (using shared minute)
    const blStart = (baselineMinute - 1) * 60;
    const blEnd = baselineMinute * 60;
    const baselineSpikeHz = baselineEnabled ? computeWindowMean(spikeRateBins, 'spike_rate_hz', blStart, blEnd) : null;
    const baselineBurstBpm = baselineEnabled ? computeWindowMean(burstRateBins, 'burst_rate_bpm', blStart, blEnd) : null;
    
    // Drug metrics (Perf. Start + Perf. Time = actual readout time)
    // e.g., if Perf. Start=3min and Perf. Time=4min, readout window is minute 7 (6-7min range)
    const drugReadoutTimeMin = drugPerfTime + drugReadoutMinute;
    const drugStart = (drugReadoutTimeMin - 1) * 60;
    const drugEnd = drugReadoutTimeMin * 60;
    const drugSpikeHz = drugEnabled && selectedDrugs.length > 0 ? computeWindowMean(spikeRateBins, 'spike_rate_hz', drugStart, drugEnd) : null;
    const drugBurstBpm = drugEnabled && selectedDrugs.length > 0 ? computeWindowMean(burstRateBins, 'burst_rate_bpm', drugStart, drugEnd) : null;
    
    // Correlation
    const spikeValues = spikeRateBins.map(b => b.spike_rate_hz);
    const burstValues = burstRateBins.map(b => b.burst_rate_bpm);
    // Align by bin index (assuming same number of bins for simplicity)
    const minLen = Math.min(spikeValues.length, burstValues.length);
    const correlation = computeCorrelation(spikeValues.slice(0, minLen), burstValues.slice(0, minLen));
    
    // Per-minute combined data
    const totalMinutes = Math.ceil(duration_s / 60);
    const perMinuteCombined = [];
    for (let m = 0; m < totalMinutes; m++) {
      const mStart = m * 60;
      const mEnd = (m + 1) * 60;
      perMinuteCombined.push({
        minute: m + 1,
        spike_rate_hz: computeWindowMean(spikeRateBins, 'spike_rate_hz', mStart, mEnd) || 0,
        spike_count: spikeRateBins.filter(b => b.bin_start >= mStart && b.bin_end <= mEnd).reduce((sum, b) => sum + b.spike_count, 0),
        burst_rate_bpm: computeWindowMean(burstRateBins, 'burst_rate_bpm', mStart, mEnd) || 0,
        burst_count: burstRateBins.filter(b => b.bin_start >= mStart && b.bin_end <= mEnd).reduce((sum, b) => sum + b.burst_count, 0),
      });
    }
    
    return {
      well: { ...well, active_electrodes, duration_s },
      spikeRateBins,
      burstRateBins,
      spikeRaster,
      burstRaster,
      baselineSpikeHz,
      baselineBurstBpm,
      drugSpikeHz,
      drugBurstBpm,
      correlation,
      perMinuteCombined,
    };
  }, [selectedWell, meaData, currentParams, baselineEnabled, baselineMinute, drugEnabled, selectedDrugs, drugReadoutMinute, drugPerfTime]);
  
  const wells = useMemo(() => Object.keys(meaData?.wells || {}).sort(), [meaData]);
  const duration = wellAnalysis?.well?.duration_s || 0;
  const wellName = wellNames[selectedWell] || selectedWell || '';

  // Get analysis state for Save Recording - defined AFTER wellAnalysis and duration
  // CRITICAL: Must include all well data (spikes, bursts, electrodes) for restore to work
  const getAnalysisState = useCallback(() => {
    const well = meaData?.wells?.[selectedWell] || {};
    return {
      source_type: 'MEA', // Important: must be 'source_type' not 'type' for correct routing
      type: 'MEA',
      selectedWell,
      well_id: selectedWell, // Store the well ID for restore
      wells: Object.keys(meaData?.wells || {}),
      config,
      wellParams,
      // Recording metadata
      recordingName,
      recordingDate,
      organoidInfo,
      fusionDate,
      recordingDescription,
      // Drug settings
      drugEnabled,
      selectedDrugs,
      drugSettings,
      drugPerfTime,
      drugReadoutMinute,
      // Light settings
      lightEnabled,
      lightParams,
      lightPulses,
      lightMetrics, // Save computed light stimulus metrics
      // Baseline settings
      baselineEnabled,
      baselineMinute,
      // Include MEA-specific metadata for proper routing
      n_electrodes: well.n_electrodes || 0,
      n_active_electrodes: well.active_electrodes?.length || wellAnalysis?.nActiveElectrodes || 0,
      active_electrodes: well.active_electrodes || [],
      duration_s: well.duration_s || duration,
      total_spikes: well.total_spikes || 0,
      mean_firing_rate_hz: well.mean_firing_rate_hz || 0,
      // CRITICAL: Include the actual spike and burst data
      spikes: well.spikes || [],
      electrode_bursts: well.electrode_bursts || well.bursts || [],
      network_bursts: well.network_bursts || [],
      // Include source file names for MEA (5 CSV files)
      source_files: meaData?.source_files || {},
      plate_id: meaData?.plate_id || 'MEA_plate',
      environmental_data: meaData?.environmental_data || [],
      electrode_filter: meaData?.electrode_filter || {},
      // Generate a readable filename for display (one per line)
      original_filename: Object.values(meaData?.source_files || {}).join('\n') || 'MEA Recording',
    };
  }, [selectedWell, meaData, config, wellParams, recordingName, recordingDate, organoidInfo, fusionDate, recordingDescription, drugEnabled, selectedDrugs, drugSettings, drugPerfTime, drugReadoutMinute, lightEnabled, lightParams, lightPulses, lightMetrics, baselineEnabled, baselineMinute, wellAnalysis, duration]);

  // Handle save complete - update snapshot to reset dirty state and notify parent
  const handleSaveComplete = useCallback((folderId, recordingId) => {
    // Update the initial snapshot to current state so isModified becomes false
    const currentSnapshot = {
      recordingName,
      recordingDate,
      organoidInfo,
      fusionDate,
      recordingDescription,
      wellParams,
      drugEnabled,
      selectedDrugs,
      drugSettings,
      drugPerfTime,
      drugReadoutMinute,
      lightEnabled,
      lightParams,
      lightPulses,
      baselineEnabled,
      baselineMinute,
    };
    setInitialStateSnapshot(JSON.stringify(currentSnapshot));
    
    // Notify parent to update savedRecordingId and savedFolderId
    parentOnSaveComplete(folderId, recordingId);
    
    toast.success(savedRecordingId ? 'MEA Recording updated successfully' : 'MEA Recording saved successfully');
  }, [recordingName, recordingDate, organoidInfo, fusionDate, recordingDescription, wellParams, drugEnabled, selectedDrugs, drugSettings, drugPerfTime, drugReadoutMinute, lightEnabled, lightParams, lightPulses, baselineEnabled, baselineMinute, parentOnSaveComplete, savedRecordingId]);

  // Drug window for visualization
  // Perf. Start = when drug is added (purple box starts)
  // Perf. Time = offset after Perf. Start for readout (e.g., if Perf. Start=3min and Perf. Time=4min, readout at 7min)
  // Purple box extends from Perf. Start to end of recording
  const drugWindow = drugEnabled && selectedDrugs.length > 0 ? {
    start: drugPerfTime * 60,
    end: duration, // extends to end of recording
  } : null;
  
  // Drug readout minute for metric calculation
  const drugReadoutTime = drugPerfTime + drugReadoutMinute; // Combined time for readout
  
  // Get drug name for display in chart badges
  const activeDrugName = drugEnabled && selectedDrugs.length > 0 
    ? selectedDrugs.map(d => DRUG_CONFIG[d]?.name || d).join(', ')
    : null;

  // ===========================================================================
  // Light Stimulus Detection and Computation Handlers
  // ===========================================================================
  
  const handleDetectLightStim = useCallback(() => {
    if (!wellAnalysis) return;
    setLightLoading(true);
    
    // Generate pulses based on configuration
    const { startTime, pulseDuration, interval, nPulses } = lightParams;
    const pulses = [];
    let t = startTime;
    
    // Interval pattern
    const intervals = interval === 'decreasing' 
      ? [60, 30, 20, 10] 
      : Array(nPulses).fill(parseInt(interval) || 30);
    
    for (let i = 0; i < nPulses; i++) {
      pulses.push({
        start_sec: t,
        end_sec: t + pulseDuration,
        index: i + 1,
      });
      // Add interval (gap between pulses)
      if (i < nPulses - 1) {
        t += pulseDuration + (intervals[i % intervals.length] || 30);
      }
    }
    
    setLightPulses(pulses);
    setOriginalLightPulses(JSON.parse(JSON.stringify(pulses)));
    setSelectedPulseIdx(null);
    setLightMetrics(null);
    
    setTimeout(() => {
      setLightLoading(false);
      toast.success(`${pulses.length} light stimuli detected`);
    }, 300);
  }, [wellAnalysis, lightParams]);
  
  const handleComputeSpikeAndBurst = useCallback(() => {
    if (!wellAnalysis || !lightPulses || lightPulses.length === 0) return;
    setLightLoading(true);
    
    const { spikeRateBins, burstRateBins } = wellAnalysis;
    const firstStimStart = lightPulses[0].start_sec;
    
    // Baseline: -2 to -1 min before first stim
    const blStart = Math.max(0, firstStimStart - 120);
    const blEnd = Math.max(0, firstStimStart - 60);
    const baselineSpikeHz = computeWindowMean(spikeRateBins, 'spike_rate_hz', blStart, blEnd) || 0;
    const baselineBurstBpm = computeWindowMean(burstRateBins, 'burst_rate_bpm', blStart, blEnd) || 0;
    
    // Compute per-stim metrics
    const perStim = lightPulses.map((pulse) => {
      const pStart = pulse.start_sec;
      const pEnd = pulse.end_sec;
      
      // Spike metrics for this stim
      const spikeInWindow = spikeRateBins.filter(b => b.time >= pStart && b.time <= pEnd);
      const avgSpikeHz = spikeInWindow.length > 0 
        ? spikeInWindow.reduce((sum, b) => sum + b.spike_rate_hz, 0) / spikeInWindow.length 
        : 0;
      const maxSpikeHz = spikeInWindow.length > 0 
        ? Math.max(...spikeInWindow.map(b => b.spike_rate_hz)) 
        : 0;
      const maxSpikeBin = spikeInWindow.find(b => b.spike_rate_hz === maxSpikeHz);
      const spikeTimeToPeak = maxSpikeBin ? maxSpikeBin.time - pStart : 0;
      
      // Burst metrics for this stim
      const burstInWindow = burstRateBins.filter(b => b.time >= pStart && b.time <= pEnd);
      const avgBurstBpm = burstInWindow.length > 0 
        ? burstInWindow.reduce((sum, b) => sum + b.burst_rate_bpm, 0) / burstInWindow.length 
        : 0;
      const maxBurstBpm = burstInWindow.length > 0 
        ? Math.max(...burstInWindow.map(b => b.burst_rate_bpm)) 
        : 0;
      const maxBurstBin = burstInWindow.find(b => b.burst_rate_bpm === maxBurstBpm);
      const burstTimeToPeak = maxBurstBin ? maxBurstBin.time - pStart : 0;
      
      // Per-stim delta percentages (new formula: 100 * value / baseline)
      const spikeChangePct = baselineSpikeHz > 0 ? 100 * avgSpikeHz / baselineSpikeHz : 0;
      const maxSpikeChangePct = baselineSpikeHz > 0 ? 100 * maxSpikeHz / baselineSpikeHz : 0;
      const burstChangePct = baselineBurstBpm > 0 ? 100 * avgBurstBpm / baselineBurstBpm : 0;
      const maxBurstChangePct = baselineBurstBpm > 0 ? 100 * maxBurstBpm / baselineBurstBpm : 0;
      
      return {
        baselineSpikeHz,
        avgSpikeHz,
        maxSpikeHz,
        spikeTimeToPeak,
        spikeChangePct,
        maxSpikeChangePct,
        baselineBurstBpm,
        avgBurstBpm,
        maxBurstBpm,
        burstTimeToPeak,
        burstChangePct,
        maxBurstChangePct,
      };
    });
    
    // Compute averaged metrics
    const n = perStim.length;
    const avgSpikeHzTotal = perStim.reduce((s, p) => s + p.avgSpikeHz, 0) / n;
    const maxSpikeHzTotal = perStim.reduce((s, p) => s + p.maxSpikeHz, 0) / n;
    const avgBurstBpmTotal = perStim.reduce((s, p) => s + p.avgBurstBpm, 0) / n;
    const maxBurstBpmTotal = perStim.reduce((s, p) => s + p.maxBurstBpm, 0) / n;
    
    const avg = {
      baselineSpikeHz,
      avgSpikeHz: avgSpikeHzTotal,
      maxSpikeHz: maxSpikeHzTotal,
      spikeTimeToPeak: perStim.reduce((s, p) => s + p.spikeTimeToPeak, 0) / n,
      // NEW FORMULA: 100 * avg / baseline
      spikeChangePct: baselineSpikeHz > 0 ? 100 * avgSpikeHzTotal / baselineSpikeHz : 0,
      maxSpikeChangePct: baselineSpikeHz > 0 ? 100 * maxSpikeHzTotal / baselineSpikeHz : 0,
      baselineBurstBpm,
      avgBurstBpm: avgBurstBpmTotal,
      maxBurstBpm: maxBurstBpmTotal,
      burstTimeToPeak: perStim.reduce((s, p) => s + p.burstTimeToPeak, 0) / n,
      // NEW FORMULA: 100 * avg / baseline
      burstChangePct: baselineBurstBpm > 0 ? 100 * avgBurstBpmTotal / baselineBurstBpm : 0,
      maxBurstChangePct: baselineBurstBpm > 0 ? 100 * maxBurstBpmTotal / baselineBurstBpm : 0,
    };
    
    setLightMetrics({ perStim, avg });
    
    setTimeout(() => {
      setLightLoading(false);
      toast.success('Spike and burst metrics computed');
    }, 300);
  }, [wellAnalysis, lightPulses]);
  
  const handleLightChartClick = useCallback((clickedTime) => {
    if (selectedPulseIdx === null || !lightPulses || !editMode) return;
    
    const newPulses = [...lightPulses];
    if (editMode === 'start') {
      newPulses[selectedPulseIdx] = {
        ...newPulses[selectedPulseIdx],
        start_sec: clickedTime,
      };
    } else if (editMode === 'end') {
      newPulses[selectedPulseIdx] = {
        ...newPulses[selectedPulseIdx],
        end_sec: clickedTime,
      };
    }
    setLightPulses(newPulses);
    setEditMode(null);
  }, [selectedPulseIdx, lightPulses, editMode]);
  
  const handleAdjustPulseBySeconds = useCallback((delta) => {
    if (selectedPulseIdx === null || !lightPulses) return;
    const newPulses = [...lightPulses];
    newPulses[selectedPulseIdx] = {
      ...newPulses[selectedPulseIdx],
      start_sec: newPulses[selectedPulseIdx].start_sec + delta,
      end_sec: newPulses[selectedPulseIdx].end_sec + delta,
    };
    setLightPulses(newPulses);
  }, [selectedPulseIdx, lightPulses]);
  
  // SSE-style: adjust start boundary by bin size
  const handleAdjustPulseStart = useCallback((binSize, direction) => {
    if (selectedPulseIdx === null || !lightPulses) return;
    const delta = direction * binSize;
    const newPulses = [...lightPulses];
    newPulses[selectedPulseIdx] = {
      ...newPulses[selectedPulseIdx],
      start_sec: Math.max(0, newPulses[selectedPulseIdx].start_sec + delta),
    };
    setLightPulses(newPulses);
  }, [selectedPulseIdx, lightPulses]);
  
  // SSE-style: adjust end boundary by bin size
  const handleAdjustPulseEnd = useCallback((binSize, direction) => {
    if (selectedPulseIdx === null || !lightPulses) return;
    const delta = direction * binSize;
    const newPulses = [...lightPulses];
    newPulses[selectedPulseIdx] = {
      ...newPulses[selectedPulseIdx],
      end_sec: newPulses[selectedPulseIdx].end_sec + delta,
    };
    setLightPulses(newPulses);
  }, [selectedPulseIdx, lightPulses]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Toaster theme="dark" position="top-right" />
      
      {/* ================================================================
          TOP BAR - SSE-aligned structure
      ================================================================ */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
        style={{
          background: 'rgba(2, 8, 15, 0.85)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(20, 184, 166, 0.15)',
          boxShadow: '0 4px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex items-center justify-between max-w-[1800px] mx-auto">
          {/* Left: Home + Title + Status + Well Chips */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs rounded-xl transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'var(--text-secondary)',
              }}
              onClick={onHome}
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.1rem', letterSpacing: '0.02em', color: 'var(--text-primary)' }}>
              NEHER
            </h1>
            <div className="h-5 w-px" style={{ background: 'rgba(255,255,255,0.12)' }} />
            {/* Status badge: Saved (emerald), Edit | Cancel (orange), Unsaved (red) */}
            {savedRecordingId && !isModified && (
              <Badge 
                variant="outline" 
                className="h-7 text-[11px] px-3 rounded-lg"
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#10b981',
                }}
              >
                <Check className="w-3 h-3 mr-1.5" />
                Saved
              </Badge>
            )}
            {savedRecordingId && isModified && (
              <Badge 
                variant="outline" 
                className="h-7 text-[11px] px-3 rounded-lg flex items-center gap-0"
                style={{
                  background: 'rgba(249, 115, 22, 0.12)',
                  border: '1px solid rgba(249, 115, 22, 0.35)',
                  color: '#f97316',
                }}
              >
                <span>Editing</span>
                <div className="h-3 w-px mx-2" style={{ background: 'rgba(249, 115, 22, 0.4)' }} />
                <button 
                  onClick={onCancelEdit}
                  className="hover:text-orange-200 transition-colors"
                  title="Revert to saved version"
                >
                  Cancel
                </button>
              </Badge>
            )}
            {!savedRecordingId && (
              <Badge 
                variant="outline" 
                className="h-7 text-[11px] px-3 rounded-lg"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#ef4444',
                }}
              >
                Unsaved
              </Badge>
            )}
            
            {/* Well selector chips - directly after Unsaved */}
            <div className="flex items-center gap-1">
              {wells.map(wellId => (
                <Button
                  key={wellId}
                  variant={selectedWell === wellId ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedWell(wellId)}
                  className="h-7 px-2.5 rounded-lg font-mono text-[11px] transition-all"
                  style={selectedWell === wellId ? {
                    background: '#10b981',
                    color: '#000',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
                  } : {
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {wellId}
                </Button>
              ))}
            </div>
            
            {/* Editable well name */}
            <Input
              value={wellName}
              onChange={(e) => setWellNames(prev => ({ ...prev, [selectedWell]: e.target.value }))}
              className="h-7 w-32 text-xs bg-transparent border-none px-2 rounded-lg focus:bg-white/5 focus:ring-1 focus:ring-white/20"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-primary)' }}
              placeholder="Well name..."
            />
          </div>
          
          {/* Center: Light + Drug Dropdown + Drug Badges */}
          <div className="flex items-center gap-2">
            {/* Light indicator */}
            {lightEnabled && (
              <Badge 
                variant="outline" 
                className="h-7 text-[11px] px-3 rounded-lg"
                style={{ background: 'rgba(250, 204, 21, 0.12)', border: '1px solid rgba(250, 204, 21, 0.35)', color: '#facc15' }}
              >
                <Zap className="w-3 h-3 mr-1" /> Light
              </Badge>
            )}
            
            {/* Drug dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Badge 
                  variant="outline" 
                  className="h-7 text-[11px] px-3 rounded-lg cursor-pointer transition-all hover:bg-white/10"
                  style={{
                    background: selectedDrugs.length > 0 ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.06)',
                    border: selectedDrugs.length > 0 ? '1px solid rgba(168, 85, 247, 0.25)' : '1px solid rgba(255,255,255,0.12)',
                    color: selectedDrugs.length > 0 ? '#a855f7' : 'var(--text-secondary)',
                  }}
                >
                  <FlaskConical className="w-3 h-3 mr-1.5" /> 
                  {selectedDrugs.length > 0 ? `${selectedDrugs.length} Drug${selectedDrugs.length > 1 ? 's' : ''}` : 'Add Drug'}
                  <Plus className="w-3 h-3 ml-1.5" />
                </Badge>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                className="border-0"
                style={{
                  background: 'rgba(10, 22, 40, 0.9)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '14px',
                }}
              >
                {Object.entries(DRUG_CONFIG).map(([key, cfg]) => (
                  <DropdownMenuItem
                    key={key}
                    className={`text-xs cursor-pointer rounded-lg mx-1 my-0.5 ${selectedDrugs.includes(key) ? 'text-purple-400' : ''}`}
                    style={{ color: selectedDrugs.includes(key) ? undefined : 'var(--text-primary)', padding: '8px 16px' }}
                    onClick={() => toggleDrug(key)}
                  >
                    {selectedDrugs.includes(key) && <Check className="w-3 h-3 mr-2" />}
                    {!selectedDrugs.includes(key) && <span className="w-3 mr-2" />}
                    {cfg.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Selected drug badges - simplified to just name and X */}
            {selectedDrugs.map((drugKey) => {
              const cfg = DRUG_CONFIG[drugKey];
              return (
                <Badge 
                  key={drugKey} 
                  variant="outline" 
                  className="h-7 text-[11px] px-3 rounded-lg transition-all hover:scale-105 cursor-pointer"
                  style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.40)', color: '#a855f7' }}
                  onClick={() => toggleDrug(drugKey)}
                >
                  {cfg.name}
                  <X className="w-3 h-3 ml-1.5" />
                </Badge>
              );
            })}
          </div>
          
          {/* Right: Go to Folder + Comparison - only show when saved */}
          {savedRecordingId ? (
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs px-3 rounded-xl transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'var(--text-secondary)',
                }}
                onClick={() => {
                  if (savedFolderId && onGoToFolder) {
                    onGoToFolder(savedFolderId);
                  } else if (!savedFolderId) {
                    toast.info('Recording not assigned to a folder');
                  }
                }}
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Go to Folder
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs px-3 rounded-xl transition-all"
                style={{
                  background: 'rgba(20, 184, 166, 0.12)',
                  border: '1px solid rgba(20, 184, 166, 0.35)',
                  color: 'var(--accent-teal)',
                  boxShadow: '0 0 20px rgba(20, 184, 166, 0.15)',
                }}
                onClick={() => toast.info('Comparison coming soon')}
              >
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Comparison
              </Button>
            </div>
          ) : (
            <div /> /* Empty spacer to maintain layout */
          )}
        </div>
      </header>
      
      {/* ================================================================
          MAIN CONTENT
      ================================================================ */}
      <main className="p-6 pt-20 relative z-10 max-w-[1800px] mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Section Selector Bar - SSE-aligned */}
          <div className="flex items-center gap-3 mb-6">
            <TabsList 
              className="h-9 rounded-xl p-1 gap-1"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}
            >
              <TabsTrigger 
                value="parameters" 
                className="h-7 px-3 text-xs rounded-lg gap-1.5 transition-all data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200 data-[state=inactive]:hover:bg-white/5"
              >
                <Settings2 className="w-3.5 h-3.5" /> Parameters
              </TabsTrigger>
              <TabsTrigger 
                value="spontaneous" 
                className="h-7 px-3 text-xs rounded-lg gap-1.5 transition-all data-[state=active]:bg-[rgba(244,206,162,0.15)] data-[state=active]:text-[#F4CEA2] data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200 data-[state=inactive]:hover:bg-white/5"
              >
                <BarChart3 className="w-3.5 h-3.5" style={{ color: '#F4CEA2' }} /> Spontaneous Activity
              </TabsTrigger>
              <TabsTrigger 
                value="light" 
                className="h-7 px-3 text-xs rounded-lg gap-1.5 transition-all data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200 data-[state=inactive]:hover:bg-white/5"
              >
                <Zap className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} /> Light Stimulus
              </TabsTrigger>
              <TabsTrigger 
                value="save" 
                className="h-7 px-3 text-xs rounded-lg gap-1.5 transition-all data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200 data-[state=inactive]:hover:bg-white/5"
              >
                <Save className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> Save Recording
              </TabsTrigger>
              <TabsTrigger 
                value="export" 
                className="h-7 px-3 text-xs rounded-lg gap-1.5 transition-all data-[state=active]:bg-teal-500/15 data-[state=active]:text-teal-300 data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-200 data-[state=inactive]:hover:bg-white/5"
              >
                <Download className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} /> Export
              </TabsTrigger>
            </TabsList>
            
            {/* Drug boxes inline with tabs (SSE style) */}
            {selectedDrugs.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedDrugs.map((drugKey, idx) => {
                  const cfg = DRUG_CONFIG[drugKey];
                  const settings = drugSettings[drugKey] || {};
                  return (
                    <div 
                      key={drugKey} 
                      className="flex items-center gap-2 h-9 px-3 rounded-xl text-[10px]"
                      style={{ background: 'rgba(168, 85, 247, 0.10)', border: '1px solid rgba(168, 85, 247, 0.30)' }}
                    >
                      <FlaskConical className="w-3 h-3" style={{ color: '#a855f7' }} />
                      <span className="font-medium" style={{ color: '#a855f7' }}>{cfg.name}</span>
                      <Input
                        type="text"
                        value={settings.concentration ?? cfg.defaultConc}
                        onChange={(e) => setDrugSettings(prev => ({ ...prev, [drugKey]: { ...prev[drugKey], concentration: e.target.value } }))}
                        className="h-5 w-12 text-[9px] bg-black/40 rounded px-1 text-center"
                        style={{ border: '1px solid rgba(168, 85, 247, 0.30)', color: '#a855f7' }}
                      />
                      <span style={{ color: 'rgba(168, 85, 247, 0.7)' }}>{cfg.unit}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* ============================================================
              PARAMETERS TAB
          ============================================================ */}
          <TabsContent value="parameters" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* All Electrodes Traces - 2/3 Width */}
              <div className="lg:col-span-2 glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid var(--text-secondary)' }}>
                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                      All Electrodes Trace
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-6">
                  {/* Spike Trace with Zoom */}
                  <SpikeTraceChartWithZoom 
                    data={wellAnalysis?.spikeRateBins} 
                    duration={duration} 
                    drugWindow={drugWindow} 
                    lightPulses={lightEnabled ? lightPulses : null}
                    zoomDomain={parametersZoomDomain}
                    onZoomChange={setParametersZoomDomain}
                    title="SPIKE TRACE"
                    drugName={activeDrugName}
                  />
                  {/* Burst Trace with Zoom */}
                  <BurstTraceChartWithZoom 
                    data={wellAnalysis?.burstRateBins} 
                    duration={duration} 
                    drugWindow={drugWindow} 
                    lightPulses={lightEnabled ? lightPulses : null}
                    zoomDomain={parametersZoomDomain}
                    onZoomChange={setParametersZoomDomain}
                    title="BURST TRACE"
                    drugName={activeDrugName}
                  />
                  
                  {/* Temperature Trace */}
                  {meaData?.environmental_data?.length > 0 && (
                    <div className="glass-surface-subtle rounded-xl overflow-hidden">
                      <div className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                          <span className="text-[10px] font-display font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                            TEMPERATURE TRACE
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0" style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
                          °C
                        </Badge>
                      </div>
                      <TemperatureTraceChart 
                        data={meaData.environmental_data}
                        duration={duration}
                        zoomDomain={parametersZoomDomain}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              {/* Parameters Panel - 1/3 Width */}
              <div className="glass-surface-subtle rounded-xl overflow-hidden">
                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                      Analysis Parameters
                    </span>
                    <Badge className="ml-auto text-[9px]" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                      {selectedWell}
                    </Badge>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {/* Bin Sizes */}
                  <div className="space-y-3">
                    <Label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Binning</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Spike Bin (s)</Label>
                        <Input
                          type="number"
                          value={currentParams.spikeBinS}
                          onChange={(e) => updateWellParam('spikeBinS', parseInt(e.target.value) || 5)}
                          className="h-8 text-xs font-data rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                          min={1} max={60}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Burst Bin (s)</Label>
                        <Input
                          type="number"
                          value={currentParams.burstBinS}
                          onChange={(e) => updateWellParam('burstBinS', parseInt(e.target.value) || 30)}
                          className="h-8 text-xs font-data rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                          min={5} max={120}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Electrode Filter */}
                  <div className="space-y-3">
                    <Label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Electrode Filter</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Min Firing Rate (Hz)</Label>
                        <Input
                          type="number"
                          value={currentParams.minHz}
                          onChange={(e) => updateWellParam('minHz', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs font-data rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                          min={0} step={0.01}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Max Firing Rate (Hz)</Label>
                        <Input
                          type="text"
                          value={currentParams.maxHz === null ? '' : currentParams.maxHz}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            updateWellParam('maxHz', val === '' ? null : parseFloat(val) || null);
                          }}
                          className="h-8 text-xs font-data rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                          placeholder="No limit"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Well Info */}
                  <div className="pt-2 space-y-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    <div className="flex justify-between">
                      <span>Active Electrodes:</span>
                      <span style={{ color: '#10b981' }}>{wellAnalysis?.well?.n_active_electrodes || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Spikes:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{wellAnalysis?.well?.total_spikes?.toLocaleString() || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{(duration / 60).toFixed(1)} min</span>
                    </div>
                  </div>
                  
                  {/* Rerun Button */}
                  <Button
                    className="w-full h-9 rounded-xl font-medium mt-4"
                    style={{ background: '#10b981', color: '#000' }}
                    onClick={() => {
                      setIsComputing(true);
                      toast.success(`Parameters updated for ${selectedWell}`);
                      setTimeout(() => setIsComputing(false), 500);
                    }}
                    disabled={isComputing}
                  >
                    {isComputing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Update Parameters
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
          
          {/* ============================================================
              SPONTANEOUS ACTIVITY TAB
          ============================================================ */}
          <TabsContent value="spontaneous" className="space-y-6">
            {wellAnalysis ? (
              <>
                {/* Row 1: Spike Trace + Burst Trace with Drug and Light Overlays and Zoom */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #10b981' }}>
                    <SpikeTraceChartWithZoom 
                      data={wellAnalysis.spikeRateBins} 
                      duration={duration} 
                      drugWindow={drugWindow} 
                      lightPulses={lightEnabled ? lightPulses : null}
                      zoomDomain={spontaneousZoomDomain}
                      onZoomChange={setSpontaneousZoomDomain}
                      title="SPIKE TRACE"
                      drugName={activeDrugName}
                    />
                  </div>
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #f97316' }}>
                    <BurstTraceChartWithZoom 
                      data={wellAnalysis.burstRateBins} 
                      duration={duration} 
                      drugWindow={drugWindow} 
                      lightPulses={lightEnabled ? lightPulses : null}
                      zoomDomain={spontaneousZoomDomain}
                      onZoomChange={setSpontaneousZoomDomain}
                      title="BURST TRACE"
                      drugName={activeDrugName}
                    />
                  </div>
                </div>
                
                {/* Row 2: Spike Raster + Burst Raster with Drug and Light Overlays and Zoom */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #10b981' }}>
                    <SpikeRasterPlotWithZoom 
                      data={wellAnalysis.spikeRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []} 
                      duration={duration}
                      drugWindow={drugWindow}
                      lightPulses={lightEnabled ? lightPulses : null}
                      zoomDomain={spontaneousZoomDomain}
                      onZoomChange={setSpontaneousZoomDomain}
                      drugName={activeDrugName}
                    />
                  </div>
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #f97316' }}>
                    <BurstRasterPlotWithZoom 
                      data={wellAnalysis.burstRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []} 
                      duration={duration}
                      drugWindow={drugWindow}
                      lightPulses={lightEnabled ? lightPulses : null}
                      zoomDomain={spontaneousZoomDomain}
                      onZoomChange={setSpontaneousZoomDomain}
                      drugName={activeDrugName}
                    />
                  </div>
                </div>
                <div 
                  className="glass-surface-subtle rounded-xl overflow-hidden"
                  style={{ borderLeft: `3px solid ${selectedDrugs.length > 0 ? '#a855f7' : '#22d3ee'}` }}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" style={{ color: selectedDrugs.length > 0 ? '#a855f7' : '#22d3ee' }} />
                      <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                        Readout Configuration
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Baseline Readout */}
                      <div 
                        className="p-3 rounded-xl transition-all"
                        style={{ 
                          background: baselineEnabled ? 'rgba(34, 211, 238, 0.08)' : 'rgba(255,255,255,0.03)', 
                          border: baselineEnabled ? '1px solid rgba(34, 211, 238, 0.25)' : '1px solid rgba(255,255,255,0.10)'
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[9px] uppercase tracking-wider font-medium" style={{ color: baselineEnabled ? '#22d3ee' : 'var(--text-tertiary)' }}>
                            Baseline Readout
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setBaselineEnabled(!baselineEnabled)}
                            className="h-5 px-2 text-[9px] rounded-full"
                            style={{
                              background: baselineEnabled ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255,255,255,0.08)',
                              color: baselineEnabled ? '#22d3ee' : 'var(--text-secondary)',
                            }}
                          >
                            {baselineEnabled ? 'ON' : 'OFF'}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>Minute:</Label>
                          <Input
                            type="number"
                            value={baselineMinute}
                            onChange={(e) => setBaselineMinute(parseInt(e.target.value) || 1)}
                            className="w-16 h-6 text-[10px] font-data rounded-lg"
                            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(34, 211, 238, 0.2)', color: '#22d3ee' }}
                            disabled={!baselineEnabled}
                            min={1}
                          />
                          <Badge variant="outline" className="text-[8px] px-2" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(34, 211, 238, 0.2)', color: 'rgba(34, 211, 238, 0.8)' }}>
                            {baselineMinute}-{baselineMinute + 1}min
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Drug Readout */}
                      <div 
                        className="p-3 rounded-xl transition-all"
                        style={{ 
                          background: drugEnabled && selectedDrugs.length > 0 ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.03)', 
                          border: drugEnabled && selectedDrugs.length > 0 ? '1px solid rgba(168, 85, 247, 0.25)' : '1px solid rgba(255,255,255,0.10)',
                          opacity: selectedDrugs.length > 0 ? 1 : 0.5
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[9px] uppercase tracking-wider font-medium" style={{ color: drugEnabled ? '#a855f7' : 'var(--text-tertiary)' }}>
                            Drug Readout
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDrugEnabled(!drugEnabled)}
                            className="h-5 px-2 text-[9px] rounded-full"
                            style={{
                              background: drugEnabled ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.08)',
                              color: drugEnabled ? '#a855f7' : 'var(--text-secondary)',
                            }}
                            disabled={selectedDrugs.length === 0}
                          >
                            {drugEnabled ? 'ON' : 'OFF'}
                          </Button>
                        </div>
                        {selectedDrugs.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-[9px] w-16" style={{ color: 'var(--text-secondary)' }}>Perf. Start:</Label>
                              <Input
                                type="number"
                                value={drugPerfTime}
                                onChange={(e) => setDrugPerfTime(parseInt(e.target.value) || 1)}
                                className="w-14 h-6 text-[10px] font-data rounded-lg"
                                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168, 85, 247, 0.2)', color: '#a855f7' }}
                                disabled={!drugEnabled}
                              />
                              <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>min</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-[9px] w-16" style={{ color: 'var(--text-secondary)' }}>Perf. Time:</Label>
                              <Input
                                type="number"
                                value={drugReadoutMinute}
                                onChange={(e) => setDrugReadoutMinute(parseInt(e.target.value) || 1)}
                                className="w-14 h-6 text-[10px] font-data rounded-lg"
                                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(168, 85, 247, 0.2)', color: '#a855f7' }}
                                disabled={!drugEnabled}
                              />
                              <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>min</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Add a drug to enable</p>
                        )}
                      </div>
                      
                      {/* Readout Metrics - More Prominent */}
                      <div 
                        className="p-4 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
                      >
                        <p className="text-[10px] uppercase tracking-wider font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>
                          Readout Metrics
                        </p>
                        <div className="grid grid-cols-2 gap-6">
                          {/* Spike Column */}
                          <div className="space-y-3">
                            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: '#10b981' }}>Spike</p>
                            <div>
                              <p className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Baseline</p>
                              <p className="text-base font-data font-semibold" style={{ color: '#22d3ee' }}>
                                {wellAnalysis.baselineSpikeHz?.toFixed(3) ?? '—'} <span className="text-xs font-normal opacity-70">Hz</span>
                              </p>
                            </div>
                            {drugEnabled && selectedDrugs.length > 0 && (
                              <div>
                                <p className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Drug</p>
                                <p className="text-base font-data font-semibold" style={{ color: '#a855f7' }}>
                                  {wellAnalysis.drugSpikeHz?.toFixed(3) ?? '—'} <span className="text-xs font-normal opacity-70">Hz</span>
                                </p>
                              </div>
                            )}
                          </div>
                          {/* Burst Column */}
                          <div className="space-y-3">
                            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: '#f97316' }}>Burst</p>
                            <div>
                              <p className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Baseline</p>
                              <p className="text-base font-data font-semibold" style={{ color: '#22d3ee' }}>
                                {wellAnalysis.baselineBurstBpm?.toFixed(3) ?? '—'} <span className="text-xs font-normal opacity-70">bpm</span>
                              </p>
                            </div>
                            {drugEnabled && selectedDrugs.length > 0 && (
                              <div>
                                <p className="text-[9px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Drug</p>
                                <p className="text-base font-data font-semibold" style={{ color: '#a855f7' }}>
                                  {wellAnalysis.drugBurstBpm?.toFixed(3) ?? '—'} <span className="text-xs font-normal opacity-70">bpm</span>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Per Minute Metrics */}
                <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid var(--text-secondary)' }}>
                  <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                        Per Minute Metrics
                      </span>
                    </div>
                    <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <Button
                        size="sm"
                        variant={tableMode === 'minute' ? 'default' : 'ghost'}
                        className="h-7 px-3 text-xs rounded-md"
                        style={tableMode === 'minute' ? { background: 'var(--text-secondary)', color: '#000' } : { color: 'var(--text-tertiary)' }}
                        onClick={() => setTableMode('minute')}
                      >
                        Per Minute
                      </Button>
                      <Button
                        size="sm"
                        variant={tableMode === 'bin' ? 'default' : 'ghost'}
                        className="h-7 px-3 text-xs rounded-md"
                        style={tableMode === 'bin' ? { background: 'var(--text-secondary)', color: '#000' } : { color: 'var(--text-tertiary)' }}
                        onClick={() => setTableMode('bin')}
                      >
                        Per Bin
                      </Button>
                    </div>
                  </div>
                  <div className="p-4">
                    {tableMode === 'minute' ? (
                      /* Combined Per-Minute Table */
                      <ScrollArea className="h-64 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Table>
                          <TableHeader>
                            <TableRow style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              <TableHead className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Minute</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#10b981' }}>Spike Rate (Hz)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#10b981' }}>Spike Count</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#f97316' }}>Burst Rate (bpm)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#f97316' }}>Burst Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {wellAnalysis.perMinuteCombined.map((row) => (
                              <TableRow key={row.minute} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>{row.minute}</TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: '#10b981' }}>{row.spike_rate_hz.toFixed(3)}</TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>{row.spike_count}</TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: '#f97316' }}>{row.burst_rate_bpm.toFixed(3)}</TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>{row.burst_count}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      /* Separate Per-Bin Tables */
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Spike Per-Bin */}
                        <div>
                          <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#10b981' }}>Spike Per Bin</h4>
                          <ScrollArea className="h-48 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                            <Table>
                              <TableHeader>
                                <TableRow style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                  <TableHead className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Bin Start (s)</TableHead>
                                  <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Rate (Hz)</TableHead>
                                  <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Count</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {wellAnalysis.spikeRateBins.map((row, i) => (
                                  <TableRow key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>{row.bin_start}</TableCell>
                                    <TableCell className="text-xs font-data text-right" style={{ color: '#10b981' }}>{row.spike_rate_hz.toFixed(3)}</TableCell>
                                    <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>{row.spike_count}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                        {/* Burst Per-Bin */}
                        <div>
                          <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#f97316' }}>Burst Per Bin</h4>
                          <ScrollArea className="h-48 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                            <Table>
                              <TableHeader>
                                <TableRow style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                  <TableHead className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Bin Start (s)</TableHead>
                                  <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Rate (bpm)</TableHead>
                                  <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Count</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {wellAnalysis.burstRateBins.map((row, i) => (
                                  <TableRow key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>{row.bin_start}</TableCell>
                                    <TableCell className="text-xs font-data text-right" style={{ color: '#f97316' }}>{row.burst_rate_bpm.toFixed(3)}</TableCell>
                                    <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>{row.burst_count}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </ScrollArea>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>Select a well to view analysis</div>
            )}
          </TabsContent>
          
          {/* ============================================================
              LIGHT STIMULUS TAB - Full Implementation
          ============================================================ */}
          <TabsContent value="light" className="space-y-6">
            {wellAnalysis ? (
              <>
                {/* Row 1: Spike Trace + Burst Trace with Light Overlays */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Spike Trace with Light Windows */}
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #10b981' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" style={{ color: '#10b981' }} />
                          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Spike Trace</span>
                          {lightEnabled && lightPulses && (
                            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>
                              {lightPulses.length} stims
                            </Badge>
                          )}
                          {drugEnabled && activeDrugName && (
                            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>
                              {activeDrugName}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
                            const mid = duration / 2;
                            const range = duration / 4;
                            setLightZoomDomain([mid - range, mid + range]);
                          }} title="Zoom In">
                            <Plus className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setLightZoomDomain(null)} disabled={!lightZoomDomain} title="Zoom Out">
                            <Minus className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                          </Button>
                          {lightZoomDomain && (
                            <Button variant="ghost" size="sm" className="h-5 px-1 text-[9px]" style={{ color: 'var(--text-secondary)' }} onClick={() => setLightZoomDomain(null)}>
                              <RotateCcw className="w-3 h-3 mr-1" />Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={wellAnalysis.spikeRateBins} 
                            margin={{ top: 10, right: 20, left: 50, bottom: 20 }}
                            onClick={(e) => {
                              if (editMode && selectedPulseIdx !== null && e?.activeLabel) {
                                const clickedTime = e.activeLabel;
                                handleLightChartClick(clickedTime);
                              }
                            }}
                            style={{ cursor: editMode ? 'crosshair' : 'default' }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis 
                              dataKey="time" 
                              stroke="rgba(255,255,255,0.3)" 
                              tick={{ fontSize: 9, fill: '#71717a' }} 
                              tickFormatter={(v) => v.toFixed(1)}
                              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }}
                              domain={lightZoomDomain || [0, duration]}
                              allowDataOverflow
                              type="number"
                            />
                            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Spike Rate (Hz)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
                            <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
                            {/* Drug window overlay (purple) */}
                            {drugWindow && (
                              <ReferenceArea 
                                x1={Math.max(drugWindow.start, (lightZoomDomain?.[0] || 0))} 
                                x2={Math.min(drugWindow.end, (lightZoomDomain?.[1] || duration))} 
                                fill="#a855f7" 
                                fillOpacity={0.15} 
                                ifOverflow="hidden"
                              />
                            )}
                            {/* Light pulse regions */}
                            {lightEnabled && lightPulses && lightPulses.map((pulse, i) => (
                              <ReferenceArea
                                key={`spike-pulse-${i}`}
                                x1={pulse.start_sec}
                                x2={pulse.end_sec}
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
                            <Line type="monotone" dataKey="spike_rate_hz" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* SSE-style Pulse adjustment controls for Spike Trace */}
                    {selectedPulseIdx !== null && lightPulses && (
                      <div 
                        className="flex items-center justify-center gap-2 mx-4 mb-4 p-2 rounded-lg flex-wrap"
                        style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.10)' }}
                      >
                        <span className="text-[10px] text-zinc-400 font-medium">Stim {selectedPulseIdx + 1}</span>
                        <div className="h-4 w-px bg-zinc-700" />
                        
                        {/* Start: value < > - adjust by spike bin */}
                        <span className="text-[9px] text-zinc-500">Start</span>
                        <span className="text-[9px] font-data text-zinc-300">{(lightPulses[selectedPulseIdx].start_sec).toFixed(1)}s</span>
                        <div className="flex items-center">
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800" 
                            onClick={() => handleAdjustPulseStart(currentParams.spikeBinS, -1)}
                            title={`-${currentParams.spikeBinS}s (spike bin)`}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseStart(currentParams.spikeBinS, 1)}
                            title={`+${currentParams.spikeBinS}s (spike bin)`}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        {/* End: value < > - adjust by spike bin */}
                        <span className="text-[9px] text-zinc-500">End</span>
                        <span className="text-[9px] font-data text-zinc-300">{(lightPulses[selectedPulseIdx].end_sec).toFixed(1)}s</span>
                        <div className="flex items-center">
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseEnd(currentParams.spikeBinS, -1)}
                            title={`-${currentParams.spikeBinS}s (spike bin)`}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseEnd(currentParams.spikeBinS, 1)}
                            title={`+${currentParams.spikeBinS}s (spike bin)`}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        {/* Click Start/End buttons with info tooltip */}
                        <div className="flex items-center gap-1">
                          <Button variant={editMode === 'start' ? 'default' : 'outline'} size="sm" 
                            className={`h-6 px-2 text-[9px] ${editMode === 'start' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                            onClick={() => setEditMode(editMode === 'start' ? null : 'start')}
                          >Start</Button>
                          <Button variant={editMode === 'end' ? 'default' : 'outline'} size="sm" 
                            className={`h-6 px-2 text-[9px] ${editMode === 'end' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                            onClick={() => setEditMode(editMode === 'end' ? null : 'end')}
                          >End</Button>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3 h-3 text-zinc-500 cursor-help ml-1" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] text-xs">
                              <p className="font-medium mb-1">Manual Light Detection</p>
                              <p className="text-zinc-400">Use the arrows to adjust the Start/End boundaries by one bin at a time.</p>
                              <p className="text-zinc-400 mt-1">Or click "Start" or "End" then click on the trace to set the boundary at that time point.</p>
                            </TooltipContent>
                          </Tooltip>
                          </TooltipProvider>
                        </div>
                        
                        <div className="h-4 w-px bg-zinc-700" />
                        <span className="text-[10px] font-data text-yellow-400">
                          {(lightPulses[selectedPulseIdx].start_sec / 60).toFixed(2)} - {(lightPulses[selectedPulseIdx].end_sec / 60).toFixed(2)} min
                        </span>
                        
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-zinc-500" onClick={() => { setSelectedPulseIdx(null); setEditMode(null); }}>
                          <X className="w-3 h-3 mr-1" /> Deselect
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {/* Burst Trace with Light Windows */}
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #f97316' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" style={{ color: '#f97316' }} />
                          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Burst Trace</span>
                          {lightEnabled && lightPulses && (
                            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#facc1530', color: '#facc15' }}>
                              {lightPulses.length} stims
                            </Badge>
                          )}
                          {drugEnabled && activeDrugName && (
                            <Badge className="text-[9px] px-1.5 py-0" style={{ background: '#a855f730', color: '#a855f7' }}>
                              {activeDrugName}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart 
                            data={wellAnalysis.burstRateBins} 
                            margin={{ top: 10, right: 20, left: 50, bottom: 20 }}
                            onClick={(e) => {
                              if (editMode && selectedPulseIdx !== null && e?.activeLabel) {
                                const clickedTime = e.activeLabel;
                                handleLightChartClick(clickedTime);
                              }
                            }}
                            style={{ cursor: editMode ? 'crosshair' : 'default' }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis 
                              dataKey="time" 
                              stroke="rgba(255,255,255,0.3)" 
                              tick={{ fontSize: 9, fill: '#71717a' }} 
                              tickFormatter={(v) => v.toFixed(1)}
                              label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }}
                              domain={lightZoomDomain || [0, duration]}
                              allowDataOverflow
                              type="number"
                            />
                            <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
                            <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
                            {/* Drug window overlay (purple) */}
                            {drugWindow && (
                              <ReferenceArea 
                                x1={Math.max(drugWindow.start, (lightZoomDomain?.[0] || 0))} 
                                x2={Math.min(drugWindow.end, (lightZoomDomain?.[1] || duration))} 
                                fill="#a855f7" 
                                fillOpacity={0.15} 
                                ifOverflow="hidden"
                              />
                            )}
                            {/* Light pulse regions */}
                            {lightEnabled && lightPulses && lightPulses.map((pulse, i) => (
                              <ReferenceArea
                                key={`burst-pulse-${i}`}
                                x1={pulse.start_sec}
                                x2={pulse.end_sec}
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
                            <Line type="monotone" dataKey="burst_rate_bpm" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* SSE-style Pulse adjustment controls for Burst Trace - uses burst bin */}
                    {selectedPulseIdx !== null && lightPulses && (
                      <div 
                        className="flex items-center justify-center gap-2 mx-4 mb-4 p-2 rounded-lg flex-wrap"
                        style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.10)' }}
                      >
                        <span className="text-[10px] text-zinc-400 font-medium">Stim {selectedPulseIdx + 1}</span>
                        <div className="h-4 w-px bg-zinc-700" />
                        
                        {/* Start: value < > - adjust by burst bin */}
                        <span className="text-[9px] text-zinc-500">Start</span>
                        <span className="text-[9px] font-data text-zinc-300">{(lightPulses[selectedPulseIdx].start_sec).toFixed(1)}s</span>
                        <div className="flex items-center">
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800" 
                            onClick={() => handleAdjustPulseStart(currentParams.burstBinS, -1)}
                            title={`-${currentParams.burstBinS}s (burst bin)`}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseStart(currentParams.burstBinS, 1)}
                            title={`+${currentParams.burstBinS}s (burst bin)`}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        {/* End: value < > - adjust by burst bin */}
                        <span className="text-[9px] text-zinc-500">End</span>
                        <span className="text-[9px] font-data text-zinc-300">{(lightPulses[selectedPulseIdx].end_sec).toFixed(1)}s</span>
                        <div className="flex items-center">
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseEnd(currentParams.burstBinS, -1)}
                            title={`-${currentParams.burstBinS}s (burst bin)`}
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" className="h-5 w-5 p-0 border-zinc-700 hover:bg-zinc-800"
                            onClick={() => handleAdjustPulseEnd(currentParams.burstBinS, 1)}
                            title={`+${currentParams.burstBinS}s (burst bin)`}
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        {/* Click Start/End buttons with info tooltip */}
                        <div className="flex items-center gap-1">
                          <Button variant={editMode === 'start' ? 'default' : 'outline'} size="sm" 
                            className={`h-6 px-2 text-[9px] ${editMode === 'start' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                            onClick={() => setEditMode(editMode === 'start' ? null : 'start')}
                          >Start</Button>
                          <Button variant={editMode === 'end' ? 'default' : 'outline'} size="sm" 
                            className={`h-6 px-2 text-[9px] ${editMode === 'end' ? 'bg-yellow-600 hover:bg-yellow-700 text-black' : 'border-zinc-700 hover:bg-zinc-800'}`}
                            onClick={() => setEditMode(editMode === 'end' ? null : 'end')}
                          >End</Button>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3 h-3 text-zinc-500 cursor-help ml-1" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] text-xs">
                              <p className="font-medium mb-1">Manual Light Detection</p>
                              <p className="text-zinc-400">Use the arrows to adjust the Start/End boundaries by one bin at a time.</p>
                              <p className="text-zinc-400 mt-1">Or click "Start" or "End" then click on the trace to set the boundary at that time point.</p>
                            </TooltipContent>
                          </Tooltip>
                          </TooltipProvider>
                        </div>
                        
                        <div className="h-4 w-px bg-zinc-700" />
                        <span className="text-[10px] font-data text-yellow-400">
                          {(lightPulses[selectedPulseIdx].start_sec / 60).toFixed(2)} - {(lightPulses[selectedPulseIdx].end_sec / 60).toFixed(2)} min
                        </span>
                        
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] text-zinc-500" onClick={() => { setSelectedPulseIdx(null); setEditMode(null); }}>
                          <X className="w-3 h-3 mr-1" /> Deselect
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Row 2: Spike Raster + Burst Raster with Light Overlays and Zoom */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #10b981' }}>
                    <SpikeRasterPlotWithZoom 
                      data={wellAnalysis.spikeRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []} 
                      duration={duration}
                      lightPulses={lightEnabled ? lightPulses : null}
                      drugWindow={drugWindow}
                      zoomDomain={lightZoomDomain}
                      onZoomChange={setLightZoomDomain}
                      drugName={activeDrugName}
                    />
                  </div>
                  <div className="glass-surface-subtle rounded-xl overflow-hidden p-4" style={{ borderLeft: '3px solid #f97316' }}>
                    <BurstRasterPlotWithZoom 
                      data={wellAnalysis.burstRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []} 
                      duration={duration}
                      lightPulses={lightEnabled ? lightPulses : null}
                      drugWindow={drugWindow}
                      zoomDomain={lightZoomDomain}
                      onZoomChange={setLightZoomDomain}
                      drugName={activeDrugName}
                    />
                  </div>
                </div>
                <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #f59e0b' }}>
                  {/* Header */}
                  <div className="py-3 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4" style={{ color: lightEnabled ? '#fbbf24' : 'var(--text-tertiary)' }} />
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Light Stimulation Analysis</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                          {lightEnabled ? 'Enabled' : 'Disabled'}
                        </Label>
                        <Switch checked={lightEnabled} onCheckedChange={setLightEnabled} />
                      </div>
                    </div>
                  </div>
                  
                  {/* Configuration Section - only when enabled */}
                  {lightEnabled && (
                    <>
                      <div className="p-4 pb-2">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>Configuration</span>
                      </div>
                      <div className="p-4 pt-2">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Approx. Start (s)</Label>
                            <Input
                              type="number"
                              value={lightParams.startTime}
                              onChange={(e) => setLightParams(p => ({ ...p, startTime: parseFloat(e.target.value) || 0 }))}
                              className="h-7 text-xs font-data rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Pulse Duration (s)</Label>
                            <Select value={String(lightParams.pulseDuration)} onValueChange={(v) => setLightParams(p => ({ ...p, pulseDuration: parseInt(v) }))}>
                              <SelectTrigger className="h-7 text-xs font-data rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="20">20s</SelectItem>
                                <SelectItem value="30">30s</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Intervals</Label>
                            <Select value={lightParams.interval} onValueChange={(v) => setLightParams(p => ({ ...p, interval: v }))}>
                              <SelectTrigger className="h-7 text-xs font-data rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
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
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Pulses</Label>
                            <Input
                              type="number"
                              value={lightParams.nPulses}
                              onChange={(e) => setLightParams(p => ({ ...p, nPulses: parseInt(e.target.value) || 5 }))}
                              className="h-7 text-xs font-data rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              min={1} max={20}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Search Range (s)</Label>
                            <Input
                              type="number"
                              value={lightParams.searchRange}
                              onChange={(e) => setLightParams(p => ({ ...p, searchRange: parseFloat(e.target.value) || 20 }))}
                              className="h-7 text-xs font-data rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-4">
                          <Switch checked={lightParams.autoDetect} onCheckedChange={(v) => setLightParams(p => ({ ...p, autoDetect: v }))} />
                          <Label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>AI light stim detector</Label>
                          <TooltipProvider delayDuration={100}>
                            <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="inline-flex">
                                  <Info className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs text-xs glass-surface z-50" style={{ color: 'var(--text-primary)' }}>
                                When ON, uses AI to detect stim boundaries by analyzing spike/burst patterns. When OFF, uses only the manual settings.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          </TooltipProvider>
                        </div>
                        
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            className="h-7 text-xs rounded-lg font-medium"
                            style={{ background: '#f59e0b', color: '#02080f' }}
                            onClick={handleDetectLightStim}
                            disabled={lightLoading}
                          >
                            {lightLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                            Detect Light Stimulus
                          </Button>
                          {lightPulses && (
                            <Button
                              className="h-7 text-xs rounded-lg font-medium"
                              style={{ background: 'rgba(16, 185, 129, 0.8)', color: '#000' }}
                              onClick={handleComputeSpikeAndBurst}
                              disabled={lightLoading}
                            >
                              {lightLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                              Compute Spike and Burst
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Detected Light Stims - Pulse Cards */}
                      {lightPulses && (
                        <>
                          <hr className="border-zinc-700/50 mx-4" />
                          <div className="p-4 pb-2">
                            <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Detected Light Stims</span>
                              <Badge variant="outline" className="font-data text-[10px]" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                                {lightPulses.length} stims
                              </Badge>
                            </div>
                          </div>
                          <div className="p-4 pt-2">
                            <div className="grid grid-cols-5 gap-2 mb-4">
                              {lightPulses.map((p, i) => (
                                <div 
                                  key={i} 
                                  className="rounded-lg p-2 text-center cursor-pointer transition-all"
                                  style={{
                                    background: selectedPulseIdx === i ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)',
                                    border: selectedPulseIdx === i ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(255,255,255,0.08)'
                                  }}
                                  onClick={() => setSelectedPulseIdx(selectedPulseIdx === i ? null : i)}
                                >
                                  <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Stim {i + 1}</p>
                                  <p className="text-[10px] font-data" style={{ color: '#f59e0b' }}>
                                    {(p.start_sec / 60).toFixed(2)} - {(p.end_sec / 60).toFixed(2)} min
                                  </p>
                                  <p className="text-[9px] font-data" style={{ color: 'var(--text-tertiary)' }}>
                                    ({(p.end_sec - p.start_sec).toFixed(1)}s)
                                  </p>
                                </div>
                              ))}
                            </div>
                            
                            {/* Reset/Apply buttons */}
                            {lightPulses && originalLightPulses && JSON.stringify(lightPulses) !== JSON.stringify(originalLightPulses) && (
                              <div className="flex items-center justify-center gap-2 mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs rounded-lg"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)' }}
                                  onClick={() => setLightPulses(originalLightPulses)}
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" /> Reset
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs rounded-lg"
                                  style={{ background: '#f59e0b', color: '#02080f' }}
                                  onClick={() => {
                                    setOriginalLightPulses(lightPulses);
                                    toast.success('Pulse changes applied');
                                  }}
                                >
                                  Apply Changes
                                </Button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Light Stimulus Metrics - Only show when computed */}
                {lightMetrics && lightEnabled && (
                  <div className="glass-surface-subtle rounded-xl">
                    <div className="p-4 pb-2">
                      <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>Light-Induced Spike & Burst Response</span>
                        <TooltipProvider delayDuration={100}>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="inline-flex">
                                <Info className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs text-xs glass-surface z-50" style={{ color: 'var(--text-primary)' }}>
                              <p className="font-semibold mb-1">Baseline Calculation:</p>
                              <p>Baseline is computed from -2 to -1 minute before first light stimulation</p>
                            </TooltipContent>
                          </Tooltip>
                          </TooltipProvider>
                        </TooltipProvider>
                      </div>
                    </div>
                    <div className="p-4 pt-2">
                      {/* Summary Metric Cards */}
                      <div className="space-y-3 mb-4">
                        {/* Spike Metrics Row */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: '#10b981' }}>Spike Metrics (Averaged)</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            <LightMetricCard label="Baseline Spike" value={lightMetrics.avg?.baselineSpikeHz} unit="Hz" color="cyan" tooltip="Mean spike rate from -2 to -1 min before first stim" />
                            <LightMetricCard label="Avg Spike" value={lightMetrics.avg?.avgSpikeHz} unit="Hz" tooltip="Average spike rate during light (averaged across stims)" />
                            <LightMetricCard label="Max Spike" value={lightMetrics.avg?.maxSpikeHz} unit="Hz" tooltip="Max spike rate during light (averaged across stims)" />
                            <LightMetricCard label="Spike Δ%" value={lightMetrics.avg?.spikeChangePct} unit="%" color="emerald" tooltip="Percent change: 100 × (Avg - Baseline) / Baseline" />
                            <LightMetricCard label="Peak Spike Δ%" value={lightMetrics.avg?.maxSpikeChangePct} unit="%" tooltip="Percent change at peak: 100 × (Max - Baseline) / Baseline" />
                            <LightMetricCard label="Time to Peak" value={lightMetrics.avg?.spikeTimeToPeak} unit="s" tooltip="Time from stim start to max spike (avg)" />
                          </div>
                        </div>
                        {/* Burst Metrics Row */}
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: '#f97316' }}>Burst Metrics (Averaged)</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                            <LightMetricCard label="Baseline Burst" value={lightMetrics.avg?.baselineBurstBpm} unit="bpm" color="cyan" tooltip="Mean burst rate from -2 to -1 min before first stim" />
                            <LightMetricCard label="Avg Burst" value={lightMetrics.avg?.avgBurstBpm} unit="bpm" tooltip="Average burst rate during light (averaged across stims)" />
                            <LightMetricCard label="Max Burst" value={lightMetrics.avg?.maxBurstBpm} unit="bpm" tooltip="Max burst rate during light (averaged across stims)" />
                            <LightMetricCard label="Burst Δ%" value={lightMetrics.avg?.burstChangePct} unit="%" color="orange" tooltip="Percent change: 100 × (Avg - Baseline) / Baseline" />
                            <LightMetricCard label="Peak Burst Δ%" value={lightMetrics.avg?.maxBurstChangePct} unit="%" tooltip="Percent change at peak: 100 × (Max - Baseline) / Baseline" />
                            <LightMetricCard label="Time to Peak" value={lightMetrics.avg?.burstTimeToPeak} unit="s" tooltip="Time from stim start to max burst (avg)" />
                          </div>
                        </div>
                      </div>
                      
                      {/* Per-Stim Table with Extended Columns */}
                      <hr className="border-zinc-700/50 my-3" />
                      <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation Metrics</p>
                      <ScrollArea className="max-h-[250px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-zinc-800 hover:bg-transparent">
                              <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                              <TableHead className="text-[10px] font-data text-cyan-400 h-7">BL Spike</TableHead>
                              <TableHead className="text-[10px] font-data text-emerald-400 h-7">Avg Spike</TableHead>
                              <TableHead className="text-[10px] font-data text-emerald-400 h-7">Max Spike</TableHead>
                              <TableHead className="text-[10px] font-data text-emerald-400 h-7">Spike Δ%</TableHead>
                              <TableHead className="text-[10px] font-data text-emerald-400 h-7">Peak Spike Δ%</TableHead>
                              <TableHead className="text-[10px] font-data text-emerald-400 h-7">T→Peak Spike</TableHead>
                              <TableHead className="text-[10px] font-data text-cyan-400 h-7">BL Burst</TableHead>
                              <TableHead className="text-[10px] font-data text-orange-400 h-7">Avg Burst</TableHead>
                              <TableHead className="text-[10px] font-data text-orange-400 h-7">Max Burst</TableHead>
                              <TableHead className="text-[10px] font-data text-orange-400 h-7">Burst Δ%</TableHead>
                              <TableHead className="text-[10px] font-data text-orange-400 h-7">Peak Burst Δ%</TableHead>
                              <TableHead className="text-[10px] font-data text-orange-400 h-7">T→Peak Burst</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lightMetrics.perStim && lightMetrics.perStim.map((s, i) => (
                              <TableRow 
                                key={i} 
                                className={`border-zinc-800/50 ${selectedPulseIdx === i ? 'bg-yellow-950/20' : ''}`}
                                onClick={() => setSelectedPulseIdx(i)}
                              >
                                <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                                <TableCell className="text-[10px] font-data text-cyan-300 py-1">{s?.baselineSpikeHz?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-emerald-300 py-1">{s?.avgSpikeHz?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-emerald-300 py-1">{s?.maxSpikeHz?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-emerald-300 py-1">{s?.spikeChangePct?.toFixed(1) ?? '—'}%</TableCell>
                                <TableCell className="text-[10px] font-data text-emerald-300 py-1">{s?.maxSpikeChangePct?.toFixed(1) ?? '—'}%</TableCell>
                                <TableCell className="text-[10px] font-data text-emerald-300 py-1">{s?.spikeTimeToPeak?.toFixed(1) ?? '—'}s</TableCell>
                                <TableCell className="text-[10px] font-data text-cyan-300 py-1">{s?.baselineBurstBpm?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-orange-300 py-1">{s?.avgBurstBpm?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-orange-300 py-1">{s?.maxBurstBpm?.toFixed(3) ?? '—'}</TableCell>
                                <TableCell className="text-[10px] font-data text-orange-300 py-1">{s?.burstChangePct?.toFixed(1) ?? '—'}%</TableCell>
                                <TableCell className="text-[10px] font-data text-orange-300 py-1">{s?.maxBurstChangePct?.toFixed(1) ?? '—'}%</TableCell>
                                <TableCell className="text-[10px] font-data text-orange-300 py-1">{s?.burstTimeToPeak?.toFixed(1) ?? '—'}s</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>Select a well to view analysis</div>
            )}
          </TabsContent>
          
          <TabsContent value="save" className="space-y-6">
            <SaveRecording
              getAnalysisState={getAnalysisState}
              onSaveComplete={handleSaveComplete}
              existingRecordingId={savedRecordingId}
              existingFolderId={savedFolderId}
              recordingName={recordingName}
              onRecordingNameChange={setRecordingName}
              recordingDate={recordingDate}
              setRecordingDate={setRecordingDate}
              organoidInfo={organoidInfo}
              setOrganoidInfo={setOrganoidInfo}
              fusionDate={fusionDate}
              setFusionDate={setFusionDate}
              recordingDescription={recordingDescription}
              setRecordingDescription={setRecordingDescription}
              isMEA={true}
            />
          </TabsContent>
          
          <TabsContent value="export" className="space-y-6">
            <MEAExportPanel
              wellAnalysis={wellAnalysis}
              meaData={meaData}
              selectedWell={selectedWell}
              recordingName={recordingName}
              recordingDate={recordingDate}
              organoidInfo={organoidInfo}
              fusionDate={fusionDate}
              recordingDescription={recordingDescription}
              drugEnabled={drugEnabled}
              selectedDrugs={selectedDrugs}
              drugSettings={drugSettings}
              drugPerfTime={drugPerfTime}
              drugReadoutMinute={drugReadoutMinute}
              lightEnabled={lightEnabled}
              lightParams={lightParams}
              lightPulses={lightPulses}
              baselineEnabled={baselineEnabled}
              baselineMinute={baselineMinute}
              wellParams={wellParams}
              config={config}
              getAnalysisState={getAnalysisState}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
