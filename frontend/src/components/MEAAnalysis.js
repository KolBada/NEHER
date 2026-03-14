import { useState, useMemo, useCallback, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Home, Save, Download, FileSpreadsheet, FileText, Zap, Activity, 
  Info, BarChart3, TrendingUp, Settings2, Check, FolderOpen, 
  FlaskConical, Plus, X, RefreshCw
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ScatterChart, Scatter, ReferenceArea
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';

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
// Memoized Chart Components
// ============================================================================

const SpikeTraceChart = memo(function SpikeTraceChart({ data, duration, drugWindow }) {
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
          <Line type="monotone" dataKey="spike_rate_hz" stroke="#00b8c4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const BurstTraceChart = memo(function BurstTraceChart({ data, duration, drugWindow }) {
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
          <Line type="monotone" dataKey="burst_rate_bpm" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const SpikeRasterPlot = memo(function SpikeRasterPlot({ data, electrodes, duration }) {
  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No spike raster data</div>;
  }
  const color = '#00b8c4';
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" type="number" domain={[0, duration]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} />
          <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, electrodes.length - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Electrode', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
          <Scatter data={data} fill={color} shape={(props) => (
            <line x1={props.cx} x2={props.cx} y1={props.cy - 2} y2={props.cy + 2} stroke={color} strokeWidth={1} />
          )} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
});

const BurstRasterPlot = memo(function BurstRasterPlot({ data, electrodes, duration }) {
  // Burst raster shows horizontal lines from start to stop for each burst
  if (!data?.length || !electrodes?.length) {
    return <div className="h-36 flex items-center justify-center" style={{ color: 'var(--text-tertiary)' }}>No burst raster data</div>;
  }
  const color = '#f97316';
  
  // Transform burst data to scatter points (use midpoint for positioning)
  const scatterData = data.map((b, idx) => ({
    time: (b.start + b.stop) / 2, // midpoint for X positioning
    startTime: b.start,
    stopTime: b.stop,
    electrodeIndex: b.electrodeIndex,
    key: idx,
  }));
  
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 50, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="time" type="number" domain={[0, duration]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -10, fontSize: 9, fill: '#71717a' }} />
          <YAxis dataKey="electrodeIndex" type="number" domain={[-0.5, electrodes.length - 0.5]} stroke="rgba(255,255,255,0.3)" tick={{ fontSize: 9, fill: '#71717a' }} label={{ value: 'Electrode', angle: -90, position: 'center', dx: -20, fontSize: 9, fill: '#71717a' }} />
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

export default function MEAAnalysis({ meaData, config, onSave, onHome }) {
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
  
  // Light stimulus
  const [lightEnabled, setLightEnabled] = useState(false);
  
  // Table mode
  const [tableMode, setTableMode] = useState('minute');
  
  // Computing flag
  const [isComputing, setIsComputing] = useState(false);

  // Get current well's bin sizes (with defaults from config)
  const currentParams = useMemo(() => {
    const wp = wellParams[selectedWell] || {};
    return {
      spikeBinS: wp.spikeBinS ?? config?.spike_bin_s ?? 5,
      burstBinS: wp.burstBinS ?? config?.burst_bin_s ?? 30,
      minHz: wp.minHz ?? 0.01,
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
      return { well, spikeRateBins: [], burstRateBins: [], spikeRaster: [], burstRaster: [] };
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
    
    // Drug metrics (using shared readout minute)
    const drugStart = (drugReadoutMinute - 1) * 60;
    const drugEnd = drugReadoutMinute * 60;
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
  }, [selectedWell, meaData, currentParams, baselineEnabled, baselineMinute, drugEnabled, selectedDrugs, drugReadoutMinute]);
  
  const wells = useMemo(() => Object.keys(meaData?.wells || {}).sort(), [meaData]);
  const duration = wellAnalysis?.well?.duration_s || 0;
  const wellName = wellNames[selectedWell] || selectedWell || '';

  // Drug window for visualization
  const drugWindow = drugEnabled && selectedDrugs.length > 0 ? {
    start: drugPerfTime * 60,
    end: (drugReadoutMinute + 1) * 60,
  } : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <Toaster theme="dark" position="top-right" />
      
      {/* ================================================================
          TOP BAR - SSE-aligned structure
      ================================================================ */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 px-6 py-3"
        style={{
          background: 'rgba(12, 12, 14, 0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
                    background: '#00b8c4',
                    color: '#000',
                    boxShadow: '0 0 12px rgba(0, 184, 196, 0.4)',
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
          
          {/* Right: Go to Folder + Comparison */}
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
              onClick={() => toast.info('Go to Folder coming soon')}
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
              {/* Spike Trace - 2/3 Width */}
              <div className="lg:col-span-2 glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #00b8c4' }}>
                <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: '#00b8c4' }} />
                    <span className="text-sm font-display font-medium" style={{ color: 'var(--text-primary)' }}>
                      Spike Trace — All Electrodes
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <SpikeTraceChart data={wellAnalysis?.spikeRateBins} duration={duration} drugWindow={drugWindow} />
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
                    <Badge className="ml-auto text-[9px]" style={{ background: 'rgba(0, 184, 196, 0.15)', color: '#00b8c4' }}>
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
                  </div>
                  
                  {/* Well Info */}
                  <div className="pt-2 space-y-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    <div className="flex justify-between">
                      <span>Active Electrodes:</span>
                      <span style={{ color: '#00b8c4' }}>{wellAnalysis?.well?.n_active_electrodes || 0}</span>
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
                    style={{ background: '#00b8c4', color: '#000' }}
                    onClick={() => {
                      setIsComputing(true);
                      toast.success(`Parameters updated for ${selectedWell}`);
                      setTimeout(() => setIsComputing(false), 500);
                    }}
                    disabled={isComputing}
                  >
                    {isComputing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Validate Parameters
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
                {/* Row 1: Spike Trace + Burst Trace */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #00b8c4' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" style={{ color: '#00b8c4' }} />
                        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Spike Trace</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <SpikeTraceChart data={wellAnalysis.spikeRateBins} duration={duration} drugWindow={drugWindow} />
                    </div>
                  </div>
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #f97316' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" style={{ color: '#f97316' }} />
                        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Burst Trace</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <BurstTraceChart data={wellAnalysis.burstRateBins} duration={duration} drugWindow={drugWindow} />
                    </div>
                  </div>
                </div>
                
                {/* Row 2: Spike Raster + Burst Raster */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #00b8c4' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" style={{ color: '#00b8c4' }} />
                        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Spike Raster</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <SpikeRasterPlot data={wellAnalysis.spikeRaster} electrodes={wellAnalysis.well?.active_electrodes || []} duration={duration} />
                    </div>
                  </div>
                  <div className="glass-surface-subtle rounded-xl overflow-hidden" style={{ borderLeft: '3px solid #f97316' }}>
                    <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" style={{ color: '#f97316' }} />
                        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>Burst Raster</span>
                      </div>
                    </div>
                    <div className="p-4">
                      <BurstRasterPlot data={wellAnalysis.burstRaster} electrodes={wellAnalysis.well?.active_electrodes || []} duration={duration} />
                    </div>
                  </div>
                </div>
                
                {/* Row 3: Readout Configuration with Integrated Metrics */}
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
                            <p className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: '#00b8c4' }}>Spike</p>
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
                              <TableHead className="text-[10px] text-right" style={{ color: '#00b8c4' }}>Spike Rate (Hz)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#00b8c4' }}>Spike Count</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#f97316' }}>Burst Rate (bpm)</TableHead>
                              <TableHead className="text-[10px] text-right" style={{ color: '#f97316' }}>Burst Count</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {wellAnalysis.perMinuteCombined.map((row) => (
                              <TableRow key={row.minute} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <TableCell className="text-xs font-data" style={{ color: 'var(--text-secondary)' }}>{row.minute}</TableCell>
                                <TableCell className="text-xs font-data text-right" style={{ color: '#00b8c4' }}>{row.spike_rate_hz.toFixed(3)}</TableCell>
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
                          <h4 className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: '#00b8c4' }}>Spike Per Bin</h4>
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
                                    <TableCell className="text-xs font-data text-right" style={{ color: '#00b8c4' }}>{row.spike_rate_hz.toFixed(3)}</TableCell>
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
          
          {/* Placeholder tabs */}
          <TabsContent value="light" className="space-y-6">
            <div className="glass-surface-subtle rounded-xl p-8 text-center" style={{ borderLeft: '3px solid #f59e0b' }}>
              <Zap className="w-12 h-12 mx-auto mb-4" style={{ color: '#f59e0b' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>Light Stimulus Analysis</h3>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Configure light stimulation parameters.</p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Label style={{ color: 'var(--text-secondary)' }}>Enable Light</Label>
                <Switch checked={lightEnabled} onCheckedChange={setLightEnabled} />
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="save" className="space-y-6">
            <div className="glass-surface-subtle rounded-xl p-8 text-center" style={{ borderLeft: '3px solid #10b981' }}>
              <Save className="w-12 h-12 mx-auto mb-4" style={{ color: '#10b981' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>Save MEA Recording</h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Save analysis to folder.</p>
              <Button className="h-10 px-6 rounded-xl" style={{ background: '#10b981', color: '#000' }} onClick={() => toast.info('Save coming soon')}>
                <Save className="w-4 h-4 mr-2" /> Save Recording
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="export" className="space-y-6">
            <div className="glass-surface-subtle rounded-xl p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-primary)' }} />
              <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>Export MEA Data</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Export spike and burst data.</p>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" className="h-10 px-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }} onClick={() => toast.info('Excel export coming soon')}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                </Button>
                <Button variant="outline" className="h-10 px-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }} onClick={() => toast.info('PDF export coming soon')}>
                  <FileText className="w-4 h-4 mr-2" /> PDF
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
