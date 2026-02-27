import { useState } from 'react';
import { Zap, Loader2, Search } from 'lucide-react';
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
  pulses, onDetectPulses,
  lightHrv, lightResponse,
  onComputeLightHRV, onComputeLightResponse,
  loading
}) {
  const [localParams, setLocalParams] = useState(lightParams || {
    startTime: 180,
    pulseDuration: 20,
    interval: 'decreasing',
    nPulses: 5,
    autoDetect: true,
    searchRange: 20,
  });

  const updateParam = (key, value) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    if (onParamsChange) onParamsChange(updated);
  };

  // Compute average for light response
  const avgResponse = lightResponse?.mean_metrics;

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
              onClick={() => onDetectPulses(localParams)}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
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
            <CardTitle className="text-xs text-zinc-400 flex items-center gap-2">
              Detected Pulses
              <Badge variant="outline" className="font-data text-[10px] border-yellow-700 text-yellow-400">
                {pulses.length} pulses
              </Badge>
              {pulses.length >= 2 && (
                <span className="text-[10px] font-data text-zinc-500">
                  Intervals: {pulses.slice(0, -1).map((p, i) => `${(pulses[i+1].start_sec - p.end_sec).toFixed(0)}s`).join(' \u2192 ')}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-2">
              {pulses.map((p, i) => (
                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-2 text-center">
                  <p className="text-[9px] text-zinc-500">Stim {i + 1}</p>
                  <p className="text-[10px] font-data text-yellow-400">
                    {(p.start_sec/60).toFixed(2)} - {(p.end_sec/60).toFixed(2)} min
                  </p>
                  <p className="text-[9px] font-data text-zinc-500">
                    {p.start_sec.toFixed(0)}s - {p.end_sec.toFixed(0)}s
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Light Response Metrics - Per stim + Average */}
      {lightResponse && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">
              Light Response Metrics
              {lightResponse.baseline_bf && (
                <span className="ml-2 text-[10px] font-data text-zinc-500">
                  Baseline (1min pre-light): {lightResponse.baseline_bf.toFixed(1)} bpm
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Stim</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Time to Peak (s)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak BF (bpm)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Peak % (rel. baseline)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Slope (norm.)</TableHead>
                    <TableHead className="text-[10px] font-data text-zinc-500 h-7">Amplitude (bpm)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lightResponse.per_stim.map((s, i) => (
                    <TableRow key={i} className="border-zinc-800/50 data-row">
                      <TableCell className="text-[10px] font-data text-zinc-400 py-1">{i + 1}</TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                        {s ? s.time_to_peak_sec.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                        {s ? s.peak_bf.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                        {s && s.peak_norm_pct != null ? s.peak_norm_pct.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                        {s && s.norm_slope != null ? s.norm_slope.toFixed(4) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-zinc-300 py-1">
                        {s && s.amplitude != null ? s.amplitude.toFixed(1) : '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Average row */}
                  {avgResponse && (
                    <TableRow className="border-zinc-800 bg-zinc-900/30">
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1 font-bold">AVG</TableCell>
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                        {avgResponse.time_to_peak_sec != null ? avgResponse.time_to_peak_sec.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                        {avgResponse.peak_bf != null ? avgResponse.peak_bf.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                        {avgResponse.peak_norm_pct != null ? avgResponse.peak_norm_pct.toFixed(1) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                        {avgResponse.norm_slope != null ? avgResponse.norm_slope.toFixed(4) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-[10px] font-data text-yellow-400 py-1">
                        {avgResponse.amplitude != null ? avgResponse.amplitude.toFixed(1) : '\u2014'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Light HRV results */}
      {lightHrv && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">Light-Induced HRV (normalized to 70 bpm per pulse)</CardTitle>
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
            <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wider">Per-Pulse HRV</p>
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
    </div>
  );
}
