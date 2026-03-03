import { Loader2, RefreshCw, Check, RotateCcw, Filter, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function DetectionPanel({
  params, onChange, signalStats,
  onDetect, onValidate, onUnvalidate,
  isValidated, detectLoading, beats,
  filterParams, onFilterChange
}) {
  const stats = signalStats || { min: -10, max: 10, mean: 0, std: 1 };
  const minDist = params.minDistance || 0.3;
  const threshold = params.threshold;
  const prominence = params.prominence;
  
  // Filter strictness defaults
  const filterLower = filterParams?.lowerPct ?? 50;
  const filterUpper = filterParams?.upperPct ?? 200;

  return (
    <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm" data-testid="detection-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium tracking-tight" style={{ fontFamily: 'Manrope' }}>
          Beat Detection
        </CardTitle>
      </CardHeader>
      <TooltipProvider delayDuration={100}>
      <CardContent className="space-y-5">
        {/* Threshold Direction - Positive or Negative */}
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400 text-center block">Threshold Direction</Label>
          <div className="flex gap-2 justify-center">
            <Button
              data-testid="threshold-positive-btn"
              variant={!params.invert ? "default" : "outline"}
              size="sm"
              className={`w-32 h-7 text-xs ${!params.invert ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-zinc-700 text-zinc-400'}`}
              onClick={() => onChange({ ...params, invert: false })}
              disabled={isValidated}
            >
              Positive (Above)
            </Button>
            <Button
              data-testid="threshold-negative-btn"
              variant={params.invert ? "default" : "outline"}
              size="sm"
              className={`w-32 h-7 text-xs ${params.invert ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-zinc-700 text-zinc-400'}`}
              onClick={() => onChange({ ...params, invert: true })}
              disabled={isValidated}
            >
              Negative (Below)
            </Button>
          </div>
          <p className="text-[9px] text-zinc-500 italic text-center">
            {params.invert ? 'Detect peaks below the threshold' : 'Detect peaks above the threshold'}
          </p>
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

        {/* Threshold - More prominent with direct input */}
        <div className="space-y-2 p-2 bg-amber-950/20 border border-amber-900/50 rounded-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-amber-400 font-semibold">Threshold (mV)</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-amber-600 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs bg-zinc-900 border-zinc-700 text-white">
                  <p>{params.invert 
                    ? 'Voltage level for beat detection. Only peaks BELOW this value will be detected as beats.' 
                    : 'Voltage level for beat detection. Only peaks ABOVE this value will be detected as beats.'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Input
                data-testid="threshold-input"
                type="number"
                step="0.01"
                value={threshold !== null ? threshold.toFixed(2) : ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onChange({ ...params, threshold: val });
                  }
                }}
                placeholder="auto"
                className="h-6 w-20 text-[10px] font-data bg-zinc-900 border-zinc-700 text-zinc-200"
                disabled={isValidated}
              />
            </div>
          </div>
          <Slider
            data-testid="threshold-slider"
            value={[threshold !== null ? threshold : stats.mean + stats.std]}
            onValueChange={(v) => onChange({ ...params, threshold: v[0] })}
            min={stats.min}
            max={stats.max}
            step={0.01}
            disabled={isValidated}
            className="accent-amber-500"
          />
          <p className="text-[9px] text-amber-600 italic">
            Shown as dashed amber line on trace
          </p>
        </div>

        {/* Prominence */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-zinc-400">Prominence</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-zinc-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs bg-zinc-900 border-zinc-700 text-white">
                  <p>Minimum height difference between a peak and its surrounding signal. Higher values = only detect more prominent/distinct beats.</p>
                </TooltipContent>
              </Tooltip>
            </div>
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
        
        {/* Artifact Filter Strictness */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-zinc-500" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Artifact Filter</p>
          </div>
          <p className="text-[9px] text-zinc-500">
            Keep beats where BF is within {filterLower}% - {filterUpper}% of local median
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-zinc-400">Lower Bound (%)</Label>
              <span className="text-[10px] font-data text-zinc-300">{filterLower}%</span>
            </div>
            <Slider
              data-testid="filter-lower-slider"
              value={[filterLower]}
              onValueChange={(v) => onFilterChange?.({ ...filterParams, lowerPct: v[0] })}
              min={10}
              max={90}
              step={5}
              disabled={isValidated}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-zinc-400">Upper Bound (%)</Label>
              <span className="text-[10px] font-data text-zinc-300">{filterUpper}%</span>
            </div>
            <Slider
              data-testid="filter-upper-slider"
              value={[filterUpper]}
              onValueChange={(v) => onFilterChange?.({ ...filterParams, upperPct: v[0] })}
              min={110}
              max={300}
              step={5}
              disabled={isValidated}
            />
          </div>
          
          <div className="flex gap-1 flex-wrap">
            <Badge 
              variant="outline" 
              className="text-[9px] font-data border-zinc-700 text-zinc-400 cursor-pointer hover:bg-zinc-800"
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 50, upperPct: 200 })}
            >
              Default (50-200%)
            </Badge>
            <Badge 
              variant="outline" 
              className="text-[9px] font-data border-zinc-700 text-zinc-400 cursor-pointer hover:bg-zinc-800"
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 70, upperPct: 150 })}
            >
              Strict (70-150%)
            </Badge>
            <Badge 
              variant="outline" 
              className="text-[9px] font-data border-zinc-700 text-zinc-400 cursor-pointer hover:bg-zinc-800"
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 30, upperPct: 250 })}
            >
              Loose (30-250%)
            </Badge>
          </div>
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
          {!isValidated ? (
            <>
              <Button
                data-testid="re-detect-btn"
                variant="secondary"
                className="w-full h-8 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                onClick={onDetect}
                disabled={detectLoading}
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
                className="w-full h-8 text-xs rounded-sm font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                onClick={onValidate}
                disabled={!beats || beats.length < 2}
              >
                Validate Beats
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-2 bg-green-950/30 border border-green-800/50 rounded-sm">
                <Check className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">Beats validated ({beats ? beats.length : 0})</span>
              </div>
              <Button
                data-testid="unvalidate-btn"
                variant="secondary"
                className="w-full h-8 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
                onClick={onUnvalidate}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset Validation (Re-edit beats)
              </Button>
            </>
          )}
        </div>
      </CardContent>
      </TooltipProvider>
    </Card>
  );
}
