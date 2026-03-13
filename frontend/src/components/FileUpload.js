import { useState, useCallback, useRef } from 'react';
import { Upload, FileAudio, X, Loader2, AlertCircle, GripVertical, ArrowUp, ArrowDown, CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const MAX_FILES_FOR_FUSION = 5;

export default function FileUpload({ onUpload, loading, appName = 'NEHER', onBack }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileProgress, setFileProgress] = useState({});
  const [uploadError, setUploadError] = useState(null);
  const [draggedFileIndex, setDraggedFileIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  // Read file in chunks to handle large files better
  const readFileAsArrayBuffer = async (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      };
      
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      
      // For very large files, read as array buffer
      reader.readAsArrayBuffer(file);
    });
  };

  const processFile = async (file) => {
    try {
      // Verify file is valid
      if (!file || file.size === 0) {
        throw new Error('File is empty or invalid');
      }
      
      // For files > 50MB, read with progress
      if (file.size > 50 * 1024 * 1024) {
        setFileProgress(prev => ({ ...prev, [file.name]: 0 }));
        await readFileAsArrayBuffer(file, (progress) => {
          setFileProgress(prev => ({ ...prev, [file.name]: progress }));
        });
        setFileProgress(prev => ({ ...prev, [file.name]: 100 }));
      }
      
      return file;
    } catch (error) {
      console.error('Error processing file:', error);
      throw error;
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setDragActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    dragCounter.current = 0;
    setUploadError(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      try {
        const droppedFiles = Array.from(e.dataTransfer.files);
        const abfFiles = droppedFiles.filter(f => f.name.toLowerCase().endsWith('.abf'));
        
        const filesToAdd = abfFiles.length > 0 ? abfFiles : droppedFiles;
        
        // Check max files limit
        const totalFiles = selectedFiles.length + filesToAdd.length;
        if (totalFiles > MAX_FILES_FOR_FUSION) {
          setUploadError(`Maximum ${MAX_FILES_FOR_FUSION} files can be combined. You have ${selectedFiles.length} files, trying to add ${filesToAdd.length}.`);
          e.dataTransfer.clearData();
          return;
        }
        
        // Process files one by one to avoid memory issues
        const processedFiles = [];
        for (const file of filesToAdd) {
          const processedFile = await processFile(file);
          processedFiles.push(processedFile);
        }
        
        setSelectedFiles(prev => [...prev, ...processedFiles]);
      } catch (error) {
        console.error('Error handling dropped files:', error);
        setUploadError(`Error processing file: ${error.message}`);
      }
      
      e.dataTransfer.clearData();
    }
  }, [selectedFiles.length]);

  const handleFileSelect = useCallback(async (e) => {
    setUploadError(null);
    const files = Array.from(e.target.files);
    
    if (files.length > 0) {
      // Check max files limit
      const totalFiles = selectedFiles.length + files.length;
      if (totalFiles > MAX_FILES_FOR_FUSION) {
        setUploadError(`Maximum ${MAX_FILES_FOR_FUSION} files can be combined. You have ${selectedFiles.length} files, trying to add ${files.length}.`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      try {
        // Process files one by one
        const processedFiles = [];
        for (const file of files) {
          const processedFile = await processFile(file);
          processedFiles.push(processedFile);
        }
        setSelectedFiles(prev => [...prev, ...processedFiles]);
      } catch (error) {
        console.error('Error selecting files:', error);
        setUploadError(`Error processing file: ${error.message}`);
      }
    }
    
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedFiles.length]);

  const removeFile = useCallback((idx) => {
    setSelectedFiles(prev => {
      const fileToRemove = prev[idx];
      // Clean up progress tracking
      setFileProgress(p => {
        const newProgress = { ...p };
        delete newProgress[fileToRemove?.name];
        return newProgress;
      });
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // Move file up in the list
  const moveFileUp = useCallback((idx) => {
    if (idx <= 0) return;
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      [newFiles[idx - 1], newFiles[idx]] = [newFiles[idx], newFiles[idx - 1]];
      return newFiles;
    });
  }, []);

  // Move file down in the list
  const moveFileDown = useCallback((idx) => {
    setSelectedFiles(prev => {
      if (idx >= prev.length - 1) return prev;
      const newFiles = [...prev];
      [newFiles[idx], newFiles[idx + 1]] = [newFiles[idx + 1], newFiles[idx]];
      return newFiles;
    });
  }, []);

  // Drag and drop reordering handlers for file list
  const handleFileDragStart = useCallback((e, idx) => {
    setDraggedFileIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx.toString());
  }, []);

  const handleFileDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  }, []);

  const handleFileDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleFileDrop = useCallback((e, targetIdx) => {
    e.preventDefault();
    const sourceIdx = draggedFileIndex;
    
    if (sourceIdx !== null && sourceIdx !== targetIdx) {
      setSelectedFiles(prev => {
        const newFiles = [...prev];
        const [removed] = newFiles.splice(sourceIdx, 1);
        newFiles.splice(targetIdx, 0, removed);
        return newFiles;
      });
    }
    
    setDraggedFileIndex(null);
    setDragOverIndex(null);
  }, [draggedFileIndex]);

  const handleFileDragEnd = useCallback(() => {
    setDraggedFileIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleUpload = useCallback(() => {
    if (selectedFiles.length > 0) {
      setUploadError(null);
      onUpload(selectedFiles);
    }
  }, [selectedFiles, onUpload]);

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] relative" data-testid="upload-page">
      {/* Ambient SEM glow orb */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            background: 'radial-gradient(circle, rgba(0, 201, 122, 0.40) 0%, transparent 70%)',
            filter: 'blur(100px)'
          }}
        />
      </div>
      
      <Card className="w-full max-w-2xl glass-surface relative z-10">
        <CardHeader>
          <CardTitle className="text-xl font-display" style={{ color: 'var(--text-primary)' }}>Upload SSE Data</CardTitle>
          <p className="text-sm font-body" style={{ color: 'var(--text-secondary)' }}>
            Upload at least 1 ABF file from your single electrode recording
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {uploadError && (
            <div className="p-3 bg-red-950/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div
            data-testid="file-dropzone"
            className={`drop-zone drop-zone-sem p-12 text-center cursor-pointer ${
              dragActive ? 'active' : ''
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--sem-accent)' }} />
            <p className="text-base font-medium font-body" style={{ color: 'var(--sem-text)' }}>
              Drop .abf files here
            </p>
            <p className="text-xs mt-2 font-body" style={{ color: 'var(--text-tertiary)' }}>
              or click to browse · Supports files up to 200MB
            </p>
            <input
              ref={fileInputRef}
              id="file-input"
              data-testid="file-input"
              type="file"
              multiple
              accept=".abf"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Required files section */}
          <div className="glass-surface-subtle rounded-xl p-4">
            <p className="text-xs font-body mb-4 uppercase tracking-widest" style={{ color: 'var(--text-secondary)', letterSpacing: '0.08em', fontSize: '0.72rem' }}>
              Required files:
            </p>
            <div className="flex items-center gap-3 text-sm">
              {selectedFiles.length > 0 ? (
                <CheckCircle className="w-4 h-4" style={{ color: 'var(--sem-accent)' }} />
              ) : (
                <div className="w-4 h-4 rounded-full" style={{ border: '1.5px solid rgba(255,255,255,0.20)' }} />
              )}
              <span className="font-body" style={{ color: selectedFiles.length > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                ABF recording file
              </span>
              <span className="ml-auto font-mono text-xs italic" style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                _recording.abf
              </span>
            </div>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2 animate-slide-up">
              {/* Fusion mode indicator */}
              {selectedFiles.length > 1 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-sm mb-3">
                  <Badge className="bg-emerald-600 text-white text-[10px]">FUSION MODE</Badge>
                  <span className="text-xs text-emerald-300">
                    {selectedFiles.length} recordings will be combined in order shown below
                  </span>
                </div>
              )}
              
              {/* File count indicator */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-zinc-500">
                  {selectedFiles.length} / {MAX_FILES_FOR_FUSION} files {selectedFiles.length > 1 && '(drag to reorder)'}
                </span>
                {selectedFiles.length > 1 && (
                  <span className="text-[10px] text-zinc-600">
                    Order: Recording 1 → Recording {selectedFiles.length}
                  </span>
                )}
              </div>
              
              {selectedFiles.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  draggable={selectedFiles.length > 1}
                  onDragStart={(e) => handleFileDragStart(e, i)}
                  onDragOver={(e) => handleFileDragOver(e, i)}
                  onDragLeave={handleFileDragLeave}
                  onDrop={(e) => handleFileDrop(e, i)}
                  onDragEnd={handleFileDragEnd}
                  className={`flex flex-col p-3 bg-zinc-900/50 border rounded-sm transition-all ${
                    dragOverIndex === i 
                      ? 'border-purple-500 bg-purple-950/20' 
                      : draggedFileIndex === i 
                        ? 'border-zinc-600 opacity-50' 
                        : 'border-zinc-800'
                  } ${selectedFiles.length > 1 ? 'cursor-move' : ''}`}
                  data-testid={`selected-file-${i}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedFiles.length > 1 && (
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-zinc-600" />
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-zinc-700 text-zinc-400">
                            {i + 1}
                          </Badge>
                        </div>
                      )}
                      <FileAudio className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs font-data text-zinc-300">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-500 font-data mr-2">
                        {formatFileSize(f.size)}
                      </span>
                      {selectedFiles.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                            onClick={(e) => { e.stopPropagation(); moveFileUp(i); }}
                            disabled={i === 0}
                            data-testid={`move-up-${i}`}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                            onClick={(e) => { e.stopPropagation(); moveFileDown(i); }}
                            disabled={i === selectedFiles.length - 1}
                            data-testid={`move-down-${i}`}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        data-testid={`remove-file-${i}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {fileProgress[f.name] !== undefined && fileProgress[f.name] < 100 && (
                    <div className="mt-2">
                      <Progress value={fileProgress[f.name]} className="h-1" />
                      <p className="text-[10px] text-zinc-500 mt-1">Reading file... {fileProgress[f.name]}%</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex justify-between items-center pt-4">
            <Button 
              variant="ghost" 
              onClick={onBack}
              className="rounded-lg"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'var(--text-secondary)',
                padding: '10px 20px',
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button
              data-testid="upload-btn"
              className="btn-start-analysis btn-start-analysis-sem"
              onClick={handleUpload}
              disabled={loading || selectedFiles.length === 0}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {selectedFiles.length > 1 ? 'Fusing & Processing...' : 'Processing...'}
                </span>
              ) : selectedFiles.length > 1 ? (
                `Fuse & Analyze ${selectedFiles.length} recordings ›`
              ) : (
                'Analyze File ›'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
