import { Loader2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export default function DetectionPanel({
  params, onChange, signalStats,
  onDetect, onValidate,
  isValidated, detectLoading, beats
}) {
  const stats = signalStats || { min: -10, max: 10, mean: 0, std: 1 };
  const minDist = params.minDistance || 0.2;
  const threshold = params.threshold;
  const prominence = params.prominence;

  return (
    <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm" data-testid="detection-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium tracking-tight" style={{ fontFamily: 'Manrope' }}>
          Beat Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Invert */}
        <div className="flex items-center justify-between">
          <Label className="text-xs text-zinc-400">Invert Trace</Label>
          <Switch
            data-testid="invert-switch"
            checked={params.invert}
            onCheckedChange={(v) => onChange({ ...params, invert: v })}
            disabled={isValidated}
          />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Min Distance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-400">Min Distance (s)</Label>
            <span className="text-[10px] font-data text-zinc-300">
              {minDist.toFixed(2)}s
            </span>
          </div>
          <Slider
            data-testid="min-distance-slider"
            value={[minDist]}
            onValueChange={(v) => onChange({ ...params, minDistance: v[0] })}
            min={0.05}
            max={3.0}
            step={0.01}
            disabled={isValidated}
            className="accent-cyan-500"
          />
        </div>

        {/* Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-400">Threshold (mV)</Label>
            <span className="text-[10px] font-data text-zinc-300">
              {threshold !== null ? threshold.toFixed(2) : 'auto'}
            </span>
          </div>
          <Slider
            data-testid="threshold-slider"
            value={[threshold !== null ? threshold : stats.mean + stats.std]}
            onValueChange={(v) => onChange({ ...params, threshold: v[0] })}
            min={stats.min}
            max={stats.max}
            step={0.01}
            disabled={isValidated}
          />
        </div>

        {/* Prominence */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-zinc-400">Prominence</Label>
            <span className="text-[10px] font-data text-zinc-300">
              {prominence !== null ? prominence.toFixed(3) : 'auto'}
            </span>
          </div>
          <Slider
            data-testid="prominence-slider"
            value={[prominence !== null ? prominence : stats.std * 0.3]}
            onValueChange={(v) => onChange({ ...params, prominence: v[0] })}
            min={0}
            max={stats.std * 5}
            step={0.001}
            disabled={isValidated}
          />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Signal Stats */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-2">Signal</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Min', stats.min.toFixed(2)],
              ['Max', stats.max.toFixed(2)],
              ['Mean', stats.mean.toFixed(2)],
              ['Std', stats.std.toFixed(3)],
            ].map(([label, val]) => (
              <div key={label} className="bg-zinc-900/50 p-2 rounded-sm">
                <p className="text-[9px] text-zinc-500 uppercase">{label}</p>
                <p className="text-xs font-data text-zinc-300">{val}</p>
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Actions */}
        <div className="space-y-2">
          <Button
            data-testid="re-detect-btn"
            variant="secondary"
            className="w-full h-8 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            onClick={onDetect}
            disabled={isValidated || detectLoading}
          >
            {detectLoading ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Re-detect ({beats ? beats.length : 0} beats)
          </Button>

          <Button
            data-testid="validate-btn"
            className={`w-full h-8 text-xs rounded-sm font-medium ${
              isValidated
                ? 'bg-green-700 hover:bg-green-700 text-white cursor-default'
                : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
            }`}
            onClick={onValidate}
            disabled={isValidated || !beats || beats.length < 2}
          >
            {isValidated ? (
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3" /> Validated
              </span>
            ) : (
              'Validate Beats'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
