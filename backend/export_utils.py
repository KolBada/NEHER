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
    fig.text(0.5, footer_y, 'NEHER Analysis', ha='center', fontsize=8, color='#71717a')
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
        fig1.text(0.5, 0.935, 'NEHER Electrophysiology Analysis Report', ha='center', va='top', fontsize=10, color='#71717a')
        fig1.text(0.5, 0.915, f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}', ha='center', va='top', fontsize=8, color='#a1a1aa')
        fig1.add_artist(plt.Line2D([0.08, 0.92], [0.905, 0.905], color='#e4e4e7', linewidth=1, transform=fig1.transFigure))
        
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
        
        # LEFT COLUMN
        y = draw_header(fig1, left_x, 0.89, 'RECORDING INFO', '#18181b')
        
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
            for org in request.organoid_info:
                if org.get('cell_type'):
                    cell_type = org.get('other_cell_type') if org.get('cell_type') == 'Other' else org.get('cell_type')
                    y = draw_row(fig1, left_x, y, 'Cell Type:', cell_type or '—')
                if org.get('line_name'):
                    y = draw_row(fig1, left_x, y, 'Line:', org.get('line_name'))
                if org.get('age_at_recording') is not None:
                    y = draw_row(fig1, left_x, y, 'Age at Recording:', f"{org.get('age_at_recording')} days")
                if org.get('transfection'):
                    trans = org['transfection']
                    if trans.get('name'):
                        y = draw_row(fig1, left_x, y, 'Transfection:', trans.get('name'))
                    if trans.get('days_since_transfection') is not None:
                        y = draw_row(fig1, left_x, y, 'Days Post-Transf.:', trans.get('days_since_transfection'))
        
        if request.days_since_fusion is not None:
            y = draw_row(fig1, left_x, y, 'Days Since Fusion:', request.days_since_fusion)
        
        # DRUG PERFUSION
        if request.all_drugs and len(request.all_drugs) > 0:
            y -= 0.015
            y = draw_header(fig1, left_x, y, 'DRUG PERFUSION', COLORS['purple'])
            for drug in request.all_drugs:
                drug_name = f"{drug.get('name', 'Drug')}"
                if drug.get('concentration'):
                    drug_name += f" {drug.get('concentration')}µM"
                y = draw_row(fig1, left_x, y, 'Drug:', drug_name, TINTS['drug'])
                y = draw_row(fig1, left_x, y, 'Start:', f"{drug.get('start', 3)} min", TINTS['drug'])
                y = draw_row(fig1, left_x, y, 'Delay:', f"{drug.get('delay', 3)} min", TINTS['drug'])
                if drug.get('end') is not None:
                    y = draw_row(fig1, left_x, y, 'End:', f"{drug.get('end')} min", TINTS['drug'])
        
        # LIGHT STIMULATION
        if request.light_enabled:
            y -= 0.015
            y = draw_header(fig1, left_x, y, 'LIGHT STIMULATION', COLORS['amber'])
            y = draw_row(fig1, left_x, y, 'Status:', 'Enabled', TINTS['light'])
            if request.light_stim_count and request.light_stim_count > 0:
                y = draw_row(fig1, left_x, y, 'Stims Detected:', str(request.light_stim_count), TINTS['light'])
        
        # RIGHT COLUMN - READOUTS
        y_right = 0.89
        
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
            
            if request.drug_readout:
                drug_bf_minute = request.drug_readout.get('bf_minute')
                drug_hrv_minute = request.drug_readout.get('hrv_minute')
                
                if drug_bf_minute is not None and request.per_minute_data:
                    for pm in request.per_minute_data:
                        try:
                            minute_str = str(pm.get('minute', ''))
                            minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(minute_str)
                            if minute_num == drug_bf_minute:
                                drug_bf = pm.get('mean_bf')
                                break
                        except (ValueError, TypeError):
                            pass
                
                if drug_hrv_minute is not None and request.hrv_windows:
                    for w in request.hrv_windows:
                        if w.get('minute') == drug_hrv_minute:
                            drug_hrv_data = w
                            break
            
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
                    ttp_vals = [r.get('time_to_peak_sec') for r in valid if r.get('time_to_peak_sec')]
                    ttp = np.mean(ttp_vals) if ttp_vals else None
                    ttp_1st = valid[0].get('time_to_peak_sec') if valid else None
                    recovery_bf_vals = [r.get('bf_end') for r in valid if r.get('bf_end')]
                    recovery_bf = np.mean(recovery_bf_vals) if recovery_bf_vals else None
                    recovery_pct_vals = [r.get('bf_end_pct') for r in valid if r.get('bf_end_pct')]
                    recovery_pct = np.mean(recovery_pct_vals) if recovery_pct_vals else None
                    amplitude_vals = [r.get('amplitude') for r in valid if r.get('amplitude')]
                    amplitude = np.mean(amplitude_vals) if amplitude_vals else None
                    
                    y_right = draw_row(fig1, right_x, y_right, 'Baseline BF:', f"{baseline_bf:.1f} bpm" if baseline_bf else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Avg BF:', f"{avg_bf:.1f} bpm", TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Peak BF:', f"{peak_bf:.1f} bpm", TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Peak (Norm.):', f"{peak_norm:.1f}%" if peak_norm else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Amplitude:', f"{amplitude:.1f} bpm" if amplitude else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'Time to Peak:', f"{ttp:.1f} s" if ttp else '—', TINTS['light'])
                    y_right = draw_row(fig1, right_x, y_right, 'TTP (1st Stim):', f"{ttp_1st:.1f} s" if ttp_1st else '—', TINTS['light'])
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
                    for pm in request.per_minute_data:
                        try:
                            minute_str = str(pm.get('minute', ''))
                            minute_num = int(minute_str.split('-')[0]) if '-' in minute_str else int(minute_str)
                            if minute_num == drug_bf_minute:
                                baseline_bf = pm.get('mean_bf')
                                norm_source = 'Drug Readout'
                                break
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
                    drug_patch = None
                    for drug in request.all_drugs:
                        start = drug.get('start', 0) + drug.get('delay', 0)
                        end = drug.get('end') if drug.get('end') else time_max * 1.1
                        ax1.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
                    drug_patch = mpatches.Patch(color=COLORS['purple'], alpha=0.3, label='Drug Perfusion')
                
                # Add light stim regions with legend
                light_patch = None
                if request.light_enabled and request.light_pulses:
                    for pulse in request.light_pulses:
                        start_min = pulse.get('start_min', pulse.get('start_sec', 0) / 60)
                        end_min = pulse.get('end_min', pulse.get('end_sec', 0) / 60)
                        ax1.axvspan(start_min, end_min, alpha=0.2, color=COLORS['amber'])
                    light_patch = mpatches.Patch(color=COLORS['amber'], alpha=0.3, label='Light Stim')
                
                # Build legend
                handles = [mpatches.Patch(color=COLORS['emerald'], alpha=0.7, label='Filtered BF')]
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
                    ax2.scatter(times, bf_norm, s=3, c=COLORS['sky'], alpha=0.7)
                    ax2.axhline(y=100, color='#dc2626', linestyle='--', linewidth=1, label=f'{norm_source} (100%)')
                    ax2.set_ylabel('BF (% of Reference)', fontsize=9)
                    ax2.set_xlabel('Time (min)', fontsize=9)
                    ax2.set_title(f'Beat Frequency (Normalized to {norm_source})', fontsize=10, fontweight='bold', pad=10)
                    ax2.set_xlim(0, time_max * 1.05)
                    
                    if request.all_drugs:
                        for drug in request.all_drugs:
                            start = drug.get('start', 0) + drug.get('delay', 0)
                            end = drug.get('end') if drug.get('end') else time_max * 1.1
                            ax2.axvspan(start, end, alpha=0.15, color=COLORS['purple'])
                    
                    ax2.legend(loc='upper right', fontsize=7, framealpha=0.9)
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
            if request.baseline:
                baseline_window = request.baseline.get('baseline_bf_range', '1-2')
            if request.drug_readout:
                bf_min = request.drug_readout.get('bf_minute')
                if bf_min is not None:
                    drug_window = f"{bf_min}-{bf_min+1}"
            
            headers = ['Window (min)', 'Beats', 'Mean BF (bpm)', 'Mean NN (ms)']
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
                
                table_data.append([
                    window_str,
                    str(pm.get('beat_count', pm.get('n_beats', 0))),
                    f"{pm.get('mean_bf', 0):.1f}",
                    f"{pm.get('mean_nn', 0):.1f}",
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
                        cell.set_facecolor(row_colors[row-1])
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
            if request.baseline:
                baseline_minute = request.baseline.get('baseline_hrv_minute', 0)
            if request.drug_readout:
                drug_minute = request.drug_readout.get('hrv_minute')
            
            headers = ['Window', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀', 'BF']
            table_data = []
            row_colors = []
            
            for w in request.hrv_windows:
                sdnn = w.get('sdnn')
                ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
                minute = w.get('minute', 0)
                
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
                if baseline_minute is not None and minute == baseline_minute:
                    row_colors.append(TINTS['baseline'])
                elif drug_minute is not None and minute == drug_minute:
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
                        cell.set_facecolor(row_colors[row-1])
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
                
                headers = ['Stim', 'Beats', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'TTP (s)']
                table_data = []
                
                for i, r in enumerate(valid):
                    table_data.append([
                        str(i + 1),
                        str(r.get('n_beats', 0)),
                        f"{r.get('baseline_bf', 0):.1f}",
                        f"{r.get('avg_bf', 0):.1f}",
                        f"{r.get('peak_bf', 0):.1f}",
                        f"{r.get('peak_norm_pct', 0):.1f}" if r.get('peak_norm_pct') else '—',
                        f"{r.get('time_to_peak_sec', 0):.1f}",
                    ])
                
                # Add average row
                if len(valid) > 1:
                    table_data.append([
                        'Avg',
                        '',
                        f"{np.mean([r.get('baseline_bf', 0) for r in valid]):.1f}",
                        f"{np.mean([r.get('avg_bf', 0) for r in valid]):.1f}",
                        f"{np.mean([r.get('peak_bf', 0) for r in valid]):.1f}",
                        f"{np.mean([r.get('peak_norm_pct', 0) for r in valid if r.get('peak_norm_pct')]):.1f}",
                        f"{np.mean([r.get('time_to_peak_sec', 0) for r in valid]):.1f}",
                    ])
                
                table = ax.table(cellText=table_data, colLabels=headers, loc='upper center', cellLoc='center')
                table.auto_set_font_size(False)
                table.set_fontsize(9)
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
            per_stim = request.light_metrics_detrended.get('per_stim', [])
            final = request.light_metrics_detrended.get('final', {})
            
            if per_stim or final:
                page_num += 1
                fig7 = plt.figure(figsize=(8.5, 11))
                fig7.suptitle('Light-Induced Corrected HRV (Detrended) Data Table', fontsize=14, fontweight='bold', y=0.96)
                
                ax = fig7.add_axes([0.05, 0.1, 0.9, 0.8])
                ax.axis('off')
                
                headers = ['Stim', 'ln(RMSSD₇₀)', 'RMSSD₇₀', 'ln(SDNN₇₀)', 'SDNN', 'pNN50₇₀']
                table_data = []
                
                # Add each stim first
                for i, s in enumerate(per_stim):
                    if s:
                        table_data.append([
                            str(i + 1),
                            f"{s.get('ln_rmssd70_detrended', 0):.3f}" if s.get('ln_rmssd70_detrended') else '—',
                            f"{s.get('rmssd70_detrended', 0):.3f}" if s.get('rmssd70_detrended') else '—',
                            f"{s.get('ln_sdnn70_detrended', 0):.3f}" if s.get('ln_sdnn70_detrended') else '—',
                            f"{s.get('sdnn_detrended', 0):.3f}" if s.get('sdnn_detrended') else '—',
                            f"{s.get('pnn50_detrended', 0):.1f}" if s.get('pnn50_detrended') is not None else '—',
                        ])
                
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
    """Create a clean Excel export"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Border, Side
    
    wb = Workbook()
    
    header_font = Font(bold=True, color='FFFFFF', size=10)
    data_font = Font(size=9)
    
    emerald_fill = PatternFill(start_color='10B981', end_color='10B981', fill_type='solid')
    purple_fill = PatternFill(start_color='A855F7', end_color='A855F7', fill_type='solid')
    amber_fill = PatternFill(start_color='F59E0B', end_color='F59E0B', fill_type='solid')
    baseline_fill = PatternFill(start_color='E0F2FE', end_color='E0F2FE', fill_type='solid')
    drug_fill = PatternFill(start_color='F3E8FF', end_color='F3E8FF', fill_type='solid')
    
    ws = wb.active
    ws.title = 'Summary'
    
    row = 1
    ws.cell(row=row, column=1, value=request.recording_name or 'Recording Analysis').font = Font(bold=True, size=14)
    row += 2
    
    ws.cell(row=row, column=1, value='RECORDING INFO').font = Font(bold=True, size=11)
    row += 1
    
    if request.original_filename:
        ws.cell(row=row, column=1, value='Original File').font = data_font
        ws.cell(row=row, column=2, value=request.original_filename).font = data_font
        row += 1
    
    if request.summary:
        for key in ['Total Beats', 'Kept Beats', 'Removed Beats', 'Filter Range']:
            if key in request.summary:
                ws.cell(row=row, column=1, value=key).font = data_font
                ws.cell(row=row, column=2, value=str(request.summary[key])).font = data_font
                row += 1
    
    row += 1
    
    if request.all_drugs:
        ws.cell(row=row, column=1, value='DRUG PERFUSION').font = Font(bold=True, size=11)
        row += 1
        for drug in request.all_drugs:
            ws.cell(row=row, column=1, value='Drug').font = data_font
            ws.cell(row=row, column=2, value=f"{drug.get('name')} {drug.get('concentration', '')}µM").font = data_font
            row += 1
            ws.cell(row=row, column=1, value='Start / Delay / End').font = data_font
            end_str = f"{drug.get('end')} min" if drug.get('end') else '—'
            ws.cell(row=row, column=2, value=f"{drug.get('start', 3)} / {drug.get('delay', 3)} / {end_str}").font = data_font
            row += 1
        row += 1
    
    ws.cell(row=row, column=1, value='LIGHT STIMULATION').font = Font(bold=True, size=11)
    row += 1
    ws.cell(row=row, column=1, value='Status').font = data_font
    ws.cell(row=row, column=2, value='Enabled' if request.light_enabled else 'Disabled').font = data_font
    row += 1
    if request.light_enabled and request.light_stim_count:
        ws.cell(row=row, column=1, value='Stims Detected').font = data_font
        ws.cell(row=row, column=2, value=str(request.light_stim_count)).font = data_font
    
    # BF Data Sheet
    if request.per_minute_data:
        ws_bf = wb.create_sheet('Spontaneous BF')
        ws_bf.append(['Window (min)', 'Beats', 'Mean BF (bpm)', 'Mean NN (ms)'])
        for cell in ws_bf[1]:
            cell.font = header_font
            cell.fill = emerald_fill
        
        baseline_window = request.baseline.get('baseline_bf_range', '1-2') if request.baseline else None
        drug_bf_minute = request.drug_readout.get('bf_minute') if request.drug_readout else None
        drug_window = f"{drug_bf_minute}-{drug_bf_minute+1}" if drug_bf_minute is not None else None
        
        for pm in request.per_minute_data:
            minute_val = pm.get('minute', '')
            try:
                minute_num = int(str(minute_val).split('-')[0]) if '-' in str(minute_val) else int(minute_val)
                window_str = f"{minute_num}-{minute_num+1}"
            except (ValueError, TypeError):
                window_str = str(minute_val)
            
            ws_bf.append([
                window_str,
                pm.get('beat_count', pm.get('n_beats', 0)),
                round(pm.get('mean_bf', 0), 1),
                round(pm.get('mean_nn', 0), 1),
            ])
            
            row_num = ws_bf.max_row
            if baseline_window and window_str == baseline_window:
                for cell in ws_bf[row_num]:
                    cell.fill = baseline_fill
            elif drug_window and window_str == drug_window:
                for cell in ws_bf[row_num]:
                    cell.fill = drug_fill
    
    # HRV Data Sheet
    if request.hrv_windows:
        ws_hrv = wb.create_sheet('Spontaneous HRV')
        ws_hrv.append(['Window', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50', 'BF'])
        for cell in ws_hrv[1]:
            cell.font = header_font
            cell.fill = purple_fill
        
        baseline_minute = request.baseline.get('baseline_hrv_minute', 0) if request.baseline else None
        drug_minute = request.drug_readout.get('hrv_minute') if request.drug_readout else None
        
        for w in request.hrv_windows:
            sdnn = w.get('sdnn')
            ln_sdnn = np.log(sdnn) if sdnn and sdnn > 0 else None
            minute = w.get('minute', 0)
            
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
            if baseline_minute is not None and minute == baseline_minute:
                for cell in ws_hrv[row_num]:
                    cell.fill = baseline_fill
            elif drug_minute is not None and minute == drug_minute:
                for cell in ws_hrv[row_num]:
                    cell.fill = drug_fill
    
    # Light HRA Sheet
    if request.light_enabled and request.light_response:
        valid = [r for r in request.light_response if r]
        if valid:
            ws_hra = wb.create_sheet('Light HRA')
            ws_hra.append(['Stim', 'Beats', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'TTP (s)'])
            for cell in ws_hra[1]:
                cell.font = header_font
                cell.fill = amber_fill
            
            for i, r in enumerate(valid):
                ws_hra.append([
                    i + 1,
                    r.get('n_beats', 0),
                    round(r.get('baseline_bf', 0), 1),
                    round(r.get('avg_bf', 0), 1),
                    round(r.get('peak_bf', 0), 1),
                    round(r.get('peak_norm_pct', 0), 1) if r.get('peak_norm_pct') else None,
                    round(r.get('time_to_peak_sec', 0), 1),
                ])
    
    # Corrected HRV Sheet
    if request.light_enabled and request.light_metrics_detrended:
        per_stim = request.light_metrics_detrended.get('per_stim', [])
        final = request.light_metrics_detrended.get('final', {})
        
        if per_stim or final:
            ws_corr = wb.create_sheet('Corrected HRV')
            ws_corr.append(['Stim', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50'])
            for cell in ws_corr[1]:
                cell.font = header_font
                cell.fill = emerald_fill
            
            for i, s in enumerate(per_stim):
                if s:
                    ws_corr.append([
                        i + 1,
                        round(s.get('ln_rmssd70_detrended', 0), 3) if s.get('ln_rmssd70_detrended') else None,
                        round(s.get('rmssd70_detrended', 0), 3) if s.get('rmssd70_detrended') else None,
                        round(s.get('ln_sdnn70_detrended', 0), 3) if s.get('ln_sdnn70_detrended') else None,
                        round(s.get('sdnn_detrended', 0), 3) if s.get('sdnn_detrended') else None,
                        round(s.get('pnn50_detrended', 0), 1) if s.get('pnn50_detrended') is not None else None,
                    ])
            
            if final:
                ws_corr.append([
                    'Median',
                    round(final.get('ln_rmssd70_detrended', 0), 3) if final.get('ln_rmssd70_detrended') else None,
                    round(final.get('rmssd70_detrended', 0), 3) if final.get('rmssd70_detrended') else None,
                    round(final.get('ln_sdnn70_detrended', 0), 3) if final.get('ln_sdnn70_detrended') else None,
                    round(final.get('sdnn_detrended', 0), 3) if final.get('sdnn_detrended') else None,
                    round(final.get('pnn50_detrended', 0), 1) if final.get('pnn50_detrended') is not None else None,
                ])
    
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def create_nature_csv(request):
    """Create a clean CSV export"""
    import csv
    
    buf = io.StringIO()
    writer = csv.writer(buf)
    
    writer.writerow(['NEHER Analysis Export'])
    writer.writerow(['Recording', request.recording_name or request.filename or ''])
    writer.writerow([])
    
    if request.per_minute_data:
        writer.writerow(['SPONTANEOUS BF DATA'])
        writer.writerow(['Window (min)', 'Beats', 'Mean BF (bpm)', 'Mean NN (ms)'])
        for pm in request.per_minute_data:
            minute_val = pm.get('minute', '')
            try:
                minute_num = int(str(minute_val).split('-')[0]) if '-' in str(minute_val) else int(minute_val)
                window_str = f"{minute_num}-{minute_num+1}"
            except (ValueError, TypeError):
                window_str = str(minute_val)
            writer.writerow([
                window_str,
                pm.get('beat_count', pm.get('n_beats', 0)),
                round(pm.get('mean_bf', 0), 1),
                round(pm.get('mean_nn', 0), 1),
            ])
        writer.writerow([])
    
    if request.hrv_windows:
        writer.writerow(['SPONTANEOUS HRV DATA'])
        writer.writerow(['Window', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50', 'BF'])
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
    
    if request.light_enabled and request.light_response:
        valid = [r for r in request.light_response if r]
        if valid:
            writer.writerow(['LIGHT-INDUCED HRA'])
            writer.writerow(['Stim', 'Beats', 'Baseline BF', 'Avg BF', 'Peak BF', 'Peak %', 'TTP (s)'])
            for i, r in enumerate(valid):
                writer.writerow([
                    i + 1,
                    r.get('n_beats', 0),
                    round(r.get('baseline_bf', 0), 1),
                    round(r.get('avg_bf', 0), 1),
                    round(r.get('peak_bf', 0), 1),
                    round(r.get('peak_norm_pct', 0), 1) if r.get('peak_norm_pct') else '',
                    round(r.get('time_to_peak_sec', 0), 1),
                ])
            writer.writerow([])
    
    if request.light_enabled and request.light_metrics_detrended:
        per_stim = request.light_metrics_detrended.get('per_stim', [])
        final = request.light_metrics_detrended.get('final', {})
        
        if per_stim or final:
            writer.writerow(['LIGHT-INDUCED CORRECTED HRV (DETRENDED)'])
            writer.writerow(['Stim', 'ln(RMSSD70)', 'RMSSD70', 'ln(SDNN70)', 'SDNN', 'pNN50'])
            for i, s in enumerate(per_stim):
                if s:
                    writer.writerow([
                        i + 1,
                        round(s.get('ln_rmssd70_detrended', 0), 3) if s.get('ln_rmssd70_detrended') else '',
                        round(s.get('rmssd70_detrended', 0), 3) if s.get('rmssd70_detrended') else '',
                        round(s.get('ln_sdnn70_detrended', 0), 3) if s.get('ln_sdnn70_detrended') else '',
                        round(s.get('sdnn_detrended', 0), 3) if s.get('sdnn_detrended') else '',
                        round(s.get('pnn50_detrended', 0), 1) if s.get('pnn50_detrended') is not None else '',
                    ])
            
            if final:
                writer.writerow([
                    'Median',
                    round(final.get('ln_rmssd70_detrended', 0), 3) if final.get('ln_rmssd70_detrended') else '',
                    round(final.get('rmssd70_detrended', 0), 3) if final.get('rmssd70_detrended') else '',
                    round(final.get('ln_sdnn70_detrended', 0), 3) if final.get('ln_sdnn70_detrended') else '',
                    round(final.get('sdnn_detrended', 0), 3) if final.get('sdnn_detrended') else '',
                    round(final.get('pnn50_detrended', 0), 1) if final.get('pnn50_detrended') is not None else '',
                ])
    
    output = io.BytesIO()
    output.write(buf.getvalue().encode('utf-8'))
    output.seek(0)
    return output
