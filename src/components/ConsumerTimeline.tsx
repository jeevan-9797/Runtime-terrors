import React, { useRef, useEffect } from 'react';

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  detail: string;
  type: 'safe' | 'danger' | 'info';
}

interface ConsumerTimelineProps {
  events: TimelineItem[];
  onClear: () => void;
}

export const ConsumerTimeline: React.FC<ConsumerTimelineProps> = ({ events, onClear }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="space-y-6 w-full">
      {/* Timeline Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span>📋</span> LIVE CALL TIMELINE
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Simple, readable activity tracker in plain, everyday language
            </p>
          </div>
          <button
            onClick={onClear}
            className="text-xs text-slate-400 hover:text-slate-200 font-bold underline cursor-pointer"
          >
            Clear Log
          </button>
        </div>

        {/* Scrollable Events List */}
        <div
          ref={scrollRef}
          className="mt-4 space-y-3 max-h-[380px] overflow-y-auto pr-1"
        >
          {events.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-medium">
              Log is currently empty. Incoming caller events will appear here automatically.
            </div>
          ) : (
            events.map((event) => {
              if (event.type === 'danger') {
                return (
                  <div
                    key={event.id}
                    className="p-4 rounded-2xl bg-red-950/60 border-2 border-red-500/80 text-xs flex items-start gap-3 shadow-lg animate-pulse"
                  >
                    <span className="text-red-400 font-bold text-base mt-0.5">🚨</span>
                    <div>
                      <p className="font-black text-red-200 text-sm">
                        {event.time} - {event.title}
                      </p>
                      <p className="text-red-200/90 text-xs mt-1 font-semibold leading-relaxed">
                        {event.detail}
                      </p>
                    </div>
                  </div>
                );
              }
              if (event.type === 'safe') {
                return (
                  <div
                    key={event.id}
                    className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs flex items-start gap-3"
                  >
                    <span className="text-emerald-400 font-bold text-base mt-0.5">🛡️</span>
                    <div>
                      <p className="font-bold text-emerald-300 text-sm">
                        {event.time} - {event.title}
                      </p>
                      <p className="text-emerald-200/80 text-xs mt-0.5">
                        {event.detail}
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={event.id}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs flex items-start gap-3"
                >
                  <span className="text-cyan-400 font-bold text-sm mt-0.5">✔️</span>
                  <div>
                    <p className="font-bold text-slate-200 text-xs">
                      {event.time} - {event.title}
                    </p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      {event.detail}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Everyday Consumer Safety Explainer */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-md">
        <h3 className="text-sm font-black text-white flex items-center gap-2 mb-3">
          <span>💡</span> How Kavach Keeps You Safe
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <span className="font-bold text-emerald-400 block mb-1">1. Spots Fake Banks</span>
            <p className="text-[11px] text-slate-400">Detects callers impersonating bank or credit card officers.</p>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <span className="font-bold text-amber-400 block mb-1">2. Catches OTP Theft</span>
            <p className="text-[11px] text-slate-400">Sounds an alarm the second a caller asks for your secret passcode.</p>
          </div>
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
            <span className="font-bold text-red-400 block mb-1">3. Clear Advice</span>
            <p className="text-[11px] text-slate-400">Tells you directly to hang up before any financial harm happens.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
