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
  // Recording name sync with parent
  recordingName,
  onRecordingNameChange,
  // Organoid/Cell info props
  recordingDate,
  setRecordingDate,
  organoidInfo,
  setOrganoidInfo,
  fusionDate,
  setFusionDate,
  recordingDescription,
  setRecordingDescription,
  // MEA mode - use emerald colors instead of sem-accent
  isMEA = false
}) {
  // Get current analysis state
  const analysisState = getAnalysisState ? getAnalysisState() : {};
  
  // Accent color based on mode
  const accentColor = isMEA ? '#10b981' : 'var(--sem-accent)';
  
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [mode, setMode] = useState(existingRecordingId ? 'update' : 'new'); // 'new', 'existing', 'update'
  const [selectedFolderId, setSelectedFolderId] = useState(existingFolderId || '');
  const [newFolderName, setNewFolderName] = useState('');

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

      let recordingId = existingRecordingId;
      
      if (existingRecordingId) {
        // Update existing recording
        await api.updateRecording(existingRecordingId, {
          name: recordingName,
          analysis_state: stateToSave,
        });
        toast.success('Recording updated');
      } else {
        // Create new recording
        // Use original_filename for MEA (CSV files) or filename for SSE (ABF file)
        const displayFilename = currentAnalysisState?.original_filename 
          || currentAnalysisState?.filename 
          || (currentAnalysisState?.source_files ? Object.values(currentAnalysisState.source_files).join(', ') : 'unknown.abf');
        
        const response = await api.createRecording({
          folder_id: folderId,
          name: recordingName,
          filename: displayFilename,
          analysis_state: stateToSave,
        });
        recordingId = response.data.id;
        toast.success('Recording saved');
      }
      
      setSaved(true);
      if (onSaveComplete) {
        onSaveComplete(folderId, recordingId);
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
      <div className="glass-surface-subtle rounded-xl p-8 text-center" style={{ borderLeft: `3px solid ${accentColor}` }}>
        <div 
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: isMEA ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 206, 162, 0.15)', border: `1px solid ${isMEA ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 206, 162, 0.3)'}` }}
        >
          <Check className="w-7 h-7" style={{ color: accentColor }} />
        </div>
        <h3 className="text-lg font-display font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Recording Saved</h3>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Your analysis has been saved successfully.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEFT COLUMN: Tissue Information */}
      <div className="glass-surface-subtle rounded-xl">
        <div className="p-4 pb-2">
          <span className="text-sm" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}>
            Tissue Information
          </span>
        </div>
        <div className="p-4 pt-2 space-y-4">
          {/* Fusion Date - At the top */}
          <div className="space-y-1">
            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              {organoidInfo.length >= 2 ? 'Fusion Date' : 'Fusion Media Start'} <span style={{ color: 'var(--text-tertiary)' }}>(optional{organoidInfo.length >= 2 ? ' - applies to all samples' : ''})</span>
            </Label>
            <Input
              type="date"
              value={fusionDate || ''}
              onChange={(e) => setFusionDate(e.target.value)}
              className="text-xs h-8 font-data rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
            />
            {fusionDate && recordingDate && (
              <p className="text-[10px] font-data" style={{ color: 'white' }}>
                {organoidInfo.length >= 2 ? 'Days since fusion' : 'Day since in fusion media'}: {calculateDays(fusionDate, recordingDate)}
              </p>
            )}
          </div>

          {/* Sample(s) entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Sample Information</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={addOrganoidEntry}
                className="h-6 px-2 text-[10px] rounded-lg transition-all"
                style={{ color: 'white', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
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
                <div key={idx} className="p-3 rounded-xl space-y-2 mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--text-secondary)' }}>Sample {organoidInfo.length > 1 ? idx + 1 : '1'}</span>
                    {organoidInfo.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOrganoidEntry(idx)}
                        className="h-6 w-6 p-0 hover:bg-red-500/10"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Organoid/Cell Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Organoid/Cell Type</Label>
                      <Select
                        value={info.cell_type || ''}
                        onValueChange={(value) => handleOrganoidChange(idx, 'cell_type', value)}
                      >
                        <SelectTrigger className="text-xs h-8 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
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
                        <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Specify Type</Label>
                        <Input
                          placeholder="e.g., Human iPSC-CM"
                          value={info.other_cell_type || ''}
                          onChange={(e) => handleOrganoidChange(idx, 'other_cell_type', e.target.value)}
                          className="text-xs h-8 font-data rounded-lg"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Line Name and Passage Number */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Line Name</Label>
                      <Input
                        placeholder="e.g., CPVT, WT, F11"
                        value={info.line_name || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'line_name', e.target.value)}
                        className="text-xs h-8 font-data rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Passage #</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="P#"
                        value={info.passage_number || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'passage_number', e.target.value)}
                        className="text-xs h-8 font-data rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                  
                  {/* Differentiation Date */}
                  <div className="space-y-1">
                    <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Differentiation Date</Label>
                    <Input
                      type="date"
                      value={info.birth_date || ''}
                      onChange={(e) => handleOrganoidChange(idx, 'birth_date', e.target.value)}
                      className="text-xs h-8 font-data rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                    />
                    {ageAtRecording !== null && (
                      <p className="text-[10px] font-data" style={{ color: info.cell_type === 'hSpO' ? '#10b981' : info.cell_type === 'hCO' ? '#F4CEA2' : 'var(--text-secondary)' }}>
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
                      className="h-6 px-2 text-[10px] w-full justify-between hover:bg-white/5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span>Transfection/Transduction <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span></span>
                      {hasTransfection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>
                    
                    {hasTransfection && (
                      <div className="pl-2 space-y-2" style={{ borderLeft: '2px solid rgba(255,255,255,0.10)' }}>
                        {/* Technique */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Technique</Label>
                            <Select
                              value={info.transfection?.technique || ''}
                              onValueChange={(value) => handleTransfectionChange(idx, 'technique', value)}
                            >
                              <SelectTrigger className="text-xs h-8 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}>
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
                              <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Specify Technique</Label>
                              <Input
                                placeholder="Enter technique"
                                value={info.transfection?.other_technique || ''}
                                onChange={(e) => handleTransfectionChange(idx, 'other_technique', e.target.value)}
                                className="text-xs h-8 font-data rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                              />
                            </div>
                          )}
                        </div>
                        
                        {/* Name and Amount */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Name</Label>
                            <Input
                              placeholder="e.g., ChR2-GFP"
                              value={info.transfection?.name || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'name', e.target.value)}
                              className="text-xs h-8 font-data rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Amount (µL)</Label>
                            <Input
                              placeholder="e.g., 5"
                              value={info.transfection?.amount || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'amount', e.target.value)}
                              className="text-xs h-8 font-data rounded-lg"
                              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                            />
                          </div>
                        </div>
                        
                        {/* Transfection Date */}
                        <div className="space-y-1">
                          <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Date of Transfection/Transduction</Label>
                          <Input
                            type="date"
                            value={info.transfection?.date || ''}
                            onChange={(e) => handleTransfectionChange(idx, 'date', e.target.value)}
                            className="text-xs h-8 font-data rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
                          />
                          {transfectionDays !== null && (
                            <p className="text-[10px] font-data" style={{ color: info.cell_type === 'hSpO' ? '#10b981' : info.cell_type === 'hCO' ? '#F4CEA2' : 'white' }}>
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
        </div>
      </div>

      {/* RIGHT COLUMN: Recording Information */}
      <div className="glass-surface-subtle rounded-xl h-fit">
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4" style={{ color: existingRecordingId ? '#10b981' : accentColor }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recording Information
            </span>
          </div>
        </div>
        <div className="p-4 pt-2 space-y-4">
          {/* Recording Date */}
          <div className="space-y-1">
            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Recording Date</Label>
            <div className="relative">
              <Input
                type="date"
                value={recordingDate || ''}
                onChange={(e) => setRecordingDate(e.target.value)}
                className="text-xs h-8 font-data rounded-lg"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          {/* Recording Name */}
          <div className="space-y-1">
            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Recording Name</Label>
            <Input
              value={recordingName}
              onChange={(e) => onRecordingNameChange?.(e.target.value)}
              placeholder="Enter recording name"
              className="h-9 text-sm rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Description / Notes */}
          <div className="space-y-1">
            <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Description / Notes</Label>
            <Textarea
              placeholder="Additional notes about the recording..."
              value={recordingDescription || ''}
              onChange={(e) => setRecordingDescription(e.target.value)}
              className="text-xs font-data min-h-[60px] resize-none rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
            />
          </div>

          {!existingRecordingId && (
            <>
              <Separator style={{ background: 'rgba(255,255,255,0.08)' }} />

              {/* Folder Selection */}
              <div className="space-y-3">
                <Label className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Save Location</Label>
                
                <RadioGroup value={mode} onValueChange={setMode} className="space-y-3">
                  {/* Existing Folder Option */}
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="existing" id="existing" className="mt-1" />
                    <div className="flex-1">
                      <Label htmlFor="existing" className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                        Existing Folder
                      </Label>
                      {mode === 'existing' && (
                        <div className="mt-2">
                          {loading ? (
                            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Loading folders...
                            </div>
                          ) : folders.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No folders yet. Create one below.</p>
                          ) : (
                            <ScrollArea className="h-32 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                              <div className="p-1">
                                {folders.map((folder) => (
                                  <div
                                    key={folder.id}
                                    className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                                    style={{
                                      background: selectedFolderId === folder.id ? 'rgba(0, 201, 122, 0.15)' : 'transparent',
                                      border: selectedFolderId === folder.id ? '1px solid rgba(0, 201, 122, 0.4)' : '1px solid transparent'
                                    }}
                                    onClick={() => setSelectedFolderId(folder.id)}
                                  >
                                    <FolderOpen className="w-4 h-4" style={{ color: selectedFolderId === folder.id ? 'var(--sem-accent)' : '#f59e0b' }} />
                                    <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{folder.name}</span>
                                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{folder.recording_count} rec</span>
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
                      <Label htmlFor="new" className="text-sm cursor-pointer flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <FolderPlus className="w-4 h-4" style={{ color: accentColor }} />
                        Create New Folder
                      </Label>
                      {mode === 'new' && (
                        <div className="mt-2">
                          <Input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="New folder name"
                            className="h-8 text-sm rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)' }}
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
            className="w-full h-10 mt-4 rounded-lg font-medium"
            style={{ background: accentColor, color: '#02080f' }}
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
        </div>
      </div>
    </div>
  );
}
