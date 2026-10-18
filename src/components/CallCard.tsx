import React, { useState, useEffect, useRef } from 'react';
import { CallSession, TranscriptSnippet, SecurityState } from '../types';
import { Phone, PhoneOff, Mic, MicOff, Download, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';

interface CallCardProps {
  session: CallSession;
  transcript: TranscriptSnippet[];
  securityState: SecurityState;
  onEndCall: () => void;
  onExportForensics: () => void;
  isStreamConnected?: boolean;
  isQuarantined?: boolean;
  isTerminating?: boolean;
  micStatus?: 'inactive' | 'requesting' | 'streaming' | 'muted' | 'denied' | 'error';
  micAudioLevel?: number;
  onToggleMicStream?: () => void;
  micErrorMessage?: string | null;
}

export const CallCard: React.FC<CallCardProps> = ({
  session,
  transcript,
  securityState,
  onEndCall,
  onExportForensics,
  isStreamConnected = true,
  isQuarantined = false,
  isTerminating = false,
  micStatus = 'inactive',
  micAudioLevel = 0,
  onToggleMicStream,
  micErrorMessage,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [seconds, setSeconds] = useState(session?.durationSeconds ?? 0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Active call duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll transcript when new dialogue arrives
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  const formatDuration = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hrs = Math.floor(mins / 60);
    return `${hrs > 0 ? `${hrs.toString().padStart(2, '0')}:` : ''}${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isAlert = securityState === 'scam';

  return (
    <div className="bg-[#19232E] border border-[#263443] rounded-lg p-5 flex flex-col h-full">
      {/* Session Metadata Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263443]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: isAlert ? 'rgba(217, 87, 101, 0.12)' : 'rgba(53, 185, 208, 0.12)',
              borderColor: isAlert ? 'rgba(217, 87, 101, 0.3)' : 'rgba(53, 185, 208, 0.3)',
              color: isAlert ? '#D95765' : '#35B9D0',
            }}
          >
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-[#F1F5F9] tracking-tight">
                {session?.callerNumber || '+91-98765-43210'}
              </span>
              <span
                className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border"
                style={{
                  color: isQuarantined ? '#D95765' : isAlert ? '#D95765' : '#36B37E',
                  backgroundColor: isQuarantined
                    ? 'rgba(217, 87, 101, 0.2)'
                    : isAlert
                    ? 'rgba(217, 87, 101, 0.1)'
                    : 'rgba(54, 179, 126, 0.1)',
                  borderColor: isQuarantined ? 'rgba(217, 87, 101, 0.6)' : isAlert ? 'rgba(217, 87, 101, 0.3)' : 'rgba(54, 179, 126, 0.3)',
                }}
              >
                {isQuarantined ? 'QUARANTINED (DROP)' : isAlert ? 'SPOOF ANOMALY' : 'ACTIVE CHANNEL'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#AAB7C4] mt-0.5">
              <span>{session?.callerName || 'Unknown Caller'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{session?.gateway || 'SIP Gateway'}</span>
            </div>
          </div>
        </div>

        {/* Live Call Duration */}
        <div className="text-right font-mono">
          <span className="text-[10px] text-[#AAB7C4] block uppercase tracking-wider">Duration</span>
          <span className="text-lg font-bold tabular-nums text-[#F1F5F9]">
            {formatDuration(seconds)}
          </span>
        </div>
      </div>

      {/* Network & Protocol Technical Specifications */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 py-2 px-3 bg-[#101820] border border-[#263443] rounded text-xs">
        <div>
          <span className="text-[10px] text-[#AAB7C4] block">Protocol</span>
          <span className="font-mono text-[11px] text-[#F1F5F9] font-medium">{session.protocol}</span>
        </div>
        <div>
          <span className="text-[10px] text-[#AAB7C4] block">Codec</span>
          <span className="font-mono text-[11px] text-[#F1F5F9] font-medium">{session.codec}</span>
        </div>
        <div>
          <span className="text-[10px] text-[#AAB7C4] block">Jitter</span>
          <span className="font-mono text-[11px] text-[#36B37E] font-medium">{session.jitterMs} ms</span>
        </div>
        <div>
          <span className="text-[10px] text-[#AAB7C4] block">Packet Loss</span>
          <span className="font-mono text-[11px] text-[#F1F5F9] font-medium">{session.packetLossPercent}%</span>
        </div>
      </div>

      {/* Live AI Transcript Section */}
      <div className="flex-1 flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#263443] text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#F1F5F9]">Conversational Transcript</span>
            <span className="text-[#AAB7C4]">·</span>
            <span className="font-mono text-[11px] text-[#AAB7C4]">
              {transcript.length} dialogue turns
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-[#AAB7C4] font-mono">
            {isAlert ? (
              <span className="text-[#D95765] flex items-center gap-1 font-semibold">
                <AlertCircle className="w-3 h-3" />
                Coercion Triggered
              </span>
            ) : (
              <span className="text-[#36B37E] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Normal Pacing
              </span>
            )}
          </div>
        </div>

        {/* Scrollable Dialogue Container */}
        <div className="flex-1 bg-[#101820] border border-[#263443] rounded p-3 overflow-y-auto space-y-2.5 max-h-[260px] text-xs">
          {(transcript || []).map((item, idx) => {
            const flagged = item.isFlagged || item.flagged;
            return (
              <div
                key={item.id ? `${item.id}-${idx}` : `tr-${idx}`}
                className={`p-2.5 rounded border transition-colors ${
                  flagged
                    ? 'bg-[#D95765]/10 border-[#D95765]/40 text-[#F1F5F9]'
                    : 'bg-[#19232E]/70 border-[#263443] text-[#AAB7C4]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span
                    className={`font-semibold ${
                      flagged
                        ? 'text-[#D95765] flex items-center gap-1'
                        : item.speaker === 'Caller'
                        ? 'text-[#35B9D0]'
                        : 'text-[#AAB7C4]'
                    }`}
                  >
                    {flagged ? '⚠️ Caller (Flagged)' : item.speaker}
                  </span>
                  <span className="text-[#AAB7C4] text-[10px]">{item.timestamp}</span>
                </div>
                <p className={`leading-relaxed text-xs ${flagged ? 'text-[#F1F5F9] font-medium' : 'text-[#F1F5F9]'}`}>
                  {item.text}
                </p>
                {flagged && (
                  <span className="inline-block mt-1.5 text-[10px] font-mono text-[#D95765] font-semibold">
                    [NLP Marker: High Urgency Asset Coercion]
                  </span>
                )}
              </div>
            );
          })}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Call Workspace Actions */}
      <div className="mt-4 pt-3 border-t border-[#263443] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Mic Streaming Toggle */}
          {onToggleMicStream && (
            <button
              onClick={onToggleMicStream}
              disabled={isQuarantined}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-1.5 cursor-pointer ${
                micStatus === 'streaming'
                  ? 'bg-[#35B9D0]/15 text-[#35B9D0] border-[#35B9D0]/50 shadow-sm'
                  : micStatus === 'requesting'
                  ? 'bg-[#E8A23A]/10 text-[#E8A23A] border-[#E8A23A]/40'
                  : micStatus === 'denied' || micStatus === 'error'
                  ? 'bg-[#D95765]/10 text-[#D95765] border-[#D95765]/40'
                  : 'bg-[#101820] text-[#AAB7C4] border-[#263443] hover:text-[#F1F5F9] hover:border-[#35B9D0]'
              }`}
              title={
                micStatus === 'streaming'
                  ? 'Live 16 kHz 16-bit mono PCM is streaming to WebSocket'
                  : micErrorMessage || 'Stream raw 16 kHz PCM audio from your microphone to Kavach'
              }
            >
              {micStatus === 'streaming' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#35B9D0] animate-pulse" />
                  <Mic className="w-3.5 h-3.5 text-[#35B9D0]" />
                  <span>Streaming Mic (16kHz PCM)</span>
                  {micAudioLevel > 0 && (
                    <span className="text-[10px] font-mono opacity-80">{micAudioLevel}%</span>
                  )}
                </>
              ) : micStatus === 'requesting' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Requesting Mic...</span>
                </>
              ) : micStatus === 'denied' ? (
                <>
                  <MicOff className="w-3.5 h-3.5 text-[#D95765]" />
                  <span>Mic Denied</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Live Mic</span>
                </>
              )}
            </button>
          )}

          {/* Forensics Download */}
          <button
            onClick={onExportForensics}
            className="px-3 py-1.5 text-xs font-medium bg-[#101820] text-[#AAB7C4] border border-[#263443] hover:text-[#F1F5F9] hover:border-[#35B9D0] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Forensic Log</span>
          </button>
        </div>

        {/* Drop Call & Quarantine Caller Action */}
        <button
          disabled={isQuarantined || isTerminating}
          onClick={onEndCall}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm ${
            isQuarantined
              ? 'bg-[#101820] text-[#AAB7C4] border border-[#263443] opacity-60 cursor-not-allowed'
              : isTerminating
              ? 'bg-[#D95765]/80 text-white cursor-wait'
              : 'bg-[#D95765] hover:bg-[#c84655] text-white'
          }`}
        >
          <PhoneOff className="w-3.5 h-3.5" />
          <span>
            {isQuarantined
              ? 'Caller Quarantined'
              : isTerminating
              ? 'Quarantining Caller...'
              : 'Drop Call & Quarantine Caller'}
          </span>
        </button>
      </div>
    </div>
  );
};
