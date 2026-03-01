import { useState, useEffect } from 'react';
import { Save, FolderPlus, FolderOpen, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import api from '../api';

export default function SaveRecording({ 
  analysisState, 
  onSaveComplete, 
  existingRecordingId = null,
  existingFolderId = null 
}) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [mode, setMode] = useState(existingRecordingId ? 'update' : 'new'); // 'new', 'existing', 'update'
  const [selectedFolderId, setSelectedFolderId] = useState(existingFolderId || '');
  const [newFolderName, setNewFolderName] = useState('');
  const [recordingName, setRecordingName] = useState(analysisState?.recordingName || analysisState?.filename || 'Untitled');

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

      // Prepare analysis state for saving
      const stateToSave = {
        ...analysisState,
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
          filename: analysisState?.filename || 'unknown.abf',
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
  );
}
