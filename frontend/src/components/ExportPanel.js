import { Loader2, FileSpreadsheet, FileText, FileDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function ExportPanel({
  metrics, hrvResults, lightHrv, lightResponse,
  onExportCsv, onExportXlsx, onExportPdf,
  loading, recordingName, onRecordingNameChange, drugUsed, perMinuteData,
  originalFilename, recordingDate,
  // Drug readout settings for metrics availability
  drugReadoutSettings
}) {
  const hasData = !!metrics;
  const hasHrv = !!hrvResults?.windows?.length;
  const hasLight = !!lightHrv || !!lightResponse;
  const hasPerMinute = !!perMinuteData?.length;
  const hasBaseline = !!hrvResults?.baseline;
  const hasDrugMetrics = !!(drugReadoutSettings?.enableHrvReadout || drugReadoutSettings?.enableBfReadout);

  return (
    <div className="space-y-4" data-testid="export-panel">
      {/* Recording Info */}
      <div className="glass-surface-subtle rounded-xl py-3 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Recording Name:</span>
            <Input
              data-testid="export-recording-name-input"
              value={recordingName}
              onChange={(e) => onRecordingNameChange?.(e.target.value)}
              className="h-6 w-48 text-[10px] font-data px-2 rounded-lg"
              style={{ 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#10b981'
              }}
              placeholder="Enter recording name..."
            />
          </div>
          {originalFilename && (
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>ABF File:</span>
              <Badge variant="outline" className="font-data text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--text-secondary)' }}>
                {originalFilename}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <div className="glass-surface-subtle rounded-xl">
        <div className="p-4 pb-2">
          <span className="text-sm" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-primary)' }}>
            Export Results
          </span>
        </div>
        <div className="p-4 pt-2 space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Export analysis results including per-beat data, per-minute metrics, baseline metrics, drug metrics, and light stimulation data.
          </p>

          {/* Available data summary */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-tertiary)' }}>Available Data</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasData ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasData ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Per-Beat</p>
                <p className="text-xs font-data" style={{ color: hasData ? '#10b981' : 'var(--text-tertiary)' }}>
                  {hasData ? `${metrics.n_total} beats detected` : 'No data'}
                </p>
              </div>
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasPerMinute ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasPerMinute ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Per-Minute</p>
                <p className="text-xs font-data" style={{ color: hasPerMinute ? '#10b981' : 'var(--text-tertiary)' }}>
                  {hasPerMinute ? `${perMinuteData.length} rows` : 'Not available'}
                </p>
              </div>
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasBaseline ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasBaseline ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Baseline Metrics</p>
                <p className="text-xs font-data" style={{ color: hasBaseline ? '#22d3ee' : 'var(--text-tertiary)' }}>
                  {hasBaseline ? 'Available' : 'Not available'}
                </p>
              </div>
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasDrugMetrics ? 'rgba(217, 70, 239, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasDrugMetrics ? '1px solid rgba(217, 70, 239, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Drug Metrics</p>
                <p className="text-xs font-data" style={{ color: hasDrugMetrics ? '#d946ef' : 'var(--text-tertiary)' }}>
                  {hasDrugMetrics ? 'Available' : 'Not available'}
                </p>
              </div>
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasLight ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasLight ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Light Metrics</p>
                <p className="text-xs font-data" style={{ color: hasLight ? '#f59e0b' : 'var(--text-tertiary)' }}>
                  {hasLight ? 'Available' : 'Not available'}
                </p>
              </div>
            </div>
          </div>

          <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* Export format description */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-tertiary)' }}>Export Formats</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div 
                className="p-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>CSV</span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  Simple comma-separated format. Per-beat data only. Good for importing into other software.
                </p>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4" style={{ color: '#10b981' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Excel (XLSX)</span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  Multi-sheet workbook with formatted tables. Includes: Summary, Per-Beat, Per-Minute, Baseline, Drug, Light Metrics.
                </p>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileDown className="w-4 h-4" style={{ color: '#ef4444' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>PDF Report</span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  Professional report with graphs. BF chart, NN chart, HRV evolution, summary table. Print-ready.
                </p>
              </div>
            </div>
          </div>

          {/* Export buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              data-testid="export-csv-btn"
              variant="secondary"
              className="h-10 text-xs rounded-lg gap-2 transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'var(--text-secondary)'
              }}
              onClick={onExportCsv}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Export CSV
            </Button>

            <Button
              data-testid="export-xlsx-btn"
              variant="secondary"
              className="h-10 text-xs rounded-lg gap-2 transition-all"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981'
              }}
              onClick={onExportXlsx}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export XLSX
            </Button>

            <Button
              data-testid="export-pdf-btn"
              className="h-10 text-xs rounded-lg gap-2 font-medium transition-all"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5'
              }}
              onClick={onExportPdf}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Export PDF Report
            </Button>
          </div>

          {/* Summary preview */}
          {metrics && (
            <>
              <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="space-y-2 mt-6">
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-tertiary)' }}>Summary Preview</p>
                <div 
                  className="rounded-lg p-3 font-data text-xs space-y-1"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
                >
                  {recordingName && (
                    <div className="flex justify-between">
                      <span>Recording Name</span>
                      <span style={{ color: 'white' }}>{recordingName}</span>
                    </div>
                  )}
                  {originalFilename && (
                    <div className="flex justify-between py-1">
                      <span>Original File</span>
                      <span style={{ color: 'white' }}>{originalFilename}</span>
                    </div>
                  )}
                  {recordingDate && (
                    <div className="flex justify-between">
                      <span>Recording Date</span>
                      <span style={{ color: 'var(--text-primary)' }}>{recordingDate}</span>
                    </div>
                  )}
                  <Separator style={{ background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Beats Detected
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex">
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                            <p>Total number of beats identified by the detection algorithm.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="text-zinc-200">{metrics.n_total}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Kept Beats
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex">
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                            <p>Beats retained after artifact filtering. Kept = Detected - Removed.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="text-emerald-400">{metrics.n_kept}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Removed Beats
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex">
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                            <p>Beats excluded by the artifact filter (intervals outside the specified BF percentage range).</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span className="text-red-400">{metrics.n_removed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Filter Range</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {metrics.filter_settings?.lower_pct || 50}%-{metrics.filter_settings?.upper_pct || 200}%
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
