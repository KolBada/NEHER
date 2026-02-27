import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const CHART_COLORS = {
  bf: '#22d3ee',
  nn: '#a3e635',
  lnRmssd: '#22d3ee',
  sdnn: '#c084fc',
  pnn50: '#fb923c',
  meanBf: '#facc15',
};

function MetricCard({ label, value, unit }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{label}</p>
      <p className="text-lg font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '—'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

export default function AnalysisPanel({
  metrics, hrvResults, onComputeHRV, analysisLoading
}) {
  const [readoutMinute, setReadoutMinute] = useState('');

  const bfChartData = useMemo(() => {
    if (!metrics) return [];
    return metrics.beat_times_min.slice(0, -1).map((t, i) => ({
      time: t,
      bf: metrics.beat_freq_bpm[i],
      filtered: metrics.artifact_mask[i],
    }));
  }, [metrics]);

  const nnChartData = useMemo(() => {
    if (!metrics) return [];
    return metrics.beat_times_min.slice(0, -1).map((t, i) => ({
      time: t,
      nn: metrics.nn_intervals_ms[i],
      filtered: metrics.artifact_mask[i],
    }));
  }, [metrics]);

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

  if (!metrics) return (
    <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">
      Validate beats first to see analysis results
    </div>
  );

  const readout = hrvResults?.readout;

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
      </div>

      {/* BF + NN charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">Beat Frequency (filtered)</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={filteredBfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`} />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45} />
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
            <CardTitle className="text-xs text-zinc-400">NN Intervals (filtered)</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={filteredNnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`} />
                <YAxis tick={{ fill: '#71717a', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={45} />
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
            HRV Analysis (Sliding 3-min Windows)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Readout Minute</Label>
              <Input
                data-testid="readout-minute-input"
                type="number"
                value={readoutMinute}
                onChange={(e) => setReadoutMinute(e.target.value)}
                className="w-24 h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                placeholder="e.g. 5"
              />
            </div>
            <Button
              data-testid="compute-hrv-btn"
              className="h-7 text-xs rounded-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              onClick={() => onComputeHRV(readoutMinute ? parseInt(readoutMinute) : null)}
              disabled={analysisLoading}
            >
              {analysisLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Compute HRV'}
            </Button>
          </div>

          {/* Readout */}
          {readout && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              <MetricCard label="ln(RMSSD70)" value={readout.ln_rmssd70} />
              <MetricCard label="RMSSD70" value={readout.rmssd70} unit="ms" />
              <MetricCard label="SDNN" value={readout.sdnn} unit="ms" />
              <MetricCard label="pNN50" value={readout.pnn50} unit="%" />
              <MetricCard label="Mean BF" value={readout.mean_bf} unit="bpm" />
            </div>
          )}

          {/* HRV Evolution Charts */}
          {hrvChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
              {[
                { key: 'ln_rmssd70', label: 'ln(RMSSD70)', color: CHART_COLORS.lnRmssd },
                { key: 'sdnn', label: 'SDNN', color: CHART_COLORS.sdnn },
                { key: 'pnn50', label: 'pNN50 (%)', color: CHART_COLORS.pnn50 },
              ].map(({ key, label, color }) => (
                <div key={key} className="bg-black border border-zinc-800 rounded-sm p-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={hrvChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                      <XAxis dataKey="minute" tick={{ fill: '#71717a', fontSize: 8, fontFamily: 'JetBrains Mono' }} />
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

      {/* Per-beat table */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-zinc-400">Per-Beat Data</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
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
        </CardContent>
      </Card>
    </div>
  );
}
