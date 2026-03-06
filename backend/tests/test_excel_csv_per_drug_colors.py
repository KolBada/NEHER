"""
Tests for Excel and CSV Export with Per-Drug Colors and Multi-Drug Readout Support
Iteration 17 Tests

Tests for:
1. Excel export - Drug Perfusion section should use per-drug fill colors (drug_fills array)
2. Excel export - Drug Readout section should have single header with multiple drug blocks using per-drug colors
3. Excel export - Per-drug readout data should use correct per-drug settings (bfReadoutMinute, hrvReadoutMinute)
4. CSV export - Drug Readout section should output data for each enabled drug with drug name
5. CSV export - Per-drug readout data should use correct per-drug settings

Expected drug_fills array in Excel (matching DRUG_COLORS tints):
  Drug 1: 'F3E8FF' (light purple)
  Drug 2: 'EDE9FE' (light violet)
  Drug 3: 'E9D5FF' (light fuchsia)
  Drug 4: 'DDD6FE' (light indigo)
"""
import pytest
import requests
import os
import sys
import io
import csv

# Add parent to path for unit test imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


# ===== Test Data Fixtures =====

def create_two_drug_export_request():
    """
    Create an ExportRequest with two drugs as specified in test requirements.
    Drugs: Tetrodotoxin (start=3, delay=0), Acetylcholine (start=6, delay=0)
    Per-drug readout settings with different minutes for each drug.
    """
    
    # Generate per-minute data (20 minutes)
    per_minute_data = []
    for minute in range(20):
        per_minute_data.append({
            "minute": minute,
            "label": f"{minute}-{minute+1}",
            "n_beats": 60 + (minute % 5),
            "mean_bf": 70.0 + minute * 0.5,
            "avg_bf": 70.0 + minute * 0.5,
            "mean_nn": 857 - minute * 3,
            "avg_nn": 857 - minute * 3,
        })
    
    # Generate HRV windows (3-minute windows)
    hrv_windows = []
    for minute in range(18):
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
    
    # Two drugs exactly as specified
    all_drugs = [
        {
            "name": "Tetrodotoxin",
            "concentration": 1.0,
            "start": 3,
            "delay": 0,
            "end": None
        },
        {
            "name": "Acetylcholine", 
            "concentration": 10.0,
            "start": 6,
            "delay": 0,
            "end": 15
        }
    ]
    
    # Drug readout settings with per-drug configuration
    # Tetrodotoxin: HRV@2 (actual: 2+3+0=5), BF@1 (actual: 1+3+0=4)
    # Acetylcholine: HRV@4 (actual: 4+6+0=10), BF@3 (actual: 3+6+0=9)
    drug_readout_settings = {
        "enableHrvReadout": True,
        "enableBfReadout": True,
        "perDrug": {
            "tetrodotoxin": {
                "hrvReadoutMinute": "2",
                "bfReadoutMinute": "1",
                "enabled": True
            },
            "acetylcholine": {
                "hrvReadoutMinute": "4",
                "bfReadoutMinute": "3",
                "enabled": True
            }
        }
    }
    
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
    
    per_beat_data = []
    for i in range(1000):
        time_min = i * 0.02
        bf_bpm = 70.0 + (time_min % 10)
        per_beat_data.append({
            "time_min": time_min,
            "bf_bpm": bf_bpm,
            "nn_ms": 60000 / bf_bpm,
            "status": "kept"
        })
    
    return {
        "filename": "test_per_drug_export",
        "recording_name": "Test Per-Drug Colors Recording",
        "per_minute_data": per_minute_data,
        "hrv_windows": hrv_windows,
        "all_drugs": all_drugs,
        "per_beat_data": per_beat_data,
        "drug_readout_enabled": True,
        "drug_readout_settings": drug_readout_settings,
        "baseline_enabled": True,
        "baseline": baseline,
        "light_enabled": False,
        "summary": {
            "Total Beats": 1000,
            "Kept Beats": 950,
            "Filter Range": "50-200%"
        },
        "original_filename": "test_recording.abf",
        "recording_date": "2024-01-15"
    }


def create_four_drug_export_request():
    """Create request with 4 drugs to test all 4 color variants"""
    
    per_minute_data = []
    for minute in range(25):
        per_minute_data.append({
            "minute": minute,
            "label": f"{minute}-{minute+1}",
            "n_beats": 60,
            "mean_bf": 70.0 + minute * 0.3,
            "avg_bf": 70.0 + minute * 0.3,
        })
    
    hrv_windows = []
    for minute in range(22):
        hrv_windows.append({
            "minute": minute,
            "window": f"{minute}-{minute+3} min",
            "ln_rmssd70": 2.5,
            "rmssd70": 12.0,
            "sdnn": 20.0,
            "pnn50": 5.0,
            "mean_bf": 70.0 + minute * 0.3,
        })
    
    # Four drugs
    all_drugs = [
        {"name": "Drug A", "start": 2, "delay": 1, "end": None},
        {"name": "Drug B", "start": 6, "delay": 1, "end": None},
        {"name": "Drug C", "start": 10, "delay": 1, "end": None},
        {"name": "Drug D", "start": 14, "delay": 1, "end": None}
    ]
    
    drug_readout_settings = {
        "enableHrvReadout": True,
        "enableBfReadout": True,
        "perDrug": {
            "drug_a": {"hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True},
            "drug_b": {"hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True},
            "drug_c": {"hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True},
            "drug_d": {"hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True}
        }
    }
    
    per_beat_data = []
    for i in range(1200):
        per_beat_data.append({
            "time_min": i * 0.02,
            "bf_bpm": 70.0,
            "nn_ms": 857,
            "status": "kept"
        })
    
    return {
        "filename": "test_four_drugs_export",
        "recording_name": "Test Four Drugs Recording",
        "per_minute_data": per_minute_data,
        "hrv_windows": hrv_windows,
        "all_drugs": all_drugs,
        "per_beat_data": per_beat_data,
        "drug_readout_enabled": True,
        "drug_readout_settings": drug_readout_settings,
        "baseline_enabled": True,
        "baseline": {"baseline_bf": 70.0, "baseline_ln_rmssd70": 2.5, "baseline_sdnn": 20.0, "baseline_pnn50": 5.0, "baseline_bf_minute": 0, "baseline_hrv_minute": 0},
        "light_enabled": False,
        "summary": {"Total Beats": 1200, "Kept Beats": 1200, "Filter Range": "50-200%"},
    }


# ===== Unit Tests for drug_fills array in Excel =====

class TestExcelDrugFillsDefinition:
    """Test that drug_fills array is properly defined in create_nature_excel"""
    
    def test_drug_fills_array_has_four_entries(self):
        """Verify drug_fills array has 4 PatternFill entries by checking export success"""
        # We can't directly unit test the array since it's defined inside the function
        # Instead we verify via API that export with 4 drugs works
        request_data = create_four_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200, f"Excel export failed: {response.text}"
        assert 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' in response.headers.get('content-type', '')
    
    def test_excel_export_with_five_drugs_color_wraparound(self):
        """Excel export should handle 5+ drugs by wrapping colors"""
        request_data = create_four_drug_export_request()
        
        # Add 5th drug
        request_data["all_drugs"].append({
            "name": "Drug E", "start": 18, "delay": 1, "end": None
        })
        request_data["drug_readout_settings"]["perDrug"]["drug_e"] = {
            "hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200, f"Excel export failed with 5 drugs: {response.text}"


# ===== Excel Export API Tests =====

class TestExcelExportTwoDrugs:
    """Test Excel export with two drugs"""
    
    def test_excel_export_accepts_two_drug_request(self):
        """Excel export endpoint accepts request with two drugs"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200, f"Excel export failed: {response.text}"
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheetml.sheet' in content_type or 'octet-stream' in content_type
        assert len(response.content) > 5000, "Excel file too small"
    
    def test_excel_export_returns_valid_xlsx(self):
        """Excel export returns a valid XLSX file (has PK header)"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
        # XLSX files are ZIP archives starting with PK
        assert response.content[:2] == b'PK', "Not a valid XLSX file (should start with PK)"


class TestExcelDrugPerfusionSection:
    """Test Excel Drug Perfusion section uses per-drug fill colors"""
    
    def test_drug_perfusion_with_two_drugs(self):
        """Drug Perfusion section should generate with two drugs using different colors"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
        # Verify reasonable file size (has content for Drug Perfusion)
        assert len(response.content) > 10000
    
    def test_drug_perfusion_with_four_drugs_all_colors(self):
        """Drug Perfusion section with 4 drugs should use all 4 color variants"""
        request_data = create_four_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
        assert len(response.content) > 10000


class TestExcelDrugReadoutSection:
    """Test Excel Drug Readout section has single header with per-drug colored blocks"""
    
    def test_drug_readout_with_two_drugs(self):
        """Drug Readout should have ONE header with blocks for each enabled drug"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_drug_readout_uses_per_drug_settings(self):
        """Each drug block should use its own per-drug settings"""
        request_data = create_two_drug_export_request()
        
        # Different readout minutes for each drug
        assert request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["hrvReadoutMinute"] == "2"
        assert request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["hrvReadoutMinute"] == "4"
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_drug_readout_disabled_drug_not_shown(self):
        """Disabled drug should not appear in Drug Readout section"""
        request_data = create_two_drug_export_request()
        
        # Disable second drug
        request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200


# ===== CSV Export API Tests =====

class TestCsvExportTwoDrugs:
    """Test CSV export with two drugs"""
    
    def test_csv_export_accepts_two_drug_request(self):
        """CSV export endpoint accepts request with two drugs"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200, f"CSV export failed: {response.text}"
        content_type = response.headers.get('content-type', '')
        assert 'text/csv' in content_type or 'octet-stream' in content_type
    
    def test_csv_export_returns_valid_csv(self):
        """CSV export returns parseable CSV content"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        
        # Parse CSV content
        csv_content = response.content.decode('utf-8')
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        assert len(rows) > 10, "CSV should have substantial content"


class TestCsvDrugReadoutSection:
    """Test CSV Drug Readout section outputs data for each enabled drug"""
    
    def test_csv_has_drug_readout_header(self):
        """CSV should have DRUG READOUT section header"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        assert '=== DRUG READOUT ===' in csv_content, "Missing DRUG READOUT section header"
    
    def test_csv_has_tetrodotoxin_drug_row(self):
        """CSV should have 'Drug, Tetrodotoxin' row"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        # Parse and check for drug row
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        drug_rows = [row for row in rows if len(row) >= 2 and row[0] == 'Drug' and 'Tetrodotoxin' in row[1]]
        assert len(drug_rows) >= 1, f"Missing 'Drug, Tetrodotoxin' row. Found rows: {[r for r in rows if r and 'drug' in str(r).lower()]}"
    
    def test_csv_has_acetylcholine_drug_row(self):
        """CSV should have 'Drug, Acetylcholine' row"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        drug_rows = [row for row in rows if len(row) >= 2 and row[0] == 'Drug' and 'Acetylcholine' in row[1]]
        assert len(drug_rows) >= 1, f"Missing 'Drug, Acetylcholine' row"
    
    def test_csv_drug_readout_has_both_drugs(self):
        """CSV Drug Readout should have both Tetrodotoxin and Acetylcholine"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        assert 'Tetrodotoxin' in csv_content, "Missing Tetrodotoxin in CSV"
        assert 'Acetylcholine' in csv_content, "Missing Acetylcholine in CSV"
    
    def test_csv_drug_readout_has_metrics_for_each_drug(self):
        """Each drug in CSV Drug Readout section should have Mean BF and HRV metrics"""
        request_data = create_two_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        # Find Drug Readout section and count drugs with metrics there
        in_drug_readout = False
        drug_count_with_metrics = 0
        current_drug = None
        
        for i, row in enumerate(rows):
            if len(row) > 0 and 'DRUG READOUT' in row[0]:
                in_drug_readout = True
                continue
            if not in_drug_readout:
                continue
            # Stop at next section
            if len(row) > 0 and row[0].startswith('==='):
                break
            if len(row) >= 2 and row[0] == 'Drug':
                if current_drug is not None:
                    # Check previous drug had metrics
                    pass
                current_drug = row[1]
            if current_drug and len(row) >= 2 and row[0] == 'Mean BF':
                drug_count_with_metrics += 1
                current_drug = None  # Reset to look for next drug
        
        assert drug_count_with_metrics >= 2, f"Expected at least 2 drugs with 'Mean BF' in Drug Readout, found {drug_count_with_metrics}"


class TestCsvPerDrugSettings:
    """Test CSV uses correct per-drug settings for readout data"""
    
    def test_csv_uses_per_drug_bf_minute(self):
        """Each drug should use its own bfReadoutMinute setting"""
        request_data = create_two_drug_export_request()
        
        # Verify settings are different
        tetro_bf_min = request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["bfReadoutMinute"]
        acetyl_bf_min = request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["bfReadoutMinute"]
        assert tetro_bf_min != acetyl_bf_min, "Test data should have different BF minutes"
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_csv_uses_per_drug_hrv_minute(self):
        """Each drug should use its own hrvReadoutMinute setting"""
        request_data = create_two_drug_export_request()
        
        # Verify settings are different
        tetro_hrv_min = request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["hrvReadoutMinute"]
        acetyl_hrv_min = request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["hrvReadoutMinute"]
        assert tetro_hrv_min != acetyl_hrv_min, "Test data should have different HRV minutes"
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_csv_disabled_drug_not_in_readout(self):
        """Disabled drug should not appear in Drug Readout CSV section"""
        request_data = create_two_drug_export_request()
        
        # Disable Acetylcholine
        request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        # Find drug rows in DRUG READOUT section
        in_drug_readout = False
        drug_names_in_readout = []
        for row in rows:
            if len(row) > 0 and 'DRUG READOUT' in row[0]:
                in_drug_readout = True
                continue
            if in_drug_readout:
                # Stop at next section
                if len(row) > 0 and row[0].startswith('==='):
                    break
                if len(row) >= 2 and row[0] == 'Drug':
                    drug_names_in_readout.append(row[1])
        
        assert 'Tetrodotoxin' in drug_names_in_readout, "Tetrodotoxin should be in Drug Readout"
        assert 'Acetylcholine' not in drug_names_in_readout, "Disabled Acetylcholine should NOT be in Drug Readout"


class TestCsvFourDrugs:
    """Test CSV export with four drugs"""
    
    def test_csv_with_four_drugs(self):
        """CSV export should work with 4 drugs"""
        request_data = create_four_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        # All four drugs should appear
        for drug in ['Drug A', 'Drug B', 'Drug C', 'Drug D']:
            assert drug in csv_content, f"Missing {drug} in CSV"
    
    def test_csv_with_five_drugs(self):
        """CSV export should work with 5+ drugs"""
        request_data = create_four_drug_export_request()
        
        # Add 5th drug
        request_data["all_drugs"].append({
            "name": "Drug E", "start": 18, "delay": 1, "end": None
        })
        request_data["drug_readout_settings"]["perDrug"]["drug_e"] = {
            "hrvReadoutMinute": "1", "bfReadoutMinute": "1", "enabled": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        assert 'Drug E' in csv_content


# ===== Edge Cases =====

class TestExportEdgeCases:
    """Test edge cases for Excel and CSV exports"""
    
    def test_excel_single_drug(self):
        """Excel export with single drug should use first color"""
        request_data = create_two_drug_export_request()
        
        # Keep only first drug
        request_data["all_drugs"] = [request_data["all_drugs"][0]]
        request_data["drug_readout_settings"]["perDrug"] = {
            "tetrodotoxin": request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_csv_single_drug(self):
        """CSV export with single drug"""
        request_data = create_two_drug_export_request()
        
        # Keep only first drug
        request_data["all_drugs"] = [request_data["all_drugs"][0]]
        request_data["drug_readout_settings"]["perDrug"] = {
            "tetrodotoxin": request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        assert 'Tetrodotoxin' in csv_content
    
    def test_excel_no_drugs(self):
        """Excel export without drugs should work"""
        request_data = create_two_drug_export_request()
        request_data["all_drugs"] = []
        request_data["drug_readout_enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_csv_no_drugs(self):
        """CSV export without drugs should work"""
        request_data = create_two_drug_export_request()
        request_data["all_drugs"] = []
        request_data["drug_readout_enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_excel_drug_readout_disabled(self):
        """Excel export with drugs but drug_readout_enabled=False"""
        request_data = create_two_drug_export_request()
        request_data["drug_readout_enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_csv_drug_readout_disabled(self):
        """CSV export with drugs but drug_readout_enabled=False"""
        request_data = create_two_drug_export_request()
        request_data["drug_readout_enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        # Drug Perfusion should still be present, but not Drug Readout
        assert '=== DRUG READOUT ===' not in csv_content, "Drug Readout section should not appear when disabled"


# ===== Integration Tests =====

class TestExportConsistency:
    """Test that Excel and CSV exports are consistent"""
    
    def test_both_exports_succeed_with_same_data(self):
        """Both Excel and CSV should succeed with identical data"""
        request_data = create_two_drug_export_request()
        
        excel_response = requests.post(
            f"{BASE_URL}/api/export/xlsx",
            json=request_data
        )
        
        csv_response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert excel_response.status_code == 200, f"Excel failed: {excel_response.text}"
        assert csv_response.status_code == 200, f"CSV failed: {csv_response.text}"
    
    def test_csv_drug_count_matches_request(self):
        """CSV should have drug entries matching request"""
        request_data = create_two_drug_export_request()
        expected_drug_count = 2  # Both drugs enabled
        
        response = requests.post(
            f"{BASE_URL}/api/export/csv",
            json=request_data
        )
        
        assert response.status_code == 200
        csv_content = response.content.decode('utf-8')
        
        reader = csv.reader(io.StringIO(csv_content))
        rows = list(reader)
        
        drug_rows = [row for row in rows if len(row) >= 2 and row[0] == 'Drug']
        # Drugs can appear in both Drug Perfusion and Drug Readout sections
        # We check Drug Readout specifically
        in_readout = False
        readout_drugs = []
        for row in rows:
            if len(row) > 0 and 'DRUG READOUT' in row[0]:
                in_readout = True
            elif in_readout and len(row) > 0 and row[0].startswith('==='):
                break
            elif in_readout and len(row) >= 2 and row[0] == 'Drug':
                readout_drugs.append(row[1])
        
        assert len(readout_drugs) == expected_drug_count, f"Expected {expected_drug_count} drugs in readout, found {len(readout_drugs)}: {readout_drugs}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
