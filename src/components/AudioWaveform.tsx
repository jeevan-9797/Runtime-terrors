import React, { useEffect, useRef } from 'react';
import { SecurityState } from '../types';

interface AudioWaveformProps {
  securityState: SecurityState;
  isActive: boolean;
  isStreamConnected?: boolean;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  securityState,
  isActive,
  isStreamConnected = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    const render = () => {
      step += 0.04;
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Dark technical surface
      ctx.fillStyle = '#101820';
      ctx.fillRect(0, 0, width, height);

      // Subtle engineering grid lines
      ctx.strokeStyle = '#1D2A37';
      ctx.lineWidth = 1;

      // Horizontal dB markers
      [-24, -12, 0, 12, 24].forEach((offset) => {
        const y = centerY + (offset * (height / 70));
        ctx.beginPath();
        ctx.moveTo(35, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });

      // Left dB scale labels
      ctx.fillStyle = '#486178';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('+6dB', 30, centerY - (24 * (height / 70)) + 3);
      ctx.fillText('0dB', 30, centerY + 3);
      ctx.fillText('-18dB', 30, centerY + (24 * (height / 70)) + 3);

      const isAlert = securityState === 'scam';

      if (!isStreamConnected) {
        // Flat inactive line when disconnected
        ctx.strokeStyle = '#3E546A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(35, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        ctx.fillStyle = '#AAB7C4';
        ctx.font = '11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Analysis Stream Inactive — Audio Spectrum Offline', (width + 35) / 2, centerY - 10);
        return;
      }

      // 48 Discrete Spectrum Analysis Bars (Technical FFT style)
      const numBars = 48;
      const startX = 40;
      const availableWidth = width - startX - 10;
      const barWidth = Math.max(3, (availableWidth / numBars) - 2);

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + 2);
        let amplitude = 0;

        if (isAlert) {
          // Sharp harmonic peaks representing synthetic vocoder and high stress
          const harmonic = Math.abs(Math.sin(step * 2.5 + i * 0.7));
          const noise = Math.sin(i * 1.3 - step * 3) * 0.3;
          amplitude = Math.max(0.1, harmonic + noise);
        } else if (isActive) {
          // Clean, predictable human voice fundamental band (300Hz - 3.4kHz)
          const voiceEnvelope = Math.exp(-Math.pow((i - 16) / 10, 2)); // Peak around mid-frequency
          const oscillation = Math.abs(Math.sin(step * 1.5 + i * 0.35));
          amplitude = Math.max(0.06, voiceEnvelope * 0.9 * oscillation + 0.08);
        } else {
          amplitude = 0.04;
        }

        const barHeight = Math.min(amplitude * (height * 0.75), height * 0.82);
        const y = centerY - barHeight / 2;

        // Clean, restrained coloring based on state
        if (isAlert) {
          ctx.fillStyle = i % 4 === 0 ? '#D95765' : 'rgba(217, 87, 101, 0.7)';
        } else {
          ctx.fillStyle = i % 3 === 0 ? '#35B9D0' : '#2B8DA0';
        }

        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [securityState, isActive, isStreamConnected]);

  return (
    <div className="bg-[#19232E] border border-[#263443] rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#263443] text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#F1F5F9]">Audio Spectrum & Acoustic Telemetry</span>
          <span className="text-[#AAB7C4]">·</span>
          <span className="font-mono text-[11px] text-[#AAB7C4]">FFT 48kHz Resolution</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: !isStreamConnected
                ? '#E8A23A'
                : securityState === 'scam'
                ? '#D95765'
                : '#36B37E',
            }}
          />
          <span className="font-mono text-[11px] text-[#AAB7C4]">
            {!isStreamConnected
              ? 'Stream: Disconnected'
              : securityState === 'scam'
              ? 'Acoustic Anomaly (Flagged)'
              : 'Stream: Live Active'}
          </span>
        </div>
      </div>

      <div className="relative rounded overflow-hidden border border-[#263443]">
        <canvas
          ref={canvasRef}
          width={680}
          height={115}
          className="w-full h-24 block"
        />
      </div>

      <div className="flex justify-between text-[10px] text-[#AAB7C4] font-mono mt-2 px-1">
        <span>100 Hz (Sub)</span>
        <span>1.2 kHz (Vocal Core)</span>
        <span>3.4 kHz (Formants)</span>
        <span>8.0 kHz (Air)</span>
        <span>16.0 kHz</span>
      </div>
    </div>
  );
};
