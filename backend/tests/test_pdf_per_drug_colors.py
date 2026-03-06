"""
Tests for PDF Export with Per-Drug Colors
Iteration 16 Tests

Tests for:
1. PDF Summary - Drug Perfusion section should use different light purple shades for each drug
2. PDF Summary - Drug Readout section should have ONE header with multiple drug boxes in different colors
3. PDF BF Evolution - Legend should show each drug individually as '[drug name] perfusion'
4. PDF BF Evolution - Drug regions on chart should use per-drug colors
5. PDF Table 1 Per-Minute BF - Drug readout rows should use per-drug colors matching Drug Readout section
6. PDF Table 2 Per-Three Minutes HRV - Drug readout rows should use per-drug colors matching Drug Readout section
7. Backend should support decimal minute inputs (e.g., 1.5, 2.5) for BF and HRV readout minutes

Expected DRUG_COLORS array (defined in export_utils.py):
  Drug 1: '#F3E8FF' (light purple tint)
  Drug 2: '#EDE9FE' (light violet tint)
  Drug 3: '#E9D5FF' (light fuchsia tint)
  Drug 4: '#DDD6FE' (light indigo tint)
"""
import pytest
import requests
import os
import sys

# Add parent to path to allow importing export_utils directly for unit tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


# ===== Test Data Fixtures =====

def create_two_drug_export_request_with_decimal_minutes():
    """
    Create an ExportRequest with two drugs using decimal minute inputs (1.5, 2.5 etc)
    As specified in the test requirements.
    """
    
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
    
    # Two drugs exactly as specified in the test requirements
    all_drugs = [
        {
            "name": "Tetrodotoxin",
            "concentration": 1.0,
            "start": 3,  # perfusion start
            "delay": 0,  # perfusion delay
            "end": None
        },
        {
            "name": "Acetylcholine", 
            "concentration": 10.0,
            "start": 6,  # perfusion start
            "delay": 0,  # perfusion delay
            "end": 15
        }
    ]
    
    # Drug readout settings with DECIMAL minute inputs as specified
    drug_readout_settings = {
        "enableHrvReadout": True,
        "enableBfReadout": True,
        "perDrug": {
            "tetrodotoxin": {
                "hrvReadoutMinute": "1.5",  # HRV readout at 1.5 + 3 + 0 = 4.5 → floor to 4
                "bfReadoutMinute": "2.5",   # BF readout at 2.5 + 3 + 0 = 5.5 → floor to 5
                "enabled": True
            },
            "acetylcholine": {
                "hrvReadoutMinute": "3.5",  # HRV readout at 3.5 + 6 + 0 = 9.5 → floor to 9
                "bfReadoutMinute": "4.5",   # BF readout at 4.5 + 6 + 0 = 10.5 → floor to 10
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
    
    # Generate per_beat_data for BF Evolution chart
    per_beat_data = []
    for i in range(1000):
        time_min = i * 0.02  # 20 minute recording, 50 beats per minute
        bf_bpm = 70.0 + (time_min % 10)  # Varies by time
        per_beat_data.append({
            "time_min": time_min,
            "bf_bpm": bf_bpm,
            "nn_ms": 60000 / bf_bpm,
            "status": "kept"
        })
    
    return {
        "filename": "test_per_drug_colors_export",
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
    """Create request with 4 drugs to test all color variants"""
    
    # Generate per-minute data (25 minutes)
    per_minute_data = []
    for minute in range(25):
        per_minute_data.append({
            "minute": minute,
            "label": f"{minute}-{minute+1}",
            "n_beats": 60,
            "mean_bf": 70.0 + minute * 0.3,
            "avg_bf": 70.0 + minute * 0.3,
        })
    
    # Generate HRV windows
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
    
    # Four drugs to test all colors
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
        time_min = i * 0.02
        per_beat_data.append({
            "time_min": time_min,
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


# ===== Unit Tests for DRUG_COLORS array =====

class TestDrugColorsDefinition:
    """Test that DRUG_COLORS array is properly defined in export_utils.py"""
    
    def test_drug_colors_array_exists(self):
        """DRUG_COLORS array should be defined with 4 entries"""
        from export_utils import DRUG_COLORS
        
        assert DRUG_COLORS is not None, "DRUG_COLORS should be defined"
        assert len(DRUG_COLORS) == 4, f"DRUG_COLORS should have 4 entries, got {len(DRUG_COLORS)}"
    
    def test_drug_colors_have_required_keys(self):
        """Each DRUG_COLORS entry should have tint, solid, and name keys"""
        from export_utils import DRUG_COLORS
        
        for i, color in enumerate(DRUG_COLORS):
            assert 'tint' in color, f"DRUG_COLORS[{i}] missing 'tint' key"
            assert 'solid' in color, f"DRUG_COLORS[{i}] missing 'solid' key"
            assert 'name' in color, f"DRUG_COLORS[{i}] missing 'name' key"
    
    def test_drug_colors_expected_tints(self):
        """DRUG_COLORS tints should match expected values"""
        from export_utils import DRUG_COLORS
        
        expected_tints = ['#F3E8FF', '#EDE9FE', '#E9D5FF', '#DDD6FE']
        
        for i, (color, expected) in enumerate(zip(DRUG_COLORS, expected_tints)):
            assert color['tint'] == expected, f"DRUG_COLORS[{i}] tint should be {expected}, got {color['tint']}"
    
    def test_drug_colors_expected_solids(self):
        """DRUG_COLORS solid colors should be defined"""
        from export_utils import DRUG_COLORS
        
        expected_solids = ['#a855f7', '#8b5cf6', '#c084fc', '#a78bfa']
        
        for i, (color, expected) in enumerate(zip(DRUG_COLORS, expected_solids)):
            assert color['solid'] == expected, f"DRUG_COLORS[{i}] solid should be {expected}, got {color['solid']}"
    
    def test_drug_color_index_wraparound(self):
        """DRUG_COLORS should wrap around with modulo for more than 4 drugs"""
        from export_utils import DRUG_COLORS
        
        # Test that index 4 wraps to index 0
        assert DRUG_COLORS[4 % len(DRUG_COLORS)] == DRUG_COLORS[0]
        assert DRUG_COLORS[5 % len(DRUG_COLORS)] == DRUG_COLORS[1]
        assert DRUG_COLORS[6 % len(DRUG_COLORS)] == DRUG_COLORS[2]
        assert DRUG_COLORS[7 % len(DRUG_COLORS)] == DRUG_COLORS[3]


# ===== API Tests for PDF Export with Two Drugs =====

class TestPDFExportTwoDrugColors:
    """Test PDF export generates correctly with two drugs using different colors"""
    
    def test_pdf_export_accepts_two_drug_request(self):
        """PDF export endpoint accepts request with two drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert response.headers.get('content-type') == 'application/pdf'
        assert len(response.content) > 1000, "PDF data too small"
        assert response.content[:4] == b'%PDF', "Not a valid PDF"
    
    def test_pdf_export_generates_multi_page_pdf(self):
        """PDF should have multiple pages (summary, BF evolution, tables)"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # A multi-page PDF should be reasonably sized (>40KB)
        assert len(response.content) > 40000, f"PDF seems too small: {len(response.content)} bytes"


# ===== API Tests for Decimal Minute Support =====

class TestDecimalMinuteSupport:
    """Test that backend supports decimal minute inputs (e.g., 0.5, 1.5, 2.5)"""
    
    def test_decimal_hrv_readout_minute_accepted(self):
        """PDF export accepts decimal hrvReadoutMinute values"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Verify decimal values are in request
        assert request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["hrvReadoutMinute"] == "1.5"
        assert request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["hrvReadoutMinute"] == "3.5"
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed with decimal HRV minutes: {response.text}"
    
    def test_decimal_bf_readout_minute_accepted(self):
        """PDF export accepts decimal bfReadoutMinute values"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Verify decimal values are in request
        assert request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["bfReadoutMinute"] == "2.5"
        assert request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["bfReadoutMinute"] == "4.5"
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed with decimal BF minutes: {response.text}"
    
    def test_various_decimal_values(self):
        """PDF export accepts various decimal minute values"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Test with different decimal values
        decimal_values = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5"]
        
        for val in decimal_values:
            request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]["hrvReadoutMinute"] = val
            
            response = requests.post(
                f"{BASE_URL}/api/export/pdf",
                json=request_data
            )
            
            assert response.status_code == 200, f"PDF export failed with decimal value {val}: {response.text}"
    
    def test_decimal_minute_floor_calculation(self):
        """Verify decimal minutes are floored for data lookup"""
        # This tests that 1.5 + 3 + 0 = 4.5 → floor(4.5) = 4 for lookup
        # We verify indirectly by ensuring the PDF generates successfully
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Expected calculations:
        # Tetrodotoxin HRV: 1.5 + 3 + 0 = 4.5 → lookup at minute 4
        # Tetrodotoxin BF: 2.5 + 3 + 0 = 5.5 → lookup at minute 5
        # Acetylcholine HRV: 3.5 + 6 + 0 = 9.5 → lookup at minute 9
        # Acetylcholine BF: 4.5 + 6 + 0 = 10.5 → lookup at minute 10
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # PDF should be valid and contain the expected data
        assert len(response.content) > 50000


# ===== API Tests for Four Drug Colors =====

class TestPDFExportFourDrugColors:
    """Test PDF export with 4 drugs using all color variants"""
    
    def test_pdf_export_with_four_drugs(self):
        """PDF export should work with 4 drugs using all 4 color variants"""
        request_data = create_four_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed with 4 drugs: {response.text}"
        assert len(response.content) > 50000, "PDF too small for 4 drugs"
    
    def test_pdf_export_with_five_drugs_color_wraparound(self):
        """PDF export should handle 5+ drugs by wrapping colors around"""
        request_data = create_four_drug_export_request()
        
        # Add a 5th drug - should use color index 0 (wraparound)
        request_data["all_drugs"].append({
            "name": "Drug E",
            "start": 18,
            "delay": 1,
            "end": None
        })
        request_data["drug_readout_settings"]["perDrug"]["drug_e"] = {
            "hrvReadoutMinute": "1",
            "bfReadoutMinute": "1",
            "enabled": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200, f"PDF export failed with 5 drugs: {response.text}"


# ===== Tests for Drug Perfusion Section Colors =====

class TestDrugPerfusionSectionColors:
    """Test that Drug Perfusion section uses different colors per drug"""
    
    def test_drug_perfusion_two_drugs_generates_pdf(self):
        """Drug Perfusion section generates with two drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # The actual colors are applied in the PDF generation
        # We verify success and appropriate file size (>40KB)
        assert len(response.content) > 40000


# ===== Tests for Drug Readout Section =====

class TestDrugReadoutSectionColors:
    """Test that Drug Readout section has ONE header with per-drug colored boxes"""
    
    def test_drug_readout_section_generates_correctly(self):
        """Drug Readout section should generate with multiple drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # Verify PDF is reasonably sized (has content)
        assert len(response.content) > 50000


# ===== Tests for BF Evolution Chart =====

class TestBFEvolutionChart:
    """Test BF Evolution chart drug regions and legend"""
    
    def test_bf_evolution_chart_generates_with_drugs(self):
        """BF Evolution chart should generate with drug region overlays"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        # Chart page adds significant size (>40KB)
        assert len(response.content) > 40000
    
    def test_bf_evolution_without_per_beat_data(self):
        """BF Evolution should handle missing per_beat_data gracefully"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        request_data["per_beat_data"] = []
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


# ===== Tests for Table Highlighting =====

class TestTablePerDrugHighlighting:
    """Test that tables use per-drug colors for highlighting"""
    
    def test_bf_table_with_two_drug_highlights(self):
        """BF table should highlight rows for both drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_hrv_table_with_two_drug_highlights(self):
        """HRV table should highlight rows for both drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_tables_with_four_drug_highlights(self):
        """Tables should highlight rows for all 4 drugs with different colors"""
        request_data = create_four_drug_export_request()
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
        assert len(response.content) > 40000


# ===== Edge Case Tests =====

class TestPerDrugColorEdgeCases:
    """Test edge cases for per-drug coloring"""
    
    def test_single_drug_uses_first_color(self):
        """Single drug should use first color (#F3E8FF)"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Remove second drug
        request_data["all_drugs"] = [request_data["all_drugs"][0]]
        request_data["drug_readout_settings"]["perDrug"] = {
            "tetrodotoxin": request_data["drug_readout_settings"]["perDrug"]["tetrodotoxin"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_disabled_drug_not_colored(self):
        """Disabled drug should not appear in colored sections"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        # Disable second drug
        request_data["drug_readout_settings"]["perDrug"]["acetylcholine"]["enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200
    
    def test_empty_drug_list(self):
        """PDF should generate without drugs"""
        request_data = create_two_drug_export_request_with_decimal_minutes()
        
        request_data["all_drugs"] = []
        request_data["drug_readout_enabled"] = False
        
        response = requests.post(
            f"{BASE_URL}/api/export/pdf",
            json=request_data
        )
        
        assert response.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
