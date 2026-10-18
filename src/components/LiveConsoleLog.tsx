import React, { useState, useRef, useEffect } from 'react';
import { WsLogEntry } from '../types';
import { Terminal, Trash2, Copy, Check } from 'lucide-react';

interface LiveConsoleLogProps {
  logs: WsLogEntry[];
  onClearLogs: () => void;
}

export const LiveConsoleLog: React.FC<LiveConsoleLogProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ALERT'>('ALL');
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'IN') return log.direction === 'IN';
    if (filter === 'OUT') return log.direction === 'OUT';
    if (filter === 'ALERT') return log.isAlert;
    return true;
  });

  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.direction}] ${l.raw}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#19232E] border border-[#263443] rounded-lg p-5 flex flex-col h-full">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#263443]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#35B9D0]" />
          <h3 className="text-sm font-bold text-[#F1F5F9]">WebSocket Packet Telemetry</h3>
          <span className="text-xs font-mono text-[#AAB7C4]">({filteredLogs.length} events)</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            className="px-2.5 py-1 text-xs font-medium text-[#AAB7C4] hover:text-[#F1F5F9] bg-[#101820] border border-[#263443] rounded transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Copy logs to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#36B37E]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="p-1 text-[#AAB7C4] hover:text-[#D95765] bg-[#101820] border border-[#263443] rounded transition cursor-pointer"
            title="Clear all logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 my-3 text-xs">
        {(['ALL', 'IN', 'OUT', 'ALERT'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
              filter === mode
                ? 'bg-[#35B9D0]/10 text-[#35B9D0] border border-[#35B9D0]/40 font-bold'
                : 'text-[#AAB7C4] hover:text-[#F1F5F9] bg-[#101820] border border-[#263443]'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Monospace Stream Container */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-[#101820] border border-[#263443] rounded p-3 font-mono text-[11px] overflow-y-auto max-h-[280px] min-h-[180px] space-y-1.5"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-[#AAB7C4]/60 text-xs">
            No telemetry frames recorded for this filter.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isAlert = log.isAlert;
            const isIncoming = log.direction === 'IN';
            const isOutgoing = log.direction === 'OUT';

            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 p-1 rounded transition-colors ${
                  isAlert
                    ? 'bg-[#D95765]/10 text-[#D95765]'
                    : 'hover:bg-[#19232E]/60 text-[#F1F5F9]'
                }`}
              >
                <span className="text-[#AAB7C4] text-[10px] select-none shrink-0">
                  {log.timestamp}
                </span>

                <span
                  className={`px-1 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                    isAlert
                      ? 'bg-[#D95765] text-white'
                      : isIncoming
                      ? 'bg-[#35B9D0]/20 text-[#35B9D0]'
                      : isOutgoing
                      ? 'bg-[#36B37E]/20 text-[#36B37E]'
                      : 'bg-[#263443] text-[#AAB7C4]'
                  }`}
                >
                  {log.direction}
                </span>

                <span className="break-all select-text font-mono text-[11px] leading-tight">
                  {log.raw}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
