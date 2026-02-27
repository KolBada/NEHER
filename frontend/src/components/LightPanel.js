import { useState, useMemo, useCallback } from 'react';
import { Zap, Loader2, Search, X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea
} from 'recharts';

// Format time as "Xmin Ys" or "X.Xmin"
function formatTimeMinSec(minutes) {
  const totalSec = minutes * 60;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  if (sec === 0) return `${min}min`;
  return `${min}min${sec}s`;
}

function MetricCard({ label, value, unit }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{label}</p>
      <p className="text-base font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

export default function LightPanel({
  lightParams, onParamsChange,
  pulses, onDetectPulses, onPulsesUpdate,
  lightHrv, lightResponse,
  onComputeLightHRV, onComputeLightResponse,
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
  const [localPulses, setLocalPulses] = useState(null);

  // Sync local pulses with prop
  useMemo(() => {
    if (pulses && !localPulses) {
      setLocalPulses(pulses);
    }
  }, [pulses, localPulses]);

  const displayPulses = localPulses || pulses;

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

  // Handle pulse adjustment - actually update the pulse
  const handleAdjustPulse = useCallback((direction) => {
    if (selectedPulseIdx === null || !displayPulses) return;
    const step = 5; // 5 seconds adjustment
    
    const updatedPulses = displayPulses.map((p, i) => {
      if (i === selectedPulseIdx) {
        const newStartSec = p.start_sec + (direction * step);
        const newEndSec = p.end_sec + (direction * step);
        return {
          ...p,
          start_sec: newStartSec,
          end_sec: newEndSec,
          start_min: newStartSec / 60.0,
          end_min: newEndSec / 60.0,
        };
      }
      return p;
    });
    
    setLocalPulses(updatedPulses);
    if (onPulsesUpdate) {
      onPulsesUpdate(updatedPulses);
    }
  }, [selectedPulseIdx, displayPulses, onPulsesUpdate]);

  // Reset pulses to original detection
  const handleResetPulses = useCallback(() => {
    setLocalPulses(null);
    setSelectedPulseIdx(null);
  }, []);

  // Apply local pulses changes
  const handleApplyPulseChanges = useCallback(() => {
    if (localPulses && onPulsesUpdate) {
      onPulsesUpdate(localPulses);
    }
    setSelectedPulseIdx(null);
  }, [localPulses, onPulsesUpdate]);

  // Median light-induced HRV
  const medianHrv = lightHrv?.final;

  // Average HRA (was light response)
  const avgHra = lightResponse?.mean_metrics;

  const isLightEnabled = lightEnabled !== false;

  // X-axis tick formatter for min:sec
  const xAxisTickFormatter = (value) => {
    return formatTimeMinSec(value);
  };

  return (
    <div className="space-y-4" data-testid="light-panel">
      {/* Enable/Disable Light Stim */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${isLightEnabled ? 'text-yellow-400' : 'text-zinc-600'}`} />
              <span className="text-sm font-medium text-zinc-300">Light Stimulation Analysis</span>
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
                  {localPulses && localPulses !== pulses && (
                    <Badge variant="outline" className="font-data text-[9px] border-orange-700 text-orange-400">
                      Modified
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={bfChartData}>
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
                    <Tooltip
                      contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      labelFormatter={(v) => formatTimeMinSec(v)}
                      formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']}
                    />
                    {/* Highlight pulse regions */}
                    {displayPulses && displayPulses.map((pulse, i) => (
                      <ReferenceArea
                        key={`pulse-${i}`}
                        x1={pulse.start_min}
                        x2={pulse.end_min}
                        fill={selectedPulseIdx === i ? '#facc15' : '#facc15'}
                        fillOpacity={selectedPulseIdx === i ? 0.3 : 0.12}
                        stroke="#facc15"
                        strokeOpacity={selectedPulseIdx === i ? 0.8 : 0.4}
                        strokeWidth={selectedPulseIdx === i ? 2 : 1}
                        onClick={() => setSelectedPulseIdx(i)}
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
                
                {/* Pulse adjustment controls */}
                {selectedPulseIdx !== null && displayPulses && (
                  <div className="flex items-center justify-center gap-2 mt-2 p-2 bg-zinc-900/50 rounded-sm border border-zinc-800">
                    <span className="text-[10px] text-zinc-400">
                      Adjust Stim {selectedPulseIdx + 1}:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                      onClick={() => handleAdjustPulse(-1)}
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <span className="text-[10px] font-data text-yellow-400 min-w-[100px] text-center">
                      {formatTimeMinSec(displayPulses[selectedPulseIdx].start_min)} - {formatTimeMinSec(displayPulses[selectedPulseIdx].end_min)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0 border-zinc-700 hover:bg-zinc-800"
                      onClick={() => handleAdjustPulse(1)}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                    <Separator orientation="vertical" className="h-4 bg-zinc-700" />
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
                
                {/* Apply/Reset buttons when modified */}
                {localPulses && localPulses !== pulses && (
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
                      Compute HRA Metrics
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
                <div className="grid grid-cols-5 gap-2">
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
              </CardContent>
            </Card>
          )}

          {/* Light Induced HRA (Heart Rate Adaptation) - was Light Response Metrics */}
          {lightResponse && (
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400">
                  Light Induced HRA (Heart Rate Adaptation) - using BPM
                  {lightResponse.baseline_bf && (
                    <span className="ml-2 text-[10px] font-data text-zinc-500">
                      Baseline (1min pre-light): {lightResponse.baseline_bf.toFixed(1)} bpm
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Median/Average HRA metrics - styled like HRV */}
                {avgHra && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                    <MetricCard label="Avg. Beats" value={avgHra.n_beats} />
                    <MetricCard label="Avg. BF" value={avgHra.avg_bf} unit="bpm" />
                    <MetricCard label="Avg. Peak BF" value={avgHra.peak_bf} unit="bpm" />
                    <MetricCard label="Avg. Amplitude" value={avgHra.amplitude} unit="bpm" />
                    <MetricCard label="Avg. Slope (norm)" value={avgHra.norm_slope} unit="bpm/min/BF" />
                  </div>
                )}

                <Separator className="bg-zinc-800 my-3" />
                <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation HRA</p>
                
                <ScrollArea className="max-h-[250px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Beats</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">NN</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">NN₇₀</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak BF</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak %</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Time to Peak</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Amplitude</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Slope (norm)</TableHead>
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
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.avg_bf?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.avg_nn?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? s.nn_70?.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-cyan-400 py-1">
                            {s ? s.peak_bf.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.peak_norm_pct != null ? s.peak_norm_pct.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s ? `${s.time_to_peak_sec.toFixed(1)}s` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                            {s && s.amplitude != null ? s.amplitude.toFixed(1) : '\u2014'}
                          </TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                            {s && s.norm_slope != null ? s.norm_slope.toFixed(4) : '\u2014'}
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
            <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-400">
                  Light-Induced HRV (using NN₇₀, median across pulses)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {medianHrv && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    <MetricCard label="Median ln(RMSSD₇₀)" value={medianHrv.ln_rmssd70} />
                    <MetricCard label="Median RMSSD₇₀" value={medianHrv.rmssd70} unit="ms" />
                    <MetricCard label="Median SDNN" value={medianHrv.sdnn} unit="ms" />
                    <MetricCard label="Median pNN50" value={medianHrv.pnn50} unit="%" />
                  </div>
                )}

                <Separator className="bg-zinc-800 my-3" />
                <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Pulse HRV (using NN₇₀)</p>
                <ScrollArea className="h-[160px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Pulse</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">RMSSD₇₀</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">ln(RMSSD₇₀)</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">SDNN</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">pNN50</TableHead>
                        <TableHead className="text-[10px] font-data text-zinc-500 h-7">Beats</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lightHrv.per_pulse.map((p, i) => (
                        <TableRow 
                          key={i} 
                          className={`border-zinc-800/50 data-row ${selectedPulseIdx === i ? 'bg-yellow-950/20' : ''}`}
                        >
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.rmssd70.toFixed(2) : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_rmssd70?.toFixed(3) ?? '\u2014') : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.sdnn.toFixed(2) : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.pnn50.toFixed(1) : '\u2014'}</TableCell>
                          <TableCell className="text-[10px] font-data text-zinc-400 py-1">{p ? p.n_beats : '\u2014'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
