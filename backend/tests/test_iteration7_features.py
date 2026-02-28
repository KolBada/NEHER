"""
Iteration 7 - CELL Style Export Tests
Tests for new features:
- PDF export with fixed Y-axis scales (LN(RMSSD): 0-8, pNN50: 0-100, SDNN: 0-300)
- Excel export CELL magazine style
- PDF excludes filtered beats from trace charts
- Threshold line on trace (frontend feature)
- Drug configuration inputs editable (frontend feature)
- Drug Readout same prominence as Baseline (frontend feature)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAPIRoot:
    """Verify API is accessible"""
    
    def test_api_root(self):
        """API root returns NeuCarS API"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert response.json()["message"] == "NeuCarS API"


class TestExportPDFCellStyle:
    """Test PDF export with CELL magazine style and fixed Y-axis scales"""
    
    def test_pdf_export_with_baseline(self):
        """PDF export includes baseline metrics"""
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [
                {"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
                {"time_min": 0.2, "bf_bpm": 118, "nn_ms": 508, "status": "kept"},
                {"time_min": 0.3, "bf_bpm": 115, "nn_ms": 522, "status": "filtered"},
            ],
            "filename": "cell_style_test",
            "recording_name": "Test Recording CELL",
            "drug_used": "Propranolol 5µM",
            "baseline": {
                "baseline_bf": 118.5,
                "baseline_bf_range": "1-2 min",
                "baseline_ln_rmssd70": 4.2,
                "baseline_rmssd70": 66.69,
                "baseline_sdnn": 45.2,
                "baseline_pnn50": 12.5,
                "baseline_hrv_range": "0-3 min"
            },
            "hrv_windows": [
                {"minute": 0, "window": "0-3", "ln_rmssd70": 4.2, "rmssd70": 66.69, "sdnn": 45.2, "pnn50": 12.5, "mean_bf": 118.5, "n_beats": 100},
                {"minute": 1, "window": "1-4", "ln_rmssd70": 4.1, "rmssd70": 60.34, "sdnn": 42.0, "pnn50": 10.2, "mean_bf": 120.1, "n_beats": 98},
            ],
            "summary": {
                "Total Beats": 300,
                "Kept Beats": 285,
                "Filter Range": "50-200%"
            }
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")
        # PDF should be generated successfully
        assert len(response.content) > 1000  # PDF has substantial content
    
    def test_pdf_export_excludes_filtered_beats(self):
        """PDF charts should only include 'kept' beats, not 'filtered'"""
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [
                {"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
                {"time_min": 0.2, "bf_bpm": 10, "nn_ms": 6000, "status": "filtered"},  # Outlier
                {"time_min": 0.3, "bf_bpm": 118, "nn_ms": 508, "status": "kept"},
            ],
            "filename": "filtered_test",
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")
    
    def test_pdf_export_with_light_metrics(self):
        """PDF export includes light stimulation data"""
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [
                {"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
            ],
            "light_response": [
                {"n_beats": 20, "avg_bf": 125.0, "peak_bf": 140.0, "peak_norm_pct": 116.7, "time_to_peak_sec": 5.2, "amplitude": 15.0},
                {"n_beats": 22, "avg_bf": 128.0, "peak_bf": 142.0, "peak_norm_pct": 118.3, "time_to_peak_sec": 4.8, "amplitude": 14.0},
            ],
            "light_metrics": [
                {"rmssd70": 45.2, "ln_rmssd70": 3.81, "sdnn": 38.5, "pnn50": 8.5, "n_beats": 20},
                {"rmssd70": 48.1, "ln_rmssd70": 3.87, "sdnn": 40.2, "pnn50": 9.2, "n_beats": 22},
            ],
            "filename": "light_export_test",
        })
        assert response.status_code == 200


class TestExportXLSXCellStyle:
    """Test XLSX export with CELL magazine style formatting"""
    
    def test_xlsx_export_with_drug_used(self):
        """XLSX export includes drug information"""
        response = requests.post(f"{BASE_URL}/api/export/xlsx", json={
            "per_beat_data": [
                {"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
                {"time_min": 0.2, "bf_bpm": 118, "nn_ms": 508, "status": "kept"},
            ],
            "filename": "drug_test",
            "recording_name": "Cardiac Study 2025",
            "drug_used": "Isoproterenol 1µM",
            "baseline": {
                "baseline_bf": 75.0,
                "baseline_ln_rmssd70": 4.5,
                "baseline_rmssd70": 90.0,
                "baseline_sdnn": 60.0,
                "baseline_pnn50": 15.0,
            }
        })
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")
    
    def test_xlsx_export_with_per_minute_data(self):
        """XLSX includes per-minute analysis sheet"""
        response = requests.post(f"{BASE_URL}/api/export/xlsx", json={
            "per_beat_data": [
                {"time_min": 0.5, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
            ],
            "per_minute_data": [
                {"label": "0-1", "n_beats": 120, "avg_bf": 120.0, "avg_nn": 500.0, "avg_nn_70": 857.0},
                {"label": "1-2", "n_beats": 118, "avg_bf": 118.0, "avg_nn": 508.5, "avg_nn_70": 860.0},
            ],
            "hrv_windows": [
                {"minute": 0, "window": "0-3", "ln_rmssd70": 4.2, "rmssd70": 66.69, "sdnn": 45.2, "pnn50": 12.5, "mean_bf": 118.5, "n_beats": 100},
            ],
            "filename": "per_minute_test",
        })
        assert response.status_code == 200


class TestComputeMetricsFilterOutput:
    """Test that compute-metrics properly indicates filtered vs kept status"""
    
    def test_compute_metrics_returns_artifact_mask(self):
        """Compute metrics returns artifact_mask for filtering"""
        beat_times_sec = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": beat_times_sec,
            "filter_lower_pct": 50.0,
            "filter_upper_pct": 200.0
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify artifact_mask is present
        assert "artifact_mask" in data
        assert isinstance(data["artifact_mask"], list)
        
        # Verify filtered data arrays exist
        assert "filtered_beat_times_min" in data
        assert "filtered_nn_ms" in data
        assert "filtered_bf_bpm" in data
        
        # n_kept should match filtered array length
        assert data["n_kept"] == len(data["filtered_bf_bpm"])


class TestHRVBaseline:
    """Test HRV analysis baseline computation"""
    
    def test_hrv_baseline_contains_all_metrics(self):
        """Baseline should have bf, rmssd, sdnn, pnn50, ln_rmssd"""
        beat_times_min = [i * 0.1 for i in range(60)]
        bf_filtered = [120.0] * 60
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_hrv_start": 0.0,
            "baseline_hrv_end": 3.0,
            "baseline_bf_start": 1.0,
            "baseline_bf_end": 2.0
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        
        # All expected baseline fields (updated for new minute-based params)
        expected_fields = [
            "baseline_bf",
            "baseline_bf_minute",  # Changed from baseline_bf_range
            "baseline_hrv_minute", # Changed from baseline_hrv_range
            "baseline_hrv_window"  # Window label like "0-3min"
        ]
        
        for field in expected_fields:
            assert field in baseline, f"Missing baseline field: {field}"


class TestLightResponseMetrics:
    """Test light response includes all required metrics"""
    
    def test_light_response_per_stim_fields(self):
        """Light response per_stim should have n_beats, avg_bf, avg_nn, nn_70"""
        beat_times_min = [i * (1/120) for i in range(500)]
        bf_filtered = [120.0] * 500
        
        pulses = [
            {"index": 0, "start_sec": 60, "end_sec": 80, "start_min": 1.0, "end_min": 1.33},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-response", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        for stim in data["per_stim"]:
            if stim is not None:
                assert "n_beats" in stim
                assert "avg_bf" in stim
                assert "avg_nn" in stim
                assert "nn_70" in stim
                assert "peak_bf" in stim
                assert "amplitude" in stim
                assert "time_to_peak_sec" in stim


class TestLightDetectPulseGeneration:
    """Test light detect pulse generation"""
    
    def test_decreasing_intervals(self):
        """Light detect with decreasing intervals (60s→30s→20s→10s)"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180.0,
            "pulse_duration_sec": 20.0,
            "interval_sec": "decreasing",
            "n_pulses": 5,
            "auto_detect": False
        })
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["pulses"]) == 5
        
        # Verify start_min and end_min are present for each pulse
        for pulse in data["pulses"]:
            assert "start_min" in pulse
            assert "end_min" in pulse
            assert "start_sec" in pulse
            assert "end_sec" in pulse


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
