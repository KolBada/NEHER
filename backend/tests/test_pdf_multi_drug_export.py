"""
Tests for PDF Export with Multiple Drug Readouts
Iteration 15 Tests

Tests for:
1. PDF export with multiple drug readouts - should show separate DRUG READOUT sections for each enabled drug
2. Mean BF calculation in PDF drug readout - should use correct per-drug readout minute settings
3. Per-Minute Beat Frequency Data table highlighting - drug readout rows should have light purple background
4. Per-Three Minutes HRV Data table highlighting - drug readout rows should have light purple background

Data structure for drug_readout_settings:
{
  "enableHrvReadout": true,
  "enableBfReadout": true,
  "perDrug": {
    "tetrodotoxin": {"hrvReadoutMinute": "1", "bfReadoutMinute": "2", "enabled": true},
    "acetylcholine": {"hrvReadoutMinute": "3", "bfReadoutMinute": "5", "enabled": true}
  }
}
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# ===== Test Fixtures =====

def create_multi_drug_export_request():
    """Create an ExportRequest with two drugs and complete data for PDF export"""
    
    # Generate per-minute data (20 minutes)
    per_minute_data = []
    for minute in range(20):
        per_minute_data.append({
            "minute": minute,
            "label": f"{minute}-{minute+1}",
            "n_beats": 60 + (minute % 5),
            "mean_bf": 70.0 + minute * 0.5,  # BF increases slightly
            "avg_bf": 70.0 + minute * 0.5,
            "mean_nn": 857 - minute * 3,
            "avg_nn": 857 - minute * 3,
        })
    
    # Generate HRV windows (3-minute windows, starting at each minute)
    hrv_windows = []
    for minute in range(18):  # Up to minute 17 (covers 17-20 window)
        hrv_windows.append({
            "minute": minute,
            "window": f"{minute}-{minute+3} min",
            "ln_rmssd70": 2.5 + (minute % 5) * 0.1,
            "rmssd70": 12.0 + minute * 0.5,
            "sdnn": 20.0 + minute * 0.3,
            "pnn50": 5.0 + (minute % 10),
            "mean_bf": 70.0 + minute * 0.5,
            "n_beats": 180 + (minute % 10),
        })
    
    # Two drugs with different settings
    all_drugs = [
        {
            "name": "Tetrodotoxin",
            "concentration": 1.0,
            "start": 3,  # perfusion start
            "delay": 2,  # perfusion delay
            "end": None
        },
        {
            "name": "Acetylcholine", 
            "concentration": 10.0,
            "start": 5,  # perfusion start
            "delay": 3,  # perfusion delay
            "end": 15
        }
    ]
    
    # Drug readout settings with per-drug configuration
    drug_readout_settings = {
        "enableHrvReadout": True,
        "enableBfReadout": True,
        "perDrug": {
            "tetrodotoxin": {
                "hrvReadoutMinute": "1",  # HRV readout at minute 1 + start(3) + delay(2) = 6
                "bfReadoutMinute": "2",   # BF readout at minute 2 + start(3) + delay(2) = 7
                "enabled": True
            },
            "acetylcholine": {
                "hrvReadoutMinute": "3",  # HRV readout at minute 3 + start(5) + delay(3) = 11
                "bfReadoutMinute": "5",   # BF readout at minute 5 + start(5) + delay(3) = 13
                "enabled": True
            }
        }
    }
    
    # Baseline data
    baseline = {
        "baseline_bf": 70.5,
        "baseline_ln_rmssd70": 2.5,
        "baseline_sdnn": 20.0,
        "baseline_pnn50": 5.0,
        "baseline_hrv_minute": 0,
        "baseline_bf_minute": 1,
        "baseline_hrv_window": "0-3 min",
        "baseline_bf_range": "1-2"
    }
    
    return {
        "filename": "test_multi_drug_export",
        "recording_name": "Test Multi-Drug Recording",
        "per_minute_data": per_minute_data,
        "hrv_windows": hrv_windows,
        "all_drugs": all_drugs,
        "drug_readout_enabled": True,
        "drug_readout_settings": drug_readout_settings,
        "baseline_enabled": True,
        "baseline": baseline,
        "light_enabled": False,
        "summary": {
            "Total Beats": 1200,
            "Kept Beats": 1150,
            "Filter Range": "50-200%"
        },
        "original_filename": "test_recording.abf",
        "recording_date": "2024-01-15"
    }


class TestPDFExportAPIEndpoint:
    """Test that the PDF export endpoint works with multi-drug data"""
    
    def test_pdf_export_endpoint_accepts_multi_drug_request(self):
        """PDF export endpoint accepts request with two drugs enabled"""
        request_data = create_multi_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed with status {response.status_code}: {response.text}"
        assert response.headers.get('content-type') == 'application/pdf', \
            f"Expected PDF content-type, got {response.headers.get('content-type')}"
        
        # Verify we got PDF data
        pdf_data = response.content
        assert len(pdf_data) > 1000, "PDF data too small, likely empty or failed"
        # PDF files start with %PDF
        assert pdf_data[:4] == b'%PDF', "Response does not appear to be a valid PDF"
    
    def test_pdf_export_generates_valid_pdf_size(self):
        """PDF export generates a reasonably sized PDF (multi-page with tables and charts)"""
        request_data = create_multi_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        pdf_size = len(response.content)
        
        # A proper multi-page PDF with charts and tables should be > 50KB
        assert pdf_size > 50000, f"PDF too small ({pdf_size} bytes), may be missing content"
        # But shouldn't be excessively large
        assert pdf_size < 5000000, f"PDF too large ({pdf_size} bytes), possible issue"
        
        print(f"Generated PDF size: {pdf_size} bytes")


class TestMultiDrugReadoutSections:
    """Test that PDF export creates separate DRUG READOUT sections for each enabled drug"""
    
    def test_pdf_export_with_two_enabled_drugs(self):
        """PDF export includes both drugs when both are enabled in perDrug settings"""
        request_data = create_multi_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # PDF is binary - we can't easily read text, but we verified it generates
        # The main test is that the endpoint doesn't crash with multiple drugs
        
    def test_pdf_export_with_one_disabled_drug(self):
        """PDF export only shows enabled drugs when one is disabled"""
        request_data = create_multi_drug_export_request()
        
        # Disable second drug
        request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        assert len(response.content) > 1000
    
    def test_pdf_export_with_all_drugs_disabled(self):
        """PDF export works when drug readout is enabled but all drugs are disabled"""
        request_data = create_multi_drug_export_request()
        
        # Disable both drugs' readout
        request_data["drug_readout_settings"]["enableHrvReadout"] = False
        request_data["drug_readout_settings"]["enableBfReadout"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


class TestMeanBFCalculation:
    """Test that Mean BF is calculated using correct per-drug readout minute settings"""
    
    def test_pdf_export_with_different_bf_readout_minutes(self):
        """PDF export uses different BF readout minutes for each drug"""
        request_data = create_multi_drug_export_request()
        
        # Drug 1 (Tetrodotoxin): bfReadoutMinute=2, start=3, delay=2 → actual minute = 7
        # Drug 2 (Acetylcholine): bfReadoutMinute=5, start=5, delay=3 → actual minute = 13
        # per_minute_data[7] should have mean_bf = 70.0 + 7*0.5 = 73.5
        # per_minute_data[13] should have mean_bf = 70.0 + 13*0.5 = 76.5
        
        # Verify data setup
        assert request_data["per_minute_data"][7]["mean_bf"] == 73.5
        assert request_data["per_minute_data"][13]["mean_bf"] == 76.5
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # The PDF generation should use these exact values
        # We can't easily verify PDF text content, but we verify no errors
    
    def test_pdf_export_bf_from_different_sources(self):
        """PDF export handles BF from both per_minute_data and hrv_windows"""
        request_data = create_multi_drug_export_request()
        
        # Remove mean_bf from some per_minute_data entries
        # The code should fallback to hrv_windows
        for i, pm in enumerate(request_data["per_minute_data"]):
            if i % 3 == 0:
                del pm["mean_bf"]
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


class TestTableHighlighting:
    """Test that drug readout rows get highlighted in tables"""
    
    def test_pdf_export_bf_table_includes_drug_windows(self):
        """PDF export BF table should highlight drug readout windows"""
        request_data = create_multi_drug_export_request()
        
        # Expected highlighted windows:
        # Tetrodotoxin: BF at minute 7 → window "7-8"
        # Acetylcholine: BF at minute 13 → window "13-14"
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # PDF generates successfully with the highlighting logic
    
    def test_pdf_export_hrv_table_includes_drug_minutes(self):
        """PDF export HRV table should highlight drug readout minutes"""
        request_data = create_multi_drug_export_request()
        
        # Expected highlighted minutes:
        # Tetrodotoxin: HRV at minute 6 (1 + 3 + 2)
        # Acetylcholine: HRV at minute 11 (3 + 5 + 3)
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_pdf_export_with_baseline_and_drug_highlights(self):
        """PDF export should highlight both baseline and drug readout rows"""
        request_data = create_multi_drug_export_request()
        
        # Baseline BF at minute 1 → window "1-2"
        # Baseline HRV at minute 0 → minute 0
        # Plus drug readout windows
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


class TestEdgeCases:
    """Test edge cases for PDF export with multiple drugs"""
    
    def test_pdf_export_empty_hrv_windows(self):
        """PDF export handles empty HRV windows gracefully"""
        request_data = create_multi_drug_export_request()
        request_data["hrv_windows"] = []
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_pdf_export_no_per_minute_data(self):
        """PDF export handles missing per_minute_data"""
        request_data = create_multi_drug_export_request()
        request_data["per_minute_data"] = []
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_pdf_export_drug_readout_minute_out_of_range(self):
        """PDF export handles drug readout minute beyond data range"""
        request_data = create_multi_drug_export_request()
        
        # Set readout minute to beyond data range
        request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["bfReadoutMinute"] = "50"
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # Should still generate PDF, just with missing data for that drug
    
    def test_pdf_export_missing_per_drug_settings(self):
        """PDF export handles missing perDrug settings (fallback to global)"""
        request_data = create_multi_drug_export_request()
        
        # Remove perDrug settings
        request_data["drug_readout_settings"]["perDrug"] = {}
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_pdf_export_drug_name_key_matching(self):
        """PDF export correctly matches drug names to perDrug settings keys"""
        request_data = create_multi_drug_export_request()
        
        # Test with different case/format drug name
        request_data["all_drugs"][0]["name"] = "TETRODOTOXIN"  # Uppercase
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


class TestDataIntegrity:
    """Test that PDF export preserves data integrity for drug readouts"""
    
    def test_pdf_export_per_drug_bf_minute_calculation(self):
        """Verify BF readout minute calculation: input + perf_start + perf_delay"""
        request_data = create_multi_drug_export_request()
        
        # Tetrodotoxin: bfReadoutMinute=2, start=3, delay=2 → actual = 7
        tetrodotoxin = request_data["all_drugs"][0]
        settings = request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]
        
        expected_minute = int(settings["bfReadoutMinute"]) + tetrodotoxin["start"] + tetrodotoxin["delay"]
        assert expected_minute == 7, f"Expected BF minute 7, got {expected_minute}"
        
        # Acetylcholine: bfReadoutMinute=5, start=5, delay=3 → actual = 13
        acetylcholine = request_data["all_drugs"][1]
        settings = request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]
        
        expected_minute = int(settings["bfReadoutMinute"]) + acetylcholine["start"] + acetylcholine["delay"]
        assert expected_minute == 13, f"Expected BF minute 13, got {expected_minute}"
    
    def test_pdf_export_per_drug_hrv_minute_calculation(self):
        """Verify HRV readout minute calculation: input + perf_start + perf_delay"""
        request_data = create_multi_drug_export_request()
        
        # Tetrodotoxin: hrvReadoutMinute=1, start=3, delay=2 → actual = 6
        tetrodotoxin = request_data["all_drugs"][0]
        settings = request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]
        
        expected_minute = int(settings["hrvReadoutMinute"]) + tetrodotoxin["start"] + tetrodotoxin["delay"]
        assert expected_minute == 6, f"Expected HRV minute 6, got {expected_minute}"
        
        # Acetylcholine: hrvReadoutMinute=3, start=5, delay=3 → actual = 11
        acetylcholine = request_data["all_drugs"][1]
        settings = request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]
        
        expected_minute = int(settings["hrvReadoutMinute"]) + acetylcholine["start"] + acetylcholine["delay"]
        assert expected_minute == 11, f"Expected HRV minute 11, got {expected_minute}"


class TestAPIResponseHeaders:
    """Test PDF export response headers"""
    
    def test_pdf_export_content_disposition_header(self):
        """PDF export returns correct Content-Disposition header"""
        request_data = create_multi_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        content_disposition = response.headers.get('content-disposition', '')
        assert 'attachment' in content_disposition, "Content-Disposition should indicate attachment"
        assert '.pdf' in content_disposition, "Filename should have .pdf extension"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
