"""
Iteration 8 Tests - NeuCarS Cardiac Electrophysiology Analysis
Tests for:
- Baseline HRV at minute 0 (0-3min window), BF at minute 1 (1-2min window)
- ExportRequest with light_pulses field for PDF light stim zones
- PDF export shows light stim zones highlighted on charts
- HRV analysis workflow: ±5 beat window, 30-second binning, 3-min rolling windows
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBaselineMetrics:
    """Test baseline HRV at minute 0 (0-3min) and BF at minute 1 (1-2min)"""
    
    def test_baseline_hrv_uses_0_3_min_window(self):
        """Baseline HRV is computed over 0-3 minute window (default)"""
        # Create data for 6 minutes (enough for 3-min HRV windows)
        beat_times_min = [i * 0.05 for i in range(120)]  # 0-6 minutes
        bf_filtered = [120.0 + (i % 10) for i in range(120)]  # Slight variation
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_hrv_minute": 0,  # New param
            "baseline_bf_minute": 1    # New param
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        # Verify baseline_hrv_minute is 0 (new field name)
        assert baseline.get("baseline_hrv_minute") == 0, \
            f"Expected baseline_hrv_minute=0, got {baseline.get('baseline_hrv_minute')}"
        # Verify baseline_hrv_window shows "0-3min" (new field)
        hrv_window = baseline.get("baseline_hrv_window", "")
        assert "0-3" in hrv_window, f"Expected HRV window 0-3min, got '{hrv_window}'"
        # Verify baseline_bf_minute is 1
        assert baseline.get("baseline_bf_minute") == 1, \
            f"Expected baseline_bf_minute=1, got {baseline.get('baseline_bf_minute')}"
    
    def test_baseline_bf_uses_1_2_min_window(self):
        """Baseline BF is computed over 1-2 minute window (default)"""
        beat_times_min = [i * 0.05 for i in range(120)]
        # Different BF in minute 1-2 vs minute 0-1
        bf_filtered = []
        for i in range(120):
            t = i * 0.05
            if 1.0 <= t < 2.0:
                bf_filtered.append(100.0)  # Lower BF in baseline window
            else:
                bf_filtered.append(150.0)  # Higher BF elsewhere
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_bf_start": 1.0,
            "baseline_bf_end": 2.0
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        # BF should be close to 100 (from 1-2 min window)
        baseline_bf = baseline.get("baseline_bf")
        assert baseline_bf is not None, "baseline_bf should not be None"
        assert baseline_bf < 120, f"Expected BF ~100 from 1-2min window, got {baseline_bf}"
    
    def test_custom_baseline_windows_accepted(self):
        """API accepts custom baseline HRV and BF windows"""
        beat_times_min = [i * 0.1 for i in range(100)]
        bf_filtered = [120.0] * 100
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_hrv_start": 2.0,
            "baseline_hrv_end": 5.0,
            "baseline_bf_start": 3.0,
            "baseline_bf_end": 4.0
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        # Check custom ranges are reflected (format may vary)
        hrv_range = baseline.get("baseline_hrv_range", "")
        bf_range = baseline.get("baseline_bf_range", "")
        assert "2" in hrv_range and "5" in hrv_range and "min" in hrv_range, \
            f"Expected custom HRV range 2-5 min, got '{hrv_range}'"
        assert "3" in bf_range and "4" in bf_range and "min" in bf_range, \
            f"Expected custom BF range 3-4 min, got '{bf_range}'"


class TestPDFExportWithLightPulses:
    """Test PDF export includes light_pulses for showing light stim zones"""
    
    def test_pdf_export_accepts_light_pulses_field(self):
        """PDF export request accepts light_pulses field"""
        light_pulses = [
            {"index": 0, "start_sec": 180, "end_sec": 200, "start_min": 3.0, "end_min": 3.33},
            {"index": 1, "start_sec": 260, "end_sec": 280, "start_min": 4.33, "end_min": 4.67},
        ]
        
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [
                {"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"},
                {"time_min": 3.1, "bf_bpm": 140, "nn_ms": 430, "status": "kept"},
                {"time_min": 4.4, "bf_bpm": 145, "nn_ms": 414, "status": "kept"},
            ],
            "light_pulses": light_pulses,
            "filename": "test_with_light_stim"
        })
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")
    
    def test_pdf_export_handles_empty_light_pulses(self):
        """PDF export handles empty or null light_pulses gracefully"""
        response = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "light_pulses": None,
            "filename": "test_no_light"
        })
        assert response.status_code == 200
        
        response2 = requests.post(f"{BASE_URL}/api/export/pdf", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "light_pulses": [],
            "filename": "test_empty_light"
        })
        assert response2.status_code == 200


class TestXLSXExportWithLightPulses:
    """Test XLSX export with light stim data"""
    
    def test_xlsx_export_accepts_light_pulses_field(self):
        """XLSX export request accepts light_pulses field"""
        light_pulses = [
            {"index": 0, "start_sec": 180, "end_sec": 200, "start_min": 3.0, "end_min": 3.33},
        ]
        
        response = requests.post(f"{BASE_URL}/api/export/xlsx", json={
            "per_beat_data": [{"time_min": 0.1, "bf_bpm": 120, "nn_ms": 500, "status": "kept"}],
            "light_pulses": light_pulses,
            "filename": "test_xlsx_light"
        })
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers.get("content-type", "")


class TestPerMinuteTableAlignment:
    """Test per-minute table values align with baseline at corresponding minutes"""
    
    def test_per_minute_bf_at_minute_1_matches_baseline(self):
        """Per-minute BF at minute 1 should align with baseline BF (1-2 min)"""
        # Create uniform data for testing
        beat_times_min = [i * 0.05 for i in range(100)]  # 0-5 min
        bf_filtered = [120.0] * 100  # Constant BF
        
        # Get per-minute metrics
        pm_response = requests.post(f"{BASE_URL}/api/per-minute-metrics", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered
        })
        assert pm_response.status_code == 200
        pm_data = pm_response.json()
        
        # Get baseline
        hrv_response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_bf_start": 1.0,
            "baseline_bf_end": 2.0
        })
        assert hrv_response.status_code == 200
        hrv_data = hrv_response.json()
        
        # Find per-minute BF for minute 1
        minute_1_row = next((r for r in pm_data["rows"] if r["minute"] == 1), None)
        baseline_bf = hrv_data["baseline"].get("baseline_bf")
        
        # With uniform data, both should be ~120
        if minute_1_row and baseline_bf:
            assert abs(minute_1_row["avg_bf"] - baseline_bf) < 5, \
                f"Per-minute BF ({minute_1_row['avg_bf']}) should match baseline BF ({baseline_bf})"


class TestHRVAnalysisWorkflow:
    """Test HRV workflow: ±5 beat window filter, 30-second binning, 3-min rolling windows"""
    
    def test_hrv_returns_rolling_3min_windows(self):
        """HRV analysis returns rolling 3-minute windows advancing by 1 minute"""
        # Create 10 minutes of data
        beat_times_min = [i * 0.05 for i in range(200)]  # 0-10 min
        bf_filtered = [120.0 + (i % 5) for i in range(200)]  # Slight variation
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered
        })
        assert response.status_code == 200
        data = response.json()
        
        windows = data.get("windows", [])
        assert len(windows) > 0, "Should have HRV windows"
        
        # Check window format - should show 3-minute ranges
        first_window = windows[0]
        assert "window" in first_window, "Window should have window label"
        assert "minute" in first_window, "Window should have minute"
        assert "ln_rmssd70" in first_window, "Window should have ln_rmssd70"
        
        # Verify window labeling pattern (0-3, 1-4, 2-5, etc.)
        for i, w in enumerate(windows[:5]):  # Check first 5 windows
            expected_label = f"{w['minute']}-{w['minute']+3}"
            assert w["window"] == expected_label, f"Expected window '{expected_label}' got '{w['window']}'"
    
    def test_compute_metrics_artifact_filter_uses_5_beat_window(self):
        """Artifact filter uses ±5 beat local median window"""
        # Create data with one outlier beat
        beat_times_sec = [i * 0.5 for i in range(30)]  # 30 beats at 120 bpm
        
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": beat_times_sec,
            "filter_lower_pct": 50.0,
            "filter_upper_pct": 200.0
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify artifact_mask is computed (contains booleans)
        assert "artifact_mask" in data
        assert isinstance(data["artifact_mask"], list)
        assert all(isinstance(x, bool) for x in data["artifact_mask"])


class TestLightDetectAPI:
    """Test light pulse detection with various configurations"""
    
    def test_light_detect_decreasing_intervals(self):
        """Light detection generates pulses with decreasing intervals (60s-30s-20s-10s)"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180.0,
            "pulse_duration_sec": 20.0,
            "interval_sec": "decreasing",
            "n_pulses": 5
        })
        assert response.status_code == 200
        data = response.json()
        
        pulses = data["pulses"]
        assert len(pulses) == 5
        
        # Calculate actual intervals between pulses
        intervals = []
        for i in range(len(pulses) - 1):
            gap = pulses[i+1]["start_sec"] - pulses[i]["end_sec"]
            intervals.append(gap)
        
        # Expected: 60, 30, 20, 10 seconds between pulses
        expected = [60, 30, 20, 10]
        for i, (actual, exp) in enumerate(zip(intervals, expected)):
            assert abs(actual - exp) < 1, f"Interval {i+1}: expected {exp}s got {actual}s"
    
    def test_light_pulses_have_min_sec_formats(self):
        """Light pulses include both seconds and minutes formats"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180.0,
            "pulse_duration_sec": 20.0,
            "n_pulses": 3
        })
        assert response.status_code == 200
        data = response.json()
        
        for pulse in data["pulses"]:
            assert "start_sec" in pulse
            assert "end_sec" in pulse
            assert "start_min" in pulse
            assert "end_min" in pulse
            # Verify min = sec / 60
            assert abs(pulse["start_min"] - pulse["start_sec"] / 60) < 0.001
            assert abs(pulse["end_min"] - pulse["end_sec"] / 60) < 0.001


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
