import React from 'react';
import { Loader2, FileSpreadsheet, FileText, FileDown, Info, Activity, TrendingUp, Clock, Zap, FlaskConical, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function MEAExportPanel({
  wellAnalysis,
  meaData,
  selectedWell,
  recordingName,
  recordingDate,
  organoidInfo,
  fusionDate,
  recordingDescription,
  drugEnabled,
  selectedDrugs,
  drugSettings,
  drugPerfTime,
  drugReadoutMinute,
  lightEnabled,
  lightParams,
  lightPulses,
  baselineEnabled,
  baselineMinute,
  wellParams,
  config,
  getAnalysisState,
}) {
  const [loading, setLoading] = React.useState(false);
  const [exportType, setExportType] = React.useState(null);

  // Computed data availability
  const hasData = !!wellAnalysis && wellAnalysis.spikeRateBins?.length > 0;
  const spikeCount = wellAnalysis?.well?.spikes?.length || 0;
  const burstCount = wellAnalysis?.well?.electrode_bursts?.length || wellAnalysis?.well?.bursts?.length || 0;
  const spikeBinCount = wellAnalysis?.spikeRateBins?.length || 0;
  const burstBinCount = wellAnalysis?.burstRateBins?.length || 0;
  const perMinuteCount = wellAnalysis?.perMinuteCombined?.length || 0;
  const hasBaseline = baselineEnabled && (wellAnalysis?.baselineSpikeHz !== null || wellAnalysis?.baselineBurstBpm !== null);
  const hasDrugMetrics = drugEnabled && selectedDrugs?.length > 0 && (wellAnalysis?.drugSpikeHz !== null || wellAnalysis?.drugBurstBpm !== null);
  const hasLightMetrics = lightEnabled && lightPulses?.length > 0;

  // Source files
  const sourceFiles = meaData?.source_files || {};
  const sourceFileNames = Object.values(sourceFiles);

  // Binning settings
  const spikeBinS = wellParams?.[selectedWell]?.spikeBinS || config?.spike_bin_sec || 10;
  const burstBinS = wellParams?.[selectedWell]?.burstBinS || config?.burst_bin_sec || 60;

  // Export handlers
  const handleExportCsv = async () => {
    setLoading(true);
    setExportType('csv');
    try {
      const analysisState = getAnalysisState();
      const response = await fetch(`${API}/api/mea/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_state: analysisState,
          well_analysis: wellAnalysis,
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recordingName || 'MEA_Export'}_${selectedWell}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('CSV export error:', error);
    } finally {
      setLoading(false);
      setExportType(null);
    }
  };

  const handleExportXlsx = async () => {
    setLoading(true);
    setExportType('xlsx');
    try {
      const analysisState = getAnalysisState();
      const response = await fetch(`${API}/api/mea/export/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_state: analysisState,
          well_analysis: wellAnalysis,
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recordingName || 'MEA_Export'}_${selectedWell}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Excel export error:', error);
    } finally {
      setLoading(false);
      setExportType(null);
    }
  };

  const handleExportPdf = async () => {
    setLoading(true);
    setExportType('pdf');
    try {
      const analysisState = getAnalysisState();
      const response = await fetch(`${API}/api/mea/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_state: analysisState,
          well_analysis: wellAnalysis,
        }),
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recordingName || 'MEA_Report'}_${selectedWell}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('PDF export error:', error);
    } finally {
      setLoading(false);
      setExportType(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="mea-export-panel">
      {/* Recording Info Strip */}
      <div className="glass-surface-subtle rounded-xl py-3 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Recording Name:</span>
            <Badge variant="outline" className="font-data text-[10px]" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--text-secondary)' }}>
              {recordingName || 'Untitled'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Well:</span>
            <Badge variant="outline" className="font-data text-[10px] font-mono" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>
              {selectedWell || 'N/A'}
            </Badge>
          </div>
        </div>
        {/* Original CSV Files */}
        {sourceFileNames.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Original CSV Files:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {sourceFileNames.map((filename, idx) => (
                <Badge key={idx} variant="outline" className="font-data text-[9px]" style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)' }}>
                  {filename}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="glass-surface-subtle rounded-xl">
        <div className="p-4 pb-2">
          <span className="text-sm" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-primary)' }}>
            Export Results
          </span>
        </div>
        <div className="p-4 pt-2 space-y-4">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Export MEA analysis results including per-spike/burst data, per-bin data, per-minute metrics, baseline metrics, drug metrics, and light stimulation data.
          </p>

          {/* Available Data Cards */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-tertiary)' }}>Available Data</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Per Spike / Burst */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasData ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasData ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Per Spike / Burst</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-data" style={{ color: '#10b981' }}>{spikeCount.toLocaleString()} spikes</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>|</span>
                  <span className="text-[10px] font-data" style={{ color: '#f97316' }}>{burstCount.toLocaleString()} bursts</span>
                </div>
              </div>

              {/* Per Bin */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: spikeBinCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: spikeBinCount > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Per Bin</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-data" style={{ color: '#10b981' }}>{spikeBinCount} spike bins</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>|</span>
                  <span className="text-[10px] font-data" style={{ color: '#f97316' }}>{burstBinCount} burst bins</span>
                </div>
              </div>

              {/* Per Minute */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: perMinuteCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: perMinuteCount > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Per Minute</p>
                <p className="text-[10px] font-data mt-1" style={{ color: perMinuteCount > 0 ? '#10b981' : 'var(--text-tertiary)' }}>
                  {perMinuteCount > 0 ? `${perMinuteCount} rows` : 'Not available'}
                </p>
              </div>

              {/* Baseline Metrics */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasBaseline ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasBaseline ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Baseline Metrics</p>
                <p className="text-[10px] font-data mt-1" style={{ color: hasBaseline ? '#22d3ee' : 'var(--text-tertiary)' }}>
                  {hasBaseline ? 'Available' : 'Not available'}
                </p>
              </div>

              {/* Drug Metrics */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasDrugMetrics ? 'rgba(217, 70, 239, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasDrugMetrics ? '1px solid rgba(217, 70, 239, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Drug Metrics</p>
                <p className="text-[10px] font-data mt-1" style={{ color: hasDrugMetrics ? '#d946ef' : 'var(--text-tertiary)' }}>
                  {hasDrugMetrics ? 'Available' : 'Not available'}
                </p>
              </div>

              {/* Light Metrics */}
              <div 
                className="p-2 rounded-lg"
                style={{ 
                  background: hasLightMetrics ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.02)',
                  border: hasLightMetrics ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.08)'
                }}
              >
                <p className="text-xs font-data font-medium" style={{ color: 'var(--text-secondary)' }}>Light Metrics</p>
                <p className="text-[10px] font-data mt-1" style={{ color: hasLightMetrics ? '#f59e0b' : 'var(--text-tertiary)' }}>
                  {hasLightMetrics ? `${lightPulses.length} stims` : 'Not available'}
                </p>
              </div>
            </div>
          </div>

          <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* Export Format Descriptions */}
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
                  Multiple CSV files (zipped). Summary, spontaneous spike/burst, light spike/burst tables. Good for importing into other software.
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
                  Multi-sheet workbook with formatted tables. Includes: Summary, Spontaneous Spike, Spontaneous Burst, Light Spike, Light Burst sheets.
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
                  Professional report with graphs. Spike evolution, Burst evolution, spontaneous tables, light tables. Print-ready.
                </p>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
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
              onClick={handleExportCsv}
              disabled={!hasData || loading}
            >
              {loading && exportType === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
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
              onClick={handleExportXlsx}
              disabled={!hasData || loading}
            >
              {loading && exportType === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
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
              onClick={handleExportPdf}
              disabled={!hasData || loading}
            >
              {loading && exportType === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Export PDF Report
            </Button>
          </div>

          {/* Summary Preview */}
          {hasData && (
            <>
              <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="space-y-2 mt-6">
                <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-tertiary)' }}>Summary Preview</p>
                <div 
                  className="rounded-lg p-3 font-data text-xs space-y-1"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}
                >
                  {/* Recording Info */}
                  {recordingName && (
                    <div className="flex justify-between">
                      <span>Recording Name</span>
                      <span style={{ color: 'white' }}>{recordingName}</span>
                    </div>
                  )}
                  {sourceFileNames.length > 0 && (
                    <div className="py-1">
                      <span>Original Files</span>
                      <div className="mt-1 space-y-0.5">
                        {sourceFileNames.map((f, i) => (
                          <div key={i} className="text-[10px] pl-2" style={{ color: 'var(--text-tertiary)' }}>• {f}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {recordingDate && (
                    <div className="flex justify-between">
                      <span>Recording Date</span>
                      <span style={{ color: 'var(--text-primary)' }}>{recordingDate}</span>
                    </div>
                  )}
                  <Separator style={{ background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
                  
                  {/* Spike/Burst Stats */}
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Spikes Detected
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex">
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                            <p>Total number of spikes detected across all active electrodes.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span style={{ color: '#10b981' }}>{spikeCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      Bursts Detected
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="inline-flex">
                              <Info className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-help" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white z-50">
                            <p>Total number of bursts detected across all active electrodes.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                    <span style={{ color: '#f97316' }}>{burstCount.toLocaleString()}</span>
                  </div>
                  
                  <Separator style={{ background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
                  
                  {/* Electrode Filter */}
                  <div className="flex justify-between">
                    <span>Active Electrodes</span>
                    <span style={{ color: 'var(--text-primary)' }}>{wellAnalysis?.well?.active_electrodes?.length || 0}</span>
                  </div>
                  
                  {/* Binning Settings */}
                  <div className="flex justify-between">
                    <span>Spike Bin Size</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{spikeBinS}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Burst Bin Size</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{burstBinS}s</span>
                  </div>
                  
                  {/* Removed: Baseline, Drug, Light sections per user request */}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
