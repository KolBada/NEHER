import { Loader2, RefreshCw, Check, RotateCcw, Filter, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
    <div className="glass-surface rounded-xl" data-testid="detection-panel">
      <div className="p-4 pb-3">
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
          Beat Detection
        </h3>
      </div>
      <TooltipProvider delayDuration={100}>
      <div className="px-4 pb-4 space-y-5">
        {/* Threshold Direction - Positive or Negative */}
        <div className="space-y-2">
          <Label className="text-xs text-center block" style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Threshold Direction</Label>
          <div className="flex gap-2 justify-center">
            <Button
              data-testid="threshold-positive-btn"
              variant={!params.invert ? "default" : "outline"}
              size="sm"
              className={`w-24 h-8 text-xs ${!params.invert ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
              style={params.invert ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)' } : {}}
              onClick={() => onChange({ ...params, invert: false })}
              disabled={isValidated}
            >
              Positive
            </Button>
            <Button
              data-testid="threshold-negative-btn"
              variant={params.invert ? "default" : "outline"}
              size="sm"
              className={`w-24 h-8 text-xs ${params.invert ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
              style={!params.invert ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)' } : {}}
              onClick={() => onChange({ ...params, invert: true })}
              disabled={isValidated}
            >
              Negative
            </Button>
          </div>
          <p className="text-[9px] italic text-center" style={{ color: 'var(--text-tertiary)' }}>
            {params.invert ? 'Detect peaks below the threshold' : 'Detect peaks above the threshold'}
          </p>
        </div>

        <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Min Distance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Min Distance (s)</Label>
            <span className="text-[10px] font-data" style={{ color: 'var(--text-primary)' }}>
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
        <div className="space-y-2 p-2 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Threshold (mV)</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 cursor-help" style={{ color: '#f59e0b' }} />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs glass-surface" style={{ color: 'var(--text-primary)' }}>
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
                className="h-6 w-20 text-[10px] font-data"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
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
          <p className="text-[9px] italic" style={{ color: '#f59e0b' }}>
            Shown as dashed amber line on trace
          </p>
        </div>

        {/* Prominence */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Prominence</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 cursor-help" style={{ color: 'var(--text-tertiary)' }} />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs glass-surface" style={{ color: 'var(--text-primary)' }}>
                  <p>Minimum height difference between a peak and its surrounding signal. Higher values = only detect more prominent/distinct beats.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-[10px] font-data" style={{ color: 'var(--text-primary)' }}>
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

        <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />
        
        {/* Artifact Filter Strictness */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>Artifact Filter</p>
          </div>
          <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
            Keep beats where BF is within {filterLower}% - {filterUpper}% of local median
          </p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Lower Bound (%)</Label>
              <span className="text-[10px] font-data" style={{ color: 'var(--text-primary)' }}>{filterLower}%</span>
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
              <Label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Upper Bound (%)</Label>
              <span className="text-[10px] font-data" style={{ color: 'var(--text-primary)' }}>{filterUpper}%</span>
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
              className="text-[9px] font-data cursor-pointer transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', borderRadius: '6px' }}
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 50, upperPct: 200 })}
            >
              Default (50-200%)
            </Badge>
            <Badge 
              variant="outline" 
              className="text-[9px] font-data cursor-pointer transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', borderRadius: '6px' }}
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 70, upperPct: 150 })}
            >
              Strict (70-150%)
            </Badge>
            <Badge 
              variant="outline" 
              className="text-[9px] font-data cursor-pointer transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', borderRadius: '6px' }}
              onClick={() => !isValidated && onFilterChange?.({ lowerPct: 30, upperPct: 250 })}
            >
              Loose (30-250%)
            </Badge>
          </div>
        </div>

        <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Signal Stats */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>Signal</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Min', stats.min.toFixed(2)],
              ['Max', stats.max.toFixed(2)],
              ['Mean', stats.mean.toFixed(2)],
              ['Std', stats.std.toFixed(3)],
            ].map(([label, val]) => (
              <div key={label} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-[9px] uppercase" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
                <p className="text-xs font-data" style={{ color: 'var(--text-primary)' }}>{val}</p>
              </div>
            ))}
          </div>
        </div>

        <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

        {/* Actions */}
        <div className="space-y-3">
          {!isValidated ? (
            <div className="space-y-3">
              <Button
                data-testid="re-detect-btn"
                variant="secondary"
                className="w-full h-8 text-xs rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }}
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
                className="w-full h-8 text-xs rounded-lg font-medium"
                style={{ background: '#10b981', color: '#02080f' }}
                onClick={onValidate}
                disabled={!beats || beats.length < 2}
              >
                Validate Beats
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <Check className="w-3 h-3" style={{ color: '#10b981' }} />
                <span className="text-xs" style={{ color: '#10b981' }}>Beats validated ({beats ? beats.length : 0})</span>
              </div>
              <Button
                data-testid="unvalidate-btn"
                variant="secondary"
                className="w-full h-8 text-xs rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'var(--text-secondary)' }}
                onClick={onUnvalidate}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset Validation (Re-edit beats)
              </Button>
            </div>
          )}
        </div>
      </div>
      </TooltipProvider>
    </div>
  );
}
