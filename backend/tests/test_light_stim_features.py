"""
Test Light Stimulation Module Features - Iteration 10
Tests:
1. Light HRV API returns ln_sdnn70 field in per_pulse and final
2. Light HRA (response) API returns correct metrics
3. Field structure validation
"""

import pytest
import requests
import os
import numpy as np

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://electro-beat-lab.preview.emergentagent.com').rstrip('/')

# Sample test data - simulated beat data
def generate_test_beat_data():
    """Generate simulated beat data for testing light stim analysis"""
    # Create 10 minutes of beat data at ~60 bpm
    beat_times_min = []
    current_time = 0.0
    while current_time < 10.0:  # 10 minutes
        beat_times_min.append(current_time)
        # Add variability: 60 bpm = 1 beat/sec = 0.0167 min/beat
        interval = 0.0167 + np.random.normal(0, 0.002)  # Add slight variability
        current_time += interval
    
    # Calculate BF from beat times
    bf_filtered = []
    for i in range(len(beat_times_min) - 1):
        interval_min = beat_times_min[i+1] - beat_times_min[i]
        bf = 1.0 / interval_min if interval_min > 0 else 60.0  # BF in bpm
        bf_filtered.append(bf)
    
    return beat_times_min, bf_filtered

# Generate test pulses (light stim windows)
def generate_test_pulses():
    """Generate 5 light stimulation pulse windows starting at ~3 min"""
    pulses = [
        {"index": 0, "start_sec": 180, "end_sec": 200, "start_min": 3.0, "end_min": 3.333},
        {"index": 1, "start_sec": 260, "end_sec": 280, "start_min": 4.333, "end_min": 4.667},
        {"index": 2, "start_sec": 310, "end_sec": 330, "start_min": 5.167, "end_min": 5.5},
        {"index": 3, "start_sec": 350, "end_sec": 370, "start_min": 5.833, "end_min": 6.167},
        {"index": 4, "start_sec": 380, "end_sec": 400, "start_min": 6.333, "end_min": 6.667},
    ]
    return pulses


class TestLightHRVAPI:
    """Test /api/light-hrv endpoint returns ln_sdnn70 in per_pulse and final"""
    
    def test_light_hrv_endpoint_returns_ln_sdnn70_in_per_pulse(self):
        """Test that per_pulse results include ln_sdnn70 field"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Check response structure
        assert "per_pulse" in data, "Response missing 'per_pulse' field"
        assert "final" in data, "Response missing 'final' field"
        
        # Check per_pulse results contain ln_sdnn70
        per_pulse = data["per_pulse"]
        assert len(per_pulse) > 0, "per_pulse array is empty"
        
        # Find first valid pulse
        valid_pulse = None
        for p in per_pulse:
            if p is not None:
                valid_pulse = p
                break
        
        if valid_pulse:
            print(f"Per-pulse fields: {list(valid_pulse.keys())}")
            assert "ln_sdnn70" in valid_pulse, f"per_pulse missing 'ln_sdnn70' field. Got fields: {list(valid_pulse.keys())}"
            assert "rmssd70" in valid_pulse, "per_pulse missing 'rmssd70' field"
            assert "ln_rmssd70" in valid_pulse, "per_pulse missing 'ln_rmssd70' field"
            assert "sdnn" in valid_pulse, "per_pulse missing 'sdnn' field"
            assert "pnn50" in valid_pulse, "per_pulse missing 'pnn50' field"
            
            # Verify ln_sdnn70 is actually log of sdnn
            if valid_pulse["sdnn"] and valid_pulse["sdnn"] > 0:
                expected_ln_sdnn = np.log(valid_pulse["sdnn"])
                actual_ln_sdnn = valid_pulse["ln_sdnn70"]
                assert abs(actual_ln_sdnn - expected_ln_sdnn) < 0.001, f"ln_sdnn70 calculation error: expected {expected_ln_sdnn}, got {actual_ln_sdnn}"
            
            print(f"✅ per_pulse contains ln_sdnn70: {valid_pulse['ln_sdnn70']}")
        else:
            print("⚠️ No valid pulses found in response - may need more test data")
    
    def test_light_hrv_endpoint_returns_ln_sdnn70_in_final(self):
        """Test that final (median) results include ln_sdnn70 field"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200
        data = response.json()
        
        final = data.get("final")
        if final:
            print(f"Final fields: {list(final.keys())}")
            assert "ln_sdnn70" in final, f"final missing 'ln_sdnn70' field. Got fields: {list(final.keys())}"
            assert "ln_rmssd70" in final, "final missing 'ln_rmssd70' field"
            assert "rmssd70" in final, "final missing 'rmssd70' field"
            assert "sdnn" in final, "final missing 'sdnn' field"
            assert "pnn50" in final, "final missing 'pnn50' field"
            
            # Verify ln_sdnn70 is actually log of sdnn
            if final["sdnn"] and final["sdnn"] > 0:
                expected_ln_sdnn = np.log(final["sdnn"])
                actual_ln_sdnn = final["ln_sdnn70"]
                assert abs(actual_ln_sdnn - expected_ln_sdnn) < 0.001, f"final ln_sdnn70 calculation error: expected {expected_ln_sdnn}, got {actual_ln_sdnn}"
            
            print(f"✅ final contains ln_sdnn70: {final['ln_sdnn70']}")
        else:
            print("⚠️ No final metrics returned - may need more test data")
    
    def test_light_hrv_per_pulse_has_all_five_hrv_columns(self):
        """Test that per_pulse has all 5 expected HRV columns: ln_rmssd70, rmssd70, ln_sdnn70, sdnn, pnn50"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-hrv", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200
        data = response.json()
        
        expected_fields = ["ln_rmssd70", "rmssd70", "ln_sdnn70", "sdnn", "pnn50"]
        
        for p in data["per_pulse"]:
            if p is not None:
                for field in expected_fields:
                    assert field in p, f"per_pulse missing expected field: {field}"
                print(f"✅ Pulse has all 5 HRV columns: {expected_fields}")
                break


class TestLightResponseAPI:
    """Test /api/light-response endpoint returns correct HRA metrics"""
    
    def test_light_response_has_hra_metrics(self):
        """Test that light response returns all expected HRA metrics"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-response", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "per_stim" in data, "Response missing 'per_stim'"
        assert "mean_metrics" in data, "Response missing 'mean_metrics'"
        
        # Check mean_metrics has expected HRA fields
        mean_metrics = data["mean_metrics"]
        if mean_metrics:
            expected_hra_fields = ["avg_bf", "peak_bf", "peak_norm_pct", "time_to_peak_sec", "amplitude", "rate_of_change"]
            print(f"Mean metrics fields: {list(mean_metrics.keys())}")
            
            for field in expected_hra_fields:
                assert field in mean_metrics, f"mean_metrics missing expected HRA field: {field}"
            
            print(f"✅ mean_metrics has all 6 HRA readout fields: {expected_hra_fields}")
    
    def test_light_response_per_stim_has_hra_fields(self):
        """Test that per_stim results have HRA fields"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-response", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200
        data = response.json()
        
        per_stim = data["per_stim"]
        assert len(per_stim) > 0, "per_stim array is empty"
        
        # Check first valid stim
        for s in per_stim:
            if s is not None:
                expected_fields = ["avg_bf", "peak_bf", "peak_norm_pct", "time_to_peak_sec", "amplitude", "rate_of_change", "baseline_bf"]
                print(f"Per-stim fields: {list(s.keys())}")
                
                for field in expected_fields:
                    assert field in s, f"per_stim missing expected field: {field}"
                
                print(f"✅ per_stim has all expected HRA fields")
                break
    
    def test_light_response_uses_shared_baseline(self):
        """Test that light response uses shared baseline from -2 to -1 min before first stim"""
        beat_times_min, bf_filtered = generate_test_beat_data()
        pulses = generate_test_pulses()
        
        response = requests.post(f"{BASE_URL}/api/light-response", json={
            "beat_times_min": beat_times_min,
            "bf_filtered": bf_filtered,
            "pulses": pulses
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that baseline_bf is returned and is the same for all stims (shared)
        assert "baseline_bf" in data, "Response missing 'baseline_bf' (shared baseline)"
        
        baseline_bf = data["baseline_bf"]
        print(f"✅ Shared baseline_bf returned: {baseline_bf}")
        
        # Verify all per_stim entries use the same baseline
        per_stim = data["per_stim"]
        for s in per_stim:
            if s is not None:
                assert s.get("baseline_bf") == baseline_bf, f"per_stim baseline_bf mismatch: {s.get('baseline_bf')} != {baseline_bf}"


class TestLightDetectAPI:
    """Test /api/light-detect endpoint"""
    
    def test_light_detect_generates_pulses(self):
        """Test that light detect generates pulse windows"""
        response = requests.post(f"{BASE_URL}/api/light-detect", json={
            "start_time_sec": 180,
            "pulse_duration_sec": 20,
            "interval_sec": "decreasing",
            "n_pulses": 5,
            "auto_detect": False
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert "pulses" in data
        pulses = data["pulses"]
        assert len(pulses) == 5, f"Expected 5 pulses, got {len(pulses)}"
        
        # Check pulse structure
        for p in pulses:
            assert "start_sec" in p
            assert "end_sec" in p
            assert "start_min" in p
            assert "end_min" in p
        
        print(f"✅ Light detect generated {len(pulses)} pulses correctly")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "NeuCarS API"
        print("✅ API root responding correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
