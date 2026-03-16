import { useState, useEffect, useCallback, useMemo, startTransition, memo } from 'react';
import { 
  Folder, FolderPlus, FolderOpen, FileAudio, Pencil, Trash2, 
  ArrowLeft, MoreVertical, MoveRight, Clock, Activity, Zap, Pill,
  ChevronRight, Loader2, Plus, X, Check, BarChart3, ArrowUpDown,
  SortAsc, Calendar, GripVertical, Layers, ChevronDown, Palette,
  Upload, Info
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
  DropdownMenuLabel,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from 'sonner';
import api from '../api';
import FolderComparison from './FolderComparison';
import MEAPopulationAnalysis from './MEAPopulationAnalysis';

// Tooltip text definitions
const SEM_TOOLTIP = `Compatible with patch clamp, sharp extracellular microelectrode, or any single-electrode technique that produces .abf files. Detects cardiac beats from a continuous voltage trace.`;
const MEA_TOOLTIP = `Extracellular recording using an array of electrodes across a culture well. Spikes and bursts are pre-detected and exported as tables. NEHER analyzes network spike rate and burst rate.`;

// Info icon with tooltip component
function InfoTooltip({ text }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="glass-tooltip"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function HomeBrowser({ onOpenRecording, initialFolderId = null, onNavigateToSEM, onNavigateToMEA }) {
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
  const [folderSortBy, setFolderSortBy] = useState('alpha'); // 'modified', 'alpha', 'created'
  const [recordingSortBy, setRecordingSortBy] = useState('alpha'); // 'modified', 'alpha', 'created'
  const [comparisonKey, setComparisonKey] = useState(Date.now());

  // Section states
  const [sections, setSections] = useState([]);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [renameSectionOpen, setRenameSectionOpen] = useState(false);
  const [renameSectionName, setRenameSectionName] = useState('');
  const [sectionToRename, setSectionToRename] = useState(null);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState(null);
  const [deleteSectionConfirmed, setDeleteSectionConfirmed] = useState(false);
  const [draggedSection, setDraggedSection] = useState(null);
  const [dropTargetIndex, setDropTargetIndex] = useState(null); // Index where we'll insert (0 = before first, 1 = after first, etc.)
  
  // Delete confirmation states
  const [deleteFolderConfirmed, setDeleteFolderConfirmed] = useState(false);
  
  // Folder color picker
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [folderToColor, setFolderToColor] = useState(null);

  // Folder colors available
  const FOLDER_COLORS = [
    { name: 'amber', class: 'text-amber-400', bg: 'bg-amber-500/20' },
    { name: 'red', class: 'text-red-400', bg: 'bg-red-500/20' },
    { name: 'orange', class: 'text-orange-400', bg: 'bg-orange-500/20' },
    { name: 'yellow', class: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    { name: 'lime', class: 'text-lime-400', bg: 'bg-lime-500/20' },
    { name: 'green', class: 'text-green-400', bg: 'bg-green-500/20' },
    { name: 'emerald', class: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    { name: 'teal', class: 'text-teal-400', bg: 'bg-teal-500/20' },
    { name: 'cyan', class: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    { name: 'sky', class: 'text-sky-400', bg: 'bg-sky-500/20' },
    { name: 'blue', class: 'text-blue-400', bg: 'bg-blue-500/20' },
    { name: 'indigo', class: 'text-indigo-400', bg: 'bg-indigo-500/20' },
    { name: 'violet', class: 'text-violet-400', bg: 'bg-violet-500/20' },
    { name: 'purple', class: 'text-purple-400', bg: 'bg-purple-500/20' },
    { name: 'fuchsia', class: 'text-fuchsia-400', bg: 'bg-fuchsia-500/20' },
    { name: 'pink', class: 'text-pink-400', bg: 'bg-pink-500/20' },
    { name: 'rose', class: 'text-rose-400', bg: 'bg-rose-500/20' },
    { name: 'zinc', class: 'text-zinc-400', bg: 'bg-zinc-500/20' },
  ];

  const getFolderColorClass = (colorName) => {
    const color = FOLDER_COLORS.find(c => c.name === colorName) || FOLDER_COLORS[0];
    return color.class;
  };

  const getFolderBgClass = (colorName) => {
    const color = FOLDER_COLORS.find(c => c.name === colorName) || FOLDER_COLORS[0];
    return color.bg;
  };

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
    loadSections();
  }, []);

  // Navigate to initial folder if provided
  useEffect(() => {
    if (initialFolderId) {
      loadRecordings(initialFolderId);
    }
  }, [initialFolderId]);

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

  const loadSections = async () => {
    try {
      const { data } = await api.getSections();
      setSections(data.sections || []);
    } catch (err) {
      console.error('Failed to load sections');
    }
  };

  // Section handlers
  const handleCreateSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      await api.createSection(newSectionName.trim());
      toast.success('Section created');
      setNewSectionName('');
      setCreateSectionOpen(false);
      loadSections();
    } catch (err) {
      toast.error('Failed to create section');
    }
  };

  const handleRenameSection = async () => {
    if (!sectionToRename || !renameSectionName.trim()) return;
    try {
      await api.updateSection(sectionToRename.id, { name: renameSectionName.trim() });
      toast.success('Section renamed');
      setRenameSectionOpen(false);
      setSectionToRename(null);
      loadSections();
    } catch (err) {
      toast.error('Failed to rename section');
    }
  };

  const handleDeleteSection = async () => {
    if (!sectionToDelete) return;
    try {
      await api.deleteSection(sectionToDelete.id);
      toast.success('Section deleted');
      setDeleteSectionOpen(false);
      setSectionToDelete(null);
      loadSections();
      loadFolders(); // Refresh folders as they may have been unassigned
    } catch (err) {
      toast.error('Failed to delete section');
    }
  };

  const handleToggleSection = async (section) => {
    try {
      await api.updateSection(section.id, { expanded: !section.expanded });
      setSections(sections.map(s => s.id === section.id ? {...s, expanded: !s.expanded} : s));
    } catch (err) {
      console.error('Failed to toggle section');
    }
  };

  const handleSectionDragStart = (e, section) => {
    // Set drag data
    e.dataTransfer.setData('text/plain', section.id); // Fallback for some browsers
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'section', id: section.id }));
    e.dataTransfer.effectAllowed = 'move';
    
    // Set drag image (optional - helps with visual feedback)
    if (e.target) {
      e.dataTransfer.setDragImage(e.target, 20, 20);
    }
    
    // Update state immediately
    setDraggedSection(section);
  };

  const handleSectionDragEnd = () => {
    setDraggedSection(null);
    setDropTargetIndex(null);
  };

  // Handle drag over on drop zones (areas between sections)
  const handleDropZoneDragOver = (e, insertIndex) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetIndex(insertIndex);
  };

  const handleDropZoneDragLeave = (e) => {
    // Only clear if leaving to an element that's not a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetIndex(null);
    }
  };

  // Handle drop on a drop zone - insertIndex is where the dragged section should go
  const handleDropZoneDrop = async (e, insertIndex) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // Try to get the data - check both formats for browser compatibility
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData('application/json'));
      } catch {
        // Fallback to text/plain
        const id = e.dataTransfer.getData('text/plain');
        if (id) {
          data = { type: 'section', id };
        }
      }
      
      if (!data || data.type !== 'section') {
        setDraggedSection(null);
        setDropTargetIndex(null);
        return;
      }
      
      const currentIndex = sections.findIndex(s => s.id === data.id);
      if (currentIndex === -1) {
        setDraggedSection(null);
        setDropTargetIndex(null);
        return;
      }
      
      // If dropping in the same position or the position right after (no change), skip
      if (insertIndex === currentIndex || insertIndex === currentIndex + 1) {
        setDraggedSection(null);
        setDropTargetIndex(null);
        return;
      }
      
      // Build new order
      const draggedSec = sections[currentIndex];
      const newSections = sections.filter(s => s.id !== data.id);
      
      // Adjust insert index if we removed an item before the target position
      const adjustedIndex = insertIndex > currentIndex ? insertIndex - 1 : insertIndex;
      newSections.splice(adjustedIndex, 0, draggedSec);
      
      // Update state immediately for responsiveness
      setSections(newSections.map((s, i) => ({...s, order: i})));
      setDraggedSection(null);
      setDropTargetIndex(null);
      
      // Persist to backend
      await api.reorderSections(newSections.map(s => s.id));
      toast.success('Sections reordered');
    } catch (err) {
      console.error('Drop error:', err);
      setDraggedSection(null);
      setDropTargetIndex(null);
      loadSections();
    }
  };

  // Folder color handler
  const handleChangeFolderColor = async (color) => {
    if (!folderToColor) return;
    try {
      await api.updateFolder(folderToColor.id, { color });
      toast.success('Folder color updated');
      setColorPickerOpen(false);
      setFolderToColor(null);
      loadFolders();
    } catch (err) {
      toast.error('Failed to update folder color');
    }
  };

  // Assign folder to section
  const handleAssignFolderToSection = async (folder, sectionId) => {
    try {
      await api.updateFolder(folder.id, { section_id: sectionId || "" });
      toast.success(sectionId ? 'Folder moved to section' : 'Folder removed from section');
      loadFolders();
    } catch (err) {
      toast.error('Failed to move folder');
    }
  };

  const loadRecordings = async (folderId) => {
    // Set view immediately for perceived speed
    setView('folder');
    setLoading(true);
    
    try {
      const { data } = await api.getRecordingsInFolder(folderId);
      startTransition(() => {
        setSelectedFolder(data.folder);
        setRecordings(data.recordings || []);
      });
    } catch (err) {
      toast.error('Failed to load recordings');
      setView('home');
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
      await api.updateFolder(folderToRename.id, { name: renameFolderName.trim() });
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

  // Sort folders based on selected criteria
  const sortedFolders = useMemo(() => {
    if (!folders.length) return [];
    const sorted = [...folders];
    
    switch (folderSortBy) {
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      case 'modified':
      default:
        sorted.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
    }
    
    return sorted;
  }, [folders, folderSortBy]);

  // Sort recordings based on selected criteria
  const sortedRecordings = useMemo(() => {
    if (!recordings.length) return [];
    const sorted = [...recordings];
    
    switch (recordingSortBy) {
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        break;
      case 'modified':
      default:
        sorted.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        break;
    }
    
    return sorted;
  }, [recordings, recordingSortBy]);

  // Home view - show folders and new analysis option
  if (view === 'home') {
    return (
      <div className="neher-home-bg" data-testid="home-browser">
        {/* Ambient glow orbs */}
        <div className="neher-glow-orbs" />
        
        {/* Content container */}
        <div className="relative z-10 p-6 max-w-5xl mx-auto">
          {/* Header */}
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

          {/* Mode Selection Cards - Two glass cards side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {/* SSE Card */}
            <div 
              className="glass-surface mode-card mode-card-sem animate-fade-up-1 p-6 cursor-pointer"
              onClick={onNavigateToSEM}
              data-testid="sem-mode-card"
            >
              <div className="mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                  Sharp Single Electrode (SSE)
                  <InfoTooltip text={SEM_TOOLTIP} />
                </h3>
                <p className="font-body text-sm font-medium mt-2" style={{ color: 'var(--sem-accent)' }}>
                  For cardiac activity
                </p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Cardiac organoids (hCO) or neuro-cardiac assembloids (NeuCarS)
                </p>
              </div>
              
              {/* SSE Drop Zone Visual */}
              <div
                className="drop-zone drop-zone-sem p-8 text-center"
                data-testid="sem-dropzone"
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--sem-accent)' }} />
                <p className="font-body text-sm font-medium" style={{ color: 'var(--sem-text)' }}>Upload .abf files</p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Click to start</p>
              </div>
            </div>

            {/* MEA Card */}
            <div 
              className="glass-surface mode-card mode-card-mea animate-fade-up-2 p-6 cursor-pointer"
              onClick={onNavigateToMEA}
              data-testid="mea-mode-card"
            >
              <div className="mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                  Multi-Electrode Array (MEA)
                  <InfoTooltip text={MEA_TOOLTIP} />
                </h3>
                <p className="font-body text-sm font-medium mt-2" style={{ color: 'var(--mea-accent)' }}>
                  For neuronal activity
                </p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Spinal cord organoids (hSpO) or neuro-cardiac assembloids (NeuCarS)
                </p>
              </div>
              
              {/* MEA Drop Zone Visual */}
              <div
                className="drop-zone drop-zone-mea p-8 text-center"
                data-testid="mea-dropzone"
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--mea-accent)' }} />
                <p className="font-body text-sm font-medium" style={{ color: 'var(--mea-text)' }}>Upload 5 CSV files</p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Click to start</p>
              </div>
            </div>
          </div>

          {/* Saved Recordings Section - Glass panel */}
          <div className="glass-surface-subtle p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
                <h2 className="font-body text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                  Saved Recordings
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Sort Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs rounded-lg transition-all"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        backdropFilter: 'blur(12px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        color: 'var(--text-secondary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                      data-testid="sort-folders-btn"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                      {folderSortBy === 'alpha' ? 'A-Z' : folderSortBy === 'created' ? 'Created' : 'Modified'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-dropdown">
                <DropdownMenuItem 
                  className={`text-xs ${folderSortBy === 'modified' ? 'bg-zinc-800' : ''}`}
                  onClick={() => setFolderSortBy('modified')}
                >
                  <Clock className="w-3.5 h-3.5 mr-2" />
                  Last Modified
                  {folderSortBy === 'modified' && <Check className="w-3.5 h-3.5 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-xs ${folderSortBy === 'alpha' ? 'bg-zinc-800' : ''}`}
                  onClick={() => setFolderSortBy('alpha')}
                >
                  <SortAsc className="w-3.5 h-3.5 mr-2" />
                  Alphabetical (A-Z)
                  {folderSortBy === 'alpha' && <Check className="w-3.5 h-3.5 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className={`text-xs ${folderSortBy === 'created' ? 'bg-zinc-800' : ''}`}
                  onClick={() => setFolderSortBy('created')}
                >
                  <Calendar className="w-3.5 h-3.5 mr-2" />
                  Date Created
                  {folderSortBy === 'created' && <Check className="w-3.5 h-3.5 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px) saturate(180%)',
                WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onClick={() => setCreateSectionOpen(true)}
              data-testid="create-section-btn"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--accent-teal)' }} />
              New Section
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs rounded-lg transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(12px) saturate(180%)',
                WebkitBackdropFilter: 'blur(12px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onClick={() => setCreateFolderOpen(true)}
              data-testid="create-folder-btn"
            >
              <FolderPlus className="w-3.5 h-3.5 mr-1.5" style={{ color: 'var(--accent-teal)' }} />
              New Folder
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : folders.length === 0 && sections.length === 0 ? (
          <Card className="bg-zinc-900/30 border-zinc-800 rounded-sm">
            <CardContent className="p-8 text-center">
              <Folder className="w-10 h-10 mx-auto mb-3 text-zinc-600" />
              <p className="text-zinc-500 text-sm">No folders yet</p>
              <p className="text-zinc-600 text-xs mt-1">Create a folder to organize your recordings</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Sections with drop zones */}
            {sections.map((section, index) => {
              const sectionFolders = sortedFolders.filter(f => f.section_id === section.id);
              const isDragging = draggedSection !== null;
              const isBeingDragged = draggedSection?.id === section.id;
              
              return (
                <div key={section.id} className="relative mb-4">
                  {/* Drop zone BEFORE this section (only show when dragging) */}
                  {isDragging && !isBeingDragged && (
                    <div 
                      onDragOver={(e) => handleDropZoneDragOver(e, index)}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={(e) => handleDropZoneDrop(e, index)}
                      className="absolute -top-3 left-0 right-0 h-6 rounded-lg transition-all"
                      style={{ 
                        zIndex: 20,
                        background: dropTargetIndex === index 
                          ? 'rgba(20, 184, 166, 0.15)' 
                          : 'transparent',
                        border: dropTargetIndex === index 
                          ? '2px dashed rgba(20, 184, 166, 0.6)' 
                          : '2px dashed transparent',
                        backdropFilter: dropTargetIndex === index ? 'blur(8px)' : 'none',
                        boxShadow: dropTargetIndex === index 
                          ? '0 0 20px rgba(20, 184, 166, 0.3), inset 0 0 20px rgba(20, 184, 166, 0.1)' 
                          : 'none',
                      }}
                    />
                  )}
                  
                  {/* Section content - unified glass container */}
                  <div 
                    className={`transition-all duration-300 rounded-xl overflow-hidden ${isBeingDragged ? 'opacity-50 scale-[0.98] rotate-1' : 'opacity-100'}`}
                    style={{ 
                      background: isBeingDragged 
                        ? 'rgba(20, 184, 166, 0.08)' 
                        : 'rgba(255,255,255,0.02)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: isBeingDragged 
                        ? '1px solid rgba(20, 184, 166, 0.4)' 
                        : '1px solid rgba(255,255,255,0.08)',
                      boxShadow: isBeingDragged 
                        ? '0 20px 40px rgba(0,0,0,0.4), 0 0 30px rgba(20, 184, 166, 0.2)' 
                        : 'none',
                    }}
                  >
                    {/* Section Header - Draggable */}
                    <div 
                      draggable="true"
                      onDragStart={(e) => handleSectionDragStart(e, section)}
                      onDragEnd={handleSectionDragEnd}
                      data-testid={`section-header-${section.id}`}
                      className="flex items-center gap-2 group cursor-grab active:cursor-grabbing py-3 px-4 transition-all relative"
                      style={{ 
                        background: 'rgba(255,255,255,0.03)',
                        borderBottom: section.expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        zIndex: 10 
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      }}
                    >
                      <GripVertical 
                        className="w-4 h-4 flex-shrink-0 transition-all group-hover:opacity-100" 
                        style={{ 
                          color: 'var(--accent-teal)',
                          opacity: 0.4,
                        }}
                      />
                      <div
                        draggable="false"
                        onClick={(e) => { e.stopPropagation(); handleToggleSection(section); }}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleSection(section); }}
                      >
                        <ChevronDown 
                          className={`w-4 h-4 transition-transform ${!section.expanded ? '-rotate-90' : ''}`} 
                          style={{ color: section.expanded ? 'var(--accent-teal)' : 'var(--text-tertiary)' }}
                        />
                        <span 
                          className="text-sm transition-colors group-hover:text-white"
                          style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                        >
                          {section.name}
                        </span>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button draggable="false" variant="ghost" size="sm" className="glass-menu-btn h-6 w-6 p-0 rounded-md opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="glass-dropdown">
                          <DropdownMenuItem 
                            className="text-xs"
                            onClick={() => {
                              setSectionToRename(section);
                              setRenameSectionName(section.name);
                              setRenameSectionOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem 
                            className="text-xs text-red-400 focus:text-red-400"
                            onClick={() => {
                              setSectionToDelete(section);
                              setDeleteSectionOpen(true);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    {/* Section Folders - inside the section box */}
                    {section.expanded && (
                      <div className="px-4 pt-3 pb-4 space-y-1">
                        {sectionFolders.length === 0 ? (
                          <p className="text-xs py-3 pl-6" style={{ color: 'var(--text-tertiary)' }}>No folders in this section</p>
                        ) : (
                          sectionFolders.map((folder) => (
                            <div 
                              key={folder.id}
                              className="flex items-center gap-3 p-2.5 pl-6 rounded-lg cursor-pointer group transition-all"
                              style={{ background: 'transparent' }}
                              data-testid={`folder-${folder.id}`}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              onClick={() => loadRecordings(folder.id)}
                            >
                              <div 
                                className={`w-8 h-8 rounded-lg ${getFolderBgClass(folder.color)} flex items-center justify-center transition-all group-hover:scale-105`}
                                style={{ 
                                  boxShadow: `0 0 16px ${folder.color === 'amber' ? 'rgba(245,158,11,0.2)' : folder.color === 'emerald' ? 'rgba(16,185,129,0.2)' : folder.color === 'sky' ? 'rgba(14,165,233,0.2)' : folder.color === 'violet' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)'}`,
                                }}
                              >
                                <FolderOpen className={`w-4 h-4 ${getFolderColorClass(folder.color)}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm truncate" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{folder.name}</h3>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{folder.recording_count} recording{folder.recording_count !== 1 ? 's' : ''}</p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="glass-menu-btn h-7 w-7 p-0 rounded-md opacity-0 group-hover:opacity-100">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="glass-dropdown">
                                  <DropdownMenuItem 
                                    className="text-xs"
                                    onClick={(e) => { e.stopPropagation(); setFolderToColor(folder); setColorPickerOpen(true); }}
                                  >
                                    <Palette className="w-3.5 h-3.5 mr-2" />
                                    Change Color
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    className="text-xs"
                                    onClick={(e) => { e.stopPropagation(); setFolderToRename(folder); setRenameFolderName(folder.name); setRenameFolderOpen(true); }}
                                  >
                                    <Pencil className="w-3.5 h-3.5 mr-2" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-zinc-800" />
                                  <DropdownMenuItem 
                                    className="text-xs"
                                    onClick={(e) => { e.stopPropagation(); handleAssignFolderToSection(folder, ""); }}
                                  >
                                    <X className="w-3.5 h-3.5 mr-2" />
                                    Remove from Section
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-zinc-800" />
                                  <DropdownMenuItem 
                                    className="text-xs text-red-400 focus:text-red-400"
                                    onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder); setDeleteFolderOpen(true); }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Drop zone AFTER the LAST section (only show on last item) */}
                  {isDragging && !isBeingDragged && index === sections.length - 1 && (
                    <div 
                      onDragOver={(e) => handleDropZoneDragOver(e, sections.length)}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={(e) => handleDropZoneDrop(e, sections.length)}
                      className="h-6 mt-4 rounded-lg transition-all"
                      style={{ 
                        zIndex: 20,
                        background: dropTargetIndex === sections.length 
                          ? 'rgba(20, 184, 166, 0.15)' 
                          : 'transparent',
                        border: dropTargetIndex === sections.length 
                          ? '2px dashed rgba(20, 184, 166, 0.6)' 
                          : '2px dashed transparent',
                        backdropFilter: dropTargetIndex === sections.length ? 'blur(8px)' : 'none',
                        boxShadow: dropTargetIndex === sections.length 
                          ? '0 0 20px rgba(20, 184, 166, 0.3), inset 0 0 20px rgba(20, 184, 166, 0.1)' 
                          : 'none',
                      }}
                    />
                  )}
                </div>
              );
            })}
            
            {/* Unsectioned Folders */}
            {sortedFolders.filter(f => !f.section_id).length > 0 && (
              <div className="mt-8">
                {sections.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Unsorted</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  </div>
                )}
                {/* Unsorted folders in a unified glass container like sections */}
                <div 
                  className="rounded-xl overflow-hidden"
                  style={{ 
                    background: 'rgba(255,255,255,0.02)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="px-4 pt-3 pb-4 space-y-1">
                    {sortedFolders.filter(f => !f.section_id).map((folder) => (
                      <div 
                        key={folder.id}
                        className="flex items-center gap-3 p-2.5 pl-6 rounded-lg cursor-pointer group transition-all"
                        style={{ background: 'transparent' }}
                        data-testid={`folder-${folder.id}`}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => loadRecordings(folder.id)}
                      >
                        <div 
                          className={`w-8 h-8 rounded-lg ${getFolderBgClass(folder.color)} flex items-center justify-center transition-all group-hover:scale-105`}
                          style={{ 
                            boxShadow: `0 0 16px ${folder.color === 'amber' ? 'rgba(245,158,11,0.2)' : folder.color === 'emerald' ? 'rgba(16,185,129,0.2)' : folder.color === 'sky' ? 'rgba(14,165,233,0.2)' : folder.color === 'violet' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)'}`,
                          }}
                        >
                          <FolderOpen className={`w-4 h-4 ${getFolderColorClass(folder.color)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm truncate" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{folder.name}</h3>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{folder.recording_count} recording{folder.recording_count !== 1 ? 's' : ''}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="glass-menu-btn h-7 w-7 p-0 rounded-md opacity-0 group-hover:opacity-100">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass-dropdown">
                            <DropdownMenuItem 
                              className="text-xs"
                              onClick={(e) => { e.stopPropagation(); setFolderToColor(folder); setColorPickerOpen(true); }}
                            >
                              <Palette className="w-3.5 h-3.5 mr-2" />
                              Change Color
                            </DropdownMenuItem>
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
                            {sections.length > 0 && (
                              <>
                                <DropdownMenuSeparator className="bg-zinc-800" />
                                <DropdownMenuLabel className="text-xs text-zinc-500">Move to Section</DropdownMenuLabel>
                                {sections.map(s => (
                                  <DropdownMenuItem 
                                    key={s.id}
                                    className="text-xs"
                                    onClick={(e) => { e.stopPropagation(); handleAssignFolderToSection(folder, s.id); }}
                                  >
                                    <Layers className="w-3.5 h-3.5 mr-2" />
                                    {s.name}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
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
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
        {/* End of glass-surface-subtle panel */}
        </div>
        {/* End of content container */}

        {/* Create Section Dialog */}
        <Dialog open={createSectionOpen} onOpenChange={setCreateSectionOpen}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Create New Section</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                Sections help organize your folders into groups
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Section name"
              className="glass-dialog-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()}
            />
            <DialogFooter>
              <Button onClick={() => setCreateSectionOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button onClick={handleCreateSection} className="glass-btn-primary">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Section Dialog */}
        <Dialog open={renameSectionOpen} onOpenChange={setRenameSectionOpen}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Rename Section</DialogTitle>
            </DialogHeader>
            <Input
              value={renameSectionName}
              onChange={(e) => setRenameSectionName(e.target.value)}
              placeholder="Section name"
              className="glass-dialog-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSection()}
            />
            <DialogFooter>
              <Button onClick={() => setRenameSectionOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button onClick={handleRenameSection} className="glass-btn-primary">
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Section Dialog */}
        <Dialog open={deleteSectionOpen} onOpenChange={(open) => {
          setDeleteSectionOpen(open);
          if (!open) setDeleteSectionConfirmed(false);
        }}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Delete Section</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete "{sectionToDelete?.name}"? Folders in this section will be moved to Unsorted.
              </DialogDescription>
            </DialogHeader>
            {/* Show checkbox confirmation if section has folders */}
            {sectionToDelete && folders.filter(f => f.section_id === sectionToDelete.id).length > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <input
                  type="checkbox"
                  id="confirm-section-delete"
                  checked={deleteSectionConfirmed}
                  onChange={(e) => setDeleteSectionConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500"
                />
                <label htmlFor="confirm-section-delete" className="text-sm" style={{ color: '#fbbf24' }}>
                  I understand that this section contains <strong>{folders.filter(f => f.section_id === sectionToDelete.id).length} folder(s)</strong> that will be moved to Unsorted.
                </label>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setDeleteSectionOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSection}
                disabled={sectionToDelete && folders.filter(f => f.section_id === sectionToDelete.id).length > 0 && !deleteSectionConfirmed}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Folder Color Picker Dialog */}
        <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <DialogContent className="glass-dialog sm:max-w-md">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Choose Folder Color</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                Select a color for your folder
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-6 gap-3 py-4">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleChangeFolderColor(color.name)}
                  className={`glass-color-btn ${color.bg} ${folderToColor?.color === color.name ? 'selected' : ''}`}
                  title={color.name}
                >
                  <Folder className={`w-6 h-6 ${color.class}`} />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Folder Dialog */}
        <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Create New Folder</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                Enter a name for your new folder
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="glass-dialog-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <DialogFooter>
              <Button onClick={() => setCreateFolderOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} className="glass-btn-primary">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Folder Dialog */}
        <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Rename Folder</DialogTitle>
            </DialogHeader>
            <Input
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder="Folder name"
              className="glass-dialog-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder()}
            />
            <DialogFooter>
              <Button onClick={() => setRenameFolderOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button onClick={handleRenameFolder} className="glass-btn-primary">
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Folder Dialog */}
        <Dialog open={deleteFolderOpen} onOpenChange={(open) => {
          setDeleteFolderOpen(open);
          if (!open) setDeleteFolderConfirmed(false);
        }}>
          <DialogContent className="glass-dialog">
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--text-primary)' }}>Delete Folder</DialogTitle>
              <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                Are you sure you want to delete "{folderToDelete?.name}"? This will also delete all recordings in this folder. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {/* Show checkbox confirmation if folder has recordings */}
            {folderToDelete && folderToDelete.recording_count > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <input
                  type="checkbox"
                  id="confirm-folder-delete"
                  checked={deleteFolderConfirmed}
                  onChange={(e) => setDeleteFolderConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500"
                />
                <label htmlFor="confirm-folder-delete" className="text-sm" style={{ color: '#f87171' }}>
                  I understand that <strong>{folderToDelete.recording_count} recording(s)</strong> will be permanently deleted.
                </label>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setDeleteFolderOpen(false)} className="glass-btn-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleDeleteFolder} 
                variant="destructive"
                disabled={folderToDelete && folderToDelete.recording_count > 0 && !deleteFolderConfirmed}
                className="bg-red-600 hover:bg-red-700"
              >
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
        key={comparisonKey}
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
    <div className="neher-home-bg" data-testid="folder-view">
      {/* Ambient glow orbs - same as home page */}
      <div className="neher-glow-orbs" />
      
      {/* Content container */}
      <div className="relative z-10 p-6 max-w-5xl mx-auto">
        {/* Header - same branding as home page */}
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

        {/* Folder toolbar - glass styled */}
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
                onClick={() => { setView('home'); setSelectedFolder(null); loadFolders(); }}
                data-testid="back-to-home-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-3">
                <div 
                  className={`w-9 h-9 rounded-xl ${getFolderBgClass(selectedFolder?.color)} flex items-center justify-center transition-all`}
                  style={{ 
                    boxShadow: `0 0 20px ${selectedFolder?.color === 'amber' ? 'rgba(245,158,11,0.2)' : selectedFolder?.color === 'emerald' ? 'rgba(16,185,129,0.2)' : selectedFolder?.color === 'sky' ? 'rgba(14,165,233,0.2)' : selectedFolder?.color === 'violet' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <FolderOpen className={`w-5 h-5 ${getFolderColorClass(selectedFolder?.color)}`} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedFolder?.name}</h2>
                </div>
                <Badge 
                  variant="outline" 
                  className="text-xs px-3 py-1 rounded-full"
                  style={{ 
                    background: 'rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Sort Recordings Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs rounded-xl transition-all"
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
                    data-testid="sort-recordings-btn"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                    {recordingSortBy === 'alpha' ? 'A-Z' : recordingSortBy === 'created' ? 'Created' : 'Modified'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-dropdown">
                  <DropdownMenuItem 
                    className={`text-xs ${recordingSortBy === 'modified' ? 'bg-zinc-800' : ''}`}
                    onClick={() => setRecordingSortBy('modified')}
                  >
                    <Clock className="w-3.5 h-3.5 mr-2" />
                    Last Modified
                    {recordingSortBy === 'modified' && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className={`text-xs ${recordingSortBy === 'alpha' ? 'bg-zinc-800' : ''}`}
                    onClick={() => setRecordingSortBy('alpha')}
                  >
                    <SortAsc className="w-3.5 h-3.5 mr-2" />
                    Alphabetical (A-Z)
                    {recordingSortBy === 'alpha' && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className={`text-xs ${recordingSortBy === 'created' ? 'bg-zinc-800' : ''}`}
                    onClick={() => setRecordingSortBy('created')}
                  >
                    <Calendar className="w-3.5 h-3.5 mr-2" />
                    Date Created
                    {recordingSortBy === 'created' && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Comparison Button */}
              {recordings.length >= 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs rounded-xl transition-all"
                  style={{
                    background: 'rgba(20, 184, 166, 0.12)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(20, 184, 166, 0.35)',
                    color: 'var(--accent-teal)',
                    boxShadow: '0 0 20px rgba(20, 184, 166, 0.15)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(20, 184, 166, 0.20)';
                    e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.50)';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(20, 184, 166, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(20, 184, 166, 0.12)';
                    e.currentTarget.style.borderColor = 'rgba(20, 184, 166, 0.35)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(20, 184, 166, 0.15)';
                  }}
                  onClick={() => {
                    setComparisonKey(Date.now());
                    setView('comparison');
                  }}
                  data-testid="comparison-btn"
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  Comparison
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Recordings list - glass panel */}
        <div 
          className="glass-surface-subtle p-6 rounded-xl"
          style={{
            background: 'rgba(255, 255, 255, 0.025)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-teal)' }} />
            </div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-12">
              <div 
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ 
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <FileAudio className="w-8 h-8" style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No recordings in this folder</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Save an analysis to add it here</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-380px)]">
              <div className="flex flex-col gap-4 pb-4">
                {sortedRecordings.map((recording, index) => (
                  <div 
                    key={recording.id}
                    className="rounded-xl cursor-pointer group transition-all hover:translate-y-[-2px]"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderTopColor: 'rgba(255,255,255,0.12)',
                      borderLeftColor: 'rgba(255,255,255,0.10)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                      marginBottom: '4px',
                      animation: `fadeUp 0.4s ease ${index * 0.05}s both`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3), 0 0 20px rgba(20, 184, 166, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
                    }}
                    data-testid={`recording-${recording.id}`}
                  >
                    <div className="p-4" onClick={() => handleOpenRecording(recording)}>
                      <div className="flex items-start gap-4">
                        <div 
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105"
                          style={{ 
                            background: recording.source_type === 'MEA' 
                              ? 'rgba(16, 185, 129, 0.15)' 
                              : 'rgba(244, 206, 162, 0.12)',
                            border: recording.source_type === 'MEA'
                              ? '1px solid rgba(16, 185, 129, 0.25)'
                              : '1px solid rgba(244, 206, 162, 0.20)',
                            boxShadow: recording.source_type === 'MEA'
                              ? '0 0 15px rgba(16, 185, 129, 0.15)'
                              : '0 0 15px rgba(244, 206, 162, 0.12)',
                          }}
                        >
                          <FileAudio className="w-5 h-5" style={{ 
                            color: recording.source_type === 'MEA' ? 'var(--mea-accent)' : 'var(--sem-accent)' 
                          }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{recording.name}</h3>
                            {/* Source type badge - MEA */}
                            {recording.source_type === 'MEA' && (
                              <Badge 
                                className="text-[9px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  color: 'var(--mea-accent)',
                                }}
                              >
                                MEA
                              </Badge>
                            )}
                            {/* Source type badge - SSE */}
                            {recording.source_type !== 'MEA' && (
                              <Badge 
                                className="text-[9px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(244, 206, 162, 0.15)',
                                  border: '1px solid rgba(244, 206, 162, 0.3)',
                                  color: '#F4CEA2',
                                }}
                              >
                                SSE
                              </Badge>
                            )}
                          </div>
                          {/* File name(s) - for MEA show each on separate line */}
                          {recording.source_type === 'MEA' && (recording.filename?.includes('\n') || recording.filename?.includes(',')) ? (
                            <div className="text-xs mb-2.5 space-y-0.5" style={{ color: 'var(--text-tertiary)' }}>
                              {recording.filename.split(/[\n,]/).map((name, i) => (
                                <p key={i} className="truncate">{name.trim()}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs truncate mb-2.5" style={{ color: 'var(--text-tertiary)' }}>{recording.filename}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {/* SEM: Show beats count */}
                            {recording.source_type !== 'MEA' && recording.n_beats > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(244, 206, 162, 0.1)',
                                  border: '1px solid rgba(244, 206, 162, 0.25)',
                                  color: 'var(--sem-accent)',
                                }}
                              >
                                <Activity className="w-3 h-3 mr-1" />
                                {recording.n_beats} beats
                              </Badge>
                            )}
                            {/* Duration badge - for both MEA and SSE */}
                            {recording.duration_sec > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                <Clock className="w-3 h-3 mr-1" />
                                {formatDuration(recording.duration_sec)}
                              </Badge>
                            )}
                            {/* MEA: Show well ID */}
                            {recording.source_type === 'MEA' && recording.well_id && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.08)',
                                  border: '1px solid rgba(16, 185, 129, 0.20)',
                                  color: 'var(--mea-accent)',
                                }}
                              >
                                {recording.well_id}
                              </Badge>
                            )}
                            {/* MEA: Show electrodes count */}
                            {recording.source_type === 'MEA' && recording.n_electrodes > 0 && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                  color: 'var(--mea-accent)',
                                }}
                              >
                                <Activity className="w-3 h-3 mr-1" />
                                {recording.n_electrodes} electrodes
                              </Badge>
                            )}
                            {recording.has_light_stim && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                  color: '#f59e0b',
                                }}
                              >
                                <Zap className="w-3 h-3 mr-1" />
                                Light Stim
                              </Badge>
                            )}
                            {recording.has_drug_analysis && (
                              <Badge 
                                variant="outline" 
                                className="text-[10px] px-2 py-0.5 rounded-full"
                                style={{ 
                                  background: 'rgba(168, 85, 247, 0.1)',
                                  border: '1px solid rgba(168, 85, 247, 0.25)',
                                  color: '#a855f7',
                                }}
                              >
                                <Pill className="w-3 h-3 mr-1" />
                                Drug
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatDate(recording.updated_at)}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" className="glass-menu-btn h-8 w-8 p-0 rounded-lg opacity-0 group-hover:opacity-100">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="glass-dropdown">
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
                          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-tertiary)' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* MEA Population Analysis - show when folder contains MEA recordings */}
        {recordings.filter(r => r.source_type === 'MEA').length >= 2 && (
          <div className="mt-6">
            <MEAPopulationAnalysis 
              folderId={selectedFolder?.id} 
              recordings={recordings} 
            />
          </div>
        )}
      </div>
      {/* End of content container */}

      {/* Rename Recording Dialog */}
      <Dialog open={renameRecordingOpen} onOpenChange={setRenameRecordingOpen}>
        <DialogContent className="glass-dialog">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Rename Recording</DialogTitle>
          </DialogHeader>
          <Input
            value={renameRecordingName}
            onChange={(e) => setRenameRecordingName(e.target.value)}
            placeholder="Recording name"
            className="glass-dialog-input"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleRenameRecording()}
          />
          <DialogFooter>
            <Button onClick={() => setRenameRecordingOpen(false)} className="glass-btn-cancel">
              Cancel
            </Button>
            <Button onClick={handleRenameRecording} className="glass-btn-primary">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Recording Dialog */}
      <Dialog open={deleteRecordingOpen} onOpenChange={setDeleteRecordingOpen}>
        <DialogContent className="glass-dialog">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Delete Recording</DialogTitle>
            <DialogDescription style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete "{recordingToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteRecordingOpen(false)} className="glass-btn-cancel">
              Cancel
            </Button>
            <Button onClick={handleDeleteRecording} variant="destructive" className="bg-red-600 hover:bg-red-700">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Recording Dialog */}
      <Dialog open={moveRecordingOpen} onOpenChange={setMoveRecordingOpen}>
        <DialogContent className="glass-dialog">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Move Recording</DialogTitle>
            <DialogDescription style={{ color: 'var(--text-secondary)' }}>
              Select a folder to move "{recordingToMove?.name}" to
            </DialogDescription>
          </DialogHeader>
          <Select value={moveTargetFolder} onValueChange={setMoveTargetFolder}>
            <SelectTrigger className="glass-dialog-input">
              <SelectValue placeholder="Select folder" />
            </SelectTrigger>
            <SelectContent className="glass-dropdown">
              {folders.filter(f => f.id !== selectedFolder?.id).map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
                    {folder.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={() => setMoveRecordingOpen(false)} className="glass-btn-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleMoveRecording} 
              className="glass-btn-primary"
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
