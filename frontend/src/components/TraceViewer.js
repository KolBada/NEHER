import { useMemo, useCallback, useState, useRef, useEffect, memo } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea, ReferenceLine
} from 'recharts';
import { MousePointerClick, ZoomIn, Trash2, Plus, RotateCcw, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function TraceViewer({
  traceData, beats, onAddBeat, onRemoveBeat,
  lightPulses, lightEnabled, isValidated,
  threshold, onThresholdChange, signalStats,
  invert = false,
  zoomDomain: externalZoomDomain,
  onZoomChange: externalOnZoomChange,
  selectedDrugs,
  drugSettings,
  otherDrugs,
  DRUG_CONFIG
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedBeatIdx, setSelectedBeatIdx] = useState(null);
  const containerRef = useRef(null);
  
  // Use external zoom state if provided, otherwise use internal
  const [internalZoomDomain, setInternalZoomDomain] = useState(null);
  const zoomDomain = externalZoomDomain !== undefined ? externalZoomDomain : internalZoomDomain;
  const setZoomDomain = externalOnZoomChange || setInternalZoomDomain;
  
  const [isDraggingThreshold, setIsDraggingThreshold] = useState(false);

  // Get min/max time from data
  const timeBounds = useMemo(() => {
    if (!traceData || !traceData.times || traceData.times.length === 0) {
      return { min: 0, max: 1 };
    }
    return {
      min: traceData.times[0] / 60.0,
      max: traceData.times[traceData.times.length - 1] / 60.0
    };
  }, [traceData]);

  const chartData = useMemo(() => {
    if (!traceData || !traceData.times) return [];
    const data = traceData.times.map((t, i) => ({
      time: t / 60.0,
      voltage: traceData.voltages[i],
      isBeat: false,
      beatIdx: null,
    }));

    if (beats) {
      beats.forEach((beat, beatIdx) => {
        const beatMin = beat.timeSec / 60.0;
        let lo = 0, hi = data.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (data[mid].time < beatMin) lo = mid + 1;
          else hi = mid;
        }
        if (lo > 0 && Math.abs(data[lo - 1].time - beatMin) < Math.abs(data[lo].time - beatMin)) {
          lo = lo - 1;
        }
        if (lo < data.length) {
          data[lo].isBeat = true;
          data[lo].beatIdx = beatIdx;
        }
      });
    }
    return data;
  }, [traceData, beats]);

  // Filtered chart data based on zoom
  const visibleData = useMemo(() => {
    if (!zoomDomain) return chartData;
    return chartData.filter(d => d.time >= zoomDomain[0] && d.time <= zoomDomain[1]);
  }, [chartData, zoomDomain]);

  // Handle click on chart area for adding beats
  const handleChartClick = useCallback((e) => {
    if (!editMode || isValidated) return;
    
    // Recharts onClick provides activePayload when clicking near data points
    // Get time/voltage from activePayload if available
    let timeMin, voltage;
    
    if (e && e.activePayload && e.activePayload.length > 0) {
      const point = e.activePayload[0].payload;
      timeMin = point.time;
      voltage = point.voltage;
    } else if (e && e.activeLabel !== undefined && chartData.length > 0) {
      // Try using activeLabel (the x-axis value) when clicking near the line
      timeMin = e.activeLabel;
      // Find nearest data point to get voltage
      const nearestIdx = chartData.findIndex(d => Math.abs(d.time - timeMin) < 0.001);
      if (nearestIdx >= 0) {
        voltage = chartData[nearestIdx].voltage;
      } else {
        // Estimate voltage from interpolation
        const domain = zoomDomain || [timeBounds.min, timeBounds.max];
        const visiblePoints = chartData.filter(d => d.time >= domain[0] && d.time <= domain[1]);
        if (visiblePoints.length > 0) {
          // Find two closest points for interpolation
          let lo = 0, hi = visiblePoints.length - 1;
          while (lo < hi - 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (visiblePoints[mid].time < timeMin) lo = mid;
            else hi = mid;
          }
          if (hi < visiblePoints.length && lo >= 0) {
            const t1 = visiblePoints[lo].time, v1 = visiblePoints[lo].voltage;
            const t2 = visiblePoints[hi].time, v2 = visiblePoints[hi].voltage;
            const ratio = (timeMin - t1) / (t2 - t1 || 1);
            voltage = v1 + ratio * (v2 - v1);
          } else {
            voltage = visiblePoints[lo]?.voltage || 0;
          }
        } else {
          return; // Can't determine position
        }
      }
    } else {
      return; // Can't determine click position
    }

    const timeSec = timeMin * 60.0;

    // Check if clicking near an existing beat
    const visibleRange = zoomDomain 
      ? (zoomDomain[1] - zoomDomain[0])
      : (timeBounds.max - timeBounds.min);
    const tolerance = visibleRange / 200; // More precise tolerance based on visible range

    if (beats && beats.length > 0) {
      const nearIdx = beats.findIndex(b => Math.abs(b.timeSec / 60.0 - timeMin) < tolerance);
      if (nearIdx >= 0) {
        // Click on existing beat - select it for deletion
        setSelectedBeatIdx(nearIdx);
        return;
      }
    }
    
    // Add new beat at click position
    if (onAddBeat) {
      onAddBeat(timeSec, voltage);
    }
  }, [editMode, isValidated, beats, timeBounds, zoomDomain, onAddBeat, chartData]);

  // Handle beat marker click for removal
  const handleBeatClick = useCallback((beatIdx, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!editMode || isValidated) return;
    
    if (selectedBeatIdx === beatIdx) {
      // Second click on same beat - remove it
      if (onRemoveBeat) {
        onRemoveBeat(beatIdx);
      }
      setSelectedBeatIdx(null);
    } else {
      // First click - select it
      setSelectedBeatIdx(beatIdx);
    }
  }, [editMode, isValidated, selectedBeatIdx, onRemoveBeat]);

  // Confirm removal of selected beat
  const handleRemoveSelected = useCallback(() => {
    if (selectedBeatIdx !== null && onRemoveBeat) {
      onRemoveBeat(selectedBeatIdx);
      setSelectedBeatIdx(null);
    }
  }, [selectedBeatIdx, onRemoveBeat]);

  // Handle wheel zoom (trackpad)
  const handleWheel = useCallback((e) => {
    if (!containerRef.current || !chartData.length) return;
    
    // Only zoom with ctrl/cmd key or pinch gesture
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50) return;
    
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartWidth = rect.width - 60; // Account for margins
    const mouseRatio = Math.max(0, Math.min(1, (mouseX - 10) / chartWidth));
    
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const currentRange = currentMax - currentMin;
    
    // Zoom in/out
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const newRange = Math.max(0.1, Math.min(timeBounds.max - timeBounds.min, currentRange * zoomFactor));
    
    // Center zoom on mouse position
    const mouseTime = currentMin + mouseRatio * currentRange;
    let newMin = mouseTime - mouseRatio * newRange;
    let newMax = mouseTime + (1 - mouseRatio) * newRange;
    
    // Clamp to bounds
    if (newMin < timeBounds.min) {
      newMin = timeBounds.min;
      newMax = Math.min(timeBounds.max, newMin + newRange);
    }
    if (newMax > timeBounds.max) {
      newMax = timeBounds.max;
      newMin = Math.max(timeBounds.min, newMax - newRange);
    }
    
    if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) {
      setZoomDomain(null);
    } else {
      setZoomDomain([newMin, newMax]);
    }
  }, [chartData, zoomDomain, timeBounds]);

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    setZoomDomain(null);
  }, []);

  // Zoom in/out buttons
  const handleZoomIn = useCallback(() => {
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const currentRange = currentMax - currentMin;
    const newRange = currentRange * 0.7;
    const center = (currentMin + currentMax) / 2;
    const newMin = Math.max(timeBounds.min, center - newRange / 2);
    const newMax = Math.min(timeBounds.max, center + newRange / 2);
    setZoomDomain([newMin, newMax]);
  }, [zoomDomain, timeBounds]);

  const handleZoomOut = useCallback(() => {
    if (!zoomDomain) return;
    const currentRange = zoomDomain[1] - zoomDomain[0];
    const newRange = Math.min(timeBounds.max - timeBounds.min, currentRange * 1.5);
    const center = (zoomDomain[0] + zoomDomain[1]) / 2;
    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;
    if (newMin < timeBounds.min) {
      newMin = timeBounds.min;
      newMax = newMin + newRange;
    }
    if (newMax > timeBounds.max) {
      newMax = timeBounds.max;
      newMin = newMax - newRange;
    }
    if (newRange >= (timeBounds.max - timeBounds.min) * 0.99) {
      setZoomDomain(null);
    } else {
      setZoomDomain([newMin, newMax]);
    }
  }, [zoomDomain, timeBounds]);

  // Handle brush change (timeline slider) - for navigation after zoom
  const handleBrushChange = useCallback((brushArea) => {
    if (brushArea && brushArea.startIndex !== undefined && brushArea.endIndex !== undefined) {
      const startTime = chartData[brushArea.startIndex]?.time;
      const endTime = chartData[brushArea.endIndex]?.time;
      if (startTime !== undefined && endTime !== undefined) {
        setZoomDomain([startTime, endTime]);
      }
    }
  }, [chartData]);

  // Calculate brush indices from current zoom domain
  const brushIndices = useMemo(() => {
    if (!chartData.length) return { start: 0, end: 0 };
    if (!zoomDomain) return { start: 0, end: chartData.length - 1 };
    
    let startIdx = chartData.findIndex(d => d.time >= zoomDomain[0]);
    let endIdx = chartData.findIndex(d => d.time >= zoomDomain[1]);
    
    if (startIdx === -1) startIdx = 0;
    if (endIdx === -1) endIdx = chartData.length - 1;
    
    return { start: Math.max(0, startIdx), end: Math.min(chartData.length - 1, endIdx) };
  }, [chartData, zoomDomain]);

  // Reset zoom when trace data changes
  useEffect(() => {
    handleResetZoom();
    setSelectedBeatIdx(null);
  }, [traceData, handleResetZoom]);

  // Add wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  if (!traceData) return null;

  const isZoomed = zoomDomain !== null;
  const currentThreshold = threshold !== null ? threshold : (signalStats?.mean || 0);

  // Build array of all drugs with their settings and colors
  const DRUG_PURPLE_COLORS = [
    { fill: '#a855f7', border: 'border-purple-500', text: 'text-purple-400' },   // Purple 500
    { fill: '#c084fc', border: 'border-purple-400', text: 'text-purple-300' },   // Purple 400 (lighter)
    { fill: '#7c3aed', border: 'border-violet-600', text: 'text-violet-400' },   // Violet 600 (darker)
    { fill: '#8b5cf6', border: 'border-violet-500', text: 'text-violet-300' },   // Violet 500
  ];
  
  const allDrugsForViz = [];
  // Add selected drugs from DRUG_CONFIG
  if (selectedDrugs?.length > 0) {
    selectedDrugs.forEach((drugKey, idx) => {
      const settings = drugSettings?.[drugKey] || {};
      const config = DRUG_CONFIG?.[drugKey] || {};
      allDrugsForViz.push({
        key: drugKey,
        label: config.label || drugKey,
        perfStart: settings.perfusionStart ?? 3,
        perfDelay: settings.perfusionTime ?? 3,
        perfEnd: settings.perfusionEnd ?? null,
        color: DRUG_PURPLE_COLORS[idx % DRUG_PURPLE_COLORS.length],
      });
    });
  }
  // Add other (custom) drugs
  if (otherDrugs?.length > 0) {
    otherDrugs.forEach((drug, idx) => {
      const colorIdx = (selectedDrugs?.length || 0) + idx;
      allDrugsForViz.push({
        key: drug.id || `other-${idx}`,
        label: drug.name || `Drug ${idx + 1}`,
        perfStart: drug.perfusionStart ?? 3,
        perfDelay: drug.perfusionTime ?? 3,
        perfEnd: drug.perfusionEnd ?? null,
        color: DRUG_PURPLE_COLORS[colorIdx % DRUG_PURPLE_COLORS.length],
      });
    });
  }
  
  const drugPresent = allDrugsForViz.length > 0;
  const recordingEndMin = timeBounds.max;

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload && payload.isBeat && cx !== undefined && cy !== undefined) {
      const isSelected = payload.beatIdx === selectedBeatIdx;
      return (
        <circle
          cx={cx} cy={cy} r={isSelected ? 6 : 4}
          fill={isSelected ? '#ef4444' : '#a3e635'}
          stroke={isSelected ? '#fca5a5' : '#65a30d'}
          strokeWidth={isSelected ? 2 : 1}
          style={{ cursor: editMode ? 'pointer' : 'default' }}
          onClick={(e) => handleBeatClick(payload.beatIdx, e)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      );
    }
    return null;
  };

  // Convert light pulses to minutes for display
  const pulsesMin = lightPulses ? lightPulses.map(p => ({
    ...p,
    start_min_disp: p.start_min !== undefined ? p.start_min : (p.start_sec / 60.0),
    end_min_disp: p.end_min !== undefined ? p.end_min : (p.end_sec / 60.0),
  })) : null;

  // Determine X-axis domain
  const xDomain = zoomDomain || [timeBounds.min, timeBounds.max];

  return (
    <div 
      className="glass-surface-subtle rounded-xl" 
      style={{ borderLeft: '3px solid #c0c0c0' }}
      data-testid="trace-viewer" 
      ref={containerRef}
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <Button
            data-testid="edit-mode-btn"
            variant={editMode ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 text-xs rounded-lg ${
              editMode
                ? 'text-white'
                : 'hover:text-zinc-100'
            }`}
            style={{
              background: editMode ? '#0891b2' : 'rgba(255,255,255,0.04)',
              border: editMode ? 'none' : '1px solid rgba(255,255,255,0.1)',
              color: editMode ? 'white' : 'var(--text-secondary)'
            }}
            onClick={() => {
              setEditMode(!editMode);
              setSelectedBeatIdx(null);
            }}
            disabled={isValidated}
          >
            <MousePointerClick className="w-3 h-3 mr-1" />
            {editMode ? 'Editing ON' : 'Edit Beats'}
          </Button>
          {editMode && !isValidated && (
            <>
              <Button
                data-testid="add-beat-hint"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] rounded-lg"
                style={{ borderColor: 'rgba(34, 197, 94, 0.4)', color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)' }}
                disabled
              >
                <Plus className="w-3 h-3 mr-1" />
                Click to add
              </Button>
              <Button
                data-testid="remove-beat-hint"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] rounded-lg"
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                disabled
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Click marker to remove
              </Button>
            </>
          )}
          {/* Beats badge - silver */}
          <Badge variant="outline" className="font-data text-[10px]" style={{ borderColor: '#c0c0c0', color: '#c0c0c0' }}>
            {beats ? beats.length : 0} beats
          </Badge>
          {/* Stims badge - amber - only when light enabled */}
          {lightEnabled && lightPulses && lightPulses.length > 0 && (
            <Badge variant="outline" className="font-data text-[10px]" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
              {lightPulses.length} stims
            </Badge>
          )}
          {/* Drug badges - purple - one per drug */}
          {allDrugsForViz.map((drug) => (
            <Badge 
              key={drug.key}
              variant="outline" 
              className={`font-data text-[10px] ${drug.color.border} ${drug.color.text}`}
            >
              {drug.label || drug.key} perfusion
            </Badge>
          ))}
          {selectedBeatIdx !== null && (
            <Button
              data-testid="remove-beat-btn"
              variant="destructive"
              size="sm"
              className="h-6 text-[10px] rounded-lg gap-1"
              style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
              onClick={handleRemoveSelected}
            >
              <Trash2 className="w-3 h-3" />
              Remove #{selectedBeatIdx + 1}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:text-zinc-300"
            style={{ color: 'var(--text-secondary)' }}
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:text-zinc-300"
            style={{ color: 'var(--text-secondary)' }}
            onClick={handleZoomOut}
            disabled={!isZoomed}
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </Button>
          {isZoomed && (
            <Button
              data-testid="reset-zoom-btn"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] hover:text-zinc-200"
              style={{ color: 'var(--text-secondary)' }}
              onClick={handleResetZoom}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={395}>
        <ComposedChart
          data={chartData}
          onClick={handleChartClick}
          margin={{ top: 10, right: 35, left: 15, bottom: 35 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
          <XAxis
            dataKey="time"
            type="number"
            domain={xDomain}
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={(v) => v.toFixed(1)}
            label={{ value: 'min', fill: '#a1a1aa', fontSize: 10, position: 'insideBottom', offset: -13 }}
            allowDataOverflow
          />
          <YAxis
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={(v) => v.toFixed(1)}
            width={50}
            label={{ value: 'mV', angle: -90, fill: '#52525b', fontSize: 10, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              background: '#121212',
              border: '1px solid #27272a',
              borderRadius: 2,
              fontFamily: 'JetBrains Mono',
              fontSize: 10,
              color: '#fafafa'
            }}
            labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
            formatter={(v, name) => [Number(v).toFixed(3), name === 'voltage' ? 'mV' : name]}
          />
          {/* Drug effect regions (purple) - one per drug with different colors */}
          {allDrugsForViz.map((drug, idx) => (
            <ReferenceArea 
              key={`trace-drug-${drug.key}`}
              x1={drug.perfStart + drug.perfDelay} 
              x2={drug.perfEnd !== null ? drug.perfEnd : recordingEndMin} 
              fill={drug.color.fill} 
              fillOpacity={0.15 + (idx * 0.05)} 
              stroke="none" 
              ifOverflow="hidden" 
            />
          ))}
          {/* Light stim highlights - only when light stim is enabled (no labels) */}
          {lightEnabled && pulsesMin && pulsesMin.map((pulse, i) => (
            <ReferenceArea
              key={`pulse-${i}`}
              x1={pulse.start_min_disp}
              x2={pulse.end_min_disp}
              fill="#facc15"
              fillOpacity={0.15}
              stroke="#facc15"
              strokeOpacity={0.6}
              strokeWidth={1}
            />
          ))}
          <Line
            type="monotone"
            dataKey="voltage"
            stroke="#c0c0c0"
            strokeWidth={1}
            dot={<CustomDot />}
            isAnimationActive={false}
            activeDot={editMode ? { r: 6, fill: '#c0c0c0', stroke: '#22d3ee', strokeWidth: 2 } : { r: 4, fill: '#c0c0c0', stroke: '#22d3ee', strokeWidth: 1 }}
          />
          {/* Threshold line - rendered after trace to appear on top */}
          {threshold !== null && (
            <ReferenceLine
              y={threshold}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              ifOverflow="extendDomain"
            />
          )}
          {/* Timeline brush/slider - always shows full recording */}
          <Brush
            dataKey="time"
            height={20}
            stroke="#52525b"
            fill="#0c0c0e"
            tickFormatter={(v) => v.toFixed(1)}
            startIndex={brushIndices.start}
            endIndex={brushIndices.end}
            onChange={handleBrushChange}
            travellerWidth={8}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default memo(TraceViewer);
