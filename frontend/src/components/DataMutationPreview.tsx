import React, { useState } from 'react';
import { AlertTriangle, Check, ArrowRight, Table2, Trash2, Wand2 } from 'lucide-react';
import { useDataStore } from '../stores/useDataStore';
import type { MutationPreview } from '../lib/api';

interface DataMutationPreviewProps {
  preview: MutationPreview;
}

export const DataMutationPreview: React.FC<DataMutationPreviewProps> = ({ preview }) => {
  const applyMutation = useDataStore((state) => state.applyMutation);
  const [status, setStatus] = useState<'pending' | 'applying' | 'applied' | 'rejected' | 'error'>('pending');

  const handleApply = async () => {
    setStatus('applying');
    const success = await applyMutation(preview.preview_id);
    if (success) {
      setStatus('applied');
    } else {
      setStatus('error');
    }
  };

  const handleReject = () => {
    setStatus('rejected');
  };

  if (status === 'rejected') {
    return null;
  }

  const getActionIcon = () => {
    const action = preview.action.toLowerCase();
    if (action.includes('remove') || action.includes('delete') || action.includes('drop')) {
      return <Trash2 className="w-4 h-4 text-dm-coral" />;
    }
    if (action.includes('clean') || action.includes('fill') || action.includes('impute')) {
      return <Wand2 className="w-4 h-4 text-dm-teal" />;
    }
    return <Table2 className="w-4 h-4 text-dm-violet" />;
  };

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-border/40 bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-background rounded-lg border border-border/50 shadow-sm">
              {getActionIcon()}
            </div>
            <h3 className="font-display font-semibold text-foreground">{preview.action}</h3>
          </div>
          {status === 'applied' && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-md">
              <Check className="w-3.5 h-3.5" />
              Applied
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{preview.description}</p>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs mb-1">Rows Affected</span>
            <span className="font-medium text-foreground">{preview.rows_affected.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground text-xs mb-1">Before</span>
              <span className="font-medium text-foreground">{preview.rows_before.toLocaleString()}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground mt-4" />
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs mb-1">After</span>
              <span className="font-medium text-foreground">{preview.rows_after.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {preview.sample_before.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sample Changes</span>
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {preview.columns_affected.map((col) => (
                      <th key={col} className="px-3 py-2 font-medium whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {preview.sample_before.slice(0, 2).map((row, i) => (
                    <React.Fragment key={i}>
                      <tr className="bg-dm-coral/5">
                        {preview.columns_affected.map((col) => (
                          <td key={`before-${col}`} className="px-3 py-2 text-muted-foreground line-through decoration-dm-coral/40">
                            {String(row[col] ?? 'null')}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-dm-teal/5">
                        {preview.columns_affected.map((col) => (
                          <td key={`after-${col}`} className="px-3 py-2 text-foreground font-medium">
                            {String(preview.sample_after[i]?.[col] ?? 'null')}
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-sm text-dm-coral bg-dm-coral/10 p-3 rounded-lg">
            <AlertTriangle className="w-4 h-4" />
            Failed to apply changes. Please try again.
          </div>
        )}

        {status === 'pending' && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleApply}
              className="flex-1 bg-gradient-to-r from-dm-teal to-dm-violet text-white font-medium py-2 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
            >
              Apply Changes
            </button>
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
            >
              Reject
            </button>
          </div>
        )}

        {status === 'applying' && (
          <div className="flex items-center justify-center py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-dm-teal"></div>
            <span className="ml-2 text-sm text-muted-foreground">Applying changes...</span>
          </div>
        )}
      </div>
    </div>
  );
};
