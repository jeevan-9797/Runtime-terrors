export const STANDALONE_HTML_SOURCE = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kavach-VoIP: Real-Time Scam Detection</title>
  <!-- Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brandBg: '#101820',
            panelBg: '#19232E',
            borderLine: '#263443',
            accentCyan: '#35B9D0',
            safeGreen: '#36B37E',
            warnAmber: '#E8A23A',
            dangerRed: '#D95765',
            textPrimary: '#F1F5F9',
            textSecondary: '#AAB7C4',
          }
        }
      }
    }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background-color: #101820; color: #F1F5F9; }
    code, pre, .font-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: #101820; }
    ::-webkit-scrollbar-thumb { background: #263443; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: #35B9D0; }
  </style>
</head>
<body class="bg-[#101820] text-[#F1F5F9] min-h-screen flex flex-col antialiased selection:bg-[#35B9D0]/20 selection:text-white">

  <!-- Compact Restrained Header -->
  <header class="border-b border-[#263443] bg-[#101820]/95 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-2.5">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div id="headerIcon" class="w-8 h-8 rounded flex items-center justify-center shrink-0 border bg-[#35B9D0]/10 border-[#35B9D0]/30 text-[#35B9D0] text-sm">
          🛡️
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-base font-bold text-[#F1F5F9] tracking-tight">Kavach-VoIP</span>
            <span class="text-xs text-[#AAB7C4]">·</span>
            <span class="text-xs text-[#AAB7C4] font-medium hidden sm:inline">Voice Scam Detection Platform</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <!-- Backend API Status -->
        <div id="healthBadge" class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]">
          <span id="healthDot" class="w-1.5 h-1.5 rounded-full bg-[#36B37E]"></span>
          <span id="healthText">API: Online</span>
          <button onclick="checkHealth()" class="hover:text-white cursor-pointer ml-1">🔄</button>
        </div>

        <!-- WebSocket Stream Status -->
        <div id="wsBadge" class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#263443] border-[#263443] text-[#AAB7C4]">
          <span id="wsDot" class="w-1.5 h-1.5 rounded-full bg-[#AAB7C4]"></span>
          <span>WS: <span id="wsText" class="uppercase">CONNECTING</span></span>
        </div>

        <!-- Audio Siren Toggle -->
        <button id="soundBtn" onclick="toggleAudio()" class="p-1.5 rounded border border-[#35B9D0]/40 bg-[#19232E] text-[#35B9D0] hover:text-white transition cursor-pointer text-xs" title="Toggle audio cues">
          🔊 Audio
        </button>
      </div>
    </div>
  </header>

  <!-- Critical Alert Banner -->
  <div id="scamBanner" class="hidden bg-[#D95765] text-white px-6 py-3 border-b border-[#c84655] shadow-md">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <span class="px-1.5 py-0.5 bg-black/30 rounded text-[10px] font-mono font-bold uppercase tracking-wider border border-white/20">
          CRITICAL RISK
        </span>
        <p class="text-sm font-bold tracking-tight">
          Suspected Social Engineering & Credential Coercion Detected on Active Channel
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium bg-black/25 px-2.5 py-1 rounded">
          Do not disclose one-time passwords (OTP) or banking credentials
        </span>
        <button onclick="terminateCall()" class="px-3 py-1 bg-[#101820] hover:bg-black text-white text-xs font-bold rounded transition cursor-pointer">
          Terminate Call
        </button>
      </div>
    </div>
  </div>

  <!-- Main Content Workspace -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

      <!-- LEFT: Threat Assessment & Acoustic Spectrum -->
      <div class="lg:col-span-7 space-y-5 flex flex-col justify-between">
        
        <!-- Threat Assessment Card with Temporal Risk Graph -->
        <div id="threatCard" class="bg-[#19232E] border border-[#263443] rounded-lg p-5">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263443]">
            <div class="flex items-center gap-3">
              <div id="threatIconBox" class="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E] text-base">
                🛡️
              </div>
              <div>
                <h2 class="text-sm font-bold text-[#F1F5F9] tracking-tight">
                  Threat Assessment & Risk Trajectory
                </h2>
                <div class="flex items-center gap-1.5 text-xs text-[#AAB7C4] mt-0.5 font-mono">
                  <span>Model: Biometric/NLP v2.4</span>
                  <span aria-hidden="true">·</span>
                  <span>Temporal Trend Graph</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="text-right">
                <span class="text-[10px] text-[#AAB7C4] block uppercase font-mono">Current Index</span>
                <span id="threatScoreNum" class="text-xl font-extrabold font-mono tabular-nums leading-tight text-[#36B37E]">
                  08/100
                </span>
              </div>
              <span id="riskCategoryBadge" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border text-[#36B37E] bg-[#36B37E]/10 border-[#36B37E]/30">
                <span id="riskDot" class="w-1.5 h-1.5 rounded-full bg-[#36B37E]"></span>
                <span id="riskCategoryText">Nominal Risk</span>
              </span>
            </div>
          </div>

          <!-- Threat Score Trajectory Across Call (Previous Graph Restored) -->
          <div class="mt-4">
            <div class="flex items-center justify-between text-xs text-[#AAB7C4] mb-1.5">
              <span class="flex items-center gap-1.5 font-semibold text-[#F1F5F9]">
                <span>📈</span>
                <span>Threat Score Trajectory Across Call</span>
                <span class="w-1.5 h-1.5 rounded-full bg-[#36B37E] animate-pulse"></span>
              </span>
              <div class="flex items-center gap-2 text-[11px] font-mono">
                <span class="hidden sm:inline text-[#AAB7C4]">Peak: <strong id="graphPeakScore" class="text-[#F1F5F9]">08</strong></span>
                <span class="hidden sm:inline text-[#AAB7C4]">Avg: <strong id="graphAvgScore" class="text-[#F1F5F9]">8.0</strong></span>
                <button type="button" onclick="resetGraphHistory()" class="px-1.5 py-0.5 rounded bg-[#101820] hover:bg-[#15202c] text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] transition-colors cursor-pointer text-[10px]" title="Reset graph history">
                  Reset
                </button>
              </div>
            </div>

            <!-- SVG Graph Container -->
            <div class="relative bg-[#101820] border border-[#263443] rounded-lg p-2 overflow-hidden">
              <svg id="threatGraphSvg" viewBox="0 0 640 180" class="w-full h-44 sm:h-52 block select-none">
                <!-- Dynamically populated by renderThreatGraph -->
              </svg>
              <div id="hoverTooltip" class="hidden absolute pointer-events-none bg-[#19232E]/95 border border-[#35B9D0] rounded px-2 py-1 text-[11px] font-mono text-[#F1F5F9] shadow-lg -translate-x-1/2 -translate-y-full">
                <div id="hoverTooltipScore" class="font-bold text-[#35B9D0]">8 Threat Pts</div>
                <div id="hoverTooltipTime" class="text-[9px] text-[#AAB7C4]">10:41:20</div>
              </div>
            </div>

            <!-- Scale Legend -->
            <div class="flex flex-wrap items-center justify-between text-[10px] text-[#AAB7C4] font-mono mt-1.5 px-1">
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1"><span class="w-2 h-0.5 bg-[#D95765]"></span><span>Critical (&ge;75)</span></span>
                <span class="flex items-center gap-1"><span class="w-2 h-0.5 bg-[#E8A23A]"></span><span>Elevated (50–75)</span></span>
                <span class="flex items-center gap-1"><span class="w-2 h-0.5 bg-[#263443]"></span><span>Moderate (25–50)</span></span>
                <span class="flex items-center gap-1"><span class="w-2 h-0.5 bg-[#36B37E]"></span><span>Nominal (&lt;25)</span></span>
              </div>
              <span>Mode: Historical Risk Trajectory</span>
            </div>
          </div>

          <!-- Model Rationale -->
          <div id="rationaleBox" class="mt-4 p-3 rounded border border-[#263443] bg-[#19232E]/70 text-xs text-[#AAB7C4] leading-relaxed">
            <span class="font-semibold text-[#F1F5F9] mr-1.5">Baseline Summary:</span>
            <span id="rationaleText">Zero coercion triggers detected. Conversational rhythm, speech prosody, and biometric acoustics match benign caller baseline tolerances.</span>
          </div>

          <!-- 4 Core Signals -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <div class="p-3 bg-[#101820] border border-[#263443] rounded">
              <span class="text-[11px] text-[#AAB7C4] block">Urgency Pressure</span>
              <span id="sigUrgency" class="text-base font-bold font-mono text-[#F1F5F9] block mt-1">14% (Low)</span>
              <p id="sigUrgencySub" class="text-[10px] text-[#AAB7C4] mt-1 truncate">Normal conversational cadence</p>
            </div>
            <div class="p-3 bg-[#101820] border border-[#263443] rounded">
              <span class="text-[11px] text-[#AAB7C4] block">Synthetic Voice</span>
              <span id="sigSynth" class="text-base font-bold font-mono text-[#F1F5F9] block mt-1">4% Prob</span>
              <p id="sigSynthSub" class="text-[10px] text-[#AAB7C4] mt-1 truncate">Human glottal pulse variation</p>
            </div>
            <div class="p-3 bg-[#101820] border border-[#263443] rounded">
              <span class="text-[11px] text-[#AAB7C4] block">Carrier Reputation</span>
              <span id="sigRep" class="text-base font-bold font-mono text-[#36B37E] block mt-1">High Trust</span>
              <p id="sigRepSub" class="text-[10px] text-[#AAB7C4] mt-1 truncate">Verified carrier gateway</p>
            </div>
            <div class="p-3 bg-[#101820] border border-[#263443] rounded">
              <span class="text-[11px] text-[#AAB7C4] block">Acoustic Stress</span>
              <span id="sigStress" class="text-base font-bold font-mono text-[#F1F5F9] block mt-1">14% Baseline</span>
              <p id="sigStressSub" class="text-[10px] text-[#AAB7C4] mt-1 truncate">Nominal acoustic variance</p>
            </div>
          </div>

          <!-- Flagged Patterns Container -->
          <div id="flaggedContainer" class="hidden mt-4 pt-3 border-t border-[#263443]">
            <span class="text-xs font-semibold text-[#D95765] block mb-2">Flagged Coercion Patterns:</span>
            <div id="flaggedList" class="flex flex-wrap gap-2"></div>
          </div>
        </div>

        <!-- Audio Spectrum Card -->
        <div class="bg-[#19232E] border border-[#263443] rounded-lg p-4">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#263443] text-xs">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-[#F1F5F9]">Audio Spectrum & Acoustic Telemetry</span>
              <span class="text-[#AAB7C4]">·</span>
              <span class="font-mono text-[11px] text-[#AAB7C4]">FFT 48kHz Resolution</span>
            </div>
            <div class="flex items-center gap-2">
              <span id="spectrumDot" class="w-2 h-2 rounded-full bg-[#36B37E]"></span>
              <span id="spectrumStatus" class="font-mono text-[11px] text-[#AAB7C4]">Stream: Live Active</span>
            </div>
          </div>

          <div class="relative rounded overflow-hidden border border-[#263443]">
            <canvas id="waveformCanvas" width="680" height="110" class="w-full h-24 block"></canvas>
          </div>

          <div class="flex justify-between text-[10px] text-[#AAB7C4] font-mono mt-2 px-1">
            <span>100 Hz</span>
            <span>1.2 kHz (Vocal Core)</span>
            <span>3.4 kHz (Formants)</span>
            <span>8.0 kHz</span>
            <span>16.0 kHz</span>
          </div>
        </div>

      </div>

      <!-- RIGHT: Active Call Card & Transcript -->
      <div class="lg:col-span-5 flex flex-col">
        <div class="bg-[#19232E] border border-[#263443] rounded-lg p-5 flex flex-col h-full">
          <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263443]">
            <div class="flex items-center gap-3">
              <div id="callerIcon" class="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border bg-[#35B9D0]/10 border-[#35B9D0]/30 text-[#35B9D0]">
                📞
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-sm font-bold text-[#F1F5F9]">+1 (888) 420-1920</span>
                  <span id="callStateBadge" class="text-[10px] font-mono font-medium px-2 py-0.5 rounded border text-[#36B37E] bg-[#36B37E]/10 border-[#36B37E]/30">
                    ACTIVE CHANNEL
                  </span>
                </div>
                <div class="flex items-center gap-2 text-xs text-[#AAB7C4] mt-0.5">
                  <span>National Bank Fraud Prevention</span>
                  <span aria-hidden="true">·</span>
                  <span class="font-mono">SIP-TLS Relay</span>
                </div>
              </div>
            </div>

            <div class="text-right font-mono">
              <span class="text-[10px] text-[#AAB7C4] block uppercase tracking-wider">Duration</span>
              <span id="callDuration" class="text-lg font-bold tabular-nums text-[#F1F5F9]">00:02:22</span>
            </div>
          </div>

          <!-- Network Specs -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 py-2 px-3 bg-[#101820] border border-[#263443] rounded text-xs">
            <div>
              <span class="text-[10px] text-[#AAB7C4] block">Protocol</span>
              <span class="font-mono text-[11px] text-[#F1F5F9]">SIP/2.0 WSS</span>
            </div>
            <div>
              <span class="text-[10px] text-[#AAB7C4] block">Codec</span>
              <span class="font-mono text-[11px] text-[#F1F5F9]">Opus 48kHz</span>
            </div>
            <div>
              <span class="text-[10px] text-[#AAB7C4] block">Jitter</span>
              <span class="font-mono text-[11px] text-[#36B37E]">1.8 ms</span>
            </div>
            <div>
              <span class="text-[10px] text-[#AAB7C4] block">Loss</span>
              <span class="font-mono text-[11px] text-[#F1F5F9]">0.0%</span>
            </div>
          </div>

          <!-- Transcript Section -->
          <div class="flex-1 flex flex-col min-h-[220px]">
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-[#263443] text-xs">
              <span class="font-semibold text-[#F1F5F9]">Conversational Transcript</span>
              <span id="transcriptPacing" class="font-mono text-[11px] text-[#36B37E]">Normal Pacing</span>
            </div>

            <div id="transcriptFeed" class="flex-1 bg-[#101820] border border-[#263443] rounded p-3 overflow-y-auto space-y-2.5 max-h-[260px] text-xs">
              <div class="p-2.5 rounded border bg-[#19232E]/70 border-[#263443] text-[#AAB7C4]">
                <div class="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span class="font-semibold text-[#35B9D0]">Caller</span>
                  <span class="text-[#AAB7C4] text-[10px]">10:41:02</span>
                </div>
                <p class="leading-relaxed text-xs text-[#F1F5F9]">Hello, this is security officer Miller calling regarding your recent bank card transaction.</p>
              </div>
              <div class="p-2.5 rounded border bg-[#19232E]/70 border-[#263443] text-[#AAB7C4]">
                <div class="flex items-center justify-between text-[11px] font-mono mb-1">
                  <span class="font-semibold text-[#AAB7C4]">Receiver</span>
                  <span class="text-[#AAB7C4] text-[10px]">10:41:09</span>
                </div>
                <p class="leading-relaxed text-xs text-[#F1F5F9]">Which transaction are you referring to? I have not used my card today.</p>
              </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="mt-4 pt-3 border-t border-[#263443] flex flex-wrap items-center justify-between gap-2">
            <button onclick="downloadForensics()" class="px-3 py-1.5 text-xs font-medium bg-[#101820] text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] rounded transition cursor-pointer">
              Download Forensic Report
            </button>
            <button onclick="terminateCall()" class="px-3 py-1.5 text-xs font-medium bg-[#D95765] hover:bg-[#c84655] text-white rounded transition cursor-pointer">
              Terminate Call
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Developer Simulation & Telemetry Controls -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
      <!-- Dev Simulation Card -->
      <div class="lg:col-span-6 bg-[#19232E] border border-[#263443] rounded-lg p-5 space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-[#263443]">
          <div>
            <h3 class="text-sm font-bold text-[#F1F5F9]">Developer Test & Simulation Harness</h3>
            <p class="text-xs text-[#AAB7C4]">Direct WebSocket RPC command dispatcher</p>
          </div>
          <span class="text-[11px] font-mono text-[#AAB7C4] px-2 py-0.5 rounded bg-[#101820] border border-[#263443]">
            [TEST HARNESS]
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onclick="sendSimulateSafe()" class="p-3 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#36B37E]/60 rounded text-left transition cursor-pointer">
            <span class="text-xs font-semibold text-[#36B37E] block">🛡️ SIMULATE_SAFE</span>
            <span class="text-[11px] font-mono text-[#AAB7C4] block mt-1">{"command": "SIMULATE_SAFE"}</span>
          </button>
          <button onclick="sendSimulateScam()" class="p-3 bg-[#101820] hover:bg-[#15202c] border border-[#263443] hover:border-[#D95765]/60 rounded text-left transition cursor-pointer">
            <span class="text-xs font-semibold text-[#D95765] block">🚨 SIMULATE_SCAM</span>
            <span class="text-[11px] font-mono text-[#AAB7C4] block mt-1">{"command": "SIMULATE_SCAM"}</span>
          </button>
        </div>

        <div class="pt-2 border-t border-[#263443] space-y-2">
          <span class="text-xs font-semibold text-[#F1F5F9] block">Custom WebSocket Payload:</span>
          <div class="flex gap-2">
            <textarea id="customJsonInput" class="flex-1 bg-[#101820] border border-[#263443] rounded p-2 text-xs font-mono text-[#F1F5F9] h-16 resize-none focus:outline-none focus:border-[#35B9D0]">{\\n  "command": "TRIGGER_TEST",\\n  "severity": "medium"\\n}</textarea>
            <button onclick="sendCustomJson()" class="px-4 bg-[#35B9D0] hover:bg-[#2fa4b9] text-[#101820] font-bold rounded text-xs transition cursor-pointer">
              Send
            </button>
          </div>
        </div>
      </div>

      <!-- Live Packet Inspector Log -->
      <div class="lg:col-span-6 bg-[#19232E] border border-[#263443] rounded-lg p-5 flex flex-col">
        <div class="flex items-center justify-between pb-3 border-b border-[#263443]">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-[#F1F5F9]">WebSocket Packet Telemetry</span>
            <span class="text-xs font-mono text-[#AAB7C4]">(Live Stream)</span>
          </div>
          <button onclick="clearLogs()" class="text-xs text-[#AAB7C4] hover:text-[#D95765] cursor-pointer">
            Clear Logs
          </button>
        </div>

        <div id="logContainer" class="mt-3 flex-1 bg-[#101820] border border-[#263443] rounded p-3 font-mono text-[11px] overflow-y-auto max-h-56 space-y-1.5">
          <div class="text-[#AAB7C4]/70">[System] Initializing Kavach-VoIP packet stream telemetry...</div>
        </div>
      </div>
    </div>
  </main>

  <!-- Clean Footer -->
  <footer class="border-t border-[#263443] bg-[#101820] px-6 py-3.5 mt-auto">
    <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#AAB7C4]">
      <div class="flex items-center gap-2">
        <span>Kavach-VoIP Security Framework</span>
        <span aria-hidden="true">·</span>
        <span>Real-Time Biometric & Acoustic Telemetry</span>
      </div>
      <div class="flex items-center gap-3 font-mono text-[11px]">
        <span>Relay: kavach-n5na.onrender.com</span>
      </div>
    </div>
  </footer>

  <script>
    const REST_HEALTH_URL = 'https://kavach-n5na.onrender.com/health';
    const WS_URL = 'wss://kavach-n5na.onrender.com/ws/call-stream/demo-session-1';

    let socket = null;
    let audioEnabled = true;
    let currentState = 'safe';

    // Graph Data Points
    // Graph Data Points (Restored Previous Timeline Graph)
    let graphPoints = [
      { time: '-2m 00s', score: 7, isSpike: false },
      { time: '-1m 40s', score: 8, isSpike: false },
      { time: '-1m 20s', score: 8, isSpike: false },
      { time: '-1m 00s', score: 9, isSpike: false },
      { time: '-40s', score: 8, isSpike: false },
      { time: '-20s', score: 8, isSpike: false },
      { time: 'NOW', score: 8, isCurrent: true, isSpike: false }
    ];

    function resetGraphHistory() {
      graphPoints = [
        { time: '-1m 00s', score: 8, isSpike: false },
        { time: '-40s', score: 8, isSpike: false },
        { time: '-20s', score: 8, isSpike: false },
        { time: 'NOW', score: currentState === 'scam' ? 94 : 8, isCurrent: true, isSpike: currentState === 'scam' }
      ];
      renderThreatGraph(currentState === 'scam' ? 94 : 8, currentState === 'scam');
    }

    function renderThreatGraph(currentScore, isSpike) {
      const svg = document.getElementById('threatGraphSvg');
      if (!svg) return;

      const padLeft = 48;
      const padRight = 36;
      const padTop = 22;
      const padBottom = 30;
      const chartW = 640 - padLeft - padRight;
      const chartH = 180 - padTop - padBottom;
      const getY = function(val) {
        return padTop + chartH - (Math.min(100, Math.max(0, val)) / 100) * chartH;
      };

      const scores = graphPoints.map(function(p) { return p.score; });
      const maxScore = Math.max.apply(null, scores);
      const sum = scores.reduce(function(a, b) { return a + b; }, 0);
      const avgScore = (sum / scores.length).toFixed(1);

      const elPeak = document.getElementById('graphPeakScore');
      const elAvg = document.getElementById('graphAvgScore');
      if (elPeak) elPeak.textContent = String(maxScore);
      if (elAvg) elAvg.textContent = String(avgScore);

      const isAlert = currentState === 'scam' || currentScore >= 75;
      const strokeColor = isAlert ? '#D95765' : currentScore >= 50 ? '#E8A23A' : '#36B37E';

      let defs = '<defs><linearGradient id="standaloneAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + (isAlert ? '#D95765' : '#36B37E') + '" stop-opacity="' + (isAlert ? '0.35' : '0.22') + '" />' +
        '<stop offset="100%" stop-color="' + (isAlert ? '#D95765' : '#36B37E') + '" stop-opacity="0.0" />' +
        '</linearGradient></defs>';

      let zones = '<rect x="' + padLeft + '" y="' + getY(100) + '" width="' + chartW + '" height="' + (getY(75) - getY(100)) + '" fill="rgba(217, 87, 101, 0.05)" />' +
        '<rect x="' + padLeft + '" y="' + getY(75) + '" width="' + chartW + '" height="' + (getY(50) - getY(75)) + '" fill="rgba(232, 162, 58, 0.03)" />' +
        '<rect x="' + padLeft + '" y="' + getY(25) + '" width="' + chartW + '" height="' + (getY(0) - getY(25)) + '" fill="rgba(54, 179, 126, 0.03)" />';

      const grids = [
        { val: 100, label: '100', color: '#263443', dash: '' },
        { val: 75, label: '75', color: '#D95765', dash: '4,4' },
        { val: 50, label: '50', color: '#E8A23A', dash: '3,3' },
        { val: 25, label: '25', color: '#263443', dash: '2,2' },
        { val: 0, label: '0', color: '#263443', dash: '' }
      ];

      let gridHtml = '';
      grids.forEach(function(g) {
        const y = getY(g.val);
        gridHtml += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (padLeft + chartW) + '" y2="' + y + '" stroke="' + g.color + '" stroke-width="1" stroke-dasharray="' + g.dash + '" />' +
          '<text x="' + (padLeft - 8) + '" y="' + (y + 3) + '" fill="#627D98" font-size="9" font-family="monospace" text-anchor="end">' + g.label + '</text>';
      });

      const total = graphPoints.length;
      const pts = graphPoints.map(function(pt, idx) {
        const x = total <= 1 ? padLeft + chartW / 2 : padLeft + (idx / (total - 1)) * chartW;
        const y = getY(pt.score);
        return { x: x, y: y, pt: pt };
      });

      let linePathD = '';
      if (pts.length > 0) {
        linePathD = 'M ' + pts[0].x + ' ' + pts[0].y;
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const midX = (prev.x + curr.x) / 2;
          linePathD += ' C ' + midX + ' ' + prev.y + ', ' + midX + ' ' + curr.y + ', ' + curr.x + ' ' + curr.y;
        }
      }

      let areaPathD = '';
      if (pts.length >= 2) {
        areaPathD = linePathD + ' L ' + pts[pts.length - 1].x + ' ' + (padTop + chartH) + ' L ' + pts[0].x + ' ' + (padTop + chartH) + ' Z';
      }

      let pointsHtml = '';
      pts.forEach(function(item) {
        const pt = item.pt;
        const ptColor = pt.score >= 75 ? '#D95765' : pt.score >= 50 ? '#E8A23A' : '#36B37E';

        pointsHtml += '<line x1="' + item.x + '" y1="' + item.y + '" x2="' + item.x + '" y2="' + (padTop + chartH) + '" stroke="' + (pt.isCurrent ? ptColor : '#263443') + '" stroke-width="' + (pt.isCurrent ? '1.5' : '1') + '" stroke-dasharray="' + (pt.isCurrent ? '2,2' : '1,3') + '" opacity="' + (pt.isCurrent ? '0.7' : '0.4') + '" />' +
          '<text x="' + item.x + '" y="' + (padTop + chartH + 16) + '" fill="' + (pt.isCurrent ? '#F1F5F9' : '#627D98') + '" font-size="9" font-family="monospace" font-weight="' + (pt.isCurrent ? 'bold' : 'normal') + '" text-anchor="middle">' + pt.time + '</text>';

        if (pt.isCurrent) {
          pointsHtml += '<circle cx="' + item.x + '" cy="' + item.y + '" r="8" fill="none" stroke="' + ptColor + '" stroke-width="1.5" opacity="0.6" class="animate-ping" />';
        }

        pointsHtml += '<circle cx="' + item.x + '" cy="' + item.y + '" r="' + (pt.isCurrent ? 5 : 3.5) + '" fill="#19232E" stroke="' + ptColor + '" stroke-width="' + (pt.isCurrent ? 2.5 : 2) + '" class="cursor-pointer" />' +
          '<text x="' + item.x + '" y="' + Math.max(padTop + 10, item.y - 8) + '" fill="' + (pt.isCurrent ? '#F1F5F9' : '#AAB7C4') + '" font-size="' + (pt.isCurrent ? '9.5' : '8.5') + '" font-weight="' + (pt.isCurrent ? 'bold' : 'normal') + '" font-family="monospace" text-anchor="middle">' + pt.score + '</text>';

        if (pt.isSpike) {
          const badgeX = Math.min(padLeft + chartW - 55, item.x);
          const badgeY = Math.max(padTop + 14, item.y - 24);
          pointsHtml += '<g transform="translate(' + badgeX + ', ' + badgeY + ')">' +
            '<rect x="-45" y="-10" width="90" height="18" rx="3" fill="#D95765" />' +
            '<text x="0" y="2" fill="#FFFFFF" font-size="8.5" font-weight="bold" font-family="sans-serif" text-anchor="middle">⚠️ ' + (pt.label || 'Spike Flagged') + '</text>' +
            '</g>';
        }
      });

      svg.innerHTML = defs + zones + gridHtml + (areaPathD ? '<path d="' + areaPathD + '" fill="url(#standaloneAreaGrad)" />' : '') + (linePathD ? '<path d="' + linePathD + '" fill="none" stroke="' + strokeColor + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />' : '') + pointsHtml;
    }

    let audioCtx = null;
    function getAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      return audioCtx;
    }

    function playSafeChime() {
      if (!audioEnabled) return;
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.3);
      } catch (e) {}
    }

    function playScamSiren() {
      if (!audioEnabled) return;
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const start = now + i * 0.15;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, start);
          osc.frequency.linearRampToValueAtTime(440, start + 0.1);
          gain.gain.setValueAtTime(0.1, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + 0.15);
        }
      } catch (e) {}
    }

    function toggleAudio() {
      audioEnabled = !audioEnabled;
      document.getElementById('soundBtn').textContent = audioEnabled ? '🔊 Audio' : '🔇 Muted';
    }

    function appendLog(direction, text, isAlert = false) {
      const container = document.getElementById('logContainer');
      const timeStr = new Date().toTimeString().split(' ')[0];
      const div = document.createElement('div');
      div.className = 'flex items-start gap-2 ' + (isAlert ? 'text-[#D95765]' : direction === 'IN' ? 'text-[#35B9D0]' : direction === 'OUT' ? 'text-[#36B37E]' : 'text-[#AAB7C4]');
      div.innerHTML = \\\`<span class="text-[#AAB7C4]/70">\\\${timeStr}</span> <span class="px-1 py-0.2 rounded text-[10px] font-bold \\\${direction === 'IN' ? 'bg-[#35B9D0]/20 text-[#35B9D0]' : direction === 'OUT' ? 'bg-[#36B37E]/20 text-[#36B37E]' : 'bg-[#263443] text-[#AAB7C4]'}">[\\\${direction}]</span> <span class="break-all">\\\${text}</span>\\\`;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function clearLogs() {
      document.getElementById('logContainer').innerHTML = '<div class="text-[#AAB7C4]/70">[System] Telemetry logs cleared.</div>';
    }

    function setSafeMode(score = 8) {
      currentState = 'safe';
      document.getElementById('scamBanner').classList.add('hidden');

      document.getElementById('threatScoreNum').textContent = String(score).padStart(2, '0') + '/100';
      document.getElementById('threatScoreNum').className = 'text-xl font-extrabold font-mono tabular-nums leading-tight text-[#36B37E]';

      document.getElementById('riskCategoryText').textContent = 'Nominal Risk';
      document.getElementById('riskCategoryBadge').className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border text-[#36B37E] bg-[#36B37E]/10 border-[#36B37E]/30';
      document.getElementById('riskDot').className = 'w-1.5 h-1.5 rounded-full bg-[#36B37E]';

      document.getElementById('rationaleText').textContent = 'Zero coercion triggers detected. Conversational rhythm, speech prosody, and biometric acoustics match benign caller baseline tolerances.';
      document.getElementById('flaggedContainer').classList.add('hidden');

      document.getElementById('sigUrgency').textContent = '14% (Low)';
      document.getElementById('sigUrgency').className = 'text-base font-bold font-mono text-[#F1F5F9] block mt-1';
      document.getElementById('sigUrgencySub').textContent = 'Normal conversational cadence';

      document.getElementById('sigSynth').textContent = '4% Prob';
      document.getElementById('sigSynth').className = 'text-base font-bold font-mono text-[#F1F5F9] block mt-1';

      document.getElementById('sigRep').textContent = 'High Trust';
      document.getElementById('sigRep').className = 'text-base font-bold font-mono text-[#36B37E] block mt-1';

      document.getElementById('sigStress').textContent = '14% Baseline';
      document.getElementById('sigStress').className = 'text-base font-bold font-mono text-[#F1F5F9] block mt-1';

      document.getElementById('spectrumDot').className = 'w-2 h-2 rounded-full bg-[#36B37E]';
      document.getElementById('spectrumStatus').textContent = 'Stream: Live Active';

      document.getElementById('callStateBadge').textContent = 'ACTIVE CHANNEL';
      document.getElementById('callStateBadge').className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded border text-[#36B37E] bg-[#36B37E]/10 border-[#36B37E]/30';
      document.getElementById('transcriptPacing').textContent = 'Normal Pacing';
      document.getElementById('transcriptPacing').className = 'font-mono text-[11px] text-[#36B37E]';

      // Update Graph
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      graphPoints.push({ time: nowStr, score: score, isSpike: false, label: 'Baseline Restored' });
      if (graphPoints.length > 8) graphPoints.shift();
      renderThreatGraph(score, false);

      playSafeChime();
      appendLog('SYS', 'Risk assessment state transitioned to: NOMINAL BASELINE (Safe)');
    }

    function setScamMode(score = 94) {
      currentState = 'scam';
      document.getElementById('scamBanner').classList.remove('hidden');

      document.getElementById('threatScoreNum').textContent = String(score) + '/100';
      document.getElementById('threatScoreNum').className = 'text-xl font-extrabold font-mono tabular-nums leading-tight text-[#D95765]';

      document.getElementById('riskCategoryText').textContent = 'Critical Risk';
      document.getElementById('riskCategoryBadge').className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border text-[#D95765] bg-[#D95765]/10 border-[#D95765]/30';
      document.getElementById('riskDot').className = 'w-1.5 h-1.5 rounded-full bg-[#D95765]';

      document.getElementById('rationaleText').textContent = 'CRITICAL ALERT: Caller requesting sensitive credentials under false duress. Model indicates suspected social engineering. Terminate call immediately.';

      document.getElementById('flaggedContainer').classList.remove('hidden');
      document.getElementById('flaggedList').innerHTML = ['Urgent Transfer', 'One-Time Passcode (OTP)', 'Immediate Penalty', 'Account Freeze'].map(k =>
        \\\`<span class="px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#D95765]/10 text-[#F1F5F9] border border-[#D95765]/30 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#D95765]"></span>\\\${k}</span>\\\`
      ).join('');

      document.getElementById('sigUrgency').textContent = 'Critical (89%)';
      document.getElementById('sigUrgency').className = 'text-base font-bold font-mono text-[#D95765] block mt-1';
      document.getElementById('sigUrgencySub').textContent = 'Ultimatum & time-stress coercion';

      document.getElementById('sigSynth').textContent = '82% Prob';
      document.getElementById('sigSynth').className = 'text-base font-bold font-mono text-[#D95765] block mt-1';

      document.getElementById('sigRep').textContent = 'High Risk';
      document.getElementById('sigRep').className = 'text-base font-bold font-mono text-[#D95765] block mt-1';

      document.getElementById('sigStress').textContent = '89% Severe';
      document.getElementById('sigStress').className = 'text-base font-bold font-mono text-[#D95765] block mt-1';

      document.getElementById('spectrumDot').className = 'w-2 h-2 rounded-full bg-[#D95765]';
      document.getElementById('spectrumStatus').textContent = 'Acoustic Anomaly (Flagged)';

      document.getElementById('callStateBadge').textContent = 'SPOOF ANOMALY';
      document.getElementById('callStateBadge').className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded border text-[#D95765] bg-[#D95765]/10 border-[#D95765]/30';
      document.getElementById('transcriptPacing').textContent = 'Coercion Triggered';
      document.getElementById('transcriptPacing').className = 'font-mono text-[11px] text-[#D95765]';

      // Update Graph with Spike
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      graphPoints.push({ time: nowStr, score: score, isSpike: true, label: 'Coercion Anomaly' });
      if (graphPoints.length > 8) graphPoints.shift();
      renderThreatGraph(score, true);

      const feed = document.getElementById('transcriptFeed');
      const div = document.createElement('div');
      div.className = 'p-2.5 rounded border bg-[#D95765]/10 border-[#D95765]/40 text-[#F1F5F9]';
      div.innerHTML = \\\`
        <div class="flex items-center justify-between text-[11px] font-mono mb-1">
          <span class="font-semibold text-[#D95765]">⚠️ Caller (Flagged)</span>
          <span class="text-[#AAB7C4] text-[10px]">\\\${new Date().toTimeString().split(' ')[0]}</span>
        </div>
        <p class="leading-relaxed text-xs text-[#F1F5F9]">We require you to read out the 6-digit SMS OTP code right now to prevent legal arrest and forfeiture of assets.</p>
        <span class="inline-block mt-1.5 text-[10px] font-mono text-[#D95765] font-semibold">[NLP Marker: High Urgency Asset Coercion]</span>
      \\\`;
      feed.appendChild(div);
      feed.scrollTop = feed.scrollHeight;

      playScamSiren();
      appendLog('SYS', \\\`CRITICAL RISK DETECTED: Model identified coercive linguistic patterns (Threat Index: \\\${score})\\\`, true);
    }

    async function checkHealth() {
      const dot = document.getElementById('healthDot');
      const text = document.getElementById('healthText');
      const badge = document.getElementById('healthBadge');
      const start = performance.now();
      try {
        const res = await fetch(REST_HEALTH_URL, { cache: 'no-store' });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#36B37E]/10 border-[#36B37E]/30 text-[#36B37E]';
          dot.className = 'w-1.5 h-1.5 rounded-full bg-[#36B37E]';
          text.textContent = \\\`API: Online (\\\${latency}ms)\\\`;
        } else {
          badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]';
          dot.className = 'w-1.5 h-1.5 rounded-full bg-[#D95765]';
          text.textContent = 'API: Offline';
        }
      } catch (e) {
        badge.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#D95765]/10 border-[#D95765]/30 text-[#D95765]';
        dot.className = 'w-1.5 h-1.5 rounded-full bg-[#D95765]';
        text.textContent = 'API: Offline';
      }
    }

    function connectWebSocket() {
      try {
        appendLog('SYS', \\\`Establishing WebSocket connection: \\\${WS_URL}\\\`);
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
          document.getElementById('wsDot').className = 'w-1.5 h-1.5 rounded-full bg-[#35B9D0]';
          document.getElementById('wsText').textContent = 'CONNECTED';
          document.getElementById('wsBadge').className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#35B9D0]/10 border-[#35B9D0]/30 text-[#35B9D0]';
          appendLog('SYS', 'WebSocket connection established successfully');
        };

        socket.onmessage = (event) => {
          appendLog('IN', event.data);
          try {
            const data = JSON.parse(event.data);
            const str = JSON.stringify(data).toLowerCase();
            if (data.alert || str.includes('scam') || str.includes('threat') || str.includes('fraud')) {
              setScamMode(data.threat_score || 94);
            } else if (str.includes('safe')) {
              setSafeMode(data.threat_score || 8);
            }
          } catch (e) {
            const raw = String(event.data).toLowerCase();
            if (raw.includes('scam')) setScamMode();
            else if (raw.includes('safe')) setSafeMode();
          }
        };

        socket.onerror = (err) => {
          document.getElementById('wsDot').className = 'w-1.5 h-1.5 rounded-full bg-[#E8A23A]';
          document.getElementById('wsText').textContent = 'ERROR';
          appendLog('SYS', 'WebSocket encountered error', true);
        };

        socket.onclose = () => {
          document.getElementById('wsDot').className = 'w-1.5 h-1.5 rounded-full bg-[#AAB7C4]';
          document.getElementById('wsText').textContent = 'DISCONNECTED';
          document.getElementById('wsBadge').className = 'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border bg-[#263443] border-[#263443] text-[#AAB7C4]';
          appendLog('SYS', 'WebSocket disconnected. Auto-retry in 4s...');
          setTimeout(connectWebSocket, 4000);
        };
      } catch (err) {
        appendLog('SYS', \\\`Failed to create WebSocket: \\\${err}\\\`, true);
      }
    }

    function sendSimulateSafe() {
      const payload = { command: 'SIMULATE_SAFE' };
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
        appendLog('OUT', JSON.stringify(payload));
      } else {
        appendLog('OUT', JSON.stringify(payload) + ' (applied locally)');
      }
      setSafeMode(8);
    }

    function sendSimulateScam() {
      const payload = { command: 'SIMULATE_SCAM' };
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
        appendLog('OUT', JSON.stringify(payload));
      } else {
        appendLog('OUT', JSON.stringify(payload) + ' (applied locally)');
      }
      setScamMode(94);
    }

    function sendCustomJson() {
      const text = document.getElementById('customJsonInput').value;
      try {
        const obj = JSON.parse(text);
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(text);
          appendLog('OUT', text);
        } else {
          appendLog('OUT', text + ' (WebSocket offline)');
        }
      } catch (e) {
        alert('Invalid JSON syntax: ' + e.message);
      }
    }

    function terminateCall() {
      setSafeMode(8);
      appendLog('SYS', 'Operator terminated active VoIP call session.');
    }

    function downloadForensics() {
      const data = {
        product: 'Kavach-VoIP Incident Analysis Report',
        exportedAt: new Date().toISOString(),
        threatState: currentState,
        session: 'demo-session-1',
        caller: '+1 (888) 420-1920'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kavach-forensic-report.json';
      a.click();
    }

    // Audio Waveform Canvas Animation
    function initWaveform() {
      const canvas = document.getElementById('waveformCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let step = 0;

      function render() {
        step += 0.04;
        ctx.fillStyle = '#101820';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const centerY = canvas.height / 2;
        ctx.strokeStyle = '#1D2A37';
        ctx.lineWidth = 1;

        [-20, 0, 20].forEach((offset) => {
          const y = centerY + offset;
          ctx.beginPath();
          ctx.moveTo(35, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        });

        const isScam = currentState === 'scam';
        const numBars = 48;
        const startX = 40;
        const availableWidth = canvas.width - startX - 10;
        const barWidth = Math.max(3, (availableWidth / numBars) - 2);

        for (let i = 0; i < numBars; i++) {
          const x = startX + i * (barWidth + 2);
          let amplitude = 0;

          if (isScam) {
            const harmonic = Math.abs(Math.sin(step * 2.5 + i * 0.7));
            const noise = Math.sin(i * 1.3 - step * 3) * 0.3;
            amplitude = Math.max(0.1, harmonic + noise);
          } else {
            const voiceEnvelope = Math.exp(-Math.pow((i - 16) / 10, 2));
            const oscillation = Math.abs(Math.sin(step * 1.5 + i * 0.35));
            amplitude = Math.max(0.06, voiceEnvelope * 0.9 * oscillation + 0.08);
          }

          const barHeight = Math.min(amplitude * (canvas.height * 0.75), canvas.height * 0.82);
          const y = centerY - barHeight / 2;

          ctx.fillStyle = isScam ? (i % 4 === 0 ? '#D95765' : 'rgba(217, 87, 101, 0.7)') : (i % 3 === 0 ? '#35B9D0' : '#2B8DA0');
          ctx.fillRect(x, y, barWidth, barHeight);
        }

        requestAnimationFrame(render);
      }
      render();
    }

    let durationSec = 142;
    setInterval(() => {
      durationSec++;
      const m = Math.floor(durationSec / 60).toString().padStart(2, '0');
      const s = (durationSec % 60).toString().padStart(2, '0');
      const el = document.getElementById('callDuration');
      if (el) el.textContent = \\\`00:\\\${m}:\\\${s}\\\`;
    }, 1000);

    window.addEventListener('DOMContentLoaded', () => {
      checkHealth();
      connectWebSocket();
      initWaveform();
      renderThreatGraph(8, false);
      setInterval(checkHealth, 15000);
    });
  </script>
</body>
</html>
`;
