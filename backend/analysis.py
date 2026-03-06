import numpy as np
from scipy.signal import find_peaks, butter, sosfiltfilt
from scipy.interpolate import UnivariateSpline


def loess_smooth(x, y, frac=0.25):
    """
    Robust LOESS (Locally Weighted Scatterplot Smoothing) implementation.
    
    Parameters:
    - x: array of x values (time)
    - y: array of y values (NN_70)
    - frac: fraction of data to use for each local regression (span)
    
    Returns:
    - trend: smoothed trend values
    """
    n = len(x)
    if n < 4:
        return y.copy()
    
    # Number of points to use for each local fit
    k = max(3, int(np.ceil(frac * n)))
    trend = np.zeros(n)
    
    for i in range(n):
        # Calculate distances to all points
        distances = np.abs(x - x[i])
        
        # Find k nearest neighbors
        sorted_indices = np.argsort(distances)
        neighbor_indices = sorted_indices[:k]
        
        # Calculate weights using tricube function
        max_dist = distances[neighbor_indices[-1]]
        if max_dist == 0:
            max_dist = 1.0
        
        u = distances[neighbor_indices] / max_dist
        weights = (1 - u**3)**3
        weights = np.maximum(weights, 0)
        
        # Weighted linear regression
        x_local = x[neighbor_indices]
        y_local = y[neighbor_indices]
        
        # Center the data
        x_mean = np.average(x_local, weights=weights)
        y_mean = np.average(y_local, weights=weights)
        
        # Compute weighted slope
        numerator = np.sum(weights * (x_local - x_mean) * (y_local - y_mean))
        denominator = np.sum(weights * (x_local - x_mean)**2)
        
        if denominator != 0:
            slope = numerator / denominator
            intercept = y_mean - slope * x_mean
            trend[i] = slope * x[i] + intercept
        else:
            trend[i] = y_mean
    
    return trend


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


def detect_beats(trace, sample_rate, threshold=None, min_distance=None, prominence=None, invert=False, use_filter=True, bidirectional=False):
    """Detect beats using scipy peak detection with optional bandpass filtering.
    
    Args:
        bidirectional: If True, detect peaks both above AND below the threshold.
                      This is useful for signals where beats can go in either direction.
    """
    signal_raw = np.array(trace, dtype=np.float64)

    # Apply bandpass filter for cleaner peak detection
    if use_filter and sample_rate > 200:
        try:
            signal_filt = bandpass_filter(signal_raw, sample_rate, lowcut=0.5,
                                         highcut=min(500.0, sample_rate * 0.45))
        except Exception:
            signal_filt = signal_raw.copy()
    else:
        signal_filt = signal_raw.copy()

    if min_distance is None:
        min_distance = int(0.3 * sample_rate)  # 300ms min (cardiac ~200-1000ms intervals)

    kwargs = {'distance': max(1, int(min_distance))}

    if prominence is not None:
        kwargs['prominence'] = prominence
    else:
        # Robust prominence from filtered signal percentiles
        q975 = np.percentile(signal_filt, 97.5)
        q025 = np.percentile(signal_filt, 2.5)
        sig_range = q975 - q025
        kwargs['prominence'] = sig_range * 0.3

    if bidirectional:
        # Detect peaks in both directions
        # Find positive peaks (local maxima)
        peaks_pos, _ = find_peaks(signal_filt, **kwargs)
        # Find negative peaks (local minima) by inverting signal
        peaks_neg, _ = find_peaks(-signal_filt, **kwargs)
        
        # Combine and sort
        all_peaks = np.sort(np.concatenate([peaks_pos, peaks_neg]))
        
        # Remove duplicates that are too close (within min_distance)
        if len(all_peaks) > 1:
            keep = [True]
            for i in range(1, len(all_peaks)):
                if all_peaks[i] - all_peaks[i-1] >= kwargs['distance']:
                    keep.append(True)
                else:
                    # Keep the one with larger absolute value (more prominent)
                    if abs(signal_raw[all_peaks[i]]) > abs(signal_raw[all_peaks[i-1]]):
                        keep[-1] = False
                        keep.append(True)
                    else:
                        keep.append(False)
            all_peaks = all_peaks[keep]
        
        peaks = all_peaks
        
        # Filter by threshold - keep peaks whose absolute distance from 0 exceeds threshold
        # This means: keep peaks that are either >= threshold OR <= -threshold
        if threshold is not None and len(peaks) > 0:
            raw_peak_values = signal_raw[peaks]
            # For bidirectional, threshold acts as a minimum amplitude (distance from 0)
            # Keep peaks above threshold OR below -threshold
            peaks = peaks[(raw_peak_values >= threshold) | (raw_peak_values <= -threshold)]
    else:
        # Original behavior: detect only in one direction
        if invert:
            signal_filt = -signal_filt

        peaks, _ = find_peaks(signal_filt, **kwargs)
        
        # Filter peaks by threshold on RAW signal (what user sees)
        # When inverted: user sees -raw, threshold line at -threshold
        # Peaks above line means: -raw >= -threshold => raw <= threshold
        if threshold is not None and len(peaks) > 0:
            raw_peak_values = signal_raw[peaks]
            if invert:
                # Inverted view: peaks "above" threshold line means raw values BELOW threshold
                peaks = peaks[raw_peak_values <= threshold]
            else:
                # Normal view: peaks above threshold line means raw values ABOVE threshold
                peaks = peaks[raw_peak_values >= threshold]
    
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
    
    Note: beat_times_min has N values, bf_filtered and nn_70 have N-1 values.
    We use beat_times_min[:-1] to align.
    """
    # Align arrays - BF/NN arrays are N-1 (intervals), beat times are N
    bf = np.array(bf_filtered, dtype=np.float64)
    nn70 = np.array(nn_70, dtype=np.float64)
    
    # Use beat_times_min[:-1] to align with intervals
    if len(beat_times_min) > len(bf):
        bt = np.array(beat_times_min[:len(bf)], dtype=np.float64)
    else:
        bt = np.array(beat_times_min, dtype=np.float64)
    
    # Compute NN from BF for valid values
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    
    if len(bt) == 0:
        return []
    
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
    
    Note: beat_times_min has N values, nn_70 and bf_filtered have N-1 values.
    """
    # Align arrays - intervals are N-1
    nn70 = np.array(nn_70, dtype=np.float64)
    bf = np.array(bf_filtered, dtype=np.float64)
    
    # Use beat_times_min[:-1] to align
    if len(beat_times_min) > len(nn70):
        bt = np.array(beat_times_min[:len(nn70)], dtype=np.float64)
    else:
        bt = np.array(beat_times_min, dtype=np.float64)
    
    if len(bt) < 6:
        return []
    
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
# STEP 6 & 7: Light Stimulation Analysis (Per User Specification)
# ==============================================================================
def auto_detect_light_start(beat_times_min_list, bf_filtered_list, approx_start_sec, search_range_sec=20):
    """
    Auto-detect light stim start from BF pattern:
    - Peak (almost instant or in a couple of seconds)
    - Slowdown that is still above the baseline
    - Drop to baseline or lower
    
    Enhanced algorithm:
    1. Compute rolling std to detect variability changes
    2. Look for sharp BF increase (derivative spike)
    3. Combine multiple methods for robustness
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
    baseline_std = float(np.std(bf_valid[baseline_mask])) if np.sum(baseline_mask) > 2 else 5.0

    # Search window - extend forward more to catch delayed responses
    mask = (bt_valid >= approx_min - search_min) & (bt_valid <= approx_min + search_min * 3)
    if np.sum(mask) < 5:
        return approx_start_sec

    bf_window = bf_valid[mask]
    bt_window = bt_valid[mask]

    # Smooth BF with adaptive kernel
    kernel = min(7, max(3, len(bf_window) // 20))
    bf_smooth = np.convolve(bf_window, np.ones(kernel) / kernel, mode='same')
    
    # Method 1: Find sharp BF increase (derivative analysis)
    bf_diff = np.diff(bf_smooth)
    
    # Method 2: Find points significantly above baseline
    threshold_high = baseline_bf + 2 * baseline_std  # 2 std above
    threshold_mild = baseline_bf * 1.10  # 10% above baseline
    
    # Method 3: Detect variance increase (rolling std)
    window_size = min(10, len(bf_window) // 5)
    if window_size >= 3:
        rolling_std = np.array([np.std(bf_window[max(0, i-window_size):i+1]) 
                                for i in range(len(bf_window))])
        std_increase = rolling_std > baseline_std * 1.5
    else:
        std_increase = np.zeros(len(bf_window), dtype=bool)
    
    # Find candidate onset points
    candidates = []
    
    # Candidate from derivative spike
    if len(bf_diff) > 0:
        # Find largest positive jumps
        sorted_indices = np.argsort(bf_diff)[::-1]
        for idx in sorted_indices[:5]:  # Top 5 jumps
            if bf_diff[idx] > baseline_std * 0.5:  # Significant jump
                candidates.append(('diff', float(bt_window[idx] * 60.0), bf_diff[idx]))
    
    # Candidate from threshold crossing
    above_high = bf_smooth > threshold_high
    if np.any(above_high):
        first_above = np.argmax(above_high)
        # Look back for the actual onset
        search_back = min(first_above, 15)
        if search_back > 0:
            for i in range(first_above - search_back, first_above):
                if bf_smooth[i] < threshold_mild and bf_smooth[min(i+3, len(bf_smooth)-1)] > threshold_mild:
                    candidates.append(('threshold', float(bt_window[i] * 60.0), bf_smooth[first_above] - baseline_bf))
                    break
        if not any(c[0] == 'threshold' for c in candidates):
            candidates.append(('threshold', float(bt_window[first_above] * 60.0), bf_smooth[first_above] - baseline_bf))
    
    # Candidate from variance increase
    if np.any(std_increase):
        first_var = np.argmax(std_increase)
        candidates.append(('variance', float(bt_window[first_var] * 60.0), rolling_std[first_var] if window_size >= 3 else 0))
    
    if not candidates:
        # Fallback to original simple detection
        above_baseline = bf_smooth > baseline_bf * 1.15
        if np.any(above_baseline):
            first_above = np.argmax(above_baseline)
            return float(bt_window[first_above] * 60.0)
        return approx_start_sec
    
    # Score and select best candidate
    # Prefer candidates closer to approx_start_sec with strong signal
    best_candidate = None
    best_score = -float('inf')
    
    for method, time_sec, strength in candidates:
        # Distance penalty (prefer times near approx_start_sec)
        dist = abs(time_sec - approx_start_sec)
        dist_penalty = -dist / 10.0
        
        # Strength bonus
        if method == 'diff':
            strength_bonus = min(strength / baseline_std, 3.0)
        elif method == 'threshold':
            strength_bonus = min(strength / baseline_std, 3.0)
        else:
            strength_bonus = min(strength / baseline_std, 2.0)
        
        score = dist_penalty + strength_bonus
        
        if score > best_score:
            best_score = score
            best_candidate = time_sec
    
    return best_candidate if best_candidate is not None else approx_start_sec


def auto_detect_all_pulses(beat_times_min_list, bf_filtered_list, expected_n_pulses=5, 
                           pulse_duration_sec=20, min_isi_sec=8, max_isi_sec=70,
                           first_pulse_start_sec=None, pulse_interval_sec=None,
                           search_window_sec=3.0):
    """
    Automatically detect all light stimulation pulses from BF pattern.
    
    This function looks for characteristic BF response patterns:
    - Sharp increase at stim onset
    - Elevated BF during stimulation
    - Return toward baseline after stim
    
    If first_pulse_start_sec and pulse_interval_sec are provided, the algorithm
    uses a guided approach: for each expected pulse, it searches within a 
    ±search_window_sec window around the expected time.
    
    Returns list of detected pulse boundaries or None if detection fails.
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    valid_mask = ~np.isnan(bf)
    bt_valid = bt[valid_mask]
    bf_valid = bf[valid_mask]
    
    if len(bt_valid) < 50:
        return None
    
    # Compute baseline from first portion of recording
    baseline_end_min = min(bt_valid[-1] * 0.3, 3.0)  # First 30% or 3 min
    baseline_mask = bt_valid < baseline_end_min
    if np.sum(baseline_mask) < 10:
        baseline_mask = bt_valid < bt_valid[len(bt_valid) // 4]
    
    baseline_bf = float(np.median(bf_valid[baseline_mask]))
    baseline_std = float(np.std(bf_valid[baseline_mask]))
    
    # Smooth the BF signal
    kernel = min(7, max(3, len(bf_valid) // 50))
    bf_smooth = np.convolve(bf_valid, np.ones(kernel) / kernel, mode='same')
    
    # Compute derivative to find sharp increases
    bf_diff = np.diff(bf_smooth)
    bf_diff = np.append(bf_diff, 0)  # Pad to same length
    
    # Find significant positive jumps
    jump_threshold = baseline_std * 1.5
    significant_jumps = bf_diff > jump_threshold
    
    # Also look for sustained elevation
    elevation_threshold = baseline_bf + baseline_std * 1.5
    elevated = bf_smooth > elevation_threshold
    
    # =================================================================
    # GUIDED DETECTION: If we have first_pulse_start and interval, use them
    # =================================================================
    if first_pulse_start_sec is not None and pulse_interval_sec is not None and pulse_interval_sec > 0:
        pulses = []
        
        for pulse_idx in range(expected_n_pulses):
            # Calculate expected pulse time
            expected_start_sec = first_pulse_start_sec + pulse_idx * pulse_interval_sec
            expected_start_min = expected_start_sec / 60.0
            
            # Define search window (±search_window_sec around expected time)
            window_start_min = (expected_start_sec - search_window_sec) / 60.0
            window_end_min = (expected_start_sec + search_window_sec) / 60.0
            
            # Find beats within this window
            window_mask = (bt_valid >= window_start_min) & (bt_valid <= window_end_min)
            window_indices = np.where(window_mask)[0]
            
            if len(window_indices) == 0:
                # No data in window, use expected time
                pulses.append({
                    'index': pulse_idx,
                    'start_sec': expected_start_sec,
                    'end_sec': expected_start_sec + pulse_duration_sec,
                    'start_min': expected_start_min,
                    'end_min': (expected_start_sec + pulse_duration_sec) / 60.0,
                    'auto_detected': True,
                    'confidence': 'low'
                })
                continue
            
            # Look for the best onset within the window
            # Priority: significant jump + subsequent elevation
            best_onset_idx = None
            best_score = -np.inf
            
            for idx in window_indices:
                score = 0
                
                # Score based on jump magnitude
                if significant_jumps[idx]:
                    score += bf_diff[idx] / (baseline_std + 1e-6) * 2
                
                # Score based on subsequent elevation
                check_end = min(idx + 20, len(bt_valid))
                elevation_count = np.sum(elevated[idx:check_end])
                score += elevation_count * 0.5
                
                # Score based on proximity to expected time (closer = better)
                time_diff = abs(bt_valid[idx] * 60.0 - expected_start_sec)
                proximity_score = max(0, (search_window_sec - time_diff) / search_window_sec)
                score += proximity_score * 3  # Weight proximity heavily
                
                if score > best_score:
                    best_score = score
                    best_onset_idx = idx
            
            if best_onset_idx is not None:
                detected_start_sec = float(bt_valid[best_onset_idx] * 60.0)
                confidence = 'high' if best_score > 3 else 'medium'
            else:
                detected_start_sec = expected_start_sec
                confidence = 'low'
            
            pulses.append({
                'index': pulse_idx,
                'start_sec': detected_start_sec,
                'end_sec': detected_start_sec + pulse_duration_sec,
                'start_min': detected_start_sec / 60.0,
                'end_min': (detected_start_sec + pulse_duration_sec) / 60.0,
                'auto_detected': True,
                'confidence': confidence
            })
        
        return pulses
    
    # =================================================================
    # UNGUIDED DETECTION: Original algorithm when no interval is provided
    # =================================================================
    
    # Find onset candidates: where jump occurs AND elevation starts
    onset_candidates = []
    
    i = 0
    while i < len(bt_valid):
        if significant_jumps[i]:
            # Found a jump - check if followed by elevation
            check_end = min(i + 20, len(bt_valid))
            if np.any(elevated[i:check_end]):
                # Find the actual onset (first point before jump)
                onset_idx = max(0, i - 2)
                onset_time_sec = float(bt_valid[onset_idx] * 60.0)
                
                # Check if this onset is far enough from previous ones
                if not onset_candidates or (onset_time_sec - onset_candidates[-1]) > min_isi_sec:
                    onset_candidates.append(onset_time_sec)
                    # Skip ahead to avoid detecting same pulse multiple times
                    i += int(pulse_duration_sec * 0.5 / (bt_valid[1] - bt_valid[0]) / 60.0) if len(bt_valid) > 1 else 10
                    continue
        i += 1
    
    # If we found roughly the expected number, use them
    if len(onset_candidates) >= expected_n_pulses - 1:
        # Build pulse list
        pulses = []
        for idx, start_sec in enumerate(onset_candidates[:expected_n_pulses]):
            pulses.append({
                'index': idx,
                'start_sec': start_sec,
                'end_sec': start_sec + pulse_duration_sec,
                'start_min': start_sec / 60.0,
                'end_min': (start_sec + pulse_duration_sec) / 60.0,
                'auto_detected': True
            })
        return pulses
    
    return None


def compute_light_response_v2(beat_times_min_list, bf_filtered_list, pulses):
    """
    Compute HRA (Heart Rate Acceleration) metrics per stimulation pulse.
    
    Per the specification:
    - Shared Baseline: mean(BF_k,filt) in [-2 min, -1 min) before FIRST stim
      This same baseline is used for ALL 5 stims
    - PeakBF_j: max(BF_k,filt) within [S_j, E_j]
    - TimeToPeak_j: (t_peak_j - S_j) * 60 seconds
    - PeakBF_norm_j: 100 * PeakBF_j / BF_base (%)
    - Amplitude_j: PeakBF_j - BF_end_j (last beat inside stim, NOT baseline)
    - RateOfChange_j: slope / BF_mean_j (1/min, normalized)
    """
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Align beat times with BF intervals (N-1 values)
    # BF intervals are computed from consecutive beat times, so we use bt[:-1] to align
    bt_full = np.array(beat_times_min_list, dtype=np.float64)
    if len(bt_full) > len(bf):
        bt = bt_full[:len(bf)]  # Use first N-1 beat times to align with intervals
    else:
        bt = bt_full
    
    # Remove NaN for calculations
    valid_mask = ~np.isnan(bf)
    
    # SHARED BASELINE: mean BF from -2 to -1 min before FIRST stimulation
    # This is used for all 5 stims
    first_start_min = pulses[0]['start_min'] if pulses else 0
    shared_baseline_start = first_start_min - 2.0  # 2 min before first stim
    shared_baseline_end = first_start_min - 1.0    # 1 min before first stim
    shared_baseline_mask = (bt >= shared_baseline_start) & (bt < shared_baseline_end) & valid_mask
    BF_base_shared = float(np.mean(bf[shared_baseline_mask])) if np.sum(shared_baseline_mask) > 0 else None

    per_stim = []
    for pulse in pulses:
        S_j = pulse['start_min']
        E_j = pulse['end_min']
        
        # Use the SHARED baseline for all stims
        BF_base_j = BF_base_shared
        
        # Stim window data
        p_mask = (bt >= S_j) & (bt < E_j) & valid_mask
        bf_stim = bf[p_mask]
        bt_stim = bt[p_mask]

        if len(bf_stim) < 2:
            per_stim.append(None)
            continue

        # Basic metrics
        n_beats = int(np.sum(p_mask))
        BF_mean_j = float(np.mean(bf_stim))
        
        # NN for this stim
        nn_stim = 60000.0 / bf_stim

        # Peak metrics
        PeakBF_j = float(np.max(bf_stim))
        peak_idx = int(np.argmax(bf_stim))
        t_peak_j = float(bt_stim[peak_idx])
        TimeToPeak_j = float((t_peak_j - S_j) * 60.0)  # seconds
        
        # Normalized peak (%)
        PeakBF_norm_j = float(100.0 * PeakBF_j / BF_base_j) if BF_base_j and BF_base_j > 0 else None
        
        # Amplitude: PeakBF - last BF inside stim window (NOT baseline)
        BF_end_j = float(bf_stim[-1])  # Last beat inside stim
        Amplitude_j = float(PeakBF_j - BF_end_j)

        # Rate of Change: normalized slope (1/min)
        # Linear regression: BF = a + b * t_rel where t_rel = t - S_j
        t_rel = bt_stim - S_j  # time in minutes from stim start
        if len(t_rel) > 1:
            coeffs = np.polyfit(t_rel, bf_stim, 1)
            slope_b = float(coeffs[0])  # bpm per minute
        else:
            slope_b = 0.0
        
        # Normalized: RateOfChange = slope / BF_mean (1/min)
        RateOfChange_j = float(slope_b / BF_mean_j) if BF_mean_j > 0 else None

        # Compute bf_end_pct (Recovery %) - explicit None checks
        bf_end_pct_j = None
        if BF_base_j is not None and BF_base_j > 0 and BF_end_j is not None:
            bf_end_pct_j = float(100.0 * BF_end_j / BF_base_j)
        
        per_stim.append({
            'pulse_index': pulse['index'],
            'n_beats': n_beats,
            'avg_bf': BF_mean_j,
            'avg_nn': float(np.mean(nn_stim)),
            'baseline_bf': BF_base_j,
            'peak_bf': PeakBF_j,
            'peak_norm_pct': PeakBF_norm_j,
            'time_to_peak_sec': TimeToPeak_j,
            'amplitude': Amplitude_j,
            'bf_end': BF_end_j,
            'bf_end_pct': bf_end_pct_j,
            'rate_of_change': RateOfChange_j,
        })

    # Aggregate across stimulations
    valid = [s for s in per_stim if s is not None]
    if valid:
        def safe_mean(key):
            vals = [s[key] for s in valid if s.get(key) is not None]
            return float(np.mean(vals)) if vals else None

        mean_metrics = {
            'n_beats': safe_mean('n_beats'),
            'avg_bf': safe_mean('avg_bf'),
            'avg_nn': safe_mean('avg_nn'),
            'baseline_bf': safe_mean('baseline_bf'),
            'peak_bf': safe_mean('peak_bf'),
            'peak_norm_pct': safe_mean('peak_norm_pct'),
            'time_to_peak_sec': safe_mean('time_to_peak_sec'),
            'bf_end': safe_mean('bf_end'),
            'bf_end_pct': safe_mean('bf_end_pct'),
            'amplitude': safe_mean('amplitude'),
            'rate_of_change': safe_mean('rate_of_change'),
        }
    else:
        mean_metrics = None

    # Return the shared baseline BF (from -2 to -1 min before first stim)
    return per_stim, mean_metrics, BF_base_shared


def compute_light_hrv(beat_times_min_list, bf_filtered_list, pulses):
    """
    Compute Light-Induced HRV metrics per the specification:
    
    For each stim j:
    1. NN_k,filt = 60000 / BF_k,filt
    2. NN_k,70 = NN_k,filt * (857 / median(NN_k,filt within stim))
       Note: Each stim uses its OWN median NN as reference
    3. Compute RMSSD_j, SDNN_j, pNN50_j from normalized NN_70
    
    Aggregate across 5 stims:
    - RMSSD70,win_light = median(RMSSD_j)
    - HRV_light = ln(RMSSD70,win_light)
    - SDNN_light = median(SDNN_j)
    - pNN50_light = median(pNN50_j)
    """
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Align beat times with BF/NN intervals (N-1 values)
    # BF/NN intervals are computed from consecutive beat times, so we use bt[:-1] to align
    bt_full = np.array(beat_times_min_list, dtype=np.float64)
    if len(bt_full) > len(bf):
        bt = bt_full[:len(bf)]  # Use first N-1 beat times to align with intervals
    else:
        bt = bt_full
    
    # Convert BF to NN intervals
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)

    if len(pulses) == 0:
        return {'per_pulse': [], 'final': None}

    per_pulse = []
    for pulse in pulses:
        S_j = pulse['start_min']
        E_j = pulse['end_min']
        
        # Extract data for this stim
        p_mask = (bt >= S_j) & (bt < E_j) & (~np.isnan(nn))
        nn_stim = nn[p_mask]
        
        if len(nn_stim) < 3:
            per_pulse.append(None)
            continue
        
        # Step 1: Calculate median NN for THIS stim as reference
        median_nn_stim = float(np.median(nn_stim))
        
        # Step 2: Normalize NN to 70 bpm using this stim's median
        # NN_70 = NN * (857 / median_NN_of_this_stim)
        norm_factor = 857.0 / median_nn_stim
        nn_70_stim = nn_stim * norm_factor
        
        # Step 3: Calculate HRV metrics from normalized NN_70
        hrv = compute_hrv_for_nn_segment(nn_70_stim)
        if hrv:
            rmssd, sdnn, pnn50 = hrv
            ln_rmssd = float(np.log(rmssd)) if rmssd > 0 else None
            ln_sdnn = float(np.log(sdnn)) if sdnn > 0 else None
            per_pulse.append({
                'rmssd70': float(rmssd),
                'ln_rmssd70': ln_rmssd,
                'sdnn': float(sdnn),
                'ln_sdnn70': ln_sdnn,
                'pnn50': float(pnn50),
                'n_beats': int(len(nn_stim)),
                'median_nn_ref': median_nn_stim,
                'norm_factor': float(norm_factor),
            })
        else:
            per_pulse.append(None)

    # Step 4: Median across pulses for final HRV metrics
    valid = [p for p in per_pulse if p is not None]
    if valid:
        rmssd_median = float(np.median([p['rmssd70'] for p in valid]))
        sdnn_median = float(np.median([p['sdnn'] for p in valid]))
        final = {
            'rmssd70': rmssd_median,
            'ln_rmssd70': float(np.log(rmssd_median)) if rmssd_median > 0 else None,
            'sdnn': sdnn_median,
            'ln_sdnn70': float(np.log(sdnn_median)) if sdnn_median > 0 else None,
            'pnn50': float(np.median([p['pnn50'] for p in valid])),
            'n_pulses_valid': len(valid),
        }
    else:
        final = None

    return {'per_pulse': per_pulse, 'final': final}


# ==============================================================================
# Baseline Metrics Computation
# ==============================================================================
def compute_baseline_metrics(beat_times_min_list, bf_filtered_list, hrv_windows=None, hrv_minute=0, bf_minute=1):
    """
    Compute baseline readout metrics at specific minutes.
    
    Per specification:
    - HRV baseline: Use the value from the sliding HRV table where WindowStart = hrv_minute
      (NO recomputation - directly reference the pre-computed sliding window value)
    - BF baseline: mean(BF_k,filt) between bf_minute and bf_minute+1 (e.g., 1.0-2.0 min)
    
    Args:
        beat_times_min_list: Beat times in minutes
        bf_filtered_list: Filtered BF values
        hrv_windows: Pre-computed rolling 3-min HRV windows (from rolling_3min_hrv)
        hrv_minute: Window start minute for HRV baseline (default 0)
        bf_minute: Minute for BF baseline (default 1, uses 1.0-2.0 min)
    """
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    result = {}
    
    # BF baseline: mean BF between bf_minute and bf_minute+1 (e.g., 1.0 <= t < 2.0)
    bf_mask = (bt >= float(bf_minute)) & (bt < float(bf_minute + 1)) & (~np.isnan(bf))
    if np.sum(bf_mask) >= 2:
        result['baseline_bf'] = float(np.mean(bf[bf_mask]))
        result['baseline_bf_minute'] = bf_minute
        result['baseline_bf_range'] = f'{bf_minute}-{bf_minute+1} min'
    else:
        result['baseline_bf'] = None
        result['baseline_bf_minute'] = bf_minute
        result['baseline_bf_range'] = f'{bf_minute}-{bf_minute+1} min'
    
    # HRV baseline: Use pre-computed sliding window value directly (MANDATORY - no recomputation)
    # This ensures numerical equality between baseline display and table value
    hrv_found = False
    # Convert to int for lookup since windows are stored at integer minutes
    # This allows decimal minute inputs (e.g., 0.5) to still find window at minute 0
    hrv_minute_lookup = int(hrv_minute)
    if hrv_windows:
        for w in hrv_windows:
            if w.get('minute') == hrv_minute_lookup:
                result['baseline_rmssd70'] = w.get('rmssd70')
                result['baseline_ln_rmssd70'] = w.get('ln_rmssd70')
                result['baseline_sdnn'] = w.get('sdnn')
                result['baseline_pnn50'] = w.get('pnn50')
                result['baseline_hrv_minute'] = hrv_minute
                result['baseline_hrv_window'] = f"{hrv_minute}-{hrv_minute+3}min"
                result['baseline_hrv_range'] = f'{hrv_minute}-{hrv_minute+3} min'
                hrv_found = True
                break
    
    if not hrv_found:
        # Fallback: compute if hrv_windows not provided (backward compatibility)
        # But this should not happen in normal operation
        nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
        nn_70 = np.array(normalize_nn_70_windowing(beat_times_min_list, nn.tolist()), dtype=np.float64)
        
        hrv_start = hrv_minute
        hrv_end = hrv_minute + 3
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
                    result['baseline_hrv_minute'] = hrv_minute
                    result['baseline_hrv_window'] = f"{hrv_start}-{hrv_end}min"
                    result['baseline_hrv_range'] = f'{hrv_minute}-{hrv_minute+3} min'
                    hrv_found = True
        
        if not hrv_found:
            result['baseline_rmssd70'] = None
            result['baseline_ln_rmssd70'] = None
            result['baseline_sdnn'] = None
            result['baseline_pnn50'] = None
            result['baseline_hrv_minute'] = hrv_minute
            result['baseline_hrv_window'] = None
            result['baseline_hrv_range'] = f'{hrv_minute}-{hrv_minute+3} min'
    
    return result


# ==============================================================================
# Pulse Generation Utilities
# ==============================================================================
def generate_pulses(start_sec, duration_sec, interval_pattern, n_pulses):
    """Generate pulse timing information.
    
    interval_pattern: 'decreasing' for standard 60-30-20-10 ISI pattern,
                      or a number for fixed interval (gap between pulses).
    
    ISI (Inter-Stimulus Interval) = gap between END of one pulse and START of next.
    
    Pattern example for start=180s, duration=30s, ISI=decreasing:
    - Stim1: 180s-210s
    - Gap: 60s
    - Stim2: 270s-300s
    - Gap: 30s
    - Stim3: 330s-360s
    - Gap: 20s
    - Stim4: 380s-410s
    - Gap: 10s
    - Stim5: 420s-450s
    """
    if interval_pattern == 'decreasing':
        # Standard decreasing ISI pattern: 60s, 30s, 20s, 10s gaps between pulses
        intervals = [60, 30, 20, 10]
    else:
        try:
            intervals = [int(interval_pattern)] * (n_pulses - 1)
        except (ValueError, TypeError):
            intervals = [60, 30, 20, 10]
    
    pulses = []
    current_start = start_sec
    
    for i in range(n_pulses):
        pulse_end = current_start + duration_sec
        pulses.append({
            'index': i,
            'start_sec': current_start,
            'end_sec': pulse_end,
            'start_min': current_start / 60.0,
            'end_min': pulse_end / 60.0,
        })
        # ISI is the gap between END of this pulse and START of next
        if i < len(intervals):
            current_start = pulse_end + intervals[i]
        else:
            current_start = pulse_end + (intervals[-1] if intervals else 60)
    
    return pulses


def generate_pulses_guided(first_start_sec, duration_sec, interval_pattern, n_pulses,
                           beat_times_min_list, bf_filtered_list, search_window_sec=3.0):
    """
    Generate pulse timing with guided detection for BOTH start and end points.
    
    ISI = gap between END of one pulse and START of next.
    
    For each expected pulse:
    - Search within ±search_window_sec around expected START to find actual onset
    - Search within ±search_window_sec around expected END to find actual offset
    
    Start detection criteria: jump, trend change upward, threshold crossing up
    End detection criteria: drop, trend change downward, threshold crossing down
    
    Args:
        first_start_sec: Start time of first pulse
        duration_sec: Duration of each pulse
        interval_pattern: 'decreasing' or number for fixed ISI gap
        n_pulses: Number of pulses
        beat_times_min_list: Beat times in minutes
        bf_filtered_list: Filtered BF values
        search_window_sec: Window size (±) to search around expected times (default 3s)
    
    Returns:
        List of pulse dictionaries with refined start AND end times
    """
    # Determine ISI gaps
    if interval_pattern == 'decreasing':
        intervals = [60, 30, 20, 10]
    else:
        try:
            intervals = [int(interval_pattern)] * (n_pulses - 1)
        except (ValueError, TypeError):
            intervals = [60, 30, 20, 10]
    
    # Convert to numpy arrays
    bt = np.array(beat_times_min_list, dtype=np.float64)
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Remove NaN
    valid_mask = ~np.isnan(bf)
    bt_valid = bt[valid_mask]
    bf_valid = bf[valid_mask]
    
    if len(bt_valid) < 20:
        # Fall back to simple generation
        return generate_pulses(first_start_sec, duration_sec, interval_pattern, n_pulses)
    
    # Compute baseline from first portion (before any stimulation)
    baseline_end_min = min(first_start_sec / 60.0 * 0.8, 2.5)
    baseline_mask = bt_valid < baseline_end_min
    if np.sum(baseline_mask) < 5:
        baseline_mask = bt_valid < bt_valid[len(bt_valid) // 5]
    
    baseline_bf = float(np.median(bf_valid[baseline_mask])) if np.sum(baseline_mask) > 0 else float(np.median(bf_valid))
    baseline_std = float(np.std(bf_valid[baseline_mask])) if np.sum(baseline_mask) > 2 else 5.0
    
    # Smooth BF for pattern detection (peaks, troughs)
    kernel = min(7, max(3, len(bf_valid) // 50))
    bf_smooth = np.convolve(bf_valid, np.ones(kernel) / kernel, mode='same')
    
    # Compute derivatives on RAW data for accurate jump/drop detection
    bf_diff_raw = np.diff(bf_valid)
    bf_diff_raw = np.append(bf_diff_raw, 0)
    
    # Compute derivatives on smoothed data for trend analysis
    bf_diff_smooth = np.diff(bf_smooth)
    bf_diff_smooth = np.append(bf_diff_smooth, 0)
    
    # Second derivative for detecting trend changes (on smoothed)
    bf_diff2 = np.diff(bf_diff_smooth)
    bf_diff2 = np.append(bf_diff2, 0)
    
    # Identify key points in the entire signal
    # 1. Local peaks in BF (local maxima) - use smoothed for stability
    is_peak = np.zeros(len(bf_smooth), dtype=bool)
    for i in range(1, len(bf_smooth) - 1):
        if bf_smooth[i] > bf_smooth[i-1] and bf_smooth[i] >= bf_smooth[i+1]:
            is_peak[i] = True
    
    # 2. Local troughs in BF (local minima) - use smoothed for stability
    is_trough = np.zeros(len(bf_smooth), dtype=bool)
    for i in range(1, len(bf_smooth) - 1):
        if bf_smooth[i] < bf_smooth[i-1] and bf_smooth[i] <= bf_smooth[i+1]:
            is_trough[i] = True
    
    # 3. Inflection points (where second derivative changes sign)
    is_inflection = np.zeros(len(bf_smooth), dtype=bool)
    for i in range(1, len(bf_diff2) - 1):
        if (bf_diff2[i-1] > 0 and bf_diff2[i] <= 0) or (bf_diff2[i-1] < 0 and bf_diff2[i] >= 0):
            is_inflection[i] = True
    
    # 4. Sharp jumps - use RAW data for accurate detection
    # A jump is when BF increases significantly in one beat
    jump_threshold = max(baseline_std * 1.5, 5.0)  # At least 5 BPM or 1.5 std
    is_jump = bf_diff_raw > jump_threshold
    
    # 5. Sharp drops - use RAW data for accurate detection
    drop_threshold = -max(baseline_std * 1.5, 5.0)
    is_drop = bf_diff_raw < drop_threshold
    
    def find_start_point(expected_start_sec):
        """
        Find the best START point within ±search_window around expected time.
        
        Priority for START detection (stimulation onset):
        1. Sharp jump - the point WHERE BF actually increases sharply (highest priority)
        2. Critical trend change - inflection point where derivative becomes positive
        3. Peak onset - significant elevation above baseline
        """
        window_start_min = (expected_start_sec - search_window_sec) / 60.0
        window_end_min = (expected_start_sec + search_window_sec) / 60.0
        
        window_mask = (bt_valid >= window_start_min) & (bt_valid <= window_end_min)
        window_indices = np.where(window_mask)[0]
        
        if len(window_indices) == 0:
            return expected_start_sec, 0.0, 'default'
        
        best_idx = None
        best_score = -np.inf
        best_reason = 'default'
        
        for idx in window_indices:
            score = 0
            reason = []
            
            # HIGHEST PRIORITY: The actual sharp jump point (RAW data)
            if is_jump[idx]:
                jump_magnitude = bf_diff_raw[idx] / (baseline_std + 1e-6)
                score += jump_magnitude * 10.0  # Very high weight
                reason.append('jump')
                
                # Extra bonus if this is the strongest jump in the window
                window_jumps = bf_diff_raw[window_indices]
                if bf_diff_raw[idx] == np.max(window_jumps) and bf_diff_raw[idx] > jump_threshold:
                    score += 8.0
                    reason.append('max_jump')
            
            # HIGH PRIORITY: Point where BF first rises significantly above baseline
            if bf_valid[idx] > baseline_bf + baseline_std * 1.5:
                if idx > 0 and bf_valid[idx-1] < baseline_bf + baseline_std * 0.5:
                    score += 6.0
                    reason.append('elevation_start')
            
            # MEDIUM PRIORITY: Critical trend change (inflection going upward)
            if is_inflection[idx] and bf_diff_smooth[idx] > 0:
                score += 2.0
                reason.append('trend_change')
            
            # LOW PRIORITY: Proximity to expected time
            time_diff_sec = abs(bt_valid[idx] * 60.0 - expected_start_sec)
            proximity = max(0, (search_window_sec - time_diff_sec) / search_window_sec)
            score += proximity * 0.3
            
            if score > best_score:
                best_score = score
                best_idx = idx
                best_reason = ','.join(reason) if reason else 'proximity'
        
        if best_idx is not None:
            # Check for outlier: if this beat has a huge spike, use the NEXT beat instead
            # (for start, we want to skip the outlier and take the following beat)
            outlier_threshold = baseline_std * 4.0  # Very large change = outlier
            if best_idx < len(bf_diff_raw) - 1 and abs(bf_diff_raw[best_idx]) > outlier_threshold:
                # This might be an outlier - check if next beat is more stable
                next_idx = best_idx + 1
                if next_idx < len(bt_valid) and abs(bf_diff_raw[next_idx]) < outlier_threshold:
                    best_idx = next_idx
                    best_reason += ',outlier_skip'
            
            return float(bt_valid[best_idx] * 60.0), best_score, best_reason
        return expected_start_sec, 0.0, 'default'
    
    def find_end_point(expected_end_sec):
        """
        Find the best END point within ±search_window around expected time.
        
        Priority for END detection (stimulation offset):
        1. Sharp drop - the point WHERE BF actually decreases sharply (highest priority)
        2. Return to baseline - point where BF drops back to baseline level
        3. Critical trend change - inflection point going downward
        """
        window_start_min = (expected_end_sec - search_window_sec) / 60.0
        window_end_min = (expected_end_sec + search_window_sec) / 60.0
        
        window_mask = (bt_valid >= window_start_min) & (bt_valid <= window_end_min)
        window_indices = np.where(window_mask)[0]
        
        if len(window_indices) == 0:
            return expected_end_sec, 0.0, 'default'
        
        best_idx = None
        best_score = -np.inf
        best_reason = 'default'
        
        for idx in window_indices:
            score = 0
            reason = []
            
            # HIGHEST PRIORITY: The actual sharp drop point (RAW data)
            if is_drop[idx]:
                drop_magnitude = abs(bf_diff_raw[idx]) / (baseline_std + 1e-6)
                score += drop_magnitude * 10.0  # Very high weight
                reason.append('drop')
                
                # Extra bonus if this is the strongest drop in the window
                window_drops = bf_diff_raw[window_indices]
                if bf_diff_raw[idx] == np.min(window_drops) and bf_diff_raw[idx] < drop_threshold:
                    score += 8.0
                    reason.append('max_drop')
            
            # HIGH PRIORITY: Point where BF drops back to near baseline
            if bf_valid[idx] < baseline_bf + baseline_std * 0.5:
                if idx > 0 and bf_valid[idx-1] > baseline_bf + baseline_std * 1.0:
                    score += 6.0
                    reason.append('return_baseline')
            
            # MEDIUM PRIORITY: Peak followed by drop
            if is_peak[idx] and bf_smooth[idx] > baseline_bf + baseline_std:
                score += 2.5
                reason.append('peak')
            
            # MEDIUM PRIORITY: Critical trend change (inflection going downward)
            if is_inflection[idx] and bf_diff_smooth[idx] < 0:
                score += 2.0
                reason.append('trend_change')
            
            # LOW PRIORITY: Proximity to expected time
            time_diff_sec = abs(bt_valid[idx] * 60.0 - expected_end_sec)
            proximity = max(0, (search_window_sec - time_diff_sec) / search_window_sec)
            score += proximity * 0.3
            
            if score > best_score:
                best_score = score
                best_idx = idx
                best_reason = ','.join(reason) if reason else 'proximity'
        
        if best_idx is not None:
            # Check for outlier: if this beat has a huge spike, use the PREVIOUS beat instead
            # (for end, we want to skip the outlier and take the preceding beat)
            outlier_threshold = baseline_std * 4.0  # Very large change = outlier
            if best_idx > 0 and abs(bf_diff_raw[best_idx]) > outlier_threshold:
                # This might be an outlier - check if previous beat is more stable
                prev_idx = best_idx - 1
                if prev_idx >= 0 and abs(bf_diff_raw[prev_idx]) < outlier_threshold:
                    best_idx = prev_idx
                    best_reason += ',outlier_skip'
            
            return float(bt_valid[best_idx] * 60.0), best_score, best_reason
        return expected_end_sec, 0.0, 'default'
    
    pulses = []
    current_expected_start = first_start_sec
    
    for i in range(n_pulses):
        expected_end = current_expected_start + duration_sec
        
        # Find refined start point
        detected_start, start_score, start_reason = find_start_point(current_expected_start)
        
        # Find refined end point
        detected_end, end_score, end_reason = find_end_point(expected_end)
        
        # Ensure end is after start (sanity check)
        if detected_end <= detected_start:
            detected_end = detected_start + duration_sec
            end_reason = 'fallback'
            end_score = 0.0
        
        pulses.append({
            'index': i,
            'start_sec': detected_start,
            'end_sec': detected_end,
            'start_min': detected_start / 60.0,
            'end_min': detected_end / 60.0,
            'expected_start_sec': current_expected_start,
            'expected_end_sec': expected_end,
            'start_score': float(start_score) if start_score > -np.inf else 0.0,
            'end_score': float(end_score) if end_score > -np.inf else 0.0,
            'start_reason': start_reason,
            'end_reason': end_reason
        })
        
        # Calculate next expected start: detected END + ISI gap
        if i < len(intervals):
            current_expected_start = detected_end + intervals[i]
        else:
            current_expected_start = detected_end + (intervals[-1] if intervals else 60)
    
    return pulses


# ==============================================================================
# STEP 8: Corrected Light-Induced HRV (Detrended) using Robust LOESS
# ==============================================================================
def compute_light_hrv_detrended(beat_times_min_list, bf_filtered_list, pulses, loess_frac=0.25):
    """
    Compute Corrected Light-Induced HRV using LOESS detrending.
    
    Purpose: Remove the slow deterministic adaptation curve during each light stimulation 
    (peak → decay or delayed rise in CPVT) so HRV reflects true beat-to-beat irregularity only.
    
    Algorithm per stim j:
    1. Use filtered BF only
    2. Convert to NN: NN_k = 60000 / BF_k,filt
    3. Normalize to 70 bpm: NN_k,70 = NN_k × (857 / median(NN_k within that stim))
    4. Detrend within that stim using Robust LOESS smoothing (span ~20-30% of stim duration)
    5. Compute residual: NN_residual = NN_k,70 − Trend_k
    6. Compute HRV metrics on NN_residual: RMSSD_70_detrended, SDNN_70_detrended, pNN50_70_detrended
    
    Returns: Dictionary with per_pulse data (including visualization data) and final median metrics.
    """
    bf = np.array(bf_filtered_list, dtype=np.float64)
    
    # Align beat times with BF/NN intervals (N-1 values)
    bt_full = np.array(beat_times_min_list, dtype=np.float64)
    if len(bt_full) > len(bf):
        bt = bt_full[:len(bf)]
    else:
        bt = bt_full
    
    # Convert BF to NN intervals
    nn = np.where((bf > 0) & (~np.isnan(bf)), 60000.0 / bf, np.nan)
    
    if len(pulses) == 0:
        return {'per_pulse': [], 'final': None}
    
    per_pulse = []
    for pulse in pulses:
        S_j = pulse['start_min']
        E_j = pulse['end_min']
        
        # Extract data for this stim
        p_mask = (bt >= S_j) & (bt < E_j) & (~np.isnan(nn))
        nn_stim = nn[p_mask]
        bt_stim = bt[p_mask]
        
        if len(nn_stim) < 4:  # Need at least 4 points for LOESS
            per_pulse.append(None)
            continue
        
        # Step 1: Calculate median NN for THIS stim as reference
        median_nn_stim = float(np.median(nn_stim))
        
        # Step 2: Normalize NN to 70 bpm using this stim's median
        # NN_70 = NN * (857 / median_NN_of_this_stim)
        norm_factor = 857.0 / median_nn_stim
        nn_70_stim = nn_stim * norm_factor
        
        # Step 3: Apply LOESS smoothing to get trend
        # Use relative time within stim for LOESS
        t_rel = bt_stim - S_j  # Time in minutes from stim start
        t_rel_normalized = (t_rel - t_rel.min()) / (t_rel.max() - t_rel.min() + 1e-10)  # Normalize to 0-1
        
        trend = loess_smooth(t_rel_normalized, nn_70_stim, frac=loess_frac)
        
        # Step 4: Compute residual (detrended signal)
        nn_residual = nn_70_stim - trend
        
        # Step 5: Calculate HRV metrics from detrended signal
        valid_residual = nn_residual[~np.isnan(nn_residual)]
        
        if len(valid_residual) < 3:
            per_pulse.append(None)
            continue
        
        # RMSSD on residuals
        diffs = np.diff(valid_residual)
        rmssd_detrended = float(np.sqrt(np.mean(diffs ** 2)))
        
        # SDNN on residuals
        sdnn_detrended = float(np.std(valid_residual, ddof=1)) if len(valid_residual) > 1 else 0.0
        
        # pNN50 on residuals
        pnn50_detrended = float(100.0 * np.sum(np.abs(diffs) > 50.0) / len(diffs)) if len(diffs) > 0 else 0.0
        
        # Log transforms - ensure positive values only
        # ln(RMSSD) must be positive, so RMSSD must be > e^0 = 1
        # If RMSSD < 1ms after detrending, it means variability is due to trend
        # We floor at a small positive value for display purposes
        MIN_POSITIVE_LN = 0.001  # Minimum ln value to display
        
        if rmssd_detrended > 1.0:
            ln_rmssd_detrended = float(np.log(rmssd_detrended))
        else:
            # RMSSD <= 1ms means very low HRV after detrending
            ln_rmssd_detrended = MIN_POSITIVE_LN
        
        if sdnn_detrended > 1.0:
            ln_sdnn_detrended = float(np.log(sdnn_detrended))
        else:
            ln_sdnn_detrended = MIN_POSITIVE_LN
        
        # Store visualization data for frontend (convert to lists for JSON serialization)
        per_pulse.append({
            'rmssd70_detrended': float(rmssd_detrended),
            'ln_rmssd70_detrended': ln_rmssd_detrended,
            'sdnn_detrended': float(sdnn_detrended),
            'ln_sdnn70_detrended': ln_sdnn_detrended,
            'pnn50_detrended': float(pnn50_detrended),
            'n_beats': int(len(nn_stim)),
            'median_nn_ref': median_nn_stim,
            'norm_factor': float(norm_factor),
            # Visualization data
            'viz': {
                'time_rel': (t_rel * 60).tolist(),  # Convert to seconds for display
                'nn_70': nn_70_stim.tolist(),
                'trend': trend.tolist(),
                'residual': nn_residual.tolist(),
            }
        })
    
    # Step 6: Median across pulses for final detrended HRV metrics
    valid = [p for p in per_pulse if p is not None]
    if valid:
        rmssd_median = float(np.median([p['rmssd70_detrended'] for p in valid]))
        sdnn_median = float(np.median([p['sdnn_detrended'] for p in valid]))
        
        # Ensure positive ln values only
        MIN_POSITIVE_LN = 0.001
        
        if rmssd_median > 1.0:
            ln_rmssd_final = float(np.log(rmssd_median))
        else:
            ln_rmssd_final = MIN_POSITIVE_LN
        
        if sdnn_median > 1.0:
            ln_sdnn_final = float(np.log(sdnn_median))
        else:
            ln_sdnn_final = MIN_POSITIVE_LN
        
        final = {
            'rmssd70_detrended': rmssd_median,
            'ln_rmssd70_detrended': ln_rmssd_final,
            'sdnn_detrended': sdnn_median,
            'ln_sdnn70_detrended': ln_sdnn_final,
            'pnn50_detrended': float(np.median([p['pnn50_detrended'] for p in valid])),
            'n_pulses_valid': len(valid),
        }
    else:
        final = None
    
    return {'per_pulse': per_pulse, 'final': final}
