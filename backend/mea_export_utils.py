"""
MEA Export Utilities
====================
Export functionality for MEA (Multi-Electrode Array) analysis data.
Supports CSV, Excel (XLSX), and PDF report generation.
"""

import io
import zipfile
import numpy as np
from datetime import datetime
from typing import Dict, List, Any, Optional
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Try to import openpyxl for Excel support
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def safe_float(value, default=0.0):
    """Safely convert a value to float."""
    try:
        if value is None:
            return default
        return float(value)
    except (ValueError, TypeError):
        return default


def format_duration(seconds):
    """Format seconds as 'Xm Ys'."""
    if not seconds:
        return "—"
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}m {secs}s"


def compute_window_mean(bins, key, start_sec, end_sec):
    """Compute mean of a key within a time window."""
    if not bins:
        return None
    values = [b.get(key, 0) for b in bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
    return np.mean(values) if values else None


# =============================================================================
# CSV EXPORT
# =============================================================================

def generate_mea_csv_export(analysis_state: Dict, well_analysis: Dict) -> bytes:
    """Generate a ZIP file containing multiple CSV files for MEA data export."""
    
    # Create in-memory ZIP file
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 1. Summary CSV
        summary_csv = generate_summary_csv(analysis_state, well_analysis)
        zf.writestr('summary.csv', summary_csv)
        
        # 2. Spontaneous Spike CSV (per-minute)
        spike_csv = generate_spontaneous_spike_csv(analysis_state, well_analysis)
        zf.writestr('spontaneous_spike.csv', spike_csv)
        
        # 3. Spontaneous Burst CSV (per-minute)
        burst_csv = generate_spontaneous_burst_csv(analysis_state, well_analysis)
        zf.writestr('spontaneous_burst.csv', burst_csv)
        
        # 4. Light Spike CSV (if available)
        if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
            light_spike_csv = generate_light_spike_csv(analysis_state, well_analysis)
            zf.writestr('light_spike.csv', light_spike_csv)
        
        # 5. Light Burst CSV (if available)
        if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
            light_burst_csv = generate_light_burst_csv(analysis_state, well_analysis)
            zf.writestr('light_burst.csv', light_burst_csv)
    
    zip_buffer.seek(0)
    return zip_buffer.getvalue()


def generate_summary_csv(analysis_state: Dict, well_analysis: Dict) -> str:
    """Generate summary CSV content."""
    lines = []
    
    # Recording Info
    lines.append("Recording Information")
    lines.append(f"Recording Name,{analysis_state.get('recordingName', 'Untitled')}")
    lines.append(f"Well ID,{analysis_state.get('selectedWell', 'N/A')}")
    lines.append(f"Recording Date,{analysis_state.get('recordingDate', '')}")
    
    # Original Files
    source_files = analysis_state.get('source_files', {})
    if source_files:
        lines.append("")
        lines.append("Original CSV Files")
        for key, filename in source_files.items():
            lines.append(f"{key},{filename}")
    
    # Spike/Burst Stats
    lines.append("")
    lines.append("Spike and Burst Statistics")
    spikes = analysis_state.get('spikes', [])
    bursts = analysis_state.get('electrode_bursts', []) or analysis_state.get('bursts', [])
    lines.append(f"Total Spikes,{len(spikes)}")
    lines.append(f"Total Bursts,{len(bursts)}")
    lines.append(f"Active Electrodes,{len(analysis_state.get('active_electrodes', []))}")
    lines.append(f"Duration (s),{analysis_state.get('duration_s', 0)}")
    
    # Binning Settings
    well_params = analysis_state.get('wellParams', {})
    selected_well = analysis_state.get('selectedWell', '')
    spike_bin = well_params.get(selected_well, {}).get('spikeBinS', 10)
    burst_bin = well_params.get(selected_well, {}).get('burstBinS', 60)
    lines.append("")
    lines.append("Binning Settings")
    lines.append(f"Spike Bin Size (s),{spike_bin}")
    lines.append(f"Burst Bin Size (s),{burst_bin}")
    
    # Baseline Metrics
    if analysis_state.get('baselineEnabled'):
        lines.append("")
        lines.append("Baseline Metrics")
        lines.append(f"Baseline Minute,{analysis_state.get('baselineMinute', 1)}")
        if well_analysis:
            lines.append(f"Baseline Spike Rate (Hz),{safe_float(well_analysis.get('baselineSpikeHz'), 0):.4f}")
            lines.append(f"Baseline Burst Rate (bpm),{safe_float(well_analysis.get('baselineBurstBpm'), 0):.4f}")
    
    # Drug Metrics
    if analysis_state.get('drugEnabled') and analysis_state.get('selectedDrugs'):
        lines.append("")
        lines.append("Drug Metrics")
        lines.append(f"Drug(s),{','.join(analysis_state.get('selectedDrugs', []))}")
        lines.append(f"Perfusion Time (min),{analysis_state.get('drugPerfTime', 3)}")
        lines.append(f"Readout Minute,{analysis_state.get('drugReadoutMinute', 5)}")
        if well_analysis:
            lines.append(f"Drug Spike Rate (Hz),{safe_float(well_analysis.get('drugSpikeHz'), 0):.4f}")
            lines.append(f"Drug Burst Rate (bpm),{safe_float(well_analysis.get('drugBurstBpm'), 0):.4f}")
    
    # Light Metrics
    if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
        lines.append("")
        lines.append("Light Stimulus Info")
        lines.append(f"Number of Stims,{len(analysis_state.get('lightPulses', []))}")
    
    return '\n'.join(lines)


def generate_spontaneous_spike_csv(analysis_state: Dict, well_analysis: Dict) -> str:
    """Generate spontaneous spike per-minute CSV."""
    lines = []
    
    # Header
    lines.append("Minute,Spike Rate (Hz),Spike Count,Normalized to Baseline (%)")
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    
    for pm in per_minute:
        minute = pm.get('minute', 0)
        spike_rate = safe_float(pm.get('spike_rate_hz'), 0)
        spike_count = pm.get('spike_count', 0)
        normalized = (spike_rate / baseline_spike * 100) if baseline_spike > 0 else 0
        lines.append(f"{minute},{spike_rate:.4f},{spike_count},{normalized:.1f}")
    
    return '\n'.join(lines)


def generate_spontaneous_burst_csv(analysis_state: Dict, well_analysis: Dict) -> str:
    """Generate spontaneous burst per-minute CSV."""
    lines = []
    
    # Header
    lines.append("Minute,Burst Rate (bpm),Burst Count,Normalized to Baseline (%)")
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    
    for pm in per_minute:
        minute = pm.get('minute', 0)
        burst_rate = safe_float(pm.get('burst_rate_bpm'), 0)
        burst_count = pm.get('burst_count', 0)
        normalized = (burst_rate / baseline_burst * 100) if baseline_burst > 0 else 0
        lines.append(f"{minute},{burst_rate:.4f},{burst_count},{normalized:.1f}")
    
    return '\n'.join(lines)


def generate_light_spike_csv(analysis_state: Dict, well_analysis: Dict) -> str:
    """Generate light stimulus spike CSV."""
    lines = []
    
    # Header
    lines.append("Stim,Start (s),End (s),Baseline Spike (Hz),Avg Spike (Hz),Max Spike (Hz),Spike Delta (%),Peak Spike Delta (%),Time to Peak (s)")
    
    light_pulses = analysis_state.get('lightPulses', [])
    spike_bins = well_analysis.get('spikeRateBins', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    
    stim_metrics = []
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        # Compute metrics for this stim window
        window_spikes = [b.get('spike_rate_hz', 0) for b in spike_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_spike = np.mean(window_spikes) if window_spikes else 0
        max_spike = max(window_spikes) if window_spikes else 0
        delta_pct = ((avg_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        peak_delta_pct = ((max_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        
        # Time to peak (relative to stim start)
        if window_spikes:
            peak_idx = window_spikes.index(max(window_spikes))
            matching_bins = [b for b in spike_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            if matching_bins and peak_idx < len(matching_bins):
                ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec
            else:
                ttp = 0
        else:
            ttp = 0
        
        stim_metrics.append({
            'baseline': baseline_spike,
            'avg': avg_spike,
            'max': max_spike,
            'delta': delta_pct,
            'peak_delta': peak_delta_pct,
            'ttp': ttp
        })
        
        lines.append(f"Stim {i+1},{start_sec:.1f},{end_sec:.1f},{baseline_spike:.4f},{avg_spike:.4f},{max_spike:.4f},{delta_pct:.1f},{peak_delta_pct:.1f},{ttp:.1f}")
    
    # Average row
    if stim_metrics:
        avg_baseline = np.mean([m['baseline'] for m in stim_metrics])
        avg_avg = np.mean([m['avg'] for m in stim_metrics])
        avg_max = np.mean([m['max'] for m in stim_metrics])
        avg_delta = np.mean([m['delta'] for m in stim_metrics])
        avg_peak = np.mean([m['peak_delta'] for m in stim_metrics])
        avg_ttp = np.mean([m['ttp'] for m in stim_metrics])
        lines.append(f"Average,—,—,{avg_baseline:.4f},{avg_avg:.4f},{avg_max:.4f},{avg_delta:.1f},{avg_peak:.1f},{avg_ttp:.1f}")
    
    return '\n'.join(lines)


def generate_light_burst_csv(analysis_state: Dict, well_analysis: Dict) -> str:
    """Generate light stimulus burst CSV."""
    lines = []
    
    # Header
    lines.append("Stim,Start (s),End (s),Baseline Burst (bpm),Avg Burst (bpm),Max Burst (bpm),Burst Delta (%),Peak Burst Delta (%),Time to Peak (s)")
    
    light_pulses = analysis_state.get('lightPulses', [])
    burst_bins = well_analysis.get('burstRateBins', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    
    stim_metrics = []
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        # Compute metrics for this stim window
        window_bursts = [b.get('burst_rate_bpm', 0) for b in burst_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_burst = np.mean(window_bursts) if window_bursts else 0
        max_burst = max(window_bursts) if window_bursts else 0
        delta_pct = ((avg_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        peak_delta_pct = ((max_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        
        # Time to peak
        if window_bursts:
            peak_idx = window_bursts.index(max(window_bursts))
            matching_bins = [b for b in burst_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            if matching_bins and peak_idx < len(matching_bins):
                ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec
            else:
                ttp = 0
        else:
            ttp = 0
        
        stim_metrics.append({
            'baseline': baseline_burst,
            'avg': avg_burst,
            'max': max_burst,
            'delta': delta_pct,
            'peak_delta': peak_delta_pct,
            'ttp': ttp
        })
        
        lines.append(f"Stim {i+1},{start_sec:.1f},{end_sec:.1f},{baseline_burst:.4f},{avg_burst:.4f},{max_burst:.4f},{delta_pct:.1f},{peak_delta_pct:.1f},{ttp:.1f}")
    
    # Average row
    if stim_metrics:
        avg_baseline = np.mean([m['baseline'] for m in stim_metrics])
        avg_avg = np.mean([m['avg'] for m in stim_metrics])
        avg_max = np.mean([m['max'] for m in stim_metrics])
        avg_delta = np.mean([m['delta'] for m in stim_metrics])
        avg_peak = np.mean([m['peak_delta'] for m in stim_metrics])
        avg_ttp = np.mean([m['ttp'] for m in stim_metrics])
        lines.append(f"Average,—,—,{avg_baseline:.4f},{avg_avg:.4f},{avg_max:.4f},{avg_delta:.1f},{avg_peak:.1f},{avg_ttp:.1f}")
    
    return '\n'.join(lines)


# =============================================================================
# EXCEL EXPORT
# =============================================================================

def generate_mea_xlsx_export(analysis_state: Dict, well_analysis: Dict) -> bytes:
    """Generate an Excel workbook with multiple sheets for MEA data export."""
    
    if not OPENPYXL_AVAILABLE:
        raise ImportError("openpyxl is required for Excel export")
    
    wb = Workbook()
    
    # Define styles
    header_font = Font(bold=True, size=11)
    header_fill = PatternFill(start_color="E0E0E0", end_color="E0E0E0", fill_type="solid")
    baseline_fill = PatternFill(start_color="E3F2FD", end_color="E3F2FD", fill_type="solid")  # Light blue
    drug_fill = PatternFill(start_color="F3E5F5", end_color="F3E5F5", fill_type="solid")  # Light purple
    amber_fill = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")  # Amber
    red_fill = PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid")  # Red (average row)
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # 1. Summary Sheet
    ws_summary = wb.active
    ws_summary.title = "Summary"
    create_summary_sheet(ws_summary, analysis_state, well_analysis, header_font, header_fill, thin_border)
    
    # 2. Spontaneous Spike Sheet
    ws_spike = wb.create_sheet("Spontaneous Spike")
    create_spontaneous_spike_sheet(ws_spike, analysis_state, well_analysis, 
                                   header_font, header_fill, baseline_fill, drug_fill, thin_border)
    
    # 3. Spontaneous Burst Sheet
    ws_burst = wb.create_sheet("Spontaneous Burst")
    create_spontaneous_burst_sheet(ws_burst, analysis_state, well_analysis,
                                   header_font, header_fill, baseline_fill, drug_fill, thin_border)
    
    # 4. Light Spike Sheet (if applicable)
    if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
        ws_light_spike = wb.create_sheet("Light Spike")
        create_light_spike_sheet(ws_light_spike, analysis_state, well_analysis,
                                 header_font, header_fill, baseline_fill, amber_fill, red_fill, thin_border)
    
    # 5. Light Burst Sheet (if applicable)
    if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
        ws_light_burst = wb.create_sheet("Light Burst")
        create_light_burst_sheet(ws_light_burst, analysis_state, well_analysis,
                                 header_font, header_fill, baseline_fill, amber_fill, red_fill, thin_border)
    
    # Save to bytes
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()


def create_summary_sheet(ws, analysis_state: Dict, well_analysis: Dict, 
                        header_font, header_fill, thin_border):
    """Create the summary sheet."""
    row = 1
    
    # Title
    ws.cell(row=row, column=1, value="MEA Analysis Summary").font = Font(bold=True, size=14)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    row += 2
    
    # Recording Info
    ws.cell(row=row, column=1, value="Recording Information").font = header_font
    ws.cell(row=row, column=1).fill = header_fill
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    row += 1
    
    info_items = [
        ("Recording Name", analysis_state.get('recordingName', 'Untitled')),
        ("Well ID", analysis_state.get('selectedWell', 'N/A')),
        ("Recording Date", analysis_state.get('recordingDate', '')),
    ]
    for label, value in info_items:
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=value)
        row += 1
    
    # Original Files
    source_files = analysis_state.get('source_files', {})
    if source_files:
        row += 1
        ws.cell(row=row, column=1, value="Original CSV Files").font = header_font
        ws.cell(row=row, column=1).fill = header_fill
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        row += 1
        for key, filename in source_files.items():
            ws.cell(row=row, column=1, value=key)
            ws.cell(row=row, column=2, value=filename)
            row += 1
    
    # Spike/Burst Stats
    row += 1
    ws.cell(row=row, column=1, value="Spike and Burst Statistics").font = header_font
    ws.cell(row=row, column=1).fill = header_fill
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    row += 1
    
    spikes = analysis_state.get('spikes', [])
    bursts = analysis_state.get('electrode_bursts', []) or analysis_state.get('bursts', [])
    stats = [
        ("Total Spikes", len(spikes)),
        ("Total Bursts", len(bursts)),
        ("Active Electrodes", len(analysis_state.get('active_electrodes', []))),
        ("Duration (s)", analysis_state.get('duration_s', 0)),
    ]
    for label, value in stats:
        ws.cell(row=row, column=1, value=label)
        ws.cell(row=row, column=2, value=value)
        row += 1
    
    # Binning Settings
    row += 1
    ws.cell(row=row, column=1, value="Binning Settings").font = header_font
    ws.cell(row=row, column=1).fill = header_fill
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
    row += 1
    
    well_params = analysis_state.get('wellParams', {})
    selected_well = analysis_state.get('selectedWell', '')
    spike_bin = well_params.get(selected_well, {}).get('spikeBinS', 10)
    burst_bin = well_params.get(selected_well, {}).get('burstBinS', 60)
    ws.cell(row=row, column=1, value="Spike Bin Size (s)")
    ws.cell(row=row, column=2, value=spike_bin)
    row += 1
    ws.cell(row=row, column=1, value="Burst Bin Size (s)")
    ws.cell(row=row, column=2, value=burst_bin)
    row += 1
    
    # Baseline Metrics
    if analysis_state.get('baselineEnabled') and well_analysis:
        row += 1
        ws.cell(row=row, column=1, value="Baseline Metrics").font = header_font
        ws.cell(row=row, column=1).fill = PatternFill(start_color="E3F2FD", end_color="E3F2FD", fill_type="solid")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        row += 1
        ws.cell(row=row, column=1, value="Baseline Minute")
        ws.cell(row=row, column=2, value=analysis_state.get('baselineMinute', 1))
        row += 1
        ws.cell(row=row, column=1, value="Baseline Spike Rate (Hz)")
        ws.cell(row=row, column=2, value=round(safe_float(well_analysis.get('baselineSpikeHz'), 0), 4))
        row += 1
        ws.cell(row=row, column=1, value="Baseline Burst Rate (bpm)")
        ws.cell(row=row, column=2, value=round(safe_float(well_analysis.get('baselineBurstBpm'), 0), 4))
        row += 1
    
    # Drug Metrics
    if analysis_state.get('drugEnabled') and analysis_state.get('selectedDrugs') and well_analysis:
        row += 1
        ws.cell(row=row, column=1, value="Drug Metrics").font = header_font
        ws.cell(row=row, column=1).fill = PatternFill(start_color="F3E5F5", end_color="F3E5F5", fill_type="solid")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        row += 1
        ws.cell(row=row, column=1, value="Drug(s)")
        ws.cell(row=row, column=2, value=', '.join(analysis_state.get('selectedDrugs', [])))
        row += 1
        ws.cell(row=row, column=1, value="Perfusion Time (min)")
        ws.cell(row=row, column=2, value=analysis_state.get('drugPerfTime', 3))
        row += 1
        ws.cell(row=row, column=1, value="Readout Minute")
        ws.cell(row=row, column=2, value=analysis_state.get('drugReadoutMinute', 5))
        row += 1
        ws.cell(row=row, column=1, value="Drug Spike Rate (Hz)")
        ws.cell(row=row, column=2, value=round(safe_float(well_analysis.get('drugSpikeHz'), 0), 4))
        row += 1
        ws.cell(row=row, column=1, value="Drug Burst Rate (bpm)")
        ws.cell(row=row, column=2, value=round(safe_float(well_analysis.get('drugBurstBpm'), 0), 4))
        row += 1
    
    # Light Metrics
    if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
        row += 1
        ws.cell(row=row, column=1, value="Light Stimulus Info").font = header_font
        ws.cell(row=row, column=1).fill = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        row += 1
        ws.cell(row=row, column=1, value="Number of Stims")
        ws.cell(row=row, column=2, value=len(analysis_state.get('lightPulses', [])))
        row += 1
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 40


def create_spontaneous_spike_sheet(ws, analysis_state: Dict, well_analysis: Dict,
                                   header_font, header_fill, baseline_fill, drug_fill, thin_border):
    """Create spontaneous spike sheet."""
    headers = ["Minute", "Spike Rate (Hz)", "Spike Count", "Normalized (%)"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    baseline_minute = analysis_state.get('baselineMinute', 1)
    drug_readout = analysis_state.get('drugPerfTime', 3) + analysis_state.get('drugReadoutMinute', 5) if analysis_state.get('drugEnabled') else None
    
    for row_num, pm in enumerate(per_minute, 2):
        minute = pm.get('minute', 0)
        spike_rate = safe_float(pm.get('spike_rate_hz'), 0)
        spike_count = pm.get('spike_count', 0)
        normalized = (spike_rate / baseline_spike * 100) if baseline_spike > 0 else 0
        
        ws.cell(row=row_num, column=1, value=minute).border = thin_border
        ws.cell(row=row_num, column=2, value=round(spike_rate, 4)).border = thin_border
        ws.cell(row=row_num, column=3, value=spike_count).border = thin_border
        ws.cell(row=row_num, column=4, value=round(normalized, 1)).border = thin_border
        
        # Highlight baseline row
        if minute == baseline_minute:
            for col in range(1, 5):
                ws.cell(row=row_num, column=col).fill = baseline_fill
        # Highlight drug row
        elif drug_readout and minute == drug_readout:
            for col in range(1, 5):
                ws.cell(row=row_num, column=col).fill = drug_fill
    
    # Adjust column widths
    for col in range(1, 5):
        ws.column_dimensions[get_column_letter(col)].width = 18


def create_spontaneous_burst_sheet(ws, analysis_state: Dict, well_analysis: Dict,
                                   header_font, header_fill, baseline_fill, drug_fill, thin_border):
    """Create spontaneous burst sheet."""
    headers = ["Minute", "Burst Rate (bpm)", "Burst Count", "Normalized (%)"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    baseline_minute = analysis_state.get('baselineMinute', 1)
    drug_readout = analysis_state.get('drugPerfTime', 3) + analysis_state.get('drugReadoutMinute', 5) if analysis_state.get('drugEnabled') else None
    
    for row_num, pm in enumerate(per_minute, 2):
        minute = pm.get('minute', 0)
        burst_rate = safe_float(pm.get('burst_rate_bpm'), 0)
        burst_count = pm.get('burst_count', 0)
        normalized = (burst_rate / baseline_burst * 100) if baseline_burst > 0 else 0
        
        ws.cell(row=row_num, column=1, value=minute).border = thin_border
        ws.cell(row=row_num, column=2, value=round(burst_rate, 4)).border = thin_border
        ws.cell(row=row_num, column=3, value=burst_count).border = thin_border
        ws.cell(row=row_num, column=4, value=round(normalized, 1)).border = thin_border
        
        # Highlight baseline row
        if minute == baseline_minute:
            for col in range(1, 5):
                ws.cell(row=row_num, column=col).fill = baseline_fill
        # Highlight drug row
        elif drug_readout and minute == drug_readout:
            for col in range(1, 5):
                ws.cell(row=row_num, column=col).fill = drug_fill
    
    # Adjust column widths
    for col in range(1, 5):
        ws.column_dimensions[get_column_letter(col)].width = 18


def create_light_spike_sheet(ws, analysis_state: Dict, well_analysis: Dict,
                             header_font, header_fill, baseline_fill, amber_fill, red_fill, thin_border):
    """Create light spike sheet."""
    headers = ["Stim", "Start (s)", "End (s)", "Baseline Spike (Hz)", "Avg Spike (Hz)", 
               "Max Spike (Hz)", "Spike Δ%", "Peak Spike Δ%", "Time to Peak (s)"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
        # Baseline column gets blue fill
        if col == 4:
            cell.fill = baseline_fill
        # Metric columns get amber fill
        elif col >= 5:
            cell.fill = amber_fill
    
    light_pulses = analysis_state.get('lightPulses', [])
    spike_bins = well_analysis.get('spikeRateBins', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    
    stim_metrics = []
    row_num = 2
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        window_spikes = [b.get('spike_rate_hz', 0) for b in spike_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_spike = np.mean(window_spikes) if window_spikes else 0
        max_spike = max(window_spikes) if window_spikes else 0
        delta_pct = ((avg_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        peak_delta_pct = ((max_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        
        if window_spikes:
            peak_idx = window_spikes.index(max(window_spikes))
            matching_bins = [b for b in spike_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec if matching_bins and peak_idx < len(matching_bins) else 0
        else:
            ttp = 0
        
        stim_metrics.append({'baseline': baseline_spike, 'avg': avg_spike, 'max': max_spike, 
                            'delta': delta_pct, 'peak_delta': peak_delta_pct, 'ttp': ttp})
        
        ws.cell(row=row_num, column=1, value=f"Stim {i+1}").border = thin_border
        ws.cell(row=row_num, column=2, value=round(start_sec, 1)).border = thin_border
        ws.cell(row=row_num, column=3, value=round(end_sec, 1)).border = thin_border
        ws.cell(row=row_num, column=4, value=round(baseline_spike, 4)).border = thin_border
        ws.cell(row=row_num, column=4).fill = baseline_fill
        ws.cell(row=row_num, column=5, value=round(avg_spike, 4)).border = thin_border
        ws.cell(row=row_num, column=6, value=round(max_spike, 4)).border = thin_border
        ws.cell(row=row_num, column=7, value=round(delta_pct, 1)).border = thin_border
        ws.cell(row=row_num, column=8, value=round(peak_delta_pct, 1)).border = thin_border
        ws.cell(row=row_num, column=9, value=round(ttp, 1)).border = thin_border
        row_num += 1
    
    # Average row
    if stim_metrics:
        ws.cell(row=row_num, column=1, value="Average").border = thin_border
        ws.cell(row=row_num, column=2, value="—").border = thin_border
        ws.cell(row=row_num, column=3, value="—").border = thin_border
        ws.cell(row=row_num, column=4, value=round(np.mean([m['baseline'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=5, value=round(np.mean([m['avg'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=6, value=round(np.mean([m['max'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=7, value=round(np.mean([m['delta'] for m in stim_metrics]), 1)).border = thin_border
        ws.cell(row=row_num, column=8, value=round(np.mean([m['peak_delta'] for m in stim_metrics]), 1)).border = thin_border
        ws.cell(row=row_num, column=9, value=round(np.mean([m['ttp'] for m in stim_metrics]), 1)).border = thin_border
        # Highlight average row in red
        for col in range(1, 10):
            ws.cell(row=row_num, column=col).fill = red_fill
    
    # Adjust column widths
    widths = [10, 12, 12, 18, 16, 16, 12, 16, 16]
    for col, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


def create_light_burst_sheet(ws, analysis_state: Dict, well_analysis: Dict,
                             header_font, header_fill, baseline_fill, amber_fill, red_fill, thin_border):
    """Create light burst sheet."""
    headers = ["Stim", "Start (s)", "End (s)", "Baseline Burst (bpm)", "Avg Burst (bpm)", 
               "Max Burst (bpm)", "Burst Δ%", "Peak Burst Δ%", "Time to Peak (s)"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border
        if col == 4:
            cell.fill = baseline_fill
        elif col >= 5:
            cell.fill = amber_fill
    
    light_pulses = analysis_state.get('lightPulses', [])
    burst_bins = well_analysis.get('burstRateBins', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    
    stim_metrics = []
    row_num = 2
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        window_bursts = [b.get('burst_rate_bpm', 0) for b in burst_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_burst = np.mean(window_bursts) if window_bursts else 0
        max_burst = max(window_bursts) if window_bursts else 0
        delta_pct = ((avg_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        peak_delta_pct = ((max_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        
        if window_bursts:
            peak_idx = window_bursts.index(max(window_bursts))
            matching_bins = [b for b in burst_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec if matching_bins and peak_idx < len(matching_bins) else 0
        else:
            ttp = 0
        
        stim_metrics.append({'baseline': baseline_burst, 'avg': avg_burst, 'max': max_burst,
                            'delta': delta_pct, 'peak_delta': peak_delta_pct, 'ttp': ttp})
        
        ws.cell(row=row_num, column=1, value=f"Stim {i+1}").border = thin_border
        ws.cell(row=row_num, column=2, value=round(start_sec, 1)).border = thin_border
        ws.cell(row=row_num, column=3, value=round(end_sec, 1)).border = thin_border
        ws.cell(row=row_num, column=4, value=round(baseline_burst, 4)).border = thin_border
        ws.cell(row=row_num, column=4).fill = baseline_fill
        ws.cell(row=row_num, column=5, value=round(avg_burst, 4)).border = thin_border
        ws.cell(row=row_num, column=6, value=round(max_burst, 4)).border = thin_border
        ws.cell(row=row_num, column=7, value=round(delta_pct, 1)).border = thin_border
        ws.cell(row=row_num, column=8, value=round(peak_delta_pct, 1)).border = thin_border
        ws.cell(row=row_num, column=9, value=round(ttp, 1)).border = thin_border
        row_num += 1
    
    # Average row
    if stim_metrics:
        ws.cell(row=row_num, column=1, value="Average").border = thin_border
        ws.cell(row=row_num, column=2, value="—").border = thin_border
        ws.cell(row=row_num, column=3, value="—").border = thin_border
        ws.cell(row=row_num, column=4, value=round(np.mean([m['baseline'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=5, value=round(np.mean([m['avg'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=6, value=round(np.mean([m['max'] for m in stim_metrics]), 4)).border = thin_border
        ws.cell(row=row_num, column=7, value=round(np.mean([m['delta'] for m in stim_metrics]), 1)).border = thin_border
        ws.cell(row=row_num, column=8, value=round(np.mean([m['peak_delta'] for m in stim_metrics]), 1)).border = thin_border
        ws.cell(row=row_num, column=9, value=round(np.mean([m['ttp'] for m in stim_metrics]), 1)).border = thin_border
        for col in range(1, 10):
            ws.cell(row=row_num, column=col).fill = red_fill
    
    widths = [10, 12, 12, 20, 18, 18, 12, 16, 16]
    for col, width in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(col)].width = width


# =============================================================================
# PDF EXPORT
# =============================================================================

def generate_mea_pdf_export(analysis_state: Dict, well_analysis: Dict) -> bytes:
    """Generate a PDF report for MEA data."""
    
    buffer = io.BytesIO()
    
    # Use matplotlib for graphs
    with PdfPages(buffer) as pdf:
        # Page 1: Summary
        create_pdf_summary_page(pdf, analysis_state, well_analysis)
        
        # Page 2: Spike Evolution
        create_pdf_spike_evolution_page(pdf, analysis_state, well_analysis)
        
        # Page 3: Burst Evolution
        create_pdf_burst_evolution_page(pdf, analysis_state, well_analysis)
        
        # Page 4: Spontaneous Spike Table
        create_pdf_spontaneous_spike_table(pdf, analysis_state, well_analysis)
        
        # Page 5: Spontaneous Burst Table
        create_pdf_spontaneous_burst_table(pdf, analysis_state, well_analysis)
        
        # Page 6: Light Spike Table (if applicable)
        if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
            create_pdf_light_spike_table(pdf, analysis_state, well_analysis)
        
        # Page 7: Light Burst Table (if applicable)
        if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
            create_pdf_light_burst_table(pdf, analysis_state, well_analysis)
    
    buffer.seek(0)
    return buffer.getvalue()


def create_pdf_summary_page(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create PDF summary page."""
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    
    # Title
    fig.suptitle('MEA Analysis Summary', fontsize=16, fontweight='bold', y=0.96)
    
    # Build summary text
    lines = []
    
    # Recording Info
    lines.append("RECORDING INFORMATION")
    lines.append(f"Recording Name: {analysis_state.get('recordingName', 'Untitled')}")
    lines.append(f"Well ID: {analysis_state.get('selectedWell', 'N/A')}")
    if analysis_state.get('recordingDate'):
        lines.append(f"Recording Date: {analysis_state.get('recordingDate')}")
    lines.append("")
    
    # Original Files
    source_files = analysis_state.get('source_files', {})
    if source_files:
        lines.append("ORIGINAL CSV FILES")
        for key, filename in source_files.items():
            lines.append(f"  • {filename}")
        lines.append("")
    
    # Statistics
    spikes = analysis_state.get('spikes', [])
    bursts = analysis_state.get('electrode_bursts', []) or analysis_state.get('bursts', [])
    lines.append("SPIKE AND BURST STATISTICS")
    lines.append(f"Total Spikes: {len(spikes):,}")
    lines.append(f"Total Bursts: {len(bursts):,}")
    lines.append(f"Active Electrodes: {len(analysis_state.get('active_electrodes', []))}")
    lines.append(f"Duration: {format_duration(analysis_state.get('duration_s', 0))}")
    lines.append("")
    
    # Binning Settings
    well_params = analysis_state.get('wellParams', {})
    selected_well = analysis_state.get('selectedWell', '')
    spike_bin = well_params.get(selected_well, {}).get('spikeBinS', 10)
    burst_bin = well_params.get(selected_well, {}).get('burstBinS', 60)
    lines.append("BINNING SETTINGS")
    lines.append(f"Spike Bin Size: {spike_bin}s")
    lines.append(f"Burst Bin Size: {burst_bin}s")
    lines.append("")
    
    # Baseline Metrics
    if analysis_state.get('baselineEnabled') and well_analysis:
        lines.append("BASELINE METRICS")
        lines.append(f"Baseline Minute: {analysis_state.get('baselineMinute', 1)}")
        lines.append(f"Baseline Spike Rate: {safe_float(well_analysis.get('baselineSpikeHz'), 0):.4f} Hz")
        lines.append(f"Baseline Burst Rate: {safe_float(well_analysis.get('baselineBurstBpm'), 0):.4f} bpm")
        lines.append("")
    
    # Drug Metrics
    if analysis_state.get('drugEnabled') and analysis_state.get('selectedDrugs') and well_analysis:
        lines.append("DRUG METRICS")
        lines.append(f"Drug(s): {', '.join(analysis_state.get('selectedDrugs', []))}")
        lines.append(f"Perfusion Time: {analysis_state.get('drugPerfTime', 3)} min")
        lines.append(f"Readout Minute: {analysis_state.get('drugReadoutMinute', 5)}")
        lines.append(f"Drug Spike Rate: {safe_float(well_analysis.get('drugSpikeHz'), 0):.4f} Hz")
        lines.append(f"Drug Burst Rate: {safe_float(well_analysis.get('drugBurstBpm'), 0):.4f} bpm")
        lines.append("")
    
    # Light Metrics
    if analysis_state.get('lightEnabled') and analysis_state.get('lightPulses'):
        lines.append("LIGHT STIMULUS INFO")
        lines.append(f"Number of Stims: {len(analysis_state.get('lightPulses', []))}")
        lines.append("")
    
    # Render text
    text = '\n'.join(lines)
    ax.text(0.05, 0.88, text, transform=ax.transAxes, fontsize=9, 
            verticalalignment='top', fontfamily='monospace',
            bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
    
    # Footer
    ax.text(0.5, 0.02, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
            transform=ax.transAxes, fontsize=8, ha='center', color='gray')
    
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_spike_evolution_page(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create spike evolution page with raw and normalized graphs."""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.5, 11))
    fig.suptitle('Spike Evolution', fontsize=14, fontweight='bold')
    
    spike_bins = well_analysis.get('spikeRateBins', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    
    if spike_bins:
        times = [b.get('bin_start', 0) / 60 for b in spike_bins]  # Convert to minutes
        rates = [b.get('spike_rate_hz', 0) for b in spike_bins]
        
        # Top: Raw spike rate
        ax1.plot(times, rates, color='#10b981', linewidth=1.5)
        ax1.fill_between(times, rates, alpha=0.3, color='#10b981')
        ax1.set_ylabel('Spike Rate (Hz)', fontsize=10)
        ax1.set_xlabel('Time (min)', fontsize=10)
        ax1.set_title('Spike Trace Evolution', fontsize=11)
        ax1.grid(True, alpha=0.3)
        
        # Add baseline line
        if baseline_spike > 0:
            ax1.axhline(y=baseline_spike, color='#22d3ee', linestyle='--', linewidth=1, label=f'Baseline: {baseline_spike:.2f} Hz')
            ax1.legend(loc='upper right', fontsize=8)
        
        # Bottom: Normalized to baseline
        if baseline_spike > 0:
            normalized = [(r / baseline_spike * 100) for r in rates]
            ax2.plot(times, normalized, color='#10b981', linewidth=1.5)
            ax2.fill_between(times, normalized, 100, alpha=0.3, color='#10b981')
            ax2.axhline(y=100, color='#22d3ee', linestyle='--', linewidth=1, label='Baseline (100%)')
            ax2.set_ylim(0, 200)
        else:
            ax2.text(0.5, 0.5, 'No baseline data', transform=ax2.transAxes, ha='center', va='center')
        
        ax2.set_ylabel('Normalized Spike Rate (%)', fontsize=10)
        ax2.set_xlabel('Time (min)', fontsize=10)
        ax2.set_title('Spike Rate Normalized to Baseline', fontsize=11)
        ax2.grid(True, alpha=0.3)
        ax2.legend(loc='upper right', fontsize=8)
    else:
        ax1.text(0.5, 0.5, 'No spike data available', transform=ax1.transAxes, ha='center', va='center')
        ax2.text(0.5, 0.5, 'No spike data available', transform=ax2.transAxes, ha='center', va='center')
    
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_burst_evolution_page(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create burst evolution page with raw and normalized graphs."""
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8.5, 11))
    fig.suptitle('Burst Evolution', fontsize=14, fontweight='bold')
    
    burst_bins = well_analysis.get('burstRateBins', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    
    if burst_bins:
        times = [b.get('bin_start', 0) / 60 for b in burst_bins]
        rates = [b.get('burst_rate_bpm', 0) for b in burst_bins]
        
        # Top: Raw burst rate
        ax1.plot(times, rates, color='#f97316', linewidth=1.5)
        ax1.fill_between(times, rates, alpha=0.3, color='#f97316')
        ax1.set_ylabel('Burst Rate (bpm)', fontsize=10)
        ax1.set_xlabel('Time (min)', fontsize=10)
        ax1.set_title('Burst Trace Evolution', fontsize=11)
        ax1.grid(True, alpha=0.3)
        
        if baseline_burst > 0:
            ax1.axhline(y=baseline_burst, color='#22d3ee', linestyle='--', linewidth=1, label=f'Baseline: {baseline_burst:.2f} bpm')
            ax1.legend(loc='upper right', fontsize=8)
        
        # Bottom: Normalized
        if baseline_burst > 0:
            normalized = [(r / baseline_burst * 100) for r in rates]
            ax2.plot(times, normalized, color='#f97316', linewidth=1.5)
            ax2.fill_between(times, normalized, 100, alpha=0.3, color='#f97316')
            ax2.axhline(y=100, color='#22d3ee', linestyle='--', linewidth=1, label='Baseline (100%)')
            ax2.set_ylim(0, 200)
        else:
            ax2.text(0.5, 0.5, 'No baseline data', transform=ax2.transAxes, ha='center', va='center')
        
        ax2.set_ylabel('Normalized Burst Rate (%)', fontsize=10)
        ax2.set_xlabel('Time (min)', fontsize=10)
        ax2.set_title('Burst Rate Normalized to Baseline', fontsize=11)
        ax2.grid(True, alpha=0.3)
        ax2.legend(loc='upper right', fontsize=8)
    else:
        ax1.text(0.5, 0.5, 'No burst data available', transform=ax1.transAxes, ha='center', va='center')
        ax2.text(0.5, 0.5, 'No burst data available', transform=ax2.transAxes, ha='center', va='center')
    
    plt.tight_layout(rect=[0, 0.03, 1, 0.95])
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_spontaneous_spike_table(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create spontaneous spike table page."""
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    fig.suptitle('Spontaneous Activity — Spike Frequency', fontsize=14, fontweight='bold')
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    baseline_minute = analysis_state.get('baselineMinute', 1)
    drug_readout = analysis_state.get('drugPerfTime', 3) + analysis_state.get('drugReadoutMinute', 5) if analysis_state.get('drugEnabled') else None
    
    # Create table data
    headers = ['Minute', 'Spike Rate (Hz)', 'Spike Count', 'Normalized (%)']
    data = [headers]
    
    for pm in per_minute:
        minute = pm.get('minute', 0)
        spike_rate = safe_float(pm.get('spike_rate_hz'), 0)
        spike_count = pm.get('spike_count', 0)
        normalized = (spike_rate / baseline_spike * 100) if baseline_spike > 0 else 0
        data.append([minute, f"{spike_rate:.4f}", spike_count, f"{normalized:.1f}"])
    
    if len(data) > 1:
        table = ax.table(cellText=data, loc='center', cellLoc='center',
                        colWidths=[0.15, 0.25, 0.2, 0.2])
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1.2, 1.5)
        
        # Style header
        for col in range(len(headers)):
            table[(0, col)].set_facecolor('#E0E0E0')
            table[(0, col)].set_text_props(weight='bold')
        
        # Highlight rows
        for row_idx in range(1, len(data)):
            minute = data[row_idx][0]
            if minute == baseline_minute:
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#E3F2FD')
            elif drug_readout and minute == drug_readout:
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#F3E5F5')
    else:
        ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=12)
    
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_spontaneous_burst_table(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create spontaneous burst table page."""
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    fig.suptitle('Spontaneous Activity — Burst Frequency', fontsize=14, fontweight='bold')
    
    per_minute = well_analysis.get('perMinuteCombined', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    baseline_minute = analysis_state.get('baselineMinute', 1)
    drug_readout = analysis_state.get('drugPerfTime', 3) + analysis_state.get('drugReadoutMinute', 5) if analysis_state.get('drugEnabled') else None
    
    headers = ['Minute', 'Burst Rate (bpm)', 'Burst Count', 'Normalized (%)']
    data = [headers]
    
    for pm in per_minute:
        minute = pm.get('minute', 0)
        burst_rate = safe_float(pm.get('burst_rate_bpm'), 0)
        burst_count = pm.get('burst_count', 0)
        normalized = (burst_rate / baseline_burst * 100) if baseline_burst > 0 else 0
        data.append([minute, f"{burst_rate:.4f}", burst_count, f"{normalized:.1f}"])
    
    if len(data) > 1:
        table = ax.table(cellText=data, loc='center', cellLoc='center',
                        colWidths=[0.15, 0.25, 0.2, 0.2])
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1.2, 1.5)
        
        for col in range(len(headers)):
            table[(0, col)].set_facecolor('#E0E0E0')
            table[(0, col)].set_text_props(weight='bold')
        
        for row_idx in range(1, len(data)):
            minute = data[row_idx][0]
            if minute == baseline_minute:
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#E3F2FD')
            elif drug_readout and minute == drug_readout:
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#F3E5F5')
    else:
        ax.text(0.5, 0.5, 'No data available', ha='center', va='center', fontsize=12)
    
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_light_spike_table(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create light stimulus spike table page."""
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    fig.suptitle('Light Stimulus — Spike', fontsize=14, fontweight='bold')
    
    light_pulses = analysis_state.get('lightPulses', [])
    spike_bins = well_analysis.get('spikeRateBins', []) if well_analysis else []
    baseline_spike = safe_float(well_analysis.get('baselineSpikeHz'), 0) if well_analysis else 0
    
    headers = ['Stim', 'Baseline (Hz)', 'Avg (Hz)', 'Max (Hz)', 'Δ%', 'Peak Δ%', 'TTP (s)']
    data = [headers]
    stim_metrics = []
    
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        window_spikes = [b.get('spike_rate_hz', 0) for b in spike_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_spike = np.mean(window_spikes) if window_spikes else 0
        max_spike = max(window_spikes) if window_spikes else 0
        delta_pct = ((avg_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        peak_delta_pct = ((max_spike - baseline_spike) / baseline_spike * 100) if baseline_spike > 0 else 0
        
        if window_spikes:
            peak_idx = window_spikes.index(max(window_spikes))
            matching_bins = [b for b in spike_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec if matching_bins and peak_idx < len(matching_bins) else 0
        else:
            ttp = 0
        
        stim_metrics.append({'baseline': baseline_spike, 'avg': avg_spike, 'max': max_spike,
                            'delta': delta_pct, 'peak_delta': peak_delta_pct, 'ttp': ttp})
        data.append([f"Stim {i+1}", f"{baseline_spike:.2f}", f"{avg_spike:.2f}", 
                    f"{max_spike:.2f}", f"{delta_pct:.1f}", f"{peak_delta_pct:.1f}", f"{ttp:.1f}"])
    
    # Average row
    if stim_metrics:
        data.append(["Average", f"{np.mean([m['baseline'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['avg'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['max'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['delta'] for m in stim_metrics]):.1f}",
                    f"{np.mean([m['peak_delta'] for m in stim_metrics]):.1f}",
                    f"{np.mean([m['ttp'] for m in stim_metrics]):.1f}"])
    
    if len(data) > 1:
        table = ax.table(cellText=data, loc='center', cellLoc='center',
                        colWidths=[0.12, 0.14, 0.12, 0.12, 0.1, 0.12, 0.1])
        table.auto_set_font_size(False)
        table.set_fontsize(7)
        table.scale(1.2, 1.5)
        
        # Style header
        for col in range(len(headers)):
            table[(0, col)].set_facecolor('#E0E0E0')
            table[(0, col)].set_text_props(weight='bold')
            if col == 1:  # Baseline column
                table[(0, col)].set_facecolor('#E3F2FD')
            elif col >= 2:  # Metric columns
                table[(0, col)].set_facecolor('#FFF8E1')
        
        # Baseline column blue, average row red
        for row_idx in range(1, len(data)):
            table[(row_idx, 1)].set_facecolor('#E3F2FD')
            if row_idx == len(data) - 1:  # Average row
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#FFEBEE')
    else:
        ax.text(0.5, 0.5, 'No light stimulus data available', ha='center', va='center', fontsize=12)
    
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)


def create_pdf_light_burst_table(pdf, analysis_state: Dict, well_analysis: Dict):
    """Create light stimulus burst table page."""
    fig, ax = plt.subplots(figsize=(8.5, 11))
    ax.axis('off')
    fig.suptitle('Light Stimulus — Burst', fontsize=14, fontweight='bold')
    
    light_pulses = analysis_state.get('lightPulses', [])
    burst_bins = well_analysis.get('burstRateBins', []) if well_analysis else []
    baseline_burst = safe_float(well_analysis.get('baselineBurstBpm'), 0) if well_analysis else 0
    
    headers = ['Stim', 'Baseline (bpm)', 'Avg (bpm)', 'Max (bpm)', 'Δ%', 'Peak Δ%', 'TTP (s)']
    data = [headers]
    stim_metrics = []
    
    for i, pulse in enumerate(light_pulses):
        start_sec = pulse.get('start_sec', 0)
        end_sec = pulse.get('end_sec', 0)
        
        window_bursts = [b.get('burst_rate_bpm', 0) for b in burst_bins 
                        if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
        
        avg_burst = np.mean(window_bursts) if window_bursts else 0
        max_burst = max(window_bursts) if window_bursts else 0
        delta_pct = ((avg_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        peak_delta_pct = ((max_burst - baseline_burst) / baseline_burst * 100) if baseline_burst > 0 else 0
        
        if window_bursts:
            peak_idx = window_bursts.index(max(window_bursts))
            matching_bins = [b for b in burst_bins if b.get('bin_start', 0) >= start_sec and b.get('bin_end', 0) <= end_sec]
            ttp = matching_bins[peak_idx].get('bin_start', 0) - start_sec if matching_bins and peak_idx < len(matching_bins) else 0
        else:
            ttp = 0
        
        stim_metrics.append({'baseline': baseline_burst, 'avg': avg_burst, 'max': max_burst,
                            'delta': delta_pct, 'peak_delta': peak_delta_pct, 'ttp': ttp})
        data.append([f"Stim {i+1}", f"{baseline_burst:.2f}", f"{avg_burst:.2f}",
                    f"{max_burst:.2f}", f"{delta_pct:.1f}", f"{peak_delta_pct:.1f}", f"{ttp:.1f}"])
    
    if stim_metrics:
        data.append(["Average", f"{np.mean([m['baseline'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['avg'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['max'] for m in stim_metrics]):.2f}",
                    f"{np.mean([m['delta'] for m in stim_metrics]):.1f}",
                    f"{np.mean([m['peak_delta'] for m in stim_metrics]):.1f}",
                    f"{np.mean([m['ttp'] for m in stim_metrics]):.1f}"])
    
    if len(data) > 1:
        table = ax.table(cellText=data, loc='center', cellLoc='center',
                        colWidths=[0.12, 0.14, 0.14, 0.14, 0.1, 0.12, 0.1])
        table.auto_set_font_size(False)
        table.set_fontsize(7)
        table.scale(1.2, 1.5)
        
        for col in range(len(headers)):
            table[(0, col)].set_facecolor('#E0E0E0')
            table[(0, col)].set_text_props(weight='bold')
            if col == 1:
                table[(0, col)].set_facecolor('#E3F2FD')
            elif col >= 2:
                table[(0, col)].set_facecolor('#FFF8E1')
        
        for row_idx in range(1, len(data)):
            table[(row_idx, 1)].set_facecolor('#E3F2FD')
            if row_idx == len(data) - 1:
                for col in range(len(headers)):
                    table[(row_idx, col)].set_facecolor('#FFEBEE')
    else:
        ax.text(0.5, 0.5, 'No light stimulus data available', ha='center', va='center', fontsize=12)
    
    pdf.savefig(fig, bbox_inches='tight')
    plt.close(fig)
