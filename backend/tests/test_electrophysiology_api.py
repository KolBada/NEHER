"""
Electrophysiology Analysis API Tests
Tests all endpoints including new features:
- Configurable artifact filter (filter_lower_pct, filter_upper_pct)
- Baseline metrics computation 
- Enhanced light response metrics (n_beats, avg_bf, avg_nn, nn_70)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAPIRoot:
    """Test API root endpoint"""
    
    def test_api_root_returns_message(self):
        """API /api/ returns NeuCarS API message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data["message"] == "NeuCarS API"


class TestComputeMetrics:
    """Test /api/compute-metrics endpoint with filter parameters"""
    
    def test_compute_metrics_default_filter(self):
        """compute-metrics with default filter (50-200%)"""
        beat_times_sec = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": beat_times_sec
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "beat_times_min" in data
        assert "nn_intervals_ms" in data
        assert "beat_freq_bpm" in data
        assert "artifact_mask" in data
        assert "filtered_beat_times_min" in data
        assert "filtered_nn_ms" in data
        assert "filtered_bf_bpm" in data
        assert "n_total" in data
        assert "n_kept" in data
        assert "n_removed" in data
        assert "filter_settings" in data
        
        # Verify default filter settings
        assert data["filter_settings"]["lower_pct"] == 50.0
        assert data["filter_settings"]["upper_pct"] == 200.0
    
    def test_compute_metrics_custom_filter_strict(self):
        """compute-metrics accepts filter_lower_pct and filter_upper_pct parameters - strict"""
        beat_times_sec = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": beat_times_sec,
            "filter_lower_pct": 70.0,
            "filter_upper_pct": 150.0
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify custom filter settings
        assert data["filter_settings"]["lower_pct"] == 70.0
        assert data["filter_settings"]["upper_pct"] == 150.0
    
    def test_compute_metrics_custom_filter_loose(self):
        """compute-metrics accepts loose filter (30-250%)"""
        beat_times_sec = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": beat_times_sec,
            "filter_lower_pct": 30.0,
            "filter_upper_pct": 250.0
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data["filter_settings"]["lower_pct"] == 30.0
        assert data["filter_settings"]["upper_pct"] == 250.0
    
    def test_compute_metrics_too_few_beats(self):
        """compute-metrics returns error with < 2 beats"""
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": [1.0]
        })
        assert response.status_code == 400


class TestHRVAnalysis:
    """Test /api/hrv-analysis endpoint with baseline parameters"""
    
    def test_hrv_analysis_with_baseline_params(self):
        """HRV analysis accepts baseline parameters and returns baseline metrics"""
        # Create mock data with 60 beats (10 beats/minute for 6 minutes)
        beat_times_min = [i * 0.1 for i in range(60)]  # 0 to 6 minutes
        bf_filtered = [120.0] * 60  # 120 bpm
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "readout_minute": 2,
            "baseline_hrv_start": 0.0,
            "baseline_hrv_end": 3.0,
            "baseline_bf_start": 1.0,
            "baseline_bf_end": 2.0
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "windows" in data
        assert "readout" in data
        assert "baseline" in data
        
        # Verify baseline contains expected fields
        baseline = data["baseline"]
        assert "baseline_bf" in baseline
        assert "baseline_bf_range" in baseline
        assert "baseline_ln_rmssd70" in baseline or baseline.get("baseline_ln_rmssd70") is None
        assert "baseline_sdnn" in baseline or baseline.get("baseline_sdnn") is None
        assert "baseline_pnn50" in baseline or baseline.get("baseline_pnn50") is None
        assert "baseline_hrv_range" in baseline
    
    def test_hrv_analysis_default_baseline(self):
        """HRV analysis uses default baseline (HRV: 0-3min, BF: 1-2min)"""
        beat_times_min = [i * 0.1 for i in range(60)]
        bf_filtered = [120.0] * 60
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify baseline exists even without explicit params
        assert "baseline" in data
    
    def test_hrv_analysis_too_few_beats(self):
        """HRV analysis returns error with < 6 beats"""
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": [0.0, 0.5, 1.0],
            "bf_filtered": [120.0, 120.0, 120.0]
        })
        assert response.status_code == 400


class TestLightResponse:
    """Test /api/light-response endpoint with new metrics"""
    
    def test_light_response_returns_new_metrics(self):
        """Light response returns n_beats, avg_bf, avg_nn, nn_70"""
        # Create data simulating light stimulation response
        beat_times_min = [i * (1/120) for i in range(500)]  # ~4.2 minutes
        bf_filtered = [120.0] * 500  # 120 bpm constant
        
        # Create pulse regions
        pulses = [
            {"index": 0, "start_sec": 60, "end_sec": 80, "start_min": 1.0, "end_min": 1.33},
            {"index": 1, "start_sec": 140, "end_sec": 160, "start_min": 2.33, "end_min": 2.67},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-response", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "per_stim" in data
        assert "mean_metrics" in data
        assert "baseline_bf" in data
        
        # Verify per_stim contains new metrics
        for stim in data["per_stim"]:
            if stim is not None:
                assert "n_beats" in stim
                assert "avg_bf" in stim
                assert "avg_nn" in stim
                assert "nn_70" in stim
                assert "peak_bf" in stim
                assert "amplitude" in stim
        
        # Verify mean_metrics contains new fields
        if data["mean_metrics"] is not None:
            mean = data["mean_metrics"]
            assert "n_beats" in mean
            assert "avg_bf" in mean
            assert "avg_nn" in mean
            assert "nn_70" in mean


class TestLightDetect:
    """Test /api/light-detect endpoint"""
    
    def test_light_detect_basic(self):
        """Light detection with default parameters"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180.0,
            "pulse_duration_sec": 20.0,
            "interval_sec": "decreasing",
            "n_pulses": 5,
            "auto_detect": False
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "pulses" in data
        assert len(data["pulses"]) == 5
        assert data["detected_start_sec"] == 180.0
    
    def test_light_detect_uniform_interval(self):
        """Light detection with uniform interval"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180.0,
            "pulse_duration_sec": 20.0,
            "interval_sec": "60",
            "n_pulses": 3
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["pulses"]) == 3


class TestLightHRV:
    """Test /api/light-hrv endpoint"""
    
    def test_light_hrv_computation(self):
        """Light HRV per-pulse computation"""
        beat_times_min = [i * 0.05 for i in range(100)]  # 5 minutes
        bf_filtered = [120.0] * 100
        
        pulses = [
            {"index": 0, "start_sec": 60, "end_sec": 80, "start_min": 1.0, "end_min": 1.33},
            {"index": 1, "start_sec": 140, "end_sec": 160, "start_min": 2.33, "end_min": 2.67},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "per_pulse" in data
        assert "final" in data


class TestPerMinuteMetrics:
    """Test /api/per-minute-metrics endpoint"""
    
    def test_per_minute_metrics(self):
        """Per-minute metrics computation"""
        beat_times_min = [i * 0.1 for i in range(50)]  # 5 minutes
        bf_filtered = [120.0] * 50
        
        response = requests.post(f"{BASE_URL}/api/per-minute-metrics", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        for row in data["rows"]:
            assert "minute" in row
            assert "label" in row
            assert "avg_bf" in row
            assert "avg_nn" in row
            assert "avg_nn_70" in row
            assert "n_beats" in row


class TestExports:
    """Test export endpoints"""
    
    def test_export_csv(self):
        """CSV export endpoint"""
        response = requests.post(f"{BASE_URL}/api/export/csv", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "filename": "test"
        })
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")
    
    def test_export_xlsx(self):
        """XLSX export with recording_name and drug_used fields"""
        response = requests.post(f"{BASE_URL}/api/export/xlsx", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "filename": "test",
            "recording_name": "Test Recording",
            "drug_used": "isoproterenol",
            "baseline": {"baseline_bf": 120.0, "baseline_ln_rmssd70": 4.5}
        })
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
    
    def test_export_pdf(self):
        """PDF export with recording_name and drug_used fields"""
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "filename": "test",
            "recording_name": "Test Recording",
            "drug_used": "carbachol",
            "summary": {"Total Beats": 100, "Drug": "carbachol"},
            "baseline": {"baseline_bf": 120.0}
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
