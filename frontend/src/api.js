import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Create axios instance with retry logic for uploads
const uploadWithRetry = async (formData, onUploadProgress, maxRetries = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 minutes for large files
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        onUploadProgress: onUploadProgress,
      });
      return response;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      // Retry on 520, 502, 503, 504 errors (server/proxy issues)
      if ([520, 502, 503, 504].includes(status) && attempt < maxRetries) {
        console.log(`Upload attempt ${attempt} failed with ${status}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

const api = {
  upload: (formData, onUploadProgress) => uploadWithRetry(formData, onUploadProgress),

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
    baseline_hrv_start: data.baseline_hrv_start ?? 0,
    baseline_hrv_end: data.baseline_hrv_end ?? 3,
    baseline_bf_start: data.baseline_bf_start ?? 1,
    baseline_bf_end: data.baseline_bf_end ?? 2,
  }),

  lightDetect: (data) => axios.post(`${API_URL}/light-detect`, data),

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
  updateFolder: (folderId, name) => axios.put(`${API_URL}/folders/${folderId}`, { name }),
  deleteFolder: (folderId) => axios.delete(`${API_URL}/folders/${folderId}`),
  
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
