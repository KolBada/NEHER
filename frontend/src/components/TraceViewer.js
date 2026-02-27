import { useMemo, useCallback, useState, useRef } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea, ReferenceLine
} from 'recharts';
import { MousePointerClick, ZoomIn, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function TraceViewer({
  traceData, beats, onAddBeat, onRemoveBeat,
  lightPulses, isValidated
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedBeatIdx, setSelectedBeatIdx] = useState(null);
  const chartRef = useRef(null);

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
        data[lo].isBeat = true;
        data[lo].beatIdx = beatIdx;
      });
    }
    return data;
  }, [traceData, beats]);

  // Handle click on chart area for adding beats
  const handleChartClick = useCallback((e) => {
    if (!editMode || isValidated) return;
    if (!e || !e.activePayload || e.activePayload.length === 0) return;

    const point = e.activePayload[0].payload;
    const timeMin = point.time;
    const timeSec = timeMin * 60.0;
    const voltage = point.voltage;

    // Check if clicking near an existing beat
    const timeRange = traceData
      ? (traceData.times[traceData.times.length - 1] - traceData.times[0]) / 60.0
      : 1;
    const tolerance = timeRange / 300;

    if (beats) {
      const nearIdx = beats.findIndex(b => Math.abs(b.timeSec / 60.0 - timeMin) < tolerance);
      if (nearIdx >= 0) {
        // Click on existing beat - select it for deletion
        setSelectedBeatIdx(nearIdx);
        return;
      }
    }
    // Add new beat at click position
    onAddBeat(timeSec, voltage);
  }, [editMode, isValidated, beats, traceData, onAddBeat]);

  // Handle beat marker click for removal
  const handleBeatClick = useCallback((beatIdx, e) => {
    if (e) e.stopPropagation();
    if (!editMode || isValidated) return;
    
    if (selectedBeatIdx === beatIdx) {
      // Second click on same beat - remove it
      onRemoveBeat(beatIdx);
      setSelectedBeatIdx(null);
    } else {
      // First click - select it
      setSelectedBeatIdx(beatIdx);
    }
  }, [editMode, isValidated, selectedBeatIdx, onRemoveBeat]);

  // Confirm removal of selected beat
  const handleRemoveSelected = useCallback(() => {
    if (selectedBeatIdx !== null) {
      onRemoveBeat(selectedBeatIdx);
      setSelectedBeatIdx(null);
    }
  }, [selectedBeatIdx, onRemoveBeat]);

  if (!traceData) return null;

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload && payload.isBeat) {
      const isSelected = payload.beatIdx === selectedBeatIdx;
      return (
        <circle
          cx={cx} cy={cy} r={isSelected ? 5 : 3}
          fill={isSelected ? '#ef4444' : '#a3e635'}
          stroke={isSelected ? '#fca5a5' : '#a3e635'}
          strokeWidth={isSelected ? 2 : 1}
          style={{ cursor: editMode ? 'pointer' : 'default' }}
          onClick={(e) => handleBeatClick(payload.beatIdx, e)}
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

  return (
    <div className="trace-container" data-testid="trace-viewer">
      <div className="flex items-center justify-between gap-2 p-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Button
            data-testid="edit-mode-btn"
            variant={editMode ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 text-xs rounded-sm ${
              editMode
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
            onClick={() => {
              setEditMode(!editMode);
              setSelectedBeatIdx(null);
            }}
            disabled={isValidated}
          >
            <MousePointerClick className="w-3 h-3 mr-1" />
            {editMode ? 'Editing Mode ON' : 'Edit Beats'}
          </Button>
          {editMode && (
            <span className="text-[10px] text-cyan-400">
              Click on trace to add beat, click on beat marker to select & remove
            </span>
          )}
          <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
            {beats ? beats.length : 0} beats
          </Badge>
          {selectedBeatIdx !== null && (
            <Button
              data-testid="remove-beat-btn"
              variant="destructive"
              size="sm"
              className="h-6 text-[10px] rounded-sm gap-1"
              onClick={handleRemoveSelected}
            >
              <Trash2 className="w-3 h-3" />
              Remove Beat #{selectedBeatIdx + 1}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ZoomIn className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500">Use brush below to zoom</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={420} ref={chartRef}>
        <ComposedChart
          data={chartData}
          onClick={handleChartClick}
          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: '#71717a', fontFamily: 'JetBrains Mono', fontSize: 9 }}
            tickFormatter={(v) => `${Number(v).toFixed(1)}`}
            label={{ value: 'Time (min)', fill: '#52525b', fontSize: 10, position: 'insideBottomRight', offset: -5 }}
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
            labelFormatter={(v) => `${Number(v).toFixed(3)} min`}
            formatter={(v, name) => [Number(v).toFixed(3), name === 'voltage' ? 'mV' : name]}
          />
          {pulsesMin && pulsesMin.map((pulse, i) => (
            <ReferenceArea
              key={`pulse-${i}`}
              x1={pulse.start_min_disp}
              x2={pulse.end_min_disp}
              fill="#facc15"
              fillOpacity={0.08}
              stroke="#facc15"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
          ))}
          <Line
            type="monotone"
            dataKey="voltage"
            stroke="#22d3ee"
            strokeWidth={1}
            dot={<CustomDot />}
            isAnimationActive={false}
            activeDot={editMode ? { r: 5, fill: '#22d3ee', stroke: '#fff' } : false}
          />
          <Brush
            dataKey="time"
            height={25}
            stroke="#3f3f46"
            fill="#0c0c0e"
            tickFormatter={(v) => `${Number(v).toFixed(1)} min`}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
