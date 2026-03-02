import { Loader2, FileSpreadsheet, FileText, FileDown, Plus, X, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function ExportPanel({
  metrics, hrvResults, lightHrv, lightResponse,
  onExportCsv, onExportXlsx, onExportPdf,
  loading, recordingName, drugUsed, perMinuteData,
  // New metadata props
  recordingDate, setRecordingDate,
  organoidInfo, setOrganoidInfo,
  recordingDescription, setRecordingDescription,
  originalFilename,
  fusionDate, setFusionDate
}) {
  const hasData = !!metrics;
  const hasHrv = !!hrvResults?.windows?.length;
  const hasLight = !!lightHrv || !!lightResponse;
  const hasPerMinute = !!perMinuteData?.length;
  
  // Track which samples have transfection expanded
  const [expandedTransfection, setExpandedTransfection] = useState({});

  // Handle organoid info updates
  const handleOrganoidChange = (index, field, value) => {
    const updated = [...organoidInfo];
    updated[index] = { ...updated[index], [field]: value };
    setOrganoidInfo(updated);
  };
  
  // Handle transfection info updates
  const handleTransfectionChange = (index, field, value) => {
    const updated = [...organoidInfo];
    const transfection = updated[index].transfection || {};
    updated[index] = { 
      ...updated[index], 
      transfection: { ...transfection, [field]: value }
    };
    setOrganoidInfo(updated);
  };
  
  // Toggle transfection section
  const toggleTransfection = (index) => {
    setExpandedTransfection(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const addOrganoidEntry = () => {
    setOrganoidInfo([...organoidInfo, { cell_type: '', other_cell_type: '', line_name: '', birth_date: '', passage_number: '', transfection: null }]);
  };

  const removeOrganoidEntry = (index) => {
    if (organoidInfo.length > 1) {
      setOrganoidInfo(organoidInfo.filter((_, i) => i !== index));
      // Also remove from expanded state
      setExpandedTransfection(prev => {
        const newState = { ...prev };
        delete newState[index];
        return newState;
      });
    }
  };

  // Calculate age in days between two dates
  const calculateDays = (fromDate, toDate) => {
    if (!fromDate || !toDate) return null;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffTime = to - from;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : null;
  };

  return (
    <div className="space-y-4" data-testid="export-panel">
      {/* Recording Info */}
      {(recordingName || drugUsed) && (
        <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 flex-wrap">
              {recordingName && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Recording:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-cyan-800 text-cyan-400">
                    {recordingName}
                  </Badge>
                </div>
              )}
              {drugUsed && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Drug:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-purple-800 text-purple-400">
                    {drugUsed}
                  </Badge>
                </div>
              )}
              {originalFilename && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">ABF File:</span>
                  <Badge variant="outline" className="font-data text-[10px] border-zinc-700 text-zinc-400">
                    {originalFilename}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organoid/Cell Information */}
      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium" style={{ fontFamily: 'Manrope' }}>
            Organoid/Cell Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Recording Date */}
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Recording Date</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={recordingDate || ''}
                  onChange={(e) => setRecordingDate(e.target.value)}
                  className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                />
              </div>
            </div>
          </div>

          {/* Organoid/Cell entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-zinc-400">Sample Information</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={addOrganoidEntry}
                className="h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Sample
              </Button>
            </div>
            {organoidInfo.map((info, idx) => {
              const ageAtRecording = calculateDays(info.birth_date, recordingDate);
              const transfectionDays = info.transfection?.date ? calculateDays(info.transfection.date, recordingDate) : null;
              const hasTransfection = expandedTransfection[idx] || info.transfection?.technique;
              
              return (
                <div key={idx} className="p-3 bg-zinc-900/50 rounded-sm border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">Sample {organoidInfo.length > 1 ? idx + 1 : ''}</span>
                    {organoidInfo.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOrganoidEntry(idx)}
                        className="h-6 w-6 p-0 text-zinc-500 hover:text-red-400"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Organoid/Cell Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Organoid/Cell Type</Label>
                      <Select
                        value={info.cell_type || ''}
                        onValueChange={(value) => handleOrganoidChange(idx, 'cell_type', value)}
                      >
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hSpO">Human Spinal Cord Organoid (hSpO)</SelectItem>
                          <SelectItem value="hCO">Human Cardiac Organoid (hCO)</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {info.cell_type === 'other' && (
                      <div className="space-y-1">
                        <Label className="text-[10px] text-zinc-500">Specify Type</Label>
                        <Input
                          placeholder="e.g., Human iPSC-CM"
                          value={info.other_cell_type || ''}
                          onChange={(e) => handleOrganoidChange(idx, 'other_cell_type', e.target.value)}
                          className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Line Name and Passage Number */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Line Name</Label>
                      <Input
                        placeholder="e.g., CPVT, WT, F11"
                        value={info.line_name || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'line_name', e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Passage #</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="P#"
                        value={info.passage_number || ''}
                        onChange={(e) => handleOrganoidChange(idx, 'passage_number', e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                      />
                    </div>
                  </div>
                  
                  {/* Differentiation Date */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Differentiation Date</Label>
                    <Input
                      type="date"
                      value={info.birth_date || ''}
                      onChange={(e) => handleOrganoidChange(idx, 'birth_date', e.target.value)}
                      className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                    />
                    {ageAtRecording !== null && (
                      <p className="text-[10px] text-cyan-400 font-data">
                        Age at recording: D{ageAtRecording}
                      </p>
                    )}
                  </div>
                  
                  {/* Transfection/Transduction Section */}
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleTransfection(idx)}
                      className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200 w-full justify-between"
                    >
                      <span>Transfection/Transduction <span className="text-zinc-600">(optional)</span></span>
                      {hasTransfection ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </Button>
                    
                    {hasTransfection && (
                      <div className="pl-2 border-l-2 border-zinc-700 space-y-2">
                        {/* Technique */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Technique</Label>
                            <Select
                              value={info.transfection?.technique || ''}
                              onValueChange={(value) => handleTransfectionChange(idx, 'technique', value)}
                            >
                              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8">
                                <SelectValue placeholder="Select technique" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="electroporation">Electroporation</SelectItem>
                                <SelectItem value="lipofection">Lipofection</SelectItem>
                                <SelectItem value="transduction">Transduction</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Other technique input */}
                          {info.transfection?.technique === 'other' && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-zinc-500">Specify Technique</Label>
                              <Input
                                placeholder="Enter technique"
                                value={info.transfection?.other_technique || ''}
                                onChange={(e) => handleTransfectionChange(idx, 'other_technique', e.target.value)}
                                className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                              />
                            </div>
                          )}
                        </div>
                        
                        {/* Name and Amount */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Name</Label>
                            <Input
                              placeholder="e.g., ChR2-GFP"
                              value={info.transfection?.name || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'name', e.target.value)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-zinc-500">Amount (µL)</Label>
                            <Input
                              placeholder="e.g., 5"
                              value={info.transfection?.amount || ''}
                              onChange={(e) => handleTransfectionChange(idx, 'amount', e.target.value)}
                              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                            />
                          </div>
                        </div>
                        
                        {/* Transfection Date */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-zinc-500">Date of Transfection/Transduction</Label>
                          <Input
                            type="date"
                            value={info.transfection?.date || ''}
                            onChange={(e) => handleTransfectionChange(idx, 'date', e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
                          />
                          {transfectionDays !== null && (
                            <p className="text-[10px] text-amber-400 font-data">
                              Days since transfection: {transfectionDays}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Fusion Date - Shared for all samples */}
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Fusion Date <span className="text-zinc-600">(optional - applies to all samples)</span></Label>
            <Input
              type="date"
              value={fusionDate || ''}
              onChange={(e) => setFusionDate(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs h-8 font-data"
            />
            {fusionDate && recordingDate && (
              <p className="text-[10px] text-emerald-400 font-data">
                Days since fusion: {calculateDays(fusionDate, recordingDate)}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-400">Description / Notes</Label>
            <Textarea
              placeholder="Additional notes about the recording..."
              value={recordingDescription || ''}
              onChange={(e) => setRecordingDescription(e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-zinc-200 text-xs font-data min-h-[60px] resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#0c0c0e] border-zinc-800 rounded-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium" style={{ fontFamily: 'Manrope' }}>
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-500">
            Export analysis results including per-beat data, HRV windows, per-minute metrics, and light stimulation data.
          </p>

          {/* Available data summary */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Available Data</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className={`p-2 rounded-sm border ${hasData ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Per-Beat</p>
                <p className={`text-xs font-data ${hasData ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasData ? `${metrics.n_total} beats` : 'No data'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasPerMinute ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Per-Minute</p>
                <p className={`text-xs font-data ${hasPerMinute ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasPerMinute ? `${perMinuteData.length} rows` : 'Not computed'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasHrv ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">HRV Windows</p>
                <p className={`text-xs font-data ${hasHrv ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasHrv ? `${hrvResults.windows.length} windows` : 'Not computed'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hasLight ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Light Metrics</p>
                <p className={`text-xs font-data ${hasLight ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hasLight ? 'Available' : 'Not computed'}
                </p>
              </div>
              <div className={`p-2 rounded-sm border ${hrvResults?.baseline ? 'border-green-800 bg-green-950/20' : 'border-zinc-800 bg-zinc-900/30'}`}>
                <p className="text-[10px] font-data text-zinc-400">Baseline</p>
                <p className={`text-xs font-data ${hrvResults?.baseline ? 'text-green-400' : 'text-zinc-600'}`}>
                  {hrvResults?.baseline ? 'Computed' : 'Not computed'}
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Export format description */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Export Formats</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-300">CSV</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Simple comma-separated format. Per-beat data only. Good for importing into other software.
                </p>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-medium text-zinc-300">Excel (XLSX)</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Multi-sheet workbook with formatted tables. Includes: Summary, Per-Beat, Per-Minute, HRV Windows, Light Metrics.
                </p>
              </div>
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-sm">
                <div className="flex items-center gap-2 mb-2">
                  <FileDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-medium text-zinc-300">PDF Report</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Professional report with graphs. BF chart, NN chart, HRV evolution, summary table. Print-ready.
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Export buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              data-testid="export-csv-btn"
              variant="secondary"
              className="h-10 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 gap-2"
              onClick={onExportCsv}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Export CSV
            </Button>

            <Button
              data-testid="export-xlsx-btn"
              variant="secondary"
              className="h-10 text-xs rounded-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 gap-2"
              onClick={onExportXlsx}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Export XLSX
            </Button>

            <Button
              data-testid="export-pdf-btn"
              className="h-10 text-xs rounded-sm bg-zinc-100 text-zinc-900 hover:bg-zinc-200 gap-2 font-medium"
              onClick={onExportPdf}
              disabled={!hasData || loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Export PDF Report
            </Button>
          </div>

          {/* Summary preview */}
          {metrics && (
            <>
              <Separator className="bg-zinc-800" />
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Summary Preview</p>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-3 font-data text-xs text-zinc-400 space-y-1">
                  {recordingName && (
                    <div className="flex justify-between">
                      <span>Recording Name</span>
                      <span className="text-cyan-400">{recordingName}</span>
                    </div>
                  )}
                  {drugUsed && (
                    <div className="flex justify-between">
                      <span>Drug Used</span>
                      <span className="text-purple-400">{drugUsed}</span>
                    </div>
                  )}
                  <Separator className="bg-zinc-800 my-1" />
                  <div className="flex justify-between">
                    <span>Total Beats</span>
                    <span className="text-zinc-200">{metrics.n_total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kept (after filter)</span>
                    <span className="text-green-400">{metrics.n_kept}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Removed (artifacts)</span>
                    <span className="text-red-400">{metrics.n_removed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Filter Range</span>
                    <span className="text-zinc-300">
                      {metrics.filter_settings?.lower_pct || 50}%-{metrics.filter_settings?.upper_pct || 200}%
                    </span>
                  </div>
                  {hasHrv && hrvResults.readout && (
                    <>
                      <Separator className="bg-zinc-800 my-1" />
                      <p className="text-[9px] text-zinc-500 uppercase">HRV Readout (minute {hrvResults.readout.minute})</p>
                      <div className="flex justify-between">
                        <span>ln(RMSSD₇₀)</span>
                        <span className="text-cyan-400">{hrvResults.readout.ln_rmssd70?.toFixed(3) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>SDNN</span>
                        <span className="text-purple-400">{hrvResults.readout.sdnn?.toFixed(3) ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>pNN50</span>
                        <span className="text-orange-400">{hrvResults.readout.pnn50?.toFixed(1) ?? '—'}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Mean BF</span>
                        <span className="text-zinc-300">{hrvResults.readout.mean_bf?.toFixed(1) ?? '—'} bpm</span>
                      </div>
                    </>
                  )}
                  {hrvResults?.baseline && (
                    <>
                      <Separator className="bg-zinc-800 my-1" />
                      <p className="text-[9px] text-zinc-500 uppercase">Baseline</p>
                      <div className="flex justify-between">
                        <span>Baseline BF ({hrvResults.baseline.baseline_bf_range})</span>
                        <span className="text-zinc-300">{hrvResults.baseline.baseline_bf?.toFixed(1) ?? '—'} bpm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Baseline ln(RMSSD₇₀) ({hrvResults.baseline.baseline_hrv_range})</span>
                        <span className="text-cyan-400">{hrvResults.baseline.baseline_ln_rmssd70?.toFixed(3) ?? '—'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
