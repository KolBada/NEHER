import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronRight, ChevronDown, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Info tooltip component
function InfoTip({ text, children }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center cursor-help">
            {children}
            <Info className="w-3 h-3 ml-1 text-zinc-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-zinc-900 border-zinc-700 text-zinc-300 text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Collapsible section component
function ConfigSection({ title, expanded, onToggle, children, badge }) {
  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-zinc-200">{title}</span>
        <div className="flex items-center gap-2">
          {badge}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="p-4 bg-zinc-950/30 border-t border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}

export default function MEAConfig({ meaData, onConfigured, onBack }) {
  // Config state
  const [config, setConfig] = useState({
    // Spontaneous activity
    baseline_start_s: 0,
    baseline_end_s: 60,
    
    // Light stimulation
    light_enabled: false,
    n_stimulations: 0,
    stim_start_s: 60,
    stim_duration_s: 10,
    isi_s: 30,
    readout_window_s: 20,
    
    // Drug configuration
    drug_enabled: false,
    drug_name: '',
    drug_start_s: 0,
    drug_end_s: 0,
    
    // Electrode filter (MEA-only)
    electrode_min_hz: 0.05,
    electrode_max_hz: '',
    
    // Binning (MEA-only)
    spike_bin_s: 5,
    burst_bin_s: 30,
  });
  
  // Section expansion state
  const [sections, setSections] = useState({
    baseline: true,
    light: false,
    drug: false,
    electrode: false,
    binning: false,
  });
  
  // Get recording duration from data
  const recordingDuration = meaData?.wells 
    ? Math.max(...Object.values(meaData.wells).map(w => w.duration_s || 0))
    : 0;
  
  // Update config field
  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };
  
  // Toggle section
  const toggleSection = (section) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  
  // Validate config
  const validateConfig = () => {
    const errors = [];
    
    // Baseline validation
    if (config.baseline_end_s <= config.baseline_start_s) {
      errors.push('Baseline end must be after baseline start');
    }
    
    // Light validation
    if (config.light_enabled && config.n_stimulations > 0) {
      if (config.stim_duration_s <= 0) {
        errors.push('Stimulation duration must be positive');
      }
      if (config.readout_window_s <= 0) {
        errors.push('Readout window must be positive');
      }
    }
    
    // Drug validation
    if (config.drug_enabled && config.drug_name) {
      if (config.drug_end_s <= config.drug_start_s) {
        errors.push('Drug end time must be after start time');
      }
    }
    
    // Binning validation
    if (config.spike_bin_s < 1 || config.spike_bin_s > 60) {
      errors.push('Spike bin size must be between 1 and 60 seconds');
    }
    if (config.burst_bin_s < 5 || config.burst_bin_s > 120) {
      errors.push('Burst bin size must be between 5 and 120 seconds');
    }
    
    return errors;
  };
  
  // Handle proceed
  const handleProceed = () => {
    const errors = validateConfig();
    if (errors.length > 0) {
      alert(errors.join('\n'));
      return;
    }
    
    // Process config - convert empty max_hz to null
    const processedConfig = {
      ...config,
      electrode_max_hz: config.electrode_max_hz === '' ? null : parseFloat(config.electrode_max_hz),
      n_stimulations: config.light_enabled ? config.n_stimulations : 0,
      drug_name: config.drug_enabled ? config.drug_name : '',
    };
    
    onConfigured(processedConfig);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-xl text-zinc-100">Configure MEA Analysis</CardTitle>
          <p className="text-sm text-zinc-500">
            {Object.keys(meaData?.wells || {}).length} wells selected • 
            Recording duration: {recordingDuration.toFixed(1)}s
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Baseline/Spontaneous Activity Section */}
            <ConfigSection
              title="Spontaneous Activity"
              expanded={sections.baseline}
              onToggle={() => toggleSection('baseline')}
              badge={<span className="text-xs text-emerald-400">Required</span>}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="Start time of the baseline window for spontaneous activity analysis">
                      Baseline Start (s)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.baseline_start_s}
                    onChange={(e) => updateConfig('baseline_start_s', parseFloat(e.target.value) || 0)}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={0}
                    step={1}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="End time of the baseline window">
                      Baseline End (s)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.baseline_end_s}
                    onChange={(e) => updateConfig('baseline_end_s', parseFloat(e.target.value) || 0)}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={0}
                    step={1}
                  />
                </div>
              </div>
            </ConfigSection>
            
            {/* Light Stimulation Section */}
            <ConfigSection
              title="Light Stimulation"
              expanded={sections.light}
              onToggle={() => toggleSection('light')}
              badge={
                <Switch
                  checked={config.light_enabled}
                  onCheckedChange={(checked) => {
                    updateConfig('light_enabled', checked);
                    if (checked) {
                      setSections(prev => ({ ...prev, light: true }));
                      if (config.n_stimulations === 0) {
                        updateConfig('n_stimulations', 1);
                      }
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              {config.light_enabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Number of light stimulation pulses (1-10)">
                          Number of Stimulations
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.n_stimulations}
                        onChange={(e) => updateConfig('n_stimulations', Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={1}
                        max={10}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Start time of the first stimulation">
                          First Stim Start (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.stim_start_s}
                        onChange={(e) => updateConfig('stim_start_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={1}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Duration of each stimulation pulse">
                          Stim Duration (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.stim_duration_s}
                        onChange={(e) => updateConfig('stim_duration_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={0.1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Inter-stimulus interval (time between stims)">
                          ISI (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.isi_s}
                        onChange={(e) => updateConfig('isi_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Window for metric extraction after each stim">
                          Readout Window (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.readout_window_s}
                        onChange={(e) => updateConfig('readout_window_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={1}
                      />
                    </div>
                  </div>
                </div>
              )}
            </ConfigSection>
            
            {/* Drug Configuration Section (MEA-specific - no perfusion delay) */}
            <ConfigSection
              title="Drug Application"
              expanded={sections.drug}
              onToggle={() => toggleSection('drug')}
              badge={
                <Switch
                  checked={config.drug_enabled}
                  onCheckedChange={(checked) => {
                    updateConfig('drug_enabled', checked);
                    if (checked) {
                      setSections(prev => ({ ...prev, drug: true }));
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              {config.drug_enabled && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-zinc-400">
                      <InfoTip text="Name of the drug applied">
                        Drug Name
                      </InfoTip>
                    </Label>
                    <Input
                      type="text"
                      value={config.drug_name}
                      onChange={(e) => updateConfig('drug_name', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 mt-1"
                      placeholder="e.g., Isoproterenol"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="Start time of drug application window">
                          Drug Start (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.drug_start_s}
                        onChange={(e) => updateConfig('drug_start_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">
                        <InfoTip text="End time of drug application window">
                          Drug End (s)
                        </InfoTip>
                      </Label>
                      <Input
                        type="number"
                        value={config.drug_end_s}
                        onChange={(e) => updateConfig('drug_end_s', parseFloat(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 mt-1"
                        min={0}
                        step={1}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 italic">
                    Note: MEA drug applications are direct to the well - no perfusion delay is needed.
                  </p>
                </div>
              )}
            </ConfigSection>
            
            {/* Electrode Filter Section (MEA-only) */}
            <ConfigSection
              title="Electrode Filter"
              expanded={sections.electrode}
              onToggle={() => toggleSection('electrode')}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="Minimum firing rate to include an electrode (Hz)">
                      Min Firing Rate (Hz)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.electrode_min_hz}
                    onChange={(e) => updateConfig('electrode_min_hz', parseFloat(e.target.value) || 0)}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="Maximum firing rate to include (leave empty for no limit)">
                      Max Firing Rate (Hz)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.electrode_max_hz}
                    onChange={(e) => updateConfig('electrode_max_hz', e.target.value)}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={0}
                    step={0.1}
                    placeholder="No limit"
                  />
                </div>
              </div>
            </ConfigSection>
            
            {/* Binning Section (MEA-only) */}
            <ConfigSection
              title="Binning Settings"
              expanded={sections.binning}
              onToggle={() => toggleSection('binning')}
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="Time bin size for spike rate calculation (1-60s)">
                      Spike Bin Size (s)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.spike_bin_s}
                    onChange={(e) => updateConfig('spike_bin_s', Math.min(60, Math.max(1, parseInt(e.target.value) || 5)))}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={1}
                    max={60}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">
                    <InfoTip text="Time bin size for burst rate calculation (5-120s)">
                      Burst Bin Size (s)
                    </InfoTip>
                  </Label>
                  <Input
                    type="number"
                    value={config.burst_bin_s}
                    onChange={(e) => updateConfig('burst_bin_s', Math.min(120, Math.max(5, parseInt(e.target.value) || 30)))}
                    className="bg-zinc-950 border-zinc-800 mt-1"
                    min={5}
                    max={120}
                  />
                </div>
              </div>
            </ConfigSection>
            
            {/* Actions */}
            <div className="flex justify-between items-center pt-4">
              <Button variant="ghost" onClick={onBack}>
                Back to Well Selection
              </Button>
              <Button
                onClick={handleProceed}
                className="bg-sky-600 hover:bg-sky-500"
                data-testid="mea-config-proceed-btn"
              >
                Run Analysis
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
