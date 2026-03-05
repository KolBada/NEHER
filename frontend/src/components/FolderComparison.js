import { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, 
  AlertCircle, Zap, Activity, ChevronRight, Info
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import api, { downloadBlob } from '../api';

// Helper component for inline info tooltips
function InfoTip({ text, children }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help whitespace-nowrap">
            {children}
            <Info className="w-3 h-3 text-white/70 hover:text-white flex-shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-900 border-zinc-700 text-xs px-2 py-1 max-w-xs text-white">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function FolderComparison({ folder, onBack, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [spontNormExpanded, setSpontNormExpanded] = useState(false);
  const [lightNormExpanded, setLightNormExpanded] = useState(false);

  useEffect(() => {
    loadComparisonData();
  }, [folder.id]);

  const loadComparisonData = async () => {
    setLoading(true);
    try {
      const { data } = await api.getFolderComparison(folder.id);
      setComparisonData(data);
    } catch (err) {
      toast.error('Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!comparisonData) return;
    setExporting(true);
    try {
      const { data } = await api.exportFolderComparisonXlsx(folder.id, {
        folder_id: folder.id,
        folder_name: folder.name,
        comparison_data: comparisonData,
      });
      downloadBlob(data, `${folder.name.replace(/\s+/g, '_')}_comparison.xlsx`);
      toast.success('Excel export downloaded');
    } catch (err) {
      toast.error('Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!comparisonData) return;
    setExporting(true);
    try {
      const { data } = await api.exportFolderComparisonPdf(folder.id, {
        folder_id: folder.id,
        folder_name: folder.name,
        comparison_data: comparisonData,
      });
      downloadBlob(data, `${folder.name.replace(/\s+/g, '_')}_comparison.pdf`);
      toast.success('PDF export downloaded');
    } catch (err) {
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const formatValue = (val, decimals = 2) => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') {
      if (decimals === 0) return val.toFixed(0);
      if (decimals === 1) return val.toFixed(1);
      if (decimals === 3) return val.toFixed(3);
      if (decimals === 4) return val.toFixed(4);
      return val.toFixed(decimals);
    }
    return val || '—';
  };

  // Compute cohort baseline averages for normalization
  const cohortBaselines = useMemo(() => {
    if (!comparisonData?.recordings) return null;
    const recs = comparisonData.recordings;
    
    // Helper to compute mean ignoring null/undefined
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      avg_baseline_bf: mean(recs.map(r => r.baseline_bf)),
      avg_baseline_ln_rmssd: mean(recs.map(r => r.baseline_ln_rmssd70)),
      avg_baseline_ln_sdnn: mean(recs.map(r => r.baseline_ln_sdnn70)),
      avg_baseline_pnn50: mean(recs.map(r => r.baseline_pnn50)),
    };
  }, [comparisonData]);

  // Compute normalized spontaneous activity values
  const normalizedSpontaneous = useMemo(() => {
    if (!comparisonData?.recordings || !cohortBaselines) return [];
    const recs = comparisonData.recordings;
    const cb = cohortBaselines;
    
    // Normalize helper: 100 * value / baseline_avg
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    return recs.map(rec => ({
      name: rec.name,
      norm_baseline_bf: normalize(rec.baseline_bf, cb.avg_baseline_bf),
      norm_baseline_ln_rmssd: normalize(rec.baseline_ln_rmssd70, cb.avg_baseline_ln_rmssd),
      norm_baseline_ln_sdnn: normalize(rec.baseline_ln_sdnn70, cb.avg_baseline_ln_sdnn),
      norm_baseline_pnn50: normalize(rec.baseline_pnn50, cb.avg_baseline_pnn50),
      norm_drug_bf: normalize(rec.drug_bf, cb.avg_baseline_bf),
      norm_drug_ln_rmssd: normalize(rec.drug_ln_rmssd70, cb.avg_baseline_ln_rmssd),
      norm_drug_ln_sdnn: normalize(rec.drug_ln_sdnn70, cb.avg_baseline_ln_sdnn),
      norm_drug_pnn50: normalize(rec.drug_pnn50, cb.avg_baseline_pnn50),
    }));
  }, [comparisonData, cohortBaselines]);

  // Compute normalized spontaneous folder averages
  const normalizedSpontAverages = useMemo(() => {
    if (!normalizedSpontaneous.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    return {
      norm_baseline_bf: mean(normalizedSpontaneous.map(r => r.norm_baseline_bf)),
      norm_baseline_ln_rmssd: mean(normalizedSpontaneous.map(r => r.norm_baseline_ln_rmssd)),
      norm_baseline_ln_sdnn: mean(normalizedSpontaneous.map(r => r.norm_baseline_ln_sdnn)),
      norm_baseline_pnn50: mean(normalizedSpontaneous.map(r => r.norm_baseline_pnn50)),
      norm_drug_bf: mean(normalizedSpontaneous.map(r => r.norm_drug_bf)),
      norm_drug_ln_rmssd: mean(normalizedSpontaneous.map(r => r.norm_drug_ln_rmssd)),
      norm_drug_ln_sdnn: mean(normalizedSpontaneous.map(r => r.norm_drug_ln_sdnn)),
      norm_drug_pnn50: mean(normalizedSpontaneous.map(r => r.norm_drug_pnn50)),
    };
  }, [normalizedSpontaneous]);

  // Compute normalized light HRA values (using same cohort baseline BF)
  const normalizedLightHRA = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const recs = comparisonData.recordings;
    
    // Calculate the average of light_baseline_bf values for Light HRA normalization
    const lightBaselineBFs = recs
      .map(r => r.light_baseline_bf)
      .filter(v => v !== null && v !== undefined);
    const avgLightBaselineBF = lightBaselineBFs.length > 0 
      ? lightBaselineBFs.reduce((a, b) => a + b, 0) / lightBaselineBFs.length 
      : null;
    
    const normalize = (val) => {
      if (val === null || val === undefined || avgLightBaselineBF === null || avgLightBaselineBF === 0) return null;
      return 100 * val / avgLightBaselineBF;
    };
    
    return recs.map(rec => ({
      name: rec.name,
      norm_baseline_bf: normalize(rec.light_baseline_bf),
      norm_avg_bf: normalize(rec.light_avg_bf),
      norm_peak_bf: normalize(rec.light_peak_bf),
      norm_recovery_bf: normalize(rec.light_recovery_bf),
    }));
  }, [comparisonData]);

  // Compute normalized light HRA folder averages
  const normalizedLightHRAAverages = useMemo(() => {
    if (!normalizedLightHRA.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    return {
      norm_baseline_bf: mean(normalizedLightHRA.map(r => r.norm_baseline_bf)),
      norm_avg_bf: mean(normalizedLightHRA.map(r => r.norm_avg_bf)),
      norm_peak_bf: mean(normalizedLightHRA.map(r => r.norm_peak_bf)),
      norm_recovery_bf: mean(normalizedLightHRA.map(r => r.norm_recovery_bf)),
    };
  }, [normalizedLightHRA]);

  // Sort recordings alphabetically by name
  const sortedRecordings = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    return [...comparisonData.recordings].sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData]);

  // Sort normalized spontaneous data alphabetically
  const sortedNormalizedSpontaneous = useMemo(() => {
    return [...normalizedSpontaneous].sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedSpontaneous]);

  // Sort normalized light HRA data alphabetically
  const sortedNormalizedLightHRA = useMemo(() => {
    return [...normalizedLightHRA].sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedLightHRA]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const { summary, recordings, spontaneous_averages, light_hra_averages, light_hrv_averages } = comparisonData || {};

  return (
    <div className={embedded ? "p-2" : "p-6 max-w-7xl mx-auto"} data-testid="folder-comparison">
      {/* Header - only show when not embedded */}
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={onBack}
              data-testid="back-to-folder-btn"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h2 className="text-lg font-medium text-zinc-100">Comparison: {folder.name}</h2>
              <p className="text-xs text-zinc-500">{summary?.recording_count || 0} recordings</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXlsx}
              disabled={exporting || !recordings?.length}
              className="h-8 text-xs border-zinc-700"
              data-testid="export-xlsx-btn"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={exporting || !recordings?.length}
              className="h-8 text-xs border-zinc-700"
              data-testid="export-pdf-btn"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              PDF
            </Button>
          </div>
        </div>
      )}

      {/* Export buttons for embedded mode - smaller and inline */}
      {embedded && (
        <div className="flex items-center justify-end gap-2 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            disabled={exporting || !recordings?.length}
            className="h-7 text-xs border-zinc-700"
            data-testid="export-xlsx-btn"
          >
            <FileSpreadsheet className="w-3 h-3 mr-1" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting || !recordings?.length}
            className="h-7 text-xs border-zinc-700"
            data-testid="export-pdf-btn"
          >
            <FileText className="w-3 h-3 mr-1" />
            PDF
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 tracking-wider mb-1">RECORDINGS</p>
            <p className="text-2xl font-semibold text-zinc-100">{summary?.recording_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 tracking-wider mb-1">
              <InfoTip text="human Spinal Organoids">hSpOs</InfoTip> AGE RANGE
            </p>
            <p className="text-lg font-semibold text-zinc-100">
              {summary?.hspo_age_range?.min !== null 
                ? `${summary.hspo_age_range.min} - ${summary.hspo_age_range.max} days`
                : '—'}
            </p>
            <p className="text-[10px] text-zinc-500">n = {summary?.hspo_age_range?.n || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 tracking-wider mb-1">
              <InfoTip text="human Cardiac Organoids">hCOs</InfoTip> AGE RANGE
            </p>
            <p className="text-lg font-semibold text-zinc-100">
              {summary?.hco_age_range?.min !== null 
                ? `${summary.hco_age_range.min} - ${summary.hco_age_range.max} days`
                : '—'}
            </p>
            <p className="text-[10px] text-zinc-500">n = {summary?.hco_age_range?.n || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 tracking-wider mb-1">FUSION AGE RANGE</p>
            <p className="text-lg font-semibold text-zinc-100">
              {summary?.fusion_age_range?.min !== null 
                ? `${summary.fusion_age_range.min} - ${summary.fusion_age_range.max} days`
                : '—'}
            </p>
            <p className="text-[10px] text-zinc-500">n = {summary?.fusion_age_range?.n || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="spontaneous" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-sm mb-4">
          <TabsTrigger value="spontaneous" className="text-xs data-[state=active]:bg-zinc-800 rounded-sm">
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            Spontaneous Activity
          </TabsTrigger>
          <TabsTrigger value="light-stimulus" className="text-xs data-[state=active]:bg-zinc-800 rounded-sm">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Light Stimulus
          </TabsTrigger>
          <TabsTrigger value="metadata" className="text-xs data-[state=active]:bg-zinc-800 rounded-sm">
            Metadata
          </TabsTrigger>
        </TabsList>

        {/* Spontaneous Activity Tab */}
        <TabsContent value="spontaneous">
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Spontaneous Activity Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                      <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30 whitespace-nowrap">
                        <InfoTip text="Mean Beat Frequency during minute 1-2 of recording (without drug or stimuli)">Baseline BF</InfoTip>
                      </th>
                      <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30 whitespace-nowrap">
                        <InfoTip text="Root Mean Square of Successive Differences (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline ln(RMSSD<sub>70</sub>)</span></InfoTip>
                      </th>
                      <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30 whitespace-nowrap">
                        <InfoTip text="Standard Deviation of NN intervals (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline ln(SDNN<sub>70</sub>)</span></InfoTip>
                      </th>
                      <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30 whitespace-nowrap">
                        <InfoTip text="% of successive NN > 50ms (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline pNN50<sub>70</sub></span></InfoTip>
                      </th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap">Drug BF</th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">Drug ln(RMSSD<sub>70</sub>)</span></th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">Drug ln(SDNN<sub>70</sub>)</span></th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">Drug pNN50<sub>70</sub></span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecordings?.map((rec, idx) => (
                      <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_bf, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_ln_rmssd70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_ln_sdnn70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_pnn50, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_bf, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_ln_rmssd70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_ln_sdnn70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_pnn50, 1)}</td>
                      </tr>
                    ))}
                    {/* Average Row */}
                    <tr className="bg-purple-950/60 font-bold border-t-2 border-purple-500">
                      <td className="py-3 px-2 text-purple-300 text-xs">Folder Average (n={sortedRecordings?.length || 0})</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.baseline_bf, 1)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.baseline_ln_rmssd70, 3)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.baseline_ln_sdnn70, 3)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.baseline_pnn50, 1)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.drug_bf, 1)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.drug_ln_rmssd70, 3)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.drug_ln_sdnn70, 3)}</td>
                      <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(spontaneous_averages?.averages?.drug_pnn50, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Expandable Normalized Section - Inside Card */}
              <div className="mt-4 pt-3 border-t border-zinc-800/50">
                <button
                  onClick={() => setSpontNormExpanded(!spontNormExpanded)}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                  data-testid="expand-spont-norm"
                >
                  <ChevronRight 
                    className={`w-4 h-4 transition-transform duration-200 ${spontNormExpanded ? 'rotate-90' : ''}`}
                  />
                  <span className="font-medium">Normalized to Baseline</span>
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    spontNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                          <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline BF (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline ln(RMSSD) (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline ln(SDNN) (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline pNN50 (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug BF (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug ln(RMSSD) (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug ln(SDNN) (%)</th>
                          <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug pNN50 (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedNormalizedSpontaneous.map((rec, idx) => (
                          <tr key={idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline_bf, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline_ln_rmssd, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline_ln_sdnn, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline_pnn50, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug_bf, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug_ln_rmssd, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug_ln_sdnn, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug_pnn50, 1)}</td>
                          </tr>
                        ))}
                        {/* Folder Average Row */}
                        <tr className="bg-purple-950/60 font-bold border-t-2 border-purple-500">
                          <td className="py-3 px-2 text-purple-300 text-xs">Folder Average (n={sortedNormalizedSpontaneous.length})</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_baseline_bf, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_baseline_ln_rmssd, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_baseline_ln_sdnn, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_baseline_pnn50, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_drug_bf, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_drug_ln_rmssd, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_drug_ln_sdnn, 1)}</td>
                          <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(normalizedSpontAverages?.norm_drug_pnn50, 1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Light Stimulus Tab - Combined HRA and Corrected HRV */}
        <TabsContent value="light-stimulus">
          <div className="space-y-4">
            {/* HRA Table */}
            <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-300">Light-Induced Heart Rate Adaptation (HRA)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Mean Beat Frequency from -2 to -1 min before first light stimulation">Baseline BF</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Average Beat Frequency during light stimulation">Avg BF</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Maximum Beat Frequency reached during light stimulation">Peak BF</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Normalized Peak: 100 × Peak/Baseline">Peak %</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Time To Peak (1st stim)">TTP 1st</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Time To Peak (average)">TTP Avg</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Beat Frequency at the end of the stimulation period, before the drop">Rec. BF</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Recovery %: 100 × Recovery/Baseline">Rec. %</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Amplitude: Peak BF − Recovery BF">Amp.</InfoTip>
                        </th>
                        <th className="text-center py-2 px-1 font-medium text-amber-400 bg-amber-950/30">
                          <InfoTip text="Slope of BF during stimulation, normalized by mean BF">RoC</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => (
                        <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_baseline_bf, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_avg_bf, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_bf, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_norm, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_first, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_avg, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_bf, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_pct, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_amplitude, 1)}</td>
                          <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_roc, 4)}</td>
                        </tr>
                      ))}
                      {/* Average Row */}
                      <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                        <td className="py-3 px-2 text-amber-300 text-xs">Folder Average (n={sortedRecordings?.length || 0})</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_baseline_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_avg_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_peak_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_peak_norm, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_ttp_first, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_ttp_avg, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_recovery_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_recovery_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_amplitude, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(light_hra_averages?.averages?.light_roc, 4)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Expandable Normalized Section - Inside Card */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setLightNormExpanded(!lightNormExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-light-norm"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${lightNormExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Normalized to Baseline</span>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      lightNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Baseline BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Avg BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Peak BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Recovery BF (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedNormalizedLightHRA.map((rec, idx) => (
                            <tr key={idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                              <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                              <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_baseline_bf, 1)}</td>
                              <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_avg_bf, 1)}</td>
                              <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_peak_bf, 1)}</td>
                              <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_recovery_bf, 1)}</td>
                            </tr>
                          ))}
                          {/* Folder Average Row */}
                          <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                            <td className="py-3 px-2 text-amber-300 text-xs">Folder Average (n={sortedNormalizedLightHRA.length})</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_baseline_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_avg_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_peak_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_recovery_bf, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Corrected HRV Table */}
            <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-300">Corrected Light-Induced Heart Rate Variability (HRV)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-3 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">ln(RMSSD<sub>70</sub>) corr.</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">ln(SDNN<sub>70</sub>) corr.</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">pNN50<sub>70</sub> corr. (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => (
                        <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="py-2 px-3 text-zinc-300 font-medium">{rec.name}</td>
                          <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_rmssd70, 3)}</td>
                          <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_sdnn70, 3)}</td>
                          <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_pnn50, 1)}</td>
                        </tr>
                      ))}
                      {/* Average Row */}
                      <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                        <td className="py-3 px-3 text-amber-300 text-xs">Folder Average (n={sortedRecordings?.length || 0})</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(light_hrv_averages?.averages?.light_hrv_ln_rmssd70, 3)}</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(light_hrv_averages?.averages?.light_hrv_ln_sdnn70, 3)}</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(light_hrv_averages?.averages?.light_hrv_pnn50, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata">
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Recording Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Recording</th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Date</th>
                      <th className="text-left py-2 px-1.5 font-medium text-emerald-400 bg-emerald-950/30 whitespace-nowrap">
                        <InfoTip text="human Spinal Organoids">hSpO Info</InfoTip>
                      </th>
                      <th className="text-left py-2 px-1.5 font-medium text-emerald-400 bg-emerald-950/30 whitespace-nowrap">
                        <InfoTip text="human Cardiac Organoids">hCO Info</InfoTip>
                      </th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Fusion</th>
                      <th className="text-left py-2 px-1.5 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap">Drug Info</th>
                      <th className="text-left py-2 px-1.5 font-medium text-amber-400 bg-amber-950/30 whitespace-nowrap">
                        Light Stim Info
                      </th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecordings?.map((rec, idx) => {
                      // Format hSpO info
                      const hspoInfo = rec.hspo_info;
                      const hspoDisplay = hspoInfo ? (
                        <div className="text-[10px] leading-tight">
                          <div>{hspoInfo.line_name || '—'}</div>
                          {hspoInfo.passage && <div className="text-zinc-500">P{hspoInfo.passage}</div>}
                          {hspoInfo.age !== null && <div className="text-zinc-500">D{hspoInfo.age}</div>}
                          {hspoInfo.has_transduction && <div className="text-green-400">Transduced</div>}
                        </div>
                      ) : '—';
                      
                      // Format hCO info
                      const hcoInfo = rec.hco_info;
                      const hcoDisplay = hcoInfo ? (
                        <div className="text-[10px] leading-tight">
                          <div>{hcoInfo.line_name || '—'}</div>
                          {hcoInfo.passage && <div className="text-zinc-500">P{hcoInfo.passage}</div>}
                          {hcoInfo.age !== null && <div className="text-zinc-500">D{hcoInfo.age}</div>}
                        </div>
                      ) : '—';
                      
                      // Format drug info
                      const drugDisplay = rec.has_drug && rec.drug_info?.length > 0 ? (
                        <div className="text-[10px] leading-tight">
                          {rec.drug_info.map((drug, i) => (
                            <div key={i} className="mb-1">
                              <div className="font-medium">{drug.name}</div>
                              {drug.concentration && <div className="text-zinc-500">{drug.concentration}µM</div>}
                              {(rec.drug_hrv_readout_minute !== null && rec.drug_hrv_readout_minute !== undefined ? true : drug.bf_readout_time !== null && drug.bf_readout_time !== undefined) && <div className="text-zinc-500">Perf. Time: {rec.drug_hrv_readout_minute !== null && rec.drug_hrv_readout_minute !== undefined ? rec.drug_hrv_readout_minute : drug.bf_readout_time}min</div>}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-zinc-500">No drug</span>;
                      
                      // Format light stim info
                      const lightDisplay = rec.has_light_stim ? (
                        <div className="text-[10px] leading-tight">
                          {rec.light_stim_count && <div>{rec.light_stim_count} stim</div>}
                          <div className="text-zinc-500">{rec.stim_duration}s</div>
                          {rec.isi_structure && (
                            <div className="text-zinc-500">
                              <InfoTip text="Inter-Stimuli Interval">ISI</InfoTip>: {rec.isi_structure}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-zinc-500">No Light Stim</span>;
                      
                      return (
                        <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 align-top">
                          <td className="py-2 px-1.5">
                            <div className="text-zinc-300 font-medium">{rec.name}</div>
                            <div className="text-[10px] text-zinc-500">{rec.filename}</div>
                          </td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.recording_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-emerald-950/5">{hspoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-emerald-950/5">{hcoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.fusion_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-purple-950/5">{drugDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-amber-950/5">{lightDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-400 text-[10px] max-w-[150px] truncate">{rec.recording_description || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
