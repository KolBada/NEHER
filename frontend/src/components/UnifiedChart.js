import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea, ReferenceLine
} from 'recharts';
import { ZoomIn, Minus, RotateCcw, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Format time in minutes only (e.g., 0.0, 0.5, 1.0, 2.0)
 */
export function formatTimeMin(minutes) {
  return minutes.toFixed(1);
}

/**
 * Unified Chart Component with consistent zoom, pan, and time formatting
 * 
 * Features:
 * - Trackpad pinch zoom (Ctrl+Scroll)
 * - Click-and-drag zoom selection
 * - Horizontal scrolling/panning
 * - Sliding timeline bar at the bottom (Brush)
 * - Time axis in minutes only
 */
export default function UnifiedChart({
  data,
  dataKey,
  height = 200,
  yAxisLabel = '',
  yAxisWidth = 45,
  color = '#22d3ee',
  lightPulses = null,
  referenceLines = [],
  showBrush = true,
  brushHeight = 25,
  customDot = null,
  onChartClick = null,
  chartStyle = {},
  children,
  tooltipFormatter = null,
  yTickFormatter = null,
  xDomain: externalXDomain = null,
  onZoomChange = null,
}) {
  const containerRef = useRef(null);
  const [zoomDomain, setZoomDomain] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  // Get min/max time from data
  const timeBounds = useMemo(() => {
    if (!data || !data.length) return { min: 0, max: 1 };
    const times = data.map(d => d.time);
    return {
      min: Math.min(...times),
      max: Math.max(...times)
    };
  }, [data]);

  // Filtered data based on zoom
  const visibleData = useMemo(() => {
    if (!zoomDomain) return data;
    return data.filter(d => d.time >= zoomDomain[0] && d.time <= zoomDomain[1]);
  }, [data, zoomDomain]);

  // Current domain for X axis
  const xDomain = externalXDomain || zoomDomain || [timeBounds.min, timeBounds.max];

  // Handle wheel zoom (trackpad pinch)
  const handleWheel = useCallback((e) => {
    if (!containerRef.current || !data || !data.length) return;
    
    // Only zoom with ctrl/cmd key or pinch gesture
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 50) {
      // Horizontal scroll for panning
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && zoomDomain) {
        e.preventDefault();
        const currentRange = zoomDomain[1] - zoomDomain[0];
        const panAmount = (e.deltaX / 500) * currentRange;
        let newMin = zoomDomain[0] + panAmount;
        let newMax = zoomDomain[1] + panAmount;
        
        if (newMin < timeBounds.min) {
          newMin = timeBounds.min;
          newMax = newMin + currentRange;
        }
        if (newMax > timeBounds.max) {
          newMax = timeBounds.max;
          newMin = newMax - currentRange;
        }
        setZoomDomain([newMin, newMax]);
        if (onZoomChange) onZoomChange([newMin, newMax]);
      }
      return;
    }
    
    e.preventDefault();
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const chartWidth = rect.width - 60;
    const mouseRatio = Math.max(0, Math.min(1, (mouseX - 10) / chartWidth));
    
    const currentMin = zoomDomain ? zoomDomain[0] : timeBounds.min;
    const currentMax = zoomDomain ? zoomDomain[1] : timeBounds.max;
    const currentRange = currentMax - currentMin;
    
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const newRange = Math.max(0.1, Math.min(timeBounds.max - timeBounds.min, currentRange * zoomFactor));
    
    const mouseTime = currentMin + mouseRatio * currentRange;
    let newMin = mouseTime - mouseRatio * newRange;
    let newMax = mouseTime + (1 - mouseRatio) * newRange;
    
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
      if (onZoomChange) onZoomChange(null);
    } else {
      setZoomDomain([newMin, newMax]);
      if (onZoomChange) onZoomChange([newMin, newMax]);
    }
  }, [data, zoomDomain, timeBounds, onZoomChange]);

  // Mouse handlers for drag-to-zoom
  const handleMouseDown = useCallback((e) => {
    if (!e || !e.activeLabel) return;
    setIsDragging(true);
    setDragStart(e.activeLabel);
    setDragEnd(e.activeLabel);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !e || !e.activeLabel) return;
    setDragEnd(e.activeLabel);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      const range = end - start;
      
      // Only zoom if selection is significant (at least 0.1 min)
      if (range > 0.1) {
        setZoomDomain([start, end]);
        if (onZoomChange) onZoomChange([start, end]);
      }
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, onZoomChange]);

  // Handle brush change
  const handleBrushChange = useCallback((brushArea) => {
    if (brushArea && brushArea.startIndex !== undefined && brushArea.endIndex !== undefined) {
      const startTime = data[brushArea.startIndex]?.time;
      const endTime = data[brushArea.endIndex]?.time;
      if (startTime !== undefined && endTime !== undefined) {
        setZoomDomain([startTime, endTime]);
        if (onZoomChange) onZoomChange([startTime, endTime]);
      }
    }
  }, [data, onZoomChange]);

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    setZoomDomain(null);
    if (onZoomChange) onZoomChange(null);
  }, [onZoomChange]);

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
    if (onZoomChange) onZoomChange([newMin, newMax]);
  }, [zoomDomain, timeBounds, onZoomChange]);

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
      if (onZoomChange) onZoomChange(null);
    } else {
      setZoomDomain([newMin, newMax]);
      if (onZoomChange) onZoomChange([newMin, newMax]);
    }
  }, [zoomDomain, timeBounds, onZoomChange]);

  // Add wheel listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // Reset zoom when data changes significantly
  useEffect(() => {
    setZoomDomain(null);
  }, [data?.length]);

  if (!data || !data.length) return null;

  const isZoomed = zoomDomain !== null;

  // Calculate brush indices based on current zoom
  const brushStartIndex = zoomDomain 
    ? data.findIndex(d => d.time >= zoomDomain[0]) 
    : 0;
  const brushEndIndex = zoomDomain 
    ? data.findIndex(d => d.time >= zoomDomain[1]) 
    : data.length - 1;

  return (
    <div ref={containerRef} style={{ touchAction: 'none' }}>
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 bg-zinc-900/30">
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300" 
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="w-3 h-3" />
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-5 w-5 p-0 text-zinc-500 hover:text-zinc-300" 
          onClick={handleZoomOut}
          disabled={!isZoomed}
          title="Zoom Out"
        >
          <Minus className="w-3 h-3" />
        </Button>
        {isZoomed && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-5 px-1 text-[9px] text-zinc-400 hover:text-zinc-200" 
            onClick={handleResetZoom}
          >
            <RotateCcw className="w-3 h-3 mr-1" />Reset
          </Button>
        )}
        <span className="text-[9px] text-zinc-600 ml-1">Ctrl+Scroll zoom • Drag select • Scroll pan</span>
      </div>
      
      <ResponsiveContainer width="100%" height={height + (showBrush ? brushHeight + 10 : 0)}>
        <LineChart
          data={visibleData}
          margin={{ top: 10, right: 20, left: 10, bottom: showBrush ? 5 : 5 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={onChartClick}
          style={{ cursor: isDragging ? 'col-resize' : (onChartClick ? 'crosshair' : 'default'), ...chartStyle }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
          <XAxis
            dataKey="time"
            type="number"
            domain={xDomain}
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={(v) => formatTimeMin(v)}
            label={{ value: 'min', fill: '#52525b', fontSize: 9, position: 'insideBottomRight', offset: -5 }}
            allowDataOverflow
          />
          <YAxis
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={yTickFormatter || ((v) => v.toFixed(1))}
            width={yAxisWidth}
            label={{ value: yAxisLabel, angle: -90, fill: '#52525b', fontSize: 9, position: 'insideLeft' }}
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
            labelFormatter={(v) => `${formatTimeMin(v)} min`}
            formatter={tooltipFormatter || ((v, name) => [`${Number(v).toFixed(2)}`, name])}
          />
          
          {/* Drag selection area */}
          {isDragging && dragStart !== null && dragEnd !== null && (
            <ReferenceArea
              x1={Math.min(dragStart, dragEnd)}
              x2={Math.max(dragStart, dragEnd)}
              fill="#22d3ee"
              fillOpacity={0.2}
              stroke="#22d3ee"
              strokeOpacity={0.8}
            />
          )}
          
          {/* Light pulse highlights */}
          {lightPulses && lightPulses.map((pulse, i) => (
            <ReferenceArea
              key={`pulse-${i}`}
              x1={pulse.start_min ?? (pulse.start_sec / 60)}
              x2={pulse.end_min ?? (pulse.end_sec / 60)}
              fill="#facc15"
              fillOpacity={0.15}
              stroke="#facc15"
              strokeOpacity={0.5}
            />
          ))}
          
          {/* Reference lines */}
          {referenceLines.map((line, i) => (
            <ReferenceLine
              key={`refline-${i}`}
              y={line.y}
              stroke={line.stroke || '#f59e0b'}
              strokeWidth={line.strokeWidth || 2}
              strokeDasharray={line.strokeDasharray || '5 5'}
              label={line.label}
            />
          ))}
          
          {/* Additional children (extra lines, areas, etc.) */}
          {children}
          
          {/* Main data line */}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1}
            dot={customDot || false}
            isAnimationActive={false}
          />
          
          {/* Brush for timeline navigation */}
          {showBrush && (
            <Brush
              dataKey="time"
              height={brushHeight}
              stroke="#3f3f46"
              fill="#0c0c0e"
              tickFormatter={(v) => formatTimeMin(v)}
              startIndex={brushStartIndex >= 0 ? brushStartIndex : 0}
              endIndex={brushEndIndex >= 0 ? brushEndIndex : data.length - 1}
              onChange={handleBrushChange}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
