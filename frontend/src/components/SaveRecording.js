import { useState, useEffect } from 'react';
import { Save, FolderPlus, FolderOpen, Loader2, Check, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import api from '../api';

export default function SaveRecording({ 
  getAnalysisState, 
  onSaveComplete, 
  existingRecordingId = null,
  existingFolderId = null,
  // Organoid/Cell info props
  recordingDate,
  setRecordingDate,
  organoidInfo,
  setOrganoidInfo,
  fusionDate,
  setFusionDate,
  recordingDescription,
  setRecordingDescription
}) {
  // Get current analysis state
  const analysisState = getAnalysisState ? getAnalysisState() : {};
  
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [mode, setMode] = useState(existingRecordingId ? 'update' : 'new'); // 'new', 'existing', 'update'
  const [selectedFolderId, setSelectedFolderId] = useState(existingFolderId || '');
  const [newFolderName, setNewFolderName] = useState('');
  const [recordingName, setRecordingName] = useState(analysisState?.recordingName || analysisState?.filename || 'Untitled');

  // Track which samples have transfection expanded
  const [expandedTransfection, setExpandedTransfection] = useState({});

  // Handle organoid info updates
  const handleOrganoidChange = (index, field, value) => {
    const updated = [...organoidInfo];
    updated[index] = { ...updated[index], [field]: value };
    setOrganoidInfo(updated);
  };
  
  // Handle transfection info updates
  const handleTransfectionChange = (index, field, value) => {
    const updated = [...organoidInfo];
    const transfection = updated[index].transfection || {};
    updated[index] = { 
      ...updated[index], 
      transfection: { ...transfection, [field]: value }
    };
    setOrganoidInfo(updated);
  };
  
  // Toggle transfection section
  const toggleTransfection = (index) => {
    setExpandedTransfection(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const addOrganoidEntry = () => {
    setOrganoidInfo([...organoidInfo, { cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
  };

  const removeOrganoidEntry = (index) => {
    if (organoidInfo.length > 1) {
      setOrganoidInfo(organoidInfo.filter((_, i) => i !== index));
      setExpandedTransfection(prev => {
        const newState = { ...prev };
        delete newState[index];
        return newState;
      });
    }
  };

  // Calculate age in days between two dates
  const calculateDays = (fromDate, toDate) => {
    if (!fromDate || !toDate) return null;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffTime = to - from;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  };

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (existingFolderId) {
      setSelectedFolderId(existingFolderId);
      setMode('update');
    }
  }, [existingFolderId]);

  const loadFolders = async () => {
    setLoading(true);
    try {
      const { data } = await api.getFolders();
      setFolders(data.folders || []);
      // If we have an existing folder ID, select it
      if (existingFolderId && data.folders.some(f => f.id === existingFolderId)) {
        setSelectedFolderId(existingFolderId);
      }
    } catch (err) {
      toast.error('Failed to load folders');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let folderId = selectedFolderId;
      
      // If creating new folder, do that first
      if (mode === 'new' && newFolderName.trim()) {
        const { data: newFolder } = await api.createFolder(newFolderName.trim());
        folderId = newFolder.id;
        toast.success(`Folder "${newFolderName}" created`);
      }
      
      if (!folderId && mode !== 'update') {
        toast.error('Please select or create a folder');
        setSaving(false);
        return;
      }

      // Get fresh analysis state at save time
      const currentAnalysisState = getAnalysisState ? getAnalysisState() : analysisState;
      
      // Prepare analysis state for saving
      const stateToSave = {
        ...currentAnalysisState,
        recordingName,
        savedAt: new Date().toISOString(),
      };

      if (existingRecordingId) {
        // Update existing recording
        await api.updateRecording(existingRecordingId, {
          name: recordingName,
          analysis_state: stateToSave,
        });
        toast.success('Recording updated');
      } else {
        // Create new recording
        await api.createRecording({
          folder_id: folderId,
          name: recordingName,
          filename: currentAnalysisState?.filename || 'unknown.abf',
          analysis_state: stateToSave,
        });
        toast.success('Recording saved');
      }
      
      setSaved(true);
      if (onSaveComplete) {
        onSaveComplete(folderId);
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
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm border-t-2 border-t-emerald-600">
        <CardContent className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-emerald-400" />
          </div>
          <h3 className="text-lg font-medium text-zinc-100 mb-2">Recording Saved</h3>
          <p className="text-sm text-zinc-500">Your analysis has been saved successfully.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Organoid/Cell Information */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium" style={{ fontFamily: 'Manrope' }}>
            Organoid/Cell Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recording Date */}
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Recording Date</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={recordingDate || ''}
                  onChange={(e) => setRecordingDate(e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                />
              </div>
            </div>
          </div>

          {/* Organoid/Cell entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-zinc-400">Sample Information</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={addOrganoidEntry}
                className="h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Sample
              </Button>
            </div>
            {organoidInfo.map((info, idx) => {
              const ageAtRecording = calculateDays(info.birth_date, recordingDate);
              const transfectionDays = info.transfection?.date ? calculateDays(info.transfection.date, recordingDate) : null;
              const hasTransfection = expandedTransfection[idx] || info.transfection?.technique;
              
              return (
                <div key={idx} className="p-3 bg-zinc-900/50 rounded-sm border border-zinc-800 space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400">Sample {organoidInfo.length > 1 ? idx + 1 : '1'}</span>
                    {organoidInfo.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOrganoidEntry(idx)}
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Organoid/Cell Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Organoid/Cell Type</Label>
                      <Select
                        value={info.cell_type || ''}
                        onValueChange={(value) => handleOrganoidChange(idx, 'cell_type', value)}
                      >
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hSpO">Human Spinal Cord Organoid (hSpO)</SelectItem>
                          <SelectItem value="hCO">Human Cardiac Organoid (hCO)</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {info.cell_type === 'other' && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-zinc-500">Specify Type</Label>
                        <Input
                          placeholder="e.g., Human iPSC-CM"
                          value={info.other_cell_type || ''}
                          onChange={(e) => handleOrganoidChange(idx, 'other_cell_type', e.target.value)}
                          className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Line Name and Passage Number */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Line Name</Label>
                      <Input
                        placeholder="e.g., CPVT, WT, F11"
                        value={info.line_name || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'line_name', e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Passage #</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="P#"
                        value={info.passage_number || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'passage_number', e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                      />
                    </div>
                  </div>
                  
                  {/* Differentiation Date */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Differentiation Date</Label>
                    <Input
                      type="date"
                      value={info.birth_date || ''}
                      onChange={(e) => handleOrganoidChange(idx, 'birth_date', e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                    />
                    {ageAtRecording !== null && (
                      <p className="text-[10px] text-cyan-400 font-data">
                        Age at recording: D{ageAtRecording}
                      </p>
                    )}
                  </div>
                  
                  {/* Transfection/Transduction Section */}
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleTransfection(idx)}
                      className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200 w-full justify-between"
                    >
                      <span>Transfection/Transduction <span className="text-zinc-600">(optional)</span></span>
                      {hasTransfection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>
                    
                    {hasTransfection && (
                      <div className="pl-2 border-l-2 border-zinc-700 space-y-2">
                        {/* Technique */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Technique</Label>
                            <Select
                              value={info.transfection?.technique || ''}
                              onValueChange={(value) => handleTransfectionChange(idx, 'technique', value)}
                            >
                              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8">
                                <SelectValue placeholder="Select technique" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="electroporation">Electroporation</SelectItem>
                                <SelectItem value="lipofection">Lipofection</SelectItem>
                                <SelectItem value="transduction">Transduction</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Other technique input */}
                          {info.transfection?.technique === 'other' && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-zinc-500">Specify Technique</Label>
                              <Input
                                placeholder="Enter technique"
                                value={info.transfection?.other_technique || ''}
                                onChange={(e) => handleTransfectionChange(idx, 'other_technique', e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                              />
                            </div>
                          )}
                        </div>
                        
                        {/* Name and Amount */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Name</Label>
                            <Input
                              placeholder="e.g., ChR2-GFP"
                              value={info.transfection?.name || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'name', e.target.value)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Amount (µL)</Label>
                            <Input
                              placeholder="e.g., 5"
                              value={info.transfection?.amount || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'amount', e.target.value)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                            />
                          </div>
                        </div>
                        
                        {/* Transfection Date */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-zinc-500">Date of Transfection/Transduction</Label>
                          <Input
                            type="date"
                            value={info.transfection?.date || ''}
                            onChange={(e) => handleTransfectionChange(idx, 'date', e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                          />
                          {transfectionDays !== null && (
                            <p className="text-[10px] text-amber-400 font-data">
                              Days since transfection: {transfectionDays}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Fusion Date - Shared for all samples */}
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Fusion Date <span className="text-zinc-600">(optional - applies to all samples)</span></Label>
            <Input
              type="date"
              value={fusionDate || ''}
              onChange={(e) => setFusionDate(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
            />
            {fusionDate && recordingDate && (
              <p className="text-[10px] text-emerald-400 font-data">
                Days since fusion: {calculateDays(fusionDate, recordingDate)}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Description / Notes</Label>
            <Textarea
              placeholder="Additional notes about the recording..."
              value={recordingDescription || ''}
              onChange={(e) => setRecordingDescription(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs font-data min-h-[60px] resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Recording Card */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm border-t-2 border-t-emerald-600">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Save className="w-4 h-4 text-emerald-500" />
            {existingRecordingId ? 'Update Recording' : 'Save Recording'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {!existingRecordingId && (
            <>
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
                                        ? 'bg-cyan-900/30 border border-cyan-700' 
                                        : 'hover:bg-zinc-800/50'
                                    }`}
                                    onClick={() => setSelectedFolderId(folder.id)}
                                  >
                                    <FolderOpen className={`w-4 h-4 ${selectedFolderId === folder.id ? 'text-cyan-400' : 'text-amber-500'}`} />
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
                        <FolderPlus className="w-4 h-4 text-emerald-500" />
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
            </>
          )}

          {/* Save Button */}
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-10 mt-4"
            onClick={handleSave}
            disabled={saving || (!existingRecordingId && mode === 'existing' && !selectedFolderId) || (!existingRecordingId && mode === 'new' && !newFolderName.trim())}
            data-testid="save-recording-btn"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-4 h-4" />
                {existingRecordingId ? 'Update Recording' : 'Save Recording'}
              </span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
