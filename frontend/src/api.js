import axios from 'axios';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = {
  upload: (formData) =>
    axios.post(`${API_URL}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
    }),

  detectBeats: (data) => axios.post(`${API_URL}/detect-beats`, data),

  computeMetrics: (data) => axios.post(`${API_URL}/compute-metrics`, data),

  hrvAnalysis: (data) => axios.post(`${API_URL}/hrv-analysis`, data),

  lightDetect: (data) => axios.post(`${API_URL}/light-detect`, data),

  lightHrv: (data) => axios.post(`${API_URL}/light-hrv`, data),

  lightResponse: (data) => axios.post(`${API_URL}/light-response`, data),

  exportCsv: (data) =>
    axios.post(`${API_URL}/export/csv`, data, { responseType: 'blob' }),

  exportXlsx: (data) =>
    axios.post(`${API_URL}/export/xlsx`, data, { responseType: 'blob' }),

  exportPdf: (data) =>
    axios.post(`${API_URL}/export/pdf`, data, { responseType: 'blob' }),

  perMinuteMetrics: (data) => axios.post(`${API_URL}/per-minute-metrics`, data),
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
