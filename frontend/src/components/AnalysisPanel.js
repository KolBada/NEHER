import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip as TooltipUI,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const CHART_COLORS = {
  bf: '#22d3ee',
  nn: '#a3e635',
  lnRmssd: '#22d3ee',
  sdnn: '#c084fc',
  pnn50: '#fb923c',
};

function MetricCard({ label, value, unit, sublabel }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{label}</p>
      {sublabel && <p className="text-[8px] text-zinc-600">{sublabel}</p>}
      <p className="text-lg font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

function BaselineCard({ label, value, unit, baselineValue, baselineLabel }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{label}</p>
      <p className="text-lg font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '\u2014'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
      {baselineValue !== null && baselineValue !== undefined && (
        <div className="mt-2 pt-2 border-t border-zinc-800">
          <p className="text-[8px] text-zinc-500 uppercase">Baseline {baselineLabel}</p>
          <p className="text-xs font-data text-zinc-400">
            {typeof baselineValue === 'number' ? baselineValue.toFixed(3) : baselineValue}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AnalysisPanel({
  metrics, hrvResults, perMinuteData,
  onComputeHRV, analysisLoading, filterSettings
}) {
  const [readoutMinute, setReadoutMinute] = useState('');
  const [baselineHrvStart, setBaselineHrvStart] = useState(0);
  const [baselineHrvEnd, setBaselineHrvEnd] = useState(3);
  const [baselineBfStart, setBaselineBfStart] = useState(1);
  const [baselineBfEnd, setBaselineBfEnd] = useState(2);

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

  const hrvChartData = useMemo(() => {
    if (!hrvResults || !hrvResults.windows) return [];
    return hrvResults.windows;
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

  if (!metrics) return (
    <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
      Validate beats first to see analysis results
    </div>
  );

  const readout = hrvResults?.readout;
  const baseline = hrvResults?.baseline;
  const filterInfo = metrics?.filter_settings || filterSettings;

  return (
    <div className="space-y-4" data-testid="analysis-panel">
      {/* Summary badges */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
          {metrics.n_total} total beats
        </Badge>
        <Badge variant="outline" className="font-data text-[10px] border-green-800 text-green-400">
          {metrics.n_kept} kept
        </Badge>
        <Badge variant="outline" className="font-data text-[10px] border-red-800 text-red-400">
          {metrics.n_removed} removed
        </Badge>
        {filterInfo && (
          <Badge variant="outline" className="font-data text-[10px] border-cyan-800 text-cyan-400">
            Filter: {filterInfo.lower_pct || filterInfo.lowerPct}%-{filterInfo.upper_pct || filterInfo.upperPct}%
          </Badge>
        )}
      </div>

      {/* BF + NN charts (filtered) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
              Beat Frequency (Filtered) - bpm vs min
              <Badge variant="outline" className="font-data text-[9px] border-zinc-700 text-zinc-500">
                {metrics.n_kept} beats
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={filteredBfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                  label={{ value: 'min', fill: '#52525b', fontSize: 9, position: 'insideBottomRight', offset: -5 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45}
                  label={{ value: 'bpm', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
                <Tooltip
                  contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  labelFormatter={(v) => `${Number(v).toFixed(2)} min`}
                  formatter={(v) => [`${Number(v).toFixed(1)} bpm`, 'BF']}
                />
                <Line type="monotone" dataKey="bf" stroke={CHART_COLORS.bf} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Brush height={20} stroke="#3f3f46" fill="#0c0c0e" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
              NN Intervals (Filtered) - ms vs min
              <Badge variant="outline" className="font-data text-[9px] border-zinc-700 text-zinc-500">
                {metrics.n_kept} intervals
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={filteredNnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                  label={{ value: 'min', fill: '#52525b', fontSize: 9, position: 'insideBottomRight', offset: -5 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45}
                  label={{ value: 'ms', angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }} />
                <Tooltip
                  contentStyle={{ background: '#121212', border: '1px solid #27272a', borderRadius: 2, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  labelFormatter={(v) => `${Number(v).toFixed(2)} min`}
                  formatter={(v) => [`${Number(v).toFixed(1)} ms`, 'NN']}
                />
                <Line type="monotone" dataKey="nn" stroke={CHART_COLORS.nn} strokeWidth={1} dot={false} isAnimationActive={false} />
                <Brush height={20} stroke="#3f3f46" fill="#0c0c0e" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* HRV Controls */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-400">
            HRV Analysis (Sliding 3-min Windows, Normalized to 70 bpm)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Readout Minute</Label>
              <Input
                data-testid="readout-minute-input"
                type="number"
                value={readoutMinute}
                onChange={(e) => setReadoutMinute(e.target.value)}
                className="w-20 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                placeholder="e.g. 5"
              />
            </div>
            <Separator orientation="vertical" className="h-7 bg-zinc-800" />
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Baseline HRV (min)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={baselineHrvStart}
                  onChange={(e) => setBaselineHrvStart(parseFloat(e.target.value) || 0)}
                  className="w-14 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                />
                <span className="text-zinc-500 text-xs">-</span>
                <Input
                  type="number"
                  value={baselineHrvEnd}
                  onChange={(e) => setBaselineHrvEnd(parseFloat(e.target.value) || 3)}
                  className="w-14 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Baseline BF (min)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={baselineBfStart}
                  onChange={(e) => setBaselineBfStart(parseFloat(e.target.value) || 1)}
                  className="w-14 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                />
                <span className="text-zinc-500 text-xs">-</span>
                <Input
                  type="number"
                  value={baselineBfEnd}
                  onChange={(e) => setBaselineBfEnd(parseFloat(e.target.value) || 2)}
                  className="w-14 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                />
              </div>
            </div>
            <Button
              data-testid="compute-hrv-btn"
              className="h-7 text-xs rounded-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              onClick={() => onComputeHRV(
                readoutMinute ? parseInt(readoutMinute) : null,
                { hrvStart: baselineHrvStart, hrvEnd: baselineHrvEnd, bfStart: baselineBfStart, bfEnd: baselineBfEnd }
              )}
              disabled={analysisLoading}
            >
              {analysisLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Compute HRV'}
            </Button>
          </div>

          {/* Readout with Baseline */}
          {readout && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2">
                Readout at minute {readout.minute}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <BaselineCard 
                  label="ln(RMSSD₇₀)" 
                  value={readout.ln_rmssd70}
                  baselineValue={baseline?.baseline_ln_rmssd70}
                  baselineLabel={baseline?.baseline_hrv_range}
                />
                <BaselineCard 
                  label="RMSSD₇₀" 
                  value={readout.rmssd70} 
                  unit="ms"
                  baselineValue={baseline?.baseline_rmssd70}
                  baselineLabel={baseline?.baseline_hrv_range}
                />
                <BaselineCard 
                  label="SDNN" 
                  value={readout.sdnn} 
                  unit="ms"
                  baselineValue={baseline?.baseline_sdnn}
                  baselineLabel={baseline?.baseline_hrv_range}
                />
                <BaselineCard 
                  label="pNN50" 
                  value={readout.pnn50} 
                  unit="%"
                  baselineValue={baseline?.baseline_pnn50}
                  baselineLabel={baseline?.baseline_hrv_range}
                />
                <BaselineCard 
                  label="Mean BF" 
                  value={readout.mean_bf} 
                  unit="bpm"
                  baselineValue={baseline?.baseline_bf}
                  baselineLabel={baseline?.baseline_bf_range}
                />
              </div>
            </div>
          )}

          {/* HRV Evolution Charts */}
          {hrvChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {[
                { key: 'ln_rmssd70', label: 'ln(RMSSD₇₀)', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.lnRmssd },
                { key: 'sdnn', label: 'SDNN', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.sdnn },
                { key: 'pnn50', label: 'pNN50 (%)', sublabel: '3-min window, normalized to 70 bpm', color: CHART_COLORS.pnn50 },
              ].map(({ key, label, sublabel, color }) => (
                <div key={key} className="bg-black border border-zinc-800 rounded-sm p-2">
                  <p className="text-[10px] text-zinc-400 font-medium mb-0.5">{label}</p>
                  <p className="text-[8px] text-zinc-600 mb-1">{sublabel}</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={hrvChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                      <XAxis dataKey="minute" tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }}
                        label={{ value: 'min', fill: '#52525b', fontSize: 8, position: 'insideBottomRight', offset: -5 }} />
                      <YAxis tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }} width={40} />
                      <Tooltip
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
          <CardTitle className="text-xs text-zinc-400">Per-Minute Metrics</CardTitle>
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
                      <TableHead className="text-[10px] font-data text-cyan-600 h-7">
                        <TooltipProvider>
                          <TooltipUI>
                            <TooltipTrigger className="flex items-center gap-1">
                              SDNN₇₀ <Info className="w-2.5 h-2.5" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-700 text-[10px]">
                              <p>3-min sliding window, normalized to 70 bpm</p>
                            </TooltipContent>
                          </TooltipUI>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="text-[10px] font-data text-purple-400 h-7">
                        <TooltipProvider>
                          <TooltipUI>
                            <TooltipTrigger className="flex items-center gap-1">
                              RMSSD₇₀ <Info className="w-2.5 h-2.5" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-700 text-[10px]">
                              <p>3-min sliding window, normalized to 70 bpm</p>
                            </TooltipContent>
                          </TooltipUI>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead className="text-[10px] font-data text-orange-400 h-7">
                        <TooltipProvider>
                          <TooltipUI>
                            <TooltipTrigger className="flex items-center gap-1">
                              pNN50₇₀ <Info className="w-2.5 h-2.5" />
                            </TooltipTrigger>
                            <TooltipContent className="bg-zinc-900 border-zinc-700 text-[10px]">
                              <p>3-min sliding window, normalized to 70 bpm</p>
                            </TooltipContent>
                          </TooltipUI>
                        </TooltipProvider>
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
                        <TableCell className="text-[10px] font-data text-cyan-400 py-1">
                          {row.hrv ? row.hrv.sdnn.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-purple-300 py-1">
                          {row.hrv ? row.hrv.rmssd70.toFixed(2) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-[10px] font-data text-orange-300 py-1">
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
                              row.kept ? 'border-green-800 text-green-400' : 'border-red-800 text-red-400'
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
