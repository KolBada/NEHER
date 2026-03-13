import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Tooltip text definitions
const SEM_TOOLTIP = `Single-electrode extracellular recording using a sharp glass microelectrode positioned near the tissue. Used for cardiac organoid recordings where beats are detected from a continuous voltage trace.`;

const MEA_TOOLTIP = `Extracellular recording using an array of electrodes across a culture well. Spikes and bursts are pre-detected and exported as tables. NEHER analyzes network spike rate and burst rate.`;

// Info icon with tooltip component
function InfoTooltip({ text }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="max-w-sm bg-zinc-900 border-zinc-700 text-zinc-300 text-xs p-3"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function ModeSelector({ onSelectSEM, onSelectMEA, onBack }) {
  const [hoveredCard, setHoveredCard] = useState(null);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100 mb-2">Select Recording Type</h1>
        <p className="text-sm text-zinc-500">Choose the type of electrophysiology data you want to analyze</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl w-full">
        {/* SEM Card */}
        <Card 
          className={`cursor-pointer transition-all duration-200 bg-zinc-900/50 border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900 ${
            hoveredCard === 'sem' ? 'ring-1 ring-emerald-500/30' : ''
          }`}
          onClick={onSelectSEM}
          onMouseEnter={() => setHoveredCard('sem')}
          onMouseLeave={() => setHoveredCard(null)}
          data-testid="mode-selector-sem"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-zinc-100 flex items-center">
              Sharp Extracellular Microelectrode (SEM)
              <InfoTooltip text={SEM_TOOLTIP} />
            </CardTitle>
            <CardDescription className="text-zinc-500 text-sm">
              Single-electrode recordings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Accepts .abf files</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Continuous voltage trace analysis</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Beat detection &amp; HRV metrics</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MEA Card */}
        <Card 
          className={`cursor-pointer transition-all duration-200 bg-zinc-900/50 border-zinc-800 hover:border-sky-500/50 hover:bg-zinc-900 ${
            hoveredCard === 'mea' ? 'ring-1 ring-sky-500/30' : ''
          }`}
          onClick={onSelectMEA}
          onMouseEnter={() => setHoveredCard('mea')}
          onMouseLeave={() => setHoveredCard(null)}
          data-testid="mode-selector-mea"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-zinc-100 flex items-center">
              Multi-Electrode Array (MEA)
              <InfoTooltip text={MEA_TOOLTIP} />
            </CardTitle>
            <CardDescription className="text-zinc-500 text-sm">
              Multi-well electrode array recordings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Accepts 5 CSV files per dataset</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Pre-detected spikes &amp; bursts</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <div className="w-2 h-2 rounded-full bg-sky-500" />
                <span>Network activity analysis</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
