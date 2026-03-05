"""
NEHER Export Utilities - Nature Magazine Style
Clean, professional scientific publication exports
Developed by Kolia H. Badarello
"""
import io
import numpy as np
from datetime import datetime

# Color palette matching NEHER UI
COLORS = {
    'emerald': '#10b981',      # Beats/BF
    'amber': '#f59e0b',        # Light stims
    'purple': '#a855f7',       # Drug perfusion
    'violet_dark': '#7c3aed',  # Drug (darker)
    'silver': '#71717a',       # Intervals/secondary
    'sky': '#0ea5e9',          # Baseline
    'zinc_dark': '#18181b',    # Dark background
    'zinc_light': '#f4f4f5',   # Light background
    'white': '#ffffff',
}

TINTS = {
    'baseline': '#E0F2FE',     # Light blue
    'drug': '#F3E8FF',         # Light purple
    'light': '#FEF3C7',        # Light amber
}


def add_page_footer(fig, page_num, total_pages=None):
    """Add footer to each page"""
    footer_y = 0.02
    fig.text(0.5, footer_y, 'NEHER', ha='center', fontsize=8, fontweight='bold', color='#18181b')
    fig.text(0.95, footer_y, f'Page {page_num}' if not total_pages else f'Page {page_num}/{total_pages}', 
             ha='right', fontsize=8, color='#a1a1aa')
    fig.text(0.05, footer_y, 'Developed by Kolia H. Badarello', ha='left', fontsize=7, color='#a1a1aa', style='italic')


def create_nature_pdf(request):
    """Create a Nature Magazine-style PDF export"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    import matplotlib.patches as mpatches
    
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Helvetica Neue', 'Arial', 'DejaVu Sans'],
        'font.size': 9,
        'axes.labelsize': 9,
        'axes.titlesize': 10,
        'axes.linewidth': 0.8,
        'xtick.labelsize': 8,
        'ytick.labelsize': 8,
        'legend.fontsize': 8,
        'figure.titlesize': 12,
        'axes.spines.top': False,
        'axes.spines.right': False,
    })
    
    buf = io.BytesIO()
    page_num = 0
    
    with PdfPages(buf) as pdf:
        
        # ==================== PAGE 1: SUMMARY ====================
        page_num += 1
        fig1 = plt.figure(figsize=(8.5, 11))
        fig1.patch.set_facecolor('white')
        
        title = request.recording_name or request.filename or 'Recording Analysis'
        fig1.text(0.5, 0.96, title, ha='center', va='top', fontsize=16, fontweight='bold', color='#18181b')
        fig1.text(0.5, 0.935, 'Electrophysiology Analysis Report by NEHER', ha='center', va='top', fontsize=10, color='#71717a')
        fig1.text(0.5, 0.905, f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}', ha='center', va='top', fontsize=8, color='#a1a1aa')
        fig1.add_artist(plt.Line2D([0.08, 0.92], [0.88, 0.88], color='#e4e4e7', linewidth=1, transform=fig1.transFigure))
        
        left_x = 0.08
        right_x = 0.52
        line_height = 0.02
        
        def draw_header(fig, x, y, text, color):
            fig.text(x, y, text, fontsize=9, fontweight='bold', color='white',
                    bbox=dict(boxstyle='round,pad=0.3', facecolor=color, edgecolor='none'))
            return y - 0.035
        
        def draw_row(fig, x, y, label, value, bg_color=None, width=0.38):
            if bg_color:
                fig.add_artist(mpatches.FancyBboxPatch(
                    (x - 0.005, y - 0.006), width, 0.018,
                    boxstyle=mpatches.BoxStyle("Round", pad=0.002),
                    facecolor=bg_color, edgecolor='none', transform=fig.transFigure
                ))
            fig.text(x, y, label, fontsize=7.5, color='#52525b')
            fig.text(x + 0.2, y, str(value), fontsize=7.5, fontweight='bold', color='#18181b')
            return y - line_height
        
        def draw_separator(fig, x, y, width=0.38, centered=False):
            """Draw a horizontal separator line"""
            if centered:
                # Shorter, centered separator
                sep_width = 0.15
                start_x = x + (width - sep_width) / 2
                fig.add_artist(plt.Line2D([start_x, start_x + sep_width], [y, y], color='#d1d5db', linewidth=0.5, transform=fig.transFigure))
                return y - 0.015  # More space below
            else:
                fig.add_artist(plt.Line2D([x, x + width], [y, y], color='#d1d5db', linewidth=0.5, transform=fig.transFigure))
                return y - 0.015  # Increased space below bar
        
        # LEFT COLUMN
        y = draw_header(fig1, left_x, 0.855, 'RECORDING INFO', '#18181b')
        
        # Add separator right below header (at top of table)
        y = draw_separator(fig1, left_x, y + 0.015, width=0.38, centered=False)
        
        if request.original_filename:
            y = draw_row(fig1, left_x, y, 'Original File:', request.original_filename)
        if request.recording_date:
            y = draw_row(fig1, left_x, y, 'Recording Date:', request.recording_date)
        if request.summary:
            if 'Total Beats' in request.summary:
                y = draw_row(fig1, left_x, y, 'Total Beats:', request.summary['Total Beats'])
            if 'Kept Beats' in request.summary:
                y = draw_row(fig1, left_x, y, 'Kept Beats:', request.summary['Kept Beats'])
            if 'Filter Range' in request.summary:
                y = draw_row(fig1, left_x, y, 'Filter Range:', request.summary['Filter Range'])
        
        # TISSUE INFO (below Recording Info)
        if request.organoid_info:
            y -= 0.015
            y = draw_header(fig1, left_x, y, 'TISSUE INFO', '#6b7280')
            for idx, org in enumerate(request.organoid_info):
                # Add separator right below header (at top of table)
                y = draw_separator(fig1, left_x, y + 0.015, width=0.38, centered=False)
                
                if org.get('cell_type'):
                    cell_type = org.get('other_cell_type') if org.get('cell_type') == 'Other' else org.get('cell_type')
                    # Number the cell types: Cell Type 1, Cell Type 2, etc.
                    cell_type_label = f'Cell Type {idx + 1}:' if len(request.organoid_info) > 1 else 'Cell Type:'
                    y = draw_row(fig1, left_x, y, cell_type_label, cell_type or '—')
                if org.get('line_name'):
                    y = draw_row(fig1, left_x, y, 'Line:', org.get('line_name'))
                if org.get('passage_number'):
                    y = draw_row(fig1, left_x, y, 'Passage:', org.get('passage_number'))
                if org.get('age_at_recording') is not None:
                    y = draw_row(fig1, left_x, y, 'Age at Recording:', f"{org.get('age_at_recording')} days")
                if org.get('transfection'):
                    trans = org['transfection']
                    if trans.get('name'):
                        y = draw_row(fig1, left_x, y, 'Transfection:', trans.get('name'))
                    if trans.get('days_since_transfection') is not None:
                        y = draw_row(fig1, left_x, y, 'Days Post-Transf.:', trans.get('days_since_transfection'))
            
            # Add separator before Days Since Fusion
            if request.days_since_fusion is not None:
                y = draw_separator(fig1, left_x, y + 0.015, width=0.38, centered=False)
        
        if request.days_since_fusion is not None:
            y = draw_row(fig1, left_x, y, 'Days Since Fusion:', request.days_since_fusion)
        
        # DRUG PERFUSION
        if request.all_drugs and len(request.all_drugs) > 0:
            y -= 0.015
            y = draw_header(fig1, left_x, y, 'DRUG PERFUSION', COLORS['purple'])
            for drug in request.all_drugs:
                y = draw_row(fig1, left_x, y, 'Drug:', drug.get('name', 'Drug'), TINTS['drug'])
                if drug.get('concentration'):
                    y = draw_row(fig1, left_x, y, 'Concentration:', f"{drug.get('concentration')}µM", TINTS['drug'])
                y = draw_row(fig1, left_x, y, 'Perf. Start:', f"{drug.get('start', 0)} min", TINTS['drug'])
                y = draw_row(fig1, left_x, y, 'Perf. Delay:', f"{drug.get('delay', 0)} min", TINTS['drug'])
                # Calculate and show Perf. Time (start + delay)
                perf_time = (drug.get('start', 0) or 0) + (drug.get('delay', 0) or 0)
                y = draw_row(fig1, left_x, y, 'Perf. Time:', f"{perf_time} min", TINTS['drug'])
                perf_end = drug.get('end')
                y = draw_row(fig1, left_x, y, 'Perf. End:', f"{perf_end} min" if perf_end is not None else '—', TINTS['drug'])
        
        # LIGHT STIMULATION
        if request.light_enabled:
            y -= 0.015
            y = draw_header(fig1, left_x, y, 'LIGHT STIMULATION', COLORS['amber'])
            y = draw_row(fig1, left_x, y, 'Status:', 'Enabled', TINTS['light'])
            if request.light_stim_count and request.light_stim_count > 0:
                y = draw_row(fig1, left_x, y, 'Stims Detected:', str(request.light_stim_count), TINTS['light'])
            # Stims Start - from first pulse (below Stims Detected)
            if request.light_pulses and len(request.light_pulses) > 0:
                first_pulse = request.light_pulses[0]
                light_start = first_pulse.get('start_min')
                if light_start is not None:
                    y = draw_row(fig1, left_x, y, 'Stims Start:', f"{light_start:.2f} min", TINTS['light'])
            if request.light_params:
                if request.light_params.get('pulseDuration') is not None:
                    y = draw_row(fig1, left_x, y, 'Stim Duration:', f"{request.light_params.get('pulseDuration')} sec", TINTS['light'])
                if request.light_params.get('interval'):
                    # Map interval values to display labels
                    interval_val = request.light_params.get('interval')
                    interval_display_map = {
                        'decreasing': '60s-30s-20s-10s',
                        '60': 'Uniform 60s',
                        '30': 'Uniform 30s',
                    }
                    interval_display = interval_display_map.get(str(interval_val), str(interval_val))
                    y = draw_row(fig1, left_x, y, 'Inter-stimuli intervals:', interval_display, TINTS['light'])
        
        # RIGHT COLUMN - READOUTS
        y_right = 0.855
        
        # BASELINE READOUT
        if request.baseline_enabled and request.baseline:
            y_right = draw_header(fig1, right_x, y_right, 'BASELINE READOUT', COLORS['sky'])
            baseline = request.baseline
            bf_val = baseline.get('baseline_bf')
            y_right = draw_row(fig1, right_x, y_right, 'Mean BF:', f"{bf_val:.1f} bpm" if bf_val else '—', TINTS['baseline'])
            ln_rmssd = baseline.get('baseline_ln_rmssd70')
            y_right = draw_row(fig1, right_x, y_right, 'ln(RMSSD₇₀):', f"{ln_rmssd:.3f}" if ln_rmssd else '—', TINTS['baseline'])
            sdnn = baseline.get('baseline_sdnn')
            ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
            y_right = draw_row(fig1, right_x, y_right, 'ln(SDNN₇₀):', f"{ln_sdnn:.3f}" if ln_sdnn else '—', TINTS['baseline'])
            pnn50 = baseline.get('baseline_pnn50')
            y_right = draw_row(fig1, right_x, y_right, 'pNN50₇₀:', f"{pnn50:.1f}%" if pnn50 is not None else '—', TINTS['baseline'])
            y_right -= 0.015
        
        # DRUG READOUT - show even without baseline
        if request.drug_readout_enabled and request.all_drugs and len(request.all_drugs) > 0:
            y_right = draw_header(fig1, right_x, y_right, 'DRUG READOUT', COLORS['purple'])
            
            drug_bf = None
            drug_hrv_data = None
            
            # Get drug readout minutes - check both drug_readout and drug_readout_settings
            drug_bf_minute = None
            drug_hrv_minute = None
            
            # First try to get from drug_readout (calculated values)
            if request.drug_readout:
                drug_bf_minute = request.drug_readout.get('bf_minute')
                drug_hrv_minute = request.drug_readout.get('hrv_minute')
            
            # Override with user settings if available (these are stored as strings sometimes)
            if request.drug_readout_settings:
                settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
                settings_hrv = request.drug_readout_settings.get('hrvReadoutMinute')
                
                # Get perfusion params for calculation
                perf_start = 0
                perf_delay = 0
                if request.all_drugs and len(request.all_drugs) > 0:
                    drug = request.all_drugs[0]
                    perf_start = drug.get('start', 0) or 0
                    perf_delay = drug.get('delay', 0) or 0
                
                # If user has enabled BF readout and provided a minute
                if request.drug_readout_settings.get('enableBfReadout') and settings_bf not in (None, ''):
                    try:
                        drug_bf_minute = int(float(settings_bf)) + perf_start + perf_delay
                    except (ValueError, TypeError):
                        pass
                
                # If user has enabled HRV readout and provided a minute
                if request.drug_readout_settings.get('enableHrvReadout') and settings_hrv not in (None, ''):
                    try:
                        drug_hrv_minute = int(float(settings_hrv)) + perf_start + perf_delay
                    except (ValueError, TypeError):
                        pass
            
            # Convert to int for comparison
            try:
                drug_bf_minute = int(drug_bf_minute) if drug_bf_minute is not None else None
            except (ValueError, TypeError):
                drug_bf_minute = None
                
            try:
                drug_hrv_minute = int(drug_hrv_minute) if drug_hrv_minute is not None else None
            except (ValueError, TypeError):
                drug_hrv_minute = None
            
            # Find BF at drug readout minute - check both per_minute_data and hrv_windows
            if drug_bf_minute is not None and request.per_minute_data:
                for pm in request.per_minute_data:
                    try:
                        minute_str = str(pm.get('minute', ''))
                        minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                        if minute_num == drug_bf_minute:
                            drug_bf = pm.get('mean_bf')
                            break
                    except (ValueError, TypeError):
                        pass
            
            # Find HRV at drug readout minute
            if drug_hrv_minute is not None and request.hrv_windows:
                for w in request.hrv_windows:
                    try:
                        w_minute = w.get('minute')
                        # Handle different minute formats
                        if w_minute is None:
                            continue
                        if isinstance(w_minute, (int, float)):
                            w_minute_num = int(w_minute)
                        else:
                            w_minute_str = str(w_minute)
                            w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                        
                        if w_minute_num == drug_hrv_minute:
                            drug_hrv_data = w
                            # If BF not found in per_minute_data, get it from HRV window
                            if drug_bf is None and w.get('mean_bf'):
                                drug_bf = w.get('mean_bf')
                            break
                    except (ValueError, TypeError):
                        pass
            
            # Fallback: if BF still not found but HRV minute matches BF minute, use HRV window's BF
            if drug_bf is None and drug_bf_minute is not None and request.hrv_windows:
                for w in request.hrv_windows:
                    try:
                        w_minute = w.get('minute')
                        if w_minute is None:
                            continue
                        if isinstance(w_minute, (int, float)):
                            w_minute_num = int(w_minute)
                        else:
                            w_minute_str = str(w_minute)
                            w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                        
                        if w_minute_num == drug_bf_minute and w.get('mean_bf'):
                            drug_bf = w.get('mean_bf')
                            break
                    except (ValueError, TypeError):
                        pass
            
            # Always show drug metrics if available
            y_right = draw_row(fig1, right_x, y_right, 'Mean BF:', f"{drug_bf:.1f} bpm" if drug_bf else '—', TINTS['drug'])
            if drug_hrv_data:
                ln_rmssd = drug_hrv_data.get('ln_rmssd70')
                y_right = draw_row(fig1, right_x, y_right, 'ln(RMSSD₇₀):', f"{ln_rmssd:.3f}" if ln_rmssd else '—', TINTS['drug'])
                sdnn = drug_hrv_data.get('sdnn')
                ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
                y_right = draw_row(fig1, right_x, y_right, 'ln(SDNN₇₀):', f"{ln_sdnn:.3f}" if ln_sdnn else '—', TINTS['drug'])
                pnn50 = drug_hrv_data.get('pnn50')
                y_right = draw_row(fig1, right_x, y_right, 'pNN50₇₀:', f"{pnn50:.1f}%" if pnn50 is not None else '—', TINTS['drug'])
            else:
                y_right = draw_row(fig1, right_x, y_right, 'HRV:', 'No data at readout', TINTS['drug'])
            y_right -= 0.015
        
        # LIGHT READOUT - all HRA metrics
        if request.light_enabled and (request.light_response or request.light_metrics_detrended):
            y_right = draw_header(fig1, right_x, y_right, 'LIGHT READOUT', COLORS['amber'])
            
            if request.light_response:
                valid = [r for r in request.light_response if r]
                if valid:
                    avg_bf = np.mean([r.get('avg_bf', 0) for r in valid if r.get('avg_bf')])
                    peak_bf = np.mean([r.get('peak_bf', 0) for r in valid if r.get('peak_bf')])
                    baseline_bf_vals = [r.get('baseline_bf') for r in valid if r.get('baseline_bf')]
                    baseline_bf = np.mean(baseline_bf_vals) if baseline_bf_vals else None
                    peak_norm_vals = [r.get('peak_norm_pct') for r in valid if r.get('peak_norm_pct') is not None]
                    peak_norm = np.mean(peak_norm_vals) if peak_norm_vals else None
                    ttp_vals = [r.get('time_to_peak_sec') for r in valid if r.get('time_to_peak_sec') is not None]
                    ttp = np.mean(ttp_vals) if ttp_vals else None
                    ttp_1st = valid[0].get('time_to_peak_sec') if valid else None
                    recovery_bf_vals = [r.get('bf_end') for r in valid if r.get('bf_end')]
                    recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                    recovery_pct_vals = [r.get('bf_end_pct') for r in valid if r.get('bf_end_pct')]
                    recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                    amplitude_vals = [r.get('amplitude') for r in valid if r.get('amplitude')]
                    amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                    roc_vals = [r.get('rate_of_change') for r in valid if r.get('rate_of_change') is not None]
                    roc = np.mean(roc_vals) if roc_vals else None
                    
                    y_right = draw_row(fig1, right_x, y_right, 'Baseline BF:', f"{baseline_bf:.1f} bpm" if baseline_bf else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Avg BF:', f"{avg_bf:.1f} bpm", TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Peak BF:', f"{peak_bf:.1f} bpm", TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Peak (Norm.):', f"{peak_norm:.1f}%" if peak_norm else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Amplitude:', f"{amplitude:.1f} bpm" if amplitude else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Time to Peak:', f"{ttp:.1f} s" if ttp is not None else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'TTP (1st Stim):', f"{ttp_1st:.1f} s" if ttp_1st is not None else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Rate of Change:', f"{roc:.3f} 1/min" if roc else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Recovery BF:', f"{recovery_bf:.1f} bpm" if recovery_bf else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Recovery %:', f"{recovery_pct:.1f}%" if recovery_pct else '—', TINTS['light'])
            
            # Corrected HRV
            if request.light_metrics_detrended and request.light_metrics_detrended.get('final'):
                y_right -= 0.008
                fig1.text(right_x, y_right, 'Corrected HRV:', fontsize=7, fontstyle='italic', color='#52525b')
                y_right -= line_height
                final = request.light_metrics_detrended['final']
                ln_rmssd = final.get('ln_rmssd70_detrended')
                y_right = draw_row(fig1, right_x, y_right, 'ln(RMSSD₇₀):', f"{ln_rmssd:.3f}" if ln_rmssd else '—', TINTS['light'])
                ln_sdnn = final.get('ln_sdnn70_detrended')
                y_right = draw_row(fig1, right_x, y_right, 'ln(SDNN₇₀):', f"{ln_sdnn:.3f}" if ln_sdnn else '—', TINTS['light'])
                pnn50 = final.get('pnn50_detrended')
                y_right = draw_row(fig1, right_x, y_right, 'pNN50₇₀:', f"{pnn50:.1f}%" if pnn50 is not None else '—', TINTS['light'])
        
        add_page_footer(fig1, page_num)
        pdf.savefig(fig1)
        plt.close(fig1)
        
        # ==================== PAGE 2: BF TRACES ====================
        if request.per_beat_data or request.per_minute_data:
            page_num += 1
            fig2 = plt.figure(figsize=(8.5, 11))
            fig2.suptitle('Beat Frequency Analysis', fontsize=14, fontweight='bold', y=0.96)
            
            # Get baseline or drug BF for normalization
            baseline_bf = None
            norm_source = 'Baseline'
            if request.baseline and request.baseline.get('baseline_bf'):
                baseline_bf = request.baseline.get('baseline_bf')
            elif request.drug_readout and request.per_minute_data:
                # Use drug readout if no baseline
                drug_bf_minute = request.drug_readout.get('bf_minute')
                if drug_bf_minute is not None:
                    try:
                        drug_bf_minute = int(drug_bf_minute)
                    except (ValueError, TypeError):
                        drug_bf_minute = None
                    
                    if drug_bf_minute is not None:
                        for pm in request.per_minute_data:
                            try:
                                minute_str = str(pm.get('minute', ''))
                                minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                                if minute_num == drug_bf_minute:
                                    baseline_bf = pm.get('mean_bf')
                                    norm_source = 'Drug Readout'
                                    break
                            except (ValueError, TypeError):
                                pass
                        
                        # Fallback: try hrv_windows for BF
                        if baseline_bf is None and request.hrv_windows:
                            for w in request.hrv_windows:
                                try:
                                    w_minute = w.get('minute')
                                    if isinstance(w_minute, (int, float)):
                                        w_minute_num = int(w_minute)
                                    else:
                                        w_minute_str = str(w_minute)
                                        w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                                    
                                    if w_minute_num == drug_bf_minute and w.get('mean_bf'):
                                        baseline_bf = w.get('mean_bf')
                                        norm_source = 'Drug Readout'
                                        break
                                except (ValueError, TypeError):
                                    pass
            
            # Fallback to drug_readout_settings
            if baseline_bf is None and request.drug_readout_settings:
                settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
                if request.drug_readout_settings.get('enableBfReadout') and settings_bf not in (None, ''):
                    try:
                        perf_start = 0
                        perf_delay = 0
                        if request.all_drugs and len(request.all_drugs) > 0:
                            drug = request.all_drugs[0]
                            perf_start = drug.get('start', 0) or 0
                            perf_delay = drug.get('delay', 0) or 0
                        drug_bf_minute = int(float(settings_bf)) + int(perf_start) + int(perf_delay)
                        
                        # Try per_minute_data first
                        if request.per_minute_data:
                            for pm in request.per_minute_data:
                                try:
                                    minute_str = str(pm.get('minute', ''))
                                    minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                                    if minute_num == drug_bf_minute:
                                        baseline_bf = pm.get('mean_bf')
                                        norm_source = 'Drug Readout'
                                        break
                                except (ValueError, TypeError):
                                    pass
                        
                        # Fallback to hrv_windows
                        if baseline_bf is None and request.hrv_windows:
                            for w in request.hrv_windows:
                                try:
                                    w_minute = w.get('minute')
                                    if isinstance(w_minute, (int, float)):
                                        w_minute_num = int(w_minute)
                                    else:
                                        w_minute_str = str(w_minute)
                                        w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                                    
                                    if w_minute_num == drug_bf_minute and w.get('mean_bf'):
                                        baseline_bf = w.get('mean_bf')
                                        norm_source = 'Drug Readout'
                                        break
                                except (ValueError, TypeError):
                                    pass
                    except (ValueError, TypeError):
                        pass
            
            # Prepare data
            times, bf_values = [], []
            if request.per_beat_data:
                times = [d['time_min'] for d in request.per_beat_data if d.get('status') == 'kept']
                bf_values = [d['bf_bpm'] for d in request.per_beat_data if d.get('status') == 'kept']
            elif request.per_minute_data:
                for pm in request.per_minute_data:
                    minute_str = str(pm.get('minute', ''))
                    try:
                        minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(minute_str)
                        times.append(minute_num + 0.5)
                        bf_values.append(pm.get('mean_bf', 0))
                    except (ValueError, TypeError):
                        pass
            
            if times and bf_values:
                time_max = max(times) if times else 10
                
                # Top: BF Filtered
                ax1 = fig2.add_axes([0.1, 0.55, 0.85, 0.35])
                ax1.scatter(times, bf_values, s=3, c=COLORS['emerald'], alpha=0.7, label='Filtered BF')
                ax1.set_ylabel('BF (bpm)', fontsize=9)
                ax1.set_xlabel('Time (min)', fontsize=9)
                ax1.set_title('Beat Frequency (Filtered)', fontsize=10, fontweight='bold', pad=10)
                ax1.set_xlim(0, time_max * 1.05)
                
                # Add drug regions with legend
                if request.all_drugs:
                    for drug in request.all_drugs:
                        start = drug.get('start', 0) + drug.get('delay', 0)
                        end = drug.get('end') if drug.get('end') else time_max * 1.1
                        ax1.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
                
                # Add light stim regions with legend
                if request.light_enabled and request.light_pulses:
                    for pulse in request.light_pulses:
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        ax1.axvspan(start_min, end_min, alpha=0.2, color=COLORS['amber'])
                
                # Build legend - use Line2D for dot marker
                from matplotlib.lines import Line2D
                handles = [Line2D([0], [0], marker='o', color='w', markerfacecolor=COLORS['emerald'], 
                                  markersize=6, alpha=0.7, label='Filtered BF')]
                if request.all_drugs:
                    handles.append(mpatches.Patch(color=COLORS['purple'], alpha=0.3, label='Drug Perfusion'))
                if request.light_enabled and request.light_pulses:
                    handles.append(mpatches.Patch(color=COLORS['amber'], alpha=0.3, label='Light Stim'))
                ax1.legend(handles=handles, loc='upper right', fontsize=7, framealpha=0.9)
                ax1.grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
                
                # Bottom: BF Normalized
                if baseline_bf and baseline_bf > 0:
                    ax2 = fig2.add_axes([0.1, 0.1, 0.85, 0.35])
                    bf_norm = [100 * (bf / baseline_bf) for bf in bf_values]
                    ax2.scatter(times, bf_norm, s=3, c=COLORS['emerald'], alpha=0.7)
                    ax2.axhline(y=100, color='#dc2626', linestyle='--', linewidth=1)
                    ax2.set_ylabel('BF (% of Reference)', fontsize=9)
                    ax2.set_xlabel('Time (min)', fontsize=9)
                    ax2.set_title(f'Beat Frequency (Normalized to {norm_source})', fontsize=10, fontweight='bold', pad=10)
                    ax2.set_xlim(0, time_max * 1.05)
                    ax2.set_ylim(0, 200)
                    
                    # Add drug regions
                    if request.all_drugs:
                        for drug in request.all_drugs:
                            start = drug.get('start', 0) + drug.get('delay', 0)
                            end = drug.get('end') if drug.get('end') else time_max * 1.1
                            ax2.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
                    
                    # Add light stim regions
                    if request.light_enabled and request.light_pulses:
                        for pulse in request.light_pulses:
                            start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                            end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                            ax2.axvspan(start_min, end_min, alpha=0.2, color=COLORS['amber'])
                    
                    # Build legend with dot, baseline line, drug and light stim
                    legend_label = f'{norm_source} Readout (100%)' if norm_source == 'Baseline' else f'{norm_source} (100%)'
                    handles2 = [
                        Line2D([0], [0], marker='o', color='w', markerfacecolor=COLORS['emerald'], 
                               markersize=6, alpha=0.7, label='Normalized BF'),
                        Line2D([0], [0], color='#dc2626', linestyle='--', linewidth=1, label=legend_label)
                    ]
                    if request.all_drugs:
                        handles2.append(mpatches.Patch(color=COLORS['purple'], alpha=0.3, label='Drug Perfusion'))
                    if request.light_enabled and request.light_pulses:
                        handles2.append(mpatches.Patch(color=COLORS['amber'], alpha=0.3, label='Light Stim'))
                    ax2.legend(handles=handles2, loc='upper right', fontsize=7, framealpha=0.9)
                    ax2.grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
            
            add_page_footer(fig2, page_num)
            pdf.savefig(fig2)
            plt.close(fig2)
        
        # ==================== PAGE 3: HRV EVOLUTION ====================
        if request.hrv_windows:
            page_num += 1
            fig3 = plt.figure(figsize=(8.5, 11))
            fig3.suptitle('HRV Evolution', fontsize=14, fontweight='bold', y=0.96)
            
            minutes = [w.get('minute', i) for i, w in enumerate(request.hrv_windows)]
            time_max = max(minutes) if minutes else 10
            
            ln_rmssd_vals = [w.get('ln_rmssd70') for w in request.hrv_windows]
            sdnn_vals = [w.get('sdnn') for w in request.hrv_windows]
            ln_sdnn_vals = [np.log(s) if s and s > 0 else None for s in sdnn_vals]
            pnn50_vals = [w.get('pnn50') for w in request.hrv_windows]
            
            # ln(RMSSD70) - Y: 0 to 8
            ax1 = fig3.add_axes([0.1, 0.68, 0.85, 0.22])
            valid_idx = [i for i, v in enumerate(ln_rmssd_vals) if v is not None]
            if valid_idx:
                ax1.plot([minutes[i] for i in valid_idx], [ln_rmssd_vals[i] for i in valid_idx],
                        'o-', color=COLORS['emerald'], markersize=4, linewidth=1.5)
            ax1.set_ylabel('ln(RMSSD₇₀)', fontsize=9)
            ax1.set_xlabel('Time (min)', fontsize=9)
            ax1.set_title('ln(RMSSD₇₀) Evolution', fontsize=10, fontweight='bold', color=COLORS['emerald'])
            ax1.set_xlim(0, time_max + 1)
            ax1.set_ylim(0, 8)
            ax1.grid(True, alpha=0.3)
            if request.all_drugs:
                for drug in request.all_drugs:
                    start = drug.get('start', 0) + drug.get('delay', 0)
                    end = drug.get('end') if drug.get('end') else time_max + 1
                    ax1.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
            
            # ln(SDNN70) - Y: 0 to 8
            ax2 = fig3.add_axes([0.1, 0.38, 0.85, 0.22])
            valid_idx = [i for i, v in enumerate(ln_sdnn_vals) if v is not None]
            if valid_idx:
                ax2.plot([minutes[i] for i in valid_idx], [ln_sdnn_vals[i] for i in valid_idx],
                        'o-', color=COLORS['purple'], markersize=4, linewidth=1.5)
            ax2.set_ylabel('ln(SDNN₇₀)', fontsize=9)
            ax2.set_xlabel('Time (min)', fontsize=9)
            ax2.set_title('ln(SDNN₇₀) Evolution', fontsize=10, fontweight='bold', color=COLORS['purple'])
            ax2.set_xlim(0, time_max + 1)
            ax2.set_ylim(0, 8)
            ax2.grid(True, alpha=0.3)
            if request.all_drugs:
                for drug in request.all_drugs:
                    start = drug.get('start', 0) + drug.get('delay', 0)
                    end = drug.get('end') if drug.get('end') else time_max + 1
                    ax2.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
            
            # pNN50 - Y: 0 to 100
            ax3 = fig3.add_axes([0.1, 0.08, 0.85, 0.22])
            valid_idx = [i for i, v in enumerate(pnn50_vals) if v is not None]
            if valid_idx:
                ax3.plot([minutes[i] for i in valid_idx], [pnn50_vals[i] for i in valid_idx],
                        'o-', color=COLORS['amber'], markersize=4, linewidth=1.5)
            ax3.set_ylabel('pNN50₇₀ (%)', fontsize=9)
            ax3.set_xlabel('Time (min)', fontsize=9)
            ax3.set_title('pNN50₇₀ Evolution', fontsize=10, fontweight='bold', color=COLORS['amber'])
            ax3.set_xlim(0, time_max + 1)
            ax3.set_ylim(0, 100)
            ax3.grid(True, alpha=0.3)
            if request.all_drugs:
                for drug in request.all_drugs:
                    start = drug.get('start', 0) + drug.get('delay', 0)
                    end = drug.get('end') if drug.get('end') else time_max + 1
                    ax3.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
            
            add_page_footer(fig3, page_num)
            pdf.savefig(fig3)
            plt.close(fig3)
        
        # ==================== PAGE 3b: LIGHT-INDUCED CORRECTED HRV ANALYSIS ====================
        if request.light_enabled and request.light_metrics_detrended:
            # Support both 'per_stim' and 'per_pulse' keys (backend uses 'per_pulse')
            per_stim = request.light_metrics_detrended.get('per_stim') or request.light_metrics_detrended.get('per_pulse', [])
            # Filter for stims that have visualization data
            valid_stims = [(i, s) for i, s in enumerate(per_stim) if s and s.get('viz')]
            
            if valid_stims:
                page_num += 1
                n_stims = len(valid_stims)
                fig3b = plt.figure(figsize=(8.5, 11))
                fig3b.suptitle('Light-Induced Corrected HRV (Detrended) Analysis', fontsize=14, fontweight='bold', y=0.97)
                
                # Calculate row height based on number of stims
                row_height = min(0.15, 0.85 / max(n_stims, 1))
                top_margin = 0.92
                
                for row_idx, (stim_idx, stim_data) in enumerate(valid_stims):
                    viz = stim_data.get('viz', {})
                    time_rel = viz.get('time_rel', [])  # Time in seconds
                    nn_70 = viz.get('nn_70', [])
                    trend = viz.get('trend', [])
                    residual = viz.get('residual', [])
                    
                    if not time_rel or not nn_70:
                        continue
                    
                    y_pos = top_margin - (row_idx + 1) * row_height
                    col_width = 0.24
                    
                    # Calculate shared Y-axis limits for columns 1 and 2 (NN values)
                    all_nn_values = list(nn_70) + (list(trend) if trend else [])
                    nn_min = min(all_nn_values) if all_nn_values else 700
                    nn_max = max(all_nn_values) if all_nn_values else 1400
                    nn_margin = (nn_max - nn_min) * 0.1
                    nn_ylim = (nn_min - nn_margin, nn_max + nn_margin)
                    
                    # Calculate Y-axis limits for column 3 (Residuals - centered at 0)
                    if residual:
                        res_max = max(abs(min(residual)), abs(max(residual)))
                        res_ylim = (-res_max * 1.2, res_max * 1.2)
                    else:
                        res_ylim = (-100, 100)
                    
                    # Column 1: NN₇₀ (emerald) - adjusted positions for better spacing
                    ax1 = fig3b.add_axes([0.10, y_pos, col_width, row_height * 0.85])
                    ax1.plot(time_rel, nn_70, color=COLORS['emerald'], linewidth=1)
                    ax1.set_facecolor('white')
                    ax1.set_ylim(nn_ylim)
                    # Stim label vertical on the left side
                    ax1.text(-0.15, 0.5, f'Stim {stim_idx + 1}', transform=ax1.transAxes, 
                            fontsize=8, fontweight='bold', va='center', ha='right', rotation=90)
                    if row_idx == 0:
                        ax1.set_title('NN₇₀ (ms)', fontsize=8, fontweight='bold')
                    if row_idx == n_stims - 1:
                        ax1.set_xlabel('Time (s)', fontsize=7)
                    else:
                        ax1.set_xticklabels([])
                    ax1.tick_params(axis='both', labelsize=6)
                    ax1.grid(True, alpha=0.3)
                    
                    # Column 2: NN₇₀ + Trend (emerald + grey) - moved left
                    ax2 = fig3b.add_axes([0.36, y_pos, col_width, row_height * 0.85])
                    ax2.plot(time_rel, nn_70, color=COLORS['emerald'], linewidth=1, alpha=0.7)
                    if trend:
                        ax2.plot(time_rel, trend, color='#6b7280', linewidth=1.5)  # Grey color
                    ax2.set_facecolor('white')
                    ax2.set_ylim(nn_ylim)  # Same Y-axis as column 1
                    if row_idx == 0:
                        ax2.set_title('NN₇₀ + Trend', fontsize=8, fontweight='bold')
                    if row_idx == n_stims - 1:
                        ax2.set_xlabel('Time (s)', fontsize=7)
                    else:
                        ax2.set_xticklabels([])
                    ax2.set_yticklabels([])
                    ax2.tick_params(axis='both', labelsize=6)
                    ax2.grid(True, alpha=0.3)
                    
                    # Column 3: Residuals (amber) - more space from column 2
                    ax3 = fig3b.add_axes([0.66, y_pos, col_width, row_height * 0.85])
                    if residual:
                        ax3.plot(time_rel, residual, color=COLORS['amber'], linewidth=1)
                        ax3.axhline(y=0, color='gray', linestyle='--', linewidth=0.5, alpha=0.7)
                    ax3.set_facecolor('white')
                    ax3.set_ylim(res_ylim)  # Different Y-axis, centered at 0
                    if row_idx == 0:
                        ax3.set_title('Residual (ms)', fontsize=8, fontweight='bold')
                    if row_idx == n_stims - 1:
                        ax3.set_xlabel('Time (s)', fontsize=7)
                    else:
                        ax3.set_xticklabels([])
                    ax3.tick_params(axis='both', labelsize=6)
                    ax3.grid(True, alpha=0.3)
                
                add_page_footer(fig3b, page_num)
                pdf.savefig(fig3b)
                plt.close(fig3b)
        
        # ==================== PAGE 4: SPONTANEOUS ACTIVITY BF DATA TABLE ====================
        if request.per_minute_data:
            page_num += 1
            fig4 = plt.figure(figsize=(8.5, 11))
            fig4.suptitle('Spontaneous Activity BF Data Table', fontsize=14, fontweight='bold', y=0.96)
            
            ax = fig4.add_axes([0.05, 0.1, 0.9, 0.8])
            ax.axis('off')
            
            # Get baseline and drug readout windows for highlighting
            baseline_window = None
            drug_window = None
            
            # Get baseline window if baseline is enabled
            if request.baseline_enabled and request.baseline:
                baseline_range = request.baseline.get('baseline_bf_range')
                if baseline_range is not None:
                    # Normalize baseline range to "X-Y" format (remove " min" suffix if present)
                    try:
                        baseline_range_str = str(baseline_range).replace(' min', '').strip()
                        if '-' in baseline_range_str:
                            baseline_window = baseline_range_str
                        else:
                            bmin = int(float(baseline_range_str))
                            baseline_window = f"{bmin}-{bmin+1}"
                    except (ValueError, TypeError):
                        baseline_window = str(baseline_range).replace(' min', '').strip()
                
                # Also check baseline_bf_minute as fallback
                if baseline_window is None:
                    bf_min = request.baseline.get('baseline_bf_minute')
                    if bf_min is not None:
                        try:
                            bf_min = int(float(bf_min))
                            baseline_window = f"{bf_min}-{bf_min+1}"
                        except (ValueError, TypeError):
                            pass
            
            # Get drug readout window from drug_readout_settings (user override) or drug_readout (calculated)
            if request.drug_readout_enabled or request.drug_readout or request.drug_readout_settings:
                # First try user-specified override from drug_readout_settings
                if request.drug_readout_settings:
                    settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
                    if settings_bf not in (None, ''):
                        try:
                            perf_start = 0
                            perf_delay = 0
                            if request.all_drugs and len(request.all_drugs) > 0:
                                drug = request.all_drugs[0]
                                perf_start = int(float(drug.get('start', 0) or 0))
                                perf_delay = int(float(drug.get('delay', 0) or 0))
                            bf_min = int(float(settings_bf)) + perf_start + perf_delay
                            drug_window = f"{bf_min}-{bf_min+1}"
                        except (ValueError, TypeError):
                            pass
                
                # Fallback to calculated drug_readout if no user override
                if drug_window is None and request.drug_readout:
                    bf_min = request.drug_readout.get('bf_minute')
                    if bf_min is not None:
                        try:
                            bf_min = int(float(bf_min))
                            drug_window = f"{bf_min}-{bf_min+1}"
                        except (ValueError, TypeError):
                            pass
            
            headers = ['Window (min)', 'Mean BF (bpm)', 'Mean NN (ms)']
            table_data = []
            row_colors = []
            
            for pm in request.per_minute_data:
                minute_val = pm.get('minute', '')
                # Format window as "X-X+1"
                try:
                    minute_num = int(str(minute_val).split('-')[0]) if '-' in str(minute_val) else int(minute_val)
                    window_str = f"{minute_num}-{minute_num+1}"
                except (ValueError, TypeError):
                    window_str = str(minute_val)
                
                # Get BF and NN values - support both naming conventions
                bf_val = pm.get('mean_bf') or pm.get('avg_bf')
                nn_val = pm.get('mean_nn') or pm.get('avg_nn')
                
                table_data.append([
                    window_str,
                    f"{bf_val:.1f}" if bf_val else '—',
                    f"{nn_val:.1f}" if nn_val else '—',
                ])
                
                # Determine row color
                if baseline_window and window_str == baseline_window:
                    row_colors.append(TINTS['baseline'])
                elif drug_window and window_str == drug_window:
                    row_colors.append(TINTS['drug'])
                else:
                    row_colors.append(None)
            
            if table_data:
                table = ax.table(cellText=table_data, colLabels=headers, loc='upper center', cellLoc='center')
                table.auto_set_font_size(False)
                table.set_fontsize(9)
                table.scale(1.0, 1.8)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#e5e7eb')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor(COLORS['emerald'])
                    elif row > 0 and row <= len(row_colors) and row_colors[row-1]:
                        # Highlight AND bold baseline/drug readout rows
                        cell.set_facecolor(row_colors[row-1])
                        cell.set_text_props(fontweight='bold')
                    else:
                        cell.set_facecolor('#f0fdf4' if row % 2 == 0 else 'white')
            
            add_page_footer(fig4, page_num)
            pdf.savefig(fig4)
            plt.close(fig4)
        
        # ==================== PAGE 5: SPONTANEOUS ACTIVITY HRV DATA TABLE ====================
        if request.hrv_windows:
            page_num += 1
            fig5 = plt.figure(figsize=(8.5, 11))
            fig5.suptitle('Spontaneous Activity HRV Data Table', fontsize=14, fontweight='bold', y=0.96)
            
            ax = fig5.add_axes([0.05, 0.1, 0.9, 0.8])
            ax.axis('off')
            
            # Get baseline and drug readout windows for highlighting
            baseline_minute = None
            drug_minute = None
            
            # Get baseline minute if baseline is enabled
            if request.baseline_enabled and request.baseline:
                baseline_minute = request.baseline.get('baseline_hrv_minute')
                if baseline_minute is not None:
                    try:
                        baseline_minute = int(float(baseline_minute))
                    except (ValueError, TypeError):
                        baseline_minute = None
            
            # Get drug readout minute from drug_readout_settings (user override) or drug_readout (calculated)
            if request.drug_readout_enabled or request.drug_readout or request.drug_readout_settings:
                # First try user-specified override from drug_readout_settings
                if request.drug_readout_settings:
                    settings_hrv = request.drug_readout_settings.get('hrvReadoutMinute')
                    if settings_hrv not in (None, ''):
                        try:
                            perf_start = 0
                            perf_delay = 0
                            if request.all_drugs and len(request.all_drugs) > 0:
                                drug = request.all_drugs[0]
                                perf_start = int(float(drug.get('start', 0) or 0))
                                perf_delay = int(float(drug.get('delay', 0) or 0))
                            drug_minute = int(float(settings_hrv)) + perf_start + perf_delay
                        except (ValueError, TypeError):
                            pass
                
                # Fallback to calculated drug_readout if no user override
                if drug_minute is None and request.drug_readout:
                    drug_minute = request.drug_readout.get('hrv_minute')
                    if drug_minute is not None:
                        try:
                            drug_minute = int(float(drug_minute))
                        except (ValueError, TypeError):
                            drug_minute = None
            
            headers = ['Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀', 'BF']
            table_data = []
            row_colors = []
            
            for w in request.hrv_windows:
                sdnn = w.get('sdnn')
                ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
                minute = w.get('minute', 0)
                
                # Convert minute to int for comparison
                try:
                    if isinstance(minute, (int, float)):
                        minute_num = int(minute)
                    else:
                        minute_str = str(minute)
                        minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                except (ValueError, TypeError):
                    minute_num = None
                
                table_data.append([
                    w.get('window', ''),
                    f"{w.get('ln_rmssd70', 0):.3f}" if w.get('ln_rmssd70') else '—',
                    f"{w.get('rmssd70', 0):.1f}" if w.get('rmssd70') else '—',
                    f"{ln_sdnn:.3f}" if ln_sdnn else '—',
                    f"{sdnn:.1f}" if sdnn else '—',
                    f"{w.get('pnn50', 0):.1f}" if w.get('pnn50') is not None else '0.0',
                    f"{w.get('mean_bf', 0):.1f}" if w.get('mean_bf') else '—',
                ])
                
                # Determine row color
                if baseline_minute is not None and minute_num == baseline_minute:
                    row_colors.append(TINTS['baseline'])
                elif drug_minute is not None and minute_num == drug_minute:
                    row_colors.append(TINTS['drug'])
                else:
                    row_colors.append(None)
            
            if table_data:
                table = ax.table(cellText=table_data, colLabels=headers, loc='upper center', cellLoc='center')
                table.auto_set_font_size(False)
                table.set_fontsize(8)
                table.scale(1.0, 1.6)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#e5e7eb')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor(COLORS['purple'])
                    elif row > 0 and row <= len(row_colors) and row_colors[row-1]:
                        # Highlight AND bold baseline/drug readout rows
                        cell.set_facecolor(row_colors[row-1])
                        cell.set_text_props(fontweight='bold')
                    else:
                        cell.set_facecolor('#faf5ff' if row % 2 == 0 else 'white')
            
            add_page_footer(fig5, page_num)
            pdf.savefig(fig5)
            plt.close(fig5)
        
        # ==================== PAGE 6: LIGHT-INDUCED HRA DATA TABLE ====================
        if request.light_enabled and request.light_response:
            valid = [r for r in request.light_response if r]
            if valid:
                page_num += 1
                fig6 = plt.figure(figsize=(8.5, 11))
                fig6.suptitle('Light-Induced HRA Data Table', fontsize=14, fontweight='bold', y=0.96)
                
                ax = fig6.add_axes([0.05, 0.1, 0.9, 0.8])
                ax.axis('off')
                
                # All HRA metrics except beats
                headers = ['Stim', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'Amplitude', 'BF End', 'Recovery %', 'TTP (s)', 'RoC (1/min)']
                table_data = []
                
                for i, r in enumerate(valid):
                    table_data.append([
                        str(i + 1),
                        f"{r.get('baseline_bf', 0):.1f}" if r.get('baseline_bf') else '—',
                        f"{r.get('avg_bf', 0):.1f}" if r.get('avg_bf') else '—',
                        f"{r.get('peak_bf', 0):.1f}" if r.get('peak_bf') else '—',
                        f"{r.get('peak_norm_pct', 0):.1f}" if r.get('peak_norm_pct') else '—',
                        f"{r.get('amplitude', 0):.1f}" if r.get('amplitude') is not None else '—',
                        f"{r.get('bf_end', 0):.1f}" if r.get('bf_end') else '—',
                        f"{r.get('bf_end_pct', 0):.1f}" if r.get('bf_end_pct') else '—',
                        f"{r.get('time_to_peak_sec', 0):.1f}" if r.get('time_to_peak_sec') is not None else '—',
                        f"{r.get('rate_of_change', 0):.3f}" if r.get('rate_of_change') is not None else '—',
                    ])
                
                # Add average row
                if len(valid) > 1:
                    def safe_avg(key):
                        vals = [r.get(key) for r in valid if r.get(key) is not None]
                        return np.mean(vals) if vals else None
                    
                    avg_row = [
                        'Avg',
                        f"{safe_avg('baseline_bf'):.1f}" if safe_avg('baseline_bf') else '—',
                        f"{safe_avg('avg_bf'):.1f}" if safe_avg('avg_bf') else '—',
                        f"{safe_avg('peak_bf'):.1f}" if safe_avg('peak_bf') else '—',
                        f"{safe_avg('peak_norm_pct'):.1f}" if safe_avg('peak_norm_pct') else '—',
                        f"{safe_avg('amplitude'):.1f}" if safe_avg('amplitude') is not None else '—',
                        f"{safe_avg('bf_end'):.1f}" if safe_avg('bf_end') else '—',
                        f"{safe_avg('bf_end_pct'):.1f}" if safe_avg('bf_end_pct') else '—',
                        f"{safe_avg('time_to_peak_sec'):.1f}" if safe_avg('time_to_peak_sec') is not None else '—',
                        f"{safe_avg('rate_of_change'):.3f}" if safe_avg('rate_of_change') is not None else '—',
                    ]
                    table_data.append(avg_row)
                
                table = ax.table(cellText=table_data, colLabels=headers, loc='upper center', cellLoc='center')
                table.auto_set_font_size(False)
                table.set_fontsize(7)  # Smaller font for more columns
                table.scale(1.0, 1.8)
                
                for (row, col), cell in table.get_celld().items():
                    cell.set_edgecolor('#e5e7eb')
                    if row == 0:
                        cell.set_text_props(fontweight='bold', color='white')
                        cell.set_facecolor(COLORS['amber'])
                    elif row == len(table_data):
                        cell.set_text_props(fontweight='bold')
                        cell.set_facecolor('#fef3c7')
                    else:
                        cell.set_facecolor('#fffbeb' if row % 2 == 0 else 'white')
                
                add_page_footer(fig6, page_num)
                pdf.savefig(fig6)
                plt.close(fig6)
        
        # ==================== PAGE 7: LIGHT-INDUCED CORRECTED HRV (DETRENDED) DATA TABLE ====================
        if request.light_enabled and request.light_metrics_detrended:
            # Support both 'per_stim' and 'per_pulse' keys (backend uses 'per_pulse')
            per_stim = request.light_metrics_detrended.get('per_stim') or request.light_metrics_detrended.get('per_pulse', [])
            final = request.light_metrics_detrended.get('final', {})
            
            if per_stim or final:
                page_num += 1
                fig7 = plt.figure(figsize=(8.5, 11))
                fig7.suptitle('Light-Induced Corrected HRV (Detrended) Data Table', fontsize=14, fontweight='bold', y=0.96)
                
                ax = fig7.add_axes([0.05, 0.1, 0.9, 0.8])
                ax.axis('off')
                
                headers = ['Stim', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀']
                table_data = []
                
                # Always show 5 stims before the median
                num_stims = max(5, len(per_stim))
                for i in range(num_stims):
                    s = per_stim[i] if i < len(per_stim) else None
                    # Always show the stim number, check if we have actual HRV data
                    has_data = s and (s.get('ln_rmssd70_detrended') is not None or 
                                     s.get('rmssd70_detrended') is not None or
                                     s.get('ln_sdnn70_detrended') is not None)
                    
                    if has_data:
                        table_data.append([
                            str(i + 1),
                            f"{s.get('ln_rmssd70_detrended', 0):.3f}" if s.get('ln_rmssd70_detrended') is not None else '—',
                            f"{s.get('rmssd70_detrended', 0):.3f}" if s.get('rmssd70_detrended') is not None else '—',
                            f"{s.get('ln_sdnn70_detrended', 0):.3f}" if s.get('ln_sdnn70_detrended') is not None else '—',
                            f"{s.get('sdnn_detrended', 0):.3f}" if s.get('sdnn_detrended') is not None else '—',
                            f"{s.get('pnn50_detrended', 0):.1f}" if s.get('pnn50_detrended') is not None else '—',
                        ])
                    else:
                        # Show stim number even if data is empty/missing
                        table_data.append([str(i + 1), '—', '—', '—', '—', '—'])
                
                # Add median row at the end
                if final:
                    table_data.append([
                        'Median',
                        f"{final.get('ln_rmssd70_detrended', 0):.3f}" if final.get('ln_rmssd70_detrended') else '—',
                        f"{final.get('rmssd70_detrended', 0):.3f}" if final.get('rmssd70_detrended') else '—',
                        f"{final.get('ln_sdnn70_detrended', 0):.3f}" if final.get('ln_sdnn70_detrended') else '—',
                        f"{final.get('sdnn_detrended', 0):.3f}" if final.get('sdnn_detrended') else '—',
                        f"{final.get('pnn50_detrended', 0):.1f}" if final.get('pnn50_detrended') is not None else '—',
                    ])
                
                if table_data:
                    table = ax.table(cellText=table_data, colLabels=headers, loc='upper center', cellLoc='center')
                    table.auto_set_font_size(False)
                    table.set_fontsize(9)
                    table.scale(1.0, 1.8)
                    
                    for (row, col), cell in table.get_celld().items():
                        cell.set_edgecolor('#e5e7eb')
                        if row == 0:
                            cell.set_text_props(fontweight='bold', color='white')
                            cell.set_facecolor(COLORS['emerald'])
                        elif row == len(table_data):
                            cell.set_text_props(fontweight='bold')
                            cell.set_facecolor('#d1fae5')
                        else:
                            cell.set_facecolor('#ecfdf5' if row % 2 == 0 else 'white')
                
                add_page_footer(fig7, page_num)
                pdf.savefig(fig7)
                plt.close(fig7)
    
    buf.seek(0)
    return buf


def create_nature_excel(request):
    """Create a clean Excel export matching PDF structure"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
    from openpyxl.utils import get_column_letter
    
    wb = Workbook()
    
    # Styles
    header_font = Font(bold=True, color='FFFFFF', size=10)
    section_font = Font(bold=True, size=11)
    data_font = Font(size=9)
    bold_data_font = Font(bold=True, size=9)
    
    emerald_fill = PatternFill(start_color='10B981', end_color='10B981', fill_type='solid')
    purple_fill = PatternFill(start_color='A855F7', end_color='A855F7', fill_type='solid')
    amber_fill = PatternFill(start_color='F59E0B', end_color='F59E0B', fill_type='solid')
    sky_fill = PatternFill(start_color='0EA5E9', end_color='0EA5E9', fill_type='solid')
    dark_fill = PatternFill(start_color='18181B', end_color='18181B', fill_type='solid')
    gray_fill = PatternFill(start_color='6B7280', end_color='6B7280', fill_type='solid')
    
    baseline_fill = PatternFill(start_color='E0F2FE', end_color='E0F2FE', fill_type='solid')
    drug_fill = PatternFill(start_color='F3E8FF', end_color='F3E8FF', fill_type='solid')
    light_fill = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')
    avg_fill = PatternFill(start_color='D1FAE5', end_color='D1FAE5', fill_type='solid')
    
    thin_border = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )
    
    # ==================== SHEET 1: SUMMARY ====================
    ws = wb.active
    ws.title = 'Summary'
    ws.column_dimensions['A'].width = 22
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 3  # Empty separator column
    ws.column_dimensions['D'].width = 22
    ws.column_dimensions['E'].width = 25
    
    row = 1
    title = request.recording_name or request.filename or 'Recording Analysis'
    ws.cell(row=row, column=1, value=title).font = Font(bold=True, size=14)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=5)
    row += 1
    ws.cell(row=row, column=1, value='Electrophysiology Analysis Report by NEHER').font = Font(size=10, color='71717A')
    row += 1
    if request.recording_date:
        ws.cell(row=row, column=1, value=f'Recording Date: {request.recording_date}').font = Font(size=9, color='A1A1AA')
    row += 2
    
    # LEFT COLUMN - RECORDING INFO
    left_col = 1
    right_col = 4  # Column D (after empty separator column C)
    left_row = row
    right_row = row
    
    # RECORDING INFO
    ws.cell(row=left_row, column=left_col, value='RECORDING INFO').font = header_font
    ws.cell(row=left_row, column=left_col).fill = dark_fill
    ws.merge_cells(start_row=left_row, start_column=left_col, end_row=left_row, end_column=left_col+1)
    left_row += 1
    
    if request.original_filename:
        ws.cell(row=left_row, column=left_col, value='Original File:').font = data_font
        ws.cell(row=left_row, column=left_col+1, value=request.original_filename).font = bold_data_font
        left_row += 1
    if request.recording_date:
        ws.cell(row=left_row, column=left_col, value='Recording Date:').font = data_font
        ws.cell(row=left_row, column=left_col+1, value=request.recording_date).font = bold_data_font
        left_row += 1
    if request.summary:
        if 'Total Beats' in request.summary:
            ws.cell(row=left_row, column=left_col, value='Total Beats:').font = data_font
            ws.cell(row=left_row, column=left_col+1, value=request.summary['Total Beats']).font = bold_data_font
            left_row += 1
        if 'Kept Beats' in request.summary:
            ws.cell(row=left_row, column=left_col, value='Kept Beats:').font = data_font
            ws.cell(row=left_row, column=left_col+1, value=request.summary['Kept Beats']).font = bold_data_font
            left_row += 1
        if 'Filter Range' in request.summary:
            ws.cell(row=left_row, column=left_col, value='Filter Range:').font = data_font
            ws.cell(row=left_row, column=left_col+1, value=request.summary['Filter Range']).font = bold_data_font
            left_row += 1
    left_row += 1
    
    # TISSUE INFO
    if request.organoid_info:
        ws.cell(row=left_row, column=left_col, value='TISSUE INFO').font = header_font
        ws.cell(row=left_row, column=left_col).fill = gray_fill
        ws.merge_cells(start_row=left_row, start_column=left_col, end_row=left_row, end_column=left_col+1)
        left_row += 1
        
        for idx, org in enumerate(request.organoid_info):
            if org.get('cell_type'):
                cell_type = org.get('other_cell_type') if org.get('cell_type') == 'Other' else org.get('cell_type')
                label = f'Cell Type {idx + 1}:' if len(request.organoid_info) > 1 else 'Cell Type:'
                ws.cell(row=left_row, column=left_col, value=label).font = data_font
                ws.cell(row=left_row, column=left_col+1, value=cell_type or '—').font = bold_data_font
                left_row += 1
            if org.get('line_name'):
                ws.cell(row=left_row, column=left_col, value='Line:').font = data_font
                ws.cell(row=left_row, column=left_col+1, value=org.get('line_name')).font = bold_data_font
                left_row += 1
            if org.get('passage_number'):
                ws.cell(row=left_row, column=left_col, value='Passage:').font = data_font
                ws.cell(row=left_row, column=left_col+1, value=org.get('passage_number')).font = bold_data_font
                left_row += 1
            if org.get('age_at_recording') is not None:
                ws.cell(row=left_row, column=left_col, value='Age at Recording:').font = data_font
                ws.cell(row=left_row, column=left_col+1, value=f"{org.get('age_at_recording')} days").font = bold_data_font
                left_row += 1
            if org.get('transfection'):
                trans = org['transfection']
                if trans.get('name'):
                    ws.cell(row=left_row, column=left_col, value='Transfection:').font = data_font
                    ws.cell(row=left_row, column=left_col+1, value=trans.get('name')).font = bold_data_font
                    left_row += 1
                if trans.get('days_since_transfection') is not None:
                    ws.cell(row=left_row, column=left_col, value='Days Post-Transf.:').font = data_font
                    ws.cell(row=left_row, column=left_col+1, value=trans.get('days_since_transfection')).font = bold_data_font
                    left_row += 1
        
        if request.days_since_fusion is not None:
            ws.cell(row=left_row, column=left_col, value='Days Since Fusion:').font = data_font
            ws.cell(row=left_row, column=left_col+1, value=request.days_since_fusion).font = bold_data_font
            left_row += 1
        left_row += 1
    
    # DRUG PERFUSION
    if request.all_drugs and len(request.all_drugs) > 0:
        ws.cell(row=left_row, column=left_col, value='DRUG PERFUSION').font = header_font
        ws.cell(row=left_row, column=left_col).fill = purple_fill
        ws.merge_cells(start_row=left_row, start_column=left_col, end_row=left_row, end_column=left_col+1)
        left_row += 1
        
        for drug in request.all_drugs:
            ws.cell(row=left_row, column=left_col, value='Drug:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = drug_fill
            ws.cell(row=left_row, column=left_col+1, value=drug.get('name', 'Drug')).font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = drug_fill
            left_row += 1
            if drug.get('concentration'):
                ws.cell(row=left_row, column=left_col, value='Concentration:').font = data_font
                ws.cell(row=left_row, column=left_col).fill = drug_fill
                ws.cell(row=left_row, column=left_col+1, value=f"{drug.get('concentration')}µM").font = bold_data_font
                ws.cell(row=left_row, column=left_col+1).fill = drug_fill
                left_row += 1
            ws.cell(row=left_row, column=left_col, value='Perf. Start:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = drug_fill
            ws.cell(row=left_row, column=left_col+1, value=f"{drug.get('start', 0)} min").font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = drug_fill
            left_row += 1
            ws.cell(row=left_row, column=left_col, value='Perf. Delay:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = drug_fill
            ws.cell(row=left_row, column=left_col+1, value=f"{drug.get('delay', 0)} min").font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = drug_fill
            left_row += 1
            perf_time = (drug.get('start', 0) or 0) + (drug.get('delay', 0) or 0)
            ws.cell(row=left_row, column=left_col, value='Perf. Time:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = drug_fill
            ws.cell(row=left_row, column=left_col+1, value=f"{perf_time} min").font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = drug_fill
            left_row += 1
            perf_end = drug.get('end')
            ws.cell(row=left_row, column=left_col, value='Perf. End:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = drug_fill
            ws.cell(row=left_row, column=left_col+1, value=f"{perf_end} min" if perf_end is not None else '—').font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = drug_fill
            left_row += 1
        left_row += 1
    
    # LIGHT STIMULATION
    if request.light_enabled:
        ws.cell(row=left_row, column=left_col, value='LIGHT STIMULATION').font = header_font
        ws.cell(row=left_row, column=left_col).fill = amber_fill
        ws.merge_cells(start_row=left_row, start_column=left_col, end_row=left_row, end_column=left_col+1)
        left_row += 1
        
        ws.cell(row=left_row, column=left_col, value='Status:').font = data_font
        ws.cell(row=left_row, column=left_col).fill = light_fill
        ws.cell(row=left_row, column=left_col+1, value='Enabled').font = bold_data_font
        ws.cell(row=left_row, column=left_col+1).fill = light_fill
        left_row += 1
        
        if request.light_stim_count and request.light_stim_count > 0:
            ws.cell(row=left_row, column=left_col, value='Stims Detected:').font = data_font
            ws.cell(row=left_row, column=left_col).fill = light_fill
            ws.cell(row=left_row, column=left_col+1, value=str(request.light_stim_count)).font = bold_data_font
            ws.cell(row=left_row, column=left_col+1).fill = light_fill
            left_row += 1
        
        if request.light_pulses and len(request.light_pulses) > 0:
            first_pulse = request.light_pulses[0]
            light_start = first_pulse.get('start_min')
            if light_start is not None:
                ws.cell(row=left_row, column=left_col, value='Stims Start:').font = data_font
                ws.cell(row=left_row, column=left_col).fill = light_fill
                ws.cell(row=left_row, column=left_col+1, value=f"{light_start:.2f} min").font = bold_data_font
                ws.cell(row=left_row, column=left_col+1).fill = light_fill
                left_row += 1
        
        if request.light_params:
            if request.light_params.get('pulseDuration') is not None:
                ws.cell(row=left_row, column=left_col, value='Stim Duration:').font = data_font
                ws.cell(row=left_row, column=left_col).fill = light_fill
                ws.cell(row=left_row, column=left_col+1, value=f"{request.light_params.get('pulseDuration')} sec").font = bold_data_font
                ws.cell(row=left_row, column=left_col+1).fill = light_fill
                left_row += 1
            if request.light_params.get('interval'):
                interval_val = request.light_params.get('interval')
                interval_display_map = {
                    'decreasing': '60s-30s-20s-10s',
                    '60': 'Uniform 60s',
                    '30': 'Uniform 30s',
                }
                interval_display = interval_display_map.get(str(interval_val), str(interval_val))
                ws.cell(row=left_row, column=left_col, value='Inter-stimuli intervals:').font = data_font
                ws.cell(row=left_row, column=left_col).fill = light_fill
                ws.cell(row=left_row, column=left_col+1, value=interval_display).font = bold_data_font
                ws.cell(row=left_row, column=left_col+1).fill = light_fill
                left_row += 1
    
    # RIGHT COLUMN - READOUTS
    # BASELINE READOUT
    if request.baseline_enabled and request.baseline:
        ws.cell(row=right_row, column=right_col, value='BASELINE READOUT').font = header_font
        ws.cell(row=right_row, column=right_col).fill = sky_fill
        ws.merge_cells(start_row=right_row, start_column=right_col, end_row=right_row, end_column=right_col+1)
        right_row += 1
        
        baseline = request.baseline
        bf_val = baseline.get('baseline_bf')
        ws.cell(row=right_row, column=right_col, value='Mean BF:').font = data_font
        ws.cell(row=right_row, column=right_col).fill = baseline_fill
        ws.cell(row=right_row, column=right_col+1, value=f"{bf_val:.1f} bpm" if bf_val else '—').font = bold_data_font
        ws.cell(row=right_row, column=right_col+1).fill = baseline_fill
        right_row += 1
        
        ln_rmssd = baseline.get('baseline_ln_rmssd70')
        ws.cell(row=right_row, column=right_col, value='ln(RMSSD₇₀):').font = data_font
        ws.cell(row=right_row, column=right_col).fill = baseline_fill
        ws.cell(row=right_row, column=right_col+1, value=f"{ln_rmssd:.3f}" if ln_rmssd else '—').font = bold_data_font
        ws.cell(row=right_row, column=right_col+1).fill = baseline_fill
        right_row += 1
        
        sdnn = baseline.get('baseline_sdnn')
        ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
        ws.cell(row=right_row, column=right_col, value='ln(SDNN₇₀):').font = data_font
        ws.cell(row=right_row, column=right_col).fill = baseline_fill
        ws.cell(row=right_row, column=right_col+1, value=f"{ln_sdnn:.3f}" if ln_sdnn else '—').font = bold_data_font
        ws.cell(row=right_row, column=right_col+1).fill = baseline_fill
        right_row += 1
        
        pnn50 = baseline.get('baseline_pnn50')
        ws.cell(row=right_row, column=right_col, value='pNN50₇₀:').font = data_font
        ws.cell(row=right_row, column=right_col).fill = baseline_fill
        ws.cell(row=right_row, column=right_col+1, value=f"{pnn50:.1f}%" if pnn50 is not None else '—').font = bold_data_font
        ws.cell(row=right_row, column=right_col+1).fill = baseline_fill
        right_row += 2
    
    # DRUG READOUT
    if request.drug_readout_enabled and request.all_drugs and len(request.all_drugs) > 0:
        ws.cell(row=right_row, column=right_col, value='DRUG READOUT').font = header_font
        ws.cell(row=right_row, column=right_col).fill = purple_fill
        ws.merge_cells(start_row=right_row, start_column=right_col, end_row=right_row, end_column=right_col+1)
        right_row += 1
        
        # Get drug readout data (same logic as PDF)
        drug_bf = None
        drug_hrv_data = None
        drug_bf_minute = None
        drug_hrv_minute = None
        
        if request.drug_readout:
            drug_bf_minute = request.drug_readout.get('bf_minute')
            drug_hrv_minute = request.drug_readout.get('hrv_minute')
        
        if request.drug_readout_settings:
            settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
            settings_hrv = request.drug_readout_settings.get('hrvReadoutMinute')
            perf_start = 0
            perf_delay = 0
            if request.all_drugs and len(request.all_drugs) > 0:
                drug = request.all_drugs[0]
                perf_start = drug.get('start', 0) or 0
                perf_delay = drug.get('delay', 0) or 0
            
            if request.drug_readout_settings.get('enableBfReadout') and settings_bf not in (None, ''):
                try:
                    drug_bf_minute = int(float(settings_bf)) + perf_start + perf_delay
                except (ValueError, TypeError):
                    pass
            if request.drug_readout_settings.get('enableHrvReadout') and settings_hrv not in (None, ''):
                try:
                    drug_hrv_minute = int(float(settings_hrv)) + perf_start + perf_delay
                except (ValueError, TypeError):
                    pass
        
        # Find drug BF and HRV data
        if drug_bf_minute is not None and request.per_minute_data:
            for pm in request.per_minute_data:
                try:
                    minute_str = str(pm.get('minute', ''))
                    minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                    if minute_num == drug_bf_minute:
                        drug_bf = pm.get('mean_bf')
                        break
                except (ValueError, TypeError):
                    pass
        
        if drug_hrv_minute is not None and request.hrv_windows:
            for w in request.hrv_windows:
                try:
                    w_minute = w.get('minute')
                    if isinstance(w_minute, (int, float)):
                        w_minute_num = int(w_minute)
                    else:
                        w_minute_str = str(w_minute)
                        w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                    if w_minute_num == drug_hrv_minute:
                        drug_hrv_data = w
                        if drug_bf is None and w.get('mean_bf'):
                            drug_bf = w.get('mean_bf')
                        break
                except (ValueError, TypeError):
                    pass
        
        ws.cell(row=right_row, column=right_col, value='Mean BF:').font = data_font
        ws.cell(row=right_row, column=right_col).fill = drug_fill
        ws.cell(row=right_row, column=right_col+1, value=f"{drug_bf:.1f} bpm" if drug_bf else '—').font = bold_data_font
        ws.cell(row=right_row, column=right_col+1).fill = drug_fill
        right_row += 1
        
        if drug_hrv_data:
            ln_rmssd = drug_hrv_data.get('ln_rmssd70')
            ws.cell(row=right_row, column=right_col, value='ln(RMSSD₇₀):').font = data_font
            ws.cell(row=right_row, column=right_col).fill = drug_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{ln_rmssd:.3f}" if ln_rmssd else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = drug_fill
            right_row += 1
            
            sdnn = drug_hrv_data.get('sdnn')
            ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
            ws.cell(row=right_row, column=right_col, value='ln(SDNN₇₀):').font = data_font
            ws.cell(row=right_row, column=right_col).fill = drug_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{ln_sdnn:.3f}" if ln_sdnn else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = drug_fill
            right_row += 1
            
            pnn50 = drug_hrv_data.get('pnn50')
            ws.cell(row=right_row, column=right_col, value='pNN50₇₀:').font = data_font
            ws.cell(row=right_row, column=right_col).fill = drug_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{pnn50:.1f}%" if pnn50 is not None else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = drug_fill
            right_row += 1
        right_row += 1
    
    # LIGHT READOUT
    if request.light_enabled and (request.light_response or request.light_metrics_detrended):
        ws.cell(row=right_row, column=right_col, value='LIGHT READOUT').font = header_font
        ws.cell(row=right_row, column=right_col).fill = amber_fill
        ws.merge_cells(start_row=right_row, start_column=right_col, end_row=right_row, end_column=right_col+1)
        right_row += 1
        
        if request.light_response:
            valid = [r for r in request.light_response if r]
            if valid:
                baseline_bf_vals = [r.get('baseline_bf') for r in valid if r.get('baseline_bf')]
                baseline_bf = np.mean(baseline_bf_vals) if baseline_bf_vals else None
                avg_bf = np.mean([r.get('avg_bf', 0) for r in valid if r.get('avg_bf')])
                peak_bf = np.mean([r.get('peak_bf', 0) for r in valid if r.get('peak_bf')])
                peak_norm_vals = [r.get('peak_norm_pct') for r in valid if r.get('peak_norm_pct') is not None]
                peak_norm = np.mean(peak_norm_vals) if peak_norm_vals else None
                amplitude_vals = [r.get('amplitude') for r in valid if r.get('amplitude')]
                amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                ttp_vals = [r.get('time_to_peak_sec') for r in valid if r.get('time_to_peak_sec') is not None]
                ttp = np.mean(ttp_vals) if ttp_vals else None
                ttp_1st = valid[0].get('time_to_peak_sec') if valid else None
                roc_vals = [r.get('rate_of_change') for r in valid if r.get('rate_of_change') is not None]
                roc = np.mean(roc_vals) if roc_vals else None
                recovery_bf_vals = [r.get('bf_end') for r in valid if r.get('bf_end')]
                recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                recovery_pct_vals = [r.get('bf_end_pct') for r in valid if r.get('bf_end_pct')]
                recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                
                metrics = [
                    ('Baseline BF:', f"{baseline_bf:.1f} bpm" if baseline_bf else '—'),
                    ('Avg BF:', f"{avg_bf:.1f} bpm"),
                    ('Peak BF:', f"{peak_bf:.1f} bpm"),
                    ('Peak (Norm.):', f"{peak_norm:.1f}%" if peak_norm else '—'),
                    ('Amplitude:', f"{amplitude:.1f} bpm" if amplitude else '—'),
                    ('Time to Peak:', f"{ttp:.1f} s" if ttp is not None else '—'),
                    ('TTP (1st Stim):', f"{ttp_1st:.1f} s" if ttp_1st is not None else '—'),
                    ('Rate of Change:', f"{roc:.3f} 1/min" if roc else '—'),
                    ('Recovery BF:', f"{recovery_bf:.1f} bpm" if recovery_bf else '—'),
                    ('Recovery %:', f"{recovery_pct:.1f}%" if recovery_pct else '—'),
                ]
                
                for label, value in metrics:
                    ws.cell(row=right_row, column=right_col, value=label).font = data_font
                    ws.cell(row=right_row, column=right_col).fill = light_fill
                    ws.cell(row=right_row, column=right_col+1, value=value).font = bold_data_font
                    ws.cell(row=right_row, column=right_col+1).fill = light_fill
                    right_row += 1
        
        # Corrected HRV
        if request.light_metrics_detrended and request.light_metrics_detrended.get('final'):
            right_row += 1
            ws.cell(row=right_row, column=right_col, value='Corrected HRV:').font = Font(size=9, italic=True, color='52525B')
            right_row += 1
            final = request.light_metrics_detrended['final']
            
            ln_rmssd = final.get('ln_rmssd70_detrended')
            ws.cell(row=right_row, column=right_col, value='ln(RMSSD₇₀):').font = data_font
            ws.cell(row=right_row, column=right_col).fill = light_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{ln_rmssd:.3f}" if ln_rmssd else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = light_fill
            right_row += 1
            
            ln_sdnn = final.get('ln_sdnn70_detrended')
            ws.cell(row=right_row, column=right_col, value='ln(SDNN₇₀):').font = data_font
            ws.cell(row=right_row, column=right_col).fill = light_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{ln_sdnn:.3f}" if ln_sdnn else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = light_fill
            right_row += 1
            
            pnn50 = final.get('pnn50_detrended')
            ws.cell(row=right_row, column=right_col, value='pNN50₇₀:').font = data_font
            ws.cell(row=right_row, column=right_col).fill = light_fill
            ws.cell(row=right_row, column=right_col+1, value=f"{pnn50:.1f}%" if pnn50 is not None else '—').font = bold_data_font
            ws.cell(row=right_row, column=right_col+1).fill = light_fill
            right_row += 1
    
    # ==================== SHEET 2: SPONTANEOUS BF ====================
    if request.per_minute_data:
        ws_bf = wb.create_sheet('Spontaneous BF')
        ws_bf.append(['Window (min)', 'Mean BF (bpm)', 'Mean NN (ms)'])
        for cell in ws_bf[1]:
            cell.font = header_font
            cell.fill = emerald_fill
            cell.border = thin_border
        
        baseline_window = None
        drug_window = None
        
        if request.baseline_enabled and request.baseline:
            baseline_range = request.baseline.get('baseline_bf_range')
            if baseline_range is not None:
                baseline_range_str = str(baseline_range).replace(' min', '').strip()
                if '-' in baseline_range_str:
                    baseline_window = baseline_range_str
                else:
                    try:
                        bmin = int(float(baseline_range_str))
                        baseline_window = f"{bmin}-{bmin+1}"
                    except:
                        pass
        
        if request.drug_readout_enabled and request.drug_readout_settings:
            settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
            if settings_bf not in (None, ''):
                try:
                    perf_start = 0
                    perf_delay = 0
                    if request.all_drugs and len(request.all_drugs) > 0:
                        drug = request.all_drugs[0]
                        perf_start = int(float(drug.get('start', 0) or 0))
                        perf_delay = int(float(drug.get('delay', 0) or 0))
                    bf_min = int(float(settings_bf)) + perf_start + perf_delay
                    drug_window = f"{bf_min}-{bf_min+1}"
                except:
                    pass
        
        for pm in request.per_minute_data:
            minute_val = pm.get('minute', '')
            try:
                minute_num = int(str(minute_val).split('-')[0]) if '-' in str(minute_val) else int(minute_val)
                window_str = f"{minute_num}-{minute_num+1}"
            except (ValueError, TypeError):
                window_str = str(minute_val)
            
            bf_val = pm.get('mean_bf') or pm.get('avg_bf')
            nn_val = pm.get('mean_nn') or pm.get('avg_nn')
            
            ws_bf.append([
                window_str,
                round(bf_val, 1) if bf_val else None,
                round(nn_val, 1) if nn_val else None,
            ])
            
            row_num = ws_bf.max_row
            for cell in ws_bf[row_num]:
                cell.border = thin_border
            if baseline_window and window_str == baseline_window:
                for cell in ws_bf[row_num]:
                    cell.fill = baseline_fill
                    cell.font = bold_data_font
            elif drug_window and window_str == drug_window:
                for cell in ws_bf[row_num]:
                    cell.fill = drug_fill
                    cell.font = bold_data_font
        
        for col in range(1, 4):
            ws_bf.column_dimensions[get_column_letter(col)].width = 18
    
    # ==================== SHEET 3: SPONTANEOUS HRV ====================
    if request.hrv_windows:
        ws_hrv = wb.create_sheet('Spontaneous HRV')
        ws_hrv.append(['Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀', 'BF'])
        for cell in ws_hrv[1]:
            cell.font = header_font
            cell.fill = purple_fill
            cell.border = thin_border
        
        baseline_minute = None
        drug_minute = None
        
        if request.baseline_enabled and request.baseline:
            baseline_minute = request.baseline.get('baseline_hrv_minute')
            if baseline_minute is not None:
                try:
                    baseline_minute = int(float(baseline_minute))
                except:
                    baseline_minute = None
        
        if request.drug_readout_enabled and request.drug_readout_settings:
            settings_hrv = request.drug_readout_settings.get('hrvReadoutMinute')
            if settings_hrv not in (None, ''):
                try:
                    perf_start = 0
                    perf_delay = 0
                    if request.all_drugs and len(request.all_drugs) > 0:
                        drug = request.all_drugs[0]
                        perf_start = int(float(drug.get('start', 0) or 0))
                        perf_delay = int(float(drug.get('delay', 0) or 0))
                    drug_minute = int(float(settings_hrv)) + perf_start + perf_delay
                except:
                    pass
        
        for w in request.hrv_windows:
            sdnn = w.get('sdnn')
            ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
            minute = w.get('minute', 0)
            
            try:
                if isinstance(minute, (int, float)):
                    minute_num = int(minute)
                else:
                    minute_str = str(minute)
                    minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
            except:
                minute_num = None
            
            ws_hrv.append([
                w.get('window', ''),
                round(w.get('ln_rmssd70', 0), 3) if w.get('ln_rmssd70') else None,
                round(w.get('rmssd70', 0), 1) if w.get('rmssd70') else None,
                round(ln_sdnn, 3) if ln_sdnn else None,
                round(sdnn, 1) if sdnn else None,
                round(w.get('pnn50', 0), 1) if w.get('pnn50') is not None else 0,
                round(w.get('mean_bf', 0), 1) if w.get('mean_bf') else None,
            ])
            
            row_num = ws_hrv.max_row
            for cell in ws_hrv[row_num]:
                cell.border = thin_border
            if baseline_minute is not None and minute_num == baseline_minute:
                for cell in ws_hrv[row_num]:
                    cell.fill = baseline_fill
                    cell.font = bold_data_font
            elif drug_minute is not None and minute_num == drug_minute:
                for cell in ws_hrv[row_num]:
                    cell.fill = drug_fill
                    cell.font = bold_data_font
        
        for col in range(1, 8):
            ws_hrv.column_dimensions[get_column_letter(col)].width = 14
    
    # ==================== SHEET 4: LIGHT HRA ====================
    if request.light_enabled and request.light_response:
        valid = [r for r in request.light_response if r]
        if valid:
            ws_hra = wb.create_sheet('Light HRA')
            ws_hra.append(['Stim', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'Amplitude', 'BF End', 'Recovery %', 'TTP (s)', 'RoC (1/min)'])
            for cell in ws_hra[1]:
                cell.font = header_font
                cell.fill = amber_fill
                cell.border = thin_border
            
            for i, r in enumerate(valid):
                ws_hra.append([
                    i + 1,
                    round(r.get('baseline_bf', 0), 1) if r.get('baseline_bf') else None,
                    round(r.get('avg_bf', 0), 1) if r.get('avg_bf') else None,
                    round(r.get('peak_bf', 0), 1) if r.get('peak_bf') else None,
                    round(r.get('peak_norm_pct', 0), 1) if r.get('peak_norm_pct') else None,
                    round(r.get('amplitude', 0), 1) if r.get('amplitude') is not None else None,
                    round(r.get('bf_end', 0), 1) if r.get('bf_end') else None,
                    round(r.get('bf_end_pct', 0), 1) if r.get('bf_end_pct') else None,
                    round(r.get('time_to_peak_sec', 0), 1) if r.get('time_to_peak_sec') is not None else None,
                    round(r.get('rate_of_change', 0), 3) if r.get('rate_of_change') is not None else None,
                ])
                for cell in ws_hra[ws_hra.max_row]:
                    cell.border = thin_border
            
            # Add average row
            if len(valid) > 1:
                def safe_avg(key):
                    vals = [r.get(key) for r in valid if r.get(key) is not None]
                    return np.mean(vals) if vals else None
                
                ws_hra.append([
                    'Avg',
                    round(safe_avg('baseline_bf'), 1) if safe_avg('baseline_bf') else None,
                    round(safe_avg('avg_bf'), 1) if safe_avg('avg_bf') else None,
                    round(safe_avg('peak_bf'), 1) if safe_avg('peak_bf') else None,
                    round(safe_avg('peak_norm_pct'), 1) if safe_avg('peak_norm_pct') else None,
                    round(safe_avg('amplitude'), 1) if safe_avg('amplitude') is not None else None,
                    round(safe_avg('bf_end'), 1) if safe_avg('bf_end') else None,
                    round(safe_avg('bf_end_pct'), 1) if safe_avg('bf_end_pct') else None,
                    round(safe_avg('time_to_peak_sec'), 1) if safe_avg('time_to_peak_sec') is not None else None,
                    round(safe_avg('rate_of_change'), 3) if safe_avg('rate_of_change') is not None else None,
                ])
                for cell in ws_hra[ws_hra.max_row]:
                    cell.fill = avg_fill
                    cell.font = bold_data_font
                    cell.border = thin_border
            
            for col in range(1, 11):
                ws_hra.column_dimensions[get_column_letter(col)].width = 12
    
    # ==================== SHEET 5: CORRECTED HRV ====================
    if request.light_enabled and request.light_metrics_detrended:
        per_stim = request.light_metrics_detrended.get('per_stim') or request.light_metrics_detrended.get('per_pulse', [])
        final = request.light_metrics_detrended.get('final', {})
        
        if per_stim or final:
            ws_corr = wb.create_sheet('Corrected HRV')
            ws_corr.append(['Stim', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀'])
            for cell in ws_corr[1]:
                cell.font = header_font
                cell.fill = emerald_fill
                cell.border = thin_border
            
            num_stims = max(5, len(per_stim))
            for i in range(num_stims):
                s = per_stim[i] if i < len(per_stim) else None
                has_data = s and (s.get('ln_rmssd70_detrended') is not None or 
                                 s.get('rmssd70_detrended') is not None)
                
                if has_data:
                    ws_corr.append([
                        i + 1,
                        round(s.get('ln_rmssd70_detrended', 0), 3) if s.get('ln_rmssd70_detrended') is not None else None,
                        round(s.get('rmssd70_detrended', 0), 3) if s.get('rmssd70_detrended') is not None else None,
                        round(s.get('ln_sdnn70_detrended', 0), 3) if s.get('ln_sdnn70_detrended') is not None else None,
                        round(s.get('sdnn_detrended', 0), 3) if s.get('sdnn_detrended') is not None else None,
                        round(s.get('pnn50_detrended', 0), 1) if s.get('pnn50_detrended') is not None else None,
                    ])
                else:
                    ws_corr.append([i + 1, None, None, None, None, None])
                
                for cell in ws_corr[ws_corr.max_row]:
                    cell.border = thin_border
            
            if final:
                ws_corr.append([
                    'Median',
                    round(final.get('ln_rmssd70_detrended', 0), 3) if final.get('ln_rmssd70_detrended') else None,
                    round(final.get('rmssd70_detrended', 0), 3) if final.get('rmssd70_detrended') else None,
                    round(final.get('ln_sdnn70_detrended', 0), 3) if final.get('ln_sdnn70_detrended') else None,
                    round(final.get('sdnn_detrended', 0), 3) if final.get('sdnn_detrended') else None,
                    round(final.get('pnn50_detrended', 0), 1) if final.get('pnn50_detrended') is not None else None,
                ])
                for cell in ws_corr[ws_corr.max_row]:
                    cell.fill = avg_fill
                    cell.font = bold_data_font
                    cell.border = thin_border
            
            for col in range(1, 7):
                ws_corr.column_dimensions[get_column_letter(col)].width = 14
    
    # ==================== SHEET 6: PER-BEAT DATA (kept beats only) ====================
    if request.per_beat_data:
        kept_beats = [b for b in request.per_beat_data if b.get('status') == 'kept']
        if kept_beats:
            ws_beat = wb.create_sheet('Per-Beat')
            ws_beat.append(['Beat #', 'Time (min)', 'BF Filtered (bpm)', 'NN Filtered (ms)'])
            for cell in ws_beat[1]:
                cell.font = header_font
                cell.fill = emerald_fill
                cell.border = thin_border
            
            for i, beat in enumerate(kept_beats):
                ws_beat.append([
                    i + 1,
                    round(beat.get('time_min', 0), 4) if beat.get('time_min') is not None else None,
                    round(beat.get('bf_bpm', 0), 1) if beat.get('bf_bpm') is not None else None,
                    round(beat.get('nn_ms', 0), 1) if beat.get('nn_ms') is not None else None,
                ])
                
                row_num = ws_beat.max_row
                for cell in ws_beat[row_num]:
                    cell.border = thin_border
            
            for col in range(1, 5):
                ws_beat.column_dimensions[get_column_letter(col)].width = 14
    
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def create_nature_csv(request):
    """Create a clean CSV export matching PDF structure"""
    import csv
    
    buf = io.StringIO()
    writer = csv.writer(buf)
    
    # ==================== HEADER ====================
    title = request.recording_name or request.filename or 'Recording Analysis'
    writer.writerow([title])
    writer.writerow(['Electrophysiology Analysis Report by NEHER'])
    if request.recording_date:
        writer.writerow([f'Recording Date: {request.recording_date}'])
    writer.writerow([])
    
    # ==================== RECORDING INFO ====================
    writer.writerow(['=== RECORDING INFO ==='])
    if request.original_filename:
        writer.writerow(['Original File', request.original_filename])
    if request.recording_date:
        writer.writerow(['Recording Date', request.recording_date])
    if request.summary:
        if 'Total Beats' in request.summary:
            writer.writerow(['Total Beats', request.summary['Total Beats']])
        if 'Kept Beats' in request.summary:
            writer.writerow(['Kept Beats', request.summary['Kept Beats']])
        if 'Filter Range' in request.summary:
            writer.writerow(['Filter Range', request.summary['Filter Range']])
    writer.writerow([])
    
    # ==================== TISSUE INFO ====================
    if request.organoid_info:
        writer.writerow(['=== TISSUE INFO ==='])
        for idx, org in enumerate(request.organoid_info):
            if len(request.organoid_info) > 1:
                writer.writerow([f'--- Sample {idx + 1} ---'])
            if org.get('cell_type'):
                cell_type = org.get('other_cell_type') if org.get('cell_type') == 'Other' else org.get('cell_type')
                writer.writerow(['Cell Type', cell_type or ''])
            if org.get('line_name'):
                writer.writerow(['Line', org.get('line_name')])
            if org.get('passage_number'):
                writer.writerow(['Passage', org.get('passage_number')])
            if org.get('age_at_recording') is not None:
                writer.writerow(['Age at Recording', f"{org.get('age_at_recording')} days"])
            if org.get('transfection'):
                trans = org['transfection']
                if trans.get('name'):
                    writer.writerow(['Transfection', trans.get('name')])
                if trans.get('days_since_transfection') is not None:
                    writer.writerow(['Days Post-Transfection', trans.get('days_since_transfection')])
        if request.days_since_fusion is not None:
            writer.writerow(['Days Since Fusion', request.days_since_fusion])
        writer.writerow([])
    
    # ==================== DRUG PERFUSION ====================
    if request.all_drugs and len(request.all_drugs) > 0:
        writer.writerow(['=== DRUG PERFUSION ==='])
        for drug in request.all_drugs:
            writer.writerow(['Drug', drug.get('name', 'Drug')])
            if drug.get('concentration'):
                writer.writerow(['Concentration', f"{drug.get('concentration')}µM"])
            writer.writerow(['Perf. Start', f"{drug.get('start', 0)} min"])
            writer.writerow(['Perf. Delay', f"{drug.get('delay', 0)} min"])
            perf_time = (drug.get('start', 0) or 0) + (drug.get('delay', 0) or 0)
            writer.writerow(['Perf. Time', f"{perf_time} min"])
            perf_end = drug.get('end')
            writer.writerow(['Perf. End', f"{perf_end} min" if perf_end is not None else '—'])
        writer.writerow([])
    
    # ==================== LIGHT STIMULATION ====================
    if request.light_enabled:
        writer.writerow(['=== LIGHT STIMULATION ==='])
        writer.writerow(['Status', 'Enabled'])
        if request.light_stim_count and request.light_stim_count > 0:
            writer.writerow(['Stims Detected', request.light_stim_count])
        if request.light_pulses and len(request.light_pulses) > 0:
            first_pulse = request.light_pulses[0]
            light_start = first_pulse.get('start_min')
            if light_start is not None:
                writer.writerow(['Stims Start', f"{light_start:.2f} min"])
        if request.light_params:
            if request.light_params.get('pulseDuration') is not None:
                writer.writerow(['Stim Duration', f"{request.light_params.get('pulseDuration')} sec"])
            if request.light_params.get('interval'):
                interval_val = request.light_params.get('interval')
                interval_display_map = {
                    'decreasing': '60s-30s-20s-10s',
                    '60': 'Uniform 60s',
                    '30': 'Uniform 30s',
                }
                interval_display = interval_display_map.get(str(interval_val), str(interval_val))
                writer.writerow(['Inter-stimuli intervals', interval_display])
        writer.writerow([])
    
    # ==================== BASELINE READOUT ====================
    if request.baseline_enabled and request.baseline:
        writer.writerow(['=== BASELINE READOUT ==='])
        baseline = request.baseline
        bf_val = baseline.get('baseline_bf')
        writer.writerow(['Mean BF', f"{bf_val:.1f} bpm" if bf_val else '—'])
        ln_rmssd = baseline.get('baseline_ln_rmssd70')
        writer.writerow(['ln(RMSSD70)', f"{ln_rmssd:.3f}" if ln_rmssd else '—'])
        sdnn = baseline.get('baseline_sdnn')
        ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
        writer.writerow(['ln(SDNN70)', f"{ln_sdnn:.3f}" if ln_sdnn else '—'])
        pnn50 = baseline.get('baseline_pnn50')
        writer.writerow(['pNN50_70', f"{pnn50:.1f}%" if pnn50 is not None else '—'])
        writer.writerow([])
    
    # ==================== DRUG READOUT ====================
    if request.drug_readout_enabled and request.all_drugs and len(request.all_drugs) > 0:
        writer.writerow(['=== DRUG READOUT ==='])
        
        # Get drug readout data (same logic as PDF/Excel)
        drug_bf = None
        drug_hrv_data = None
        drug_bf_minute = None
        drug_hrv_minute = None
        
        if request.drug_readout:
            drug_bf_minute = request.drug_readout.get('bf_minute')
            drug_hrv_minute = request.drug_readout.get('hrv_minute')
        
        if request.drug_readout_settings:
            settings_bf = request.drug_readout_settings.get('bfReadoutMinute')
            settings_hrv = request.drug_readout_settings.get('hrvReadoutMinute')
            perf_start = 0
            perf_delay = 0
            if request.all_drugs and len(request.all_drugs) > 0:
                drug = request.all_drugs[0]
                perf_start = drug.get('start', 0) or 0
                perf_delay = drug.get('delay', 0) or 0
            
            if request.drug_readout_settings.get('enableBfReadout') and settings_bf not in (None, ''):
                try:
                    drug_bf_minute = int(float(settings_bf)) + perf_start + perf_delay
                except (ValueError, TypeError):
                    pass
            if request.drug_readout_settings.get('enableHrvReadout') and settings_hrv not in (None, ''):
                try:
                    drug_hrv_minute = int(float(settings_hrv)) + perf_start + perf_delay
                except (ValueError, TypeError):
                    pass
        
        if drug_bf_minute is not None and request.per_minute_data:
            for pm in request.per_minute_data:
                try:
                    minute_str = str(pm.get('minute', ''))
                    minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(float(minute_str))
                    if minute_num == drug_bf_minute:
                        drug_bf = pm.get('mean_bf')
                        break
                except (ValueError, TypeError):
                    pass
        
        if drug_hrv_minute is not None and request.hrv_windows:
            for w in request.hrv_windows:
                try:
                    w_minute = w.get('minute')
                    if isinstance(w_minute, (int, float)):
                        w_minute_num = int(w_minute)
                    else:
                        w_minute_str = str(w_minute)
                        w_minute_num = int(w_minute_str.split('-')[0]) if '-' in w_minute_str else int(float(w_minute_str))
                    if w_minute_num == drug_hrv_minute:
                        drug_hrv_data = w
                        if drug_bf is None and w.get('mean_bf'):
                            drug_bf = w.get('mean_bf')
                        break
                except (ValueError, TypeError):
                    pass
        
        writer.writerow(['Mean BF', f"{drug_bf:.1f} bpm" if drug_bf else '—'])
        if drug_hrv_data:
            ln_rmssd = drug_hrv_data.get('ln_rmssd70')
            writer.writerow(['ln(RMSSD70)', f"{ln_rmssd:.3f}" if ln_rmssd else '—'])
            sdnn = drug_hrv_data.get('sdnn')
            ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
            writer.writerow(['ln(SDNN70)', f"{ln_sdnn:.3f}" if ln_sdnn else '—'])
            pnn50 = drug_hrv_data.get('pnn50')
            writer.writerow(['pNN50_70', f"{pnn50:.1f}%" if pnn50 is not None else '—'])
        writer.writerow([])
    
    # ==================== LIGHT READOUT ====================
    if request.light_enabled and (request.light_response or request.light_metrics_detrended):
        writer.writerow(['=== LIGHT READOUT ==='])
        
        if request.light_response:
            valid = [r for r in request.light_response if r]
            if valid:
                baseline_bf_vals = [r.get('baseline_bf') for r in valid if r.get('baseline_bf')]
                baseline_bf = np.mean(baseline_bf_vals) if baseline_bf_vals else None
                avg_bf = np.mean([r.get('avg_bf', 0) for r in valid if r.get('avg_bf')])
                peak_bf = np.mean([r.get('peak_bf', 0) for r in valid if r.get('peak_bf')])
                peak_norm_vals = [r.get('peak_norm_pct') for r in valid if r.get('peak_norm_pct') is not None]
                peak_norm = np.mean(peak_norm_vals) if peak_norm_vals else None
                amplitude_vals = [r.get('amplitude') for r in valid if r.get('amplitude')]
                amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                ttp_vals = [r.get('time_to_peak_sec') for r in valid if r.get('time_to_peak_sec') is not None]
                ttp = np.mean(ttp_vals) if ttp_vals else None
                ttp_1st = valid[0].get('time_to_peak_sec') if valid else None
                roc_vals = [r.get('rate_of_change') for r in valid if r.get('rate_of_change') is not None]
                roc = np.mean(roc_vals) if roc_vals else None
                recovery_bf_vals = [r.get('bf_end') for r in valid if r.get('bf_end')]
                recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                recovery_pct_vals = [r.get('bf_end_pct') for r in valid if r.get('bf_end_pct')]
                recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                
                writer.writerow(['Baseline BF', f"{baseline_bf:.1f} bpm" if baseline_bf else '—'])
                writer.writerow(['Avg BF', f"{avg_bf:.1f} bpm"])
                writer.writerow(['Peak BF', f"{peak_bf:.1f} bpm"])
                writer.writerow(['Peak (Norm.)', f"{peak_norm:.1f}%" if peak_norm else '—'])
                writer.writerow(['Amplitude', f"{amplitude:.1f} bpm" if amplitude else '—'])
                writer.writerow(['Time to Peak (AVG)', f"{ttp:.1f} s" if ttp is not None else '—'])
                writer.writerow(['TTP (1st Stim)', f"{ttp_1st:.1f} s" if ttp_1st is not None else '—'])
                writer.writerow(['Rate of Change', f"{roc:.3f} 1/min" if roc else '—'])
                writer.writerow(['Recovery BF', f"{recovery_bf:.1f} bpm" if recovery_bf else '—'])
                writer.writerow(['Recovery %', f"{recovery_pct:.1f}%" if recovery_pct else '—'])
        
        # Corrected HRV
        if request.light_metrics_detrended and request.light_metrics_detrended.get('final'):
            writer.writerow([])
            writer.writerow(['--- Corrected HRV ---'])
            final = request.light_metrics_detrended['final']
            ln_rmssd = final.get('ln_rmssd70_detrended')
            writer.writerow(['ln(RMSSD70)', f"{ln_rmssd:.3f}" if ln_rmssd else '—'])
            ln_sdnn = final.get('ln_sdnn70_detrended')
            writer.writerow(['ln(SDNN70)', f"{ln_sdnn:.3f}" if ln_sdnn else '—'])
            pnn50 = final.get('pnn50_detrended')
            writer.writerow(['pNN50_70', f"{pnn50:.1f}%" if pnn50 is not None else '—'])
        writer.writerow([])
    
    # ==================== SPONTANEOUS BF TABLE ====================
    if request.per_minute_data:
        writer.writerow(['=== SPONTANEOUS BF DATA ==='])
        writer.writerow(['Window (min)', 'Mean BF (bpm)', 'Mean NN (ms)'])
        for pm in request.per_minute_data:
            minute_val = pm.get('minute', '')
            try:
                minute_num = int(str(minute_val).split('-')[0]) if '-' in str(minute_val) else int(minute_val)
                window_str = f"{minute_num}-{minute_num+1}"
            except (ValueError, TypeError):
                window_str = str(minute_val)
            
            bf_val = pm.get('mean_bf') or pm.get('avg_bf')
            nn_val = pm.get('mean_nn') or pm.get('avg_nn')
            
            writer.writerow([
                window_str,
                round(bf_val, 1) if bf_val else '',
                round(nn_val, 1) if nn_val else '',
            ])
        writer.writerow([])
    
    # ==================== SPONTANEOUS HRV TABLE ====================
    if request.hrv_windows:
        writer.writerow(['=== SPONTANEOUS HRV DATA ==='])
        writer.writerow(['Window', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50_70', 'BF'])
        for w in request.hrv_windows:
            sdnn = w.get('sdnn')
            ln_sdnn = round(np.log(sdnn), 3) if sdnn and sdnn > 0 else ''
            writer.writerow([
                w.get('window', ''),
                round(w.get('ln_rmssd70', 0), 3) if w.get('ln_rmssd70') else '',
                round(w.get('rmssd70', 0), 1) if w.get('rmssd70') else '',
                ln_sdnn,
                round(sdnn, 1) if sdnn else '',
                round(w.get('pnn50', 0), 1) if w.get('pnn50') is not None else '0',
                round(w.get('mean_bf', 0), 1) if w.get('mean_bf') else '',
            ])
        writer.writerow([])
    
    # ==================== LIGHT HRA TABLE ====================
    if request.light_enabled and request.light_response:
        valid = [r for r in request.light_response if r]
        if valid:
            writer.writerow(['=== LIGHT-INDUCED HRA ==='])
            writer.writerow(['Stim', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'Amplitude', 'BF End', 'Recovery %', 'TTP (s)', 'RoC (1/min)'])
            for i, r in enumerate(valid):
                writer.writerow([
                    i + 1,
                    round(r.get('baseline_bf', 0), 1) if r.get('baseline_bf') else '',
                    round(r.get('avg_bf', 0), 1) if r.get('avg_bf') else '',
                    round(r.get('peak_bf', 0), 1) if r.get('peak_bf') else '',
                    round(r.get('peak_norm_pct', 0), 1) if r.get('peak_norm_pct') else '',
                    round(r.get('amplitude', 0), 1) if r.get('amplitude') is not None else '',
                    round(r.get('bf_end', 0), 1) if r.get('bf_end') else '',
                    round(r.get('bf_end_pct', 0), 1) if r.get('bf_end_pct') else '',
                    round(r.get('time_to_peak_sec', 0), 1) if r.get('time_to_peak_sec') is not None else '',
                    round(r.get('rate_of_change', 0), 3) if r.get('rate_of_change') is not None else '',
                ])
            
            # Add average row
            if len(valid) > 1:
                def safe_avg(key):
                    vals = [r.get(key) for r in valid if r.get(key) is not None]
                    return np.mean(vals) if vals else None
                
                writer.writerow([
                    'Avg',
                    round(safe_avg('baseline_bf'), 1) if safe_avg('baseline_bf') else '',
                    round(safe_avg('avg_bf'), 1) if safe_avg('avg_bf') else '',
                    round(safe_avg('peak_bf'), 1) if safe_avg('peak_bf') else '',
                    round(safe_avg('peak_norm_pct'), 1) if safe_avg('peak_norm_pct') else '',
                    round(safe_avg('amplitude'), 1) if safe_avg('amplitude') is not None else '',
                    round(safe_avg('bf_end'), 1) if safe_avg('bf_end') else '',
                    round(safe_avg('bf_end_pct'), 1) if safe_avg('bf_end_pct') else '',
                    round(safe_avg('time_to_peak_sec'), 1) if safe_avg('time_to_peak_sec') is not None else '',
                    round(safe_avg('rate_of_change'), 3) if safe_avg('rate_of_change') is not None else '',
                ])
            writer.writerow([])
    
    # ==================== CORRECTED HRV TABLE ====================
    if request.light_enabled and request.light_metrics_detrended:
        per_stim = request.light_metrics_detrended.get('per_stim') or request.light_metrics_detrended.get('per_pulse', [])
        final = request.light_metrics_detrended.get('final', {})
        
        if per_stim or final:
            writer.writerow(['=== LIGHT-INDUCED CORRECTED HRV ==='])
            writer.writerow(['Stim', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50_70'])
            
            num_stims = max(5, len(per_stim))
            for i in range(num_stims):
                s = per_stim[i] if i < len(per_stim) else None
                has_data = s and (s.get('ln_rmssd70_detrended') is not None or 
                                 s.get('rmssd70_detrended') is not None)
                
                if has_data:
                    writer.writerow([
                        i + 1,
                        round(s.get('ln_rmssd70_detrended', 0), 3) if s.get('ln_rmssd70_detrended') is not None else '',
                        round(s.get('rmssd70_detrended', 0), 3) if s.get('rmssd70_detrended') is not None else '',
                        round(s.get('ln_sdnn70_detrended', 0), 3) if s.get('ln_sdnn70_detrended') is not None else '',
                        round(s.get('sdnn_detrended', 0), 3) if s.get('sdnn_detrended') is not None else '',
                        round(s.get('pnn50_detrended', 0), 1) if s.get('pnn50_detrended') is not None else '',
                    ])
                else:
                    writer.writerow([i + 1, '', '', '', '', ''])
            
            if final:
                writer.writerow([
                    'Median',
                    round(final.get('ln_rmssd70_detrended', 0), 3) if final.get('ln_rmssd70_detrended') else '',
                    round(final.get('rmssd70_detrended', 0), 3) if final.get('rmssd70_detrended') else '',
                    round(final.get('ln_sdnn70_detrended', 0), 3) if final.get('ln_sdnn70_detrended') else '',
                    round(final.get('sdnn_detrended', 0), 3) if final.get('sdnn_detrended') else '',
                    round(final.get('pnn50_detrended', 0), 1) if final.get('pnn50_detrended') is not None else '',
                ])
            writer.writerow([])
    
    # ==================== PER-BEAT DATA (kept beats only) ====================
    if request.per_beat_data:
        kept_beats = [b for b in request.per_beat_data if b.get('status') == 'kept']
        if kept_beats:
            writer.writerow(['=== PER-BEAT DATA ==='])
            writer.writerow(['Beat #', 'Time (min)', 'BF Filtered (bpm)', 'NN Filtered (ms)'])
            for i, beat in enumerate(kept_beats):
                writer.writerow([
                    i + 1,
                    round(beat.get('time_min', 0), 4) if beat.get('time_min') is not None else '',
                    round(beat.get('bf_bpm', 0), 1) if beat.get('bf_bpm') is not None else '',
                    round(beat.get('nn_ms', 0), 1) if beat.get('nn_ms') is not None else '',
                ])
    
    output = io.BytesIO()
    output.write(buf.getvalue().encode('utf-8'))
    output.seek(0)
    return output



def create_comparison_pdf(folder_name, comparison_data):
    """Create a comparison PDF matching the single recording PDF style - landscape, 7 pages"""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    import matplotlib.patches as mpatches
    
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Helvetica Neue', 'Arial', 'DejaVu Sans'],
        'font.size': 9,
        'axes.labelsize': 9,
        'axes.titlesize': 10,
        'axes.linewidth': 0.8,
        'xtick.labelsize': 8,
        'ytick.labelsize': 8,
        'legend.fontsize': 8,
        'figure.titlesize': 12,
        'axes.spines.top': False,
        'axes.spines.right': False,
    })
    
    data = comparison_data
    recordings = data.get('recordings', [])
    summary = data.get('summary', {})
    spont_averages = data.get('spontaneous_averages', {}).get('averages', {})
    hra_averages = data.get('light_hra_averages', {}).get('averages', {})
    hrv_averages = data.get('light_hrv_averages', {}).get('averages', {})
    
    # Sort recordings alphabetically
    recordings = sorted(recordings, key=lambda x: x.get('name', '').lower())
    
    buf = io.BytesIO()
    
    # Colors matching single recording PDF
    COLORS = {
        'dark': '#18181b',
        'gray': '#6b7280',
        'emerald': '#10b981',
        'purple': '#a855f7',
        'amber': '#f59e0b',
        'sky': '#0ea5e9',
        'cyan': '#06b6d4',
    }
    
    TINTS = {
        'baseline': '#e0f2fe',
        'drug': '#f3e8ff',
        'light': '#fef3c7',
        'avg': '#d1fae5',
    }
    
    def fmt(val, dec=2):
        if val is None:
            return '—'
        if dec == 0:
            return f"{val:.0f}"
        elif dec == 1:
            return f"{val:.1f}"
        elif dec == 3:
            return f"{val:.3f}"
        elif dec == 4:
            return f"{val:.4f}"
        return f"{val:.{dec}f}"
    
    def fmt_age_range(age_dict):
        if not age_dict or age_dict.get('min') is None:
            return '—'
        return f"{age_dict.get('min')} - {age_dict.get('max')} days"
    
    def add_footer(fig, page_num, total_pages):
        """Add consistent footer to all pages - positioned within 1cm margin"""
        fig.text(0.036, 0.025, 'Developed by Kolia H. Badarello', fontsize=7, color='#71717a')
        fig.text(0.5, 0.025, 'NEHER', fontsize=7, color='#71717a', ha='center', fontweight='bold')
        fig.text(0.964, 0.025, f'Page {page_num} of {total_pages}', fontsize=7, color='#71717a', ha='right')
    
    total_pages = 7
    
    # Layout constants for US Letter landscape with 1cm margins
    # 1cm = 0.3937 inches; on 11" width = 0.036; on 8.5" height = 0.046
    MARGIN_X = 0.036  # 1cm left/right margin
    MARGIN_Y = 0.046  # 1cm top/bottom margin
    CONTENT_WIDTH = 1 - 2 * MARGIN_X  # ~0.928
    COL_GAP = 0.018  # 0.5cm gap between columns
    
    with PdfPages(buf) as pdf:
        
        # ==================== PAGE 1: SUMMARY (3 columns) ====================
        fig1 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig1.patch.set_facecolor('white')
        
        # Title - positioned within margins
        title_y = 1 - MARGIN_Y - 0.02
        fig1.text(0.5, title_y, folder_name, ha='center', va='top', fontsize=16, fontweight='bold', color=COLORS['dark'])
        fig1.text(0.5, title_y - 0.035, 'Folder Comparison Report by NEHER', ha='center', va='top', fontsize=10, color='#71717a')
        fig1.text(0.5, title_y - 0.065, f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}', ha='center', va='top', fontsize=8, color='#a1a1aa')
        
        separator_y = title_y - 0.085
        fig1.add_artist(plt.Line2D([MARGIN_X, 1 - MARGIN_X], [separator_y, separator_y], color='#e4e4e7', linewidth=1, transform=fig1.transFigure))
        
        line_height = 0.024
        
        # Calculate column positions with 0.5cm (0.018) gaps
        # Available width = CONTENT_WIDTH = 0.928
        # 3 columns + 2 gaps: col_width = (0.928 - 2*0.018) / 3 = 0.297
        col_width = (CONTENT_WIDTH - 2 * COL_GAP) / 3
        col1_x = MARGIN_X
        col2_x = col1_x + col_width + COL_GAP
        col3_x = col2_x + col_width + COL_GAP
        
        def draw_header(fig, x, y, text, color, width=None):
            if width is None:
                width = col_width
            fig.text(x, y, text, fontsize=9, fontweight='bold', color='white',
                    bbox=dict(boxstyle='round,pad=0.3', facecolor=color, edgecolor='none'))
            return y - 0.038
        
        def draw_row(fig, x, y, label, value, bg_color=None, width=None):
            if width is None:
                width = col_width
            if bg_color:
                fig.add_artist(mpatches.FancyBboxPatch(
                    (x - 0.003, y - 0.007), width, 0.020,
                    boxstyle=mpatches.BoxStyle("Round", pad=0.002),
                    facecolor=bg_color, edgecolor='none', transform=fig.transFigure
                ))
            fig.text(x, y, label, fontsize=7.5, color='#52525b')
            fig.text(x + 0.15, y, str(value), fontsize=7.5, fontweight='bold', color=COLORS['dark'])
            return y - line_height
        
        def draw_separator(fig, x, y, width=None):
            if width is None:
                width = col_width
            fig.add_artist(plt.Line2D([x, x + width], [y, y], color='#d1d5db', linewidth=0.5, transform=fig.transFigure))
            return y - 0.014
        
        # COLUMN 1: Folder Overview + Age Ranges
        y1 = separator_y - 0.03
        y1 = draw_header(fig1, col1_x, y1, 'FOLDER OVERVIEW', COLORS['dark'])
        y1 = draw_separator(fig1, col1_x, y1 + 0.018)
        y1 = draw_row(fig1, col1_x, y1, 'Recordings:', str(summary.get('recording_count', len(recordings))))
        y1 = draw_row(fig1, col1_x, y1, 'Generated:', datetime.now().strftime('%Y-%m-%d'))
        y1 -= 0.025
        
        y1 = draw_header(fig1, col1_x, y1, 'AGE RANGES', COLORS['gray'])
        y1 = draw_separator(fig1, col1_x, y1 + 0.018)
        hspo_range = summary.get('hspo_age_range', {})
        hco_range = summary.get('hco_age_range', {})
        fusion_range = summary.get('fusion_age_range', {})
        y1 = draw_row(fig1, col1_x, y1, 'hSpOs:', f"{fmt_age_range(hspo_range)} (n={hspo_range.get('n', 0)})")
        y1 = draw_row(fig1, col1_x, y1, 'hCOs:', f"{fmt_age_range(hco_range)} (n={hco_range.get('n', 0)})")
        y1 = draw_row(fig1, col1_x, y1, 'Fusion:', f"{fmt_age_range(fusion_range)} (n={fusion_range.get('n', 0)})")
        
        # COLUMN 2: Spontaneous Activity Averages
        y2 = separator_y - 0.03
        y2 = draw_header(fig1, col2_x, y2, 'SPONTANEOUS ACTIVITY', COLORS['emerald'])
        y2 = draw_separator(fig1, col2_x, y2 + 0.018)
        
        fig1.text(col2_x, y2, 'Baseline', fontsize=7, fontstyle='italic', color='#71717a')
        y2 -= 0.018
        y2 = draw_row(fig1, col2_x, y2, 'Mean BF:', f"{fmt(spont_averages.get('baseline_bf'), 1)} bpm", TINTS['baseline'])
        y2 = draw_row(fig1, col2_x, y2, 'ln(RMSSD₇₀):', fmt(spont_averages.get('baseline_ln_rmssd70'), 3), TINTS['baseline'])
        y2 = draw_row(fig1, col2_x, y2, 'ln(SDNN₇₀):', fmt(spont_averages.get('baseline_ln_sdnn70'), 3), TINTS['baseline'])
        y2 = draw_row(fig1, col2_x, y2, 'pNN50₇₀:', f"{fmt(spont_averages.get('baseline_pnn50'), 1)}%", TINTS['baseline'])
        y2 -= 0.012
        
        fig1.text(col2_x, y2, 'Drug Readout', fontsize=7, fontstyle='italic', color='#71717a')
        y2 -= 0.018
        y2 = draw_row(fig1, col2_x, y2, 'Mean BF:', f"{fmt(spont_averages.get('drug_bf'), 1)} bpm", TINTS['drug'])
        y2 = draw_row(fig1, col2_x, y2, 'ln(RMSSD₇₀):', fmt(spont_averages.get('drug_ln_rmssd70'), 3), TINTS['drug'])
        y2 = draw_row(fig1, col2_x, y2, 'ln(SDNN₇₀):', fmt(spont_averages.get('drug_ln_sdnn70'), 3), TINTS['drug'])
        y2 = draw_row(fig1, col2_x, y2, 'pNN50₇₀:', f"{fmt(spont_averages.get('drug_pnn50'), 1)}%", TINTS['drug'])
        
        # COLUMN 3: Light Stimulus Averages
        y3 = separator_y - 0.03
        y3 = draw_header(fig1, col3_x, y3, 'LIGHT STIMULUS', COLORS['amber'])
        y3 = draw_separator(fig1, col3_x, y3 + 0.018)
        
        fig1.text(col3_x, y3, 'Heart Rate Adaptation (HRA)', fontsize=7, fontstyle='italic', color='#71717a')
        y3 -= 0.018
        y3 = draw_row(fig1, col3_x, y3, 'Baseline BF:', f"{fmt(hra_averages.get('light_baseline_bf'), 1)} bpm", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'Peak BF:', f"{fmt(hra_averages.get('light_peak_bf'), 1)} bpm", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'Peak (Norm.):', f"{fmt(hra_averages.get('light_peak_norm'), 1)}%", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'Amplitude:', f"{fmt(hra_averages.get('light_amplitude'), 1)} bpm", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'TTP (Avg):', f"{fmt(hra_averages.get('light_ttp_avg'), 1)} s", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'Rate of Change:', f"{fmt(hra_averages.get('light_roc'), 4)}", TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'Recovery %:', f"{fmt(hra_averages.get('light_recovery_pct'), 1)}%", TINTS['light'])
        y3 -= 0.012
        
        fig1.text(col3_x, y3, 'Corrected HRV', fontsize=7, fontstyle='italic', color='#71717a')
        y3 -= 0.018
        y3 = draw_row(fig1, col3_x, y3, 'ln(RMSSD₇₀):', fmt(hrv_averages.get('light_hrv_ln_rmssd70'), 3), TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'ln(SDNN₇₀):', fmt(hrv_averages.get('light_hrv_ln_sdnn70'), 3), TINTS['light'])
        y3 = draw_row(fig1, col3_x, y3, 'pNN50₇₀:', f"{fmt(hrv_averages.get('light_hrv_pnn50'), 1)}%", TINTS['light'])
        
        add_footer(fig1, 1, total_pages)
        pdf.savefig(fig1)
        plt.close(fig1)
        
        # ==================== PAGE 2: METADATA ====================
        fig2 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig2.patch.set_facecolor('white')
        
        fig2.text(0.5, 1 - MARGIN_Y - 0.02, 'Recording Metadata', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig2.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax = fig2.add_axes([MARGIN_X, MARGIN_Y + 0.03, CONTENT_WIDTH, 0.82])
        ax.axis('off')
        
        meta_headers = ['Recording', 'Date', 'hSpO Age', 'hCO Age', 'Fusion', 'Drug Info', 'Light Stim', 'Notes']
        meta_data = [meta_headers]
        
        for rec in recordings:
            drug_info = rec.get('drug_info', '') or '—'
            light_info = rec.get('light_stim_info', '') or '—'
            notes = rec.get('notes', '') or '—'
            
            meta_data.append([
                rec.get('name', '')[:15],
                rec.get('recording_date', '—') or '—',
                str(rec.get('hspo_age', '')) if rec.get('hspo_age') else '—',
                str(rec.get('hco_age', '')) if rec.get('hco_age') else '—',
                str(rec.get('fusion_age', '')) if rec.get('fusion_age') else '—',
                drug_info[:20] if len(drug_info) > 20 else drug_info,
                light_info[:20] if len(light_info) > 20 else light_info,
                notes[:25] if len(notes) > 25 else notes,
            ])
        
        n_rows = len(meta_data)
        row_height = min(0.06, 0.75 / n_rows)
        table_height = row_height * n_rows
        
        table = ax.table(cellText=meta_data, loc='upper center', cellLoc='center',
                        colWidths=[0.14, 0.10, 0.08, 0.08, 0.08, 0.16, 0.16, 0.18],
                        bbox=[0.01, 1.0 - table_height - 0.02, 0.98, table_height])
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        
        for (row, col), cell in table.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['dark'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
        
        add_footer(fig2, 2, total_pages)
        pdf.savefig(fig2)
        plt.close(fig2)
        
        # ==================== PAGE 3: SPONTANEOUS ACTIVITY COMPARISON ====================
        fig3 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig3.patch.set_facecolor('white')
        
        fig3.text(0.5, 1 - MARGIN_Y - 0.02, 'Spontaneous Activity Comparison', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig3.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax3 = fig3.add_axes([MARGIN_X, MARGIN_Y + 0.03, CONTENT_WIDTH, 0.82])
        ax3.axis('off')
        
        headers = ['Recording', 'Baseline\nBF', 'Baseline\nRMSSD', 'Baseline\nSDNN', 'Baseline\npNN50', 
                   'Drug\nBF', 'Drug\nRMSSD', 'Drug\nSDNN', 'Drug\npNN50']
        table_data = [headers]
        
        for rec in recordings:
            table_data.append([
                rec.get('name', '')[:18],
                fmt(rec.get('baseline_bf'), 1),
                fmt(rec.get('baseline_ln_rmssd70'), 3),
                fmt(rec.get('baseline_ln_sdnn70'), 3),
                fmt(rec.get('baseline_pnn50'), 1),
                fmt(rec.get('drug_bf'), 1),
                fmt(rec.get('drug_ln_rmssd70'), 3),
                fmt(rec.get('drug_ln_sdnn70'), 3),
                fmt(rec.get('drug_pnn50'), 1),
            ])
        
        # Add average row
        table_data.append([
            f'Average (n={len(recordings)})',
            fmt(spont_averages.get('baseline_bf'), 1),
            fmt(spont_averages.get('baseline_ln_rmssd70'), 3),
            fmt(spont_averages.get('baseline_ln_sdnn70'), 3),
            fmt(spont_averages.get('baseline_pnn50'), 1),
            fmt(spont_averages.get('drug_bf'), 1),
            fmt(spont_averages.get('drug_ln_rmssd70'), 3),
            fmt(spont_averages.get('drug_ln_sdnn70'), 3),
            fmt(spont_averages.get('drug_pnn50'), 1),
        ])
        
        n_rows = len(table_data)
        row_height = min(0.06, 0.75 / n_rows)
        table_height = row_height * n_rows
        
        table3 = ax3.table(cellText=table_data, loc='upper center', cellLoc='center',
                          colWidths=[0.16, 0.09, 0.10, 0.10, 0.10, 0.09, 0.10, 0.10, 0.10],
                          bbox=[0.01, 1.0 - table_height - 0.02, 0.98, table_height])
        table3.auto_set_font_size(False)
        table3.set_fontsize(8)
        
        for (row, col), cell in table3.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['dark'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(table_data) - 1:
                cell.set_facecolor(TINTS['avg'])
                cell.set_text_props(fontweight='bold')
            else:
                if 1 <= col <= 4:
                    cell.set_facecolor(TINTS['baseline'])
                elif 5 <= col <= 8:
                    cell.set_facecolor(TINTS['drug'])
        
        add_footer(fig3, 3, total_pages)
        pdf.savefig(fig3)
        plt.close(fig3)
        
        # ==================== PAGE 4: SPONTANEOUS ACTIVITY NORMALIZED ====================
        fig4 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig4.patch.set_facecolor('white')
        
        fig4.text(0.5, 1 - MARGIN_Y - 0.02, 'Spontaneous Activity — Normalized to Cohort Baseline', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig4.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax4 = fig4.add_axes([MARGIN_X, MARGIN_Y + 0.03, CONTENT_WIDTH, 0.82])
        ax4.axis('off')
        
        # Calculate cohort baseline averages
        baseline_bfs = [r.get('baseline_bf') for r in recordings if r.get('baseline_bf') is not None]
        baseline_rmssds = [r.get('baseline_ln_rmssd70') for r in recordings if r.get('baseline_ln_rmssd70') is not None]
        baseline_sdnns = [r.get('baseline_ln_sdnn70') for r in recordings if r.get('baseline_ln_sdnn70') is not None]
        baseline_pnn50s = [r.get('baseline_pnn50') for r in recordings if r.get('baseline_pnn50') is not None]
        
        avg_bf = sum(baseline_bfs) / len(baseline_bfs) if baseline_bfs else 1
        avg_rmssd = sum(baseline_rmssds) / len(baseline_rmssds) if baseline_rmssds else 1
        avg_sdnn = sum(baseline_sdnns) / len(baseline_sdnns) if baseline_sdnns else 1
        avg_pnn50 = sum(baseline_pnn50s) / len(baseline_pnn50s) if baseline_pnn50s else 1
        
        def norm_val(val, avg):
            if val is None or avg == 0:
                return None
            return 100 * val / avg
        
        norm_headers = ['Recording', 'Baseline\nBF%', 'Baseline\nRMSSD%', 'Baseline\nSDNN%', 'Baseline\npNN50%',
                       'Drug\nBF%', 'Drug\nRMSSD%', 'Drug\nSDNN%', 'Drug\npNN50%']
        norm_data = [norm_headers]
        norm_sums = {'base_bf': [], 'base_rmssd': [], 'base_sdnn': [], 'base_pnn50': [],
                    'drug_bf': [], 'drug_rmssd': [], 'drug_sdnn': [], 'drug_pnn50': []}
        
        for rec in recordings:
            n_base_bf = norm_val(rec.get('baseline_bf'), avg_bf)
            n_base_rmssd = norm_val(rec.get('baseline_ln_rmssd70'), avg_rmssd)
            n_base_sdnn = norm_val(rec.get('baseline_ln_sdnn70'), avg_sdnn)
            n_base_pnn50 = norm_val(rec.get('baseline_pnn50'), avg_pnn50)
            n_drug_bf = norm_val(rec.get('drug_bf'), avg_bf)
            n_drug_rmssd = norm_val(rec.get('drug_ln_rmssd70'), avg_rmssd)
            n_drug_sdnn = norm_val(rec.get('drug_ln_sdnn70'), avg_sdnn)
            n_drug_pnn50 = norm_val(rec.get('drug_pnn50'), avg_pnn50)
            
            norm_data.append([
                rec.get('name', '')[:18],
                fmt(n_base_bf, 1), fmt(n_base_rmssd, 1), fmt(n_base_sdnn, 1), fmt(n_base_pnn50, 1),
                fmt(n_drug_bf, 1), fmt(n_drug_rmssd, 1), fmt(n_drug_sdnn, 1), fmt(n_drug_pnn50, 1),
            ])
            
            for key, val in [('base_bf', n_base_bf), ('base_rmssd', n_base_rmssd), 
                            ('base_sdnn', n_base_sdnn), ('base_pnn50', n_base_pnn50),
                            ('drug_bf', n_drug_bf), ('drug_rmssd', n_drug_rmssd),
                            ('drug_sdnn', n_drug_sdnn), ('drug_pnn50', n_drug_pnn50)]:
                if val is not None:
                    norm_sums[key].append(val)
        
        # Add average row
        norm_data.append([
            f'Average (n={len(recordings)})',
            fmt(sum(norm_sums['base_bf']) / len(norm_sums['base_bf']) if norm_sums['base_bf'] else None, 1),
            fmt(sum(norm_sums['base_rmssd']) / len(norm_sums['base_rmssd']) if norm_sums['base_rmssd'] else None, 1),
            fmt(sum(norm_sums['base_sdnn']) / len(norm_sums['base_sdnn']) if norm_sums['base_sdnn'] else None, 1),
            fmt(sum(norm_sums['base_pnn50']) / len(norm_sums['base_pnn50']) if norm_sums['base_pnn50'] else None, 1),
            fmt(sum(norm_sums['drug_bf']) / len(norm_sums['drug_bf']) if norm_sums['drug_bf'] else None, 1),
            fmt(sum(norm_sums['drug_rmssd']) / len(norm_sums['drug_rmssd']) if norm_sums['drug_rmssd'] else None, 1),
            fmt(sum(norm_sums['drug_sdnn']) / len(norm_sums['drug_sdnn']) if norm_sums['drug_sdnn'] else None, 1),
            fmt(sum(norm_sums['drug_pnn50']) / len(norm_sums['drug_pnn50']) if norm_sums['drug_pnn50'] else None, 1),
        ])
        
        n_norm_rows = len(norm_data)
        norm_row_height = min(0.06, 0.75 / n_norm_rows)
        norm_table_height = norm_row_height * n_norm_rows
        
        table4 = ax4.table(cellText=norm_data, loc='upper center', cellLoc='center',
                          colWidths=[0.16, 0.09, 0.10, 0.10, 0.10, 0.09, 0.10, 0.10, 0.10],
                          bbox=[0.01, 1.0 - norm_table_height - 0.02, 0.98, norm_table_height])
        table4.auto_set_font_size(False)
        table4.set_fontsize(8)
        
        for (row, col), cell in table4.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['dark'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(norm_data) - 1:
                cell.set_facecolor(TINTS['avg'])
                cell.set_text_props(fontweight='bold')
            else:
                if 1 <= col <= 4:
                    cell.set_facecolor(TINTS['baseline'])
                elif 5 <= col <= 8:
                    cell.set_facecolor(TINTS['drug'])
        
        add_footer(fig4, 4, total_pages)
        pdf.savefig(fig4)
        plt.close(fig4)
        
        # ==================== PAGE 5: LIGHT HRA ====================
        fig5 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig5.patch.set_facecolor('white')
        
        fig5.text(0.5, 1 - MARGIN_Y - 0.02, 'Light-Induced Heart Rate Adaptation (HRA)', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig5.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax5 = fig5.add_axes([MARGIN_X, MARGIN_Y + 0.03, CONTENT_WIDTH, 0.82])
        ax5.axis('off')
        
        hra_headers = ['Recording', 'Base\nBF', 'Avg\nBF', 'Peak\nBF', 'Peak\n%', 'Amp', 'TTP\n1st', 'TTP\nAvg', 'RoC', 'Rec\nBF', 'Rec\n%']
        hra_data = [hra_headers]
        
        for rec in recordings:
            hra_data.append([
                rec.get('name', '')[:15],
                fmt(rec.get('light_baseline_bf'), 1),
                fmt(rec.get('light_avg_bf'), 1),
                fmt(rec.get('light_peak_bf'), 1),
                fmt(rec.get('light_peak_norm'), 1),
                fmt(rec.get('light_amplitude'), 1),
                fmt(rec.get('light_ttp_first'), 1),
                fmt(rec.get('light_ttp_avg'), 1),
                fmt(rec.get('light_roc'), 3),
                fmt(rec.get('light_recovery_bf'), 1),
                fmt(rec.get('light_recovery_pct'), 1),
            ])
        
        hra_data.append([
            f'Average (n={len(recordings)})',
            fmt(hra_averages.get('light_baseline_bf'), 1),
            fmt(hra_averages.get('light_avg_bf'), 1),
            fmt(hra_averages.get('light_peak_bf'), 1),
            fmt(hra_averages.get('light_peak_norm'), 1),
            fmt(hra_averages.get('light_amplitude'), 1),
            fmt(hra_averages.get('light_ttp_first'), 1),
            fmt(hra_averages.get('light_ttp_avg'), 1),
            fmt(hra_averages.get('light_roc'), 3),
            fmt(hra_averages.get('light_recovery_bf'), 1),
            fmt(hra_averages.get('light_recovery_pct'), 1),
        ])
        
        n_hra_rows = len(hra_data)
        hra_row_height = min(0.06, 0.75 / n_hra_rows)
        hra_table_height = hra_row_height * n_hra_rows
        
        table5 = ax5.table(cellText=hra_data, loc='upper center', cellLoc='center',
                          colWidths=[0.14, 0.08, 0.08, 0.08, 0.08, 0.07, 0.08, 0.08, 0.08, 0.08, 0.08],
                          bbox=[0.01, 1.0 - hra_table_height - 0.02, 0.98, hra_table_height])
        table5.auto_set_font_size(False)
        table5.set_fontsize(7)
        
        for (row, col), cell in table5.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['amber'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=7)
            elif row == len(hra_data) - 1:
                cell.set_facecolor(TINTS['avg'])
                cell.set_text_props(fontweight='bold')
            elif col >= 1:
                cell.set_facecolor(TINTS['light'])
        
        add_footer(fig5, 5, total_pages)
        pdf.savefig(fig5)
        plt.close(fig5)
        
        # ==================== PAGE 6: LIGHT HRA NORMALIZED ====================
        fig6 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig6.patch.set_facecolor('white')
        
        fig6.text(0.5, 1 - MARGIN_Y - 0.02, 'Light-Induced HRA — Normalized to Cohort Baseline', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig6.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax6 = fig6.add_axes([MARGIN_X + 0.05, MARGIN_Y + 0.03, CONTENT_WIDTH - 0.1, 0.82])
        ax6.axis('off')
        
        light_baseline_bfs = [r.get('light_baseline_bf') for r in recordings if r.get('light_baseline_bf') is not None]
        avg_light_bf = sum(light_baseline_bfs) / len(light_baseline_bfs) if light_baseline_bfs else 1
        
        norm_hra_headers = ['Recording', 'Baseline BF%', 'Avg BF%', 'Peak BF%', 'Recovery BF%']
        norm_hra_data = [norm_hra_headers]
        norm_hra_sums = {'base': [], 'avg': [], 'peak': [], 'rec': []}
        
        for rec in recordings:
            n_base = norm_val(rec.get('light_baseline_bf'), avg_light_bf)
            n_avg = norm_val(rec.get('light_avg_bf'), avg_light_bf)
            n_peak = norm_val(rec.get('light_peak_bf'), avg_light_bf)
            n_rec = norm_val(rec.get('light_recovery_bf'), avg_light_bf)
            
            norm_hra_data.append([
                rec.get('name', '')[:20],
                fmt(n_base, 1), fmt(n_avg, 1), fmt(n_peak, 1), fmt(n_rec, 1),
            ])
            
            for key, val in [('base', n_base), ('avg', n_avg), ('peak', n_peak), ('rec', n_rec)]:
                if val is not None:
                    norm_hra_sums[key].append(val)
        
        norm_hra_data.append([
            f'Average (n={len(recordings)})',
            fmt(sum(norm_hra_sums['base']) / len(norm_hra_sums['base']) if norm_hra_sums['base'] else None, 1),
            fmt(sum(norm_hra_sums['avg']) / len(norm_hra_sums['avg']) if norm_hra_sums['avg'] else None, 1),
            fmt(sum(norm_hra_sums['peak']) / len(norm_hra_sums['peak']) if norm_hra_sums['peak'] else None, 1),
            fmt(sum(norm_hra_sums['rec']) / len(norm_hra_sums['rec']) if norm_hra_sums['rec'] else None, 1),
        ])
        
        n_norm_hra_rows = len(norm_hra_data)
        norm_hra_row_height = min(0.06, 0.75 / n_norm_hra_rows)
        norm_hra_table_height = norm_hra_row_height * n_norm_hra_rows
        
        table6 = ax6.table(cellText=norm_hra_data, loc='upper center', cellLoc='center',
                          colWidths=[0.28, 0.17, 0.17, 0.17, 0.17],
                          bbox=[0.02, 1.0 - norm_hra_table_height - 0.02, 0.96, norm_hra_table_height])
        table6.auto_set_font_size(False)
        table6.set_fontsize(8)
        
        for (row, col), cell in table6.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['amber'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=8)
            elif row == len(norm_hra_data) - 1:
                cell.set_facecolor(TINTS['avg'])
                cell.set_text_props(fontweight='bold')
            elif col >= 1:
                cell.set_facecolor(TINTS['light'])
        
        add_footer(fig6, 6, total_pages)
        pdf.savefig(fig6)
        plt.close(fig6)
        
        # ==================== PAGE 7: CORRECTED HRV ====================
        fig7 = plt.figure(figsize=(11, 8.5))  # US Letter Landscape
        fig7.patch.set_facecolor('white')
        
        fig7.text(0.5, 1 - MARGIN_Y - 0.02, 'Corrected Light-Induced HRV', ha='center', va='top', fontsize=14, fontweight='bold', color=COLORS['dark'])
        fig7.text(0.5, 1 - MARGIN_Y - 0.055, folder_name, ha='center', va='top', fontsize=10, color='#71717a')
        
        ax7 = fig7.add_axes([MARGIN_X + 0.08, MARGIN_Y + 0.03, CONTENT_WIDTH - 0.16, 0.82])
        ax7.axis('off')
        
        hrv_headers = ['Recording', 'ln(RMSSD₇₀)', 'ln(SDNN₇₀)', 'pNN50₇₀ (%)']
        hrv_data = [hrv_headers]
        
        for rec in recordings:
            hrv_data.append([
                rec.get('name', '')[:25],
                fmt(rec.get('light_hrv_ln_rmssd70'), 3),
                fmt(rec.get('light_hrv_ln_sdnn70'), 3),
                fmt(rec.get('light_hrv_pnn50'), 1),
            ])
        
        hrv_data.append([
            f'Folder Average (n={len(recordings)})',
            fmt(hrv_averages.get('light_hrv_ln_rmssd70'), 3),
            fmt(hrv_averages.get('light_hrv_ln_sdnn70'), 3),
            fmt(hrv_averages.get('light_hrv_pnn50'), 1),
        ])
        
        n_hrv_rows = len(hrv_data)
        hrv_row_height = min(0.05, 0.70 / n_hrv_rows)
        hrv_table_height = hrv_row_height * n_hrv_rows
        
        table7 = ax7.table(cellText=hrv_data, loc='upper center', cellLoc='center',
                          colWidths=[0.40, 0.20, 0.20, 0.20],
                          bbox=[0.0, 1.0 - hrv_table_height - 0.02, 1.0, hrv_table_height])
        table7.auto_set_font_size(False)
        table7.set_fontsize(9)
        
        for (row, col), cell in table7.get_celld().items():
            cell.set_edgecolor('#e5e7eb')
            if row == 0:
                cell.set_facecolor(COLORS['cyan'])
                cell.set_text_props(color='white', fontweight='bold', fontsize=8)
            elif row == len(hrv_data) - 1:
                cell.set_facecolor(TINTS['avg'])
                cell.set_text_props(fontweight='bold')
            elif col >= 1:
                cell.set_facecolor(TINTS['light'])
        
        add_footer(fig7, 7, total_pages)
        pdf.savefig(fig7)
        plt.close(fig7)
    
    buf.seek(0)
    return buf
