import requests
import json
import sys
from datetime import datetime
import os
from pathlib import Path

class ElectroPhysiologyAPITester:
    def __init__(self, base_url="https://electro-beat-lab.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.session_id = None
        self.file_id = None
        self.test_results = []
        
        # Check for test file
        self.test_file_path = "/tmp/user_file.abf"
        if not os.path.exists(self.test_file_path):
            print(f"❌ Test file not found at {self.test_file_path}")
            sys.exit(1)

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, timeout=60):
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Accept': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, timeout=timeout)
                else:
                    headers['Content-Type'] = 'application/json'
                    response = requests.post(url, json=data, headers=headers, timeout=timeout)

            success = response.status_code == expected_status
            
            result = {
                'test_name': name,
                'endpoint': endpoint,
                'method': method,
                'expected_status': expected_status,
                'actual_status': response.status_code,
                'success': success,
                'response_size': len(response.content) if response.content else 0
            }
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.content:
                    try:
                        response_data = response.json()
                        result['response_preview'] = str(response_data)[:200]
                        return success, response_data
                    except:
                        return success, {"raw": response.content[:100]}
                return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json() if response.content else {}
                    print(f"   Error: {error_data}")
                    result['error'] = str(error_data)
                except:
                    result['error'] = f"Non-JSON response: {response.content[:200]}"
                
            self.test_results.append(result)
            return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            result = {
                'test_name': name,
                'endpoint': endpoint,
                'method': method,
                'expected_status': expected_status,
                'actual_status': 'Exception',
                'success': False,
                'error': str(e)
            }
            self.test_results.append(result)
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "/",
            200
        )
        
        if success and 'message' in response:
            print(f"   Message: {response['message']}")
        
        return success

    def test_upload_abf_file(self):
        """Test ABF file upload"""
        files = {'files': ('test_recording.abf', open(self.test_file_path, 'rb'), 'application/octet-stream')}
        
        success, response = self.run_test(
            "Upload ABF File",
            "POST",
            "/upload",
            200,
            files=files,
            timeout=120
        )
        
        if success:
            self.session_id = response.get('session_id')
            if response.get('files') and len(response['files']) > 0:
                self.file_id = response['files'][0].get('file_id')
                print(f"   Session ID: {self.session_id}")
                print(f"   File ID: {self.file_id}")
                print(f"   Files uploaded: {len(response['files'])}")
                print(f"   Beats detected: {response['files'][0].get('n_beats_detected', 0)}")
                print(f"   Duration: {response['files'][0].get('duration_sec', 0):.2f}s")
                print(f"   Sample rate: {response['files'][0].get('sample_rate', 0)}Hz")
        
        files['files'][1].close()  # Close file handle
        return success

    def test_detect_beats(self):
        """Test beat detection with custom parameters"""
        if not self.session_id or not self.file_id:
            print("❌ Skipping - No session or file ID from upload")
            return False
            
        success, response = self.run_test(
            "Detect Beats",
            "POST",
            "/detect-beats",
            200,
            data={
                "session_id": self.session_id,
                "file_id": self.file_id,
                "threshold": -10.0,
                "min_distance": 0.15,
                "prominence": 0.5,
                "invert": False
            }
        )
        
        if success:
            print(f"   Beats detected: {response.get('n_beats', 0)}")
        
        return success

    def test_compute_metrics(self):
        """Test beat metrics computation"""
        # Use sample beat times for testing
        sample_beat_times = [1.0, 2.1, 3.0, 4.2, 5.1, 6.0, 7.1, 8.0, 9.2, 10.0]
        
        success, response = self.run_test(
            "Compute Metrics",
            "POST",
            "/compute-metrics",
            200,
            data={"beat_times_sec": sample_beat_times}
        )
        
        if success:
            print(f"   Total beats: {response.get('n_total', 0)}")
            print(f"   Kept beats: {response.get('n_kept', 0)}")
            print(f"   Removed beats: {response.get('n_removed', 0)}")
        
        return success, response.get('filtered_beat_times_min', []), response.get('filtered_bf_bpm', [])

    def test_hrv_analysis(self, beat_times_min, bf_filtered):
        """Test HRV analysis"""
        if not beat_times_min or not bf_filtered:
            print("❌ Skipping HRV - No valid beat data")
            return False
        
        success, response = self.run_test(
            "HRV Analysis",
            "POST",
            "/hrv-analysis",
            200,
            data={
                "beat_times_min": beat_times_min,
                "bf_filtered": bf_filtered,
                "readout_minute": 5
            }
        )
        
        if success:
            print(f"   HRV windows: {len(response.get('windows', []))}")
            if response.get('readout'):
                print(f"   Readout ln(RMSSD70): {response['readout'].get('ln_rmssd70')}")
        
        return success

    def test_light_detect_decreasing(self):
        """Test light pulse detection with decreasing intervals"""
        success, response = self.run_test(
            "Light Pulse Detection (Decreasing Intervals 60→30→20→10)",
            "POST",
            "/light-detect",
            200,
            data={
                "start_time_sec": 180.0,
                "pulse_duration_sec": 20.0,
                "interval_sec": "decreasing",
                "n_pulses": 5,
                "auto_detect": False
            }
        )
        
        if success:
            pulses = response.get('pulses', [])
            print(f"   Pulses detected: {len(pulses)}")
            # Verify decreasing intervals
            if len(pulses) >= 2:
                intervals = []
                for i in range(len(pulses) - 1):
                    interval = pulses[i+1]['start_sec'] - pulses[i]['end_sec']
                    intervals.append(interval)
                print(f"   Intervals: {intervals}")
        
        return success, response.get('pulses', [])
    
    def test_light_auto_detect(self, beat_times_min, bf_filtered):
        """Test light auto-detect from BF increase"""
        if not beat_times_min or not bf_filtered:
            print("❌ Skipping Light Auto-detect - Missing beat data")
            return False
            
        success, response = self.run_test(
            "Light Auto-detect from BF increase",
            "POST",
            "/light-detect",
            200,
            data={
                "start_time_sec": 180.0,
                "pulse_duration_sec": 20.0,
                "interval_sec": "decreasing",
                "n_pulses": 5,
                "auto_detect": True,
                "beat_times_min": beat_times_min,
                "bf_filtered": bf_filtered,
                "search_range_sec": 20.0
            }
        )
        
        if success:
            detected_start = response.get('detected_start_sec')
            print(f"   Auto-detected start: {detected_start}s")
            print(f"   Pulses detected: {len(response.get('pulses', []))}")
        
        return success, response.get('pulses', [])

    def test_light_hrv(self, beat_times_min, bf_filtered, pulses):
        """Test light HRV analysis"""
        if not beat_times_min or not bf_filtered or not pulses:
            print("❌ Skipping Light HRV - Missing required data")
            return False
        
        success, response = self.run_test(
            "Light HRV Analysis",
            "POST",
            "/light-hrv",
            200,
            data={
                "beat_times_min": beat_times_min,
                "bf_filtered": bf_filtered,
                "pulses": pulses
            }
        )
        
        if success:
            print(f"   Light HRV computed for {len(response.get('per_pulse', []))} pulses")
        
        return success

    def test_light_response(self, beat_times_min, bf_filtered, pulses):
        """Test light response analysis"""
        if not beat_times_min or not bf_filtered or not pulses:
            print("❌ Skipping Light Response - Missing required data")
            return False
        
        success, response = self.run_test(
            "Light Response Analysis",
            "POST",
            "/light-response",
            200,
            data={
                "beat_times_min": beat_times_min,
                "bf_filtered": bf_filtered,
                "pulses": pulses
            }
        )
        
        if success:
            print(f"   Response metrics computed, baseline BF: {response.get('baseline_bf')}")
        
        return success

    def test_export_csv(self):
        """Test CSV export"""
        sample_data = {
            "per_beat_data": [
                {"time_min": 1.0, "bf_bpm": 60.0, "nn_ms": 1000.0, "status": "kept"},
                {"time_min": 2.0, "bf_bpm": 62.0, "nn_ms": 968.0, "status": "kept"}
            ],
            "filename": "test_export"
        }
        
        success, response = self.run_test(
            "Export CSV",
            "POST",
            "/export/csv",
            200,
            data=sample_data
        )
        
        return success

    def test_export_xlsx(self):
        """Test XLSX export"""
        sample_data = {
            "per_beat_data": [
                {"time_min": 1.0, "bf_bpm": 60.0, "nn_ms": 1000.0, "status": "kept"},
                {"time_min": 2.0, "bf_bpm": 62.0, "nn_ms": 968.0, "status": "kept"}
            ],
            "filename": "test_export"
        }
        
        success, response = self.run_test(
            "Export XLSX",
            "POST",
            "/export/xlsx",
            200,
            data=sample_data
        )
        
        return success

    def test_export_pdf(self):
        """Test PDF export"""
        sample_data = {
            "per_beat_data": [
                {"time_min": 1.0, "bf_bpm": 60.0, "nn_ms": 1000.0, "status": "kept"},
                {"time_min": 2.0, "bf_bpm": 62.0, "nn_ms": 968.0, "status": "kept"}
            ],
            "summary": {
                "Total Beats": 100,
                "Mean BF": 65.5,
                "Mean NN": 920.5
            },
            "filename": "test_export"
        }
        
        success, response = self.run_test(
            "Export PDF",
            "POST",
            "/export/pdf",
            200,
            data=sample_data
        )
        
        return success

def main():
    print("🚀 Starting Electrophysiology API Tests")
    print(f"⏰ Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    tester = ElectroPhysiologyAPITester()
    
    # Test sequence
    tests_to_run = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("File Upload", tester.test_upload_abf_file),
        ("Beat Detection", tester.test_detect_beats),
    ]
    
    # Run basic tests first
    beat_times_min = []
    bf_filtered = []
    pulses = []
    
    for test_name, test_func in tests_to_run:
        success = test_func()
        if not success:
            print(f"\n❌ Critical test '{test_name}' failed - stopping execution")
            break
    
    # Test compute metrics and get data for subsequent tests
    if tester.tests_passed >= 3:  # If basic tests pass
        success, beat_times_min, bf_filtered = tester.test_compute_metrics()
        
        if success:
            # Test HRV analysis
            tester.test_hrv_analysis(beat_times_min, bf_filtered)
            
            # Test light detection and get pulses
            light_success, pulses = tester.test_light_detect()
            
            if light_success:
                # Test light HRV and response
                tester.test_light_hrv(beat_times_min, bf_filtered, pulses)
                tester.test_light_response(beat_times_min, bf_filtered, pulses)
        
        # Test export endpoints
        tester.test_export_csv()
        tester.test_export_xlsx()
        tester.test_export_pdf()
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 Final Results:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    print(f"{'='*60}")
    
    # Detailed results
    print("\n📋 Detailed Test Results:")
    for result in tester.test_results:
        status = "✅ PASS" if result['success'] else "❌ FAIL"
        print(f"   {status} {result['test_name']} ({result['method']} {result['endpoint']})")
        if not result['success'] and 'error' in result:
            print(f"        Error: {result['error']}")
    
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())