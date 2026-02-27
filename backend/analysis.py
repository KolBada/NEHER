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


def detect_beats(trace, sample_rate, threshold=None, min_distance=None, prominence=None, invert=False):
    """Detect beats using scipy peak detection."""
    signal = np.array(trace, dtype=np.float64)
    if invert:
        signal = -signal

    if min_distance is None:
        min_distance = int(0.15 * sample_rate)

    kwargs = {'distance': max(1, int(min_distance))}

    if threshold is not None:
        kwargs['height'] = threshold

    if prominence is not None:
        kwargs['prominence'] = prominence
    else:
        kwargs['prominence'] = 0.3 * np.std(signal)

    peaks, _ = find_peaks(signal, **kwargs)
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


def artifact_filter(beat_freq, window_half=5):
    """
    Apply local median filtering on beat frequency.
    Keep beats where 0.5 * median <= BF <= 2.0 * median.
    Returns: mask (list of bool).
    """
    bf = np.array(beat_freq, dtype=np.float64)
    n = len(bf)
    mask = np.ones(n, dtype=bool)

    for k in range(n):
        start = max(0, k - window_half)
        end = min(n, k + window_half + 1)
        local_median = np.median(bf[start:end])
        if local_median <= 0:
            mask[k] = False
            continue
        if not (0.5 * local_median <= bf[k] <= 2.0 * local_median):
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


def compute_light_pulses(start_time_sec, pulse_duration_sec, interval_sec, n_pulses=5):
    """Calculate pulse start/end times."""
    pulses = []
    current = start_time_sec
    for i in range(n_pulses):
        pulses.append({
            'index': i,
            'start_sec': float(current),
            'end_sec': float(current + pulse_duration_sec),
            'start_min': float(current / 60.0),
            'end_min': float((current + pulse_duration_sec) / 60.0)
        })
        current += pulse_duration_sec + interval_sec
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
