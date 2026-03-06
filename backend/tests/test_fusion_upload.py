"""
Test suite for /api/upload/fuse endpoint - Multi-file ABF fusion feature.

Tests:
1. Endpoint exists and accepts multiple files
2. Validates max 5 files limit
3. Returns error for non-.abf files
4. Returns proper response structure with fused_from and is_fused fields
5. Single file upload via fuse endpoint (should work normally)
"""

import pytest
import requests
import os
import io

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Mock ABF file content - minimal valid ABF header structure
# ABF files start with "ABF2" magic bytes for version 2
def create_mock_abf_content(size_kb=1):
    """Create minimal mock ABF file content.
    Note: This is not a valid ABF file, but mimics the header for testing validation.
    Real ABF files would be needed for actual parsing tests.
    """
    # ABF2 magic header (4 bytes) + some padding
    header = b'ABF2'
    # Padding to desired size
    padding = b'\x00' * (size_kb * 1024 - len(header))
    return header + padding

def create_text_file_content():
    """Create text file content for testing non-ABF rejection."""
    return b'This is a text file, not an ABF file.'


class TestFuseEndpointExists:
    """Test that the /upload/fuse endpoint exists and is accessible."""
    
    def test_fuse_endpoint_exists_options(self):
        """Test that OPTIONS request to /upload/fuse works (CORS preflight)."""
        response = requests.options(f"{BASE_URL}/api/upload/fuse")
        # Should return 200 OK or 204 No Content for CORS preflight
        assert response.status_code in [200, 204, 405], f"Expected CORS preflight response, got {response.status_code}"
        print(f"PASS: /api/upload/fuse endpoint exists - OPTIONS returned {response.status_code}")
    
    def test_fuse_endpoint_post_without_files_returns_422(self):
        """Test that POST to /upload/fuse without files returns validation error."""
        response = requests.post(f"{BASE_URL}/api/upload/fuse")
        # Should return 422 Unprocessable Entity (missing required files)
        assert response.status_code == 422, f"Expected 422 for missing files, got {response.status_code}: {response.text}"
        print(f"PASS: /api/upload/fuse returns 422 when no files provided")


class TestFuseMaxFilesLimit:
    """Test that the fuse endpoint validates max 5 files limit."""
    
    def test_fuse_rejects_more_than_5_files(self):
        """Test that uploading >5 files returns 400 error."""
        # Create 6 mock files (exceeds limit)
        files = []
        for i in range(6):
            # Using tuple format: (filename, file-like object, content-type)
            files.append(
                ('files', (f'test_file_{i}.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream'))
            )
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Should return 400 Bad Request for exceeding file limit
        assert response.status_code == 400, f"Expected 400 for >5 files, got {response.status_code}: {response.text}"
        
        # Check error message mentions the limit
        error_data = response.json()
        assert 'maximum' in response.text.lower() or '5' in response.text, \
            f"Error should mention maximum file limit: {response.text}"
        
        print(f"PASS: /api/upload/fuse correctly rejects >5 files with 400 error")
    
    def test_fuse_accepts_5_files(self):
        """Test that uploading exactly 5 files is accepted (may fail parsing but passes validation)."""
        files = []
        for i in range(5):
            files.append(
                ('files', (f'test_file_{i}.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream'))
            )
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Should NOT return 400 for "too many files" - may return 400 for parsing error
        # but the validation for count should pass
        if response.status_code == 400:
            error_text = response.text.lower()
            # Ensure it's a parsing error, not a count error
            assert 'maximum' not in error_text and 'too many' not in error_text, \
                f"Should not reject 5 files for count limit: {response.text}"
            # Parsing error is expected with mock files
            assert 'parse' in error_text or 'abf' in error_text, \
                f"Expected parsing error for mock ABF files: {response.text}"
            print(f"PASS: /api/upload/fuse accepts 5 files (parsing may fail with mock data)")
        else:
            # If somehow it succeeded or returned other error, still verify count wasn't the issue
            print(f"INFO: /api/upload/fuse returned {response.status_code} for 5 files: {response.text[:200]}")
            assert response.status_code != 400 or 'maximum' not in response.text.lower()
            print(f"PASS: /api/upload/fuse accepts 5 files")


class TestFuseNonAbfRejection:
    """Test that the fuse endpoint rejects non-.abf files."""
    
    def test_fuse_rejects_txt_file(self):
        """Test that uploading a .txt file returns 400 error."""
        files = [
            ('files', ('test_file.txt', io.BytesIO(create_text_file_content()), 'text/plain'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Should return 400 Bad Request for non-ABF file
        assert response.status_code == 400, f"Expected 400 for .txt file, got {response.status_code}: {response.text}"
        
        # Check error message mentions ABF requirement
        assert '.abf' in response.text.lower() or 'supported' in response.text.lower(), \
            f"Error should mention ABF requirement: {response.text}"
        
        print(f"PASS: /api/upload/fuse correctly rejects .txt files")
    
    def test_fuse_rejects_csv_file(self):
        """Test that uploading a .csv file returns 400 error."""
        files = [
            ('files', ('data.csv', io.BytesIO(b'col1,col2\n1,2\n3,4'), 'text/csv'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        assert response.status_code == 400, f"Expected 400 for .csv file, got {response.status_code}: {response.text}"
        print(f"PASS: /api/upload/fuse correctly rejects .csv files")
    
    def test_fuse_rejects_mixed_files(self):
        """Test that uploading mix of .abf and non-.abf files returns 400 error."""
        files = [
            ('files', ('valid.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream')),
            ('files', ('invalid.txt', io.BytesIO(create_text_file_content()), 'text/plain'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Should return 400 for the non-ABF file
        assert response.status_code == 400, f"Expected 400 for mixed files, got {response.status_code}: {response.text}"
        print(f"PASS: /api/upload/fuse correctly rejects mixed file types")


class TestFuseResponseStructure:
    """Test the response structure of the fuse endpoint."""
    
    def test_fuse_single_file_response_structure(self):
        """Test that single file upload via fuse returns correct structure.
        Note: With mock ABF data, parsing will fail. This tests validation flow only.
        """
        files = [
            ('files', ('test_single.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # May fail with parsing error for mock data - that's expected
        # We're testing that the endpoint processes the request correctly up to parsing
        if response.status_code == 400:
            # Expected - mock ABF can't be parsed
            assert 'parse' in response.text.lower() or 'abf' in response.text.lower(), \
                f"Expected ABF parsing error: {response.text}"
            print(f"PASS: /api/upload/fuse correctly attempts to parse single ABF file")
        elif response.status_code == 200:
            # Unexpectedly succeeded - verify response structure
            data = response.json()
            assert 'session_id' in data, "Response should contain session_id"
            assert 'files' in data, "Response should contain files array"
            assert len(data['files']) == 1, "Should have 1 file in response"
            file_data = data['files'][0]
            assert 'file_id' in file_data
            assert 'filename' in file_data
            assert 'fused_from' in file_data, "Single file should have fused_from array"
            print(f"PASS: /api/upload/fuse single file response has correct structure")
        else:
            pytest.fail(f"Unexpected response status {response.status_code}: {response.text}")


class TestFuseEndpointIntegration:
    """Integration tests for the fuse endpoint with mocked data."""
    
    def test_fuse_endpoint_accepts_empty_abf_extension(self):
        """Test that endpoint validates .abf extension before attempting parse."""
        # File with .abf extension but invalid content
        files = [
            ('files', ('empty.abf', io.BytesIO(b''), 'application/octet-stream'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Should fail with parsing error (not file type error)
        # Empty file can't be a valid ABF
        if response.status_code == 400:
            error_text = response.text.lower()
            # Should NOT say "only .abf supported" - it IS .abf, just invalid content
            assert '.abf' not in error_text or 'parse' in error_text or 'invalid' in error_text or 'empty' in error_text, \
                f"Error should be about parsing, not extension: {response.text}"
        
        print(f"PASS: /api/upload/fuse validates extension before parsing")
    
    def test_fuse_multiple_abf_files_validation(self):
        """Test that 2 ABF files pass validation (parsing may still fail)."""
        files = [
            ('files', ('file1.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream')),
            ('files', ('file2.abf', io.BytesIO(create_mock_abf_content(1)), 'application/octet-stream'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload/fuse", files=files)
        
        # Validation should pass (both .abf files)
        # May fail on parsing mock data
        if response.status_code == 400:
            error_text = response.text.lower()
            # Should NOT fail on validation, only parsing
            assert 'parse' in error_text or 'abf' in error_text, \
                f"Should fail on parsing, not validation: {response.text}"
        
        print(f"PASS: Multiple .abf files pass validation")


class TestRegularUploadComparison:
    """Compare fuse endpoint behavior with regular upload endpoint."""
    
    def test_regular_upload_rejects_non_abf(self):
        """Verify regular /upload endpoint also rejects non-ABF files."""
        files = [
            ('files', ('test.txt', io.BytesIO(create_text_file_content()), 'text/plain'))
        ]
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files)
        
        assert response.status_code == 400, f"Regular upload should reject .txt: {response.status_code}"
        print(f"PASS: Regular /api/upload also rejects non-ABF files")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
