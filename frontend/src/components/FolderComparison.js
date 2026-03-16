import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, Download, FileSpreadsheet, FileText, Loader2, 
  AlertCircle, Zap, Activity, ChevronRight, Info
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
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

// Toggle button component for recording inclusion/exclusion
function RecordingToggle({ isExcluded, onToggle, testId }) {
  return (
    <button
      onClick={onToggle}
      className={`w-6 h-5 rounded text-[9px] font-medium transition-all ${
        isExcluded 
          ? 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600' 
          : 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/40'
      }`}
      data-testid={testId}
    >
      {isExcluded ? 'OFF' : 'ON'}
    </button>
  );
}

export default function FolderComparison({ folder, onBack, embedded = false }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [spontNormExpanded, setSpontNormExpanded] = useState({});  // Object keyed by drug key
  const [lightNormExpanded, setLightNormExpanded] = useState(false);
  const [hraPerMetricExpanded, setHraPerMetricExpanded] = useState(false);  // Per Metrics for HRA
  const [hrvPerMetricExpanded, setHrvPerMetricExpanded] = useState(false);  // Per Metrics for HRV
  // Selected metrics for Per Metrics sections
  const [selectedHraMetrics, setSelectedHraMetrics] = useState({});  // { metricKey: true }
  const [selectedHrvMetrics, setSelectedHrvMetrics] = useState({});  // { metricKey: true }
  // Global excluded recordings - applies to ALL tables and exports
  const [excludedRecordings, setExcludedRecordings] = useState({});  // { recordingId: true }
  
  // Y-axis zoom state for Per Metrics charts
  const [hraYAxisZoom, setHraYAxisZoom] = useState({});  // { metricKey: { min, max } }
  const [hrvYAxisZoom, setHrvYAxisZoom] = useState({});  // { metricKey: { min, max } }
  
  // Source type switcher state (SSE vs MEA)
  const [sourceType, setSourceType] = useState(null); // null = auto-detect, 'SSE' or 'MEA'
  const [typeCounts, setTypeCounts] = useState({ sse: 0, mea: 0 });
  
  // MEA-specific expanded states
  const [meaSpikeNormExpanded, setMeaSpikeNormExpanded] = useState(false);
  const [meaBurstNormExpanded, setMeaBurstNormExpanded] = useState(false);
  const [meaLightSpikeNormExpanded, setMeaLightSpikeNormExpanded] = useState(false);
  const [meaLightBurstNormExpanded, setMeaLightBurstNormExpanded] = useState(false);
  const [meaSpikePerMetricExpanded, setMeaSpikePerMetricExpanded] = useState(false);
  const [meaBurstPerMetricExpanded, setMeaBurstPerMetricExpanded] = useState(false);
  const [selectedMeaSpikeMetrics, setSelectedMeaSpikeMetrics] = useState({});
  const [selectedMeaBurstMetrics, setSelectedMeaBurstMetrics] = useState({});
  const [meaSpikeYAxisZoom, setMeaSpikeYAxisZoom] = useState({});
  const [meaBurstYAxisZoom, setMeaBurstYAxisZoom] = useState({});
  
  // Toggle a recording's inclusion/exclusion (global)
  const toggleRecording = useCallback((recordingId) => {
    setExcludedRecordings(prev => ({
      ...prev,
      [recordingId]: !prev[recordingId]
    }));
  }, []);

  useEffect(() => {
    loadComparisonData(sourceType);
  }, [folder.id, sourceType]);

  const loadComparisonData = async (requestedType) => {
    setLoading(true);
    try {
      const { data } = await api.getFolderComparison(folder.id, requestedType);
      setComparisonData(data);
      setTypeCounts(data.type_counts || { sse: 0, mea: 0 });
      // Auto-set sourceType if not set
      if (!requestedType && !sourceType) {
        setSourceType(data.source_type);
      }
    } catch (err) {
      toast.error('Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle source type switch
  const handleSourceTypeSwitch = (newType) => {
    if (newType !== sourceType) {
      setSourceType(newType);
      setExcludedRecordings({}); // Reset exclusions when switching types
    }
  };

  const handleExportXlsx = async () => {
    if (!comparisonData) return;
    setExporting(true);
    try {
      // Get list of excluded recording IDs
      const excludedIds = Object.keys(excludedRecordings).filter(id => excludedRecordings[id]);
      const { data } = await api.exportFolderComparisonXlsx(folder.id, {
        folder_id: folder.id,
        folder_name: folder.name,
        comparison_data: comparisonData,
        excluded_recording_ids: excludedIds,
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
      // Get list of excluded recording IDs
      const excludedIds = Object.keys(excludedRecordings).filter(id => excludedRecordings[id]);
      const { data } = await api.exportFolderComparisonPdf(folder.id, {
        folder_id: folder.id,
        folder_name: folder.name,
        comparison_data: comparisonData,
        excluded_recording_ids: excludedIds,
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

  // Compute cohort baseline averages for normalization (excluding excluded recordings)
  const cohortBaselines = useMemo(() => {
    if (!comparisonData?.recordings) return null;
    // Filter out excluded recordings
    const recs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    
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
  }, [comparisonData, excludedRecordings]);

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

  // Get unique drugs across all recordings for multi-drug tables
  const uniqueDrugs = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const drugMap = new Map();
    comparisonData.recordings.forEach(rec => {
      if (rec.per_drug_metrics && Array.isArray(rec.per_drug_metrics)) {
        rec.per_drug_metrics.forEach(dm => {
          if (dm.drug_key && !drugMap.has(dm.drug_key)) {
            drugMap.set(dm.drug_key, dm.drug_name || dm.drug_key);
          }
        });
      }
      // Also check drug_info for drug names
      if (rec.drug_info && Array.isArray(rec.drug_info)) {
        rec.drug_info.forEach(d => {
          const key = d.name?.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
          if (key && !drugMap.has(key)) {
            drugMap.set(key, d.name);
          }
        });
      }
    });
    return Array.from(drugMap.entries()).map(([key, name]) => ({ key, name }));
  }, [comparisonData]);

  // Helper to get drug metrics for a specific drug from a recording
  const getDrugMetrics = useCallback((rec, drugKey, uniqueDrugsList) => {
    if (rec.per_drug_metrics && Array.isArray(rec.per_drug_metrics)) {
      const found = rec.per_drug_metrics.find(dm => dm.drug_key === drugKey);
      if (found) return found;
    }
    // Fallback to default drug metrics if this is the first drug
    if (uniqueDrugsList.length > 0 && uniqueDrugsList[0].key === drugKey) {
      return {
        drug_bf: rec.drug_bf,
        drug_ln_rmssd70: rec.drug_ln_rmssd70,
        drug_ln_sdnn70: rec.drug_ln_sdnn70,
        drug_pnn50: rec.drug_pnn50,
      };
    }
    return null;
  }, []);

  // Compute per-drug averages (respecting exclusions)
  const perDrugAverages = useMemo(() => {
    if (!comparisonData?.recordings || !uniqueDrugs.length) return {};
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    // Filter out excluded recordings
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    
    const result = {};
    uniqueDrugs.forEach(drug => {
      const metricsForDrug = includedRecs.map(rec => getDrugMetrics(rec, drug.key, uniqueDrugs)).filter(Boolean);
      result[drug.key] = {
        avg_bf: mean(metricsForDrug.map(m => m.drug_bf)),
        avg_ln_rmssd70: mean(metricsForDrug.map(m => m.drug_ln_rmssd70)),
        avg_ln_sdnn70: mean(metricsForDrug.map(m => m.drug_ln_sdnn70)),
        avg_pnn50: mean(metricsForDrug.map(m => m.drug_pnn50)),
      };
    });
    return result;
  }, [comparisonData, uniqueDrugs, getDrugMetrics, excludedRecordings]);

  // Compute per-drug normalized spontaneous activity values
  const perDrugNormalized = useMemo(() => {
    if (!comparisonData?.recordings || !cohortBaselines) return {};
    const recs = comparisonData.recordings;
    const cb = cohortBaselines;
    
    // Normalize helper: 100 * value / baseline_avg
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    // Use uniqueDrugs if available, otherwise use a default
    const drugsToProcess = uniqueDrugs.length > 0 ? uniqueDrugs : [{ key: 'default', name: 'Drug' }];
    
    const result = {};
    drugsToProcess.forEach(drug => {
      // Compute normalized values for this drug
      const normalizedData = recs.map(rec => {
        const drugMetrics = getDrugMetrics(rec, drug.key, uniqueDrugs);
        return {
          id: rec.id,
          name: rec.name,
          norm_baseline_bf: normalize(rec.baseline_bf, cb.avg_baseline_bf),
          norm_baseline_ln_rmssd: normalize(rec.baseline_ln_rmssd70, cb.avg_baseline_ln_rmssd),
          norm_baseline_ln_sdnn: normalize(rec.baseline_ln_sdnn70, cb.avg_baseline_ln_sdnn),
          norm_baseline_pnn50: normalize(rec.baseline_pnn50, cb.avg_baseline_pnn50),
          norm_drug_bf: drugMetrics ? normalize(drugMetrics.drug_bf, cb.avg_baseline_bf) : null,
          norm_drug_ln_rmssd: drugMetrics ? normalize(drugMetrics.drug_ln_rmssd70, cb.avg_baseline_ln_rmssd) : null,
          norm_drug_ln_sdnn: drugMetrics ? normalize(drugMetrics.drug_ln_sdnn70, cb.avg_baseline_ln_sdnn) : null,
          norm_drug_pnn50: drugMetrics ? normalize(drugMetrics.drug_pnn50, cb.avg_baseline_pnn50) : null,
        };
      });
      
      // Sort alphabetically
      const sorted = [...normalizedData].sort((a, b) => a.name.localeCompare(b.name));
      
      result[drug.key] = { data: sorted };
    });
    return result;
  }, [comparisonData, cohortBaselines, uniqueDrugs, getDrugMetrics]);

  // Compute per-drug normalized averages (respecting global exclusions)
  const perDrugNormalizedAverages = useMemo(() => {
    if (!perDrugNormalized) return {};
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    // Use uniqueDrugs if available, otherwise use a default
    const drugsToProcess = uniqueDrugs.length > 0 ? uniqueDrugs : [{ key: 'default', name: 'Drug' }];
    
    const result = {};
    drugsToProcess.forEach(drug => {
      const drugData = perDrugNormalized[drug.key]?.data || [];
      
      // Filter out excluded recordings using global exclusion state
      const includedData = drugData.filter(r => !excludedRecordings[r.id]);
      
      result[drug.key] = {
        averages: {
          norm_baseline_bf: mean(includedData.map(r => r.norm_baseline_bf)),
          norm_baseline_ln_rmssd: mean(includedData.map(r => r.norm_baseline_ln_rmssd)),
          norm_baseline_ln_sdnn: mean(includedData.map(r => r.norm_baseline_ln_sdnn)),
          norm_baseline_pnn50: mean(includedData.map(r => r.norm_baseline_pnn50)),
          norm_drug_bf: mean(includedData.map(r => r.norm_drug_bf)),
          norm_drug_ln_rmssd: mean(includedData.map(r => r.norm_drug_ln_rmssd)),
          norm_drug_ln_sdnn: mean(includedData.map(r => r.norm_drug_ln_sdnn)),
          norm_drug_pnn50: mean(includedData.map(r => r.norm_drug_pnn50)),
        },
        includedCount: includedData.length,
      };
    });
    return result;
  }, [perDrugNormalized, uniqueDrugs, excludedRecordings]);

  // Compute normalized light HRA values (using cohort baseline BF from included recordings)
  const normalizedLightHRA = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const recs = comparisonData.recordings;
    
    // Calculate the average of light_baseline_bf values for Light HRA normalization (from included recordings only)
    const includedRecs = recs.filter(r => !excludedRecordings[r.id]);
    const lightBaselineBFs = includedRecs
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
      id: rec.id,
      name: rec.name,
      norm_baseline_bf: normalize(rec.light_baseline_bf),
      norm_avg_bf: normalize(rec.light_avg_bf),
      norm_peak_bf: normalize(rec.light_peak_bf),
      norm_recovery_bf: normalize(rec.light_recovery_bf),
    }));
  }, [comparisonData, excludedRecordings]);

  // Compute normalized light HRA averages (respecting global exclusions)
  const normalizedLightHRAAverages = useMemo(() => {
    if (!normalizedLightHRA.length) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    // Filter out excluded recordings using global exclusion state
    const includedData = normalizedLightHRA.filter(r => !excludedRecordings[r.id]);
    
    return {
      norm_baseline_bf: mean(includedData.map(r => r.norm_baseline_bf)),
      norm_avg_bf: mean(includedData.map(r => r.norm_avg_bf)),
      norm_peak_bf: mean(includedData.map(r => r.norm_peak_bf)),
      norm_recovery_bf: mean(includedData.map(r => r.norm_recovery_bf)),
      includedCount: includedData.length,
    };
  }, [normalizedLightHRA, excludedRecordings]);

  // Sort recordings alphabetically by name (all recordings for display)
  const sortedRecordings = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    return [...comparisonData.recordings].sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData]);

  // Get included recordings count
  const includedRecordingsCount = useMemo(() => {
    if (!comparisonData?.recordings) return 0;
    return comparisonData.recordings.filter(r => !excludedRecordings[r.id]).length;
  }, [comparisonData, excludedRecordings]);

  // Compute spontaneous averages for included recordings only
  const computedSpontaneousAverages = useMemo(() => {
    if (!comparisonData?.recordings) return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      baseline_bf: mean(includedRecs.map(r => r.baseline_bf)),
      baseline_ln_rmssd70: mean(includedRecs.map(r => r.baseline_ln_rmssd70)),
      baseline_ln_sdnn70: mean(includedRecs.map(r => r.baseline_ln_sdnn70)),
      baseline_pnn50: mean(includedRecs.map(r => r.baseline_pnn50)),
      drug_bf: mean(includedRecs.map(r => r.drug_bf)),
      drug_ln_rmssd70: mean(includedRecs.map(r => r.drug_ln_rmssd70)),
      drug_ln_sdnn70: mean(includedRecs.map(r => r.drug_ln_sdnn70)),
      drug_pnn50: mean(includedRecs.map(r => r.drug_pnn50)),
    };
  }, [comparisonData, excludedRecordings]);

  // Compute light HRA averages for included recordings only
  const computedLightHRAAverages = useMemo(() => {
    if (!comparisonData?.recordings) return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    // Compute light_avg_norm on-the-fly for recordings that don't have it
    const getAvgNorm = (rec) => {
      if (rec.light_avg_norm != null) return rec.light_avg_norm;
      const baseline = rec.light_baseline_bf;
      const avgBf = rec.light_avg_bf;
      return (baseline && baseline > 0 && avgBf != null) ? (100 * avgBf / baseline) : null;
    };
    
    // Compute light_dec_norm on-the-fly for recordings that don't have it (use Peak BF as denominator)
    const getDecNorm = (rec) => {
      if (rec.light_dec_norm != null) return rec.light_dec_norm;
      // Fall back to old amp_norm if it exists (for backward compatibility)
      if (rec.light_amp_norm != null) {
        // Recompute with new formula using Peak BF
        const peakBf = rec.light_peak_bf;
        const amplitude = rec.light_amplitude;
        return (peakBf && peakBf > 0 && amplitude != null) ? (100 * amplitude / peakBf) : null;
      }
      const peakBf = rec.light_peak_bf;
      const amplitude = rec.light_amplitude;
      return (peakBf && peakBf > 0 && amplitude != null) ? (100 * amplitude / peakBf) : null;
    };
    
    return {
      light_baseline_bf: mean(includedRecs.map(r => r.light_baseline_bf)),
      light_avg_bf: mean(includedRecs.map(r => r.light_avg_bf)),
      light_avg_norm: mean(includedRecs.map(r => getAvgNorm(r))),
      light_peak_bf: mean(includedRecs.map(r => r.light_peak_bf)),
      light_peak_norm: mean(includedRecs.map(r => r.light_peak_norm)),
      light_ttp_first: mean(includedRecs.map(r => r.light_ttp_first)),
      light_ttp_avg: mean(includedRecs.map(r => r.light_ttp_avg)),
      light_recovery_bf: mean(includedRecs.map(r => r.light_recovery_bf)),
      light_recovery_pct: mean(includedRecs.map(r => r.light_recovery_pct)),
      light_amplitude: mean(includedRecs.map(r => r.light_amplitude)),
      light_dec_norm: mean(includedRecs.map(r => getDecNorm(r))),
      light_roc: mean(includedRecs.map(r => r.light_roc)),
    };
  }, [comparisonData, excludedRecordings]);

  // Compute light HRV averages for included recordings only
  const computedLightHRVAverages = useMemo(() => {
    if (!comparisonData?.recordings) return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      light_hrv_ln_rmssd70: mean(includedRecs.map(r => r.light_hrv_ln_rmssd70)),
      light_hrv_ln_sdnn70: mean(includedRecs.map(r => r.light_hrv_ln_sdnn70)),
      light_hrv_pnn50: mean(includedRecs.map(r => r.light_hrv_pnn50)),
    };
  }, [comparisonData, excludedRecordings]);

  // HRA metric definitions for Per Metrics tables (with Y-axis scale config and tooltips)
  // Removed Baseline BF as per user request
  const hraMetricDefs = useMemo(() => [
    { key: 'avg_bf', label: 'Avg BF', decimals: 1, showBaseline: true, yDomain: null, tooltip: 'Average Beat Frequency during the stimulation period' },
    { key: 'avg_norm_pct', label: 'Avg %', decimals: 1, yDomain: [0, 200], showBaselinePct: true, tooltip: 'Normalized Average: 100 × Avg BF / Baseline BF' },
    { key: 'peak_bf', label: 'Peak BF', decimals: 1, showBaseline: true, yDomain: null, tooltip: 'Maximum Beat Frequency reached during stimulation' },
    { key: 'peak_norm', label: 'Peak %', decimals: 1, yDomain: [0, 200], showBaselinePct: true, tooltip: 'Normalized Peak: 100 × Peak BF / Baseline BF' },
    { key: 'ttp', label: 'TTP', decimals: 1, yDomain: [0, 30], tooltip: 'Time To Peak: Time in seconds from stimulation start to peak BF' },
    { key: 'recovery_bf', label: 'Rec. BF', decimals: 1, showBaseline: true, yDomain: null, tooltip: 'Beat Frequency at the end of the stimulation period, before the drop' },
    { key: 'recovery_pct', label: 'Rec. %', decimals: 1, yDomain: [0, 200], showBaselinePct: true, tooltip: 'Recovery %: 100 × Recovery BF / Baseline BF' },
    { key: 'amplitude', label: 'Amp.', decimals: 1, yDomain: null, tooltip: 'Amplitude: Peak BF − Recovery BF' },
    { key: 'dec_norm_pct', label: 'Dec. %', decimals: 1, yDomain: [0, 100], showBaselinePct: false, tooltip: 'Decrease %: 100 × Amplitude / Peak BF' },
    { key: 'roc', label: 'RoC', decimals: 4, yDomain: [-2, 2], tooltip: 'Rate of Change: Slope of BF during stimulation, normalized by mean BF' },
  ], []);

  // HRV metric definitions for Per Metrics tables (with Y-axis scale config and tooltips)
  const hrvMetricDefs = useMemo(() => [
    { key: 'ln_rmssd70', label: 'ln(RMSSD₇₀) corr.', decimals: 3, yDomain: [0, 8], tooltip: 'Natural log of RMSSD at 70 beats, corrected for beat count' },
    { key: 'ln_sdnn70', label: 'ln(SDNN₇₀) corr.', decimals: 3, yDomain: [0, 8], tooltip: 'Natural log of SDNN at 70 beats, corrected for beat count' },
    { key: 'pnn50', label: 'pNN50₇₀ corr. (%)', decimals: 1, yDomain: [0, 100], tooltip: 'Percentage of successive NN intervals differing by more than 50ms' },
  ], []);

  // Compute per-metric HRA data (for each metric: rows=recordings, cols=stim1-5 + avg)
  const perMetricHRAData = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    const maxStims = 5;
    
    // First, compute baseline BF data for reference in other metrics
    const baselineBFData = allRecs.map(rec => {
      const perStim = rec.per_stim_hra || [];
      const stimValues = [];
      for (let i = 0; i < maxStims; i++) {
        const stim = perStim[i];
        stimValues.push(stim ? stim.baseline_bf : null);
      }
      return {
        id: rec.id,
        name: rec.name,
        isExcluded: excludedRecordings[rec.id] || false,
        stimValues,
        rowAvg: mean(stimValues),
      };
    });
    const includedBaselineRecs = baselineBFData.filter(r => !r.isExcluded);
    const baselineColAvgs = [];
    for (let i = 0; i < maxStims; i++) {
      baselineColAvgs.push(mean(includedBaselineRecs.map(r => r.stimValues[i])));
    }
    const baselineGrandAvg = mean(includedBaselineRecs.map(r => r.rowAvg));
    
    return hraMetricDefs.map(metric => {
      // Build per-recording data for this metric
      const recordingData = allRecs.map(rec => {
        const perStim = rec.per_stim_hra || [];
        const stimValues = [];
        for (let i = 0; i < maxStims; i++) {
          const stim = perStim[i];
          if (stim) {
            // Compute avg_norm_pct on-the-fly if missing
            if (metric.key === 'avg_norm_pct' && stim.avg_norm_pct == null) {
              const baseline = stim.baseline_bf;
              const avgBf = stim.avg_bf;
              stimValues.push((baseline && baseline > 0 && avgBf != null) ? (100 * avgBf / baseline) : null);
            // Compute dec_norm_pct on-the-fly if missing (use Peak BF as denominator)
            } else if (metric.key === 'dec_norm_pct' && stim.dec_norm_pct == null) {
              const peakBf = stim.peak_bf;
              const amplitude = stim.amplitude;
              stimValues.push((peakBf && peakBf > 0 && amplitude != null) ? (100 * amplitude / peakBf) : null);
            } else {
              stimValues.push(stim[metric.key]);
            }
          } else {
            stimValues.push(null);
          }
        }
        // Calculate row average (across stims)
        const rowAvg = mean(stimValues);
        return {
          id: rec.id,
          name: rec.name,
          isExcluded: excludedRecordings[rec.id] || false,
          stimValues,
          rowAvg,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      // Calculate column averages (folder average per stim)
      const includedRecs = recordingData.filter(r => !r.isExcluded);
      const colAvgs = [];
      for (let i = 0; i < maxStims; i++) {
        colAvgs.push(mean(includedRecs.map(r => r.stimValues[i])));
      }
      const grandAvg = mean(includedRecs.map(r => r.rowAvg));
      
      // Stim Average = average of all column averages (average across 5 stims)
      const stimAvg = mean(colAvgs);
      
      // Build chart data for visualization
      const chartData = [];
      for (let i = 0; i < maxStims; i++) {
        // Order keys: perStimAvg first, baseline second (if shown), stimAvg LAST
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimAvg: colAvgs[i],
          // Add baseline BF for metrics that show it (Avg BF, Peak BF, Rec. BF)
          ...(metric.showBaseline ? { baseline: baselineColAvgs[i] } : {}),
          // Add 100% baseline for percentage metrics (Peak %, Rec. %)
          ...(metric.showBaselinePct ? { baselinePct: 100 } : {}),
          // stimAvg LAST to appear last in legend
          stimAvg: stimAvg,
        };
        includedRecs.forEach(rec => {
          dataPoint[rec.name] = rec.stimValues[i];
        });
        chartData.push(dataPoint);
      }
      // Add average column to chart (last point)
      chartData.push({
        stim: 'Avg',
        perStimAvg: grandAvg,
        ...(metric.showBaseline ? { baseline: baselineGrandAvg } : {}),
        ...(metric.showBaselinePct ? { baselinePct: 100 } : {}),
        // stimAvg LAST
        stimAvg: stimAvg,
        ...Object.fromEntries(includedRecs.map(rec => [rec.name, rec.rowAvg]))
      });
      
      return {
        ...metric,
        recordings: recordingData,
        colAvgs,
        grandAvg,
        stimAvg,
        includedCount: includedRecs.length,
        chartData,
      };
    });
  }, [comparisonData, excludedRecordings, hraMetricDefs]);

  // Compute per-metric HRV data (for each metric: rows=recordings, cols=stim1-5 + median)
  const perMetricHRVData = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const median = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b);
      if (valid.length === 0) return null;
      const mid = Math.floor(valid.length / 2);
      return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
    };
    
    const maxStims = 5;
    
    return hrvMetricDefs.map(metric => {
      // Build per-recording data for this metric
      const recordingData = allRecs.map(rec => {
        const perStim = rec.per_stim_hrv || [];
        const stimValues = [];
        for (let i = 0; i < maxStims; i++) {
          const stim = perStim[i];
          stimValues.push(stim ? stim[metric.key] : null);
        }
        // Calculate row median (across stims)
        const rowMedian = median(stimValues);
        return {
          id: rec.id,
          name: rec.name,
          isExcluded: excludedRecordings[rec.id] || false,
          stimValues,
          rowMedian,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      // Calculate column medians (folder median per stim)
      const includedRecs = recordingData.filter(r => !r.isExcluded);
      const colMedians = [];
      for (let i = 0; i < maxStims; i++) {
        colMedians.push(median(includedRecs.map(r => r.stimValues[i])));
      }
      const grandMedian = median(includedRecs.map(r => r.rowMedian));
      
      // Stim Median = median of all column medians (median across 5 stims)
      const stimMedian = median(colMedians);
      
      // Build chart data for visualization
      const chartData = [];
      for (let i = 0; i < maxStims; i++) {
        // Order keys: perStimMedian first, stimMedian LAST for legend order
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimMedian: colMedians[i],
        };
        includedRecs.forEach(rec => {
          dataPoint[rec.name] = rec.stimValues[i];
        });
        // stimMedian LAST
        dataPoint.stimMedian = stimMedian;
        chartData.push(dataPoint);
      }
      // Add median column to chart
      chartData.push({
        stim: 'Median',
        perStimMedian: grandMedian,
        ...Object.fromEntries(includedRecs.map(rec => [rec.name, rec.rowMedian])),
        // stimMedian LAST
        stimMedian: stimMedian,
      });
      
      return {
        ...metric,
        recordings: recordingData,
        colMedians,
        grandMedian,
        stimMedian,
        includedCount: includedRecs.length,
        chartData,
      };
    });
  }, [comparisonData, excludedRecordings, hrvMetricDefs]);

  // Sort normalized spontaneous data alphabetically
  const sortedNormalizedSpontaneous = useMemo(() => {
    return [...normalizedSpontaneous].sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedSpontaneous]);

  // Sort normalized light HRA data alphabetically
  const sortedNormalizedLightHRA = useMemo(() => {
    return [...normalizedLightHRA].sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedLightHRA]);

  // =========================================================================
  // MEA-SPECIFIC COMPUTED VALUES
  // =========================================================================
  
  // MEA Spike metric definitions for Per Metrics tables
  const meaSpikeMetricDefs = useMemo(() => [
    { key: 'avg', label: 'Avg Spike', decimals: 3, unit: 'Hz', showBaseline: true, yDomain: null, tooltip: 'Average spike rate during light stimulation' },
    { key: 'max', label: 'Max Spike', decimals: 3, unit: 'Hz', showBaseline: true, yDomain: null, tooltip: 'Maximum spike rate during light stimulation' },
    { key: 'change_pct', label: 'Spike Δ%', decimals: 1, unit: '%', yDomain: [-100, 200], showBaselinePct: true, tooltip: 'Percent change: 100 × (Avg - Baseline) / Baseline' },
    { key: 'peak_change_pct', label: 'Peak Spike Δ%', decimals: 1, unit: '%', yDomain: [-100, 200], showBaselinePct: true, tooltip: 'Percent change at peak: 100 × (Max - Baseline) / Baseline' },
    { key: 'time_to_peak', label: 'Time to Peak', decimals: 1, unit: 's', yDomain: [0, 30], tooltip: 'Time from stim start to max spike rate' },
  ], []);
  
  // MEA Burst metric definitions for Per Metrics tables
  const meaBurstMetricDefs = useMemo(() => [
    { key: 'avg', label: 'Avg Burst', decimals: 3, unit: 'bpm', showBaseline: true, yDomain: null, tooltip: 'Average burst rate during light stimulation' },
    { key: 'max', label: 'Max Burst', decimals: 3, unit: 'bpm', showBaseline: true, yDomain: null, tooltip: 'Maximum burst rate during light stimulation' },
    { key: 'change_pct', label: 'Burst Δ%', decimals: 1, unit: '%', yDomain: [-100, 200], showBaselinePct: true, tooltip: 'Percent change: 100 × (Avg - Baseline) / Baseline' },
    { key: 'peak_change_pct', label: 'Peak Burst Δ%', decimals: 1, unit: '%', yDomain: [-100, 200], showBaselinePct: true, tooltip: 'Percent change at peak: 100 × (Max - Baseline) / Baseline' },
    { key: 'time_to_peak', label: 'Time to Peak', decimals: 1, unit: 's', yDomain: [0, 30], tooltip: 'Time from stim start to max burst rate' },
  ], []);

  // MEA cohort baselines (for normalization)
  const meaCohortBaselines = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return null;
    const recs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      avg_baseline_spike_hz: mean(recs.map(r => r.baseline_spike_hz)),
      avg_baseline_burst_bpm: mean(recs.map(r => r.baseline_burst_bpm)),
      avg_light_baseline_spike_hz: mean(recs.map(r => r.light_baseline_spike_hz)),
      avg_light_baseline_burst_bpm: mean(recs.map(r => r.light_baseline_burst_bpm)),
    };
  }, [comparisonData, excludedRecordings, sourceType]);

  // MEA normalized spontaneous values (spike)
  const meaNormalizedSpontSpikeData = useMemo(() => {
    if (!comparisonData?.recordings || !meaCohortBaselines || sourceType !== 'MEA') return [];
    const recs = comparisonData.recordings;
    const cb = meaCohortBaselines;
    
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    return recs.map(rec => ({
      id: rec.id,
      name: rec.name,
      norm_baseline: normalize(rec.baseline_spike_hz, cb.avg_baseline_spike_hz),
      norm_drug: normalize(rec.drug_spike_hz, cb.avg_baseline_spike_hz),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData, meaCohortBaselines, sourceType]);

  // MEA normalized spontaneous values (burst)
  const meaNormalizedSpontBurstData = useMemo(() => {
    if (!comparisonData?.recordings || !meaCohortBaselines || sourceType !== 'MEA') return [];
    const recs = comparisonData.recordings;
    const cb = meaCohortBaselines;
    
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    return recs.map(rec => ({
      id: rec.id,
      name: rec.name,
      norm_baseline: normalize(rec.baseline_burst_bpm, cb.avg_baseline_burst_bpm),
      norm_drug: normalize(rec.drug_burst_bpm, cb.avg_baseline_burst_bpm),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData, meaCohortBaselines, sourceType]);

  // MEA normalized light values (spike)
  const meaNormalizedLightSpikeData = useMemo(() => {
    if (!comparisonData?.recordings || !meaCohortBaselines || sourceType !== 'MEA') return [];
    const recs = comparisonData.recordings;
    const cb = meaCohortBaselines;
    
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    return recs.map(rec => ({
      id: rec.id,
      name: rec.name,
      norm_baseline: normalize(rec.light_baseline_spike_hz, cb.avg_light_baseline_spike_hz),
      norm_avg: normalize(rec.light_avg_spike_hz, cb.avg_light_baseline_spike_hz),
      norm_max: normalize(rec.light_max_spike_hz, cb.avg_light_baseline_spike_hz),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData, meaCohortBaselines, sourceType]);

  // MEA normalized light values (burst)
  const meaNormalizedLightBurstData = useMemo(() => {
    if (!comparisonData?.recordings || !meaCohortBaselines || sourceType !== 'MEA') return [];
    const recs = comparisonData.recordings;
    const cb = meaCohortBaselines;
    
    const normalize = (val, baseAvg) => {
      if (val === null || val === undefined || baseAvg === null || baseAvg === 0) return null;
      return 100 * val / baseAvg;
    };
    
    return recs.map(rec => ({
      id: rec.id,
      name: rec.name,
      norm_baseline: normalize(rec.light_baseline_burst_bpm, cb.avg_light_baseline_burst_bpm),
      norm_avg: normalize(rec.light_avg_burst_bpm, cb.avg_light_baseline_burst_bpm),
      norm_max: normalize(rec.light_max_burst_bpm, cb.avg_light_baseline_burst_bpm),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [comparisonData, meaCohortBaselines, sourceType]);

  // MEA spontaneous spike averages (for included recordings)
  const meaSpontSpikeAverages = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      baseline_spike_hz: mean(includedRecs.map(r => r.baseline_spike_hz)),
      drug_spike_hz: mean(includedRecs.map(r => r.drug_spike_hz)),
    };
  }, [comparisonData, excludedRecordings, sourceType]);

  // MEA spontaneous burst averages (for included recordings)
  const meaSpontBurstAverages = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      baseline_burst_bpm: mean(includedRecs.map(r => r.baseline_burst_bpm)),
      drug_burst_bpm: mean(includedRecs.map(r => r.drug_burst_bpm)),
    };
  }, [comparisonData, excludedRecordings, sourceType]);

  // MEA light spike averages (for included recordings)
  const meaLightSpikeAverages = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      light_baseline_spike_hz: mean(includedRecs.map(r => r.light_baseline_spike_hz)),
      light_avg_spike_hz: mean(includedRecs.map(r => r.light_avg_spike_hz)),
      light_max_spike_hz: mean(includedRecs.map(r => r.light_max_spike_hz)),
      light_spike_change_pct: mean(includedRecs.map(r => r.light_spike_change_pct)),
      light_peak_spike_change_pct: mean(includedRecs.map(r => r.light_peak_spike_change_pct)),
      light_spike_time_to_peak: mean(includedRecs.map(r => r.light_spike_time_to_peak)),
    };
  }, [comparisonData, excludedRecordings, sourceType]);

  // MEA light burst averages (for included recordings)
  const meaLightBurstAverages = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return null;
    const includedRecs = comparisonData.recordings.filter(r => !excludedRecordings[r.id]);
    if (includedRecs.length === 0) return null;
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    return {
      light_baseline_burst_bpm: mean(includedRecs.map(r => r.light_baseline_burst_bpm)),
      light_avg_burst_bpm: mean(includedRecs.map(r => r.light_avg_burst_bpm)),
      light_max_burst_bpm: mean(includedRecs.map(r => r.light_max_burst_bpm)),
      light_burst_change_pct: mean(includedRecs.map(r => r.light_burst_change_pct)),
      light_peak_burst_change_pct: mean(includedRecs.map(r => r.light_peak_burst_change_pct)),
      light_burst_time_to_peak: mean(includedRecs.map(r => r.light_burst_time_to_peak)),
    };
  }, [comparisonData, excludedRecordings, sourceType]);

  // MEA per-metric spike data (for Per Metrics charts)
  const meaPerMetricSpikeData = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    const maxStims = 5;
    
    return meaSpikeMetricDefs.map(metric => {
      const recordingData = allRecs.map(rec => {
        const perStim = rec.per_stim_spike || [];
        const stimValues = [];
        for (let i = 0; i < maxStims; i++) {
          const stim = perStim[i];
          stimValues.push(stim ? stim[metric.key] : null);
        }
        const rowAvg = mean(stimValues);
        return {
          id: rec.id,
          name: rec.name,
          isExcluded: excludedRecordings[rec.id] || false,
          stimValues,
          rowAvg,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      const includedRecs = recordingData.filter(r => !r.isExcluded);
      const colAvgs = [];
      for (let i = 0; i < maxStims; i++) {
        colAvgs.push(mean(includedRecs.map(r => r.stimValues[i])));
      }
      const grandAvg = mean(includedRecs.map(r => r.rowAvg));
      const stimAvg = mean(colAvgs);
      
      // Build chart data
      const chartData = [];
      for (let i = 0; i < maxStims; i++) {
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimAvg: colAvgs[i],
          stimAvg: stimAvg,
        };
        includedRecs.forEach(rec => {
          dataPoint[rec.name] = rec.stimValues[i];
        });
        chartData.push(dataPoint);
      }
      chartData.push({
        stim: 'Avg',
        perStimAvg: grandAvg,
        stimAvg: stimAvg,
        ...Object.fromEntries(includedRecs.map(rec => [rec.name, rec.rowAvg]))
      });
      
      return {
        ...metric,
        recordings: recordingData,
        colAvgs,
        grandAvg,
        stimAvg,
        includedCount: includedRecs.length,
        chartData,
      };
    });
  }, [comparisonData, excludedRecordings, sourceType, meaSpikeMetricDefs]);

  // MEA per-metric burst data (for Per Metrics charts)
  const meaPerMetricBurstData = useMemo(() => {
    if (!comparisonData?.recordings || sourceType !== 'MEA') return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    const maxStims = 5;
    
    return meaBurstMetricDefs.map(metric => {
      const recordingData = allRecs.map(rec => {
        const perStim = rec.per_stim_burst || [];
        const stimValues = [];
        for (let i = 0; i < maxStims; i++) {
          const stim = perStim[i];
          stimValues.push(stim ? stim[metric.key] : null);
        }
        const rowAvg = mean(stimValues);
        return {
          id: rec.id,
          name: rec.name,
          isExcluded: excludedRecordings[rec.id] || false,
          stimValues,
          rowAvg,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      const includedRecs = recordingData.filter(r => !r.isExcluded);
      const colAvgs = [];
      for (let i = 0; i < maxStims; i++) {
        colAvgs.push(mean(includedRecs.map(r => r.stimValues[i])));
      }
      const grandAvg = mean(includedRecs.map(r => r.rowAvg));
      const stimAvg = mean(colAvgs);
      
      // Build chart data
      const chartData = [];
      for (let i = 0; i < maxStims; i++) {
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimAvg: colAvgs[i],
          stimAvg: stimAvg,
        };
        includedRecs.forEach(rec => {
          dataPoint[rec.name] = rec.stimValues[i];
        });
        chartData.push(dataPoint);
      }
      chartData.push({
        stim: 'Avg',
        perStimAvg: grandAvg,
        stimAvg: stimAvg,
        ...Object.fromEntries(includedRecs.map(rec => [rec.name, rec.rowAvg]))
      });
      
      return {
        ...metric,
        recordings: recordingData,
        colAvgs,
        grandAvg,
        stimAvg,
        includedCount: includedRecs.length,
        chartData,
      };
    });
  }, [comparisonData, excludedRecordings, sourceType, meaBurstMetricDefs]);

  // MEA normalized spontaneous spike averages
  const meaNormSpontSpikeAverages = useMemo(() => {
    if (!meaNormalizedSpontSpikeData.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const includedData = meaNormalizedSpontSpikeData.filter(r => !excludedRecordings[r.id]);
    return {
      norm_baseline: mean(includedData.map(r => r.norm_baseline)),
      norm_drug: mean(includedData.map(r => r.norm_drug)),
      includedCount: includedData.length,
    };
  }, [meaNormalizedSpontSpikeData, excludedRecordings]);

  // MEA normalized spontaneous burst averages
  const meaNormSpontBurstAverages = useMemo(() => {
    if (!meaNormalizedSpontBurstData.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const includedData = meaNormalizedSpontBurstData.filter(r => !excludedRecordings[r.id]);
    return {
      norm_baseline: mean(includedData.map(r => r.norm_baseline)),
      norm_drug: mean(includedData.map(r => r.norm_drug)),
      includedCount: includedData.length,
    };
  }, [meaNormalizedSpontBurstData, excludedRecordings]);

  // MEA normalized light spike averages
  const meaNormLightSpikeAverages = useMemo(() => {
    if (!meaNormalizedLightSpikeData.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const includedData = meaNormalizedLightSpikeData.filter(r => !excludedRecordings[r.id]);
    return {
      norm_baseline: mean(includedData.map(r => r.norm_baseline)),
      norm_avg: mean(includedData.map(r => r.norm_avg)),
      norm_max: mean(includedData.map(r => r.norm_max)),
      includedCount: includedData.length,
    };
  }, [meaNormalizedLightSpikeData, excludedRecordings]);

  // MEA normalized light burst averages
  const meaNormLightBurstAverages = useMemo(() => {
    if (!meaNormalizedLightBurstData.length) return null;
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined);
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const includedData = meaNormalizedLightBurstData.filter(r => !excludedRecordings[r.id]);
    return {
      norm_baseline: mean(includedData.map(r => r.norm_baseline)),
      norm_avg: mean(includedData.map(r => r.norm_avg)),
      norm_max: mean(includedData.map(r => r.norm_max)),
      includedCount: includedData.length,
    };
  }, [meaNormalizedLightBurstData, excludedRecordings]);

  if (loading) {
    return (
      <div className="neher-home-bg min-h-screen">
        <div className="neher-glow-orbs" />
        <div className="relative z-10 flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-teal)' }} />
        </div>
      </div>
    );
  }

  const { summary, recordings, spontaneous_averages, light_hra_averages, light_hrv_averages } = comparisonData || {};

  return (
    <div className={embedded ? "p-2" : "neher-home-bg min-h-screen"} data-testid="folder-comparison">
      {/* Ambient glow orbs - same as home page */}
      {!embedded && <div className="neher-glow-orbs" />}
      
      {/* Content container */}
      <div className={embedded ? "" : "relative z-10 p-6 max-w-7xl mx-auto"}>
        {/* Header - NEHER branding - only show when not embedded */}
        {!embedded && (
          <header className="header-border pb-6 mb-8">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="font-display text-4xl font-semibold text-white tracking-tight">
                  NEHER
                </h1>
              </div>
              <div className="text-right">
                <p className="font-body text-xs tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  by Kolia H. Badarello
                </p>
                <p className="font-body text-sm uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                  Cardiac Electrophysiology Analysis Platform
                </p>
              </div>
            </div>
          </header>
        )}

        {/* Toolbar - only show when not embedded */}
        {!embedded && (
          <div 
            className="glass-surface-subtle p-4 mb-6 rounded-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              borderTopColor: 'rgba(255, 255, 255, 0.16)',
              borderLeftColor: 'rgba(255, 255, 255, 0.12)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-4 rounded-xl transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                  onClick={onBack}
                  data-testid="back-to-folder-btn"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <div>
                  <h2 className="text-lg" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Comparison: {folder.name}</h2>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>{summary?.recording_count || 0} recordings</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportXlsx}
                  disabled={exporting || !recordings?.length}
                  className="h-9 text-xs rounded-xl transition-all"
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#10b981',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.20)';
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                  }}
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
                  className="h-9 text-xs rounded-xl transition-all"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#ef4444',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.20)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
                  }}
                  data-testid="export-pdf-btn"
                >
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  PDF
                </Button>
              </div>
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
            className="h-7 text-xs rounded-lg transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'var(--text-secondary)',
            }}
            data-testid="export-xlsx-btn"
          >
            <FileSpreadsheet className="w-3 h-3 mr-1" style={{ color: '#10b981' }} />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting || !recordings?.length}
            className="h-7 text-xs rounded-lg transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: 'var(--text-secondary)',
            }}
            data-testid="export-pdf-btn"
          >
            <FileText className="w-3 h-3 mr-1" style={{ color: '#ef4444' }} />
            PDF
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div 
          className="p-4 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTopColor: 'rgba(255, 255, 255, 0.14)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <p className="text-[10px] tracking-wider mb-1 uppercase font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.10em', fontFamily: 'var(--font-display)' }}>RECORDINGS</p>
          <p className="text-2xl font-semibold" style={{ color: '#ffffff', fontFamily: 'var(--font-display)' }}>{summary?.recording_count || 0}</p>
        </div>
        <div 
          className="p-4 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTopColor: 'rgba(255, 255, 255, 0.14)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <p className="text-[10px] tracking-wider mb-1 uppercase font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.10em', fontFamily: 'var(--font-display)' }}>
            <InfoTip text="human Spinal Organoids">hSpOs</InfoTip> AGE RANGE
          </p>
          <p className="text-lg font-semibold" style={{ color: '#10b981', fontFamily: 'var(--font-display)' }}>
            {summary?.hspo_age_range?.min !== null 
              ? `${summary.hspo_age_range.min} - ${summary.hspo_age_range.max} days`
              : '—'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>n = {summary?.hspo_age_range?.n || 0}</p>
        </div>
        <div 
          className="p-4 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTopColor: 'rgba(255, 255, 255, 0.14)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <p className="text-[10px] tracking-wider mb-1 uppercase font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.10em', fontFamily: 'var(--font-display)' }}>
            <InfoTip text="human Cardiac Organoids">hCOs</InfoTip> AGE RANGE
          </p>
          <p className="text-lg font-semibold" style={{ color: '#F4CEA2', fontFamily: 'var(--font-display)' }}>
            {summary?.hco_age_range?.min !== null 
              ? `${summary.hco_age_range.min} - ${summary.hco_age_range.max} days`
              : '—'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>n = {summary?.hco_age_range?.n || 0}</p>
        </div>
        <div 
          className="p-4 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTopColor: 'rgba(255, 255, 255, 0.14)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
          }}
        >
          <p className="text-[10px] tracking-wider mb-1 uppercase font-medium" style={{ color: 'var(--text-secondary)', letterSpacing: '0.10em', fontFamily: 'var(--font-display)' }}>FUSION AGE RANGE</p>
          <p className="text-lg font-semibold" style={{ color: '#ffffff', fontFamily: 'var(--font-display)' }}>
            {summary?.fusion_age_range?.min !== null 
              ? `${summary.fusion_age_range.min} - ${summary.fusion_age_range.max} days`
              : '—'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>n = {summary?.fusion_age_range?.n || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="spontaneous" className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList 
            className="h-10 rounded-xl p-1 gap-2"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
              boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
            }}
          >
            <TabsTrigger 
              value="spontaneous" 
              className="text-xs rounded-lg gap-1.5 px-4 transition-all data-[state=inactive]:text-zinc-400 data-[state=inactive]:bg-transparent data-[state=active]:text-white"
              style={{ fontFamily: 'var(--font-body)' }}
              data-state-style="true"
            >
              <Activity className="w-3.5 h-3.5" style={{ color: '#F4CEA2' }} />
              Spontaneous Activity
            </TabsTrigger>
            <TabsTrigger 
              value="light-stimulus" 
              className="text-xs rounded-lg gap-1.5 px-4 transition-all data-[state=inactive]:text-zinc-400 data-[state=inactive]:bg-transparent data-[state=active]:text-white"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <Zap className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
              Light Stimulus
            </TabsTrigger>
            <TabsTrigger 
              value="metadata" 
              className="text-xs rounded-lg gap-1.5 px-4 transition-all data-[state=inactive]:text-zinc-400 data-[state=inactive]:bg-transparent data-[state=active]:text-white"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              Metadata
            </TabsTrigger>
          </TabsList>
          
          {/* SSE/MEA Type Switcher */}
          <div 
            className="flex items-center gap-1 p-1 rounded-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.10)',
            }}
          >
            <button
              onClick={() => handleSourceTypeSwitch('SSE')}
              disabled={typeCounts.sse === 0}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                sourceType === 'SSE' 
                  ? 'text-white' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={{
                background: sourceType === 'SSE' ? 'rgba(244, 206, 162, 0.2)' : 'transparent',
                border: sourceType === 'SSE' ? '1px solid rgba(244, 206, 162, 0.4)' : '1px solid transparent',
                opacity: typeCounts.sse === 0 ? 0.3 : 1,
                cursor: typeCounts.sse === 0 ? 'not-allowed' : 'pointer',
              }}
              data-testid="switch-to-sse"
            >
              SSE ({typeCounts.sse})
            </button>
            <button
              onClick={() => handleSourceTypeSwitch('MEA')}
              disabled={typeCounts.mea === 0}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                sourceType === 'MEA' 
                  ? 'text-white' 
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              style={{
                background: sourceType === 'MEA' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: sourceType === 'MEA' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                opacity: typeCounts.mea === 0 ? 0.3 : 1,
                cursor: typeCounts.mea === 0 ? 'not-allowed' : 'pointer',
              }}
              data-testid="switch-to-mea"
            >
              MEA ({typeCounts.mea})
            </button>
          </div>
        </div>

        {/* ============================================================
            SSE COMPARISON CONTENT
        ============================================================ */}
        {sourceType === 'SSE' && (
          <>
        {/* Spontaneous Activity Tab */}
        <TabsContent value="spontaneous">
          {/* Create a card for each unique drug (or one default if no drugs) */}
          {(uniqueDrugs.length > 0 ? uniqueDrugs : [{ key: 'default', name: 'Drug' }]).map((drug, drugIdx) => (
            <div 
              key={drug.key} 
              className={`rounded-xl ${drugIdx > 0 ? 'mt-4' : ''}`}
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div className="p-4 pb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>Spontaneous Activity Comparison</span>
                  {uniqueDrugs.length > 0 && (
                    <Badge 
                      className="text-[10px] px-2 py-0.5"
                      style={{ background: 'rgba(217, 70, 239, 0.3)', color: '#f0abfc', border: '1px solid rgba(217, 70, 239, 0.5)' }}
                    >
                      {drug.name}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean Beat Frequency during minute 1-2 of recording (without drug or stimuli)">Baseline BF</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Root Mean Square of Successive Differences (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline ln(RMSSD<sub>70</sub>)</span></InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Standard Deviation of NN intervals (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline ln(SDNN<sub>70</sub>)</span></InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="% of successive NN > 50ms (normalized to 70 bpm)"><span className="whitespace-nowrap">Baseline pNN50<sub>70</sub></span></InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>{drug.name} BF</th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}><span className="whitespace-nowrap">{drug.name} ln(RMSSD<sub>70</sub>)</span></th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}><span className="whitespace-nowrap">{drug.name} ln(SDNN<sub>70</sub>)</span></th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}><span className="whitespace-nowrap">{drug.name} pNN50<sub>70</sub></span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        const drugMetrics = uniqueDrugs.length > 0 ? getDrugMetrics(rec, drug.key, uniqueDrugs) : {
                          drug_bf: rec.drug_bf,
                          drug_ln_rmssd70: rec.drug_ln_rmssd70,
                          drug_ln_sdnn70: rec.drug_ln_sdnn70,
                          drug_pnn50: rec.drug_pnn50,
                        };
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-spont-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_bf, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_ln_rmssd70, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_ln_sdnn70, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_pnn50, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(drugMetrics?.drug_bf, 1)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(drugMetrics?.drug_ln_rmssd70, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(drugMetrics?.drug_ln_sdnn70, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(drugMetrics?.drug_pnn50, 1)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-purple-950/60 font-bold border-t-2 border-purple-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-purple-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(computedSpontaneousAverages?.baseline_bf, 1)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(computedSpontaneousAverages?.baseline_ln_rmssd70, 3)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(computedSpontaneousAverages?.baseline_ln_sdnn70, 3)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(computedSpontaneousAverages?.baseline_pnn50, 1)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugAverages[drug.key]?.avg_bf ?? computedSpontaneousAverages?.drug_bf, 1)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugAverages[drug.key]?.avg_ln_rmssd70 ?? computedSpontaneousAverages?.drug_ln_rmssd70, 3)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugAverages[drug.key]?.avg_ln_sdnn70 ?? computedSpontaneousAverages?.drug_ln_sdnn70, 3)}</td>
                        <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugAverages[drug.key]?.avg_pnn50 ?? computedSpontaneousAverages?.drug_pnn50, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Expandable Normalized Section - for each drug */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setSpontNormExpanded(prev => ({ ...prev, [drug.key]: !prev[drug.key] }))}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid={`expand-spont-norm-${drug.key}`}
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${spontNormExpanded[drug.key] ? 'rotate-90' : ''}`}
                    />
                    <InfoTip text="Values normalized to the average baseline across all included recordings in the folder">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      spontNormExpanded[drug.key] ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline BF (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline ln(RMSSD) (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline ln(SDNN) (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline pNN50 (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>{drug.name} BF (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>{drug.name} ln(RMSSD) (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>{drug.name} ln(SDNN) (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>{drug.name} pNN50 (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(perDrugNormalized[drug.key]?.data || []).map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-spont-norm-${rec.id}`}
                                  />
                                </td>
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
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-purple-950/60 font-bold border-t-2 border-purple-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-purple-300 text-xs">Folder Average (n={perDrugNormalizedAverages[drug.key]?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_baseline_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_baseline_ln_rmssd, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_baseline_ln_sdnn, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_baseline_pnn50, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_drug_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_drug_ln_rmssd, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_drug_ln_sdnn, 1)}</td>
                            <td className="py-3 px-2 text-center text-purple-100 text-xs">{formatValue(perDrugNormalizedAverages[drug.key]?.averages?.norm_drug_pnn50, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        {/* Light Stimulus Tab - Combined HRA and Corrected HRV */}
        <TabsContent value="light-stimulus">
          <div className="space-y-4">
            {/* HRA Table */}
            <div className="glass-surface-subtle rounded-xl">
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#fbbf24', fontFamily: 'var(--font-display)', fontWeight: 500 }}>Light-Induced Heart Rate Adaptation (HRA)</span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean Beat Frequency from -2 to -1 min before first light stimulation">Baseline BF</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Average Beat Frequency during light stimulation">Avg BF</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Normalized Avg: 100 × Avg/Baseline">Avg %</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Maximum Beat Frequency reached during light stimulation">Peak BF</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Normalized Peak: 100 × Peak/Baseline">Peak %</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Time To Peak (1st stim)">TTP 1st</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Time To Peak (average)">TTP Avg</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Beat Frequency at the end of the stimulation period, before the drop">Rec. BF</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Recovery %: 100 × Recovery/Baseline">Rec. %</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Amplitude: Peak BF − Recovery BF">Amp.</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Decrease %: 100 × Amplitude / Peak BF">Dec. %</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium rounded-tr-lg" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                          <InfoTip text="Slope of BF during stimulation, normalized by mean BF">RoC</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-hra-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-1 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.light_baseline_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_avg_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(
                              rec.light_avg_norm != null ? rec.light_avg_norm : 
                              (rec.light_baseline_bf && rec.light_baseline_bf > 0 && rec.light_avg_bf != null ? 
                                100 * rec.light_avg_bf / rec.light_baseline_bf : null), 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_norm, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_first, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_avg, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_amplitude, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(
                              rec.light_peak_bf && rec.light_peak_bf > 0 && rec.light_amplitude != null ? 
                                100 * rec.light_amplitude / rec.light_peak_bf : null, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_roc, 4)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-amber-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-1 text-center text-cyan-200 text-xs">{formatValue(computedLightHRAAverages?.light_baseline_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_avg_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_avg_norm, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_peak_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_peak_norm, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_ttp_first, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_ttp_avg, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_recovery_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_recovery_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_amplitude, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_dec_norm, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_roc, 4)}</td>
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
                    <InfoTip text="Values normalized to the average baseline BF across all included recordings in the folder">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      lightNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline BF (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Avg BF (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Peak BF (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Recovery BF (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedNormalizedLightHRA.map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-hra-norm-${rec.id}`}
                                  />
                                </td>
                                <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                <td className="py-2 px-2 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.norm_baseline_bf, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_avg_bf, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_peak_bf, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">{formatValue(rec.norm_recovery_bf, 1)}</td>
                              </tr>
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-amber-300 text-xs">Folder Average (n={normalizedLightHRAAverages?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-cyan-200 text-xs">{formatValue(normalizedLightHRAAverages?.norm_baseline_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_avg_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_peak_bf, 1)}</td>
                            <td className="py-3 px-2 text-center text-amber-100 text-xs">{formatValue(normalizedLightHRAAverages?.norm_recovery_bf, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                {/* Expandable Per Metrics Section for HRA */}
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <button
                    onClick={() => setHraPerMetricExpanded(!hraPerMetricExpanded)}
                    className="flex items-center gap-2 text-sm transition-colors py-1"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    data-testid="expand-hra-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${hraPerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics for each Stimuli</span>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      hraPerMetricExpanded ? 'max-h-[8000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {/* Metric Selector - Glassmorphic */}
                    <div 
                      className="mb-4 p-4 rounded-xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        backdropFilter: 'blur(16px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Select metrics to display:</p>
                      <div className="flex flex-wrap gap-2">
                        {hraMetricDefs.map((metric) => (
                          <button
                            key={metric.key}
                            onClick={() => setSelectedHraMetrics(prev => ({
                              ...prev,
                              [metric.key]: !prev[metric.key]
                            }))}
                            className="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1"
                            style={{
                              background: selectedHraMetrics[metric.key] 
                                ? 'rgba(245, 158, 11, 0.25)' 
                                : 'rgba(255, 255, 255, 0.05)',
                              backdropFilter: 'blur(8px)',
                              border: selectedHraMetrics[metric.key]
                                ? '1px solid rgba(245, 158, 11, 0.5)'
                                : '1px solid rgba(255, 255, 255, 0.12)',
                              color: selectedHraMetrics[metric.key] ? '#fbbf24' : 'var(--text-secondary)',
                              boxShadow: selectedHraMetrics[metric.key] ? '0 0 12px rgba(245, 158, 11, 0.2)' : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedHraMetrics[metric.key]) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedHraMetrics[metric.key]) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                              }
                            }}
                            data-testid={`select-hra-metric-${metric.key}`}
                          >
                            <InfoTip text={metric.tooltip}>
                              <span>{metric.label}</span>
                            </InfoTip>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {Object.values(selectedHraMetrics).some(v => v) ? (
                      <div className="space-y-6">
                        {perMetricHRAData.filter(m => selectedHraMetrics[m.key]).map((metricData) => (
                          <div 
                            key={metricData.key} 
                            className="rounded-xl p-4"
                            style={{
                              background: 'rgba(255, 255, 255, 0.025)',
                              backdropFilter: 'blur(16px) saturate(180%)',
                              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className={`text-sm font-semibold ${metricData.color === 'cyan' ? 'text-cyan-400' : 'text-amber-400'}`}>
                                {metricData.label}
                              </h4>
                              {/* Y-axis zoom controls */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    // Calculate min/max from actual data to keep all traces visible
                                    const allValues = metricData.chartData.flatMap(d => [d.perStimAvg, d.baseline, d.stimAvg].filter(v => v != null && !isNaN(v)));
                                    if (allValues.length === 0) return;
                                    const dataMin = Math.min(...allValues);
                                    const dataMax = Math.max(...allValues);
                                    const dataRange = dataMax - dataMin || 1;
                                    const dataMid = (dataMin + dataMax) / 2;
                                    const current = hraYAxisZoom[metricData.key] || [dataMin - dataRange * 0.1, dataMax + dataRange * 0.1];
                                    const currentRange = current[1] - current[0];
                                    // Zoom in by 20% but ensure all data points stay visible
                                    const newRange = Math.max(currentRange * 0.8, dataRange * 1.05);
                                    setHraYAxisZoom(prev => ({ ...prev, [metricData.key]: [dataMid - newRange/2, dataMid + newRange/2] }));
                                  }}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Zoom In Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                </button>
                                <button
                                  onClick={() => {
                                    // Calculate min/max from actual data
                                    const allValues = metricData.chartData.flatMap(d => [d.perStimAvg, d.baseline, d.stimAvg].filter(v => v != null && !isNaN(v)));
                                    if (allValues.length === 0) return;
                                    const dataMin = Math.min(...allValues);
                                    const dataMax = Math.max(...allValues);
                                    const dataRange = dataMax - dataMin || 1;
                                    const dataMid = (dataMin + dataMax) / 2;
                                    const current = hraYAxisZoom[metricData.key] || [dataMin - dataRange * 0.1, dataMax + dataRange * 0.1];
                                    const currentRange = current[1] - current[0];
                                    // Zoom out by 25%
                                    const newRange = currentRange * 1.25;
                                    setHraYAxisZoom(prev => ({ ...prev, [metricData.key]: [dataMid - newRange/2, dataMid + newRange/2] }));
                                  }}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Zoom Out Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>
                                </button>
                                <button
                                  onClick={() => setHraYAxisZoom(prev => { const n = {...prev}; delete n[metricData.key]; return n; })}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Reset Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                              </div>
                            </div>
                            
                            {/* Visualization Chart with Y-axis zoom */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                  <XAxis dataKey="stim" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                  <YAxis 
                                    stroke="#71717a" 
                                    tick={{ fontSize: 10, fill: '#a1a1aa' }} 
                                    domain={hraYAxisZoom[metricData.key] || metricData.yDomain || ['auto', 'auto']}
                                    allowDataOverflow={true}
                                    tickFormatter={(value) => Number.isFinite(value) ? (Number.isInteger(value) ? value : value.toFixed(Math.min(4, Math.max(0, -Math.floor(Math.log10(Math.abs(value))) + 3)))) : value}
                                  />
                                  <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(8px)' }}
                                    labelStyle={{ color: '#fbbf24' }}
                                  />
                                  <Legend 
                                    wrapperStyle={{ fontSize: '10px' }} 
                                    content={({ payload }) => {
                                      // Custom legend with fixed order: Per Stim Average, Baseline BF (if exists), All Stims Average
                                      const orderedItems = [];
                                      const perStim = payload?.find(p => p.value === 'Per Stim Average');
                                      const baseline = payload?.find(p => p.value === 'Baseline BF');
                                      const allStims = payload?.find(p => p.value === 'All Stims Average');
                                      if (perStim) orderedItems.push(perStim);
                                      if (baseline) orderedItems.push(baseline);
                                      if (allStims) orderedItems.push(allStims);
                                      return (
                                        <div className="flex justify-center gap-4 text-xs mt-2">
                                          {orderedItems.map((entry, i) => (
                                            <span key={i} className="flex items-center gap-1">
                                              {entry.value === 'All Stims Average' ? (
                                                <span style={{ display: 'inline-block', width: 14, borderTop: `2px dotted ${entry.color}` }} />
                                              ) : entry.value === 'Baseline BF' ? (
                                                <span style={{ display: 'inline-block', width: 14, borderTop: `2px dashed ${entry.color}` }} />
                                              ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, marginRight: 2 }} />
                                                  <span style={{ width: 8, borderTop: `2px solid ${entry.color}` }} />
                                                </span>
                                              )}
                                              <span style={{ color: entry.color }}>{entry.value}</span>
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    }}
                                  />
                                  {/* Per Stim Average line - 1st in legend (solid line with dots) */}
                                  <Line 
                                    type="monotone" 
                                    dataKey="perStimAvg" 
                                    stroke="#f59e0b"
                                    strokeWidth={3}
                                    dot={{ fill: '#f59e0b', r: 4 }}
                                    name="Per Stim Average"
                                  />
                                  {/* Baseline BF trace for Avg BF, Peak BF, Recovery BF charts - 2nd in legend (dashed line) */}
                                  {metricData.showBaseline && (
                                    <Line 
                                      type="monotone" 
                                      dataKey="baseline" 
                                      stroke="#06b6d4" 
                                      strokeWidth={2}
                                      strokeDasharray="5 5"
                                      dot={{ fill: '#06b6d4', r: 3 }}
                                      name="Baseline BF"
                                    />
                                  )}
                                  {/* All Stims Average line - LAST in legend (dotted line, no dots) */}
                                  <Line 
                                    type="monotone" 
                                    dataKey="stimAvg" 
                                    stroke="#eab308"
                                    strokeWidth={2}
                                    strokeDasharray="2 2"
                                    dot={false}
                                    name="All Stims Average"
                                  />
                                  {/* 100% baseline reference for percentage metrics */}
                                  {metricData.showBaselinePct && (
                                    <ReferenceLine 
                                      y={100} 
                                      stroke="#06b6d4" 
                                      strokeDasharray="5 5" 
                                      strokeWidth={2}
                                      label={{ value: 'Baseline (100%)', fill: '#06b6d4', fontSize: 10, position: 'insideTopRight' }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Data Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                                    <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: metricData.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.08)', color: metricData.color === 'cyan' ? '#22d3ee' : '#fbbf24' }}>Stim 1</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: metricData.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.08)', color: metricData.color === 'cyan' ? '#22d3ee' : '#fbbf24' }}>Stim 2</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: metricData.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.08)', color: metricData.color === 'cyan' ? '#22d3ee' : '#fbbf24' }}>Stim 3</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: metricData.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.08)', color: metricData.color === 'cyan' ? '#22d3ee' : '#fbbf24' }}>Stim 4</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: metricData.color === 'cyan' ? 'rgba(6, 182, 212, 0.08)' : 'rgba(245, 158, 11, 0.08)', color: metricData.color === 'cyan' ? '#22d3ee' : '#fbbf24' }}>Stim 5</th>
                                    <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(234, 179, 8, 0.08)', color: '#facc15' }}>Average</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {metricData.recordings.map((rec) => (
                                    <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${rec.isExcluded ? 'opacity-40' : ''}`}>
                                      <td className="py-2 px-1">
                                        <RecordingToggle 
                                          isExcluded={rec.isExcluded} 
                                          onToggle={() => toggleRecording(rec.id)}
                                          testId={`toggle-hra-metric-${metricData.key}-${rec.id}`}
                                        />
                                      </td>
                                      <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                      {rec.stimValues.map((val, i) => (
                                        <td key={i} className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">
                                          {formatValue(val, metricData.decimals)}
                                        </td>
                                      ))}
                                      <td className="py-2 px-2 text-center text-yellow-300 bg-yellow-950/20 font-medium">
                                        {formatValue(rec.rowAvg, metricData.decimals)}
                                      </td>
                                    </tr>
                                  ))}
                                  {/* Folder Average Row */}
                                  <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                                    <td className="py-3 px-1"></td>
                                    <td className="py-3 px-2 text-amber-300 text-xs">Folder Average (n={metricData.includedCount})</td>
                                    {metricData.colAvgs.map((val, i) => (
                                      <td key={i} className="py-3 px-2 text-center text-amber-100 text-xs">
                                        {formatValue(val, metricData.decimals)}
                                      </td>
                                    ))}
                                    <td className="py-3 px-2 text-center text-yellow-200 text-xs font-bold">
                                      {formatValue(metricData.grandAvg, metricData.decimals)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm italic">Select one or more metrics above to display their per-stimulation data</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Corrected HRV Table */}
            <div className="glass-surface-subtle rounded-xl">
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#fbbf24', fontFamily: 'var(--font-display)', fontWeight: 500 }}>Corrected Light-Induced Heart Rate Variability (HRV)</span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-3 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-3 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>ln(RMSSD<sub>70</sub>) corr.</th>
                        <th className="text-center py-2.5 px-3 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>ln(SDNN<sub>70</sub>) corr.</th>
                        <th className="text-center py-2.5 px-3 font-medium rounded-tr-lg" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>pNN50<sub>70</sub> corr. (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-hrv-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-3 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_rmssd70, 3)}</td>
                            <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_ln_sdnn70, 3)}</td>
                            <td className="py-2 px-3 text-center text-zinc-300">{formatValue(rec.light_hrv_pnn50, 1)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-3 text-amber-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(computedLightHRVAverages?.light_hrv_ln_rmssd70, 3)}</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(computedLightHRVAverages?.light_hrv_ln_sdnn70, 3)}</td>
                        <td className="py-3 px-3 text-center text-amber-100 text-xs">{formatValue(computedLightHRVAverages?.light_hrv_pnn50, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Expandable Per Metrics Section for HRV */}
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <button
                    onClick={() => setHrvPerMetricExpanded(!hrvPerMetricExpanded)}
                    className="flex items-center gap-2 text-sm transition-colors py-1"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    data-testid="expand-hrv-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${hrvPerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics for each Stimuli</span>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      hrvPerMetricExpanded ? 'max-h-[5000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {/* Metric Selector - Glassmorphic */}
                    <div 
                      className="mb-4 p-4 rounded-xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        backdropFilter: 'blur(16px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Select metrics to display:</p>
                      <div className="flex flex-wrap gap-2">
                        {hrvMetricDefs.map((metric) => (
                          <button
                            key={metric.key}
                            onClick={() => setSelectedHrvMetrics(prev => ({
                              ...prev,
                              [metric.key]: !prev[metric.key]
                            }))}
                            className="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1"
                            style={{
                              background: selectedHrvMetrics[metric.key] 
                                ? 'rgba(245, 158, 11, 0.25)' 
                                : 'rgba(255, 255, 255, 0.05)',
                              backdropFilter: 'blur(8px)',
                              border: selectedHrvMetrics[metric.key]
                                ? '1px solid rgba(245, 158, 11, 0.5)'
                                : '1px solid rgba(255, 255, 255, 0.12)',
                              color: selectedHrvMetrics[metric.key] ? '#fbbf24' : 'var(--text-secondary)',
                              boxShadow: selectedHrvMetrics[metric.key] ? '0 0 12px rgba(245, 158, 11, 0.2)' : 'none',
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedHrvMetrics[metric.key]) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedHrvMetrics[metric.key]) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                              }
                            }}
                            data-testid={`select-hrv-metric-${metric.key}`}
                          >
                            <InfoTip text={metric.tooltip}>
                              <span>{metric.label}</span>
                            </InfoTip>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {Object.values(selectedHrvMetrics).some(v => v) ? (
                      <div className="space-y-6">
                        {perMetricHRVData.filter(m => selectedHrvMetrics[m.key]).map((metricData) => (
                          <div 
                            key={metricData.key} 
                            className="rounded-xl p-4"
                            style={{
                              background: 'rgba(255, 255, 255, 0.025)',
                              backdropFilter: 'blur(16px) saturate(180%)',
                              WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                            }}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-amber-400">
                                {metricData.label}
                              </h4>
                              {/* Y-axis zoom controls */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    // Calculate min/max from actual data to keep all traces visible
                                    const allValues = metricData.chartData.flatMap(d => [d.perStimMedian, d.stimMedian].filter(v => v != null && !isNaN(v)));
                                    if (allValues.length === 0) return;
                                    const dataMin = Math.min(...allValues);
                                    const dataMax = Math.max(...allValues);
                                    const dataRange = dataMax - dataMin || 1;
                                    const dataMid = (dataMin + dataMax) / 2;
                                    const current = hrvYAxisZoom[metricData.key] || [dataMin - dataRange * 0.1, dataMax + dataRange * 0.1];
                                    const currentRange = current[1] - current[0];
                                    // Zoom in by 20% but ensure all data points stay visible
                                    const newRange = Math.max(currentRange * 0.8, dataRange * 1.05);
                                    setHrvYAxisZoom(prev => ({ ...prev, [metricData.key]: [dataMid - newRange/2, dataMid + newRange/2] }));
                                  }}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Zoom In Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                </button>
                                <button
                                  onClick={() => {
                                    // Calculate min/max from actual data
                                    const allValues = metricData.chartData.flatMap(d => [d.perStimMedian, d.stimMedian].filter(v => v != null && !isNaN(v)));
                                    if (allValues.length === 0) return;
                                    const dataMin = Math.min(...allValues);
                                    const dataMax = Math.max(...allValues);
                                    const dataRange = dataMax - dataMin || 1;
                                    const dataMid = (dataMin + dataMax) / 2;
                                    const current = hrvYAxisZoom[metricData.key] || [dataMin - dataRange * 0.1, dataMax + dataRange * 0.1];
                                    const currentRange = current[1] - current[0];
                                    // Zoom out by 25%
                                    const newRange = currentRange * 1.25;
                                    setHrvYAxisZoom(prev => ({ ...prev, [metricData.key]: [dataMid - newRange/2, dataMid + newRange/2] }));
                                  }}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Zoom Out Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>
                                </button>
                                <button
                                  onClick={() => setHrvYAxisZoom(prev => { const n = {...prev}; delete n[metricData.key]; return n; })}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                  title="Reset Y-axis"
                                >
                                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                              </div>
                            </div>
                            
                            {/* Visualization Chart with Y-axis zoom */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                  <XAxis dataKey="stim" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                  <YAxis 
                                    stroke="#71717a" 
                                    tick={{ fontSize: 10, fill: '#a1a1aa' }} 
                                    domain={hrvYAxisZoom[metricData.key] || metricData.yDomain || ['auto', 'auto']}
                                    allowDataOverflow={true}
                                    tickFormatter={(value) => Number.isFinite(value) ? (Number.isInteger(value) ? value : value.toFixed(Math.min(4, Math.max(0, -Math.floor(Math.log10(Math.abs(value))) + 3)))) : value}
                                  />
                                  <RechartsTooltip 
                                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', backdropFilter: 'blur(8px)' }}
                                    labelStyle={{ color: '#fbbf24' }}
                                  />
                                  <Legend 
                                    wrapperStyle={{ fontSize: '10px' }}
                                    content={({ payload }) => {
                                      // Custom legend with fixed order: Per Stim Median, All Stims Median
                                      const orderedItems = [];
                                      const perStim = payload?.find(p => p.value === 'Per Stim Median');
                                      const allStims = payload?.find(p => p.value === 'All Stims Median');
                                      if (perStim) orderedItems.push(perStim);
                                      if (allStims) orderedItems.push(allStims);
                                      return (
                                        <div className="flex justify-center gap-4 text-xs mt-2">
                                          {orderedItems.map((entry, i) => (
                                            <span key={i} className="flex items-center gap-1">
                                              {entry.value === 'All Stims Median' ? (
                                                <span style={{ display: 'inline-block', width: 14, borderTop: `2px dotted ${entry.color}` }} />
                                              ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color, marginRight: 2 }} />
                                                  <span style={{ width: 8, borderTop: `2px solid ${entry.color}` }} />
                                                </span>
                                              )}
                                              <span style={{ color: entry.color }}>{entry.value}</span>
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    }}
                                  />
                                  {/* Per Stim Median line - 1st in legend (solid line with dots) */}
                                  <Line 
                                    type="monotone" 
                                    dataKey="perStimMedian" 
                                    stroke="#f59e0b" 
                                    strokeWidth={3}
                                    dot={{ fill: '#f59e0b', r: 4 }}
                                    name="Per Stim Median"
                                  />
                                  {/* All Stims Median line - LAST in legend (dotted line, no dots) */}
                                  <Line 
                                    type="monotone" 
                                    dataKey="stimMedian" 
                                    stroke="#eab308"
                                    strokeWidth={2}
                                    strokeDasharray="2 2"
                                    dot={false}
                                    name="All Stims Median"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Data Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                                    <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Stim 1</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Stim 2</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Stim 3</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Stim 4</th>
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Stim 5</th>
                                    <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(234, 179, 8, 0.08)', color: '#facc15' }}>Median</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {metricData.recordings.map((rec) => (
                                    <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${rec.isExcluded ? 'opacity-40' : ''}`}>
                                      <td className="py-2 px-1">
                                        <RecordingToggle 
                                          isExcluded={rec.isExcluded} 
                                          onToggle={() => toggleRecording(rec.id)}
                                          testId={`toggle-hrv-metric-${metricData.key}-${rec.id}`}
                                        />
                                      </td>
                                      <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                      {rec.stimValues.map((val, i) => (
                                        <td key={i} className="py-2 px-2 text-center text-zinc-300 bg-amber-950/10">
                                          {formatValue(val, metricData.decimals)}
                                        </td>
                                      ))}
                                      <td className="py-2 px-2 text-center text-yellow-300 bg-yellow-950/20 font-medium">
                                        {formatValue(rec.rowMedian, metricData.decimals)}
                                      </td>
                                    </tr>
                                  ))}
                                  {/* Folder Median Row */}
                                  <tr className="bg-amber-950/60 font-bold border-t-2 border-amber-500">
                                    <td className="py-3 px-1"></td>
                                    <td className="py-3 px-2 text-amber-300 text-xs">Folder Median (n={metricData.includedCount})</td>
                                    {metricData.colMedians.map((val, i) => (
                                      <td key={i} className="py-3 px-2 text-center text-amber-100 text-xs">
                                        {formatValue(val, metricData.decimals)}
                                      </td>
                                    ))}
                                    <td className="py-3 px-2 text-center text-yellow-200 text-xs font-bold">
                                      {formatValue(metricData.grandMedian, metricData.decimals)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm italic">Select one or more metrics above to display their per-stimulation data</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata">
          <div 
            className="rounded-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.025)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div className="p-4 pb-2">
              <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>Recording Metadata</span>
            </div>
            <div className="p-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Date</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#34d399' }}>
                        <InfoTip text="human Spinal Organoids">hSpO Info</InfoTip>
                      </th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(244, 206, 162, 0.08)', color: '#F4CEA2' }}>
                        <InfoTip text="human Cardiac Organoids">hCO Info</InfoTip>
                      </th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Fusion</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>Drug Info</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>
                        Light Stim Info
                      </th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap rounded-tr-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecordings?.map((rec, idx) => {
                      const isExcluded = excludedRecordings[rec.id];
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
                      
                      // Format drug info - use per_drug_metrics for perfusion time when available
                      const drugDisplay = rec.has_drug && rec.drug_info?.length > 0 ? (
                        <div className="text-[10px] leading-tight">
                          {rec.drug_info.map((drug, i) => {
                            // Try to get perf_time from per_drug_metrics first
                            const perDrugData = rec.per_drug_metrics?.find(dm => 
                              dm.drug_name === drug.name || 
                              dm.drug_key === drug.name?.toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_')
                            );
                            const perfTime = perDrugData?.perf_time ?? drug.bf_readout_time;
                            
                            return (
                              <div key={i} className="mb-1">
                                <div className="font-medium">{drug.name}</div>
                                {drug.concentration && <div className="text-zinc-500">{drug.concentration}µM</div>}
                                {perfTime !== null && perfTime !== undefined && perfTime !== '' && (
                                  <div className="text-zinc-500">Perf. Time: {perfTime}min</div>
                                )}
                              </div>
                            );
                          })}
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
                      
                      // Check for cardiac arrest flags
                      const hasBaselineCardiacArrest = rec.baseline_cardiac_arrest;
                      const drugCardiacArrests = rec.per_drug_metrics?.filter(dm => dm.cardiac_arrest) || [];
                      
                      return (
                        <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 align-top ${isExcluded ? 'opacity-40' : ''}`}>
                          <td className="py-2 px-1">
                            <RecordingToggle 
                              isExcluded={isExcluded} 
                              onToggle={() => toggleRecording(rec.id)}
                              testId={`toggle-meta-${rec.id}`}
                            />
                          </td>
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
                          <td className="py-2 px-1.5 text-[10px] max-w-[200px]">
                            <div className="space-y-1">
                              {(hasBaselineCardiacArrest || drugCardiacArrests.length > 0) && (
                                <div className="flex flex-wrap gap-1">
                                  {hasBaselineCardiacArrest && (
                                    <span className="px-1.5 py-0.5 bg-red-600/30 border border-red-500/50 text-red-300 text-[9px] rounded font-medium">
                                      Cardiac Arrest (Baseline)
                                    </span>
                                  )}
                                  {drugCardiacArrests.map((dm, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-red-600/30 border border-red-500/50 text-red-300 text-[9px] rounded font-medium">
                                      Cardiac Arrest ({dm.drug_name})
                                    </span>
                                  ))}
                                </div>
                              )}
                              {rec.recording_description && (
                                <div className="text-zinc-400 truncate">{rec.recording_description}</div>
                              )}
                              {!hasBaselineCardiacArrest && drugCardiacArrests.length === 0 && !rec.recording_description && (
                                <span className="text-zinc-500">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>
          </>
        )}

        {/* ============================================================
            MEA COMPARISON CONTENT
        ============================================================ */}
        {sourceType === 'MEA' && (
          <>
        {/* MEA Spontaneous Activity Tab */}
        <TabsContent value="spontaneous">
          <div className="space-y-4">
            {/* Spike Table */}
            <div 
              className="rounded-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#10b981', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  <InfoTip text="Spike rate metrics across recordings">Spike Rate Comparison</InfoTip>
                </span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean spike rate during baseline period (Hz)">Baseline Spike (Hz)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>
                          <InfoTip text="Mean spike rate during drug perfusion period (Hz)">Drug Spike (Hz)</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-mea-spike-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_spike_hz, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_spike_hz, 3)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-emerald-950/60 font-bold border-t-2 border-emerald-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-emerald-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaSpontSpikeAverages?.baseline_spike_hz, 3)}</td>
                        <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaSpontSpikeAverages?.drug_spike_hz, 3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Normalized Spike Section */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setMeaSpikeNormExpanded(!meaSpikeNormExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-mea-spike-norm"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaSpikeNormExpanded ? 'rotate-90' : ''}`}
                    />
                    <InfoTip text="Values normalized to the average baseline across all included recordings">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaSpikeNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline Spike (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>Drug Spike (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meaNormalizedSpontSpikeData.map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-mea-spike-norm-${rec.id}`}
                                  />
                                </td>
                                <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug, 1)}</td>
                              </tr>
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-emerald-950/60 font-bold border-t-2 border-emerald-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-emerald-300 text-xs">Folder Average (n={meaNormSpontSpikeAverages?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaNormSpontSpikeAverages?.norm_baseline, 1)}</td>
                            <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaNormSpontSpikeAverages?.norm_drug, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Burst Table */}
            <div 
              className="rounded-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.025)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#f97316', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  <InfoTip text="Burst rate metrics across recordings">Burst Rate Comparison</InfoTip>
                </span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean burst rate during baseline period (bpm)">Baseline Burst (bpm)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-2 font-medium whitespace-nowrap rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>
                          <InfoTip text="Mean burst rate during drug perfusion period (bpm)">Drug Burst (bpm)</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-mea-burst-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.baseline_burst_bpm, 3)}</td>
                            <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.drug_burst_bpm, 3)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-orange-950/60 font-bold border-t-2 border-orange-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-orange-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaSpontBurstAverages?.baseline_burst_bpm, 3)}</td>
                        <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaSpontBurstAverages?.drug_burst_bpm, 3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Normalized Burst Section */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setMeaBurstNormExpanded(!meaBurstNormExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-mea-burst-norm"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaBurstNormExpanded ? 'rotate-90' : ''}`}
                    />
                    <InfoTip text="Values normalized to the average baseline across all included recordings">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaBurstNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline Burst (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>Drug Burst (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meaNormalizedSpontBurstData.map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-mea-burst-norm-${rec.id}`}
                                  />
                                </td>
                                <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-cyan-950/10">{formatValue(rec.norm_baseline, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-purple-950/10">{formatValue(rec.norm_drug, 1)}</td>
                              </tr>
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-orange-950/60 font-bold border-t-2 border-orange-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-orange-300 text-xs">Folder Average (n={meaNormSpontBurstAverages?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaNormSpontBurstAverages?.norm_baseline, 1)}</td>
                            <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaNormSpontBurstAverages?.norm_drug, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* MEA Light Stimulus Tab */}
        <TabsContent value="light-stimulus">
          <div className="space-y-4">
            {/* Light Spike Table */}
            <div className="glass-surface-subtle rounded-xl">
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#10b981', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  <InfoTip text="Spike rate metrics during light stimulation">Light-Induced Spike Activity</InfoTip>
                </span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean spike rate from -2 to -1 min before first stim">BL Spike (Hz)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                          <InfoTip text="Average spike rate during light (averaged across stims)">Avg Spike (Hz)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                          <InfoTip text="Max spike rate during light (averaged across stims)">Max Spike (Hz)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                          <InfoTip text="Percent change: 100 × (Avg - Baseline) / Baseline">Spike Δ%</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                          <InfoTip text="Percent change at peak: 100 × (Max - Baseline) / Baseline">Peak Spike Δ%</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium rounded-tr-lg" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>
                          <InfoTip text="Time from stim start to max spike rate">TTP (s)</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-mea-light-spike-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-1 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.light_baseline_spike_hz, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_avg_spike_hz, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_max_spike_hz, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_spike_change_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_spike_change_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_spike_time_to_peak, 1)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-emerald-950/60 font-bold border-t-2 border-emerald-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-emerald-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-1 text-center text-cyan-200 text-xs">{formatValue(meaLightSpikeAverages?.light_baseline_spike_hz, 3)}</td>
                        <td className="py-3 px-1 text-center text-emerald-100 text-xs">{formatValue(meaLightSpikeAverages?.light_avg_spike_hz, 3)}</td>
                        <td className="py-3 px-1 text-center text-emerald-100 text-xs">{formatValue(meaLightSpikeAverages?.light_max_spike_hz, 3)}</td>
                        <td className="py-3 px-1 text-center text-emerald-100 text-xs">{formatValue(meaLightSpikeAverages?.light_spike_change_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-emerald-100 text-xs">{formatValue(meaLightSpikeAverages?.light_peak_spike_change_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-emerald-100 text-xs">{formatValue(meaLightSpikeAverages?.light_spike_time_to_peak, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Normalized Light Spike Section */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setMeaLightSpikeNormExpanded(!meaLightSpikeNormExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-mea-light-spike-norm"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaLightSpikeNormExpanded ? 'rotate-90' : ''}`}
                    />
                    <InfoTip text="Values normalized to the average light baseline across all included recordings">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaLightSpikeNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>Avg Spike (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>Max Spike (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meaNormalizedLightSpikeData.map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-mea-light-spike-norm-${rec.id}`}
                                  />
                                </td>
                                <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                <td className="py-2 px-2 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.norm_baseline, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-emerald-950/10">{formatValue(rec.norm_avg, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-emerald-950/10">{formatValue(rec.norm_max, 1)}</td>
                              </tr>
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-emerald-950/60 font-bold border-t-2 border-emerald-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-emerald-300 text-xs">Folder Average (n={meaNormLightSpikeAverages?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-cyan-200 text-xs">{formatValue(meaNormLightSpikeAverages?.norm_baseline, 1)}</td>
                            <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaNormLightSpikeAverages?.norm_avg, 1)}</td>
                            <td className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(meaNormLightSpikeAverages?.norm_max, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                {/* Per Metrics for Spike */}
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <button
                    onClick={() => setMeaSpikePerMetricExpanded(!meaSpikePerMetricExpanded)}
                    className="flex items-center gap-2 text-sm transition-colors py-1"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    data-testid="expand-mea-spike-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaSpikePerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics for each Stimuli</span>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaSpikePerMetricExpanded ? 'max-h-[8000px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    {/* Metric Selector */}
                    <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Select metrics to display:</p>
                      <div className="flex flex-wrap gap-2">
                        {meaSpikeMetricDefs.map((metric) => (
                          <button
                            key={metric.key}
                            onClick={() => setSelectedMeaSpikeMetrics(prev => ({ ...prev, [metric.key]: !prev[metric.key] }))}
                            className="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1"
                            style={{
                              background: selectedMeaSpikeMetrics[metric.key] ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                              border: selectedMeaSpikeMetrics[metric.key] ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                              color: selectedMeaSpikeMetrics[metric.key] ? '#10b981' : 'var(--text-secondary)',
                            }}
                            data-testid={`select-mea-spike-metric-${metric.key}`}
                          >
                            <InfoTip text={metric.tooltip}><span>{metric.label}</span></InfoTip>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {Object.values(selectedMeaSpikeMetrics).some(v => v) ? (
                      <div className="space-y-6">
                        {meaPerMetricSpikeData.filter(m => selectedMeaSpikeMetrics[m.key]).map((metricData) => (
                          <div key={metricData.key} className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <h4 className="text-sm font-semibold text-emerald-400 mb-3">{metricData.label}</h4>
                            
                            {/* Chart */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                  <XAxis dataKey="stim" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                  <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} domain={meaSpikeYAxisZoom[metricData.key] || metricData.yDomain || ['auto', 'auto']} />
                                  <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  <Line type="monotone" dataKey="perStimAvg" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} name="Per Stim Average" />
                                  <Line type="monotone" dataKey="stimAvg" stroke="#6ee7b7" strokeWidth={2} strokeDasharray="2 2" dot={false} name="All Stims Average" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <th className="text-left py-2.5 px-1 font-medium w-8" style={{ background: 'rgba(255, 255, 255, 0.03)' }}></th>
                                    <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                                    {[1,2,3,4,5].map(i => (
                                      <th key={i} className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981' }}>Stim {i}</th>
                                    ))}
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(234, 179, 8, 0.08)', color: '#facc15' }}>Average</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {metricData.recordings.map((rec) => (
                                    <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${rec.isExcluded ? 'opacity-40' : ''}`}>
                                      <td className="py-2 px-1">
                                        <RecordingToggle isExcluded={rec.isExcluded} onToggle={() => toggleRecording(rec.id)} testId={`toggle-mea-spike-metric-${metricData.key}-${rec.id}`} />
                                      </td>
                                      <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                      {rec.stimValues.map((val, i) => (
                                        <td key={i} className="py-2 px-2 text-center text-zinc-300 bg-emerald-950/10">{formatValue(val, metricData.decimals)}</td>
                                      ))}
                                      <td className="py-2 px-2 text-center text-yellow-300 bg-yellow-950/20 font-medium">{formatValue(rec.rowAvg, metricData.decimals)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-emerald-950/60 font-bold border-t-2 border-emerald-500">
                                    <td className="py-3 px-1"></td>
                                    <td className="py-3 px-2 text-emerald-300 text-xs">Folder Average (n={metricData.includedCount})</td>
                                    {metricData.colAvgs.map((val, i) => (
                                      <td key={i} className="py-3 px-2 text-center text-emerald-100 text-xs">{formatValue(val, metricData.decimals)}</td>
                                    ))}
                                    <td className="py-3 px-2 text-center text-yellow-200 text-xs font-bold">{formatValue(metricData.grandAvg, metricData.decimals)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm italic">Select one or more metrics above to display their per-stimulation data</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Light Burst Table */}
            <div className="glass-surface-subtle rounded-xl">
              <div className="p-4 pb-2">
                <span className="text-sm" style={{ color: '#f97316', fontFamily: 'var(--font-display)', fontWeight: 500 }}>
                  <InfoTip text="Burst rate metrics during light stimulation">Light-Induced Burst Activity</InfoTip>
                </span>
              </div>
              <div className="p-4 pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                        <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>
                          <InfoTip text="Mean burst rate from -2 to -1 min before first stim">BL Burst (bpm)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>
                          <InfoTip text="Average burst rate during light (averaged across stims)">Avg Burst (bpm)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>
                          <InfoTip text="Max burst rate during light (averaged across stims)">Max Burst (bpm)</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>
                          <InfoTip text="Percent change: 100 × (Avg - Baseline) / Baseline">Burst Δ%</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>
                          <InfoTip text="Percent change at peak: 100 × (Max - Baseline) / Baseline">Peak Burst Δ%</InfoTip>
                        </th>
                        <th className="text-center py-2.5 px-1 font-medium rounded-tr-lg" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>
                          <InfoTip text="Time from stim start to max burst rate">TTP (s)</InfoTip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRecordings?.map((rec, idx) => {
                        const isExcluded = excludedRecordings[rec.id];
                        return (
                          <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                            <td className="py-2 px-1">
                              <RecordingToggle 
                                isExcluded={isExcluded} 
                                onToggle={() => toggleRecording(rec.id)}
                                testId={`toggle-mea-light-burst-${rec.id}`}
                              />
                            </td>
                            <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                            <td className="py-2 px-1 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.light_baseline_burst_bpm, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_avg_burst_bpm, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_max_burst_bpm, 3)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_burst_change_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_burst_change_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_burst_time_to_peak, 1)}</td>
                          </tr>
                        );
                      })}
                      {/* Average Row */}
                      <tr className="bg-orange-950/60 font-bold border-t-2 border-orange-500">
                        <td className="py-3 px-1"></td>
                        <td className="py-3 px-2 text-orange-300 text-xs">Folder Average (n={includedRecordingsCount})</td>
                        <td className="py-3 px-1 text-center text-cyan-200 text-xs">{formatValue(meaLightBurstAverages?.light_baseline_burst_bpm, 3)}</td>
                        <td className="py-3 px-1 text-center text-orange-100 text-xs">{formatValue(meaLightBurstAverages?.light_avg_burst_bpm, 3)}</td>
                        <td className="py-3 px-1 text-center text-orange-100 text-xs">{formatValue(meaLightBurstAverages?.light_max_burst_bpm, 3)}</td>
                        <td className="py-3 px-1 text-center text-orange-100 text-xs">{formatValue(meaLightBurstAverages?.light_burst_change_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-orange-100 text-xs">{formatValue(meaLightBurstAverages?.light_peak_burst_change_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-orange-100 text-xs">{formatValue(meaLightBurstAverages?.light_burst_time_to_peak, 1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Normalized Light Burst Section */}
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setMeaLightBurstNormExpanded(!meaLightBurstNormExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-mea-light-burst-norm"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaLightBurstNormExpanded ? 'rotate-90' : ''}`}
                    />
                    <InfoTip text="Values normalized to the average light baseline across all included recordings">
                      <span className="font-medium">Normalized to Average Baseline</span>
                    </InfoTip>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaLightBurstNormExpanded ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                            <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                            <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(6, 182, 212, 0.08)', color: '#22d3ee' }}>Baseline (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>Avg Burst (%)</th>
                            <th className="text-center py-2.5 px-2 font-medium rounded-tr-lg" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>Max Burst (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meaNormalizedLightBurstData.map((rec, idx) => {
                            const isExcluded = excludedRecordings[rec.id];
                            return (
                              <tr key={idx} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${isExcluded ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-1">
                                  <RecordingToggle 
                                    isExcluded={isExcluded} 
                                    onToggle={() => toggleRecording(rec.id)}
                                    testId={`toggle-mea-light-burst-norm-${rec.id}`}
                                  />
                                </td>
                                <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                <td className="py-2 px-2 text-center text-cyan-300 bg-cyan-950/10">{formatValue(rec.norm_baseline, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-orange-950/10">{formatValue(rec.norm_avg, 1)}</td>
                                <td className="py-2 px-2 text-center text-zinc-300 bg-orange-950/10">{formatValue(rec.norm_max, 1)}</td>
                              </tr>
                            );
                          })}
                          {/* Folder Average Row */}
                          <tr className="bg-orange-950/60 font-bold border-t-2 border-orange-500">
                            <td className="py-3 px-1"></td>
                            <td className="py-3 px-2 text-orange-300 text-xs">Folder Average (n={meaNormLightBurstAverages?.includedCount || 0})</td>
                            <td className="py-3 px-2 text-center text-cyan-200 text-xs">{formatValue(meaNormLightBurstAverages?.norm_baseline, 1)}</td>
                            <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaNormLightBurstAverages?.norm_avg, 1)}</td>
                            <td className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(meaNormLightBurstAverages?.norm_max, 1)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                {/* Per Metrics for Burst */}
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <button
                    onClick={() => setMeaBurstPerMetricExpanded(!meaBurstPerMetricExpanded)}
                    className="flex items-center gap-2 text-sm transition-colors py-1"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                    data-testid="expand-mea-burst-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${meaBurstPerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics for each Stimuli</span>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ease-in-out ${meaBurstPerMetricExpanded ? 'max-h-[8000px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
                    {/* Metric Selector */}
                    <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Select metrics to display:</p>
                      <div className="flex flex-wrap gap-2">
                        {meaBurstMetricDefs.map((metric) => (
                          <button
                            key={metric.key}
                            onClick={() => setSelectedMeaBurstMetrics(prev => ({ ...prev, [metric.key]: !prev[metric.key] }))}
                            className="px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1"
                            style={{
                              background: selectedMeaBurstMetrics[metric.key] ? 'rgba(249, 115, 22, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                              border: selectedMeaBurstMetrics[metric.key] ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                              color: selectedMeaBurstMetrics[metric.key] ? '#f97316' : 'var(--text-secondary)',
                            }}
                            data-testid={`select-mea-burst-metric-${metric.key}`}
                          >
                            <InfoTip text={metric.tooltip}><span>{metric.label}</span></InfoTip>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {Object.values(selectedMeaBurstMetrics).some(v => v) ? (
                      <div className="space-y-6">
                        {meaPerMetricBurstData.filter(m => selectedMeaBurstMetrics[m.key]).map((metricData) => (
                          <div key={metricData.key} className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <h4 className="text-sm font-semibold text-orange-400 mb-3">{metricData.label}</h4>
                            
                            {/* Chart */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                  <XAxis dataKey="stim" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                  <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} domain={meaBurstYAxisZoom[metricData.key] || metricData.yDomain || ['auto', 'auto']} />
                                  <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  <Line type="monotone" dataKey="perStimAvg" stroke="#f97316" strokeWidth={3} dot={{ fill: '#f97316', r: 4 }} name="Per Stim Average" />
                                  <Line type="monotone" dataKey="stimAvg" stroke="#fb923c" strokeWidth={2} strokeDasharray="2 2" dot={false} name="All Stims Average" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                    <th className="text-left py-2.5 px-1 font-medium w-8" style={{ background: 'rgba(255, 255, 255, 0.03)' }}></th>
                                    <th className="text-left py-2.5 px-2 font-medium" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                                    {[1,2,3,4,5].map(i => (
                                      <th key={i} className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(249, 115, 22, 0.08)', color: '#f97316' }}>Stim {i}</th>
                                    ))}
                                    <th className="text-center py-2.5 px-2 font-medium" style={{ background: 'rgba(234, 179, 8, 0.08)', color: '#facc15' }}>Average</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {metricData.recordings.map((rec) => (
                                    <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${rec.isExcluded ? 'opacity-40' : ''}`}>
                                      <td className="py-2 px-1">
                                        <RecordingToggle isExcluded={rec.isExcluded} onToggle={() => toggleRecording(rec.id)} testId={`toggle-mea-burst-metric-${metricData.key}-${rec.id}`} />
                                      </td>
                                      <td className="py-2 px-2 text-zinc-300 font-medium">{rec.name}</td>
                                      {rec.stimValues.map((val, i) => (
                                        <td key={i} className="py-2 px-2 text-center text-zinc-300 bg-orange-950/10">{formatValue(val, metricData.decimals)}</td>
                                      ))}
                                      <td className="py-2 px-2 text-center text-yellow-300 bg-yellow-950/20 font-medium">{formatValue(rec.rowAvg, metricData.decimals)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-orange-950/60 font-bold border-t-2 border-orange-500">
                                    <td className="py-3 px-1"></td>
                                    <td className="py-3 px-2 text-orange-300 text-xs">Folder Average (n={metricData.includedCount})</td>
                                    {metricData.colAvgs.map((val, i) => (
                                      <td key={i} className="py-3 px-2 text-center text-orange-100 text-xs">{formatValue(val, metricData.decimals)}</td>
                                    ))}
                                    <td className="py-3 px-2 text-center text-yellow-200 text-xs font-bold">{formatValue(metricData.grandAvg, metricData.decimals)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm italic">Select one or more metrics above to display their per-stimulation data</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* MEA Metadata Tab */}
        <TabsContent value="metadata">
          <div 
            className="rounded-xl"
            style={{
              background: 'rgba(255, 255, 255, 0.025)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div className="p-4 pb-2">
              <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 500 }}>MEA Recording Metadata</span>
            </div>
            <div className="p-4 pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <th className="text-left py-2.5 px-1 font-medium w-8 rounded-tl-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-tertiary)' }}></th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Recording</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Date</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#34d399' }}>
                        <InfoTip text="human Spinal Organoids">hSpO Info</InfoTip>
                      </th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(244, 206, 162, 0.08)', color: '#F4CEA2' }}>
                        <InfoTip text="human Cardiac Organoids">hCO Info</InfoTip>
                      </th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Fusion</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(192, 132, 252, 0.08)', color: '#c4b5fd' }}>Drug Info</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap" style={{ background: 'rgba(245, 158, 11, 0.08)', color: '#fbbf24' }}>Light Stim Info</th>
                      <th className="text-left py-2.5 px-1.5 font-medium whitespace-nowrap rounded-tr-lg" style={{ background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecordings?.map((rec, idx) => {
                      const isExcluded = excludedRecordings[rec.id];
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
                              {drug.perf_time !== null && drug.perf_time !== undefined && (
                                <div className="text-zinc-500">Perf. Time: {drug.perf_time}min</div>
                              )}
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
                        <tr key={rec.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 align-top ${isExcluded ? 'opacity-40' : ''}`}>
                          <td className="py-2 px-1">
                            <RecordingToggle 
                              isExcluded={isExcluded} 
                              onToggle={() => toggleRecording(rec.id)}
                              testId={`toggle-mea-meta-${rec.id}`}
                            />
                          </td>
                          <td className="py-2 px-1.5">
                            <div className="text-zinc-300 font-medium">{rec.name}</div>
                            {rec.well_id && <div className="text-[10px] text-emerald-400">Well: {rec.well_id}</div>}
                          </td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.recording_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-emerald-950/5">{hspoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-emerald-950/5">{hcoDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300">{rec.fusion_date || '—'}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-purple-950/5">{drugDisplay}</td>
                          <td className="py-2 px-1.5 text-zinc-300 bg-amber-950/5">{lightDisplay}</td>
                          <td className="py-2 px-1.5 text-[10px] max-w-[200px]">
                            {rec.recording_description ? (
                              <div className="text-zinc-400 truncate">{rec.recording_description}</div>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>
          </>
        )}
      </Tabs>
      </div>
    </div>
  );
}
