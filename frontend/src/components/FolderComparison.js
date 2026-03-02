import { useState, useEffect } from 'react';
import { 
  ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, 
  AlertCircle, BarChart3, Zap, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import api, { downloadBlob } from '../api';

export default function FolderComparison({ folder, onBack }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const { summary, recordings, spontaneous_averages, light_hra_averages, light_hrv_averages } = comparisonData || {};

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="folder-comparison">
      {/* Header */}
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
            <h2 className="text-lg font-medium text-zinc-100">{folder.name} - Comparison</h2>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Recordings</p>
            <p className="text-2xl font-semibold text-zinc-100">{summary?.recording_count || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-800 rounded-sm">
          <CardContent className="p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">hSpOs Age Range</p>
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
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">hCOs Age Range</p>
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
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Fusion Age Range</p>
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
              <ScrollArea className="max-h-[500px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                      <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Baseline BF</th>
                      <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Baseline ln(RMSSD)</th>
                      <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Baseline ln(SDNN)</th>
                      <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Baseline pNN50</th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug BF</th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug ln(RMSSD)</th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug ln(SDNN)</th>
                      <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">Drug pNN50</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings?.map((rec, idx) => (
                      <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.baseline_bf, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.baseline_ln_rmssd70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.baseline_ln_sdnn70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.baseline_pnn50, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_bf, 1)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_ln_rmssd70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_ln_sdnn70, 3)}</td>
                        <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_pnn50, 1)}</td>
                      </tr>
                    ))}
                    {/* Average Row */}
                    <tr className="bg-zinc-800/50 font-semibold">
                      <td className="py-2 px-2 text-zinc-200">Folder Average (n={recordings?.length || 0})</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.baseline_bf, 1)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.baseline_ln_rmssd70, 3)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.baseline_ln_sdnn70, 3)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.baseline_pnn50, 1)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.drug_bf, 1)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.drug_ln_rmssd70, 3)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.drug_ln_sdnn70, 3)}</td>
                      <td className="py-2 px-2 text-center text-zinc-200">{formatValue(spontaneous_averages?.averages?.drug_pnn50, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Light HRA Tab */}
        <TabsContent value="light-hra">
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Light-Induced Heart Rate Adaptation</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Baseline BF</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Avg BF</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Peak BF</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Norm. Peak</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">TTP 1st</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">TTP Avg</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Rec. BF</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Rec. %</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">Amp.</th>
                      <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">RoC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings?.map((rec, idx) => (
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
                    <tr className="bg-zinc-800/50 font-semibold">
                      <td className="py-2 px-2 text-zinc-200">Folder Average (n={recordings?.length || 0})</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_baseline_bf, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_avg_bf, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_peak_bf, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_peak_norm, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_ttp_first, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_ttp_avg, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_recovery_bf, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_recovery_pct, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_amplitude, 1)}</td>
                      <td className="py-2 px-1 text-center text-zinc-200">{formatValue(light_hra_averages?.averages?.light_roc, 4)}</td>
                    </tr>
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Corrected Light HRV Tab */}
        <TabsContent value="light-hrv">
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Corrected Light-Induced HRV (Detrended)</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-3 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                      <th className="text-center py-2 px-3 font-medium text-cyan-400 bg-cyan-950/30">ln(RMSSD70) corr.</th>
                      <th className="text-center py-2 px-3 font-medium text-cyan-400 bg-cyan-950/30">ln(SDNN70) corr.</th>
                      <th className="text-center py-2 px-3 font-medium text-cyan-400 bg-cyan-950/30">pNN50 corr. (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings?.map((rec, idx) => (
                      <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-3 text-zinc-300 font-medium">{rec.name}</td>
                        <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_rmssd70, 3)}</td>
                        <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_sdnn70, 3)}</td>
                        <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_pnn50, 1)}</td>
                      </tr>
                    ))}
                    {/* Average Row */}
                    <tr className="bg-zinc-800/50 font-semibold">
                      <td className="py-2 px-3 text-zinc-200">Folder Average (n={recordings?.length || 0})</td>
                      <td className="py-2 px-3 text-center text-zinc-200">{formatValue(light_hrv_averages?.averages?.light_hrv_ln_rmssd70, 3)}</td>
                      <td className="py-2 px-3 text-center text-zinc-200">{formatValue(light_hrv_averages?.averages?.light_hrv_ln_sdnn70, 3)}</td>
                      <td className="py-2 px-3 text-center text-zinc-200">{formatValue(light_hrv_averages?.averages?.light_hrv_pnn50, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata">
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300">Recording Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[600px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Recording</th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Date</th>
                      <th className="text-left py-2 px-1.5 font-medium text-amber-400 bg-amber-950/30 whitespace-nowrap">hSpO Info</th>
                      <th className="text-left py-2 px-1.5 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap">hCO Info</th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Fusion</th>
                      <th className="text-left py-2 px-1.5 font-medium text-green-400 bg-green-950/30 whitespace-nowrap">Drug Info</th>
                      <th className="text-left py-2 px-1.5 font-medium text-cyan-400 bg-cyan-950/30 whitespace-nowrap">Light Stim Info</th>
                      <th className="text-left py-2 px-1.5 font-medium text-zinc-400 bg-zinc-900/50 whitespace-nowrap">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordings?.map((rec, idx) => {
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
                              {drug.concentration && <div className="text-zinc-500">{drug.concentration}</div>}
                              {drug.perfusion_time && <div className="text-zinc-500">{drug.perfusion_time} min</div>}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-zinc-500">No drug</span>;
                      
                      // Format light stim info
                      const lightDisplay = rec.has_light_stim ? (
                        <div className="text-[10px] leading-tight">
                          <div>{rec.stim_duration}s stim</div>
                          {rec.isi_structure && <div className="text-zinc-500">ISI: {rec.isi_structure}</div>}
                        </div>
                      ) : <span className="text-zinc-500">No Light Stim</span>;
                      
                      return (
                        <tr key={rec.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 align-top">
                          <td className="py-2 px-1.5">
                            <div className="text-zinc-300 font-medium">{rec.name}</div>
                            <div className="text-[10px] text-zinc-500">{rec.filename}</div>
                          </td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.recording_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-amber-950/5">{hspoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-purple-950/5">{hcoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.fusion_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-green-950/5">{drugDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-cyan-950/5">{lightDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-400 text-[10px] max-w-[150px] truncate">{rec.recording_description || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
