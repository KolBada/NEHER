import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Save, Download, Home, ChevronDown, ChevronRight } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, Legend, ScatterChart, Scatter, ReferenceLine,
  ReferenceArea, BarChart, Bar
} from 'recharts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from '@/components/ui/sonner';
import MEASaveDialog from './MEASaveDialog';

// ============================================================================
// PHASE 4: Metric Computation Functions
// ============================================================================

// Compute spike rate per time bin
function computeSpikeRate(spikes, activeElectrodes, binSize, duration) {
  if (!spikes || spikes.length === 0 || activeElectrodes.length === 0) {
    return [];
  }
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    // Count spikes in this bin from active electrodes
    const spikeCount = spikes.filter(s => 
      s.timestamp >= binStart && 
      s.timestamp < binEnd &&
      activeElectrodes.includes(s.electrode)
    ).length;
    
    // Calculate rate: spikes / (bin_duration * n_electrodes)
    const rate = spikeCount / (binSize * activeElectrodes.length);
    
    bins.push({
      time: binStart + binSize / 2, // Center of bin
      bin_start: binStart,
      bin_end: binEnd,
      spike_count: spikeCount,
      spike_rate_hz: rate,
    });
  }
  
  return bins;
}

// Compute burst rate per time bin
function computeBurstRate(bursts, activeElectrodes, binSize, duration) {
  if (!bursts || activeElectrodes.length === 0) {
    return [];
  }
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    // Count bursts that overlap with this bin from active electrodes
    const burstCount = bursts.filter(b => 
      b.start < binEnd && 
      b.stop > binStart &&
      activeElectrodes.includes(b.electrode)
    ).length;
    
    // Calculate rate: (bursts / n_electrodes) / (bin_duration / 60) = bursts per minute
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

// Compute mean metric in a time window
function computeWindowMean(timeSeries, key, startTime, endTime) {
  const binsInWindow = timeSeries.filter(b => 
    b.bin_start >= startTime && b.bin_end <= endTime
  );
  
  if (binsInWindow.length === 0) return null;
  
  const values = binsInWindow.map(b => b[key]).filter(v => !isNaN(v) && v !== null);
  if (values.length === 0) return null;
  
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Compute Pearson correlation
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
  
  // Approximate p-value using t-distribution
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  // Simplified p-value approximation
  const p = n > 30 ? 2 * (1 - Math.min(0.9999, Math.abs(t) / Math.sqrt(n))) : null;
  
  return { r, p, n };
}

// Build spike raster data (time, electrode, tick)
function buildSpikeRaster(spikes, activeElectrodes) {
  if (!spikes || activeElectrodes.length === 0) return [];
  
  return spikes
    .filter(s => activeElectrodes.includes(s.electrode))
    .map(s => ({
      time: s.timestamp,
      electrode: s.electrode,
      electrodeIndex: activeElectrodes.indexOf(s.electrode),
    }));
}

// Build burst raster data
function buildBurstRaster(bursts, activeElectrodes) {
  if (!bursts || activeElectrodes.length === 0) return [];
  
  return bursts
    .filter(b => activeElectrodes.includes(b.electrode))
    .map(b => ({
      start: b.start,
      stop: b.stop,
      electrode: b.electrode,
      electrodeIndex: activeElectrodes.indexOf(b.electrode),
    }));
}

// ============================================================================
// PHASE 5: Plot Components
// ============================================================================

// P1: Spike Raster Plot
function SpikeRasterPlot({ rasterData, electrodes, duration, stimWindows, drugWindow }) {
  if (!rasterData || rasterData.length === 0) {
    return <div className="text-zinc-500 text-sm text-center py-8">No spike data available</div>;
  }
  
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis 
            dataKey="time" 
            type="number" 
            domain={[0, duration]}
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            dataKey="electrodeIndex" 
            type="number"
            domain={[-0.5, electrodes.length - 0.5]}
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Electrode', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          {/* Stim windows shading */}
          {stimWindows?.map((sw, i) => (
            <ReferenceArea 
              key={`stim-${i}`}
              x1={sw.start} 
              x2={sw.end} 
              fill="#f59e0b" 
              fillOpacity={0.1}
            />
          ))}
          {/* Drug window shading */}
          {drugWindow && (
            <ReferenceArea 
              x1={drugWindow.start} 
              x2={drugWindow.end} 
              fill="#8b5cf6" 
              fillOpacity={0.1}
            />
          )}
          <Scatter 
            data={rasterData} 
            fill="#38bdf8"
            shape={(props) => (
              <line 
                x1={props.cx} 
                x2={props.cx} 
                y1={props.cy - 3} 
                y2={props.cy + 3} 
                stroke="#38bdf8"
                strokeWidth={1}
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// P2: Spike Rate Trace
function SpikeRateTracePlot({ spikeRateBins, duration, stimWindows, drugWindow }) {
  if (!spikeRateBins || spikeRateBins.length === 0) {
    return <div className="text-zinc-500 text-sm text-center py-8">No spike rate data available</div>;
  }
  
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={spikeRateBins} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis 
            dataKey="time"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Spike Rate (Hz)', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
            labelStyle={{ color: '#38bdf8' }}
          />
          {/* Stim windows */}
          {stimWindows?.map((sw, i) => (
            <ReferenceArea 
              key={`stim-${i}`}
              x1={sw.start} 
              x2={sw.end} 
              fill="#f59e0b" 
              fillOpacity={0.15}
              label={{ value: `S${i+1}`, position: 'top', fill: '#f59e0b', fontSize: 8 }}
            />
          ))}
          {/* Drug window */}
          {drugWindow && (
            <ReferenceArea 
              x1={drugWindow.start} 
              x2={drugWindow.end} 
              fill="#8b5cf6" 
              fillOpacity={0.15}
              label={{ value: 'Drug', position: 'top', fill: '#8b5cf6', fontSize: 8 }}
            />
          )}
          <Line 
            type="monotone" 
            dataKey="spike_rate_hz" 
            stroke="#38bdf8" 
            strokeWidth={2}
            dot={false}
            name="Spike Rate"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// P4: Burst Rate Trace
function BurstRateTracePlot({ burstRateBins, duration, stimWindows, drugWindow }) {
  if (!burstRateBins || burstRateBins.length === 0) {
    return <div className="text-zinc-500 text-sm text-center py-8">No burst rate data available</div>;
  }
  
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={burstRateBins} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis 
            dataKey="time"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Time (s)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
            labelStyle={{ color: '#f97316' }}
          />
          {/* Stim windows */}
          {stimWindows?.map((sw, i) => (
            <ReferenceArea 
              key={`stim-${i}`}
              x1={sw.start} 
              x2={sw.end} 
              fill="#f59e0b" 
              fillOpacity={0.15}
            />
          ))}
          {/* Drug window */}
          {drugWindow && (
            <ReferenceArea 
              x1={drugWindow.start} 
              x2={drugWindow.end} 
              fill="#8b5cf6" 
              fillOpacity={0.15}
            />
          )}
          <Line 
            type="monotone" 
            dataKey="burst_rate_bpm" 
            stroke="#f97316" 
            strokeWidth={2}
            dot={false}
            name="Burst Rate"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// P11: Spike-Burst Coupling Scatter
function SpikeBurstCouplingPlot({ spikeRateBins, burstRateBins, correlation }) {
  // Merge bins by time
  const scatterData = spikeRateBins?.map((sr, i) => ({
    spike_rate: sr.spike_rate_hz,
    burst_rate: burstRateBins?.[i]?.burst_rate_bpm || 0,
  })).filter(d => !isNaN(d.spike_rate) && !isNaN(d.burst_rate)) || [];
  
  if (scatterData.length === 0) {
    return <div className="text-zinc-500 text-sm text-center py-8">Insufficient data for coupling analysis</div>;
  }
  
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 40, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis 
            dataKey="spike_rate"
            type="number"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Spike Rate (Hz)', position: 'bottom', fill: '#71717a', fontSize: 10 }}
          />
          <YAxis 
            dataKey="burst_rate"
            type="number"
            stroke="#71717a"
            tick={{ fontSize: 10 }}
            label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
          />
          <Scatter data={scatterData} fill="#10b981" />
        </ScatterChart>
      </ResponsiveContainer>
      {correlation && correlation.r !== null && (
        <div className="text-center text-xs text-zinc-400 mt-2">
          r = {correlation.r.toFixed(3)} | n = {correlation.n} bins
          {correlation.p !== null && ` | p ≈ ${correlation.p.toFixed(3)}`}
        </div>
      )}
    </div>
  );
}

// Comparison Bar Chart (baseline vs condition)
function ComparisonBarChart({ baseline, condition, baselineLabel, conditionLabel, metricLabel, color }) {
  const data = [
    { name: baselineLabel, value: baseline || 0 },
    { name: conditionLabel, value: condition || 0 },
  ];
  
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 40, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" stroke="#71717a" tick={{ fontSize: 10 }} />
          <YAxis 
            stroke="#71717a" 
            tick={{ fontSize: 10 }}
            label={{ value: metricLabel, angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
          />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
          />
          <Bar dataKey="value" fill={color} />
        </BarChart>
      </ResponsiveContainer>
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
  const [activeTab, setActiveTab] = useState('overview');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savedWells, setSavedWells] = useState(new Set()); // Track which wells have been saved
  
  // Export CSV for the current well
  const exportCSV = (type) => {
    if (!wellAnalysis) return;
    
    let csvContent = '';
    let filename = '';
    
    if (type === 'spike_rate') {
      // Spike rate vs time
      csvContent = 'time_bin_start_s,spike_rate_hz\n';
      wellAnalysis.spikeRateBins.forEach(bin => {
        csvContent += `${bin.bin_start},${bin.spike_rate_hz}\n`;
      });
      filename = `${meaData?.plate_id || 'MEA'}_${selectedWell}_spike_rate.csv`;
    } else if (type === 'burst_rate') {
      // Burst rate vs time
      csvContent = 'time_bin_start_s,burst_rate_bpm\n';
      wellAnalysis.burstRateBins.forEach(bin => {
        csvContent += `${bin.bin_start},${bin.burst_rate_bpm}\n`;
      });
      filename = `${meaData?.plate_id || 'MEA'}_${selectedWell}_burst_rate.csv`;
    } else if (type === 'spike_intervals') {
      // Spike interval vs time
      csvContent = 'timestamp_s,electrode,isi_s\n';
      const well = meaData.wells[selectedWell];
      const activeElectrodes = well.active_electrodes;
      
      // Group spikes by electrode and compute ISIs
      activeElectrodes.forEach(electrode => {
        const electrodeSpikes = well.spikes
          .filter(s => s.electrode === electrode)
          .sort((a, b) => a.timestamp - b.timestamp);
        
        for (let i = 1; i < electrodeSpikes.length; i++) {
          const isi = electrodeSpikes[i].timestamp - electrodeSpikes[i-1].timestamp;
          csvContent += `${electrodeSpikes[i].timestamp},${electrode},${isi}\n`;
        }
      });
      filename = `${meaData?.plate_id || 'MEA'}_${selectedWell}_spike_intervals.csv`;
    }
    
    // Download the CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Compute all metrics for the selected well
  const wellAnalysis = useMemo(() => {
    if (!selectedWell || !meaData?.wells?.[selectedWell]) return null;
    
    const well = meaData.wells[selectedWell];
    const { spikes, electrode_bursts, active_electrodes, duration_s } = well;
    
    // Compute spike rate time series
    const spikeRateBins = computeSpikeRate(
      spikes, 
      active_electrodes, 
      config.spike_bin_s, 
      duration_s
    );
    
    // Compute burst rate time series
    const burstRateBins = computeBurstRate(
      electrode_bursts,
      active_electrodes,
      config.burst_bin_s,
      duration_s
    );
    
    // Build raster data
    const spikeRaster = buildSpikeRaster(spikes, active_electrodes);
    const burstRaster = buildBurstRaster(electrode_bursts, active_electrodes);
    
    // Compute baseline metrics
    const baselineSpikeHz = computeWindowMean(
      spikeRateBins, 'spike_rate_hz',
      config.baseline_start_s, config.baseline_end_s
    );
    const baselineBurstBpm = computeWindowMean(
      burstRateBins, 'burst_rate_bpm',
      config.baseline_start_s, config.baseline_end_s
    );
    
    // Build stim windows
    const stimWindows = [];
    if (config.light_enabled && config.n_stimulations > 0) {
      for (let i = 0; i < config.n_stimulations; i++) {
        const start = config.stim_start_s + i * (config.stim_duration_s + config.isi_s);
        const end = Math.min(start + config.readout_window_s, duration_s);
        stimWindows.push({ start, end, index: i });
      }
    }
    
    // Compute per-stim metrics
    const stimMetrics = stimWindows.map(sw => ({
      index: sw.index,
      spike_hz: computeWindowMean(spikeRateBins, 'spike_rate_hz', sw.start, sw.end),
      burst_bpm: computeWindowMean(burstRateBins, 'burst_rate_bpm', sw.start, sw.end),
    }));
    
    // Drug window
    const drugWindow = config.drug_enabled && config.drug_name ? {
      start: config.drug_start_s,
      end: config.drug_end_s,
    } : null;
    
    // Compute drug metrics
    const drugSpikeHz = drugWindow 
      ? computeWindowMean(spikeRateBins, 'spike_rate_hz', drugWindow.start, drugWindow.end)
      : null;
    const drugBurstBpm = drugWindow
      ? computeWindowMean(burstRateBins, 'burst_rate_bpm', drugWindow.start, drugWindow.end)
      : null;
    
    // Spike-burst correlation
    const spikeValues = spikeRateBins.map(b => b.spike_rate_hz);
    const burstValues = burstRateBins.map(b => b.burst_rate_bpm);
    // Align arrays (use spike bins as reference)
    const alignedBurst = spikeRateBins.map((sb, i) => {
      const matchingBurst = burstRateBins.find(bb => 
        bb.bin_start <= sb.bin_start && bb.bin_end >= sb.bin_end
      );
      return matchingBurst?.burst_rate_bpm || 0;
    });
    const correlation = computeCorrelation(spikeValues, alignedBurst);
    
    return {
      well,
      spikeRateBins,
      burstRateBins,
      spikeRaster,
      burstRaster,
      baselineSpikeHz,
      baselineBurstBpm,
      stimWindows,
      stimMetrics,
      drugWindow,
      drugSpikeHz,
      drugBurstBpm,
      correlation,
    };
  }, [selectedWell, meaData, config]);
  
  const wells = Object.keys(meaData?.wells || {}).sort();

  return (
    <div className="min-h-screen bg-[#09090b] p-4">
      <Toaster theme="dark" position="top-right" />
      
      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="sr-only">Save MEA Recording</DialogTitle>
          </DialogHeader>
          <MEASaveDialog
            meaData={meaData}
            config={config}
            wellAnalysis={wellAnalysis}
            selectedWell={selectedWell}
            onSaveComplete={(folderId, recordingId) => {
              setSavedWells(prev => new Set([...prev, selectedWell]));
              setShowSaveDialog(false);
            }}
            onClose={() => setShowSaveDialog(false)}
          />
        </DialogContent>
      </Dialog>
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onHome}>
            <Home className="w-4 h-4 mr-2" />
            Home
          </Button>
          <h1 className="text-xl font-semibold text-zinc-100">MEA Analysis</h1>
          <span className="text-sm text-zinc-500">
            {wells.length} wells • Plate: {meaData?.plate_id || 'Unknown'}
          </span>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportCSV('spike_rate')}>
                Spike Rate vs Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV('burst_rate')}>
                Burst Rate vs Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV('spike_intervals')}>
                Spike Intervals
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-500" onClick={() => setShowSaveDialog(true)}>
            <Save className="w-4 h-4 mr-2" />
            Save Well
          </Button>
        </div>
      </div>
      
      {/* Well selector */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {wells.map(wellId => (
          <Button
            key={wellId}
            variant={selectedWell === wellId ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedWell(wellId)}
            className={`${selectedWell === wellId ? 'bg-sky-600' : ''} relative`}
          >
            {wellId}
            {savedWells.has(wellId) && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 bg-emerald-500 text-[8px]">✓</Badge>
            )}
          </Button>
        ))}
      </div>
      
      {/* Analysis tabs */}
      {wellAnalysis && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-900 border-zinc-800">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="spikes">Spikes</TabsTrigger>
            <TabsTrigger value="bursts">Bursts</TabsTrigger>
            <TabsTrigger value="comparisons">Comparisons</TabsTrigger>
            <TabsTrigger value="coupling">Coupling</TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Well Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Well ID:</span>
                      <span className="text-sky-400 font-mono">{selectedWell}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Active Electrodes:</span>
                      <span className="text-zinc-300">{wellAnalysis.well.n_active_electrodes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Total Spikes:</span>
                      <span className="text-zinc-300">{wellAnalysis.well.total_spikes?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Duration:</span>
                      <span className="text-zinc-300">{wellAnalysis.well.duration_s?.toFixed(1)}s</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">Baseline Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Window:</span>
                      <span className="text-zinc-300">
                        {config.baseline_start_s}s - {config.baseline_end_s}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Mean Spike Rate:</span>
                      <span className="text-sky-400">
                        {wellAnalysis.baselineSpikeHz?.toFixed(2) || '—'} Hz
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Mean Burst Rate:</span>
                      <span className="text-orange-400">
                        {wellAnalysis.baselineBurstBpm?.toFixed(2) || '—'} bpm
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Spikes Tab */}
          <TabsContent value="spikes" className="mt-4 space-y-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Spike Raster</CardTitle>
              </CardHeader>
              <CardContent>
                <SpikeRasterPlot 
                  rasterData={wellAnalysis.spikeRaster}
                  electrodes={wellAnalysis.well.active_electrodes}
                  duration={wellAnalysis.well.duration_s}
                  stimWindows={wellAnalysis.stimWindows}
                  drugWindow={wellAnalysis.drugWindow}
                />
              </CardContent>
            </Card>
            
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Spike Rate Trace</CardTitle>
              </CardHeader>
              <CardContent>
                <SpikeRateTracePlot 
                  spikeRateBins={wellAnalysis.spikeRateBins}
                  duration={wellAnalysis.well.duration_s}
                  stimWindows={wellAnalysis.stimWindows}
                  drugWindow={wellAnalysis.drugWindow}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Bursts Tab */}
          <TabsContent value="bursts" className="mt-4 space-y-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Burst Rate Trace</CardTitle>
              </CardHeader>
              <CardContent>
                <BurstRateTracePlot 
                  burstRateBins={wellAnalysis.burstRateBins}
                  duration={wellAnalysis.well.duration_s}
                  stimWindows={wellAnalysis.stimWindows}
                  drugWindow={wellAnalysis.drugWindow}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Comparisons Tab */}
          <TabsContent value="comparisons" className="mt-4 space-y-4">
            {/* Light stimulation comparisons */}
            {config.light_enabled && wellAnalysis.stimMetrics.length > 0 && (
              <>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400">Spike Rate: Baseline vs Light Stims</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComparisonBarChart
                      baseline={wellAnalysis.baselineSpikeHz}
                      condition={wellAnalysis.stimMetrics[0]?.spike_hz}
                      baselineLabel="Baseline"
                      conditionLabel="Stim 1"
                      metricLabel="Spike Rate (Hz)"
                      color="#38bdf8"
                    />
                  </CardContent>
                </Card>
                
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400">Burst Rate: Baseline vs Light Stims</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComparisonBarChart
                      baseline={wellAnalysis.baselineBurstBpm}
                      condition={wellAnalysis.stimMetrics[0]?.burst_bpm}
                      baselineLabel="Baseline"
                      conditionLabel="Stim 1"
                      metricLabel="Burst Rate (bpm)"
                      color="#f97316"
                    />
                  </CardContent>
                </Card>
              </>
            )}
            
            {/* Drug comparisons */}
            {config.drug_enabled && config.drug_name && (
              <>
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400">Spike Rate: Baseline vs {config.drug_name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComparisonBarChart
                      baseline={wellAnalysis.baselineSpikeHz}
                      condition={wellAnalysis.drugSpikeHz}
                      baselineLabel="Baseline"
                      conditionLabel={config.drug_name}
                      metricLabel="Spike Rate (Hz)"
                      color="#38bdf8"
                    />
                  </CardContent>
                </Card>
                
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400">Burst Rate: Baseline vs {config.drug_name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComparisonBarChart
                      baseline={wellAnalysis.baselineBurstBpm}
                      condition={wellAnalysis.drugBurstBpm}
                      baselineLabel="Baseline"
                      conditionLabel={config.drug_name}
                      metricLabel="Burst Rate (bpm)"
                      color="#f97316"
                    />
                  </CardContent>
                </Card>
              </>
            )}
            
            {!config.light_enabled && !config.drug_enabled && (
              <div className="text-zinc-500 text-center py-8">
                Enable light stimulation or drug application to see comparisons
              </div>
            )}
          </TabsContent>
          
          {/* Coupling Tab */}
          <TabsContent value="coupling" className="mt-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400">Spike–Burst Coupling</CardTitle>
              </CardHeader>
              <CardContent>
                <SpikeBurstCouplingPlot 
                  spikeRateBins={wellAnalysis.spikeRateBins}
                  burstRateBins={wellAnalysis.burstRateBins}
                  correlation={wellAnalysis.correlation}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
