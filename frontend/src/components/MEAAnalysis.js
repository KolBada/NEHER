import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Home, Save, Download, FileSpreadsheet, FileText, Zap, Activity, 
  Info, ChevronDown, ChevronUp, BarChart3, TrendingUp
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, Legend, ScatterChart, Scatter, ReferenceLine,
  ReferenceArea, BarChart, Bar
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';

// ============================================================================
// Helper Components
// ============================================================================

function InfoTip({ text, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center cursor-help">
            {children}
            <Info className="w-3 h-3 ml-1" style={{ color: 'var(--text-tertiary)' }} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs glass-surface z-50" style={{ color: 'var(--text-primary)' }}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MetricCard({ label, value, unit, color = 'cyan', tooltip }) {
  const bgStyle = color === 'cyan' 
    ? { background: 'rgba(0, 184, 196, 0.08)', border: '1px solid rgba(0, 184, 196, 0.25)' }
    : color === 'orange'
    ? { background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)' }
    : color === 'purple'
    ? { background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)' }
    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)' };
  
  const labelColor = color === 'cyan' ? '#00b8c4' : color === 'orange' ? '#f97316' : color === 'purple' ? '#a855f7' : 'var(--text-secondary)';
  
  return (
    <div className="rounded-xl p-3" style={bgStyle}>
      <p className="text-[9px] uppercase tracking-wider font-medium flex items-center gap-1" style={{ color: labelColor, letterSpacing: '0.08em' }}>
        {label}
        {tooltip && (
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
        )}
      </p>
      <p className="text-lg font-data mt-1" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '—'}
      </p>
      {unit && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{unit}</p>}
    </div>
  );
}

// ============================================================================
// Metric Computation Functions
// ============================================================================

function computeSpikeRate(spikes, activeElectrodes, binSize, duration) {
  if (!spikes || spikes.length === 0 || !activeElectrodes || activeElectrodes.length === 0 || !duration || duration <= 0) {
    return [];
  }
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    const spikeCount = spikes.filter(s => 
      s.timestamp >= binStart && 
      s.timestamp < binEnd &&
      s.electrode &&
      activeElectrodes.includes(s.electrode)
    ).length;
    
    const rate = spikeCount / (binSize * activeElectrodes.length);
    
    bins.push({
      time: binStart + binSize / 2,
      bin_start: binStart,
      bin_end: binEnd,
      spike_count: spikeCount,
      spike_rate_hz: rate,
    });
  }
  
  return bins;
}

function computeBurstRate(bursts, activeElectrodes, binSize, duration) {
  if (!bursts || !activeElectrodes || activeElectrodes.length === 0 || !duration || duration <= 0) {
    return [];
  }
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    const burstCount = bursts.filter(b => 
      b.start < binEnd && 
      b.stop > binStart &&
      b.electrode &&
      activeElectrodes.includes(b.electrode)
    ).length;
    
    const rate = (burstCount / activeElectrodes.length) / (binSize / 60);
    
    bins.push({
      time: binStart + binSize / 2,
      bin_start: binStart,
      bin_end: binEnd,
      burst_count: burstCount,
      burst_rate_bpm: rate,
    });
  }
  
  return bins;
}

function computeWindowMean(timeSeries, key, startTime, endTime) {
  const binsInWindow = timeSeries.filter(b => 
    b.bin_start >= startTime && b.bin_end <= endTime
  );
  
  if (binsInWindow.length === 0) return null;
  
  const values = binsInWindow.map(b => b[key]).filter(v => !isNaN(v) && v !== null);
  if (values.length === 0) return null;
  
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeCorrelation(x, y) {
  if (x.length !== y.length || x.length < 3) {
    return { r: null, p: null, n: 0 };
  }
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
  const sumY2 = y.reduce((acc, yi) => acc + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return { r: null, p: null, n };
  
  const r = numerator / denominator;
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const p = n > 30 ? 2 * (1 - Math.min(0.9999, Math.abs(t) / Math.sqrt(n))) : null;
  
  return { r, p, n };
}

function buildSpikeRaster(spikes, activeElectrodes) {
  if (!spikes || !activeElectrodes || activeElectrodes.length === 0) return [];
  
  return spikes
    .filter(s => s.electrode && activeElectrodes.includes(s.electrode))
    .map(s => ({
      time: s.timestamp,
      electrode: s.electrode,
      electrodeIndex: activeElectrodes.indexOf(s.electrode),
    }));
}

function buildBurstRaster(bursts, activeElectrodes) {
  if (!bursts || !activeElectrodes || activeElectrodes.length === 0) return [];
  
  return bursts
    .filter(b => b.electrode && activeElectrodes.includes(b.electrode))
    .map(b => ({
      start: b.start,
      stop: b.stop,
      electrode: b.electrode,
      electrodeIndex: activeElectrodes.indexOf(b.electrode),
    }));
}

// ============================================================================
// Chart Components with Glassmorphism
// ============================================================================

function GlassChartWrapper({ title, icon: Icon, iconColor = '#00b8c4', children }) {
  return (
    <div 
      className="rounded-xl overflow-hidden"
      style={{ 
        background: 'rgba(255,255,255,0.02)', 
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)'
      }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" style={{ color: iconColor }} />}
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </span>
        </div>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function SpikeRateChart({ data, duration, stimWindows, drugWindow }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No spike rate data available</div>;
  }
  
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis 
            dataKey="time" 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Spike Rate (Hz)', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ 
              background: 'rgba(0,0,0,0.8)', 
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: 8,
              fontSize: 11
            }}
          />
          {stimWindows?.map((sw, i) => (
            <ReferenceArea key={`stim-${i}`} x1={sw.start} x2={sw.end} fill="#f59e0b" fillOpacity={0.15} />
          ))}
          {drugWindow && (
            <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#8b5cf6" fillOpacity={0.15} />
          )}
          <Line type="monotone" dataKey="spike_rate_hz" stroke="#00b8c4" strokeWidth={2} dot={false} name="Spike Rate" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BurstRateChart({ data, duration, stimWindows, drugWindow }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No burst rate data available</div>;
  }
  
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis 
            dataKey="time" 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ 
              background: 'rgba(0,0,0,0.8)', 
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: 8,
              fontSize: 11
            }}
          />
          {stimWindows?.map((sw, i) => (
            <ReferenceArea key={`stim-${i}`} x1={sw.start} x2={sw.end} fill="#f59e0b" fillOpacity={0.15} />
          ))}
          {drugWindow && (
            <ReferenceArea x1={drugWindow.start} x2={drugWindow.end} fill="#8b5cf6" fillOpacity={0.15} />
          )}
          <Line type="monotone" dataKey="burst_rate_bpm" stroke="#f97316" strokeWidth={2} dot={false} name="Burst Rate" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RasterPlot({ data, electrodes, duration, type = 'spike', stimWindows }) {
  if (!data || data.length === 0 || !electrodes || electrodes.length === 0) {
    return <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No raster data available</div>;
  }
  
  const color = type === 'spike' ? '#00b8c4' : '#f97316';
  
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis 
            dataKey="time" 
            type="number" 
            domain={[0, duration]}
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            dataKey="electrodeIndex" 
            type="number"
            domain={[-0.5, electrodes.length - 0.5]}
            stroke="rgba(255,255,255,0.3)"
            tick={{ fontSize: 10, fill: '#71717a' }}
            label={{ value: 'Electrode', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          {stimWindows?.map((sw, i) => (
            <ReferenceArea key={`stim-${i}`} x1={sw.start} x2={sw.end} fill="#f59e0b" fillOpacity={0.1} />
          ))}
          <Scatter 
            data={data} 
            fill={color}
            shape={(props) => (
              <line 
                x1={props.cx} x2={props.cx} 
                y1={props.cy - 3} y2={props.cy + 3} 
                stroke={color}
                strokeWidth={1}
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function CorrelationScatter({ spikeData, burstData, correlation, xLabel = 'Spike Rate (Hz)', yLabel = 'Burst Rate (bpm)' }) {
  const scatterData = spikeData?.map((sr, i) => ({
    x: sr.spike_rate_hz,
    y: burstData?.[i]?.burst_rate_bpm || 0,
  })).filter(d => !isNaN(d.x) && !isNaN(d.y)) || [];
  
  if (scatterData.length === 0) {
    return <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Insufficient data for correlation</div>;
  }
  
  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, left: 40, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="x" type="number"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 10, fill: '#71717a' }}
              label={{ value: xLabel, position: 'bottom', fill: '#71717a', fontSize: 10 }}
            />
            <YAxis 
              dataKey="y" type="number"
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 10, fill: '#71717a' }}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
            />
            <RechartsTooltip 
              contentStyle={{ 
                background: 'rgba(0,0,0,0.8)', 
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: 8,
                fontSize: 11
              }}
            />
            <Scatter data={scatterData} fill="#10b981" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {correlation && correlation.r !== null && (
        <div className="text-center text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          r = {correlation.r.toFixed(3)} | n = {correlation.n} bins
          {correlation.p !== null && ` | p ≈ ${correlation.p.toFixed(3)}`}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main MEA Analysis Component
// ============================================================================

export default function MEAAnalysis({ meaData, config, onSave, onHome }) {
  const [selectedWell, setSelectedWell] = useState(
    Object.keys(meaData?.wells || {})[0] || null
  );
  const [activeTab, setActiveTab] = useState('spontaneous');
  
  // Readout configuration state
  const [spikeBaselineStart, setSpikeBaselineStart] = useState(0);
  const [spikeBaselineEnd, setSpikeBaselineEnd] = useState(60);
  const [burstBaselineStart, setBurstBaselineStart] = useState(0);
  const [burstBaselineEnd, setBurstBaselineEnd] = useState(60);
  const [drugEnabled, setDrugEnabled] = useState(false);
  const [drugName, setDrugName] = useState('');
  const [spikeDrugStart, setSpikeDrugStart] = useState(120);
  const [spikeDrugEnd, setSpikeDrugEnd] = useState(180);
  const [burstDrugStart, setBurstDrugStart] = useState(120);
  const [burstDrugEnd, setBurstDrugEnd] = useState(180);
  
  // Light stimulus state
  const [lightEnabled, setLightEnabled] = useState(false);
  const [lightBaselineStart, setLightBaselineStart] = useState(-120);
  const [lightBaselineEnd, setLightBaselineEnd] = useState(-60);
  
  // Table view mode
  const [tableMode, setTableMode] = useState('minute'); // 'minute' or 'bin'
  
  // Compute all metrics for the selected well
  const wellAnalysis = useMemo(() => {
    if (!selectedWell || !meaData?.wells?.[selectedWell]) return null;
    
    const well = meaData.wells[selectedWell];
    const spikes = well.spikes || [];
    const electrode_bursts = well.electrode_bursts || [];
    const active_electrodes = well.active_electrodes || [];
    const duration_s = well.duration_s || 0;
    
    if (active_electrodes.length === 0 || duration_s <= 0) {
      return { well, spikeRateBins: [], burstRateBins: [], spikeRaster: [], burstRaster: [] };
    }
    
    const spikeRateBins = computeSpikeRate(spikes, active_electrodes, config.spike_bin_s, duration_s);
    const burstRateBins = computeBurstRate(electrode_bursts, active_electrodes, config.burst_bin_s, duration_s);
    const spikeRaster = buildSpikeRaster(spikes, active_electrodes);
    const burstRaster = buildBurstRaster(electrode_bursts, active_electrodes);
    
    // Baseline metrics
    const baselineSpikeHz = computeWindowMean(spikeRateBins, 'spike_rate_hz', spikeBaselineStart, spikeBaselineEnd);
    const baselineBurstBpm = computeWindowMean(burstRateBins, 'burst_rate_bpm', burstBaselineStart, burstBaselineEnd);
    
    // Drug metrics
    const drugSpikeHz = drugEnabled ? computeWindowMean(spikeRateBins, 'spike_rate_hz', spikeDrugStart, spikeDrugEnd) : null;
    const drugBurstBpm = drugEnabled ? computeWindowMean(burstRateBins, 'burst_rate_bpm', burstDrugStart, burstDrugEnd) : null;
    
    // Correlation
    const spikeValues = spikeRateBins.map(b => b.spike_rate_hz);
    const alignedBurst = spikeRateBins.map((sb) => {
      const matchingBurst = burstRateBins.find(bb => bb.bin_start <= sb.bin_start && bb.bin_end >= sb.bin_end);
      return matchingBurst?.burst_rate_bpm || 0;
    });
    const correlation = computeCorrelation(spikeValues, alignedBurst);
    
    // Per-minute aggregation
    const perMinuteSpike = [];
    const perMinuteBurst = [];
    const totalMinutes = Math.ceil(duration_s / 60);
    for (let m = 0; m < totalMinutes; m++) {
      const mStart = m * 60;
      const mEnd = (m + 1) * 60;
      perMinuteSpike.push({
        minute: m + 1,
        spike_rate_hz: computeWindowMean(spikeRateBins, 'spike_rate_hz', mStart, mEnd) || 0,
        spike_count: spikeRateBins.filter(b => b.bin_start >= mStart && b.bin_end <= mEnd).reduce((sum, b) => sum + b.spike_count, 0),
      });
      perMinuteBurst.push({
        minute: m + 1,
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
      perMinuteSpike,
      perMinuteBurst,
    };
  }, [selectedWell, meaData, config, spikeBaselineStart, spikeBaselineEnd, burstBaselineStart, burstBaselineEnd, drugEnabled, spikeDrugStart, spikeDrugEnd, burstDrugStart, burstDrugEnd]);
  
  const wells = Object.keys(meaData?.wells || {}).sort();
  const duration = wellAnalysis?.well?.duration_s || 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Toaster theme="dark" position="top-right" />
      
      {/* Fixed Top Bar */}
      <div 
        className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
        style={{
          background: 'rgba(12, 12, 14, 0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center justify-between max-w-[1800px] mx-auto">
          {/* Left: Home + Title */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl transition-all"
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
            <div>
              <h1 className="text-lg font-display" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                MEA Analysis
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {wells.length} wells • Plate: {meaData?.plate_id || 'Unknown'}
              </p>
            </div>
          </div>
          
          {/* Center: Well Selector */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {wells.map(wellId => (
              <Button
                key={wellId}
                variant={selectedWell === wellId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedWell(wellId)}
                className="h-8 px-3 rounded-lg transition-all font-mono text-xs"
                style={selectedWell === wellId ? {
                  background: '#00b8c4',
                  color: '#000',
                  boxShadow: '0 0 15px rgba(0, 184, 196, 0.4)',
                } : {
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-secondary)',
                }}
              >
                {wellId}
              </Button>
            ))}
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'var(--text-secondary)',
              }}
              onClick={() => toast.info('Export coming soon')}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Content - with padding for fixed header */}
      <div className="pt-24 px-6 pb-8 max-w-[1800px] mx-auto">
        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList 
            className="w-full justify-start gap-1 p-1 rounded-xl mb-6"
            style={{ 
              background: 'rgba(255,255,255,0.03)', 
              border: '1px solid rgba(255,255,255,0.08)' 
            }}
          >
            <TabsTrigger 
              value="spontaneous" 
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-[#00b8c4] data-[state=active]:text-black"
              style={{ color: activeTab === 'spontaneous' ? '#000' : 'var(--text-secondary)' }}
            >
              <Activity className="w-4 h-4 mr-2" />
              Spontaneous Activity
            </TabsTrigger>
            <TabsTrigger 
              value="light" 
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-[#f59e0b] data-[state=active]:text-black"
              style={{ color: activeTab === 'light' ? '#000' : 'var(--text-secondary)' }}
            >
              <Zap className="w-4 h-4 mr-2" />
              Light Stimulus
            </TabsTrigger>
            <TabsTrigger 
              value="save" 
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-[#10b981] data-[state=active]:text-black"
              style={{ color: activeTab === 'save' ? '#000' : 'var(--text-secondary)' }}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Recording
            </TabsTrigger>
            <TabsTrigger 
              value="export" 
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-black"
              style={{ color: activeTab === 'export' ? '#000' : 'var(--text-secondary)' }}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export
            </TabsTrigger>
          </TabsList>
          
          {/* ============================================================
              SPONTANEOUS ACTIVITY TAB
          ============================================================ */}
          <TabsContent value="spontaneous" className="space-y-6">
            {wellAnalysis ? (
              <>
                {/* Row 1: Spike Trace & Burst Trace */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <GlassChartWrapper title="Spike Trace" icon={TrendingUp} iconColor="#00b8c4">
                    <SpikeRateChart 
                      data={wellAnalysis.spikeRateBins} 
                      duration={duration}
                      stimWindows={[]}
                      drugWindow={drugEnabled ? { start: spikeDrugStart, end: spikeDrugEnd } : null}
                    />
                  </GlassChartWrapper>
                  <GlassChartWrapper title="Burst Trace" icon={TrendingUp} iconColor="#f97316">
                    <BurstRateChart 
                      data={wellAnalysis.burstRateBins} 
                      duration={duration}
                      stimWindows={[]}
                      drugWindow={drugEnabled ? { start: burstDrugStart, end: burstDrugEnd } : null}
                    />
                  </GlassChartWrapper>
                </div>
                
                {/* Row 2: Spike Raster & Burst Raster */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <GlassChartWrapper title="Spike Raster" icon={BarChart3} iconColor="#00b8c4">
                    <RasterPlot 
                      data={wellAnalysis.spikeRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []}
                      duration={duration}
                      type="spike"
                    />
                  </GlassChartWrapper>
                  <GlassChartWrapper title="Burst Raster" icon={BarChart3} iconColor="#f97316">
                    <RasterPlot 
                      data={wellAnalysis.burstRaster} 
                      electrodes={wellAnalysis.well?.active_electrodes || []}
                      duration={duration}
                      type="burst"
                    />
                  </GlassChartWrapper>
                </div>
                
                {/* Row 3: Readout Configuration */}
                <div 
                  className="glass-surface-subtle rounded-xl overflow-hidden"
                  style={{ borderLeft: '3px solid #00b8c4' }}
                >
                  <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" style={{ color: '#00b8c4' }} />
                      <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                        Readout Configuration
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Spike Readout */}
                      <div className="space-y-4">
                        <h4 className="text-xs uppercase tracking-wider font-medium" style={{ color: '#00b8c4' }}>Spike Readout</h4>
                        
                        {/* Baseline */}
                        <div 
                          className="p-3 rounded-xl"
                          style={{ background: 'rgba(0, 184, 196, 0.08)', border: '1px solid rgba(0, 184, 196, 0.25)' }}
                        >
                          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Baseline Window</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Start (s)</Label>
                              <Input 
                                type="number" 
                                value={spikeBaselineStart} 
                                onChange={(e) => setSpikeBaselineStart(Number(e.target.value))}
                                className="h-8 text-xs font-data rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>End (s)</Label>
                              <Input 
                                type="number" 
                                value={spikeBaselineEnd} 
                                onChange={(e) => setSpikeBaselineEnd(Number(e.target.value))}
                                className="h-8 text-xs font-data rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Drug */}
                        <div 
                          className="p-3 rounded-xl transition-all"
                          style={{ 
                            background: drugEnabled ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.03)', 
                            border: drugEnabled ? '1px solid rgba(168, 85, 247, 0.25)' : '1px solid rgba(255,255,255,0.10)',
                            opacity: drugEnabled ? 1 : 0.6
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Drug Window</p>
                            <Switch checked={drugEnabled} onCheckedChange={setDrugEnabled} />
                          </div>
                          {drugEnabled && (
                            <>
                              <div className="mb-2">
                                <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Drug Name</Label>
                                <Input 
                                  value={drugName} 
                                  onChange={(e) => setDrugName(e.target.value)}
                                  placeholder="e.g., Isoproterenol"
                                  className="h-8 text-xs font-data rounded-lg"
                                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Start (s)</Label>
                                  <Input 
                                    type="number" 
                                    value={spikeDrugStart} 
                                    onChange={(e) => setSpikeDrugStart(Number(e.target.value))}
                                    className="h-8 text-xs font-data rounded-lg"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>End (s)</Label>
                                  <Input 
                                    type="number" 
                                    value={spikeDrugEnd} 
                                    onChange={(e) => setSpikeDrugEnd(Number(e.target.value))}
                                    className="h-8 text-xs font-data rounded-lg"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Burst Readout */}
                      <div className="space-y-4">
                        <h4 className="text-xs uppercase tracking-wider font-medium" style={{ color: '#f97316' }}>Burst Readout</h4>
                        
                        {/* Baseline */}
                        <div 
                          className="p-3 rounded-xl"
                          style={{ background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.25)' }}
                        >
                          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Baseline Window</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Start (s)</Label>
                              <Input 
                                type="number" 
                                value={burstBaselineStart} 
                                onChange={(e) => setBurstBaselineStart(Number(e.target.value))}
                                className="h-8 text-xs font-data rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>End (s)</Label>
                              <Input 
                                type="number" 
                                value={burstBaselineEnd} 
                                onChange={(e) => setBurstBaselineEnd(Number(e.target.value))}
                                className="h-8 text-xs font-data rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Drug (synced with spike) */}
                        <div 
                          className="p-3 rounded-xl transition-all"
                          style={{ 
                            background: drugEnabled ? 'rgba(168, 85, 247, 0.08)' : 'rgba(255,255,255,0.03)', 
                            border: drugEnabled ? '1px solid rgba(168, 85, 247, 0.25)' : '1px solid rgba(255,255,255,0.10)',
                            opacity: drugEnabled ? 1 : 0.6
                          }}
                        >
                          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Drug Window</p>
                          {drugEnabled ? (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Start (s)</Label>
                                <Input 
                                  type="number" 
                                  value={burstDrugStart} 
                                  onChange={(e) => setBurstDrugStart(Number(e.target.value))}
                                  className="h-8 text-xs font-data rounded-lg"
                                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>End (s)</Label>
                                <Input 
                                  type="number" 
                                  value={burstDrugEnd} 
                                  onChange={(e) => setBurstDrugEnd(Number(e.target.value))}
                                  className="h-8 text-xs font-data rounded-lg"
                                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Enable drug in spike readout</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Row 4: Readout Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  <MetricCard label="Baseline Spike Rate" value={wellAnalysis.baselineSpikeHz} unit="Hz" color="cyan" />
                  <MetricCard label="Baseline Burst Rate" value={wellAnalysis.baselineBurstBpm} unit="bpm" color="orange" />
                  {drugEnabled && (
                    <>
                      <MetricCard label={`${drugName || 'Drug'} Spike Rate`} value={wellAnalysis.drugSpikeHz} unit="Hz" color="purple" />
                      <MetricCard label={`${drugName || 'Drug'} Burst Rate`} value={wellAnalysis.drugBurstBpm} unit="bpm" color="purple" />
                    </>
                  )}
                  <MetricCard label="Active Electrodes" value={wellAnalysis.well?.n_active_electrodes} unit="" color="default" />
                  <MetricCard label="Duration" value={(duration / 60).toFixed(1)} unit="min" color="default" />
                </div>
                
                {/* Row 5: Correlation - Spike vs Baseline, Burst vs Baseline */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <GlassChartWrapper title="Spike Rate Distribution" icon={BarChart3} iconColor="#00b8c4">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={wellAnalysis.perMinuteSpike} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="minute" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fill: '#71717a' }} />
                          <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fill: '#71717a' }} />
                          <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                          <Bar dataKey="spike_rate_hz" fill="#00b8c4" name="Spike Rate (Hz)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassChartWrapper>
                  <GlassChartWrapper title="Burst Rate Distribution" icon={BarChart3} iconColor="#f97316">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={wellAnalysis.perMinuteBurst} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="minute" stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fill: '#71717a' }} />
                          <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 10, fill: '#71717a' }} />
                          <RechartsTooltip contentStyle={{ background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                          <Bar dataKey="burst_rate_bpm" fill="#f97316" name="Burst Rate (bpm)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassChartWrapper>
                </div>
                
                {/* Row 6: Spike-Burst Correlation (Full Width) */}
                <GlassChartWrapper title="Spike–Burst Correlation" icon={TrendingUp} iconColor="#10b981">
                  <CorrelationScatter 
                    spikeData={wellAnalysis.spikeRateBins}
                    burstData={wellAnalysis.burstRateBins}
                    correlation={wellAnalysis.correlation}
                  />
                </GlassChartWrapper>
                
                {/* Row 7: Per-Minute / Per-Bin Tables */}
                <div 
                  className="glass-surface-subtle rounded-xl overflow-hidden"
                  style={{ borderLeft: '3px solid #10b981' }}
                >
                  <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" style={{ color: '#10b981' }} />
                      <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                        Tabular Summaries
                      </span>
                    </div>
                    <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <Button
                        size="sm"
                        variant={tableMode === 'minute' ? 'default' : 'ghost'}
                        className="h-7 px-3 text-xs rounded-md"
                        style={tableMode === 'minute' ? { background: '#10b981', color: '#000' } : { color: 'var(--text-secondary)' }}
                        onClick={() => setTableMode('minute')}
                      >
                        Per Minute
                      </Button>
                      <Button
                        size="sm"
                        variant={tableMode === 'bin' ? 'default' : 'ghost'}
                        className="h-7 px-3 text-xs rounded-md"
                        style={tableMode === 'bin' ? { background: '#10b981', color: '#000' } : { color: 'var(--text-secondary)' }}
                        onClick={() => setTableMode('bin')}
                      >
                        Per Bin
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Spike Table */}
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#00b8c4' }}>
                        Spike {tableMode === 'minute' ? 'Per Minute' : 'Per Bin'}
                      </h4>
                      <ScrollArea className="h-48 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Table>
                          <TableHeader>
                            <TableRow style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              <TableHead className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                                {tableMode === 'minute' ? 'Minute' : 'Bin Start (s)'}
                              </TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Rate (Hz)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(tableMode === 'minute' ? wellAnalysis.perMinuteSpike : wellAnalysis.spikeRateBins).map((row, i) => (
                              <TableRow key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>
                                  {tableMode === 'minute' ? row.minute : row.bin_start}
                                </TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: '#00b8c4' }}>
                                  {(tableMode === 'minute' ? row.spike_rate_hz : row.spike_rate_hz).toFixed(3)}
                                </TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>
                                  {row.spike_count}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                    
                    {/* Burst Table */}
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#f97316' }}>
                        Burst {tableMode === 'minute' ? 'Per Minute' : 'Per Bin'}
                      </h4>
                      <ScrollArea className="h-48 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                        <Table>
                          <TableHeader>
                            <TableRow style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                              <TableHead className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                                {tableMode === 'minute' ? 'Minute' : 'Bin Start (s)'}
                              </TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Rate (bpm)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(tableMode === 'minute' ? wellAnalysis.perMinuteBurst : wellAnalysis.burstRateBins).map((row, i) => (
                              <TableRow key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>
                                  {tableMode === 'minute' ? row.minute : row.bin_start}
                                </TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: '#f97316' }}>
                                  {(tableMode === 'minute' ? row.burst_rate_bpm : row.burst_rate_bpm).toFixed(3)}
                                </TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: 'var(--text-secondary)' }}>
                                  {row.burst_count}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>
                Select a well to view analysis
              </div>
            )}
          </TabsContent>
          
          {/* ============================================================
              LIGHT STIMULUS TAB
          ============================================================ */}
          <TabsContent value="light" className="space-y-6">
            <div 
              className="glass-surface-subtle rounded-xl p-8 text-center"
              style={{ borderLeft: '3px solid #f59e0b' }}
            >
              <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: '#f59e0b' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
                Light Stimulus Analysis
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Configure light stimulation parameters to analyze light-induced activity changes.
              </p>
              <div className="flex items-center justify-center gap-2">
                <Label style={{ color: 'var(--text-secondary)' }}>Enable Light Analysis</Label>
                <Switch checked={lightEnabled} onCheckedChange={setLightEnabled} />
              </div>
              {lightEnabled && (
                <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                  Light stimulus configuration coming in next update
                </p>
              )}
            </div>
          </TabsContent>
          
          {/* ============================================================
              SAVE RECORDING TAB
          ============================================================ */}
          <TabsContent value="save" className="space-y-6">
            <div 
              className="glass-surface-subtle rounded-xl p-8 text-center"
              style={{ borderLeft: '3px solid #10b981' }}
            >
              <Save className="w-12 h-12 mx-auto mb-4" style={{ color: '#10b981' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
                Save MEA Recording
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Save the current well analysis to a folder for comparison and export.
              </p>
              <Button
                className="h-10 px-6 rounded-xl font-medium"
                style={{ background: '#10b981', color: '#000' }}
                onClick={() => toast.info('Save functionality coming in next update')}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Recording
              </Button>
            </div>
          </TabsContent>
          
          {/* ============================================================
              EXPORT TAB
          ============================================================ */}
          <TabsContent value="export" className="space-y-6">
            <div 
              className="glass-surface-subtle rounded-xl p-8 text-center"
            >
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-primary)' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
                Export MEA Data
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Export spike rates, burst rates, and per-electrode data for the selected well.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  className="h-10 px-5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }}
                  onClick={() => toast.info('Excel export coming soon')}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel (.xlsx)
                </Button>
                <Button
                  variant="outline"
                  className="h-10 px-5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }}
                  onClick={() => toast.info('PDF export coming soon')}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  PDF Report
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
