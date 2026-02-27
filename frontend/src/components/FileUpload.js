import { useState, useCallback } from 'react';
import { Upload, FileAudio, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function FileUpload({ onUpload, loading }) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.toLowerCase().endsWith('.abf')
    );
    if (files.length === 0 && e.dataTransfer.files.length > 0) {
      // Show all dropped files even if extension doesn't match - user knows best
      setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    } else if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files).filter(f =>
      f.name.toLowerCase().endsWith('.abf')
    );
    if (files.length > 0) setSelectedFiles(prev => [...prev, ...files]);
  }, []);

  const removeFile = useCallback((idx) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleUpload = useCallback(() => {
    if (selectedFiles.length > 0) onUpload(selectedFiles);
  }, [selectedFiles, onUpload]);

  return (
    <div className="flex items-center justify-center min-h-[70vh]" data-testid="upload-page">
      <Card className="w-full max-w-2xl bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 mb-2"
                style={{ fontFamily: 'Manrope, sans-serif' }}>
              NeuroVoltage
            </h1>
            <p className="text-sm text-zinc-500">
              Electrophysiology Analysis Platform
            </p>
          </div>

          <div
            data-testid="file-dropzone"
            className={`border-2 border-dashed ${
              dragActive ? 'border-cyan-500 bg-cyan-950/20' : 'border-zinc-700 hover:border-zinc-600'
            } rounded-sm p-12 text-center cursor-pointer transition-colors`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-4 text-zinc-500" />
            <p className="text-base font-medium text-zinc-300">
              Drop .abf files here
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              or click to browse &middot; WinLTP / Digidata recordings
            </p>
            <input
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
                  className="flex items-center justify-between p-3 bg-zinc-900/50 border border-zinc-800 rounded-sm"
                  data-testid={`selected-file-${i}`}
                >
                  <div className="flex items-center gap-2">
                    <FileAudio className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-data text-zinc-300">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 font-data">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
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
