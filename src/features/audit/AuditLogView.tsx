import React from 'react';
import { AuditEvent } from '../../types';
import { Badge } from '../../components/common/Badge';

interface AuditLogViewProps {
  events: AuditEvent[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ events }) => {
  const getSeverityBadge = (severity: AuditEvent['severity']) => {
    switch (severity) {
      case 'info':
        return <Badge variant="cyan">INFO</Badge>;
      case 'warning':
        return <Badge variant="amber">WARNING</Badge>;
      case 'error':
      case 'critical':
        return <Badge variant="red">CRITICAL</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#1E314F] pb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white font-mono">
            Security Audit Trail
          </h1>
          <Badge variant="cyan">{events.length} EVENTS</Badge>
        </div>
        <p className="text-xs text-slate-400 font-mono mt-1">
          Immutable log of operational events. Stripped of sensitive secrets and tokens.
        </p>
      </div>

      {/* Events Table */}
      <div className="bg-[#111C30] border border-[#1E314F] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0B1220] text-slate-400 border-b border-[#1E314F]">
              <tr>
                <th className="p-3.5">Timestamp (UTC)</th>
                <th className="p-3.5">Event Name</th>
                <th className="p-3.5">Details</th>
                <th className="p-3.5">Actor</th>
                <th className="p-3.5">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E314F]/60">
              {events.map((evt) => (
                <tr key={evt.id} className="hover:bg-[#152238]/50 transition-colors">
                  <td className="p-3.5 text-slate-400 whitespace-nowrap">
                    {new Date(evt.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3.5 font-bold text-white uppercase">{evt.event}</td>
                  <td className="p-3.5 text-slate-300 max-w-md truncate">{evt.detail}</td>
                  <td className="p-3.5 text-slate-400">{evt.actor || 'system'}</td>
                  <td className="p-3.5">{getSeverityBadge(evt.severity)}</td>
                </tr>
              ))}

              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No audit events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
