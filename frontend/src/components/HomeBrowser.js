import { useState, useEffect, useCallback } from 'react';
import { 
  Folder, FolderPlus, FolderOpen, FileAudio, Pencil, Trash2, 
  ArrowLeft, MoreVertical, MoveRight, Clock, Activity, Zap, Pill,
  ChevronRight, Loader2, Plus, X, Check, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import api from '../api';
import FolderComparison from './FolderComparison';

export default function HomeBrowser({ onNewAnalysis, onOpenRecording }) {
  const [view, setView] = useState('home'); // 'home', 'folder', 'comparison'
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameFolderOpen, setRenameFolderOpen] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [folderToRename, setFolderToRename] = useState(null);
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  
  const [renameRecordingOpen, setRenameRecordingOpen] = useState(false);
  const [renameRecordingName, setRenameRecordingName] = useState('');
  const [recordingToRename, setRecordingToRename] = useState(null);
  const [deleteRecordingOpen, setDeleteRecordingOpen] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState(null);
  const [moveRecordingOpen, setMoveRecordingOpen] = useState(false);
  const [recordingToMove, setRecordingToMove] = useState(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState('');
  const [updateCheckDone, setUpdateCheckDone] = useState(false);

  // Auto-update outdated recordings on mount
  useEffect(() => {
    const checkAndUpdateRecordings = async () => {
      if (updateCheckDone) return;
      try {
        const { data } = await api.batchUpdateRecordings();
        if (data.updated_count > 0) {
          toast.success(`${data.updated_count} recording(s) updated`, {
            duration: 4000,
          });
        }
      } catch (err) {
        // Silently fail - this is a background task
        console.log('Metrics update check completed');
      } finally {
        setUpdateCheckDone(true);
      }
    };
    
    checkAndUpdateRecordings();
  }, [updateCheckDone]);

  // Load folders on mount
  useEffect(() => {
    loadFolders();
  }, []);

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

  const loadRecordings = async (folderId) => {
    setLoading(true);
    try {
      const { data } = await api.getRecordingsInFolder(folderId);
      setSelectedFolder(data.folder);
      setRecordings(data.recordings || []);
      setView('folder');
    } catch (err) {
      toast.error('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(newFolderName.trim());
      toast.success('Folder created');
      setCreateFolderOpen(false);
      setNewFolderName('');
      loadFolders();
    } catch (err) {
      toast.error('Failed to create folder');
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim() || !folderToRename) return;
    try {
      await api.updateFolder(folderToRename.id, renameFolderName.trim());
      toast.success('Folder renamed');
      setRenameFolderOpen(false);
      setRenameFolderName('');
      setFolderToRename(null);
      loadFolders();
      if (selectedFolder?.id === folderToRename.id) {
        setSelectedFolder({ ...selectedFolder, name: renameFolderName.trim() });
      }
    } catch (err) {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await api.deleteFolder(folderToDelete.id);
      toast.success('Folder deleted');
      setDeleteFolderOpen(false);
      setFolderToDelete(null);
      loadFolders();
      if (selectedFolder?.id === folderToDelete.id) {
        setView('home');
        setSelectedFolder(null);
      }
    } catch (err) {
      toast.error('Failed to delete folder');
    }
  };

  const handleRenameRecording = async () => {
    if (!renameRecordingName.trim() || !recordingToRename) return;
    try {
      await api.updateRecording(recordingToRename.id, { name: renameRecordingName.trim() });
      toast.success('Recording renamed');
      setRenameRecordingOpen(false);
      setRenameRecordingName('');
      setRecordingToRename(null);
      if (selectedFolder) loadRecordings(selectedFolder.id);
    } catch (err) {
      toast.error('Failed to rename recording');
    }
  };

  const handleDeleteRecording = async () => {
    if (!recordingToDelete) return;
    try {
      await api.deleteRecording(recordingToDelete.id);
      toast.success('Recording deleted');
      setDeleteRecordingOpen(false);
      setRecordingToDelete(null);
      if (selectedFolder) loadRecordings(selectedFolder.id);
      loadFolders(); // Update counts
    } catch (err) {
      toast.error('Failed to delete recording');
    }
  };

  const handleMoveRecording = async () => {
    if (!recordingToMove || !moveTargetFolder) return;
    try {
      await api.moveRecording(recordingToMove.id, moveTargetFolder);
      toast.success('Recording moved');
      setMoveRecordingOpen(false);
      setRecordingToMove(null);
      setMoveTargetFolder('');
      if (selectedFolder) loadRecordings(selectedFolder.id);
      loadFolders(); // Update counts
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to move recording');
    }
  };

  const handleOpenRecording = async (recording) => {
    setLoading(true);
    try {
      const { data } = await api.getRecording(recording.id);
      onOpenRecording(data);
    } catch (err) {
      toast.error('Failed to load recording');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (sec) => {
    if (!sec) return '--';
    const min = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${min}m ${s}s`;
  };

  const formatDate = (isoString) => {
    if (!isoString) return '--';
    const d = new Date(isoString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Home view - show folders and new analysis option
  if (view === 'home') {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="home-browser">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
            NeuCarS
          </h1>
          <p className="text-sm text-zinc-500">Cardiac Electrophysiology Analysis Platform</p>
        </div>

        {/* New Analysis Card */}
        <Card 
          className="bg-gradient-to-br from-cyan-950/30 to-zinc-900/50 border-cyan-800/50 rounded-sm mb-6 cursor-pointer hover:border-cyan-600 transition-colors"
          onClick={onNewAnalysis}
          data-testid="new-analysis-card"
        >
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-cyan-900/50 flex items-center justify-center">
              <Plus className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-zinc-100">New Analysis</h3>
              <p className="text-sm text-zinc-500">Drop a new .abf file to start analysis</p>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-600 ml-auto" />
          </CardContent>
        </Card>

        {/* Folders Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Saved Recordings</h2>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-zinc-700 hover:border-zinc-600 rounded-sm"
            onClick={() => setCreateFolderOpen(true)}
            data-testid="create-folder-btn"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1.5" />
            New Folder
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : folders.length === 0 ? (
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardContent className="p-8 text-center">
              <Folder className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-zinc-500 text-sm">No folders yet</p>
              <p className="text-zinc-600 text-xs mt-1">Create a folder to organize your recordings</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {folders.map((folder) => (
              <Card 
                key={folder.id}
                className="bg-zinc-900/50 border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors cursor-pointer group"
                data-testid={`folder-${folder.id}`}
              >
                <CardContent className="p-4 flex items-center gap-4" onClick={() => loadRecordings(folder.id)}>
                  <div className="w-10 h-10 rounded-sm bg-amber-900/30 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-200 truncate">{folder.name}</h3>
                    <p className="text-xs text-zinc-500">
                      {folder.recording_count} recording{folder.recording_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4 text-zinc-500" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem 
                        className="text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToRename(folder);
                          setRenameFolderName(folder.name);
                          setRenameFolderOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-zinc-800" />
                      <DropdownMenuItem 
                        className="text-xs text-red-400 focus:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(folder);
                          setDeleteFolderOpen(true);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Folder Dialog */}
        <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Create New Folder</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Enter a name for your new folder
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-zinc-950 border-zinc-800"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateFolderOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} className="bg-cyan-600 hover:bg-cyan-700">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Folder Dialog */}
        <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Rename Folder</DialogTitle>
            </DialogHeader>
            <Input
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder="Folder name"
              className="bg-zinc-950 border-zinc-800"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameFolderOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button onClick={handleRenameFolder} className="bg-cyan-600 hover:bg-cyan-700">
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Folder Dialog */}
        <Dialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Delete Folder</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Are you sure you want to delete "{folderToDelete?.name}"? This will also delete all recordings in this folder. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteFolderOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button onClick={handleDeleteFolder} variant="destructive">
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Comparison view
  if (view === 'comparison' && selectedFolder) {
    return (
      <FolderComparison 
        folder={selectedFolder}
        onBack={() => {
          setView('folder');
          loadRecordings(selectedFolder.id);
        }}
      />
    );
  }

  // Folder view - show recordings in selected folder
  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="folder-view">
      {/* Header with back button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => { setView('home'); setSelectedFolder(null); loadFolders(); }}
            data-testid="back-to-home-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-medium text-zinc-100">{selectedFolder?.name}</h2>
            <Badge variant="outline" className="text-xs border-zinc-700">
              {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        
        {/* Comparison Button */}
        {recordings.length >= 1 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-cyan-700/50 hover:border-cyan-600 hover:bg-cyan-950/30 text-cyan-400"
            onClick={() => setView('comparison')}
            data-testid="comparison-btn"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Comparison
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : recordings.length === 0 ? (
        <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
          <CardContent className="p-8 text-center">
            <FileAudio className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
            <p className="text-zinc-500 text-sm">No recordings in this folder</p>
            <p className="text-zinc-600 text-xs mt-1">Save an analysis to add it here</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="grid gap-3">
            {recordings.map((recording) => (
              <Card 
                key={recording.id}
                className="bg-zinc-900/50 border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors cursor-pointer group"
                data-testid={`recording-${recording.id}`}
              >
                <CardContent className="p-4" onClick={() => handleOpenRecording(recording)}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-sm bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-zinc-200 truncate">{recording.name}</h3>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mb-2">{recording.filename}</p>
                      <div className="flex flex-wrap gap-2">
                        {recording.n_beats > 0 && (
                          <Badge variant="outline" className="text-[10px] border-zinc-700 px-1.5 py-0">
                            <Activity className="w-3 h-3 mr-1" />
                            {recording.n_beats} beats
                          </Badge>
                        )}
                        {recording.duration_sec > 0 && (
                          <Badge variant="outline" className="text-[10px] border-zinc-700 px-1.5 py-0">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDuration(recording.duration_sec)}
                          </Badge>
                        )}
                        {recording.has_light_stim && (
                          <Badge variant="outline" className="text-[10px] border-amber-700/50 text-amber-400 px-1.5 py-0">
                            <Zap className="w-3 h-3 mr-1" />
                            Light Stim
                          </Badge>
                        )}
                        {recording.has_drug_analysis && (
                          <Badge variant="outline" className="text-[10px] border-purple-700/50 text-purple-400 px-1.5 py-0">
                            <Pill className="w-3 h-3 mr-1" />
                            Drug
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600">{formatDate(recording.updated_at)}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-4 h-4 text-zinc-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem 
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecordingToRename(recording);
                              setRenameRecordingName(recording.name);
                              setRenameRecordingOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecordingToMove(recording);
                              setMoveTargetFolder('');
                              setMoveRecordingOpen(true);
                            }}
                          >
                            <MoveRight className="w-3.5 h-3.5 mr-2" />
                            Move to Folder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem 
                            className="text-xs text-red-400 focus:text-red-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRecordingToDelete(recording);
                              setDeleteRecordingOpen(true);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Rename Recording Dialog */}
      <Dialog open={renameRecordingOpen} onOpenChange={setRenameRecordingOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Rename Recording</DialogTitle>
          </DialogHeader>
          <Input
            value={renameRecordingName}
            onChange={(e) => setRenameRecordingName(e.target.value)}
            placeholder="Recording name"
            className="bg-zinc-950 border-zinc-800"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleRenameRecording()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRecordingOpen(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleRenameRecording} className="bg-cyan-600 hover:bg-cyan-700">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Recording Dialog */}
      <Dialog open={deleteRecordingOpen} onOpenChange={setDeleteRecordingOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Delete Recording</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Are you sure you want to delete "{recordingToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRecordingOpen(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleDeleteRecording} variant="destructive">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Recording Dialog */}
      <Dialog open={moveRecordingOpen} onOpenChange={setMoveRecordingOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">Move Recording</DialogTitle>
            <DialogDescription className="text-zinc-500">
              Select a folder to move "{recordingToMove?.name}" to
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTargetFolder} onValueChange={setMoveTargetFolder}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800">
              <SelectValue placeholder="Select folder" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {folders.filter(f => f.id !== selectedFolder?.id).map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    {folder.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveRecordingOpen(false)} className="border-zinc-700">
              Cancel
            </Button>
            <Button 
              onClick={handleMoveRecording} 
              className="bg-cyan-600 hover:bg-cyan-700"
              disabled={!moveTargetFolder}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
