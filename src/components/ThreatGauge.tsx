import React, { useState, useEffect, useRef } from 'react';
import { ThreatMetrics, SecurityState } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Volume2,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';

interface ThreatGaugeProps {
  metrics: ThreatMetrics;
  securityState: SecurityState;
  isStreamActive?: boolean;
}

interface TimelinePoint {
  id: string;
  time: string;
  score: number;
  isSpike?: boolean;
  label?: string;
  isCurrent?: boolean;
  timestamp?: number;
  x?: number;
  y?: number;
}

export const ThreatGauge: React.FC<ThreatGaugeProps> = ({
  metrics,
  securityState,
  isStreamActive = true,
}) => {
  const isAlert = securityState === 'scam';
  const targetScore = metrics?.threatScore ?? 8;

  // View Mode: 'timeline' (Previous Graph - Default) or 'telemetry' (Continuous Strip-Chart)
  const [viewMode, setViewMode] = useState<'timeline' | 'telemetry'>('timeline');

  // Interactive Hover Tooltip for Timeline Graph
  const [hoveredPoint, setHoveredPoint] = useState<TimelinePoint | null>(null);

  // Derive calibrated category
  const getRiskCategory = (val: number) => {
    if (!isStreamActive) return { label: 'Analysis Paused (Offline)', color: '#E8A23A', status: 'UNVERIFIED' };
    if (val >= 75) return { label: 'Critical Risk', color: '#D95765', status: 'CRITICAL_RISK' };
    if (val >= 50) return { label: 'Elevated Risk', color: '#E8A23A', status: 'ELEVATED' };
    if (val >= 25) return { label: 'Moderate / Inconclusive', color: '#E8A23A', status: 'MODERATE' };
    return { label: 'Nominal Risk', color: '#36B37E', status: 'NOMINAL' };
  };

  const riskInfo = getRiskCategory(targetScore);

  // Timeline Graph Data Points History
  const [graphPoints, setGraphPoints] = useState<TimelinePoint[]>([
    { id: 'p1', time: '-2m 00s', score: 7, isSpike: false },
    { id: 'p2', time: '-1m 40s', score: 8, isSpike: false },
    { id: 'p3', time: '-1m 20s', score: 8, isSpike: false },
    { id: 'p4', time: '-1m 00s', score: 9, isSpike: false },
    { id: 'p5', time: '-40s', score: 8, isSpike: false },
    { id: 'p6', time: '-20s', score: 8, isSpike: false },
    { id: 'p7', time: 'NOW', score: targetScore, isSpike: isAlert, isCurrent: true },
  ]);

  const prevScoreRef = useRef<number>(targetScore);

  // Update timeline points when targetScore or alert state transitions
  useEffect(() => {
    if (prevScoreRef.current !== targetScore) {
      const nowTimeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      setGraphPoints((prev) => {
        // Unmark previous 'NOW' point and assign it a relative or clock label
        const updated = prev.map((pt, idx) => {
          if (idx === prev.length - 1) {
            return {
              ...pt,
              time: pt.time === 'NOW' ? '-10s' : pt.time,
              isCurrent: false,
            };
          }
          return pt;
        });

        // Add new current point
        const newPoint: TimelinePoint = {
          id: `p-${Date.now()}`,
          time: 'NOW',
          score: targetScore,
          isSpike: isAlert || targetScore >= 75,
          label: targetScore >= 75 ? 'Coercion Anomaly' : prevScoreRef.current >= 75 ? 'Baseline Restored' : undefined,
          isCurrent: true,
          timestamp: Date.now(),
        };

        const nextList = [...updated, newPoint];
        // Keep window of at most 8-9 points for clear spacing
        return nextList.length > 8 ? nextList.slice(nextList.length - 8) : nextList;
      });

      prevScoreRef.current = targetScore;
    } else {
      // Just ensure current point matches latest targetScore
      setGraphPoints((prev) =>
        prev.map((pt, idx) =>
          idx === prev.length - 1 ? { ...pt, score: targetScore, isSpike: isAlert } : pt
        )
      );
    }
  }, [targetScore, isAlert]);

  const resetHistory = () => {
    setGraphPoints([
      { id: `p-${Date.now()}-1`, time: '-1m 00s', score: 8, isSpike: false },
      { id: `p-${Date.now()}-2`, time: '-40s', score: 8, isSpike: false },
      { id: `p-${Date.now()}-3`, time: '-20s', score: 9, isSpike: false },
      { id: `p-${Date.now()}-4`, time: 'NOW', score: targetScore, isSpike: isAlert, isCurrent: true },
    ]);
  };

  // Continuous Telemetry Canvas Engine for alternate view
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const bufferRef = useRef<{ timestamp: number; score: number }[]>([]);
  const currentValRef = useRef<number>(targetScore);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewMode !== 'telemetry') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (bufferRef.current.length === 0) {
      const initial: { timestamp: number; score: number }[] = [];
      const now = Date.now();
      for (let i = 80; i >= 0; i--) {
        const time = now - i * 250;
        const jitter = Math.sin(i * 0.4) * 1.5;
        initial.push({ timestamp: time, score: Math.max(5, targetScore + jitter) });
      }
      bufferRef.current = initial;
      currentValRef.current = targetScore;
    }

    let running = true;
    let lastSampleTime = Date.now();

    const render = () => {
      if (!running) return;
      const now = Date.now();
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;

      if (!isPaused && isStreamActive) {
        currentValRef.current += (targetScore - currentValRef.current) * (isAlert ? 0.08 : 0.05);
        const noise = (Math.sin(now * 0.01) + Math.cos(now * 0.02)) * (isAlert ? 2.5 : 0.6);
        const dynamicScore = Math.min(100, Math.max(0, currentValRef.current + noise));

        if (now - lastSampleTime >= 200) {
          lastSampleTime = now;
          bufferRef.current.push({ timestamp: now, score: dynamicScore });
          if (bufferRef.current.length > 100) bufferRef.current.shift();
        }
      }

      const padLeft = 45;
      const padRight = 30;
      const padTop = 18;
      const padBottom = 26;
      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;
      const getY = (val: number) => padTop + chartH - (val / 100) * chartH;

      ctx.fillStyle = '#101820';
      ctx.fillRect(0, 0, width, height);

      // Threshold lines
      [
        { val: 100, label: '100', color: '#263443' },
        { val: 75, label: '75', color: '#D95765' },
        { val: 50, label: '50', color: '#E8A23A' },
        { val: 25, label: '25', color: '#263443' },
        { val: 0, label: '0', color: '#263443' },
      ].forEach((lvl) => {
        const y = getY(lvl.val);
        ctx.beginPath();
        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = 1;
        ctx.setLineDash(lvl.val === 75 || lvl.val === 50 ? [4, 4] : []);
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + chartW, y);
        ctx.stroke();

        ctx.fillStyle = '#627D98';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(lvl.label, padLeft - 6, y + 3);
      });

      // Waveform
      const samples = bufferRef.current;
      if (samples.length >= 2) {
        const windowDurationMs = 20000;
        const minTime = now - windowDurationMs;
        const coords: { x: number; y: number }[] = [];

        samples.forEach((s) => {
          const normX = (s.timestamp - minTime) / windowDurationMs;
          if (normX >= 0 && normX <= 1.05) {
            coords.push({
              x: padLeft + Math.min(1, Math.max(0, normX)) * chartW,
              y: getY(s.score),
            });
          }
        });

        if (coords.length >= 2) {
          const streamColor = isAlert ? '#D95765' : currentValRef.current >= 50 ? '#E8A23A' : '#36B37E';

          // Gradient fill
          const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
          grad.addColorStop(0, isAlert ? 'rgba(217, 87, 101, 0.3)' : 'rgba(54, 179, 126, 0.2)');
          grad.addColorStop(1, 'rgba(16, 24, 32, 0)');

          ctx.beginPath();
          ctx.moveTo(coords[0].x, padTop + chartH);
          ctx.lineTo(coords[0].x, coords[0].y);
          for (let i = 1; i < coords.length; i++) {
            const midX = (coords[i - 1].x + coords[i].x) / 2;
            ctx.bezierCurveTo(midX, coords[i - 1].y, midX, coords[i].y, coords[i].x, coords[i].y);
          }
          ctx.lineTo(coords[coords.length - 1].x, padTop + chartH);
          ctx.fillStyle = grad;
          ctx.fill();

          // Stroke line
          ctx.beginPath();
          ctx.moveTo(coords[0].x, coords[0].y);
          for (let i = 1; i < coords.length; i++) {
            const midX = (coords[i - 1].x + coords[i].x) / 2;
            ctx.bezierCurveTo(midX, coords[i - 1].y, midX, coords[i].y, coords[i].x, coords[i].y);
          }
          ctx.strokeStyle = streamColor;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Live Head Dot
          const last = coords[coords.length - 1];
          ctx.beginPath();
          ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = streamColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [viewMode, isPaused, isStreamActive, isAlert, targetScore]);

  // SVG Geometry Calculations for Timeline Graph (viewBox 0 0 640 180)
  const svgW = 640;
  const svgH = 180;
  const padLeft = 48;
  const padRight = 36;
  const padTop = 22;
  const padBottom = 30;
  const chartW = svgW - padLeft - padRight;
  const chartH = svgH - padTop - padBottom;

  const getSvgX = (index: number, total: number) => {
    if (total <= 1) return padLeft + chartW / 2;
    return padLeft + (index / (total - 1)) * chartW;
  };

  const getSvgY = (val: number) => {
    return padTop + chartH - (Math.min(100, Math.max(0, val)) / 100) * chartH;
  };

  // Compute smooth Bezier path string
  const pointsWithCoords = graphPoints.map((pt, i) => ({
    ...pt,
    x: getSvgX(i, graphPoints.length),
    y: getSvgY(pt.score),
  }));

  const buildBezierPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const midX = (prev.x + curr.x) / 2;
      d += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const linePathD = buildBezierPath(pointsWithCoords);
  const areaPathD =
    pointsWithCoords.length >= 2
      ? `${linePathD} L ${pointsWithCoords[pointsWithCoords.length - 1].x} ${padTop + chartH} L ${
          pointsWithCoords[0].x
        } ${padTop + chartH} Z`
      : '';

  // Stats for the header
  const scores = graphPoints.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

  return (
    <div className="bg-[#19232E] border border-[#263443] rounded-lg p-5 transition-colors">
      {/* Assessment Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#263443]">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: isAlert ? 'rgba(217, 87, 101, 0.12)' : 'rgba(54, 179, 126, 0.12)',
              borderColor: isAlert ? 'rgba(217, 87, 101, 0.3)' : 'rgba(54, 179, 126, 0.3)',
              color: isAlert ? '#D95765' : '#36B37E',
            }}
          >
            {isAlert ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#F1F5F9] tracking-tight">
                Threat Assessment & Risk Velocity
              </h2>
              {metrics.isSimulated && (
                <span className="text-[10px] font-mono font-medium text-[#AAB7C4] px-1.5 py-0.5 rounded bg-[#101820] border border-[#263443]">
                  SIMULATED
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#AAB7C4] mt-0.5 font-mono">
              <span>Time-Series Risk Evaluation</span>
              <span aria-hidden="true">·</span>
              <span>Nominal to Critical Trajectory</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-[#AAB7C4] block uppercase font-mono">Threat Score</span>
            <span
              className="text-xl font-extrabold font-mono tabular-nums leading-tight"
              style={{ color: riskInfo.color }}
            >
              {targetScore.toString().padStart(2, '0')}/100
            </span>
          </div>

          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border"
            style={{
              color: riskInfo.color,
              borderColor: `${riskInfo.color}40`,
              backgroundColor: `${riskInfo.color}15`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: riskInfo.color }}
            />
            <span>{riskInfo.label}</span>
          </span>
        </div>
      </div>

      {/* Graph Area Header & View Controls */}
      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#AAB7C4] mb-2">
          <div className="flex items-center gap-2 font-semibold text-[#F1F5F9]">
            <TrendingUp className="w-3.5 h-3.5 text-[#35B9D0]" />
            <span>Threat Score Trajectory Across Call</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#36B37E] animate-pulse" />
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="hidden sm:inline text-[#AAB7C4]">
              Peak: <strong className="text-[#F1F5F9]">{maxScore}</strong>
            </span>
            <span className="hidden sm:inline text-[#AAB7C4]">
              Avg: <strong className="text-[#F1F5F9]">{avgScore}</strong>
            </span>

            {/* Mode Switcher: Timeline Graph (Default) vs Live Telemetry */}
            <div className="flex items-center rounded bg-[#101820] border border-[#263443] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  viewMode === 'timeline'
                    ? 'bg-[#19232E] text-[#35B9D0] font-semibold shadow-sm'
                    : 'text-[#AAB7C4] hover:text-[#F1F5F9]'
                }`}
                title="View previous timeline graph with discrete evaluation points"
              >
                Timeline Graph
              </button>
              <button
                type="button"
                onClick={() => setViewMode('telemetry')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  viewMode === 'telemetry'
                    ? 'bg-[#19232E] text-[#35B9D0] font-semibold shadow-sm'
                    : 'text-[#AAB7C4] hover:text-[#F1F5F9]'
                }`}
                title="View real-time acoustic telemetry stream"
              >
                Live Telemetry
              </button>
            </div>

            {viewMode === 'timeline' && (
              <button
                type="button"
                onClick={resetHistory}
                className="p-1 rounded bg-[#101820] hover:bg-[#15202c] text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] transition-colors cursor-pointer"
                title="Reset Timeline History"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* View Mode 1: The Restored Previous SVG Graph (Default) */}
        {viewMode === 'timeline' && (
          <div className="relative bg-[#101820] border border-[#263443] rounded-lg p-2 overflow-hidden">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-44 sm:h-52 block select-none"
            >
              <defs>
                {/* Area Gradient Fill */}
                <linearGradient id="threatAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isAlert ? '#D95765' : '#36B37E'}
                    stopOpacity={isAlert ? 0.35 : 0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={isAlert ? '#D95765' : '#36B37E'}
                    stopOpacity={0.0}
                  />
                </linearGradient>

                {/* Grid Pattern */}
                <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#36B37E" />
                  <stop
                    offset="80%"
                    stopColor={isAlert ? '#D95765' : targetScore >= 50 ? '#E8A23A' : '#36B37E'}
                  />
                </linearGradient>
              </defs>

              {/* Threshold Zone Background Shading */}
              {/* Critical Zone (75-100) */}
              <rect
                x={padLeft}
                y={getSvgY(100)}
                width={chartW}
                height={getSvgY(75) - getSvgY(100)}
                fill="rgba(217, 87, 101, 0.05)"
              />
              {/* Elevated Zone (50-75) */}
              <rect
                x={padLeft}
                y={getSvgY(75)}
                width={chartW}
                height={getSvgY(50) - getSvgY(75)}
                fill="rgba(232, 162, 58, 0.03)"
              />
              {/* Nominal Zone (0-25) */}
              <rect
                x={padLeft}
                y={getSvgY(25)}
                width={chartW}
                height={getSvgY(0) - getSvgY(25)}
                fill="rgba(54, 179, 126, 0.03)"
              />

              {/* Horizontal Threshold Grid Lines */}
              {[
                { val: 100, label: '100', color: '#263443', dash: '' },
                { val: 75, label: '75', color: '#D95765', dash: '4,4' },
                { val: 50, label: '50', color: '#E8A23A', dash: '3,3' },
                { val: 25, label: '25', color: '#263443', dash: '2,2' },
                { val: 0, label: '0', color: '#263443', dash: '' },
              ].map((grid) => {
                const y = getSvgY(grid.val);
                return (
                  <g key={grid.val}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={padLeft + chartW}
                      y2={y}
                      stroke={grid.color}
                      strokeWidth="1"
                      strokeDasharray={grid.dash}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 3}
                      fill="#627D98"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {grid.label}
                    </text>
                  </g>
                );
              })}

              {/* Area Gradient Fill */}
              {areaPathD && <path d={areaPathD} fill="url(#threatAreaGrad)" />}

              {/* Connecting Spline Line */}
              {linePathD && (
                <path
                  d={linePathD}
                  fill="none"
                  stroke={isAlert ? '#D95765' : targetScore >= 50 ? '#E8A23A' : '#36B37E'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points, Vertical Drop Lines & Time Markers */}
              {pointsWithCoords.map((pt, i) => {
                const ptColor =
                  pt.score >= 75
                    ? '#D95765'
                    : pt.score >= 50
                    ? '#E8A23A'
                    : '#36B37E';

                return (
                  <g key={pt.id}>
                    {/* Vertical guideline */}
                    <line
                      x1={pt.x}
                      y1={pt.y}
                      x2={pt.x}
                      y2={padTop + chartH}
                      stroke={pt.isCurrent ? ptColor : '#263443'}
                      strokeWidth={pt.isCurrent ? '1.5' : '1'}
                      strokeDasharray={pt.isCurrent ? '2,2' : '1,3'}
                      opacity={pt.isCurrent ? 0.7 : 0.4}
                    />

                    {/* Time Label on X-axis */}
                    <text
                      x={pt.x}
                      y={padTop + chartH + 16}
                      fill={pt.isCurrent ? '#F1F5F9' : '#627D98'}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight={pt.isCurrent ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      {pt.time}
                    </text>

                    {/* Outer pulse ring on current / live point */}
                    {pt.isCurrent && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="8"
                        fill="none"
                        stroke={ptColor}
                        strokeWidth="1.5"
                        opacity="0.6"
                        className="animate-ping"
                      />
                    )}

                    {/* Data Node Point */}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={pt.isCurrent ? 5 : 3.5}
                      fill="#19232E"
                      stroke={ptColor}
                      strokeWidth={pt.isCurrent ? 2.5 : 2}
                      className="cursor-pointer hover:r-6 transition-all"
                      onMouseEnter={() => setHoveredPoint(pt)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />

                    {/* Value Pill Above Point */}
                    <text
                      x={pt.x}
                      y={Math.max(padTop + 10, pt.y - 8)}
                      fill={pt.isCurrent ? '#F1F5F9' : '#AAB7C4'}
                      fontSize={pt.isCurrent ? '9.5' : '8.5'}
                      fontWeight={pt.isCurrent ? 'bold' : 'normal'}
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {pt.score}
                    </text>

                    {/* Anomaly Callout Badge on Spikes */}
                    {pt.isSpike && (
                      <g transform={`translate(${Math.min(padLeft + chartW - 55, pt.x)}, ${Math.max(padTop + 14, pt.y - 24)})`}>
                        <rect
                          x="-45"
                          y="-10"
                          width="90"
                          height="18"
                          rx="3"
                          fill="#D95765"
                        />
                        <text
                          x="0"
                          y="2"
                          fill="#FFFFFF"
                          fontSize="8.5"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                          textAnchor="middle"
                        >
                          ⚠️ {pt.label || 'Spike Flagged'}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Interactive Tooltip on Hover */}
            {hoveredPoint && (
              <div
                className="absolute pointer-events-none bg-[#19232E]/95 border border-[#35B9D0] rounded px-2.5 py-1 text-[11px] font-mono text-[#F1F5F9] shadow-lg -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${((hoveredPoint.x ?? 0) / svgW) * 100}%`,
                  top: `${((hoveredPoint.y ?? 0) / svgH) * 100 - 8}%`,
                }}
              >
                <div className="font-bold text-[#35B9D0]">{hoveredPoint.score} Threat Score</div>
                <div className="text-[9px] text-[#AAB7C4]">Offset: {hoveredPoint.time}</div>
                {hoveredPoint.label && (
                  <div className="text-[9px] text-[#D95765] font-semibold">{hoveredPoint.label}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View Mode 2: Real-Time Continuous Telemetry Canvas */}
        {viewMode === 'telemetry' && (
          <div className="relative bg-[#101820] border border-[#263443] rounded-lg overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-44 sm:h-52 block cursor-crosshair"
            />
            {/* Operator Controls for Telemetry */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                className="px-2 py-0.5 rounded bg-[#19232E]/90 text-[#AAB7C4] hover:text-[#F1F5F9] border border-[#263443] text-[10px] font-mono cursor-pointer"
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
        )}

        {/* Scale Legend */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-[#AAB7C4] font-mono mt-1.5 px-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#D95765]" />
              <span>Critical (&ge;75)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#E8A23A]" />
              <span>Elevated (50–75)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#263443]" />
              <span>Moderate (25–50)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-[#36B37E]" />
              <span>Nominal (&lt;25)</span>
            </span>
          </div>
          <span>Mode: {viewMode === 'timeline' ? 'Historical Risk Trajectory' : '5 Hz Acoustic Stream'}</span>
        </div>
      </div>

      {/* Model Rationale / Explanation */}
      <div
        className="mt-4 p-3 rounded border text-xs leading-relaxed"
        style={{
          backgroundColor: isAlert ? 'rgba(217, 87, 101, 0.08)' : 'rgba(25, 35, 46, 0.6)',
          borderColor: isAlert ? 'rgba(217, 87, 101, 0.25)' : '#263443',
          color: isAlert ? '#F1F5F9' : '#AAB7C4',
        }}
      >
        <span className="font-semibold text-[#F1F5F9] mr-1.5">
          {isAlert ? 'Alert Analysis:' : 'Baseline Summary:'}
        </span>
        {isAlert
          ? metrics.recommendedAction ||
            'Real-time acoustic analysis and conversational modeling identified coercive urgency and demands for sensitive one-time passcodes (OTP). Model indicates suspected social engineering.'
          : 'Zero coercion triggers detected. Conversational rhythm, speech prosody, and biometric acoustics match benign caller baseline tolerances.'}
      </div>

      {/* 4 Core Analysis Signals Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {/* Signal 1: Urgency Pressure */}
        <div className="p-3 bg-[#101820] border border-[#263443] rounded">
          <div className="flex items-center justify-between text-[11px] text-[#AAB7C4]">
            <span>Urgency Pressure</span>
            <Activity className="w-3.5 h-3.5" style={{ color: isAlert ? '#D95765' : '#36B37E' }} />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono">
            <span
              className="text-base font-bold tabular-nums"
              style={{ color: isAlert ? '#D95765' : '#F1F5F9' }}
            >
              {isAlert ? 'Critical (89%)' : `${metrics?.voiceStress ?? 14}% (Low)`}
            </span>
          </div>
          <p className="text-[10px] text-[#AAB7C4] mt-1 line-clamp-1">
            {isAlert ? 'Ultimatum & time-stress coercion' : 'Normal conversational cadence'}
          </p>
        </div>

        {/* Signal 2: Synthetic Voice */}
        <div className="p-3 bg-[#101820] border border-[#263443] rounded">
          <div className="flex items-center justify-between text-[11px] text-[#AAB7C4]">
            <span>Synthetic Voice</span>
            <Volume2 className="w-3.5 h-3.5" style={{ color: isAlert ? '#D95765' : '#36B37E' }} />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono">
            <span
              className="text-base font-bold tabular-nums"
              style={{ color: isAlert ? '#D95765' : '#F1F5F9' }}
            >
              {isAlert ? '82% Prob' : `${metrics?.syntheticVoiceProb ?? 4}% Prob`}
            </span>
          </div>
          <p className="text-[10px] text-[#AAB7C4] mt-1 line-clamp-1">
            {isAlert ? 'Neural vocoder phase anomalies' : 'Human glottal pulse variation'}
          </p>
        </div>

        {/* Signal 3: Caller Reputation */}
        <div className="p-3 bg-[#101820] border border-[#263443] rounded">
          <div className="flex items-center justify-between text-[11px] text-[#AAB7C4]">
            <span>Carrier Reputation</span>
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isAlert ? '#D95765' : '#36B37E' }}
            />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono">
            <span
              className="text-base font-bold tabular-nums"
              style={{ color: isAlert ? '#D95765' : '#36B37E' }}
            >
              {isAlert ? 'High Risk' : 'High Trust'}
            </span>
          </div>
          <p className="text-[10px] text-[#AAB7C4] mt-1 line-clamp-1">
            {isAlert ? 'Spoofed SIP gateway relay' : 'Verified carrier gateway'}
          </p>
        </div>

        {/* Signal 4: Voice Stress */}
        <div className="p-3 bg-[#101820] border border-[#263443] rounded">
          <div className="flex items-center justify-between text-[11px] text-[#AAB7C4]">
            <span>Acoustic Stress</span>
            <AlertTriangle className="w-3.5 h-3.5" style={{ color: isAlert ? '#D95765' : '#36B37E' }} />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono">
            <span
              className="text-base font-bold tabular-nums"
              style={{ color: isAlert ? '#D95765' : '#F1F5F9' }}
            >
              {isAlert ? '89% Severe' : '14% Baseline'}
            </span>
          </div>
          <p className="text-[10px] text-[#AAB7C4] mt-1 line-clamp-1">
            {isAlert ? 'High micro-tremor deviation' : 'Nominal acoustic variance'}
          </p>
        </div>
      </div>

      {/* Flagged Suspicious Patterns (Conditional) */}
      {metrics?.flaggedKeywords && metrics.flaggedKeywords.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#263443]">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#D95765]">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Flagged Coercion & Social Engineering Patterns ({metrics.flaggedKeywords.length}):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(metrics.flaggedKeywords || []).map((kw, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-mono font-medium rounded bg-[#D95765]/10 text-[#F1F5F9] border border-[#D95765]/30 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#D95765]" />
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
