import React, { useState, useEffect } from 'react';
import { SecurityState } from '../types';
import { Mic, MicOff, Volume2, VolumeX, Grid, PhoneOff } from 'lucide-react';

interface ConsumerPhoneScreenerProps {
  securityState: SecurityState;
  onEndCall: () => void;
  callerNumber?: string;
  callerTag?: string;
}

export const ConsumerPhoneScreener: React.FC<ConsumerPhoneScreenerProps> = ({
  securityState,
  onEndCall,
  callerNumber = '+91 98765-XXXXX',
  callerTag = '(Unknown Number)',
}) => {
  const isScam = securityState === 'scam';
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(102);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSecs: number) => {
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="flex flex-col items-center w-full">
      {/* Phone Screener Header Label */}
      <div className="flex items-center gap-2 mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
        <span className={`w-2.5 h-2.5 rounded-full ${isScam ? 'bg-red-500 animate-ping' : 'bg-emerald-400 animate-ping'}`} />
        <span>CALL SCREENER</span>
      </div>

      {/* Realistic Smartphone Chassis */}
      <div className={`w-full max-w-[360px] h-[650px] rounded-[50px] p-4 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 border-[6px] shadow-2xl transition-all duration-300 ${
        isScam
          ? 'animate-phone-shake border-red-500 shadow-red-950/80 ring-4 ring-red-500/20'
          : 'border-slate-700 shadow-emerald-950/40 hover:border-slate-600'
      }`}>
        <div className="relative w-full h-full rounded-[38px] overflow-hidden bg-[#070b13] flex flex-col justify-between p-5 text-white select-none">
          
          {/* Top Status Bar & Dynamic Island */}
          <div>
            <div className="flex justify-between items-center text-[11px] font-bold text-slate-300 px-2 pt-0.5">
              <span>09:41</span>
              {/* Dynamic Island */}
              <div className="w-22 h-5 bg-black rounded-full flex items-center justify-between px-2.5 border border-slate-800">
                <div className={`w-2 h-2 rounded-full ${isScam ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
                <div className="w-1.5 h-3 bg-slate-400 rounded-full animate-pulse" />
              </div>
              <span>5G 100%</span>
            </div>

            {/* Caller Profile Header */}
            <div className="text-center mt-5">
              <div className={`w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl border-2 transition-all duration-300 ${
                isScam
                  ? 'bg-red-950/90 border-red-500 shadow-xl shadow-red-600/60'
                  : 'bg-emerald-950/80 border-emerald-400 shadow-lg shadow-emerald-500/30'
              }`}>
                {isScam ? '⚠️' : '🛡️'}
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                {callerNumber}
              </h3>
              <p className={`text-xs font-bold mt-0.5 ${isScam ? 'text-red-400 uppercase tracking-wide' : 'text-slate-400'}`}>
                {isScam ? '⚠️ FAKE BANK IMPOSTOR (SCAMMER)' : callerTag}
              </p>
              <p className="text-xs text-slate-500 font-bold mt-1">
                Active Call • {formatTime(seconds)}
              </p>
            </div>
          </div>

          {/* Dynamic Dual State Overlay Card */}
          <div className="my-auto">
            {isScam ? (
              /* DANGER/SCAM STATE */
              <div className="rounded-3xl p-5 bg-gradient-to-b from-red-950 via-red-900 to-red-950 border-2 border-red-500 text-center shadow-2xl animate-pulse">
                <div className="text-xl font-black uppercase text-white tracking-wide bg-black/50 py-1.5 px-3 rounded-xl border border-red-400 inline-block">
                  🚫 SCAM ALERT / DANGER
                </div>
                
                <div className="mt-3 text-2xl font-black text-white uppercase tracking-wider animate-bounce">
                  🚫 HANG UP NOW
                </div>

                <div className="mt-3 space-y-1.5 text-left text-xs font-bold text-red-100 bg-black/40 p-3 rounded-2xl border border-red-500/40">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>Pretending to be a Bank!</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>Urgently asking for secret OTP!</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>Do NOT disclose password codes!</span>
                  </div>
                </div>

                {/* Erratic Red Audio Waveform */}
                <div className="mt-3 flex items-center justify-center gap-1.5 h-7">
                  {[80, 40, 100, 30, 90, 60, 100, 45, 95].map((h, i) => (
                    <span
                      key={i}
                      className="w-1.5 bg-red-400 rounded-full animate-pulse"
                      style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* SAFE STATE (Default / Green) */
              <div className="rounded-3xl p-5 bg-gradient-to-b from-emerald-900/90 to-emerald-950 border-2 border-emerald-400 text-center shadow-xl">
                <div className="text-2xl font-black uppercase text-emerald-200 tracking-tight flex items-center justify-center gap-2">
                  <span>🛡️</span>
                  <span>CALL IS SAFE</span>
                </div>
                <p className="text-xs text-emerald-100 font-medium mt-1">
                  Secure AI Screening Active
                </p>

                {/* Bouncing Vocal Waveform */}
                <div className="mt-4 flex items-center justify-center gap-1.5 h-8">
                  {[25, 60, 35, 80, 50, 75, 40, 65, 30].map((h, i) => (
                    <span
                      key={i}
                      className="w-1.5 bg-emerald-300 rounded-full animate-pulse"
                      style={{ height: `${h}%`, animationDuration: '1.2s', animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>

                {/* Simple Badges */}
                <div className="flex items-center justify-center gap-2 mt-4 text-xs font-bold text-emerald-200">
                  <span className="bg-black/30 px-2.5 py-1 rounded-full border border-emerald-500/40">
                    ✔️ Identity Verified
                  </span>
                  <span className="bg-black/30 px-2.5 py-1 rounded-full border border-emerald-500/40">
                    ✔️ No Fraud Signals
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* iOS-Style Call Action Buttons */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              {/* Mute */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="flex flex-col items-center gap-1 cursor-pointer group"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  isMuted ? 'bg-amber-500 text-black' : 'bg-slate-800 text-white group-hover:bg-slate-700'
                }`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {isMuted ? 'Unmute' : 'Mute'}
                </span>
              </button>

              {/* Keypad */}
              <button className="flex flex-col items-center gap-1 cursor-pointer group">
                <div className="w-12 h-12 rounded-full bg-slate-800 text-white group-hover:bg-slate-700 flex items-center justify-center transition">
                  <Grid className="w-5 h-5" />
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Keypad</span>
              </button>

              {/* Speaker */}
              <button
                onClick={() => setIsSpeaker(!isSpeaker)}
                className="flex flex-col items-center gap-1 cursor-pointer group"
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                  isSpeaker ? 'bg-white text-slate-900' : 'bg-slate-800 text-white group-hover:bg-slate-700'
                }`}>
                  {isSpeaker ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">
                  {isSpeaker ? 'Speaker' : 'Earpiece'}
                </span>
              </button>
            </div>

            {/* Big Circular End Call Button */}
            <div className="flex justify-center">
              <button
                onClick={onEndCall}
                className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white shadow-xl shadow-rose-950/60 active:scale-95 transition cursor-pointer"
                title="End Call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            </div>

            {/* Home Bar Indicator */}
            <div className="w-32 h-1 bg-slate-500/50 rounded-full mx-auto" />
          </div>

        </div>
      </div>
    </div>
  );
};
