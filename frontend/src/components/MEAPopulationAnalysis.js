/**
 * MEA Population Analysis Component
 * 
 * Displays population-level metrics when a folder contains ≥2 MEA recordings.
 * - Mean spike/burst rate traces across all recordings
 * - Individual recording traces as faint lines behind mean
 * - Population comparisons (baseline vs light, baseline vs drug)
 * - Population spike-burst coupling scatter plot
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Activity, BarChart3, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ReferenceLine, BarChart, Bar, ErrorBar
} from 'recharts';
import api from '../api';

// Compute spike rate for a MEA recording
function computeSpikeRate(spikes, activeElectrodes, duration, binSize = 5) {
  if (!activeElectrodes.length || !spikes.length) return [];
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = Math.min((i + 1) * binSize, duration);
    const binDuration = binEnd - binStart;
    
    const spikesInBin = spikes.filter(s => 
      s.timestamp >= binStart && s.timestamp < binEnd &&
      activeElectrodes.includes(s.electrode)
    ).length;
    
    const spikeRate = spikesInBin / (binDuration * activeElectrodes.length);
    bins.push({
      bin_start: binStart,
      bin_end: binEnd,
      spike_rate_hz: spikeRate,
      relative_time: binStart, // For alignment
    });
  }
  
  return bins;
}

// Compute burst rate for a MEA recording
function computeBurstRate(electrodeBursts, activeElectrodes, duration, binSize = 30) {
  if (!activeElectrodes.length) return [];
  
  const nBins = Math.ceil(duration / binSize);
  const bins = [];
  
  for (let i = 0; i < nBins; i++) {
    const binStart = i * binSize;
    const binEnd = Math.min((i + 1) * binSize, duration);
    const binDuration = binEnd - binStart;
    
    // Count bursts that overlap with this bin
    let burstsInBin = 0;
    activeElectrodes.forEach(electrode => {
      const electrodeBurstList = electrodeBursts?.filter(b => b.electrode === electrode) || [];
      electrodeBurstList.forEach(burst => {
        const burstStart = burst.start || burst['start (s)'];
        const burstEnd = burst.stop || burst['stop (s)'];
        if (burstStart < binEnd && burstEnd > binStart) {
          burstsInBin++;
        }
      });
    });
    
    const burstRate = (burstsInBin / activeElectrodes.length) / (binDuration / 60);
    bins.push({
      bin_start: binStart,
      bin_end: binEnd,
      burst_rate_bpm: burstRate,
      relative_time: binStart,
    });
  }
  
  return bins;
}

// Calculate mean and SEM for a set of values
function meanAndSEM(values) {
  if (!values.length) return { mean: 0, sem: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length === 1) return { mean, sem: 0 };
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
  const sem = Math.sqrt(variance / values.length);
  return { mean, sem };
}

// Population Trace Plot Component
function PopulationTracePlot({ recordings, metric = 'spike', binSize = 5 }) {
  const data = useMemo(() => {
    if (!recordings.length) return [];
    
    // Compute bins for each recording
    const allBins = recordings.map(rec => {
      const state = rec.analysis_state;
      if (metric === 'spike') {
        return computeSpikeRate(
          state.spikes || [],
          state.active_electrodes || [],
          state.duration_s || 300,
          binSize
        );
      } else {
        return computeBurstRate(
          state.electrode_bursts || [],
          state.active_electrodes || [],
          state.duration_s || 300,
          binSize
        );
      }
    });
    
    // Find max duration and align by relative time
    const maxBins = Math.max(...allBins.map(b => b.length));
    const aligned = [];
    
    for (let i = 0; i < maxBins; i++) {
      const binStart = i * binSize;
      const values = allBins
        .map(bins => bins[i])
        .filter(b => b !== undefined)
        .map(b => metric === 'spike' ? b.spike_rate_hz : b.burst_rate_bpm);
      
      const { mean, sem } = meanAndSEM(values);
      
      const point = {
        time: binStart,
        mean,
        sem,
        upper: mean + sem,
        lower: Math.max(0, mean - sem),
      };
      
      // Add individual recordings
      recordings.forEach((rec, idx) => {
        const bin = allBins[idx][i];
        if (bin) {
          point[`rec_${idx}`] = metric === 'spike' ? bin.spike_rate_hz : bin.burst_rate_bpm;
        }
      });
      
      aligned.push(point);
    }
    
    return aligned;
  }, [recordings, metric, binSize]);
  
  const colors = ['#60a5fa', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#fb923c'];
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis 
          dataKey="time" 
          stroke="#888" 
          fontSize={10}
          label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }}
        />
        <YAxis 
          stroke="#888" 
          fontSize={10}
          label={{ value: metric === 'spike' ? 'Spike Rate (Hz)' : 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 10 }}
        />
        <RechartsTooltip
          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333' }}
          labelStyle={{ color: '#888' }}
        />
        <Legend />
        
        {/* Individual recording traces (faint) */}
        {recordings.map((rec, idx) => (
          <Line
            key={idx}
            type="monotone"
            dataKey={`rec_${idx}`}
            stroke={colors[idx % colors.length]}
            strokeOpacity={0.3}
            dot={false}
            name={rec.name}
          />
        ))}
        
        {/* Mean trace (bold) */}
        <Line
          type="monotone"
          dataKey="mean"
          stroke="#fff"
          strokeWidth={2}
          dot={false}
          name="Population Mean"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Population Bar Chart for condition comparisons
function PopulationComparisonChart({ recordings, condition = 'baseline_light' }) {
  const data = useMemo(() => {
    // Calculate mean for each condition across recordings
    const baselineSpike = [];
    const baselineBurst = [];
    const conditionSpike = [];
    const conditionBurst = [];
    
    recordings.forEach(rec => {
      const state = rec.analysis_state;
      
      // Get baseline values
      const baseline = state.baseline_spike_hz !== undefined 
        ? { spike: state.baseline_spike_hz, burst: state.baseline_burst_bpm }
        : { spike: 0, burst: 0 };
      
      baselineSpike.push(baseline.spike || 0);
      baselineBurst.push(baseline.burst || 0);
      
      // Get condition values
      if (condition === 'baseline_light') {
        const stimMetrics = state.stim_metrics || [];
        const firstStim = stimMetrics[0] || {};
        conditionSpike.push(firstStim.spike_hz || 0);
        conditionBurst.push(firstStim.burst_bpm || 0);
      } else if (condition === 'baseline_drug') {
        const drugMetrics = state.drug_metrics || {};
        conditionSpike.push(drugMetrics.spike_hz || 0);
        conditionBurst.push(drugMetrics.burst_bpm || 0);
      }
    });
    
    const baselineSpikeStats = meanAndSEM(baselineSpike);
    const baselineBurstStats = meanAndSEM(baselineBurst);
    const conditionSpikeStats = meanAndSEM(conditionSpike);
    const conditionBurstStats = meanAndSEM(conditionBurst);
    
    return [
      {
        metric: 'Spike Rate',
        baseline: baselineSpikeStats.mean,
        baselineSEM: baselineSpikeStats.sem,
        condition: conditionSpikeStats.mean,
        conditionSEM: conditionSpikeStats.sem,
      },
      {
        metric: 'Burst Rate',
        baseline: baselineBurstStats.mean,
        baselineSEM: baselineBurstStats.sem,
        condition: conditionBurstStats.mean,
        conditionSEM: conditionBurstStats.sem,
      }
    ];
  }, [recordings, condition]);
  
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={10}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="metric" stroke="#888" fontSize={10} />
        <YAxis stroke="#888" fontSize={10} />
        <RechartsTooltip
          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333' }}
        />
        <Legend />
        <Bar dataKey="baseline" fill="#60a5fa" name="Baseline">
          <ErrorBar dataKey="baselineSEM" stroke="#60a5fa" />
        </Bar>
        <Bar 
          dataKey="condition" 
          fill={condition === 'baseline_light' ? '#4ade80' : '#f472b6'} 
          name={condition === 'baseline_light' ? 'Light' : 'Drug'}
        >
          <ErrorBar dataKey="conditionSEM" stroke={condition === 'baseline_light' ? '#4ade80' : '#f472b6'} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Population spike-burst coupling scatter
function PopulationCouplingPlot({ recordings }) {
  const { data, stats } = useMemo(() => {
    const allPoints = [];
    
    recordings.forEach((rec, recIdx) => {
      const state = rec.analysis_state;
      const spikeRateBins = state.spike_rate_bins || [];
      const burstRateBins = state.burst_rate_bins || [];
      
      // Match bins by time
      spikeRateBins.forEach((spikeBin, i) => {
        const burstBin = burstRateBins[i];
        if (burstBin) {
          allPoints.push({
            spike_rate: spikeBin.spike_rate_hz || 0,
            burst_rate: burstBin.burst_rate_bpm || 0,
            recording: recIdx,
          });
        }
      });
    });
    
    // Calculate correlation
    if (allPoints.length < 2) {
      return { data: allPoints, stats: { r: 0, p: 1, n: 0 } };
    }
    
    const spikeVals = allPoints.map(p => p.spike_rate);
    const burstVals = allPoints.map(p => p.burst_rate);
    
    const n = spikeVals.length;
    const meanSpike = spikeVals.reduce((a, b) => a + b, 0) / n;
    const meanBurst = burstVals.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let sumSqSpike = 0;
    let sumSqBurst = 0;
    
    for (let i = 0; i < n; i++) {
      const dSpike = spikeVals[i] - meanSpike;
      const dBurst = burstVals[i] - meanBurst;
      numerator += dSpike * dBurst;
      sumSqSpike += dSpike * dSpike;
      sumSqBurst += dBurst * dBurst;
    }
    
    const denominator = Math.sqrt(sumSqSpike * sumSqBurst);
    const r = denominator === 0 ? 0 : numerator / denominator;
    
    // Calculate p-value (approximate for large n)
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    // Simplified p-value approximation
    const p = n > 30 ? Math.exp(-0.5 * t * t) : 0.05;
    
    return { data: allPoints, stats: { r, p, n } };
  }, [recordings]);
  
  const colors = ['#60a5fa', '#4ade80', '#f472b6', '#facc15', '#a78bfa', '#fb923c'];
  
  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="spike_rate" 
            name="Spike Rate" 
            stroke="#888" 
            fontSize={10}
            label={{ value: 'Spike Rate (Hz)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }}
          />
          <YAxis 
            dataKey="burst_rate" 
            name="Burst Rate" 
            stroke="#888" 
            fontSize={10}
            label={{ value: 'Burst Rate (bpm)', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 10 }}
          />
          <RechartsTooltip
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #333' }}
          />
          <Scatter
            data={data}
            fill="#60a5fa"
            fillOpacity={0.6}
            shape="circle"
          />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="text-center text-xs text-zinc-400 mt-2">
        r = {stats.r.toFixed(3)} | p = {stats.p < 0.001 ? '<0.001' : stats.p.toFixed(3)} | N = {stats.n} bins
      </div>
    </div>
  );
}

// Main component
export default function MEAPopulationAnalysis({ folderId, recordings: initialRecordings }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('traces');
  
  // Load full recording data
  useEffect(() => {
    async function loadRecordings() {
      setLoading(true);
      try {
        const meaRecordings = initialRecordings.filter(r => r.source_type === 'MEA');
        
        // Load full analysis state for each recording
        const fullRecordings = await Promise.all(
          meaRecordings.map(async (rec) => {
            const { data } = await api.getRecording(rec.id);
            return data;
          })
        );
        
        setRecordings(fullRecordings.filter(r => r !== null));
      } catch (err) {
        console.error('Failed to load MEA recordings:', err);
      } finally {
        setLoading(false);
      }
    }
    
    if (initialRecordings?.length > 0) {
      loadRecordings();
    } else {
      setLoading(false);
    }
  }, [initialRecordings]);
  
  // Check if population analysis is available (≥2 MEA recordings)
  const meaCount = recordings.length;
  
  if (loading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          <span className="ml-2 text-zinc-400">Loading MEA data...</span>
        </CardContent>
      </Card>
    );
  }
  
  if (meaCount < 2) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-500" />
            MEA Population Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-sm text-zinc-500">
            Population analysis requires ≥2 MEA recordings in this folder.
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Currently: {meaCount} MEA recording{meaCount === 1 ? '' : 's'}
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Check if recordings share conditions
  const hasLightStim = recordings.some(r => r.analysis_state?.config?.light_enabled);
  const hasDrugAnalysis = recordings.some(r => r.analysis_state?.config?.drug_name);
  
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-500" />
            MEA Population Analysis
          </CardTitle>
          <Badge className="bg-sky-600/30 text-sky-400 text-xs">
            {meaCount} recordings
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-800/50 mb-4">
            <TabsTrigger value="traces" className="text-xs">
              <TrendingUp className="w-3 h-3 mr-1" />
              Population Traces
            </TabsTrigger>
            {(hasLightStim || hasDrugAnalysis) && (
              <TabsTrigger value="comparison" className="text-xs">
                <BarChart3 className="w-3 h-3 mr-1" />
                Comparisons
              </TabsTrigger>
            )}
            <TabsTrigger value="coupling" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              Spike-Burst Coupling
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="traces" className="space-y-4">
            <div>
              <h4 className="text-xs text-zinc-400 mb-2">Mean Spike Rate Trace</h4>
              <PopulationTracePlot recordings={recordings} metric="spike" binSize={5} />
            </div>
            <div>
              <h4 className="text-xs text-zinc-400 mb-2">Mean Burst Rate Trace</h4>
              <PopulationTracePlot recordings={recordings} metric="burst" binSize={30} />
            </div>
          </TabsContent>
          
          {(hasLightStim || hasDrugAnalysis) && (
            <TabsContent value="comparison" className="space-y-4">
              {hasLightStim && (
                <div>
                  <h4 className="text-xs text-zinc-400 mb-2">Baseline vs Light (Population Mean ± SEM)</h4>
                  <PopulationComparisonChart recordings={recordings} condition="baseline_light" />
                </div>
              )}
              {hasDrugAnalysis && (
                <div>
                  <h4 className="text-xs text-zinc-400 mb-2">Baseline vs Drug (Population Mean ± SEM)</h4>
                  <PopulationComparisonChart recordings={recordings} condition="baseline_drug" />
                </div>
              )}
            </TabsContent>
          )}
          
          <TabsContent value="coupling">
            <div>
              <h4 className="text-xs text-zinc-400 mb-2">Population Spike-Burst Coupling</h4>
              <p className="text-[10px] text-zinc-500 mb-4">
                All (spike rate, burst rate) bin pairs from all recordings
              </p>
              <PopulationCouplingPlot recordings={recordings} />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
