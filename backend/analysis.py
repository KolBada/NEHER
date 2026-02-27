import numpy as np
from scipy.signal import find_peaks, butter, sosfiltfilt


def bandpass_filter(signal, sr, lowcut=0.5, highcut=None, order=3):
    """Bandpass filter to clean signal before beat detection."""
    nyq = sr / 2.0
    if highcut is None:
        highcut = min(500.0, nyq * 0.9)
    low = max(lowcut / nyq, 0.001)
    high = min(highcut / nyq, 0.999)
    if low >= high:
        return signal
    sos = butter(order, [low, high], btype='band', output='sos')
    return sosfiltfilt(sos, signal)


def decimate_trace(times, voltages, target_points=5000):
    """Min-max decimation to preserve trace shape."""
    n = len(voltages)
    if n <= target_points:
        return times.tolist() if hasattr(times, 'tolist') else list(times), \
               voltages.tolist() if hasattr(voltages, 'tolist') else list(voltages)

    chunk_size = max(1, n // (target_points // 2))
    dec_times = []
    dec_voltages = []

    for i in range(0, n, chunk_size):
        chunk_v = voltages[i:i + chunk_size]
        chunk_t = times[i:i + chunk_size]
        if len(chunk_v) == 0:
            continue
        min_idx = np.argmin(chunk_v)
        max_idx = np.argmax(chunk_v)
        if min_idx <= max_idx:
            dec_times.append(float(chunk_t[min_idx]))
            dec_voltages.append(float(chunk_v[min_idx]))
            if min_idx != max_idx:
                dec_times.append(float(chunk_t[max_idx]))
                dec_voltages.append(float(chunk_v[max_idx]))
        else:
            dec_times.append(float(chunk_t[max_idx]))
            dec_voltages.append(float(chunk_v[max_idx]))
            dec_times.append(float(chunk_t[min_idx]))
            dec_voltages.append(float(chunk_v[min_idx]))

    return dec_times, dec_voltages


def detect_beats(trace, sample_rate, threshold=None, min_distance=None, prominence=None, invert=False, use_filter=True):
    """Detect beats using scipy peak detection with optional bandpass filtering."""
    signal = np.array(trace, dtype=np.float64)

    # Apply bandpass filter for cleaner detection
    if use_filter and sample_rate > 200:
        try:
            signal_filt = bandpass_filter(signal, sample_rate, lowcut=0.5,
                                         highcut=min(500.0, sample_rate * 0.45))
        except Exception:
            signal_filt = signal.copy()
    else:
        signal_filt = signal.copy()

    if invert:
        signal_filt = -signal_filt

    if min_distance is None:
        min_distance = int(0.3 * sample_rate)  # 300ms min (cardiac ~200-1000ms intervals)

    kwargs = {'distance': max(1, int(min_distance))}

    if threshold is not None:
        kwargs['height'] = threshold

    if prominence is not None:
        kwargs['prominence'] = prominence
    else:
        # Robust prominence from filtered signal percentiles
        q975 = np.percentile(signal_filt, 97.5)
        q025 = np.percentile(signal_filt, 2.5)
        sig_range = q975 - q025
        kwargs['prominence'] = sig_range * 0.3

    peaks, _ = find_peaks(signal_filt, **kwargs)
    return peaks.tolist()


def compute_beat_metrics(beat_times_sec):
    """
    Compute NN intervals and beat frequency from beat times in seconds.
    Returns: beat_times_min, nn_intervals_ms, beat_freq_bpm
    """
    bt = np.array(beat_times_sec, dtype=np.float64)
    beat_times_min = bt / 60.0

    nn_intervals_ms = np.diff(beat_times_min) * 60000.0
    beat_freq_bpm = 60000.0 / nn_intervals_ms

    return beat_times_min.tolist(), nn_intervals_ms.tolist(), beat_freq_bpm.tolist()


# ==============================================================================
# STEP 1: Beat Frequency Cleaning (Local Median Filter)
# ==============================================================================
def artifact_filter(beat_freq, window_half=5, lower_pct=50, upper_pct=200):
    """
    Apply local median filtering on beat frequency.
    For each beat frequency value, compute local median within ±window_half beats.
    Keep value only if it falls within (lower_pct/100) to (upper_pct/100) of local median.
    Replace outliers with NaN (missing).
    Returns: mask (list of bool), filtered_bf (list with NaN for outliers)
    """
    bf = np.array(beat_freq, dtype=np.float64)
    n = len(bf)
    mask = np.ones(n, dtype=bool)
    filtered_bf = bf.copy()
    
    lower_mult = lower_pct / 100.0
    upper_mult = upper_pct / 100.0

    for k in range(n):
        start = max(0, k - window_half)
        end = min(n, k + window_half + 1)
        local_median = np.median(bf[start:end])
        if local_median <= 0:
            mask[k] = False
            filtered_bf[k] = np.nan
            continue
        if not (lower_mult * local_median <= bf[k] <= upper_mult * local_median):
            mask[k] = False
            filtered_bf[k] = np.nan

    return mask.tolist(), filtered_bf.tolist()


# ==============================================================================
# STEP 2: Conversion to NN Intervals
# ==============================================================================
def bf_to_nn(beat_freq_list):
    """
    Convert beat frequency (bpm) to NN intervals (ms).
    Invalid/missing BF values result in NaN NN values.
    """
    bf = np.array(beat_freq_list, dtype=np.float64)
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    return nn.tolist()


# ==============================================================================
# STEP 3: Short Time-Bin Normalization (30-second windows to 70 bpm)
# ==============================================================================
def normalize_nn_70_windowing(beat_times_min, nn_values, bin_size_sec=30):
    """
    Normalize NN intervals using 30-second time bins.
    For each NN value:
      - Find all valid NN values in the same time bin
      - Compute median NN of that bin
      - Scale NN relative to 857ms (70 bpm reference)
    Returns: nn_70 normalized values
    
    Note: beat_times_min should have N values and nn_values should have N-1 values.
    We use beat_times_min[:-1] to align with NN intervals.
    """
    nn = np.array(nn_values, dtype=np.float64)
    
    # Use beat_times_min[:-1] to align with NN intervals (N-1 values)
    if len(beat_times_min) > len(nn):
        bt = np.array(beat_times_min[:len(nn)], dtype=np.float64)
    else:
        bt = np.array(beat_times_min, dtype=np.float64)
    
    # Time in seconds for binning
    bt_sec = bt * 60.0
    bin_size = bin_size_sec
    
    # Assign each point to a bin
    bin_indices = (bt_sec // bin_size).astype(int)
    
    nn_70 = np.full_like(nn, np.nan)
    
    # Get unique bins where we have valid NN values
    valid_nn_mask = ~np.isnan(nn)
    if not np.any(valid_nn_mask):
        return nn_70.tolist()
    
    unique_bins = np.unique(bin_indices[valid_nn_mask])
    
    for bin_idx in unique_bins:
        bin_mask = (bin_indices == bin_idx) & valid_nn_mask
        if np.sum(bin_mask) < 2:
            continue
        
        bin_nn = nn[bin_mask]
        median_nn = np.median(bin_nn)
        
        if median_nn > 0:
            # Scale to 70 bpm reference (857 ms)
            nn_70[bin_mask] = bin_nn * (857.0 / median_nn)
    
    return nn_70.tolist()


# ==============================================================================
# STEP 4: Per-Minute Aggregation
# ==============================================================================
def per_minute_aggregation(beat_times_min, bf_filtered, nn_70):
    """
    Compute minute-by-minute summaries across the recording.
    Returns list of per-minute rows with mean BF, mean NN, mean NN_70.
    """
    bt = np.array(beat_times_min, dtype=np.float64)
    bf = np.array(bf_filtered, dtype=np.float64)
    nn70 = np.array(nn_70, dtype=np.float64)
    
    # Compute NN from BF for valid values
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    
    t_start = int(np.floor(bt[0]))
    t_end = int(np.floor(bt[-1]))
    
    rows = []
    for m in range(t_start, t_end + 1):
        mask = (bt >= m) & (bt < m + 1)
        if np.sum(mask) == 0:
            continue
        
        bf_min = bf[mask]
        nn_min = nn[mask]
        nn70_min = nn70[mask]
        
        # Count valid beats
        n_valid = int(np.sum(~np.isnan(bf_min)))
        
        # Mean values (ignoring NaN)
        avg_bf = float(np.nanmean(bf_min)) if n_valid > 0 else None
        avg_nn = float(np.nanmean(nn_min)) if n_valid > 0 else None
        avg_nn_70 = float(np.nanmean(nn70_min)) if np.sum(~np.isnan(nn70_min)) > 0 else None
        
        rows.append({
            'minute': m,
            'label': f'{m}-{m+1}',
            'n_beats': n_valid,
            'avg_bf': avg_bf,
            'avg_nn': avg_nn,
            'avg_nn_70': avg_nn_70,
        })
    
    return rows


# ==============================================================================
# STEP 5: Rolling 3-Minute HRV Metrics with Overlapping Windows
# ==============================================================================
def compute_hrv_for_nn_segment(nn_values):
    """Compute RMSSD, SDNN, pNN50 for a segment of NN intervals."""
    nn = np.array(nn_values, dtype=np.float64)
    valid = nn[~np.isnan(nn)]
    if len(valid) < 3:
        return None
    diffs = np.diff(valid)
    rmssd = float(np.sqrt(np.mean(diffs ** 2)))
    sdnn = float(np.std(valid, ddof=1)) if len(valid) > 1 else 0.0
    pnn50 = float(100.0 * np.sum(np.abs(diffs) > 50.0) / len(diffs)) if len(diffs) > 0 else 0.0
    return rmssd, sdnn, pnn50


def rolling_3min_hrv(beat_times_min, nn_70, bf_filtered):
    """
    Compute rolling 3-minute HRV with overlapping windows (advance by 1 min).
    Uses 30-second sub-windows within each 3-min window.
    Aggregates sub-window metrics using median for stability.
    """
    bt = np.array(beat_times_min, dtype=np.float64)
    nn70 = np.array(nn_70, dtype=np.float64)
    bf = np.array(bf_filtered, dtype=np.float64)
    
    t_start = int(np.floor(bt[0]))
    t_end_possible = int(np.floor(bt[-1])) - 2

    if t_end_possible < t_start:
        return []

    results = []

    for m in range(t_start, t_end_possible + 1):
        window_start = float(m)
        window_end = float(m + 3)

        w_mask = (bt >= window_start) & (bt < window_end)
        if np.sum(w_mask) < 6:
            continue

        nn70_win = nn70[w_mask]
        bt_win = bt[w_mask]
        bf_win = bf[w_mask]

        # Compute HRV from 6 overlapping 30-second sub-windows
        rmssd_list = []
        sdnn_list = []
        pnn50_list = []

        for i in range(6):
            sub_start = window_start + i * 0.5
            sub_end = sub_start + 0.5
            sub_mask = (bt_win >= sub_start) & (bt_win < sub_end)
            nn70_sub = nn70_win[sub_mask]

            valid_sub = nn70_sub[~np.isnan(nn70_sub)]
            if len(valid_sub) < 3:
                continue

            metrics = compute_hrv_for_nn_segment(valid_sub)
            if metrics:
                rmssd_list.append(metrics[0])
                sdnn_list.append(metrics[1])
                pnn50_list.append(metrics[2])

        if len(rmssd_list) >= 1:
            # Aggregate using median for stability
            final_rmssd = float(np.median(rmssd_list))
            final_sdnn = float(np.median(sdnn_list))
            final_pnn50 = float(np.median(pnn50_list))
            ln_rmssd = float(np.log(final_rmssd)) if final_rmssd > 0 else None

            # Also compute mean BF for the window
            valid_bf = bf_win[~np.isnan(bf_win)]
            mean_bf = float(np.mean(valid_bf)) if len(valid_bf) > 0 else None

            results.append({
                'minute': m,
                'window': f'{m}-{m+3}',
                'rmssd70': final_rmssd,
                'ln_rmssd70': ln_rmssd,
                'sdnn': final_sdnn,
                'pnn50': final_pnn50,
                'mean_bf': mean_bf,
                'n_beats': int(np.sum(~np.isnan(nn70_win))),
            })

    return results


def spontaneous_hrv_analysis(beat_times_min_list, bf_filtered_list, readout_minute=None):
    """
    Wrapper for the full HRV analysis workflow.
    """
    # Convert BF to NN_70 using 30-second windowing
    nn_70 = normalize_nn_70_windowing(beat_times_min_list, 
                                       bf_to_nn(bf_filtered_list))
    
    # Compute rolling 3-min HRV
    results = rolling_3min_hrv(beat_times_min_list, nn_70, bf_filtered_list)
    
    # Find readout if specified
    readout = None
    if readout_minute is not None:
        for r in results:
            if r['minute'] == readout_minute:
                readout = r
                break
    
    return results, readout


# ==============================================================================
# STEP 6 & 7: Light Stimulation Analysis
# ==============================================================================
def auto_detect_light_start(beat_times_min_list, bf_filtered_list, approx_start_sec, search_range_sec=20):
    """
    Auto-detect light stim start from BF pattern:
    - Peak (almost instant or in a couple of seconds)
    - Slowdown that is still above the baseline
    - Drop to baseline or lower
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Remove NaN for analysis
    valid_mask = ~np.isnan(bf)
    bt_valid = bt[valid_mask]
    bf_valid = bf[valid_mask]

    approx_min = approx_start_sec / 60.0
    search_min = search_range_sec / 60.0

    # Get baseline from 1-2 minutes before the search window
    baseline_mask = (bt_valid >= approx_min - search_min - 2.0) & (bt_valid < approx_min - search_min)
    if np.sum(baseline_mask) < 3:
        baseline_mask = (bt_valid >= approx_min - 3.0) & (bt_valid < approx_min - 1.0)
    baseline_bf = float(np.median(bf_valid[baseline_mask])) if np.sum(baseline_mask) > 0 else float(np.median(bf_valid))

    # Search window
    mask = (bt_valid >= approx_min - search_min) & (bt_valid <= approx_min + search_min * 2)
    if np.sum(mask) < 5:
        return approx_start_sec

    bf_window = bf_valid[mask]
    bt_window = bt_valid[mask]

    # Smooth BF 
    kernel = min(5, len(bf_window))
    if kernel < 2:
        return approx_start_sec
    bf_smooth = np.convolve(bf_window, np.ones(kernel) / kernel, mode='same')
    
    # Find points significantly above baseline (potential peak response)
    threshold = baseline_bf * 1.15  # 15% above baseline
    above_baseline = bf_smooth > threshold
    
    if not np.any(above_baseline):
        # Fallback: find largest positive jump
        bf_diff = np.diff(bf_smooth)
        if len(bf_diff) > 0:
            onset_idx = int(np.argmax(bf_diff))
            return float(bt_window[onset_idx] * 60.0)
        return approx_start_sec
    
    # Find the first index where BF rises above threshold
    first_above = np.argmax(above_baseline)
    
    # Look for the actual onset: where the rapid increase starts
    search_back = min(first_above, 10)
    if search_back > 0:
        segment = bf_smooth[first_above - search_back:first_above + 1]
        segment_diff = np.diff(segment)
        if len(segment_diff) > 0:
            rise_idx = np.argmax(segment_diff)
            onset_idx = first_above - search_back + rise_idx
            return float(bt_window[onset_idx] * 60.0)
    
    return float(bt_window[first_above] * 60.0)


def compute_light_stim_metrics(beat_times_min, bf_filtered, nn_70, pulse):
    """
    Compute metrics for a single light stimulation epoch.
    Uses the full workflow: filtered BF, NN, NN_70, HRV.
    """
    bt = np.array(beat_times_min, dtype=np.float64)
    bf = np.array(bf_filtered, dtype=np.float64)
    nn70 = np.array(nn_70, dtype=np.float64)
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    
    # Mask for this pulse
    p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min'])
    
    bf_stim = bf[p_mask]
    nn_stim = nn[p_mask]
    nn70_stim = nn70[p_mask]
    bt_stim = bt[p_mask]
    
    # Valid counts (non-NaN)
    valid_bf = bf_stim[~np.isnan(bf_stim)]
    valid_nn = nn_stim[~np.isnan(nn_stim)]
    valid_nn70 = nn70_stim[~np.isnan(nn70_stim)]
    
    if len(valid_bf) < 2:
        return None
    
    n_beats = len(valid_bf)
    avg_bf = float(np.mean(valid_bf))
    avg_nn = float(np.mean(valid_nn)) if len(valid_nn) > 0 else None
    avg_nn_70 = float(np.mean(valid_nn70)) if len(valid_nn70) > 0 else None
    
    # HRV metrics from NN_70
    hrv = compute_hrv_for_nn_segment(valid_nn70)
    rmssd = hrv[0] if hrv else None
    sdnn = hrv[1] if hrv else None
    pnn50 = hrv[2] if hrv else None
    ln_rmssd = float(np.log(rmssd)) if rmssd and rmssd > 0 else None
    
    return {
        'n_beats': n_beats,
        'avg_bf': avg_bf,
        'avg_nn': avg_nn,
        'avg_nn_70': avg_nn_70,
        'rmssd70': rmssd,
        'ln_rmssd70': ln_rmssd,
        'sdnn': sdnn,
        'pnn50': pnn50,
    }


def compute_light_response_v2(beat_times_min_list, bf_filtered_list, pulses):
    """
    Compute light response metrics per stimulation pulse.
    Includes: Peak HR, Time to Peak, Rate of Change (normalized slope), Amplitude.
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Remove NaN for calculations
    valid_mask = ~np.isnan(bf)
    
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    nn_70 = normalize_nn_70_windowing(beat_times_min_list, nn.tolist())
    nn_70 = np.array(nn_70, dtype=np.float64)

    # Baseline from 2-1 minutes before first stimulation
    first_start_min = pulses[0]['start_min']
    baseline_mask = (bt >= first_start_min - 2.0) & (bt < first_start_min - 1.0) & valid_mask
    baseline_bf = float(np.mean(bf[baseline_mask])) if np.sum(baseline_mask) > 0 else None

    per_stim = []
    for pulse in pulses:
        p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min']) & valid_mask
        bf_stim = bf[p_mask]
        bt_stim = bt[p_mask]
        nn_stim = nn[p_mask]
        nn70_stim = nn_70[p_mask]

        if len(bf_stim) < 2:
            per_stim.append(None)
            continue

        # Basic metrics
        n_beats = int(np.sum(p_mask))
        mean_bf_stim = float(np.mean(bf_stim))
        avg_nn = float(np.nanmean(nn_stim))
        avg_nn_70 = float(np.nanmean(nn70_stim)) if np.sum(~np.isnan(nn70_stim)) > 0 else avg_nn

        # Peak HR
        peak_bf = float(np.max(bf_stim))
        peak_idx = int(np.argmax(bf_stim))
        time_to_peak_sec = float((bt_stim[peak_idx] - pulse['start_min']) * 60.0)
        
        # Peak relative to baseline
        peak_norm = float(100.0 * peak_bf / baseline_bf) if baseline_bf and baseline_bf > 0 else None
        peak_diff = float(peak_bf - baseline_bf) if baseline_bf else None

        # Amplitude: peak - last beat before drop (return to near baseline)
        post_peak_bf = bf_stim[peak_idx:]
        if len(post_peak_bf) > 2 and baseline_bf:
            drop_threshold = baseline_bf * 1.05
            below_threshold = post_peak_bf < drop_threshold
            if np.any(below_threshold):
                drop_idx = np.argmax(below_threshold)
                pre_drop_idx = peak_idx + max(0, drop_idx - 1)
                pre_drop_bf = float(bf_stim[pre_drop_idx])
            else:
                pre_drop_bf = float(bf_stim[-1])
        else:
            pre_drop_bf = peak_bf
            
        amplitude = float(peak_bf - pre_drop_bf)

        # Slope (rate of change): bpm/min, normalized by mean BF
        t_min = bt_stim - bt_stim[0]  # time in minutes from stim start
        if len(t_min) > 1:
            coeffs = np.polyfit(t_min, bf_stim, 1)
            slope_bpm_per_min = float(coeffs[0])
        else:
            slope_bpm_per_min = 0.0
        
        norm_slope = float(slope_bpm_per_min / mean_bf_stim) if mean_bf_stim > 0 else None

        per_stim.append({
            'pulse_index': pulse['index'],
            'n_beats': n_beats,
            'avg_bf': mean_bf_stim,
            'avg_nn': avg_nn,
            'nn_70': avg_nn_70,
            'peak_bf': peak_bf,
            'peak_norm_pct': peak_norm,
            'peak_diff': peak_diff,
            'time_to_peak_sec': time_to_peak_sec,
            'slope': slope_bpm_per_min,
            'norm_slope': norm_slope,
            'amplitude': amplitude,
            'pre_drop_bf': pre_drop_bf,
        })

    # Aggregate across stimulations
    valid = [s for s in per_stim if s is not None]
    if valid:
        def safe_mean(key):
            vals = [s[key] for s in valid if s.get(key) is not None]
            return float(np.mean(vals)) if vals else None
        
        def safe_median(key):
            vals = [s[key] for s in valid if s.get(key) is not None]
            return float(np.median(vals)) if vals else None

        # Average for BF-based metrics
        mean_metrics = {
            'n_beats': safe_mean('n_beats'),
            'avg_bf': safe_mean('avg_bf'),
            'avg_nn': safe_mean('avg_nn'),
            'nn_70': safe_mean('nn_70'),
            'peak_bf': safe_mean('peak_bf'),
            'peak_norm_pct': safe_mean('peak_norm_pct'),
            'peak_diff': safe_mean('peak_diff'),
            'time_to_peak_sec': safe_mean('time_to_peak_sec'),
            'slope': safe_mean('slope'),
            'norm_slope': safe_mean('norm_slope'),
            'amplitude': safe_mean('amplitude'),
        }
    else:
        mean_metrics = None

    return per_stim, mean_metrics, baseline_bf


def compute_light_hrv(beat_times_min_list, bf_filtered_list, pulses):
    """
    Compute HRV metrics for each light stimulation pulse.
    Uses NN_70 normalization within each pulse.
    Returns per-pulse HRV and median across pulses.
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    nn_70 = np.array(normalize_nn_70_windowing(beat_times_min_list, nn.tolist()), dtype=np.float64)

    per_pulse = []
    for pulse in pulses:
        p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min'])
        nn70_pulse = nn_70[p_mask]
        valid_nn70 = nn70_pulse[~np.isnan(nn70_pulse)]

        if len(valid_nn70) < 3:
            per_pulse.append(None)
            continue

        hrv = compute_hrv_for_nn_segment(valid_nn70)
        if hrv:
            rmssd, sdnn, pnn50 = hrv
            ln_rmssd = float(np.log(rmssd)) if rmssd > 0 else None
            per_pulse.append({
                'rmssd70': rmssd,
                'ln_rmssd70': ln_rmssd,
                'sdnn': sdnn,
                'pnn50': pnn50,
                'n_beats': len(valid_nn70),
            })
        else:
            per_pulse.append(None)

    # Median across pulses for HRV metrics
    valid = [p for p in per_pulse if p is not None]
    if valid:
        final = {
            'rmssd70': float(np.median([p['rmssd70'] for p in valid])),
            'ln_rmssd70': float(np.median([p['ln_rmssd70'] for p in valid if p['ln_rmssd70'] is not None])) if any(p['ln_rmssd70'] is not None for p in valid) else None,
            'sdnn': float(np.median([p['sdnn'] for p in valid])),
            'pnn50': float(np.median([p['pnn50'] for p in valid])),
        }
    else:
        final = None

    return {'per_pulse': per_pulse, 'final': final}


# ==============================================================================
# Baseline Metrics Computation
# ==============================================================================
def compute_baseline_metrics(beat_times_min_list, bf_filtered_list, hrv_start=0, hrv_end=3, bf_start=1, bf_end=2):
    """
    Compute baseline readout metrics.
    HRV: from hrv_start to hrv_end minutes (default 0-3 min)
    BF: from bf_start to bf_end minutes (default 1-2 min)
    Uses proper NN_70 normalization.
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    nn_70 = np.array(normalize_nn_70_windowing(beat_times_min_list, nn.tolist()), dtype=np.float64)
    
    result = {}
    
    # BF baseline (default 1-2 min)
    bf_mask = (bt >= bf_start) & (bt < bf_end) & (~np.isnan(bf))
    if np.sum(bf_mask) >= 2:
        result['baseline_bf'] = float(np.mean(bf[bf_mask]))
        result['baseline_bf_range'] = f"{bf_start}-{bf_end} min"
    else:
        result['baseline_bf'] = None
        result['baseline_bf_range'] = None
    
    # HRV baseline (default 0-3 min) using NN_70
    hrv_mask = (bt >= hrv_start) & (bt < hrv_end) & (~np.isnan(nn_70))
    if np.sum(hrv_mask) >= 6:
        nn70_hrv = nn_70[hrv_mask]
        valid_nn70 = nn70_hrv[~np.isnan(nn70_hrv)]
        
        if len(valid_nn70) >= 3:
            metrics = compute_hrv_for_nn_segment(valid_nn70)
            if metrics:
                rmssd, sdnn, pnn50 = metrics
                result['baseline_rmssd70'] = float(rmssd)
                result['baseline_ln_rmssd70'] = float(np.log(rmssd)) if rmssd > 0 else None
                result['baseline_sdnn'] = float(sdnn)
                result['baseline_pnn50'] = float(pnn50)
                result['baseline_hrv_range'] = f"{hrv_start}-{hrv_end} min"
            else:
                result['baseline_rmssd70'] = None
                result['baseline_ln_rmssd70'] = None
                result['baseline_sdnn'] = None
                result['baseline_pnn50'] = None
                result['baseline_hrv_range'] = None
        else:
            result['baseline_rmssd70'] = None
            result['baseline_ln_rmssd70'] = None
            result['baseline_sdnn'] = None
            result['baseline_pnn50'] = None
            result['baseline_hrv_range'] = None
    else:
        result['baseline_rmssd70'] = None
        result['baseline_ln_rmssd70'] = None
        result['baseline_sdnn'] = None
        result['baseline_pnn50'] = None
        result['baseline_hrv_range'] = None
    
    return result


# ==============================================================================
# Pulse Generation Utilities
# ==============================================================================
def generate_pulses(start_sec, duration_sec, interval_pattern, n_pulses):
    """Generate pulse timing information."""
    if interval_pattern == 'decreasing':
        intervals = [60, 30, 20, 10]
    else:
        intervals = [int(interval_pattern)] * (n_pulses - 1)
    
    pulses = []
    current_start = start_sec
    
    for i in range(n_pulses):
        pulses.append({
            'index': i,
            'start_sec': current_start,
            'end_sec': current_start + duration_sec,
            'start_min': current_start / 60.0,
            'end_min': (current_start + duration_sec) / 60.0,
        })
        if i < len(intervals):
            current_start += duration_sec + intervals[i]
        else:
            current_start += duration_sec + intervals[-1] if intervals else 60
    
    return pulses
