import { Loader2, FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function ExportPanel({
  metrics, hrvResults, lightHrv, lightResponse,
  onExportCsv, onExportXlsx, onExportPdf,
  loading
}) {
  const hasData = !!metrics;
  const hasHrv = !!hrvResults?.windows?.length;
  const hasLight = !!lightHrv || !!lightResponse;

  return (
    <div className="space-y-4" data-testid="export-panel">
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium" style={{ fontFamily: 'Manrope' }}>
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            Export analysis results including per-beat data, HRV windows, and light metrics.
          </p>

          {/* Available data summary */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Available Data</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className={`p-2 rounded-sm border ${hasData ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Per-Beat</p>
                <p className={`text-xs font-data ${hasData ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasData ? `${metrics.n_total} beats` : 'No data'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasHrv ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">HRV Windows</p>
                <p className={`text-xs font-data ${hasHrv ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasHrv ? `${hrvResults.windows.length} windows` : 'Not computed'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasLight ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Light Metrics</p>
                <p className={`text-xs font-data ${hasLight ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasLight ? 'Available' : 'Not computed'}
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
                  {hasHrv && hrvResults.readout && (
                    <>
                      <Separator className="bg-zinc-800 my-1" />
                      <div className="flex justify-between">
                        <span>ln(RMSSD70) readout</span>
                        <span className="text-cyan-400">{hrvResults.readout.ln_rmssd70?.toFixed(3) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SDNN readout</span>
                        <span className="text-purple-400">{hrvResults.readout.sdnn?.toFixed(3) ?? '—'}</span>
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
