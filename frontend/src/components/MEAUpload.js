import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle, XCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// Expected MEA CSV files
const EXPECTED_FILES = [
  { name: 'spike_list.csv', required: ['timestamp', 'electrode', 'well'], description: 'Spike timestamps per electrode' },
  { name: 'electrode_burst_list.csv', required: ['well', 'electrode', 'start', 'stop'], description: 'Burst events per electrode' },
  { name: 'network_burst_list.csv', required: ['well', 'start', 'stop'], description: 'Network-level burst events' },
  { name: 'spike_counts.csv', required: ['electrode', 'well', 'spike_count', 'duration'], description: 'Spike counts for filtering' },
  { name: 'environmental_data.csv', required: ['timestamp', 'temperature', 'CO2'], description: 'Environmental conditions' },
];

// Parse CSV text into array of objects
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse header - handle various CSV formats
  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => 
    h.trim().toLowerCase()
      .replace(/['"]/g, '')
      .replace(/\s*\(.*?\)\s*/g, '') // Remove units in parentheses
      .replace(/\s+/g, '_')
  );
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
    const row = {};
    headers.forEach((h, idx) => {
      const val = values[idx];
      // Try to parse as number
      const num = parseFloat(val);
      row[h] = isNaN(num) ? val : num;
    });
    data.push(row);
  }
  return data;
}

// Validate well ID format (A1-H12)
function isValidWellId(wellId) {
  if (!wellId || typeof wellId !== 'string') return false;
  const match = wellId.match(/^([A-H])(\d{1,2})$/i);
  if (!match) return false;
  const col = parseInt(match[2]);
  return col >= 1 && col <= 12;
}

// Normalize well ID to uppercase
function normalizeWellId(wellId) {
  if (!wellId) return null;
  const str = String(wellId).toUpperCase().trim();
  return isValidWellId(str) ? str : null;
}

export default function MEAUpload({ onDataParsed, onBack }) {
  const [files, setFiles] = useState({});
  const [fileStatus, setFileStatus] = useState({});
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [selectedWells, setSelectedWells] = useState({});
  const [electrodeFilter, setElectrodeFilter] = useState({ min_hz: 0.05, max_hz: null });

  // Handle file drop/selection
  const handleFiles = useCallback((fileList) => {
    const newFiles = { ...files };
    const newStatus = { ...fileStatus };
    
    Array.from(fileList).forEach(file => {
      const fileName = file.name.toLowerCase();
      const expectedFile = EXPECTED_FILES.find(ef => ef.name === fileName);
      
      if (expectedFile) {
        newFiles[expectedFile.name] = file;
        newStatus[expectedFile.name] = 'pending';
      }
    });
    
    setFiles(newFiles);
    setFileStatus(newStatus);
    setParseError(null);
  }, [files, fileStatus]);

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
      newStatus['spike_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const spikeListText = await files['spike_list.csv'].text();
      const spikeList = parseCSV(spikeListText);
      
      if (spikeList.length === 0) {
        throw new Error('spike_list.csv is empty or malformed');
      }
      
      // Extract unique well IDs
      const wellSet = new Set();
      const invalidWells = new Set();
      spikeList.forEach(row => {
        const wellId = normalizeWellId(row.well);
        if (wellId) {
          wellSet.add(wellId);
        } else if (row.well) {
          invalidWells.add(row.well);
        }
      });
      
      if (wellSet.size === 0) {
        throw new Error('No valid well IDs found in spike_list.csv. Expected format: A1-H12');
      }
      
      if (invalidWells.size > 0) {
        console.warn('Invalid well IDs found:', Array.from(invalidWells));
      }
      
      newStatus['spike_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 2: Parse spike_counts.csv for electrode filtering
      newStatus['spike_counts.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const spikeCountsText = await files['spike_counts.csv'].text();
      const spikeCounts = parseCSV(spikeCountsText);
      
      // Build electrode registry per well
      const electrodeRegistry = {};
      wellSet.forEach(well => {
        electrodeRegistry[well] = [];
      });
      
      spikeCounts.forEach(row => {
        const wellId = normalizeWellId(row.well);
        if (wellId && wellSet.has(wellId)) {
          const rate = row.spike_count / row.duration;
          electrodeRegistry[wellId].push({
            electrode: row.electrode,
            spike_count: row.spike_count,
            duration: row.duration,
            firing_rate_hz: rate,
          });
        }
      });
      
      newStatus['spike_counts.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 3: Parse electrode_burst_list.csv
      newStatus['electrode_burst_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const electrodeBurstText = await files['electrode_burst_list.csv'].text();
      const electrodeBursts = parseCSV(electrodeBurstText);
      
      // Assign bursts to electrodes per well
      const burstsByWell = {};
      wellSet.forEach(well => {
        burstsByWell[well] = [];
      });
      
      electrodeBursts.forEach(row => {
        const wellId = normalizeWellId(row.well);
        if (wellId && wellSet.has(wellId)) {
          burstsByWell[wellId].push({
            electrode: row.electrode,
            start: row.start,
            stop: row.stop,
            spike_count: row.spike_count,
            mean_isi: row.mean_isi,
          });
        } else if (wellId) {
          console.warn(`Well ${wellId} in electrode_burst_list.csv not found in spike_list.csv, ignoring`);
        }
      });
      
      newStatus['electrode_burst_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 4: Parse network_burst_list.csv
      newStatus['network_burst_list.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const networkBurstText = await files['network_burst_list.csv'].text();
      const networkBursts = parseCSV(networkBurstText);
      
      const networkBurstsByWell = {};
      wellSet.forEach(well => {
        networkBurstsByWell[well] = [];
      });
      
      networkBursts.forEach(row => {
        const wellId = normalizeWellId(row.well);
        if (wellId && wellSet.has(wellId)) {
          networkBurstsByWell[wellId].push({
            start: row.start,
            stop: row.stop,
            electrode_count: row.electrode_count,
            spike_count: row.spike_count,
          });
        }
      });
      
      newStatus['network_burst_list.csv'] = 'success';
      setFileStatus({ ...newStatus });
      
      // Step 5: Parse environmental_data.csv
      newStatus['environmental_data.csv'] = 'parsing';
      setFileStatus({ ...newStatus });
      
      const envText = await files['environmental_data.csv'].text();
      const envData = parseCSV(envText);
      
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
        const wellSpikes = spikeList.filter(s => normalizeWellId(s.well) === well);
        
        // Calculate mean firing rate across active electrodes
        const meanFiringRate = activeElectrodes.length > 0
          ? activeElectrodes.reduce((sum, e) => sum + e.firing_rate_hz, 0) / activeElectrodes.length
          : 0;
        
        // Get recording duration from spike timestamps
        const timestamps = wellSpikes.map(s => s.timestamp).filter(t => !isNaN(t));
        const duration = timestamps.length > 0 
          ? Math.max(...timestamps) - Math.min(...timestamps)
          : 0;
        
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
      const result = {
        wells: wellData,
        environmental_data: envData,
        plate_id: files['spike_list.csv'].name.replace('.csv', ''),
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
    });
  };

  // Get file icon based on status
  const getFileIcon = (fileName) => {
    const status = fileStatus[fileName];
    const hasFile = files[fileName];
    
    if (!hasFile) return <AlertCircle className="w-4 h-4 text-zinc-500" />;
    if (status === 'parsing') return <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />;
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
    return <CheckCircle className="w-4 h-4 text-amber-400" />;
  };

  // Render well selection view
  if (parsedData) {
    const wells = Object.values(parsedData.wells).sort((a, b) => a.well_id.localeCompare(b.well_id));
    const selectedCount = Object.values(selectedWells).filter(v => v).length;
    
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-xl text-zinc-100">Select Wells for Analysis</CardTitle>
            <p className="text-sm text-zinc-500">
              {wells.length} wells detected • {selectedCount} selected • 
              Electrode filter: ≥{electrodeFilter.min_hz} Hz
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Well list */}
              <div className="bg-zinc-950/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left py-2 px-2">Select</th>
                      <th className="text-left py-2 px-2">Well</th>
                      <th className="text-center py-2 px-2">Active Electrodes</th>
                      <th className="text-center py-2 px-2">Mean Rate (Hz)</th>
                      <th className="text-center py-2 px-2">Total Spikes</th>
                      <th className="text-center py-2 px-2">Duration (s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wells.map(well => (
                      <tr 
                        key={well.well_id} 
                        className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${
                          !selectedWells[well.well_id] ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="py-2 px-2">
                          <Checkbox
                            checked={selectedWells[well.well_id]}
                            onCheckedChange={() => toggleWellSelection(well.well_id)}
                            data-testid={`well-checkbox-${well.well_id}`}
                          />
                        </td>
                        <td className="py-2 px-2 text-sky-400 font-mono">{well.well_id}</td>
                        <td className="py-2 px-2 text-center text-zinc-300">
                          {well.n_active_electrodes} / {well.n_electrodes}
                        </td>
                        <td className="py-2 px-2 text-center text-zinc-300">
                          {well.mean_firing_rate_hz.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center text-zinc-300">
                          {well.total_spikes.toLocaleString()}
                        </td>
                        <td className="py-2 px-2 text-center text-zinc-300">
                          {well.duration_s.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Error message */}
              {parseError && (
                <div className="p-3 bg-red-950/30 border border-red-500/30 rounded text-red-400 text-sm">
                  {parseError}
                </div>
              )}
              
              {/* Actions */}
              <div className="flex justify-between items-center pt-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setParsedData(null);
                    setFiles({});
                    setFileStatus({});
                  }}
                >
                  Upload Different Files
                </Button>
                <Button
                  onClick={handleProceed}
                  disabled={selectedCount === 0}
                  className="bg-sky-600 hover:bg-sky-500"
                  data-testid="mea-proceed-btn"
                >
                  Continue with {selectedCount} Wells
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render upload view
  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-100">Upload MEA Data</CardTitle>
          <p className="text-sm text-zinc-500">
            Upload the 5 required CSV files from your MEA export
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                allFilesPresent 
                  ? 'border-sky-500/50 bg-sky-950/20' 
                  : 'border-zinc-700 hover:border-sky-500/50 hover:bg-zinc-900'
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
                <Upload className="w-10 h-10 mx-auto mb-3 text-sky-400" />
                <p className="text-zinc-300 mb-1">Drop CSV files here</p>
                <p className="text-xs text-zinc-500">or click to browse</p>
              </label>
            </div>
            
            {/* File checklist */}
            <div className="bg-zinc-950/50 rounded-lg p-4">
              <p className="text-xs text-zinc-500 mb-3">Required files:</p>
              <div className="space-y-2">
                {EXPECTED_FILES.map(ef => (
                  <div 
                    key={ef.name}
                    className="flex items-center gap-3 text-sm"
                  >
                    {getFileIcon(ef.name)}
                    <span className={`font-mono ${files[ef.name] ? 'text-zinc-200' : 'text-zinc-500'}`}>
                      {ef.name}
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">
                      {ef.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Missing files error */}
            {!allFilesPresent && Object.keys(files).length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded text-amber-400 text-sm">
                Missing files: {missingFiles.join(', ')}
              </div>
            )}
            
            {/* Parse error */}
            {parseError && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 rounded text-red-400 text-sm">
                {parseError}
              </div>
            )}
            
            {/* Parse button */}
            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
              <Button
                onClick={parseAllFiles}
                disabled={!allFilesPresent || parsing}
                className="bg-sky-600 hover:bg-sky-500"
                data-testid="mea-parse-btn"
              >
                {parsing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    Parse Files
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
