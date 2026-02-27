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


def artifact_filter(beat_freq, window_half=5, lower_pct=50, upper_pct=200):
    """
    Apply local median filtering on beat frequency.
    Keep beats where (lower_pct/100) * median <= BF <= (upper_pct/100) * median.
    Default: 50-200% of local median.
    Returns: mask (list of bool).
    """
    bf = np.array(beat_freq, dtype=np.float64)
    n = len(bf)
    mask = np.ones(n, dtype=bool)
    
    lower_mult = lower_pct / 100.0
    upper_mult = upper_pct / 100.0

    for k in range(n):
        start = max(0, k - window_half)
        end = min(n, k + window_half + 1)
        local_median = np.median(bf[start:end])
        if local_median <= 0:
            mask[k] = False
            continue
        if not (lower_mult * local_median <= bf[k] <= upper_mult * local_median):
            mask[k] = False

    return mask.tolist()


def compute_hrv_for_nn_segment(nn_values):
    """Compute RMSSD, SDNN, pNN50 for a segment of normalized NN intervals."""
    nn = np.array(nn_values, dtype=np.float64)
    if len(nn) < 3:
        return None
    diffs = np.diff(nn)
    rmssd = float(np.sqrt(np.mean(diffs ** 2)))
    sdnn = float(np.std(nn, ddof=1)) if len(nn) > 1 else 0.0
    pnn50 = float(100.0 * np.sum(np.abs(diffs) > 50.0) / len(diffs)) if len(diffs) > 0 else 0.0
    return rmssd, sdnn, pnn50


def spontaneous_hrv_analysis(beat_times_min_list, bf_filtered_list, readout_minute=None):
    """
    Compute time-resolved HRV with sliding 3-min windows.
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = 60000.0 / bf

    t_start = int(np.floor(bt[0]))
    t_end_possible = int(np.floor(bt[-1])) - 2

    if t_end_possible < t_start:
        return [], None

    results = []

    for m in range(t_start, t_end_possible + 1):
        window_start = float(m)
        window_end = float(m + 3)

        w_mask = (bt >= window_start) & (bt < window_end)
        if np.sum(w_mask) < 6:
            continue

        nn_win = nn[w_mask]
        bt_win = bt[w_mask]
        bf_win = bf[w_mask]

        rmssd_list = []
        sdnn_list = []
        pnn50_list = []

        for i in range(6):
            sub_start = window_start + i * 0.5
            sub_end = sub_start + 0.5
            sub_mask = (bt_win >= sub_start) & (bt_win < sub_end)
            nn_sub = nn_win[sub_mask]

            if len(nn_sub) < 3:
                continue

            median_nn = np.median(nn_sub)
            if median_nn <= 0:
                continue

            nn_70 = nn_sub * (857.0 / median_nn)
            metrics = compute_hrv_for_nn_segment(nn_70)
            if metrics:
                rmssd_list.append(metrics[0])
                sdnn_list.append(metrics[1])
                pnn50_list.append(metrics[2])

        if len(rmssd_list) >= 1:
            final_rmssd = float(np.median(rmssd_list))
            final_sdnn = float(np.median(sdnn_list))
            final_pnn50 = float(np.median(pnn50_list))
            ln_rmssd = float(np.log(final_rmssd)) if final_rmssd > 0 else None

            results.append({
                'minute': m,
                'window': f"{m}-{m + 3}",
                'ln_rmssd70': ln_rmssd,
                'rmssd70': final_rmssd,
                'sdnn': final_sdnn,
                'pnn50': final_pnn50,
                'mean_bf': float(np.mean(bf_win)),
                'n_beats': int(np.sum(w_mask))
            })

    readout = None
    if readout_minute is not None:
        for r in results:
            if r['minute'] == int(readout_minute):
                readout = r
                break

    return results, readout


def compute_light_pulses(start_time_sec, pulse_duration_sec, interval_sec=None, n_pulses=5):
    """Calculate pulse start/end times with decreasing intervals by default."""
    # Default: decreasing intervals as per protocol
    if interval_sec is None or interval_sec == 'decreasing':
        intervals = [60, 30, 20, 10]
    elif isinstance(interval_sec, (list, tuple)):
        intervals = list(interval_sec)
    else:
        intervals = [float(interval_sec)] * (n_pulses - 1)

    while len(intervals) < n_pulses - 1:
        intervals.append(intervals[-1] if intervals else 60)

    pulses = []
    current = float(start_time_sec)
    for i in range(n_pulses):
        pulses.append({
            'index': i,
            'start_sec': float(current),
            'end_sec': float(current + pulse_duration_sec),
            'start_min': float(current / 60.0),
            'end_min': float((current + pulse_duration_sec) / 60.0)
        })
        if i < len(intervals):
            current += pulse_duration_sec + intervals[i]
        else:
            current += pulse_duration_sec + 60
    return pulses


def compute_light_hrv(beat_times_min_list, bf_filtered_list, pulses):
    """Compute HRV metrics per light pulse."""
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = 60000.0 / bf

    per_pulse = []
    for pulse in pulses:
        p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min'])
        nn_pulse = nn[p_mask]

        if len(nn_pulse) < 3:
            per_pulse.append(None)
            continue

        median_nn = np.median(nn_pulse)
        if median_nn <= 0:
            per_pulse.append(None)
            continue

        nn_70 = nn_pulse * (857.0 / median_nn)
        metrics = compute_hrv_for_nn_segment(nn_70)
        if metrics:
            rmssd, sdnn, pnn50 = metrics
            ln_rmssd = float(np.log(rmssd)) if rmssd > 0 else None
            per_pulse.append({
                'pulse_index': pulse['index'],
                'rmssd70': float(rmssd),
                'ln_rmssd70': ln_rmssd,
                'sdnn': float(sdnn),
                'pnn50': float(pnn50),
                'n_beats': int(np.sum(p_mask))
            })
        else:
            per_pulse.append(None)

    valid = [m for m in per_pulse if m is not None]
    if valid:
        final_rmssd = float(np.median([m['rmssd70'] for m in valid]))
        final = {
            'rmssd70': final_rmssd,
            'ln_rmssd70': float(np.log(final_rmssd)) if final_rmssd > 0 else None,
            'sdnn': float(np.median([m['sdnn'] for m in valid])),
            'pnn50': float(np.median([m['pnn50'] for m in valid]))
        }
    else:
        final = None

    return per_pulse, final


def compute_light_response(beat_times_min_list, bf_filtered_list, pulses):
    """Compute light response metrics per stimulation pulse."""
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)

    first_start_min = pulses[0]['start_min']
    baseline_mask = (bt >= first_start_min - 1.0) & (bt < first_start_min)
    baseline_bf = float(np.mean(bf[baseline_mask])) if np.sum(baseline_mask) > 0 else None

    per_stim = []
    for pulse in pulses:
        p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min'])
        bf_stim = bf[p_mask]
        bt_stim = bt[p_mask]

        if len(bf_stim) < 2:
            per_stim.append(None)
            continue

        peak_bf = float(np.max(bf_stim))
        peak_idx = int(np.argmax(bf_stim))
        time_to_peak_sec = float((bt_stim[peak_idx] - pulse['start_min']) * 60.0)

        peak_norm = float(100.0 * peak_bf / baseline_bf) if baseline_bf and baseline_bf > 0 else None

        t_sec = (bt_stim - bt_stim[0]) * 60.0
        if len(t_sec) > 1:
            coeffs = np.polyfit(t_sec, bf_stim, 1)
            slope = float(coeffs[0])
        else:
            slope = 0.0

        mean_bf_stim = float(np.mean(bf_stim))
        norm_slope = float(slope / mean_bf_stim) if mean_bf_stim > 0 else None
        amplitude = float(peak_bf - baseline_bf) if baseline_bf else None

        per_stim.append({
            'pulse_index': pulse['index'],
            'peak_bf': peak_bf,
            'peak_norm_pct': peak_norm,
            'time_to_peak_sec': time_to_peak_sec,
            'slope': slope,
            'norm_slope': norm_slope,
            'amplitude': amplitude,
            'mean_bf': mean_bf_stim
        })

    valid = [s for s in per_stim if s is not None]
    if valid:
        def safe_mean(key):
            vals = [s[key] for s in valid if s[key] is not None]
            return float(np.mean(vals)) if vals else None

        mean_metrics = {
            'peak_bf': safe_mean('peak_bf'),
            'peak_norm_pct': safe_mean('peak_norm_pct'),
            'time_to_peak_sec': safe_mean('time_to_peak_sec'),
            'slope': safe_mean('slope'),
            'norm_slope': safe_mean('norm_slope'),
            'amplitude': safe_mean('amplitude'),
            'mean_bf': safe_mean('mean_bf')
        }
    else:
        mean_metrics = None

    return per_stim, mean_metrics, baseline_bf


def compute_per_minute_table(beat_times_min_list, bf_filtered_list):
    """Compute per-minute averages: BF, NN, NN_70."""
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = 60000.0 / bf

    t_start = int(np.floor(bt[0]))
    t_end = int(np.ceil(bt[-1]))

    rows = []
    for m in range(t_start, t_end):
        mask = (bt >= m) & (bt < m + 1)
        n = int(np.sum(mask))
        if n < 2:
            rows.append({
                'minute': m, 'label': f'{m}-{m+1}',
                'avg_bf': None, 'avg_nn': None, 'avg_nn_70': None, 'n_beats': n
            })
            continue

        bf_m = bf[mask]
        nn_m = nn[mask]
        median_nn = np.median(nn_m)
        nn_70 = nn_m * (857.0 / median_nn) if median_nn > 0 else nn_m

        rows.append({
            'minute': m, 'label': f'{m}-{m+1}',
            'avg_bf': float(np.mean(bf_m)),
            'avg_nn': float(np.mean(nn_m)),
            'avg_nn_70': float(np.mean(nn_70)),
            'n_beats': n
        })
    return rows


def auto_detect_light_start(beat_times_min_list, bf_filtered_list, approx_start_sec, search_range_sec=20):
    """
    Auto-detect light stim start from BF pattern:
    - Peak (almost instant or in a couple of seconds)
    - Slowdown that is still above the baseline
    - Drop to baseline or lower
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)

    approx_min = approx_start_sec / 60.0
    search_min = search_range_sec / 60.0

    # Get baseline from 1 minute before the search window
    baseline_mask = (bt >= approx_min - search_min - 1.0) & (bt < approx_min - search_min)
    if np.sum(baseline_mask) < 3:
        baseline_mask = (bt >= approx_min - search_min * 2) & (bt < approx_min - search_min)
    baseline_bf = float(np.median(bf[baseline_mask])) if np.sum(baseline_mask) > 0 else float(np.median(bf))

    # Search window
    mask = (bt >= approx_min - search_min) & (bt <= approx_min + search_min * 2)
    if np.sum(mask) < 5:
        return approx_start_sec

    bf_window = bf[mask]
    bt_window = bt[mask]

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
    # Go back from the first peak to find where it started rising
    search_back = min(first_above, 10)
    if search_back > 0:
        segment = bf_smooth[first_above - search_back:first_above + 1]
        segment_diff = np.diff(segment)
        if len(segment_diff) > 0:
            # Find where the rise began (first large positive diff)
            rise_idx = np.argmax(segment_diff)
            onset_idx = first_above - search_back + rise_idx
            return float(bt_window[onset_idx] * 60.0)
    
    return float(bt_window[first_above] * 60.0)


def compute_light_response_v2(beat_times_min_list, bf_filtered_list, pulses):
    """
    Compute light response metrics per stimulation pulse.
    Amplitude is between the peak and the last beat before the drop (not baseline).
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = 60000.0 / bf

    first_start_min = pulses[0]['start_min']
    baseline_mask = (bt >= first_start_min - 1.0) & (bt < first_start_min)
    baseline_bf = float(np.mean(bf[baseline_mask])) if np.sum(baseline_mask) > 0 else None

    per_stim = []
    for pulse in pulses:
        p_mask = (bt >= pulse['start_min']) & (bt < pulse['end_min'])
        bf_stim = bf[p_mask]
        bt_stim = bt[p_mask]
        nn_stim = nn[p_mask]

        if len(bf_stim) < 2:
            per_stim.append(None)
            continue

        # Metrics using BPM
        peak_bf = float(np.max(bf_stim))
        peak_idx = int(np.argmax(bf_stim))
        time_to_peak_sec = float((bt_stim[peak_idx] - pulse['start_min']) * 60.0)
        
        peak_norm = float(100.0 * peak_bf / baseline_bf) if baseline_bf and baseline_bf > 0 else None

        # Find the "last beat before drop" - the beat just before returning to baseline
        # Look for where BF drops significantly after the peak
        post_peak_bf = bf_stim[peak_idx:]
        if len(post_peak_bf) > 2:
            # Find where BF starts dropping back toward baseline
            drop_threshold = baseline_bf * 1.05 if baseline_bf else peak_bf * 0.7
            below_threshold = post_peak_bf < drop_threshold
            if np.any(below_threshold):
                drop_idx = np.argmax(below_threshold)
                # The "last beat before drop" is just before this
                pre_drop_idx = peak_idx + max(0, drop_idx - 1)
                pre_drop_bf = float(bf_stim[pre_drop_idx])
            else:
                pre_drop_bf = float(bf_stim[-1])
        else:
            pre_drop_bf = peak_bf
            
        # Amplitude = peak - last beat before drop
        amplitude = float(peak_bf - pre_drop_bf)

        # Slope calculation - in bpm/min, normalized by average BF of the stim
        # Convert time to minutes for the slope
        t_min = bt_stim - bt_stim[0]  # already in minutes
        if len(t_min) > 1:
            coeffs = np.polyfit(t_min, bf_stim, 1)
            slope_bpm_per_min = float(coeffs[0])  # slope in bpm/min
        else:
            slope_bpm_per_min = 0.0

        mean_bf_stim = float(np.mean(bf_stim))
        # Normalized slope = (bpm/min) / avg_bf = dimensionless rate per min
        norm_slope = float(slope_bpm_per_min / mean_bf_stim) if mean_bf_stim > 0 else None
        
        # Per-stim basic metrics
        n_beats = int(np.sum(p_mask))
        avg_nn = float(np.mean(nn_stim))
        median_nn = float(np.median(nn_stim))
        nn_70 = float(np.mean(nn_stim * (857.0 / median_nn))) if median_nn > 0 else avg_nn

        per_stim.append({
            'pulse_index': pulse['index'],
            'n_beats': n_beats,
            'avg_bf': mean_bf_stim,
            'avg_nn': avg_nn,
            'nn_70': nn_70,
            'peak_bf': peak_bf,
            'peak_norm_pct': peak_norm,
            'time_to_peak_sec': time_to_peak_sec,
            'slope': slope_bpm_per_min,
            'norm_slope': norm_slope,
            'amplitude': amplitude,
            'pre_drop_bf': pre_drop_bf,
        })

    valid = [s for s in per_stim if s is not None]
    if valid:
        def safe_mean(key):
            vals = [s[key] for s in valid if s.get(key) is not None]
            return float(np.mean(vals)) if vals else None

        mean_metrics = {
            'n_beats': safe_mean('n_beats'),
            'avg_bf': safe_mean('avg_bf'),
            'avg_nn': safe_mean('avg_nn'),
            'nn_70': safe_mean('nn_70'),
            'peak_bf': safe_mean('peak_bf'),
            'peak_norm_pct': safe_mean('peak_norm_pct'),
            'time_to_peak_sec': safe_mean('time_to_peak_sec'),
            'slope': safe_mean('slope'),
            'norm_slope': safe_mean('norm_slope'),
            'amplitude': safe_mean('amplitude'),
        }
    else:
        mean_metrics = None

    return per_stim, mean_metrics, baseline_bf


def compute_baseline_metrics(beat_times_min_list, bf_filtered_list, hrv_start=0, hrv_end=3, bf_start=1, bf_end=2):
    """
    Compute baseline readout metrics.
    HRV: from hrv_start to hrv_end minutes (default 0-3 min)
    BF: from bf_start to bf_end minutes (default 1-2 min)
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    nn = 60000.0 / bf
    
    result = {}
    
    # BF baseline (default 1-2 min)
    bf_mask = (bt >= bf_start) & (bt < bf_end)
    if np.sum(bf_mask) >= 2:
        result['baseline_bf'] = float(np.mean(bf[bf_mask]))
        result['baseline_bf_range'] = f"{bf_start}-{bf_end} min"
    else:
        result['baseline_bf'] = None
        result['baseline_bf_range'] = None
    
    # HRV baseline (default 0-3 min) - needs normalized NN_70
    hrv_mask = (bt >= hrv_start) & (bt < hrv_end)
    if np.sum(hrv_mask) >= 6:
        nn_hrv = nn[hrv_mask]
        median_nn = np.median(nn_hrv)
        if median_nn > 0:
            nn_70 = nn_hrv * (857.0 / median_nn)
            metrics = compute_hrv_for_nn_segment(nn_70)
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
