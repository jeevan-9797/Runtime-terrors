import React, { useState } from 'react';
import {
  Play,
  ShieldAlert,
  ShieldCheck,
  Send,
  Settings,
  RefreshCw,
  Radio,
  Server,
  Zap,
  PhoneCall,
  Volume2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  ConnectionStatus,
  DemoScenarioType,
  WsScenarioCommand,
  ScenarioLifecycleStatus,
} from '../types';

interface DevSimulationPanelProps {
  onSendCommand: (commandObj: Record<string, unknown>) => void;
  connectionStatus: ConnectionStatus;
  wsUrl: string;
  onUpdateWsUrl: (url: string) => void;
  onReconnect: () => void;
  onSimulateOffline: (type: 'safe' | 'scam') => void;
  sessionId?: string;
  onTriggerRestScenario?: (scenario: DemoScenarioType) => Promise<void>;
  isTriggeringScenario?: boolean;
  scenarioStatuses?: Record<DemoScenarioType, ScenarioLifecycleStatus>;
  activeScenarioChunkCount?: number;
}

export const DevSimulationPanel: React.FC<DevSimulationPanelProps> = ({
  onSendCommand,
  connectionStatus,
  wsUrl,
  onUpdateWsUrl,
  onReconnect,
  onSimulateOffline,
  sessionId = 'demo-session-1',
  onTriggerRestScenario,
  isTriggeringScenario = false,
  scenarioStatuses,
  activeScenarioChunkCount = 0,
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState(wsUrl);
  const [customJson, setCustomJson] = useState('{\n  "command": "TRIGGER_TEST",\n  "severity": "medium"\n}');
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [activeScenarioTriggering, setActiveScenarioTriggering] = useState<DemoScenarioType | null>(null);
  const [activeWsCommandSending, setActiveWsCommandSending] = useState<WsScenarioCommand | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // REST Scenario Trigger Handler (POST /api/demo/trigger-scenario)
  const handleRestScenario = async (scenario: DemoScenarioType) => {
    if (activeScenarioTriggering || isTriggeringScenario) return;
    setActiveScenarioTriggering(scenario);
    setFeedback(null);

    try {
      if (onTriggerRestScenario) {
        await onTriggerRestScenario(scenario);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to trigger REST scenario',
      });
    } finally {
      setActiveScenarioTriggering(null);
    }
  };

  // WebSocket In-Stream Command Handler ({"command": "..."})
  const handleWsCommand = (cmd: WsScenarioCommand) => {
    if (activeWsCommandSending) return;
    if (connectionStatus !== 'connected') {
      setFeedback({
        type: 'error',
        message: `Cannot send WebSocket command "${cmd}": WebSocket is currently ${connectionStatus}.`,
      });
      return;
    }

    setActiveWsCommandSending(cmd);
    setFeedback(null);

    try {
      const payload = { command: cmd };
      setLastSent(JSON.stringify(payload));
      onSendCommand(payload);
      setFeedback({
        type: 'success',
        message: `Sent WebSocket command: {"command": "${cmd}"}`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send WS command',
      });
    } finally {
      setTimeout(() => setActiveWsCommandSending(null), 600);
    }
  };

  const handleSafeModeFallback = () => {
    const cmd = { command: 'SIMULATE_SAFE' };
    setLastSent(JSON.stringify(cmd));
    onSendCommand(cmd);
    if (connectionStatus !== 'connected') {
      onSimulateOffline('safe');
    }
  };

  const handleScamModeFallback = () => {
    const cmd = { command: 'SIMULATE_SCAM' };
    setLastSent(JSON.stringify(cmd));
    onSendCommand(cmd);
    if (connectionStatus !== 'connected') {
      onSimulateOffline('scam');
    }
  };

  const handleSendCustom = () => {
    try {
      const parsed = JSON.parse(customJson);
      setLastSent(JSON.stringify(parsed));
      onSendCommand(parsed);
      setFeedback({
        type: 'success',
        message: `Dispatched custom JSON payload to WebSocket.`,
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Invalid JSON formatted in custom command field.',
      });
    }
  };

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateWsUrl(tempUrl);
    setShowConfig(false);
  };

  const getStatusBadge = (sc: DemoScenarioType) => {
    const st = scenarioStatuses?.[sc] || 'idle';
    if (activeScenarioTriggering === sc || st === 'starting') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-[#E8A23A] font-mono">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Starting...</span>
        </span>
      );
    }
    if (st === 'running') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-[#36B37E] font-mono font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#36B37E] animate-pulse" />
          <span>Live {activeScenarioChunkCount > 0 ? `(#${activeScenarioChunkCount})` : 'Active'}</span>
        </span>
      );
    }
    if (st === 'failed') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-[#D95765] font-mono">
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
        </span>
      );
    }
    if (st === 'completed') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-[#AAB7C4] font-mono">
          <CheckCircle2 className="w-3 h-3 text-[#36B37E]" />
          <span>Completed</span>
        </span>
      );
    }
    return <Play className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />;
  };

  return (
    <div className="bg-[#19232E] border border-[#263443] rounded-lg p-5 space-y-5">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#263443]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#101820] border border-[#263443] flex items-center justify-center text-[#35B9D0]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F1F5F9]">Developer Test & Simulation Harness</h3>
            <p className="text-xs text-[#AAB7C4]">Live REST scenarios & WebSocket RPC command dispatcher</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
              connectionStatus === 'connected'
                ? 'bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]'
                : connectionStatus === 'connecting'
                ? 'bg-[#E8A23A]/10 border-[#E8A23A]/30 text-[#E8A23A]'
                : 'bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]'
            }`}
          >
            WS: {connectionStatus.toUpperCase()}
          </span>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1.5 rounded bg-[#101820] border border-[#263443] hover:text-[#35B9D0] text-[#AAB7C4] transition-colors cursor-pointer"
            title="Configure WebSocket Endpoint"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Endpoint Configuration Drawer */}
      {showConfig && (
        <form onSubmit={handleSaveUrl} className="p-3 bg-[#101820] border border-[#263443] rounded space-y-2 text-xs">
          <label className="block font-mono text-[#AAB7C4]">WebSocket Stream Endpoint URL:</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              className="flex-1 bg-[#19232E] border border-[#263443] rounded px-2.5 py-1.5 font-mono text-xs text-[#F1F5F9] focus:outline-none focus:border-[#35B9D0]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#35B9D0] hover:bg-[#2fa4b9] text-[#101820] font-semibold rounded text-xs transition cursor-pointer"
            >
              Update
            </button>
            <button
              type="button"
              onClick={onReconnect}
              className="px-2.5 py-1.5 bg-[#19232E] border border-[#263443] hover:text-[#F1F5F9] text-[#AAB7C4] rounded transition flex items-center gap-1 cursor-pointer"
              title="Reconnect"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-2.5 rounded text-xs border flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]'
              : 'bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[10px] underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Section 1: REST Demo Scenarios (POST /api/demo/trigger-scenario) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#F1F5F9]">
            <Server className="w-3.5 h-3.5 text-[#35B9D0]" />
            <span>Backend Demo Scenarios (REST POST)</span>
          </div>
          <span className="font-mono text-[11px] text-[#AAB7C4]">Target: {sessionId}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* REAL_WAV_CBI */}
          <button
            disabled={activeScenarioTriggering !== null || isTriggeringScenario}
            onClick={() => handleRestScenario('REAL_WAV_CBI')}
            className={`p-2.5 bg-[#101820] hover:bg-[#15202c] border rounded text-left transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed ${
              scenarioStatuses?.REAL_WAV_CBI === 'running'
                ? 'border-[#D95765] shadow-[0_0_12px_rgba(217,87,101,0.25)]'
                : 'border-[#263443] hover:border-[#D95765]/60'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#D95765]">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" />
                <span>REAL_WAV_CBI</span>
              </span>
              {getStatusBadge('REAL_WAV_CBI')}
            </div>
            <p className="text-[10px] font-mono text-[#AAB7C4] mt-1">Real CBI Officer audio stream</p>
          </button>

          {/* ELEVENLABS_DIGITAL_ARREST */}
          <button
            disabled={activeScenarioTriggering !== null || isTriggeringScenario}
            onClick={() => handleRestScenario('ELEVENLABS_DIGITAL_ARREST')}
            className={`p-2.5 bg-[#101820] hover:bg-[#15202c] border rounded text-left transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed ${
              scenarioStatuses?.ELEVENLABS_DIGITAL_ARREST === 'running'
                ? 'border-[#D95765] shadow-[0_0_12px_rgba(217,87,101,0.25)]'
                : 'border-[#263443] hover:border-[#D95765]/60'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#D95765]">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>ELEVENLABS_DIGITAL_ARREST</span>
              </span>
              {getStatusBadge('ELEVENLABS_DIGITAL_ARREST')}
            </div>
            <p className="text-[10px] font-mono text-[#AAB7C4] mt-1">Synthetic voice coercive arrest scam</p>
          </button>

          {/* FAMILY_EMERGENCY_CLONE */}
          <button
            disabled={activeScenarioTriggering !== null || isTriggeringScenario}
            onClick={() => handleRestScenario('FAMILY_EMERGENCY_CLONE')}
            className={`p-2.5 bg-[#101820] hover:bg-[#15202c] border rounded text-left transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed ${
              scenarioStatuses?.FAMILY_EMERGENCY_CLONE === 'running'
                ? 'border-[#E8A23A] shadow-[0_0_12px_rgba(232,162,58,0.25)]'
                : 'border-[#263443] hover:border-[#E8A23A]/60'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#E8A23A]">
              <span className="flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5" />
                <span>FAMILY_EMERGENCY_CLONE</span>
              </span>
              {getStatusBadge('FAMILY_EMERGENCY_CLONE')}
            </div>
            <p className="text-[10px] font-mono text-[#AAB7C4] mt-1">Deepfake voice bail emergency</p>
          </button>

          {/* NORMAL_CALL */}
          <button
            disabled={activeScenarioTriggering !== null || isTriggeringScenario}
            onClick={() => handleRestScenario('NORMAL_CALL')}
            className={`p-2.5 bg-[#101820] hover:bg-[#15202c] border rounded text-left transition-colors cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed ${
              scenarioStatuses?.NORMAL_CALL === 'running'
                ? 'border-[#36B37E] shadow-[0_0_12px_rgba(54,179,126,0.25)]'
                : 'border-[#263443] hover:border-[#36B37E]/60'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#36B37E]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>NORMAL_CALL</span>
              </span>
              {getStatusBadge('NORMAL_CALL')}
            </div>
            <p className="text-[10px] font-mono text-[#AAB7C4] mt-1">Legitimate conversation baseline</p>
          </button>
        </div>
      </div>

      {/* Section 2: WebSocket Scenario Commands (In-Stream Commands) */}
      <div className="space-y-2 pt-2 border-t border-[#263443]">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#F1F5F9]">
            <Zap className="w-3.5 h-3.5 text-[#35B9D0]" />
            <span>WebSocket In-Stream Scenario Commands</span>
          </div>
          <span className="text-[10px] text-[#AAB7C4]">Direct JSON frames</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            disabled={activeWsCommandSending !== null || connectionStatus !== 'connected'}
            onClick={() => handleWsCommand('PLAY_REAL_WAV')}
            className="p-2 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#35B9D0] disabled:opacity-40 disabled:cursor-not-allowed rounded text-center transition-colors cursor-pointer text-xs"
            title='{"command": "PLAY_REAL_WAV"}'
          >
            <span className="block font-mono text-[10px] text-[#35B9D0]">PLAY_REAL_WAV</span>
          </button>

          <button
            disabled={activeWsCommandSending !== null || connectionStatus !== 'connected'}
            onClick={() => handleWsCommand('SCENARIO_DIGITAL_ARREST')}
            className="p-2 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#D95765] disabled:opacity-40 disabled:cursor-not-allowed rounded text-center transition-colors cursor-pointer text-xs"
            title='{"command": "SCENARIO_DIGITAL_ARREST"}'
          >
            <span className="block font-mono text-[10px] text-[#D95765]">DIGITAL_ARREST</span>
          </button>

          <button
            disabled={activeWsCommandSending !== null || connectionStatus !== 'connected'}
            onClick={() => handleWsCommand('SCENARIO_FAMILY_CLONE')}
            className="p-2 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#E8A23A] disabled:opacity-40 disabled:cursor-not-allowed rounded text-center transition-colors cursor-pointer text-xs"
            title='{"command": "SCENARIO_FAMILY_CLONE"}'
          >
            <span className="block font-mono text-[10px] text-[#E8A23A]">FAMILY_CLONE</span>
          </button>

          <button
            disabled={activeWsCommandSending !== null || connectionStatus !== 'connected'}
            onClick={() => handleWsCommand('SCENARIO_NORMAL')}
            className="p-2 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#36B37E] disabled:opacity-40 disabled:cursor-not-allowed rounded text-center transition-colors cursor-pointer text-xs"
            title='{"command": "SCENARIO_NORMAL"}'
          >
            <span className="block font-mono text-[10px] text-[#36B37E]">SCENARIO_NORMAL</span>
          </button>
        </div>
      </div>

      {/* Section 3: Client-Only Offline Fallback Controls */}
      <div className="pt-2 border-t border-[#263443] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#AAB7C4]">Local UI Fallback Simulator (Offline Testing)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSafeModeFallback}
            className="px-2.5 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] text-xs text-[#36B37E] rounded transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Local Safe Baseline</span>
          </button>
          <button
            onClick={handleScamModeFallback}
            className="px-2.5 py-1.5 bg-[#101820] hover:bg-[#15202c] border border-[#263443] text-xs text-[#D95765] rounded transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Local Scam Alert</span>
          </button>
        </div>
      </div>

      {/* Custom JSON Payload Dispatcher */}
      <div className="pt-2 border-t border-[#263443] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#F1F5F9]">Custom Payload Dispatcher</span>
          {lastSent && (
            <span className="text-[10px] font-mono text-[#AAB7C4] truncate max-w-[200px]">
              Sent: {lastSent}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <textarea
            value={customJson}
            onChange={(e) => setCustomJson(e.target.value)}
            className="flex-1 bg-[#101820] border border-[#263443] rounded p-2 text-xs font-mono text-[#F1F5F9] h-16 resize-none focus:outline-none focus:border-[#35B9D0]"
            placeholder='{"command": "CUSTOM"}'
          />
          <button
            onClick={handleSendCustom}
            className="px-3.5 bg-[#35B9D0] hover:bg-[#2fa4b9] text-[#101820] font-bold rounded text-xs transition flex flex-col items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
