"""
Iteration 9 Tests - NeuCarS Cardiac Electrophysiology Analysis
Tests for:
- Backend /api/hrv-analysis uses baseline_hrv_minute (default 0) and baseline_bf_minute (default 1)
- Backend compute_light_hrv isolates NN_70 per stimulus and calculates HRV from isolated data
- Backend compute_light_hrv returns median across stimulations for final HRV metrics
- Light HRV returns n_pulses_valid in final metrics
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBaselineMinuteParams:
    """Test baseline settings - HRV readout at baseline_hrv_minute, BF readout at baseline_bf_minute"""
    
    def test_hrv_analysis_default_hrv_minute_0(self):
        """HRV analysis uses baseline_hrv_minute=0 by default (0-3min window)"""
        beat_times_min = [i * 0.05 for i in range(120)]  # 0-6 minutes
        bf_filtered = [120.0 + (i % 10) for i in range(120)]
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            # Not passing baseline_hrv_minute - should use default 0
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        # Check that baseline_hrv_minute is 0 (default)
        assert baseline.get("baseline_hrv_minute") == 0, \
            f"Expected baseline_hrv_minute=0, got {baseline.get('baseline_hrv_minute')}"
        # Verify window label shows 0-3min
        hrv_window = baseline.get("baseline_hrv_window", "")
        assert "0" in hrv_window and "3" in hrv_window, \
            f"Expected HRV window 0-3min, got '{hrv_window}'"
    
    def test_hrv_analysis_default_bf_minute_1(self):
        """HRV analysis uses baseline_bf_minute=1 by default (1-2min)"""
        beat_times_min = [i * 0.05 for i in range(120)]  # 0-6 minutes
        bf_filtered = []
        for i in range(120):
            t = i * 0.05
            if 1.0 <= t < 2.0:
                bf_filtered.append(100.0)  # Lower BF in minute 1-2
            else:
                bf_filtered.append(150.0)  # Higher BF elsewhere
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            # Not passing baseline_bf_minute - should use default 1
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        # Check that baseline_bf_minute is 1 (default)
        assert baseline.get("baseline_bf_minute") == 1, \
            f"Expected baseline_bf_minute=1, got {baseline.get('baseline_bf_minute')}"
        # BF should be ~100 (from minute 1-2)
        baseline_bf = baseline.get("baseline_bf")
        assert baseline_bf is not None and baseline_bf < 120, \
            f"Expected BF ~100 from minute 1, got {baseline_bf}"
    
    def test_hrv_analysis_accepts_custom_minute_params(self):
        """HRV analysis accepts custom baseline_hrv_minute and baseline_bf_minute"""
        beat_times_min = [i * 0.05 for i in range(200)]  # 0-10 minutes
        bf_filtered = [120.0] * 200
        
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_hrv_minute": 2,  # Custom HRV minute
            "baseline_bf_minute": 3    # Custom BF minute
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        assert baseline.get("baseline_hrv_minute") == 2, \
            f"Expected baseline_hrv_minute=2, got {baseline.get('baseline_hrv_minute')}"
        assert baseline.get("baseline_bf_minute") == 3, \
            f"Expected baseline_bf_minute=3, got {baseline.get('baseline_bf_minute')}"
        # Verify window label for HRV (2-5min)
        hrv_window = baseline.get("baseline_hrv_window", "")
        assert "2" in hrv_window and "5" in hrv_window, \
            f"Expected HRV window 2-5min, got '{hrv_window}'"


class TestLightHRVIsolatedNN70:
    """Test light HRV calculates NN_70 from isolated stimulus data"""
    
    def test_light_hrv_returns_per_pulse_metrics(self):
        """Light HRV returns per_pulse metrics with isolated NN_70 calculation"""
        beat_times_min = [i * 0.05 for i in range(200)]  # 0-10 min
        bf_filtered = [120.0 + (i % 10) for i in range(200)]  # Slight variation
        
        # Create pulses at 3-3.5min, 4-4.5min
        pulses = [
            {"index": 0, "start_min": 3.0, "end_min": 3.5, "start_sec": 180, "end_sec": 210},
            {"index": 1, "start_min": 4.0, "end_min": 4.5, "start_sec": 240, "end_sec": 270},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check per_pulse structure
        per_pulse = data.get("per_pulse", [])
        assert len(per_pulse) == 2, f"Expected 2 pulses, got {len(per_pulse)}"
        
        # Each pulse should have HRV metrics calculated from isolated data
        for i, pulse_metrics in enumerate(per_pulse):
            if pulse_metrics is not None:
                assert "rmssd70" in pulse_metrics, f"Pulse {i} missing rmssd70"
                assert "sdnn" in pulse_metrics, f"Pulse {i} missing sdnn"
                assert "pnn50" in pulse_metrics, f"Pulse {i} missing pnn50"
                assert "n_beats" in pulse_metrics, f"Pulse {i} missing n_beats"
                # Check for median_nn_isolated (new field showing isolated median)
                assert "median_nn_isolated" in pulse_metrics, \
                    f"Pulse {i} missing median_nn_isolated - should show isolated median NN"
    
    def test_light_hrv_returns_median_final_metrics(self):
        """Light HRV final metrics are median across valid pulses"""
        beat_times_min = [i * 0.02 for i in range(500)]  # 0-10 min with more beats
        bf_filtered = [120.0 + (i % 20) for i in range(500)]  # More variation
        
        pulses = [
            {"index": 0, "start_min": 2.0, "end_min": 2.5, "start_sec": 120, "end_sec": 150},
            {"index": 1, "start_min": 3.0, "end_min": 3.5, "start_sec": 180, "end_sec": 210},
            {"index": 2, "start_min": 4.0, "end_min": 4.5, "start_sec": 240, "end_sec": 270},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        final = data.get("final")
        if final is not None:
            # Check final structure has HRV metrics
            assert "rmssd70" in final, "Final missing rmssd70"
            assert "sdnn" in final, "Final missing sdnn"
            assert "pnn50" in final, "Final missing pnn50"
            # Check n_pulses_valid is present (new field)
            assert "n_pulses_valid" in final, "Final missing n_pulses_valid"
            assert final["n_pulses_valid"] >= 1, "Should have at least 1 valid pulse"
    
    def test_light_hrv_returns_n_pulses_valid(self):
        """Light HRV final includes n_pulses_valid count"""
        beat_times_min = [i * 0.02 for i in range(500)]
        bf_filtered = [120.0] * 500
        
        # 4 pulses
        pulses = [
            {"index": 0, "start_min": 1.0, "end_min": 1.5, "start_sec": 60, "end_sec": 90},
            {"index": 1, "start_min": 2.0, "end_min": 2.5, "start_sec": 120, "end_sec": 150},
            {"index": 2, "start_min": 3.0, "end_min": 3.5, "start_sec": 180, "end_sec": 210},
            {"index": 3, "start_min": 4.0, "end_min": 4.5, "start_sec": 240, "end_sec": 270},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        final = data.get("final")
        if final is not None:
            n_valid = final.get("n_pulses_valid")
            assert n_valid is not None, "n_pulses_valid should be present in final"
            assert isinstance(n_valid, int), "n_pulses_valid should be an integer"
            assert n_valid <= len(pulses), f"n_pulses_valid ({n_valid}) should not exceed total pulses ({len(pulses)})"


class TestLightHRVAlgorithm:
    """Test the light HRV algorithm: isolate NN -> compute median -> scale to 857ms"""
    
    def test_light_hrv_isolated_median_nn_calculation(self):
        """Each pulse calculates median from isolated NN values, scales to 857ms"""
        # Create data with different BF in different regions
        beat_times_min = []
        bf_filtered = []
        
        # Build data: minute 0-2: 60bpm, minute 2-3: 100bpm, minute 3-4: 80bpm
        for i in range(200):
            t = i * 0.05
            beat_times_min.append(t)
            if t < 2.0:
                bf_filtered.append(60.0)  # 1000ms NN
            elif t < 3.0:
                bf_filtered.append(100.0)  # 600ms NN
            else:
                bf_filtered.append(80.0)  # 750ms NN
        
        pulses = [
            {"index": 0, "start_min": 2.0, "end_min": 3.0, "start_sec": 120, "end_sec": 180},
        ]
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        assert response.status_code == 200
        data = response.json()
        
        per_pulse = data.get("per_pulse", [])
        if per_pulse and per_pulse[0] is not None:
            pulse0 = per_pulse[0]
            # Median NN in minute 2-3 should be around 600ms (from 100bpm)
            median_nn = pulse0.get("median_nn_isolated")
            assert median_nn is not None, "median_nn_isolated should be present"
            # ~600ms expected
            assert 500 < median_nn < 700, f"Expected median_nn ~600ms, got {median_nn}"


class TestBackendAPIHealth:
    """Basic API health checks"""
    
    def test_api_root_returns_message(self):
        """API root returns NeuCarS API message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "NeuCarS API"
    
    def test_hrv_analysis_requires_minimum_beats(self):
        """HRV analysis requires at least 6 beats"""
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": [0.1, 0.2, 0.3],  # Only 3 beats
            "bf_filtered": [120.0, 120.0, 120.0]
        })
        # Should return 400 (bad request) for insufficient beats
        assert response.status_code == 400
    
    def test_compute_metrics_requires_minimum_beats(self):
        """compute-metrics requires at least 2 beats"""
        response = requests.post(f"{BASE_URL}/api/compute-metrics", json={
            "beat_times_sec": [0.5]  # Only 1 beat
        })
        assert response.status_code == 400


class TestDrugReadoutTimeCalculation:
    """Drug readout time calculation: base + perfusion start + perfusion time"""
    
    def test_hrv_analysis_works_with_later_readout_minute(self):
        """HRV analysis works with later readout minute (simulating drug effect)"""
        # Create 20 minutes of data
        beat_times_min = [i * 0.02 for i in range(1000)]  # 0-20 min
        bf_filtered = [120.0 + (i % 10) for i in range(1000)]
        
        # Use readout minute at 18 (simulating 12 + 3 + 3 for drug)
        response = requests.post(f"{BASE_URL}/api/hrv-analysis", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "baseline_hrv_minute": 15,  # Later minute
            "baseline_bf_minute": 17    # Later minute
        })
        assert response.status_code == 200
        data = response.json()
        
        baseline = data.get("baseline", {})
        assert baseline.get("baseline_hrv_minute") == 15
        assert baseline.get("baseline_bf_minute") == 17


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
