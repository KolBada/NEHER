import { useState, useCallback, useRef } from 'react';
import { Upload, FileAudio, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function FileUpload({ onUpload, loading, appName = 'NEHER' }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileProgress, setFileProgress] = useState({});
  const [uploadError, setUploadError] = useState(null);
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
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    setUploadError(null);
    const files = Array.from(e.target.files);
    
    if (files.length > 0) {
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
  }, []);

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
    <div className="flex items-center justify-center min-h-[70vh]" data-testid="upload-page">
      <Card className="w-full max-w-2xl bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 mb-1"
                style={{ fontFamily: 'Manrope, sans-serif' }}>
              {appName}
            </h1>
            <p className="text-sm text-zinc-500">
              Cardiac Electrophysiology Analysis Platform
            </p>
            <p className="text-[10px] text-zinc-600 mt-1">developed by Kolia H. Badarello</p>
          </div>

          {uploadError && (
            <div className="mb-4 p-3 bg-red-950/30 border border-red-800 rounded-sm flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div
            data-testid="file-dropzone"
            className={`border-2 border-dashed ${
              dragActive ? 'border-cyan-500 bg-cyan-950/20' : 'border-zinc-700 hover:border-zinc-600'
            } rounded-sm p-12 text-center cursor-pointer transition-colors`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-4 text-zinc-500" />
            <p className="text-base font-medium text-zinc-300">
              Drop .abf files here
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              or click to browse &middot; Supports files up to 200MB
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

          {selectedFiles.length > 0 && (
            <div className="mt-6 space-y-2 animate-slide-up">
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex flex-col p-3 bg-zinc-900/50 border border-zinc-800 rounded-sm"
                  data-testid={`selected-file-${i}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs font-data text-zinc-300">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500 font-data">
                        {formatFileSize(f.size)}
                      </span>
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

              <Button
                data-testid="upload-btn"
                className="w-full mt-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 rounded-sm font-medium text-xs h-9"
                onClick={handleUpload}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  `Analyze ${selectedFiles.length} file(s)`
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
