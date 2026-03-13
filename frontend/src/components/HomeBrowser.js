import { useState, useEffect, useCallback, useMemo, startTransition, memo, useRef } from 'react';
import { 
  Folder, FolderPlus, FolderOpen, FileAudio, Pencil, Trash2, 
  ArrowLeft, MoreVertical, MoveRight, Clock, Activity, Zap, Pill,
  ChevronRight, Loader2, Plus, X, Check, BarChart3, ArrowUpDown,
  SortAsc, Calendar, GripVertical, Layers, ChevronDown, Palette,
  Upload, Info, AlertCircle
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
const SEM_TOOLTIP = `Single-electrode extracellular recording using a sharp glass microelectrode positioned near the tissue. Detects cardiac beats from a continuous voltage trace.`;
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
          className="max-w-sm bg-zinc-900 border-zinc-700 text-zinc-300 text-xs p-3"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function HomeBrowser({ onNewAnalysis, onOpenRecording, initialFolderId = null, onSEMFilesSelected, onMEAFilesSelected }) {
  const [view, setView] = useState('home'); // 'home', 'folder', 'comparison'
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Drop zone states
  const [semDragActive, setSemDragActive] = useState(false);
  const [meaDragActive, setMeaDragActive] = useState(false);
  const [semError, setSemError] = useState(null);
  const [meaError, setMeaError] = useState(null);
  const semInputRef = useRef(null);
  const meaInputRef = useRef(null);
  
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
    { name: 'amber', class: 'text-amber-500', bg: 'bg-amber-500/10' },
    { name: 'red', class: 'text-red-500', bg: 'bg-red-500/10' },
    { name: 'orange', class: 'text-orange-500', bg: 'bg-orange-500/10' },
    { name: 'yellow', class: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { name: 'lime', class: 'text-lime-500', bg: 'bg-lime-500/10' },
    { name: 'green', class: 'text-green-500', bg: 'bg-green-500/10' },
    { name: 'emerald', class: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { name: 'teal', class: 'text-teal-500', bg: 'bg-teal-500/10' },
    { name: 'cyan', class: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { name: 'sky', class: 'text-sky-500', bg: 'bg-sky-500/10' },
    { name: 'blue', class: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'indigo', class: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { name: 'violet', class: 'text-violet-500', bg: 'bg-violet-500/10' },
    { name: 'purple', class: 'text-purple-500', bg: 'bg-purple-500/10' },
    { name: 'fuchsia', class: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
    { name: 'pink', class: 'text-pink-500', bg: 'bg-pink-500/10' },
    { name: 'rose', class: 'text-rose-500', bg: 'bg-rose-500/10' },
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

  // SEM Drop Zone Handlers
  const handleSEMDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setSemDragActive(true);
  }, []);

  const handleSEMDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setSemDragActive(false);
  }, []);

  const handleSEMDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleSEMDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setSemDragActive(false);
    setSemError(null);
    
    const files = Array.from(e.dataTransfer.files);
    const abfFiles = files.filter(f => f.name.toLowerCase().endsWith('.abf'));
    
    if (abfFiles.length === 0) {
      setSemError('Only .abf files are accepted');
      return;
    }
    
    if (onSEMFilesSelected) {
      onSEMFilesSelected(abfFiles);
    }
  }, [onSEMFilesSelected]);

  const handleSEMFileSelect = useCallback((e) => {
    setSemError(null);
    const files = Array.from(e.target.files);
    const abfFiles = files.filter(f => f.name.toLowerCase().endsWith('.abf'));
    
    if (abfFiles.length > 0 && onSEMFilesSelected) {
      onSEMFilesSelected(abfFiles);
    }
    
    if (semInputRef.current) {
      semInputRef.current.value = '';
    }
  }, [onSEMFilesSelected]);

  // MEA Drop Zone Handlers
  const handleMEADragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setMeaDragActive(true);
  }, []);

  const handleMEADragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setMeaDragActive(false);
  }, []);

  const handleMEADragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleMEADrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setMeaDragActive(false);
    setMeaError(null);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
    
    if (csvFiles.length === 0) {
      setMeaError('Only .csv files are accepted');
      return;
    }
    
    if (csvFiles.length > 5) {
      setMeaError('A MEA dataset requires exactly 5 CSV files');
      return;
    }
    
    if (onMEAFilesSelected) {
      onMEAFilesSelected(csvFiles);
    }
  }, [onMEAFilesSelected]);

  const handleMEAFileSelect = useCallback((e) => {
    setMeaError(null);
    const files = Array.from(e.target.files);
    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
    
    if (csvFiles.length > 5) {
      setMeaError('A MEA dataset requires exactly 5 CSV files');
      if (meaInputRef.current) {
        meaInputRef.current.value = '';
      }
      return;
    }
    
    if (csvFiles.length > 0 && onMEAFilesSelected) {
      onMEAFilesSelected(csvFiles);
    }
    
    if (meaInputRef.current) {
      meaInputRef.current.value = '';
    }
  }, [onMEAFilesSelected]);

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
            {/* SEM Card */}
            <div 
              className={`glass-surface mode-card mode-card-sem animate-fade-up-1 p-6 ${
                semDragActive ? 'ring-1 ring-[var(--sem-accent)]' : ''
              }`}
              data-testid="sem-mode-card"
            >
              <div className="mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                  Sharp Extracellular Microelectrode (SEM)
                  <InfoTooltip text={SEM_TOOLTIP} />
                </h3>
                <p className="font-body text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  For cardiac activity — cardioids alone or neuro-cardiac assembloids (NeuCarS).
                </p>
              </div>
              
              {/* SEM Drop Zone */}
              <div
                className={`drop-zone drop-zone-sem p-8 text-center cursor-pointer ${
                  semDragActive ? 'active' : ''
                }`}
                onDragEnter={handleSEMDragEnter}
                onDragLeave={handleSEMDragLeave}
                onDragOver={handleSEMDragOver}
                onDrop={handleSEMDrop}
                onClick={() => semInputRef.current?.click()}
                data-testid="sem-dropzone"
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--sem-accent)' }} />
                <p className="font-body text-sm font-medium" style={{ color: 'var(--sem-text)' }}>Drop .abf files here</p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>or click to browse</p>
                <input
                  ref={semInputRef}
                  type="file"
                  multiple
                  accept=".abf"
                  className="hidden"
                  onChange={handleSEMFileSelect}
                  data-testid="sem-file-input"
                />
              </div>
              {semError && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-xs font-body">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{semError}</span>
                </div>
              )}
            </div>

            {/* MEA Card */}
            <div 
              className={`glass-surface mode-card mode-card-mea animate-fade-up-2 p-6 ${
                meaDragActive ? 'ring-1 ring-[var(--mea-accent)]' : ''
              }`}
              data-testid="mea-mode-card"
            >
              <div className="mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                  Multi-Electrode Array (MEA)
                  <InfoTooltip text={MEA_TOOLTIP} />
                </h3>
                <p className="font-body text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  For neuronal activity — neuronal organoids (hSpO) or neuro-cardiac assembloids (NeuCarS).
                </p>
              </div>
              
              {/* MEA Drop Zone */}
              <div
                className={`drop-zone drop-zone-mea p-8 text-center cursor-pointer ${
                  meaDragActive ? 'active' : ''
                }`}
                onDragEnter={handleMEADragEnter}
                onDragLeave={handleMEADragLeave}
                onDragOver={handleMEADragOver}
                onDrop={handleMEADrop}
                onClick={() => meaInputRef.current?.click()}
                data-testid="mea-dropzone"
              >
                <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--mea-accent)' }} />
                <p className="font-body text-sm font-medium" style={{ color: 'var(--mea-text)' }}>Drop 5 CSV files here</p>
                <p className="font-body text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>or click to browse</p>
                <input
                  ref={meaInputRef}
                  type="file"
                  multiple
                  accept=".csv"
                  className="hidden"
                  onChange={handleMEAFileSelect}
                  data-testid="mea-file-input"
                />
              </div>
              {meaError && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-xs font-body">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{meaError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Saved Recordings Section - Glass panel */}
          <div className="glass-surface-subtle p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--sem-accent)' }} />
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
                      className="h-8 text-xs border-zinc-700/50 hover:border-zinc-600 rounded-lg bg-transparent font-body"
                      data-testid="sort-folders-btn"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                      {folderSortBy === 'alpha' ? 'A-Z' : folderSortBy === 'created' ? 'Created' : 'Modified'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
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
              className="h-8 text-xs border-zinc-700 hover:border-zinc-600 rounded-sm"
              onClick={() => setCreateSectionOpen(true)}
              data-testid="create-section-btn"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              New Section
            </Button>
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
          <div className="space-y-3">
            {/* Sections with drop zones */}
            {sections.map((section, index) => {
              const sectionFolders = sortedFolders.filter(f => f.section_id === section.id);
              const isDragging = draggedSection !== null;
              const isBeingDragged = draggedSection?.id === section.id;
              
              return (
                <div key={section.id} className="relative">
                  {/* Drop zone BEFORE this section (only show when dragging) */}
                  {isDragging && !isBeingDragged && (
                    <div 
                      onDragOver={(e) => handleDropZoneDragOver(e, index)}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={(e) => handleDropZoneDrop(e, index)}
                      className={`absolute -top-2 left-0 right-0 h-4 rounded transition-all ${
                        dropTargetIndex === index 
                          ? 'bg-cyan-500/30 border-2 border-dashed border-cyan-500 h-8' 
                          : 'hover:bg-zinc-700/30'
                      }`}
                      style={{ zIndex: 20 }}
                    />
                  )}
                  
                  {/* Section content */}
                  <div 
                    className={`transition-all duration-200 ${isBeingDragged ? 'opacity-40 scale-[0.98]' : 'opacity-100'}`}
                  >
                    {/* Section Header - Draggable */}
                    <div 
                      draggable="true"
                      onDragStart={(e) => handleSectionDragStart(e, section)}
                      onDragEnd={handleSectionDragEnd}
                      data-testid={`section-header-${section.id}`}
                      className="flex items-center gap-2 mb-2 group cursor-grab active:cursor-grabbing py-2 px-1 rounded-sm transition-colors hover:bg-zinc-800/30 relative"
                      style={{ zIndex: 10 }}
                    >
                      <GripVertical className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      <div
                        draggable="false"
                        onClick={(e) => { e.stopPropagation(); handleToggleSection(section); }}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer select-none"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleSection(section); }}
                      >
                        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${!section.expanded ? '-rotate-90' : ''}`} />
                        <span className="text-sm font-medium text-zinc-300">{section.name}</span>
                        <div className="flex-1 h-px bg-zinc-800 ml-2" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button draggable="false" variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="w-3.5 h-3.5 text-zinc-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
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
                    
                    {/* Section Folders */}
                    {section.expanded && (
                      <div className="grid gap-2 pl-6 pb-4">
                        {sectionFolders.length === 0 ? (
                          <p className="text-xs text-zinc-600 py-2">No folders in this section</p>
                        ) : (
                          sectionFolders.map((folder) => (
                            <Card 
                              key={folder.id}
                              className="bg-zinc-900/50 border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors cursor-pointer group"
                              data-testid={`folder-${folder.id}`}
                            >
                              <CardContent className="p-3 flex items-center gap-3" onClick={() => loadRecordings(folder.id)}>
                                <div className={`w-8 h-8 rounded-sm ${getFolderBgClass(folder.color)} flex items-center justify-center`}>
                                  <FolderOpen className={`w-4 h-4 ${getFolderColorClass(folder.color)}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-sm font-medium text-zinc-200 truncate">{folder.name}</h3>
                                  <p className="text-xs text-zinc-500">{folder.recording_count} recording{folder.recording_count !== 1 ? 's' : ''}</p>
                                </div>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100">
                                      <MoreVertical className="w-3.5 h-3.5 text-zinc-500" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
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
                                <ChevronRight className="w-4 h-4 text-zinc-600" />
                              </CardContent>
                            </Card>
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
                      className={`h-4 mt-3 rounded transition-all ${
                        dropTargetIndex === sections.length 
                          ? 'bg-cyan-500/30 border-2 border-dashed border-cyan-500 h-8' 
                          : 'hover:bg-zinc-700/30'
                      }`}
                      style={{ zIndex: 20 }}
                    />
                  )}
                </div>
              );
            })}
            
            {/* Unsectioned Folders */}
            {sortedFolders.filter(f => !f.section_id).length > 0 && (
              <div className="grid gap-2">
                {sections.length > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-zinc-500">Unsorted</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                )}
                {sortedFolders.filter(f => !f.section_id).map((folder) => (
              <Card 
                key={folder.id}
                className="bg-zinc-900/50 border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors cursor-pointer group"
                data-testid={`folder-${folder.id}`}
              >
                <CardContent className="p-4 flex items-center gap-4" onClick={() => loadRecordings(folder.id)}>
                  <div className={`w-10 h-10 rounded-sm ${getFolderBgClass(folder.color)} flex items-center justify-center`}>
                    <FolderOpen className={`w-5 h-5 ${getFolderColorClass(folder.color)}`} />
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
                  <ChevronRight className="w-4 h-4 text-zinc-600" />
                </CardContent>
              </Card>
            ))}
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
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Create New Section</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Sections help organize your folders into groups
              </DialogDescription>
            </DialogHeader>
            <Input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Section name"
              className="bg-zinc-950 border-zinc-800"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSection()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateSectionOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button onClick={handleCreateSection} className="bg-cyan-600 hover:bg-cyan-700">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Section Dialog */}
        <Dialog open={renameSectionOpen} onOpenChange={setRenameSectionOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Rename Section</DialogTitle>
            </DialogHeader>
            <Input
              value={renameSectionName}
              onChange={(e) => setRenameSectionName(e.target.value)}
              placeholder="Section name"
              className="bg-zinc-950 border-zinc-800"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSection()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameSectionOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button onClick={handleRenameSection} className="bg-cyan-600 hover:bg-cyan-700">
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
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Delete Section</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Are you sure you want to delete "{sectionToDelete?.name}"? Folders in this section will be moved to Unsorted.
              </DialogDescription>
            </DialogHeader>
            {/* Show checkbox confirmation if section has folders */}
            {sectionToDelete && folders.filter(f => f.section_id === sectionToDelete.id).length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-amber-950/30 border border-amber-800/50 rounded-sm">
                <input
                  type="checkbox"
                  id="confirm-section-delete"
                  checked={deleteSectionConfirmed}
                  onChange={(e) => setDeleteSectionConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                />
                <label htmlFor="confirm-section-delete" className="text-sm text-amber-200">
                  I understand that this section contains <strong>{folders.filter(f => f.section_id === sectionToDelete.id).length} folder(s)</strong> that will be moved to Unsorted.
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteSectionOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteSection}
                disabled={sectionToDelete && folders.filter(f => f.section_id === sectionToDelete.id).length > 0 && !deleteSectionConfirmed}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Folder Color Picker Dialog */}
        <Dialog open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Choose Folder Color</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-6 gap-2 py-2">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleChangeFolderColor(color.name)}
                  className={`w-10 h-10 rounded-sm ${color.bg} flex items-center justify-center hover:ring-2 ring-white/20 transition-all ${folderToColor?.color === color.name ? 'ring-2 ring-white/50' : ''}`}
                >
                  <Folder className={`w-5 h-5 ${color.class}`} />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

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
        <Dialog open={deleteFolderOpen} onOpenChange={(open) => {
          setDeleteFolderOpen(open);
          if (!open) setDeleteFolderConfirmed(false);
        }}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-zinc-100">Delete Folder</DialogTitle>
              <DialogDescription className="text-zinc-500">
                Are you sure you want to delete "{folderToDelete?.name}"? This will also delete all recordings in this folder. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {/* Show checkbox confirmation if folder has recordings */}
            {folderToDelete && folderToDelete.recording_count > 0 && (
              <div className="flex items-start gap-3 p-3 bg-red-950/30 border border-red-800/50 rounded-sm">
                <input
                  type="checkbox"
                  id="confirm-folder-delete"
                  checked={deleteFolderConfirmed}
                  onChange={(e) => setDeleteFolderConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500"
                />
                <label htmlFor="confirm-folder-delete" className="text-sm text-red-200">
                  I understand that <strong>{folderToDelete.recording_count} recording(s)</strong> will be permanently deleted.
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteFolderOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button 
                onClick={handleDeleteFolder} 
                variant="destructive"
                disabled={folderToDelete && folderToDelete.recording_count > 0 && !deleteFolderConfirmed}
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
        <div className="flex items-center gap-2">
          {/* Sort Recordings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-zinc-700 hover:border-zinc-600 rounded-sm"
                data-testid="sort-recordings-btn"
              >
                <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
                {recordingSortBy === 'alpha' ? 'A-Z' : recordingSortBy === 'created' ? 'Created' : 'Modified'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
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
              className="h-8 text-xs border-emerald-700/50 hover:border-emerald-600 hover:bg-emerald-950/30 text-emerald-400"
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
            {sortedRecordings.map((recording) => (
              <Card 
                key={recording.id}
                className="bg-zinc-900/50 border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors cursor-pointer group"
                data-testid={`recording-${recording.id}`}
              >
                <CardContent className="p-4" onClick={() => handleOpenRecording(recording)}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-sm bg-zinc-700/30 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-zinc-200 truncate">{recording.name}</h3>
                        {/* Source type badge */}
                        {recording.source_type === 'MEA' && (
                          <Badge className="bg-sky-600/30 text-sky-400 text-[9px] px-1.5 py-0 border-sky-500/50">
                            MEA
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 truncate mb-2">{recording.filename}</p>
                      <div className="flex flex-wrap gap-2">
                        {/* SEM: Show beats count */}
                        {recording.source_type !== 'MEA' && recording.n_beats > 0 && (
                          <Badge variant="outline" className="text-[10px] border-zinc-700 px-1.5 py-0">
                            <Activity className="w-3 h-3 mr-1" />
                            {recording.n_beats} beats
                          </Badge>
                        )}
                        {/* MEA: Show electrodes count */}
                        {recording.source_type === 'MEA' && recording.n_electrodes > 0 && (
                          <Badge variant="outline" className="text-[10px] border-sky-700/50 text-sky-400 px-1.5 py-0">
                            <Activity className="w-3 h-3 mr-1" />
                            {recording.n_electrodes} electrodes
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

      {/* MEA Population Analysis - show when folder contains MEA recordings */}
      {recordings.filter(r => r.source_type === 'MEA').length >= 2 && (
        <div className="mt-6">
          <MEAPopulationAnalysis 
            folderId={selectedFolder?.id} 
            recordings={recordings} 
          />
        </div>
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
