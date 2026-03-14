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
    <div className="flex items-center justify-center min-h-[70vh] pt-16 relative" data-testid="upload-page">
      {/* Ambient SSE glow orb */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[500px] h-[500px] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            background: 'radial-gradient(circle, rgba(244, 206, 162, 0.35) 0%, transparent 70%)',
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
            <div 
              className="p-3 rounded-xl flex items-center gap-2 text-xs"
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
              }}
            >
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
            <div className="space-y-3 animate-slide-up">
              {/* Fusion mode indicator */}
              {selectedFiles.length > 1 && (
                <div 
                  className="flex items-center gap-2 p-3 rounded-xl mb-3"
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <Badge 
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: 'rgba(16, 185, 129, 0.3)',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      color: '#34d399',
                    }}
                  >
                    FUSION MODE
                  </Badge>
                  <span className="text-xs" style={{ color: '#6ee7b7' }}>
                    {selectedFiles.length} recordings will be combined in order shown below
                  </span>
                </div>
              )}
              
              {/* File count indicator */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {selectedFiles.length} / {MAX_FILES_FOR_FUSION} files {selectedFiles.length > 1 && '(drag to reorder)'}
                </span>
                {selectedFiles.length > 1 && (
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
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
                  className={`flex flex-col p-3 rounded-xl transition-all ${selectedFiles.length > 1 ? 'cursor-move' : ''}`}
                  style={{
                    background: dragOverIndex === i 
                      ? 'rgba(168, 85, 247, 0.15)' 
                      : draggedFileIndex === i 
                        ? 'rgba(255, 255, 255, 0.02)' 
                        : 'rgba(255, 255, 255, 0.03)',
                    backdropFilter: 'blur(12px)',
                    border: dragOverIndex === i 
                      ? '1px solid rgba(168, 85, 247, 0.4)' 
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderTopColor: dragOverIndex !== i ? 'rgba(255, 255, 255, 0.12)' : undefined,
                    opacity: draggedFileIndex === i ? 0.5 : 1,
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
                  }}
                  data-testid={`selected-file-${i}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedFiles.length > 1 && (
                        <div className="flex items-center gap-1">
                          <GripVertical className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                          <Badge 
                            variant="outline" 
                            className="text-[9px] px-1.5 py-0 rounded-full"
                            style={{
                              background: 'rgba(244, 206, 162, 0.12)',
                              border: '1px solid rgba(244, 206, 162, 0.25)',
                              color: 'var(--sem-accent)',
                            }}
                          >
                            {i + 1}
                          </Badge>
                        </div>
                      )}
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                          background: 'rgba(244, 206, 162, 0.12)',
                          border: '1px solid rgba(244, 206, 162, 0.2)',
                        }}
                      >
                        <FileAudio className="w-4 h-4" style={{ color: 'var(--sem-accent)' }} />
                      </div>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{f.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono mr-2" style={{ color: 'var(--text-tertiary)' }}>
                        {formatFileSize(f.size)}
                      </span>
                      {selectedFiles.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-lg transition-all"
                            style={{
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              color: 'var(--text-tertiary)',
                              opacity: i === 0 ? 0.3 : 1,
                            }}
                            onClick={(e) => { e.stopPropagation(); moveFileUp(i); }}
                            disabled={i === 0}
                            data-testid={`move-up-${i}`}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 rounded-lg transition-all"
                            style={{
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              color: 'var(--text-tertiary)',
                              opacity: i === selectedFiles.length - 1 ? 0.3 : 1,
                            }}
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
                        className="h-7 w-7 p-0 rounded-lg transition-all"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: 'var(--text-tertiary)',
                        }}
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
                      <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Reading file... {fileProgress[f.name]}%</p>
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
              data-testid="upload-btn"
              size="sm"
              className="h-9 px-4 rounded-xl transition-all"
              style={{
                background: 'rgba(244, 206, 162, 0.12)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(244, 206, 162, 0.35)',
                color: '#F4CEA2',
                boxShadow: '0 0 20px rgba(244, 206, 162, 0.15)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(244, 206, 162, 0.20)';
                e.currentTarget.style.borderColor = 'rgba(244, 206, 162, 0.50)';
                e.currentTarget.style.boxShadow = '0 0 25px rgba(244, 206, 162, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(244, 206, 162, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(244, 206, 162, 0.35)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(244, 206, 162, 0.15)';
              }}
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
