import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, Loader2, ChevronRight, ArrowLeft, Play, Settings2, Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Info tooltip component
function InfoTip({ text, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center cursor-help">
            {children}
            <Info className="w-3 h-3 ml-1" style={{ color: 'var(--text-tertiary)' }} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs glass-surface z-50" style={{ color: 'var(--text-primary)' }}>
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Expected MEA CSV files
const EXPECTED_FILES = [
  { name: 'spike_list.csv', required: ['timestamp', 'electrode', 'well'], description: 'Spike timestamps per electrode' },
  { name: 'electrode_burst_list.csv', required: ['well', 'electrode', 'start', 'stop'], description: 'Burst events per electrode' },
  { name: 'network_burst_list.csv', required: ['well', 'start', 'stop'], description: 'Network-level burst events' },
  { name: 'spike_counts.csv', required: ['electrode', 'well', 'spike_count', 'duration'], description: 'Spike counts for filtering' },
  { name: 'environmental_data.csv', required: ['timestamp', 'temperature', 'CO2'], description: 'Environmental conditions' },
];

// Parse Axion Biosystems CSV format
// These files have metadata in columns 1-2, actual data starts at column 3+
// The header row contains both metadata labels and data column headers
function parseAxionCSV(text, fileType) {
  // Remove BOM if present
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse the header line to find data columns
  const headerLine = lines[0];
  const allHeaders = headerLine.split(',').map(h => h.trim().replace(/['"]/g, ''));
  
  // For Axion format, identify where actual data columns start
  // Metadata columns are typically: "Investigator", "KB" or "Recording Name", etc.
  // Data columns have headers like "Time (s)", "Electrode", "Amplitude (mV)", "Well", etc.
  
  let dataStartCol = 0;
  const dataHeaders = [];
  
  // Find the first column that looks like a data header
  for (let i = 0; i < allHeaders.length; i++) {
    const h = allHeaders[i].toLowerCase();
    if (h.includes('time') || h.includes('electrode') || h.includes('well') || 
        h.includes('amplitude') || h.includes('interval') || h.includes('heater') ||
        h.includes('size') || h.includes('duration')) {
      dataStartCol = i;
      break;
    }
  }
  
  // Extract and normalize data headers
  for (let i = dataStartCol; i < allHeaders.length; i++) {
    let cleaned = allHeaders[i]
      .replace(/\s*\(.*?\)\s*/g, '') // Remove units in parentheses like (s), (mV)
      .replace(/\s+/g, '_')
      .toLowerCase()
      .trim();
    
    // Normalize common column name variations
    if (cleaned === 'well_id' || cleaned === 'wellid' || cleaned === 'well_name') {
      cleaned = 'well';
    }
    if (cleaned === 'time' || cleaned === 'time_s' || cleaned === 'timestamp_s') {
      cleaned = 'timestamp';
    }
    if (cleaned === 'start_s' || cleaned === 'start_time') {
      cleaned = 'start';
    }
    if (cleaned === 'stop_s' || cleaned === 'stop_time' || cleaned === 'end' || cleaned === 'end_s') {
      cleaned = 'stop';
    }
    if (cleaned === 'duration_s' || cleaned === 'dur') {
      cleaned = 'duration';
    }
    if (cleaned === 'size') {
      cleaned = 'spike_count';
    }
    if (cleaned === 'number_of_electrodes') {
      cleaned = 'electrode_count';
    }
    
    dataHeaders.push(cleaned);
  }
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const allValues = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
    
    // Extract only data columns (skip metadata columns)
    const dataValues = allValues.slice(dataStartCol);
    
    // Skip rows where data columns are empty (metadata-only rows)
    const hasData = dataValues.some(v => v && v.length > 0);
    if (!hasData) continue;
    
    const row = {};
    dataHeaders.forEach((h, idx) => {
      let val = dataValues[idx] || '';
      // Try to parse as number
      const num = parseFloat(val);
      if (!isNaN(num)) {
        row[h] = num;
      } else {
        // Normalize electrode names to uppercase for consistent matching
        if (h === 'electrode' && val) {
          row[h] = val.toUpperCase();
        } else {
          row[h] = val;
        }
      }
    });
    
    // Skip rows that are clearly metadata (first column is a settings label)
    if (row.timestamp === '' || (typeof row.timestamp === 'string' && row.timestamp.length === 0)) {
      continue;
    }
    
    data.push(row);
  }
  
  return data;
}

// Extract well ID from Axion electrode format (e.g., "A2_44" -> "A2")
function extractWellFromElectrode(electrode) {
  if (!electrode || typeof electrode !== 'string') return null;
  
  // Axion format: WellRow+WellCol_ElectrodeNum (e.g., "A2_44", "B1_65")
  const match = electrode.match(/^([A-Ha-h])(\d+)_\d+$/i);
  if (match) {
    return `${match[1].toUpperCase()}${match[2]}`;
  }
  
  // Also try format without underscore: "A244" -> "A2"
  const altMatch = electrode.match(/^([A-Ha-h])(\d)(\d{2})$/i);
  if (altMatch) {
    return `${altMatch[1].toUpperCase()}${altMatch[2]}`;
  }
  
  return null;
}

// Parse spike_counts.csv which has a wide format with wells and electrodes as columns
function parseSpikeCountsAxion(text) {
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.trim().split('\n');
  if (lines.length < 2) return { wellTotals: {}, electrodeData: [], totalDuration: 0 };
  
  // Parse header to find column positions
  const headerLine = lines[0];
  const allHeaders = headerLine.split(',').map(h => h.trim().replace(/['"]/g, ''));
  
  // Find where the well/electrode columns start (after metadata and time columns)
  // Format: Investigator, KB, Interval Start (S), Interval End (S), [empty], A1, A2, A3, B1, B2, B3, [empty], A1_11, A1_12, ...
  
  const wellColumns = []; // {col: index, wellId: 'A1'}
  const electrodeColumns = []; // {col: index, electrode: 'A1_11', wellId: 'A1'}
  
  for (let i = 0; i < allHeaders.length; i++) {
    const h = allHeaders[i].trim();
    if (!h) continue;
    
    // Well columns are like "A1", "A2", "B1" (single letter + single digit, 1-3 chars)
    // Pattern: [A-H][1-9] (no underscore)
    if (/^[A-Ha-h][1-9]$/.test(h)) {
      wellColumns.push({ col: i, wellId: h.toUpperCase() });
    }
    
    // Electrode columns are like "A1_11", "A2_44", "B1_65" (well_electrode format)
    // Pattern: [A-H][1-9]_[0-9]+ 
    else if (/^[A-Ha-h][1-9]_\d+$/.test(h)) {
      const wellId = extractWellFromElectrode(h);
      if (wellId) {
        electrodeColumns.push({ col: i, electrode: h.toUpperCase(), wellId: wellId });
      }
    }
  }
  
  console.log(`parseSpikeCountsAxion: Found ${wellColumns.length} well columns, ${electrodeColumns.length} electrode columns`);
  
  // Find the time interval columns
  let intervalStartCol = -1;
  let intervalEndCol = -1;
  for (let i = 0; i < allHeaders.length; i++) {
    const h = allHeaders[i].toLowerCase();
    if (h.includes('interval') && h.includes('start')) intervalStartCol = i;
    if (h.includes('interval') && h.includes('end')) intervalEndCol = i;
  }
  
  // Aggregate spike counts per electrode across all time intervals
  const electrodeSpikeTotals = {}; // electrode -> total spike count
  const wellSpikeTotals = {}; // well -> total spike count
  let totalDuration = 0;
  let lastValidEnd = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
    
    // Track the maximum interval end time for total duration
    if (intervalEndCol >= 0) {
      const end = parseFloat(values[intervalEndCol]);
      if (!isNaN(end) && end > lastValidEnd) {
        lastValidEnd = end;
      }
    }
    
    // Sum well totals
    wellColumns.forEach(({ col, wellId }) => {
      const count = parseInt(values[col]) || 0;
      wellSpikeTotals[wellId] = (wellSpikeTotals[wellId] || 0) + count;
    });
    
    // Sum electrode totals
    electrodeColumns.forEach(({ col, electrode, wellId }) => {
      const count = parseInt(values[col]) || 0;
      if (!electrodeSpikeTotals[electrode]) {
        electrodeSpikeTotals[electrode] = { electrode, wellId, spike_count: 0 };
      }
      electrodeSpikeTotals[electrode].spike_count += count;
    });
  }
  
  totalDuration = lastValidEnd;
  console.log(`parseSpikeCountsAxion: Total duration = ${totalDuration}s, Electrodes with data = ${Object.keys(electrodeSpikeTotals).length}`);
  
  // Convert to array format with firing rate
  const electrodeData = Object.values(electrodeSpikeTotals).map(e => ({
    electrode: e.electrode,
    well: e.wellId,
    spike_count: e.spike_count,
    duration: totalDuration,
    firing_rate_hz: totalDuration > 0 ? e.spike_count / totalDuration : 0,
  }));
  
  return { wellTotals: wellSpikeTotals, electrodeData, totalDuration };
}

// Validate well ID format - accepts various formats:
// - A1-H12 (standard 96-well plate)
// - A01-H12 (with leading zero)
// - Well_A1, Well A1 (with prefix)
// - Any alphanumeric identifier
function isValidWellId(wellId) {
  if (!wellId || typeof wellId !== 'string') return false;
  const str = String(wellId).trim();
  if (str.length === 0) return false;
  
  // Standard format A1-H12 or A01-H12
  const standardMatch = str.match(/^([A-Ha-h])(\d{1,2})$/);
  if (standardMatch) {
    const col = parseInt(standardMatch[2]);
    return col >= 1 && col <= 12;
  }
  
  // With "Well" prefix: Well_A1, Well A1, Well_A01
  const prefixMatch = str.match(/^Well[_\s]?([A-Ha-h])(\d{1,2})$/i);
  if (prefixMatch) {
    const col = parseInt(prefixMatch[2]);
    return col >= 1 && col <= 12;
  }
  
  // Accept any non-empty alphanumeric string as a valid well identifier
  // This handles custom naming conventions
  return /^[A-Za-z0-9_-]+$/.test(str);
}

// Normalize well ID to a consistent format
function normalizeWellId(wellId) {
  if (!wellId) return null;
  const str = String(wellId).trim();
  if (str.length === 0) return null;
  
  // Standard format - normalize to uppercase
  const standardMatch = str.match(/^([A-Ha-h])(\d{1,2})$/);
  if (standardMatch) {
    return `${standardMatch[1].toUpperCase()}${parseInt(standardMatch[2])}`;
  }
  
  // With "Well" prefix - extract and normalize
  const prefixMatch = str.match(/^Well[_\s]?([A-Ha-h])(\d{1,2})$/i);
  if (prefixMatch) {
    return `${prefixMatch[1].toUpperCase()}${parseInt(prefixMatch[2])}`;
  }
  
  // Return as-is for custom identifiers (just trim and uppercase)
  return str.toUpperCase();
}

export default function MEAUpload({ onDataParsed, onBack, preloadedFiles }) {
  const [files, setFiles] = useState({});
  const [fileStatus, setFileStatus] = useState({});
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [selectedWells, setSelectedWells] = useState({});
  const [electrodeFilter, setElectrodeFilter] = useState({ min_hz: 0.05, max_hz: null });

  // Handle file drop/selection - uses suffix matching for flexible file names
  const handleFiles = useCallback((fileList) => {
    const newFiles = { ...files };
    const newStatus = { ...fileStatus };
    
    Array.from(fileList).forEach(file => {
      const fileName = file.name.toLowerCase();
      
      // Find expected file by suffix matching (e.g., "prefix_spike_list.csv" matches "spike_list.csv")
      const expectedFile = EXPECTED_FILES.find(ef => fileName.endsWith(ef.name));
      
      if (expectedFile) {
        newFiles[expectedFile.name] = file;
        newStatus[expectedFile.name] = 'pending';
      }
    });
    
    setFiles(newFiles);
    setFileStatus(newStatus);
    setParseError(null);
  }, [files, fileStatus]);

  // Process preloaded files from home page
  useEffect(() => {
    if (preloadedFiles && preloadedFiles.length > 0) {
      handleFiles(preloadedFiles);
    }
  }, [preloadedFiles]); // Only run on mount with preloaded files

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleFileInput = useCallback((e) => {
    handleFiles(e.target.files);
  }, [handleFiles]);

  // Check if all required files are present
  const allFilesPresent = EXPECTED_FILES.every(ef => files[ef.name]);
  const missingFiles = EXPECTED_FILES.filter(ef => !files[ef.name]).map(ef => ef.name);

  // Parse all CSV files
  const parseAllFiles = async () => {
    setParsing(true);
    setParseError(null);
    const newStatus = {};
    
    try {
      // Step 1: Parse spike_list.csv to get unique wells
      // In Axion format, the well ID is embedded in the Electrode column (e.g., "A2_44" -> well "A2")
      newStatus['spike_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const spikeListText = await files['spike_list.csv'].text();
      const spikeListRaw = parseAxionCSV(spikeListText, 'spike_list');
      
      if (spikeListRaw.length === 0) {
        throw new Error('spike_list.csv is empty or malformed');
      }
      
      // Extract unique well IDs from the electrode column (Axion format)
      const wellSet = new Set();
      const spikeList = spikeListRaw.map(row => {
        // Extract well from electrode (e.g., "A2_44" -> "A2")
        let wellId = null;
        if (row.electrode) {
          wellId = extractWellFromElectrode(String(row.electrode));
        }
        // Fallback to direct well column if present
        if (!wellId && row.well) {
          wellId = normalizeWellId(row.well);
        }
        
        if (wellId) {
          wellSet.add(wellId);
        }
        
        return {
          ...row,
          well: wellId,
        };
      }).filter(row => row.well); // Only keep rows with valid wells
      
      if (wellSet.size === 0) {
        throw new Error('No valid well IDs found in spike_list.csv. Expected electrode format like "A2_44" or a "well" column.');
      }
      
      console.log(`Found ${wellSet.size} wells:`, Array.from(wellSet));
      
      newStatus['spike_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 2: Parse spike_counts.csv for electrode filtering (Axion wide format)
      newStatus['spike_counts.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const spikeCountsText = await files['spike_counts.csv'].text();
      const { electrodeData, totalDuration } = parseSpikeCountsAxion(spikeCountsText);
      
      console.log(`electrodeData count: ${electrodeData.length}, totalDuration: ${totalDuration}`);
      if (electrodeData.length > 0) {
        console.log('Sample electrode data:', electrodeData.slice(0, 3));
      }
      
      // Build electrode registry per well
      const electrodeRegistry = {};
      wellSet.forEach(well => {
        electrodeRegistry[well] = [];
      });
      
      electrodeData.forEach(row => {
        const wellId = row.well ? row.well.toUpperCase() : null;
        if (wellId && wellSet.has(wellId)) {
          electrodeRegistry[wellId].push({
            electrode: row.electrode,
            spike_count: row.spike_count,
            duration: row.duration || totalDuration,
            firing_rate_hz: row.firing_rate_hz,
          });
        }
      });
      
      console.log('Electrode registry:', Object.keys(electrodeRegistry).map(w => `${w}: ${electrodeRegistry[w].length} electrodes`));
      
      newStatus['spike_counts.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 3: Parse electrode_burst_list.csv (Axion format with electrode column)
      newStatus['electrode_burst_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const electrodeBurstText = await files['electrode_burst_list.csv'].text();
      const electrodeBurstsRaw = parseAxionCSV(electrodeBurstText, 'electrode_burst');
      
      // Assign bursts to electrodes per well
      const burstsByWell = {};
      wellSet.forEach(well => {
        burstsByWell[well] = [];
      });
      
      electrodeBurstsRaw.forEach(row => {
        // Extract well from electrode column
        let wellId = null;
        if (row.electrode) {
          wellId = extractWellFromElectrode(String(row.electrode));
        }
        if (!wellId && row.well) {
          wellId = normalizeWellId(row.well);
        }
        
        if (wellId && wellSet.has(wellId)) {
          burstsByWell[wellId].push({
            electrode: row.electrode,
            start: row.timestamp || row.start,
            stop: (row.timestamp || row.start) + (row.duration || 0),
            spike_count: row.spike_count,
            duration: row.duration,
          });
        }
      });
      
      newStatus['electrode_burst_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 4: Parse network_burst_list.csv (has direct Well column)
      newStatus['network_burst_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const networkBurstText = await files['network_burst_list.csv'].text();
      const networkBurstsRaw = parseAxionCSV(networkBurstText, 'network_burst');
      
      const networkBurstsByWell = {};
      wellSet.forEach(well => {
        networkBurstsByWell[well] = [];
      });
      
      networkBurstsRaw.forEach(row => {
        const wellId = normalizeWellId(row.well);
        if (wellId && wellSet.has(wellId)) {
          networkBurstsByWell[wellId].push({
            start: row.timestamp || row.start,
            stop: (row.timestamp || row.start) + (row.duration || 0),
            electrode_count: row.electrode_count,
            spike_count: row.spike_count,
            duration: row.duration,
          });
        }
      });
      
      newStatus['network_burst_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 5: Parse environmental_data.csv
      newStatus['environmental_data.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const envText = await files['environmental_data.csv'].text();
      const envData = parseAxionCSV(envText, 'environmental');
      
      newStatus['environmental_data.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 6: Apply electrode filter and build per-well data
      const wellData = {};
      const minHz = electrodeFilter.min_hz || 0;
      const maxHz = electrodeFilter.max_hz;
      
      wellSet.forEach(well => {
        const electrodes = electrodeRegistry[well] || [];
        const activeElectrodes = electrodes.filter(e => {
          const rate = e.firing_rate_hz;
          if (rate < minHz) return false;
          if (maxHz !== null && rate > maxHz) return false;
          return true;
        });
        
        // Get spikes for this well
        const wellSpikes = spikeList.filter(s => s.well === well);
        
        // Calculate mean firing rate across active electrodes
        const meanFiringRate = activeElectrodes.length > 0
          ? activeElectrodes.reduce((sum, e) => sum + e.firing_rate_hz, 0) / activeElectrodes.length
          : 0;
        
        // Get recording duration from spike timestamps or from spike_counts
        const timestamps = wellSpikes.map(s => s.timestamp).filter(t => !isNaN(t));
        const duration = timestamps.length > 0 
          ? Math.max(...timestamps) - Math.min(...timestamps)
          : totalDuration;
        
        wellData[well] = {
          well_id: well,
          n_electrodes: electrodes.length,
          n_active_electrodes: activeElectrodes.length,
          active_electrodes: activeElectrodes.map(e => e.electrode),
          mean_firing_rate_hz: meanFiringRate,
          total_spikes: wellSpikes.length,
          duration_s: duration,
          electrode_bursts: burstsByWell[well],
          network_bursts: networkBurstsByWell[well],
          spikes: wellSpikes,
        };
      });
      
      // Initialize all wells as selected
      const initialSelection = {};
      Object.keys(wellData).forEach(well => {
        initialSelection[well] = true;
      });
      setSelectedWells(initialSelection);
      
      // Store parsed data
      // Plate ID: use the spike_list filename without 'spike_list' suffix, or default to 'MEA_plate'
      let plateId = files['spike_list.csv'].name.replace('.csv', '');
      if (plateId === 'spike_list') {
        plateId = 'MEA_plate';
      }
      
      const result = {
        wells: wellData,
        environmental_data: envData,
        plate_id: plateId,
        electrode_filter: electrodeFilter,
      };
      
      setParsedData(result);
      
    } catch (error) {
      console.error('Parse error:', error);
      setParseError(error.message);
      
      // Mark current file as error
      Object.keys(newStatus).forEach(key => {
        if (newStatus[key] === 'parsing') {
          newStatus[key] = 'error';
        }
      });
      setFileStatus(newStatus);
    } finally {
      setParsing(false);
    }
  };

  // Handle well selection toggle
  const toggleWellSelection = (wellId) => {
    setSelectedWells(prev => ({
      ...prev,
      [wellId]: !prev[wellId]
    }));
  };

  // Proceed with selected wells
  const handleProceed = () => {
    if (!parsedData) return;
    
    const selectedWellIds = Object.keys(selectedWells).filter(w => selectedWells[w]);
    if (selectedWellIds.length === 0) {
      setParseError('Please select at least one well to analyze');
      return;
    }
    
    // Filter to selected wells only
    const filteredWells = {};
    selectedWellIds.forEach(wellId => {
      filteredWells[wellId] = parsedData.wells[wellId];
    });
    
    onDataParsed({
      ...parsedData,
      wells: filteredWells,
      selected_wells: selectedWellIds,
      // Include binning settings for MEAAnalysis
      binning_config: {
        spike_bin_s: spikeBinSize,
        burst_bin_s: burstBinSize,
      },
    });
  };

  // Binning configuration state
  const [spikeBinSize, setSpikeBinSize] = useState(5);
  const [burstBinSize, setBurstBinSize] = useState(30);

  // Get file icon based on status
  const getFileIcon = (fileName) => {
    const status = fileStatus[fileName];
    const hasFile = files[fileName];
    
    if (!hasFile) return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />;
    if (status === 'parsing') return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--mea-accent)' }} />;
    if (status === 'success') return <CheckCircle className="w-4 h-4" style={{ color: 'var(--sem-accent)' }} />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
    return <CheckCircle className="w-4 h-4" style={{ color: 'var(--sem-accent)' }} />;
  };

  // Render well selection view
  if (parsedData) {
    const wells = Object.values(parsedData.wells).sort((a, b) => a.well_id.localeCompare(b.well_id));
    const selectedCount = Object.values(selectedWells).filter(v => v).length;
    
    return (
      <div className="flex items-center justify-center min-h-[70vh] pt-16 relative" data-testid="mea-select-wells-page">
        {/* Ambient MEA glow orb */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute w-[600px] h-[600px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              background: 'radial-gradient(circle, rgba(0, 184, 196, 0.35) 0%, transparent 70%)',
              filter: 'blur(100px)'
            }}
          />
        </div>
        
        <div className="w-full max-w-5xl mx-auto p-6 relative z-10">
          <div className="glass-surface rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-display" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    Select Wells for Analysis
                  </h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {wells.length} wells detected • Configure analysis settings below
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge 
                    variant="outline" 
                    className="font-data text-xs"
                    style={{ borderColor: 'rgba(0, 184, 196, 0.4)', color: '#00b8c4' }}
                  >
                    {selectedCount} wells selected
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="font-data text-xs"
                    style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'var(--text-tertiary)' }}
                  >
                    Filter: ≥{electrodeFilter.min_hz} Hz
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Well Selection Table */}
              <div 
                className="rounded-xl overflow-hidden"
                style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid rgba(255,255,255,0.08)' 
                }}
              >
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0" style={{ background: 'rgba(12, 12, 14, 0.95)' }}>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                        <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Select</th>
                        <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Well</th>
                        <th className="text-center py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Active Electrodes</th>
                        <th className="text-center py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Mean Rate (Hz)</th>
                        <th className="text-center py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Total Spikes</th>
                        <th className="text-center py-3 px-4 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Duration (s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wells.map(well => (
                        <tr 
                          key={well.well_id} 
                          className="transition-all cursor-pointer"
                          style={{ 
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            opacity: selectedWells[well.well_id] ? 1 : 0.4,
                            background: selectedWells[well.well_id] ? 'rgba(0, 184, 196, 0.05)' : 'transparent'
                          }}
                          onClick={() => toggleWellSelection(well.well_id)}
                        >
                          <td className="py-3 px-4">
                            <Checkbox
                              checked={selectedWells[well.well_id]}
                              onCheckedChange={() => toggleWellSelection(well.well_id)}
                              data-testid={`well-checkbox-${well.well_id}`}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-medium" style={{ color: '#00b8c4' }}>{well.well_id}</td>
                          <td className="py-3 px-4 text-center font-data" style={{ color: 'var(--text-secondary)' }}>
                            {well.n_active_electrodes} / {well.n_electrodes}
                          </td>
                          <td className="py-3 px-4 text-center font-data" style={{ color: 'var(--text-secondary)' }}>
                            {well.mean_firing_rate_hz.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center font-data" style={{ color: 'var(--text-secondary)' }}>
                            {well.total_spikes.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center font-data" style={{ color: 'var(--text-secondary)' }}>
                            {well.duration_s.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Analysis Settings - Electrode Filter & Binning */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Electrode Filter */}
                <div 
                  className="rounded-xl p-4"
                  style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.08)' 
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="w-4 h-4" style={{ color: '#00b8c4' }} />
                    <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Electrode Filter
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        <InfoTip text="Minimum firing rate threshold. Electrodes below this rate are excluded.">
                          Min Firing Rate (Hz)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={electrodeFilter.min_hz}
                        onChange={(e) => setElectrodeFilter(prev => ({ ...prev, min_hz: parseFloat(e.target.value) || 0 }))}
                        className="h-8 text-xs font-data rounded-lg"
                        style={{ 
                          background: 'rgba(255,255,255,0.06)', 
                          border: '1px solid rgba(255,255,255,0.12)', 
                          color: 'var(--text-primary)' 
                        }}
                        min={0}
                        step={0.01}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        <InfoTip text="Maximum firing rate threshold. Leave empty for no upper limit.">
                          Max Firing Rate (Hz)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={electrodeFilter.max_hz || ''}
                        onChange={(e) => setElectrodeFilter(prev => ({ ...prev, max_hz: parseFloat(e.target.value) || '' }))}
                        className="h-8 text-xs font-data rounded-lg"
                        style={{ 
                          background: 'rgba(255,255,255,0.06)', 
                          border: '1px solid rgba(255,255,255,0.12)', 
                          color: 'var(--text-primary)' 
                        }}
                        min={0}
                        step={0.01}
                        placeholder="No limit"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Binning Settings */}
                <div 
                  className="rounded-xl p-4"
                  style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.08)' 
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Settings2 className="w-4 h-4" style={{ color: '#00b8c4' }} />
                    <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Binning Settings
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        <InfoTip text="Time bin size for spike rate calculation (1-60 seconds).">
                          Spike Bin Size (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={spikeBinSize}
                        onChange={(e) => setSpikeBinSize(Math.min(60, Math.max(1, parseInt(e.target.value) || 5)))}
                        className="h-8 text-xs font-data rounded-lg"
                        style={{ 
                          background: 'rgba(255,255,255,0.06)', 
                          border: '1px solid rgba(255,255,255,0.12)', 
                          color: 'var(--text-primary)' 
                        }}
                        min={1}
                        max={60}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        <InfoTip text="Time bin size for burst rate calculation (5-120 seconds).">
                          Burst Bin Size (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={burstBinSize}
                        onChange={(e) => setBurstBinSize(Math.min(120, Math.max(5, parseInt(e.target.value) || 30)))}
                        className="h-8 text-xs font-data rounded-lg"
                        style={{ 
                          background: 'rgba(255,255,255,0.06)', 
                          border: '1px solid rgba(255,255,255,0.12)', 
                          color: 'var(--text-primary)' 
                        }}
                        min={5}
                        max={120}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Error message */}
              {parseError && (
                <div 
                  className="p-3 rounded-lg text-sm"
                  style={{ 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171'
                  }}
                >
                  {parseError}
                </div>
              )}
              
              {/* Actions */}
              <div className="flex justify-between items-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl transition-all"
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
                  onClick={() => {
                    setParsedData(null);
                    setFiles({});
                    setFileStatus({});
                  }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Upload Different Files
                </Button>
                <Button
                  onClick={handleProceed}
                  disabled={selectedCount === 0}
                  className="h-10 px-6 rounded-xl font-medium transition-all"
                  style={{
                    background: selectedCount > 0 ? '#00b8c4' : 'rgba(255,255,255,0.1)',
                    color: selectedCount > 0 ? '#000' : 'var(--text-tertiary)',
                    boxShadow: selectedCount > 0 ? '0 0 25px rgba(0, 184, 196, 0.3)' : 'none',
                  }}
                  data-testid="mea-run-analysis-btn"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run Analysis
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render upload view
  return (
    <div className="flex items-center justify-center min-h-[70vh] pt-16 relative" data-testid="mea-upload-page">
      {/* Ambient MEA glow orb */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            background: 'radial-gradient(circle, rgba(0, 184, 196, 0.40) 0%, transparent 70%)',
            filter: 'blur(100px)'
          }}
        />
      </div>
      
      <Card className="w-full max-w-2xl glass-surface relative z-10">
        <CardHeader>
          <CardTitle className="text-xl font-display" style={{ color: 'var(--text-primary)' }}>Upload MEA Data</CardTitle>
          <p className="text-sm font-body" style={{ color: 'var(--text-secondary)' }}>
            Upload the 5 required CSV files from your MEA export
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Drop zone */}
            <div
              className={`drop-zone drop-zone-mea p-8 text-center ${
                allFilesPresent ? 'active' : ''
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                type="file"
                multiple
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
                id="mea-file-input"
              />
              <label htmlFor="mea-file-input" className="cursor-pointer">
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--mea-accent)' }} />
                <p className="font-body" style={{ color: 'var(--mea-text)' }}>Drop CSV files here</p>
                <p className="text-xs font-body mt-1" style={{ color: 'var(--text-tertiary)' }}>or click to browse</p>
              </label>
            </div>
            
            {/* File checklist */}
            <div className="glass-surface-subtle rounded-lg p-4">
              <p className="text-xs font-body mb-4" style={{ color: 'var(--text-secondary)' }}>Required files:</p>
              <div className="space-y-3">
                {EXPECTED_FILES.map(ef => (
                  <div 
                    key={ef.name}
                    className="flex items-center gap-3 text-sm"
                  >
                    {getFileIcon(ef.name)}
                    <span className="font-body" style={{ color: files[ef.name] ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {ef.description}
                    </span>
                    <span className="ml-auto font-mono text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
                      _{ef.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Missing files error */}
            {!allFilesPresent && Object.keys(files).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                Missing files: {missingFiles.join(', ')}
              </div>
            )}
            
            {/* Parse error */}
            {parseError && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {parseError}
              </div>
            )}
            
            {/* Parse button */}
            <div className="flex justify-between items-center pt-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onBack}
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
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={parseAllFiles}
                disabled={!allFilesPresent || parsing}
                size="sm"
                className="h-9 px-4 rounded-xl transition-all"
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#10b981',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.15)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.20)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.50)';
                  e.currentTarget.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.15)';
                }}
                data-testid="mea-parse-btn"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    Analyze Files
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
