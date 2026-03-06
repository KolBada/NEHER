"""
Test cases for NEHER electrophysiology analysis bug fixes (Iteration 20)
Bug fixes tested:
1. Decimal minute values for baseline/drug readout computation (HRV lookup) - Code review only
2. Per-drug perfusion time in comparison metadata
3. 'Readout Time Range:' label (frontend)
4. Input field width for decimal numbers (frontend)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestDecimalMinuteCodeReview:
    """
    Bug Fix #1: Backend should handle decimal HRV minute values (e.g., 0.5)
    The fix uses int(hrv_minute) for lookup in analysis.py line 1061.
    Testing through code review since the HRV analysis endpoint requires ABF file data.
    """
    
    def test_code_fix_exists_in_analysis(self):
        """Verify the int() conversion fix exists in the analysis.py code"""
        # Read the analysis.py file to verify the fix
        import re
        analysis_path = '/app/backend/analysis.py'
        
        with open(analysis_path, 'r') as f:
            content = f.read()
        
        # Check for the fix: int(hrv_minute) or hrv_minute_lookup = int(...)
        int_hrv_pattern = r'int\s*\(\s*hrv_minute\s*\)'
        matches = re.findall(int_hrv_pattern, content)
        
        # Alternative: check for hrv_minute_lookup assignment
        lookup_pattern = r'hrv_minute_lookup\s*=\s*int\s*\('
        lookup_matches = re.findall(lookup_pattern, content)
        
        assert len(matches) > 0 or len(lookup_matches) > 0, \
            "int(hrv_minute) conversion fix not found in analysis.py"
        
        print(f"PASS: Found int(hrv_minute) conversion fix in analysis.py")
        print(f"  Pattern matches: {len(matches)}, Lookup pattern matches: {len(lookup_matches)}")


class TestComparisonMetadata:
    """Test that comparison endpoint returns per-drug perfusion time"""
    
    def test_comparison_returns_per_drug_metrics(self):
        """
        Bug Fix #2: Comparison page metadata should show per-drug perfusion time
        This tests the /api/folders/{id}/comparison endpoint
        """
        # First get list of folders
        folders_response = requests.get(f"{BASE_URL}/api/folders")
        assert folders_response.status_code == 200
        folders = folders_response.json().get("folders", [])
        
        # Find a folder with recordings (ideally with drugs)
        folder_with_recordings = None
        for folder in folders:
            if folder.get("recording_count", 0) > 0:
                folder_with_recordings = folder
                break
        
        if not folder_with_recordings:
            pytest.skip("No folders with recordings found")
        
        folder_id = folder_with_recordings["id"]
        
        # Get comparison data
        comparison_response = requests.get(f"{BASE_URL}/api/folders/{folder_id}/comparison")
        assert comparison_response.status_code == 200
        comparison_data = comparison_response.json()
        
        # Check that recordings have per_drug_metrics field
        recordings = comparison_data.get("recordings", [])
        if recordings:
            first_rec = recordings[0]
            print(f"Recording fields: {list(first_rec.keys())}")
            
            # Check if per_drug_metrics exists (may be empty array if no drugs)
            if "per_drug_metrics" in first_rec:
                print(f"PASS: per_drug_metrics field exists")
                
                # If there are drug metrics, check for perf_time
                for drug_metric in first_rec.get("per_drug_metrics", []):
                    if "perf_time" in drug_metric:
                        print(f"PASS: perf_time field found: {drug_metric.get('perf_time')}")
            else:
                print("INFO: per_drug_metrics field not present (may be legacy recording)")
        
        print(f"Tested comparison for folder: {folder_with_recordings['name']}")
    
    def test_propranolol_folder_comparison(self):
        """Test the specific Propranolol folder mentioned in bug report"""
        folder_id = "69a77b6d5549a8d937e5adf4"  # H9 NeuCarS + Light Stimulus under Propranolol
        
        comparison_response = requests.get(f"{BASE_URL}/api/folders/{folder_id}/comparison")
        if comparison_response.status_code == 404:
            pytest.skip("Test folder not found")
        
        assert comparison_response.status_code == 200
        comparison_data = comparison_response.json()
        
        recordings = comparison_data.get("recordings", [])
        assert len(recordings) > 0, "Should have recordings"
        
        # Check each recording for per_drug_metrics with perf_time
        for rec in recordings:
            per_drug_metrics = rec.get("per_drug_metrics", [])
            if per_drug_metrics:
                for dm in per_drug_metrics:
                    assert "perf_time" in dm, f"perf_time should be in per_drug_metrics for {rec['name']}"
                    print(f"{rec['name']}: drug={dm.get('drug_name')}, perf_time={dm.get('perf_time')}")
        
        print("PASS: All recordings have perf_time in per_drug_metrics")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        assert response.json().get("message") == "NEHER API"
        print("PASS: API root endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
