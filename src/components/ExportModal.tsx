import React, { useState } from 'react';
import { X, Copy, Check, Download, FileCode, ExternalLink } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  standaloneHtmlCode: string;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  standaloneHtmlCode,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(standaloneHtmlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([standaloneHtmlCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kavach-voip-dashboard.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl bg-[#19232E] border border-[#263443] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#263443] bg-[#101820]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#19232E] border border-[#263443] flex items-center justify-center text-[#35B9D0]">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F1F5F9]">
                Standalone Deployment Package
              </h2>
              <p className="text-xs text-[#AAB7C4]">
                Self-contained single-file HTML bundle with Tailwind CSS and Vanilla JS.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#AAB7C4] hover:text-[#F1F5F9] rounded hover:bg-[#19232E] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#AAB7C4]">
            <p>
              This code includes the complete cybersecurity dashboard, WebSocket streaming client, audio synthesizer, and developer simulation controls in a single portable file.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 bg-[#35B9D0] hover:bg-[#2fa4b9] text-[#101820] font-bold rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Code Copied' : 'Copy All Code'}</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] text-[#F1F5F9] border border-[#263443] rounded transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#35B9D0]" />
                <span>Download .html</span>
              </button>
              <a
                href="/standalone.html"
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-[#101820] hover:bg-[#15202c] text-[#35B9D0] border border-[#263443] rounded transition-colors flex items-center gap-1"
              >
                <span>Live Preview</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="relative">
            <pre className="bg-[#101820] border border-[#263443] rounded p-4 text-xs font-mono text-[#AAB7C4] max-h-96 overflow-x-auto overflow-y-auto select-all">
              {standaloneHtmlCode}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#263443] bg-[#101820] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-[#AAB7C4] hover:text-[#F1F5F9] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
