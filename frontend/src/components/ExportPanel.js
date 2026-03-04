import { Loader2, FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

export default function ExportPanel({
  metrics, hrvResults, lightHrv, lightResponse,
  onExportCsv, onExportXlsx, onExportPdf,
  loading, recordingName, drugUsed, perMinuteData,
  originalFilename,
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
      {(recordingName || drugUsed) && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 flex-wrap">
              {recordingName && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Recording:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-cyan-800 text-cyan-400">
                    {recordingName}
                  </Badge>
                </div>
              )}
              {drugUsed && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Drug:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-purple-800 text-purple-400">
                    {drugUsed}
                  </Badge>
                </div>
              )}
              {originalFilename && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">ABF File:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
                    {originalFilename}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium" style={{ fontFamily: 'Manrope' }}>
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            Export analysis results including per-beat data, per-minute metrics, baseline metrics, drug metrics, and light stimulation data.
          </p>

          {/* Available data summary */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Available Data</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className={`p-2 rounded-sm border ${hasData ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Per-Beat</p>
                <p className={`text-xs font-data ${hasData ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasData ? `${metrics.n_total} beats` : 'No data'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasPerMinute ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Per-Minute</p>
                <p className={`text-xs font-data ${hasPerMinute ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasPerMinute ? `${perMinuteData.length} rows` : 'Not available'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasBaseline ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Baseline Metrics</p>
                <p className={`text-xs font-data ${hasBaseline ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasBaseline ? 'Available' : 'Not available'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasDrugMetrics ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Drug Metrics</p>
                <p className={`text-xs font-data ${hasDrugMetrics ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasDrugMetrics ? 'Available' : 'Not available'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasLight ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Light Metrics</p>
                <p className={`text-xs font-data ${hasLight ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasLight ? 'Available' : 'Not available'}
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Export format description */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Export Formats</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-300">CSV</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Simple comma-separated format. Per-beat data only. Good for importing into other software.
                </p>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-zinc-300">Excel (XLSX)</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Multi-sheet workbook with formatted tables. Includes: Summary, Per-Beat, Per-Minute, Baseline, Drug, Light Metrics.
                </p>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-medium text-zinc-300">PDF Report</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Professional report with graphs. BF chart, NN chart, HRV evolution, summary table. Print-ready.
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Export buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              data-testid="export-csv-btn"
              variant="secondary"
              className="h-10 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 gap-2"
              onClick={onExportCsv}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Export CSV
            </Button>

            <Button
              data-testid="export-xlsx-btn"
              variant="secondary"
              className="h-10 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 gap-2"
              onClick={onExportXlsx}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export XLSX
            </Button>

            <Button
              data-testid="export-pdf-btn"
              className="h-10 text-xs rounded-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 gap-2 font-medium"
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
              <Separator className="bg-zinc-800" />
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Summary Preview</p>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3 font-data text-xs text-zinc-400 space-y-1">
                  {recordingName && (
                    <div className="flex justify-between">
                      <span>Recording Name</span>
                      <span className="text-cyan-400">{recordingName}</span>
                    </div>
                  )}
                  {drugUsed && (
                    <div className="flex justify-between">
                      <span>Drug Used</span>
                      <span className="text-purple-400">{drugUsed}</span>
                    </div>
                  )}
                  <Separator className="bg-zinc-800 my-1" />
                  <div className="flex justify-between">
                    <span>Total Beats</span>
                    <span className="text-zinc-200">{metrics.n_total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kept (after filter)</span>
                    <span className="text-green-400">{metrics.n_kept}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Removed (artifacts)</span>
                    <span className="text-red-400">{metrics.n_removed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Filter Range</span>
                    <span className="text-zinc-300">
                      {metrics.filter_settings?.lower_pct || 50}%-{metrics.filter_settings?.upper_pct || 200}%
                    </span>
                  </div>
                  {hasHrv && hrvResults.readout && (
                    <>
                      <Separator className="bg-zinc-800 my-1" />
                      <p className="text-[9px] text-zinc-500 uppercase">HRV Readout (minute {hrvResults.readout.minute})</p>
                      <div className="flex justify-between">
                        <span>ln(RMSSD₇₀)</span>
                        <span className="text-cyan-400">{hrvResults.readout.ln_rmssd70?.toFixed(3) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SDNN</span>
                        <span className="text-purple-400">{hrvResults.readout.sdnn?.toFixed(3) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>pNN50</span>
                        <span className="text-orange-400">{hrvResults.readout.pnn50?.toFixed(1) ?? '—'}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mean BF</span>
                        <span className="text-zinc-300">{hrvResults.readout.mean_bf?.toFixed(1) ?? '—'} bpm</span>
                      </div>
                    </>
                  )}
                  {hrvResults?.baseline && (
                    <>
                      <Separator className="bg-zinc-800 my-1" />
                      <p className="text-[9px] text-zinc-500 uppercase">Baseline</p>
                      <div className="flex justify-between">
                        <span>Baseline BF ({hrvResults.baseline.baseline_bf_range})</span>
                        <span className="text-zinc-300">{hrvResults.baseline.baseline_bf?.toFixed(1) ?? '—'} bpm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Baseline ln(RMSSD₇₀) ({hrvResults.baseline.baseline_hrv_range})</span>
                        <span className="text-cyan-400">{hrvResults.baseline.baseline_ln_rmssd70?.toFixed(3) ?? '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
