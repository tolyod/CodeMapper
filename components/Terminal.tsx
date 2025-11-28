import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

export const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'info': return 'text-terminal-text';
      case 'success': return 'text-terminal-green';
      case 'warn': return 'text-terminal-yellow';
      case 'error': return 'text-terminal-red';
      default: return 'text-terminal-text';
    }
  };

  return (
    <div className="bg-terminal-bg flex flex-col h-full font-mono text-xs sm:text-sm">
      <div className="bg-gray-800 px-4 py-1 flex items-center gap-2 border-b border-gray-700 shrink-0">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold select-none">Terminal Output</span>
      </div>
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto space-y-1"
      >
        {logs.length === 0 && (
          <div className="text-gray-500 italic">Waiting for input...</div>
        )}
        {logs.map((log, idx) => (
          <div key={idx} className="flex gap-3">
            <span className="text-gray-500 shrink-0 opacity-50">
              [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
            </span>
            <span className={`${getColor(log.level)} break-all whitespace-pre-wrap`}>
              {log.level === 'error' ? '✖ ' : log.level === 'success' ? '✔ ' : '> '}
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};