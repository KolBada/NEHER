import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks to stay under proxy limits

// Chunked upload for large files (>10MB)
const chunkedUpload = async (file, onProgress) => {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Initialize upload
  const initResponse = await axios.post(`${API_URL}/upload/init`, {
    filename: file.name,
    total_size: file.size,
    total_chunks: totalChunks
  });
  
  const uploadId = initResponse.data.upload_id;
  
  // Upload chunks
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('file', chunk, `chunk_${chunkIndex}`);
    
    let retries = 3;
    while (retries > 0) {
      try {
        await axios.post(`${API_URL}/upload/chunk/${uploadId}/${chunkIndex}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000, // 1 minute per chunk
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Report progress
    if (onProgress) {
      onProgress({
        loaded: end,
        total: file.size,
        percent: Math.round((end / file.size) * 100)
      });
    }
  }
  
  // Complete upload
  const completeResponse = await axios.post(`${API_URL}/upload/complete`, {
    upload_id: uploadId
  }, {
    timeout: 300000, // 5 minutes for processing
  });
  
  return completeResponse;
};

// Regular upload with retry for smaller files
const regularUpload = async (formData, onUploadProgress, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 minutes
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        onUploadProgress: onUploadProgress,
      });
      return response;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      // Retry on 520, 502, 503, 504 errors
      if ([520, 502, 503, 504].includes(status) && attempt < maxRetries) {
        console.log(`Upload attempt ${attempt} failed with ${status}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// Chunked upload for large files with fusion support
const chunkedUploadFuse = async (files, onProgress) => {
  // For single file, just use regular chunked upload
  if (files.length === 1) {
    return chunkedUpload(files[0], onProgress);
  }
  
  // For multiple files, upload each file using chunked upload then fuse on server
  // We need to upload each file individually first, then combine
  const uploadedFiles = [];
  let totalSize = files.reduce((sum, f) => sum + f.size, 0);
  let uploadedSize = 0;
  
  for (const file of files) {
    await chunkedUpload(file, (progress) => {
      if (onProgress) {
        const currentTotal = uploadedSize + progress.loaded;
        onProgress({
          loaded: currentTotal,
          total: totalSize,
          percent: Math.round((currentTotal / totalSize) * 100)
        });
      }
    });
    uploadedSize += file.size;
    uploadedFiles.push(file.name);
  }
  
  // Now call the fuse endpoint to combine
  // Note: For now, we use the direct FormData approach for fusion
  // since chunked upload doesn't support fusion yet
  throw new Error('Use direct upload for fusion');
};

// Fused upload - upload multiple files and fuse them
const fusedUpload = async (files, onUploadProgress) => {
  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  
  return axios.post(`${API_URL}/upload/fuse`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000, // 10 minutes for fusion
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    onUploadProgress: onUploadProgress,
  });
};

// Smart upload - uses fuse endpoint for multiple files, chunked for large single files
const smartUpload = async (files, onUploadProgress) => {
  // For multiple files, use the fuse endpoint
  if (files.length > 1) {
    // Check total size - if too large, show error
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
      // For very large combined files, use chunked uploads then combine
      // For now, we'll try direct upload and fall back to error
      console.log(`Fusing ${files.length} files, total size: ${(totalSize / 1024 / 1024).toFixed(1)}MB`);
    }
    
    try {
      return await fusedUpload(files, onUploadProgress);
    } catch (error) {
      // If fusion fails due to size, inform user
      if (error.response?.status === 413 || error.message?.includes('too large')) {
        throw new Error('Combined file size is too large. Please use smaller files or fewer files.');
      }
      throw error;
    }
  }
  
  // For single file, always use chunked upload to avoid proxy limits
  const file = files[0];
  const response = await chunkedUpload(file, (progress) => {
    if (onUploadProgress) {
      onUploadProgress({ loaded: progress.loaded, total: progress.total });
    }
  });
  return { data: response.data };
};

const api = {
  upload: (formData, onUploadProgress) => {
    // Check if formData contains files
    const files = formData.getAll('files');
    if (files && files.length > 0) {
      return smartUpload(files, onUploadProgress);
    }
    // Fallback to regular upload
    return regularUpload(formData, onUploadProgress);
  },

  detectBeats: (data) => axios.post(`${API_URL}/detect-beats`, data),

  computeMetrics: (data) => axios.post(`${API_URL}/compute-metrics`, {
    beat_times_sec: data.beat_times_sec,
    filter_lower_pct: data.filter_lower_pct || 50,
    filter_upper_pct: data.filter_upper_pct || 200,
  }),

  hrvAnalysis: (data) => axios.post(`${API_URL}/hrv-analysis`, {
    beat_times_min: data.beat_times_min,
    bf_filtered: data.bf_filtered,
    readout_minute: data.readout_minute,
    baseline_hrv_minute: data.baseline_hrv_minute ?? 0,
    baseline_bf_minute: data.baseline_bf_minute ?? 1,
  }),

  lightDetect: (data) => axios.post(`${API_URL}/light-detect`, data),

  lightDetectAll: (data) => axios.post(`${API_URL}/light-detect-all`, data),

  lightHrv: (data) => axios.post(`${API_URL}/light-hrv`, data),

  lightHrvDetrended: (data) => axios.post(`${API_URL}/light-hrv-detrended`, data),

  lightResponse: (data) => axios.post(`${API_URL}/light-response`, data),

  exportCsv: (data) =>
    axios.post(`${API_URL}/export/csv`, data, { responseType: 'blob' }),

  exportXlsx: (data) =>
    axios.post(`${API_URL}/export/xlsx`, data, { responseType: 'blob' }),

  exportPdf: (data) =>
    axios.post(`${API_URL}/export/pdf`, data, { responseType: 'blob' }),

  perMinuteMetrics: (data) => axios.post(`${API_URL}/per-minute-metrics`, data),

  // Storage API - Folders
  getFolders: () => axios.get(`${API_URL}/folders`),
  createFolder: (name) => axios.post(`${API_URL}/folders`, { name }),
  getFolder: (folderId) => axios.get(`${API_URL}/folders/${folderId}`),
  updateFolder: (folderId, data) => axios.put(`${API_URL}/folders/${folderId}`, data),
  deleteFolder: (folderId) => axios.delete(`${API_URL}/folders/${folderId}`),
  
  // Storage API - Sections
  getSections: () => axios.get(`${API_URL}/sections`),
  createSection: (name) => axios.post(`${API_URL}/sections`, { name }),
  updateSection: (sectionId, data) => axios.put(`${API_URL}/sections/${sectionId}`, data),
  deleteSection: (sectionId) => axios.delete(`${API_URL}/sections/${sectionId}`),
  reorderSections: (sectionIds) => axios.post(`${API_URL}/sections/reorder`, sectionIds),
  
  // Storage API - Recordings
  getRecordingsInFolder: (folderId) => axios.get(`${API_URL}/folders/${folderId}/recordings`),
  createRecording: (data) => axios.post(`${API_URL}/recordings`, data),
  getRecording: (recordingId) => axios.get(`${API_URL}/recordings/${recordingId}`),
  updateRecording: (recordingId, data) => axios.put(`${API_URL}/recordings/${recordingId}`, data),
  deleteRecording: (recordingId) => axios.delete(`${API_URL}/recordings/${recordingId}`),
  moveRecording: (recordingId, targetFolderId) => axios.post(`${API_URL}/recordings/${recordingId}/move`, { target_folder_id: targetFolderId }),
  
  // Batch update recordings with outdated metrics
  batchUpdateRecordings: () => axios.post(`${API_URL}/recordings/batch-update`),
  
  // Folder Comparison API
  getFolderComparison: (folderId) => axios.get(`${API_URL}/folders/${folderId}/comparison`),
  exportFolderComparisonXlsx: (folderId, data) => 
    axios.post(`${API_URL}/folders/${folderId}/export/xlsx`, data, { responseType: 'blob' }),
  exportFolderComparisonPdf: (folderId, data) => 
    axios.post(`${API_URL}/folders/${folderId}/export/pdf`, data, { responseType: 'blob' }),
};

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default api;
