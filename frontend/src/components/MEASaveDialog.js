import { useState, useEffect } from 'react';
import { Save, FolderPlus, FolderOpen, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import api from '../api';

export default function MEASaveDialog({ 
  meaData, 
  config,
  wellAnalysis,
  selectedWell,
  onSaveComplete,
  onClose
}) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [mode, setMode] = useState('new'); // 'new' or 'existing'
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [recordingName, setRecordingName] = useState(
    `${meaData?.plate_id || 'MEA'}_${selectedWell || 'Well'}`
  );

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    // Update recording name when selected well changes
    setRecordingName(`${meaData?.plate_id || 'MEA'}_${selectedWell || 'Well'}`);
  }, [selectedWell, meaData?.plate_id]);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const { data } = await api.getFolders();
      setFolders(data.folders || []);
    } catch (err) {
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedWell || !wellAnalysis) {
      toast.error('No well analysis data to save');
      return;
    }

    setSaving(true);
    try {
      let folderId = selectedFolderId;
      
      // If creating new folder, do that first
      if (mode === 'new' && newFolderName.trim()) {
        const { data: newFolder } = await api.createFolder(newFolderName.trim());
        folderId = newFolder.id;
        toast.success(`Folder "${newFolderName}" created`);
      }
      
      if (!folderId) {
        toast.error('Please select or create a folder');
        setSaving(false);
        return;
      }

      // Build analysis state for MEA recording
      const well = meaData.wells[selectedWell];
      const analysisState = {
        source_type: 'MEA',
        
        // Well identification
        well_id: selectedWell,
        plate_id: meaData.plate_id,
        
        // Config
        config: config,
        
        // Well data
        n_electrodes: well.n_electrodes,
        n_active_electrodes: well.n_active_electrodes,
        active_electrodes: well.active_electrodes,
        duration_s: well.duration_s,
        total_spikes: well.total_spikes,
        mean_firing_rate_hz: well.mean_firing_rate_hz,
        
        // Computed metrics
        spike_rate_bins: wellAnalysis.spikeRateBins,
        burst_rate_bins: wellAnalysis.burstRateBins,
        baseline_spike_hz: wellAnalysis.baselineSpikeHz,
        baseline_burst_bpm: wellAnalysis.baselineBurstBpm,
        stim_metrics: wellAnalysis.stimMetrics,
        drug_metrics: wellAnalysis.drugWindow ? {
          spike_hz: wellAnalysis.drugSpikeHz,
          burst_bpm: wellAnalysis.drugBurstBpm,
        } : null,
        correlation: wellAnalysis.correlation,
        
        // Raw data for re-plotting
        spikes: well.spikes,
        electrode_bursts: well.electrode_bursts,
        network_bursts: well.network_bursts,
        
        // Electrode filter applied
        electrode_filter: meaData.electrode_filter,
        
        // Environmental data (if available)
        environmental_data: meaData.environmental_data,
        
        // Save timestamp
        savedAt: new Date().toISOString(),
      };

      // Create new recording
      const response = await api.createRecording({
        folder_id: folderId,
        name: recordingName,
        filename: `${meaData.plate_id}_${selectedWell}.mea`,
        analysis_state: analysisState,
      });
      
      toast.success(`Recording "${recordingName}" saved`);
      setSaved(true);
      
      if (onSaveComplete) {
        onSaveComplete(folderId, response.data.id);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      toast.error('Failed to save: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-100 mb-2">Recording Saved</h3>
          <p className="text-sm text-zinc-500 mb-4">Well {selectedWell} analysis has been saved successfully.</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Save className="w-4 h-4 text-sky-500" />
            Save MEA Recording
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Well info summary */}
        <div className="p-3 bg-zinc-950/50 rounded border border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-sky-600">MEA</Badge>
            <span className="text-sm font-mono text-sky-400">{selectedWell}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div>Plate: {meaData?.plate_id || 'Unknown'}</div>
            <div>Active Electrodes: {wellAnalysis?.well?.n_active_electrodes || 0}</div>
            <div>Duration: {(wellAnalysis?.well?.duration_s || 0).toFixed(1)}s</div>
            <div>Mean Rate: {(wellAnalysis?.baselineSpikeHz || 0).toFixed(2)} Hz</div>
          </div>
        </div>

        {/* Recording Name */}
        <div className="space-y-2">
          <Label className="text-xs text-zinc-500">Recording Name</Label>
          <Input
            value={recordingName}
            onChange={(e) => setRecordingName(e.target.value)}
            placeholder="Enter recording name"
            className="bg-zinc-950 border-zinc-800 h-9 text-sm"
          />
        </div>

        <Separator className="bg-zinc-800" />

        {/* Folder Selection */}
        <div className="space-y-3">
          <Label className="text-xs text-zinc-500">Save Location</Label>
          
          <RadioGroup value={mode} onValueChange={setMode} className="space-y-3">
            {/* Existing Folder Option */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="existing" id="existing" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="existing" className="text-sm text-zinc-300 cursor-pointer">
                  Existing Folder
                </Label>
                {mode === 'existing' && (
                  <div className="mt-2">
                    {loading ? (
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading folders...
                      </div>
                    ) : folders.length === 0 ? (
                      <p className="text-xs text-zinc-600">No folders yet. Create one below.</p>
                    ) : (
                      <ScrollArea className="h-32 border border-zinc-800 rounded-sm">
                        <div className="p-1">
                          {folders.map((folder) => (
                            <div
                              key={folder.id}
                              className={`flex items-center gap-2 p-2 rounded-sm cursor-pointer transition-colors ${
                                selectedFolderId === folder.id 
                                  ? 'bg-sky-900/30 border border-sky-700' 
                                  : 'hover:bg-zinc-800/50'
                              }`}
                              onClick={() => setSelectedFolderId(folder.id)}
                            >
                              <FolderOpen className={`w-4 h-4 ${selectedFolderId === folder.id ? 'text-sky-400' : 'text-amber-500'}`} />
                              <span className="text-sm text-zinc-300 flex-1">{folder.name}</span>
                              <span className="text-xs text-zinc-600">{folder.recording_count} rec</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* New Folder Option */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="new" id="new" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="new" className="text-sm text-zinc-300 cursor-pointer flex items-center gap-2">
                  <FolderPlus className="w-4 h-4 text-sky-500" />
                  Create New Folder
                </Label>
                {mode === 'new' && (
                  <div className="mt-2">
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New folder name"
                      className="bg-zinc-950 border-zinc-800 h-8 text-sm"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Save Button */}
        <Button
          className="w-full bg-sky-600 hover:bg-sky-700 text-white h-10 mt-4"
          onClick={handleSave}
          disabled={saving || (mode === 'existing' && !selectedFolderId) || (mode === 'new' && !newFolderName.trim())}
          data-testid="mea-save-btn"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Recording
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
