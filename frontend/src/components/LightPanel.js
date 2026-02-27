import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

function MetricCard({ label, value, unit }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3">
      <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">{label}</p>
      <p className="text-base font-data text-zinc-100 mt-1">
        {value !== null && value !== undefined ? (typeof value === 'number' ? value.toFixed(3) : value) : '—'}
      </p>
      {unit && <p className="text-[9px] text-zinc-500 mt-0.5">{unit}</p>}
    </div>
  );
}

export default function LightPanel({
  lightParams, onParamsChange,
  pulses, onDetectPulses,
  lightHrv, lightResponse,
  onComputeLightHRV, onComputeLightResponse,
  loading
}) {
  const [localParams, setLocalParams] = useState(lightParams || {
    startTime: 180,
    pulseDuration: 20,
    interval: 60,
    nPulses: 5
  });

  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    if (onParamsChange) onParamsChange(updated);
  };

  return (
    <div className="space-y-4" data-testid="light-panel">
      {/* Configuration */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <Zap className="w-4 h-4 text-yellow-400" />
            Light Stimulation Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Start Time (s)</Label>
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
              <Label className="text-[10px] text-zinc-500">Interval (s)</Label>
              <Select
                value={String(localParams.interval)}
                onValueChange={(v) => updateParam('interval', parseInt(v))}
              >
                <SelectTrigger data-testid="light-interval" className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="20">20s</SelectItem>
                  <SelectItem value="10">10s</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-500">Number of Pulses</Label>
              <Input
                data-testid="light-n-pulses"
                type="number"
                value={localParams.nPulses}
                onChange={(e) => updateParam('nPulses', parseInt(e.target.value) || 5)}
                className="h-7 text-xs font-data bg-zinc-950 border-zinc-800 rounded-sm"
                min={1}
                max={20}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="detect-pulses-btn"
              className="h-7 text-xs rounded-sm bg-yellow-600 hover:bg-yellow-700 text-black font-medium"
              onClick={() => onDetectPulses(localParams)}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
              Detect Pulses
            </Button>
            {pulses && (
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
                  Compute Response Metrics
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pulse list */}
      {pulses && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">
              Detected Pulses
              <Badge variant="outline" className="ml-2 font-data text-[10px] border-yellow-700 text-yellow-400">
                {pulses.length} pulses
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {pulses.map((p, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-2 text-center">
                  <p className="text-[9px] text-zinc-500">Pulse {i + 1}</p>
                  <p className="text-[10px] font-data text-yellow-400">
                    {p.start_sec.toFixed(0)}s – {p.end_sec.toFixed(0)}s
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Light HRV results */}
      {lightHrv && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">Light-Induced HRV</CardTitle>
          </CardHeader>
          <CardContent>
            {lightHrv.final && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <MetricCard label="ln(RMSSD70) light" value={lightHrv.final.ln_rmssd70} />
                <MetricCard label="RMSSD70" value={lightHrv.final.rmssd70} unit="ms" />
                <MetricCard label="SDNN" value={lightHrv.final.sdnn} unit="ms" />
                <MetricCard label="pNN50" value={lightHrv.final.pnn50} unit="%" />
              </div>
            )}

            <Separator className="bg-zinc-800 my-3" />
            <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Pulse</p>
            <ScrollArea className="h-[160px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Pulse</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">RMSSD70</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">ln(RMSSD70)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">SDNN</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">pNN50</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Beats</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lightHrv.per_pulse.map((p, i) => (
                    <TableRow key={i} className="border-zinc-800/50 data-row">
                      <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.rmssd70.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? (p.ln_rmssd70?.toFixed(3) ?? '—') : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.sdnn.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{p ? p.pnn50.toFixed(1) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-400 py-1">{p ? p.n_beats : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Light Response Metrics */}
      {lightResponse && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">
              Light Response Metrics
              {lightResponse.baseline_bf && (
                <span className="ml-2 text-[10px] font-data text-zinc-500">
                  Baseline: {lightResponse.baseline_bf.toFixed(1)} bpm
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lightResponse.mean_metrics && (
              <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-4">
                <MetricCard label="Peak BF" value={lightResponse.mean_metrics.peak_bf} unit="bpm" />
                <MetricCard label="Peak Norm" value={lightResponse.mean_metrics.peak_norm_pct} unit="%" />
                <MetricCard label="Time to Peak" value={lightResponse.mean_metrics.time_to_peak_sec} unit="s" />
                <MetricCard label="Slope" value={lightResponse.mean_metrics.slope} />
                <MetricCard label="Norm Slope" value={lightResponse.mean_metrics.norm_slope} />
                <MetricCard label="Amplitude" value={lightResponse.mean_metrics.amplitude} unit="bpm" />
                <MetricCard label="Mean BF" value={lightResponse.mean_metrics.mean_bf} unit="bpm" />
              </div>
            )}

            <Separator className="bg-zinc-800 my-3" />
            <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Stimulation</p>
            <ScrollArea className="h-[160px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak BF</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak Norm%</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">T-Peak (s)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Slope</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Amplitude</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lightResponse.per_stim.map((s, i) => (
                    <TableRow key={i} className="border-zinc-800/50 data-row">
                      <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{s ? s.peak_bf.toFixed(1) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{s ? (s.peak_norm_pct?.toFixed(1) ?? '—') : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{s ? s.time_to_peak_sec.toFixed(1) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{s ? s.slope.toFixed(4) : '—'}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">{s ? (s.amplitude?.toFixed(1) ?? '—') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
