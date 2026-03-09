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
  const [hraPerStimExpanded, setHraPerStimExpanded] = useState(false);  // Per Stimuli for HRA
  const [hrvPerStimExpanded, setHrvPerStimExpanded] = useState(false);  // Per Stimuli for HRV
  const [hraPerMetricExpanded, setHraPerMetricExpanded] = useState(false);  // Per Metrics for HRA
  const [hrvPerMetricExpanded, setHrvPerMetricExpanded] = useState(false);  // Per Metrics for HRV
  // Global excluded recordings - applies to ALL tables and exports
  const [excludedRecordings, setExcludedRecordings] = useState({});  // { recordingId: true }
  
  // Toggle a recording's inclusion/exclusion (global)
  const toggleRecording = useCallback((recordingId) => {
    setExcludedRecordings(prev => ({
      ...prev,
      [recordingId]: !prev[recordingId]
    }));
  }, []);

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
    
    return {
      light_baseline_bf: mean(includedRecs.map(r => r.light_baseline_bf)),
      light_avg_bf: mean(includedRecs.map(r => r.light_avg_bf)),
      light_peak_bf: mean(includedRecs.map(r => r.light_peak_bf)),
      light_peak_norm: mean(includedRecs.map(r => r.light_peak_norm)),
      light_ttp_first: mean(includedRecs.map(r => r.light_ttp_first)),
      light_ttp_avg: mean(includedRecs.map(r => r.light_ttp_avg)),
      light_recovery_bf: mean(includedRecs.map(r => r.light_recovery_bf)),
      light_recovery_pct: mean(includedRecs.map(r => r.light_recovery_pct)),
      light_amplitude: mean(includedRecs.map(r => r.light_amplitude)),
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

  // Compute per-stim HRA data (5 tables with averages)
  const perStimHRAData = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const mean = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    
    // Determine max stim count (usually 5) from ALL recordings
    const maxStims = Math.max(...allRecs.map(r => (r.per_stim_hra || []).length), 0);
    
    const stimTables = [];
    for (let stimIdx = 0; stimIdx < maxStims; stimIdx++) {
      // Show all recordings but mark excluded ones
      const stimData = allRecs.map(rec => {
        const stimValues = (rec.per_stim_hra || [])[stimIdx];
        return {
          id: rec.id,
          name: rec.name,
          values: stimValues || null,
          isExcluded: excludedRecordings[rec.id] || false,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      // Calculate averages only from INCLUDED recordings with valid values
      const includedWithValues = stimData.filter(r => !r.isExcluded && r.values !== null).map(r => r.values);
      const averages = {
        baseline_bf: mean(includedWithValues.map(v => v.baseline_bf)),
        avg_bf: mean(includedWithValues.map(v => v.avg_bf)),
        peak_bf: mean(includedWithValues.map(v => v.peak_bf)),
        peak_norm: mean(includedWithValues.map(v => v.peak_norm)),
        ttp: mean(includedWithValues.map(v => v.ttp)),
        recovery_bf: mean(includedWithValues.map(v => v.recovery_bf)),
        recovery_pct: mean(includedWithValues.map(v => v.recovery_pct)),
        amplitude: mean(includedWithValues.map(v => v.amplitude)),
        roc: mean(includedWithValues.map(v => v.roc)),
      };
      
      stimTables.push({
        stimIndex: stimIdx + 1,
        recordings: stimData,
        averages,
        includedCount: includedWithValues.length,
      });
    }
    
    return stimTables;
  }, [comparisonData, excludedRecordings]);

  // Compute per-stim HRV data (5 tables with medians)
  const perStimHRVData = useMemo(() => {
    if (!comparisonData?.recordings) return [];
    const allRecs = comparisonData.recordings;
    if (allRecs.length === 0) return [];
    
    const median = (arr) => {
      const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v)).sort((a, b) => a - b);
      if (valid.length === 0) return null;
      const mid = Math.floor(valid.length / 2);
      return valid.length % 2 !== 0 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
    };
    
    // Determine max stim count (usually 5) from ALL recordings
    const maxStims = Math.max(...allRecs.map(r => (r.per_stim_hrv || []).length), 0);
    
    const stimTables = [];
    for (let stimIdx = 0; stimIdx < maxStims; stimIdx++) {
      // Show all recordings but mark excluded ones
      const stimData = allRecs.map(rec => {
        const stimValues = (rec.per_stim_hrv || [])[stimIdx];
        return {
          id: rec.id,
          name: rec.name,
          values: stimValues || null,
          isExcluded: excludedRecordings[rec.id] || false,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
      
      // Calculate medians only from INCLUDED recordings with valid values
      const includedWithValues = stimData.filter(r => !r.isExcluded && r.values !== null).map(r => r.values);
      const medians = {
        ln_rmssd70: median(includedWithValues.map(v => v.ln_rmssd70)),
        ln_sdnn70: median(includedWithValues.map(v => v.ln_sdnn70)),
        pnn50: median(includedWithValues.map(v => v.pnn50)),
      };
      
      stimTables.push({
        stimIndex: stimIdx + 1,
        recordings: stimData,
        medians,
        includedCount: includedWithValues.length,
      });
    }
    
    return stimTables;
  }, [comparisonData, excludedRecordings]);

  // HRA metric definitions for Per Metrics tables (with Y-axis scale config)
  // Removed Baseline BF as per user request
  const hraMetricDefs = useMemo(() => [
    { key: 'avg_bf', label: 'Avg BF', decimals: 1, showBaseline: true, yDomain: null },
    { key: 'peak_bf', label: 'Peak BF', decimals: 1, showBaseline: true, yDomain: null },
    { key: 'peak_norm', label: 'Peak %', decimals: 1, yDomain: [0, 200], showBaselinePct: true },
    { key: 'ttp', label: 'TTP', decimals: 1, yDomain: [0, 30] },
    { key: 'recovery_bf', label: 'Rec. BF', decimals: 1, showBaseline: true, yDomain: null },
    { key: 'recovery_pct', label: 'Rec. %', decimals: 1, yDomain: [0, 200], showBaselinePct: true },
    { key: 'amplitude', label: 'Amp.', decimals: 1, yDomain: null },
    { key: 'roc', label: 'RoC', decimals: 4, yDomain: [-2, 2] },
  ], []);

  // HRV metric definitions for Per Metrics tables (with Y-axis scale config)
  const hrvMetricDefs = useMemo(() => [
    { key: 'ln_rmssd70', label: 'ln(RMSSD₇₀) corr.', decimals: 3, yDomain: [0, 8] },
    { key: 'ln_sdnn70', label: 'ln(SDNN₇₀) corr.', decimals: 3, yDomain: [0, 8] },
    { key: 'pnn50', label: 'pNN50₇₀ corr. (%)', decimals: 1, yDomain: [0, 100] },
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
          stimValues.push(stim ? stim[metric.key] : null);
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
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimAvg: colAvgs[i],
          stimAvg: stimAvg,
          // Add baseline BF for metrics that show it (Avg BF, Peak BF, Rec. BF)
          ...(metric.showBaseline ? { baseline: baselineColAvgs[i] } : {}),
          // Add 100% baseline for percentage metrics (Peak %, Rec. %)
          ...(metric.showBaselinePct ? { baselinePct: 100 } : {})
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
        stimAvg: stimAvg,
        ...(metric.showBaseline ? { baseline: baselineGrandAvg } : {}),
        ...(metric.showBaselinePct ? { baselinePct: 100 } : {}),
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
        const dataPoint = { 
          stim: `Stim ${i + 1}`, 
          perStimMedian: colMedians[i],
          stimMedian: stimMedian
        };
        includedRecs.forEach(rec => {
          dataPoint[rec.name] = rec.stimValues[i];
        });
        chartData.push(dataPoint);
      }
      // Add median column to chart
      chartData.push({
        stim: 'Median',
        perStimMedian: grandMedian,
        stimMedian: stimMedian,
        ...Object.fromEntries(includedRecs.map(rec => [rec.name, rec.rowMedian]))
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
          {/* Create a card for each unique drug (or one default if no drugs) */}
          {(uniqueDrugs.length > 0 ? uniqueDrugs : [{ key: 'default', name: 'Drug' }]).map((drug, drugIdx) => (
            <Card key={drug.key} className={`bg-zinc-900/30 border-zinc-800 rounded-sm ${drugIdx > 0 ? 'mt-4' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-medium text-zinc-300">Spontaneous Activity Comparison</CardTitle>
                  {uniqueDrugs.length > 0 && (
                    <Badge className="bg-purple-600 text-white text-[10px] px-2 py-0.5">
                      {drug.name}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
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
                        <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap">{drug.name} BF</th>
                        <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">{drug.name} ln(RMSSD<sub>70</sub>)</span></th>
                        <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">{drug.name} ln(SDNN<sub>70</sub>)</span></th>
                        <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30 whitespace-nowrap"><span className="whitespace-nowrap">{drug.name} pNN50<sub>70</sub></span></th>
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
                    <span className="font-medium">Normalized to Baseline</span>
                  </button>
                
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      spontNormExpanded[drug.key] ? 'max-h-[800px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                            <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                            <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline ln(RMSSD) (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline ln(SDNN) (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline pNN50 (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">{drug.name} BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">{drug.name} ln(RMSSD) (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">{drug.name} ln(SDNN) (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-purple-400 bg-purple-950/30">{drug.name} pNN50 (%)</th>
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
              </CardContent>
            </Card>
          ))}
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
                        <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                        <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                        <th className="text-center py-2 px-1 font-medium text-cyan-400 bg-cyan-950/30">
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
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_peak_norm, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_first, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_ttp_avg, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_bf, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_recovery_pct, 1)}</td>
                            <td className="py-2 px-1 text-center text-zinc-300">{formatValue(rec.light_amplitude, 1)}</td>
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
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_peak_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_peak_norm, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_ttp_first, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_ttp_avg, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_recovery_bf, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_recovery_pct, 1)}</td>
                        <td className="py-3 px-1 text-center text-amber-100 text-xs">{formatValue(computedLightHRAAverages?.light_amplitude, 1)}</td>
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
                            <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                            <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                            <th className="text-center py-2 px-2 font-medium text-cyan-400 bg-cyan-950/30">Baseline BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Avg BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Peak BF (%)</th>
                            <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Recovery BF (%)</th>
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
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setHraPerMetricExpanded(!hraPerMetricExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-hra-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${hraPerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics</span>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      hraPerMetricExpanded ? 'max-h-[8000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {perMetricHRAData.length > 0 ? (
                      <div className="space-y-6">
                        {perMetricHRAData.map((metricData) => (
                          <div key={metricData.key} className="bg-zinc-900/40 rounded-lg p-3">
                            <h4 className={`text-sm font-semibold mb-3 ${metricData.color === 'cyan' ? 'text-cyan-400' : 'text-amber-400'}`}>{metricData.label}</h4>
                            
                            {/* Visualization Chart */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                  <XAxis dataKey="stim" stroke="#a1a1aa" tick={{ fontSize: 10 }} />
                                  <YAxis 
                                    stroke="#a1a1aa" 
                                    tick={{ fontSize: 10 }} 
                                    domain={metricData.yDomain || ['auto', 'auto']}
                                  />
                                  <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
                                    labelStyle={{ color: '#fbbf24' }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  {/* Baseline BF trace for Avg BF, Peak BF, Recovery BF charts */}
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
                                  <Line 
                                    type="monotone" 
                                    dataKey="average" 
                                    stroke={metricData.color === 'cyan' ? '#06b6d4' : '#f59e0b'}
                                    strokeWidth={3}
                                    dot={{ fill: metricData.color === 'cyan' ? '#06b6d4' : '#f59e0b', r: 4 }}
                                    name="Folder Average"
                                  />
                                  <ReferenceLine y={metricData.grandAvg} stroke={metricData.color === 'cyan' ? '#06b6d4' : '#f59e0b'} strokeDasharray="5 5" strokeOpacity={0.5} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Data Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-zinc-800">
                                    <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                                    <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                                    <th className={`text-center py-2 px-2 font-medium ${metricData.color === 'cyan' ? 'text-cyan-400 bg-cyan-950/30' : 'text-amber-400 bg-amber-950/30'}`}>Stim 1</th>
                                    <th className={`text-center py-2 px-2 font-medium ${metricData.color === 'cyan' ? 'text-cyan-400 bg-cyan-950/30' : 'text-amber-400 bg-amber-950/30'}`}>Stim 2</th>
                                    <th className={`text-center py-2 px-2 font-medium ${metricData.color === 'cyan' ? 'text-cyan-400 bg-cyan-950/30' : 'text-amber-400 bg-amber-950/30'}`}>Stim 3</th>
                                    <th className={`text-center py-2 px-2 font-medium ${metricData.color === 'cyan' ? 'text-cyan-400 bg-cyan-950/30' : 'text-amber-400 bg-amber-950/30'}`}>Stim 4</th>
                                    <th className={`text-center py-2 px-2 font-medium ${metricData.color === 'cyan' ? 'text-cyan-400 bg-cyan-950/30' : 'text-amber-400 bg-amber-950/30'}`}>Stim 5</th>
                                    <th className="text-center py-2 px-2 font-medium text-yellow-400 bg-yellow-950/30">Average</th>
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
                      <p className="text-zinc-500 text-sm">No per-metric data available</p>
                    )}
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
                        <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                        <th className="text-left py-2 px-3 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">ln(RMSSD<sub>70</sub>) corr.</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">ln(SDNN<sub>70</sub>) corr.</th>
                        <th className="text-center py-2 px-3 font-medium text-amber-400 bg-amber-950/30">pNN50<sub>70</sub> corr. (%)</th>
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
                <div className="mt-4 pt-3 border-t border-zinc-800/50">
                  <button
                    onClick={() => setHrvPerMetricExpanded(!hrvPerMetricExpanded)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-1"
                    data-testid="expand-hrv-per-metric"
                  >
                    <ChevronRight 
                      className={`w-4 h-4 transition-transform duration-200 ${hrvPerMetricExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="font-medium">Per Metrics</span>
                  </button>
                  
                  <div 
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      hrvPerMetricExpanded ? 'max-h-[5000px] opacity-100 mt-3' : 'max-h-0 opacity-0'
                    }`}
                  >
                    {perMetricHRVData.length > 0 ? (
                      <div className="space-y-6">
                        {perMetricHRVData.map((metricData) => (
                          <div key={metricData.key} className="bg-zinc-900/40 rounded-lg p-3">
                            <h4 className="text-sm font-semibold text-amber-400 mb-3">{metricData.label}</h4>
                            
                            {/* Visualization Chart */}
                            <div className="h-48 mb-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={metricData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                  <XAxis dataKey="stim" stroke="#a1a1aa" tick={{ fontSize: 10 }} />
                                  <YAxis 
                                    stroke="#a1a1aa" 
                                    tick={{ fontSize: 10 }} 
                                    domain={metricData.yDomain || ['auto', 'auto']}
                                  />
                                  <RechartsTooltip 
                                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '6px' }}
                                    labelStyle={{ color: '#fbbf24' }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  <Line 
                                    type="monotone" 
                                    dataKey="median" 
                                    stroke="#f59e0b" 
                                    strokeWidth={3}
                                    dot={{ fill: '#f59e0b', r: 4 }}
                                    name="Folder Median"
                                  />
                                  <ReferenceLine y={metricData.grandMedian} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.5} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Data Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-zinc-800">
                                    <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
                                    <th className="text-left py-2 px-2 font-medium text-zinc-400 bg-zinc-900/50">Recording</th>
                                    <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Stim 1</th>
                                    <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Stim 2</th>
                                    <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Stim 3</th>
                                    <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Stim 4</th>
                                    <th className="text-center py-2 px-2 font-medium text-amber-400 bg-amber-950/30">Stim 5</th>
                                    <th className="text-center py-2 px-2 font-medium text-yellow-400 bg-yellow-950/30">Median</th>
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
                      <p className="text-zinc-500 text-sm">No per-metric data available</p>
                    )}
                  </div>
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
                      <th className="text-left py-2 px-1 font-medium text-zinc-400 bg-zinc-900/50 w-8"></th>
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
