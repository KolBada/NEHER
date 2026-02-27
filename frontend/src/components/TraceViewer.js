import { useMemo, useCallback, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea
} from 'recharts';
import { MousePointerClick, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function TraceViewer({
  traceData, beats, onAddBeat, onRemoveBeat,
  lightPulses, isValidated
}) {
  const [editMode, setEditMode] = useState(false);

  const chartData = useMemo(() => {
    if (!traceData || !traceData.times) return [];
    const data = traceData.times.map((t, i) => ({
      time: t / 60.0, // Convert to minutes
      voltage: traceData.voltages[i],
      isBeat: false,
    }));

    if (beats) {
      beats.forEach((beat) => {
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
      });
    }
    return data;
  }, [traceData, beats]);

  const handleChartClick = useCallback((e) => {
    if (!editMode || isValidated) return;
    if (!e || !e.activePayload || e.activePayload.length === 0) return;

    const point = e.activePayload[0].payload;
    const timeMin = point.time;
    const timeSec = timeMin * 60.0;
    const voltage = point.voltage;

    const timeRange = traceData
      ? (traceData.times[traceData.times.length - 1] - traceData.times[0]) / 60.0
      : 1;
    const tolerance = timeRange / 500;

    if (beats) {
      const nearIdx = beats.findIndex(b => Math.abs(b.timeSec / 60.0 - timeMin) < tolerance);
      if (nearIdx >= 0) {
        onRemoveBeat(nearIdx);
        return;
      }
    }
    onAddBeat(timeSec, voltage);
  }, [editMode, isValidated, beats, traceData, onAddBeat, onRemoveBeat]);

  if (!traceData) return null;

  const CustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload && payload.isBeat) {
      return (
        <circle
          cx={cx} cy={cy} r={3}
          fill="#a3e635" stroke="#a3e635" strokeWidth={1}
          style={{ cursor: editMode ? 'pointer' : 'default' }}
        />
      );
    }
    return null;
  };

  // Convert light pulses to minutes for display
  const pulsesMin = lightPulses ? lightPulses.map(p => ({
    ...p,
    start_min_disp: p.start_sec / 60.0,
    end_min_disp: p.end_sec / 60.0,
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
            onClick={() => setEditMode(!editMode)}
            disabled={isValidated}
          >
            <MousePointerClick className="w-3 h-3 mr-1" />
            {editMode ? 'Click to Add/Remove' : 'Edit Beats'}
          </Button>
          <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
            {beats ? beats.length : 0} beats
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ZoomIn className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500">Use brush below to zoom</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={420}>
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
            formatter={(v) => [Number(v).toFixed(3), 'mV']}
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
            activeDot={false}
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
