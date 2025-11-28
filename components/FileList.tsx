import React, { useEffect, useRef } from 'react';
import { FileEntry, ProcessingStatus } from '../types';
import { CheckCircle, Circle, AlertCircle, SkipForward, RefreshCw } from 'lucide-react';

interface FileListProps {
  files: FileEntry[];
  currentIndex: number;
  onRetry: (index: number) => void;
}

export const FileList: React.FC<FileListProps> = ({ files, currentIndex, onRetry }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active item
  useEffect(() => {
    if (activeRef.current && listRef.current) {
      const list = listRef.current;
      const active = activeRef.current;
      
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Only scroll if out of view
      if (activeRect.bottom > listRect.bottom || activeRect.top < listRect.top) {
        active.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

  const getStatusIcon = (status: ProcessingStatus) => {
    switch (status) {
      case ProcessingStatus.COMPLETED: return <CheckCircle className="w-4 h-4 text-green-500" />;
      case ProcessingStatus.PROCESSING: return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case ProcessingStatus.FAILED: return <AlertCircle className="w-4 h-4 text-red-500" />;
      case ProcessingStatus.SKIPPED: return <SkipForward className="w-4 h-4 text-gray-500" />;
      default: return <Circle className="w-4 h-4 text-gray-600" />;
    }
  };

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto bg-gray-900/50 border-y border-gray-700">
      {files.map((file, idx) => {
        const isActive = idx === currentIndex;
        const isFailed = file.status === ProcessingStatus.FAILED;
        
        return (
          <div 
            key={file.path}
            ref={isActive ? activeRef : null}
            className={`p-3 border-b border-gray-800 transition-colors ${
              isActive ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : 'hover:bg-gray-800 border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="mt-0.5 shrink-0">{getStatusIcon(file.status)}</div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-mono truncate ${isActive ? 'text-blue-300' : 'text-gray-300'}`}>
                    {file.path}
                  </div>
                  {file.status === ProcessingStatus.SKIPPED && (
                     <div className="text-xs text-gray-500">Skipped (Size limit)</div>
                  )}
                </div>
              </div>
              
              {isFailed && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry(idx);
                  }}
                  className="p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition-colors flex items-center gap-1 text-xs"
                  title="Retry this file"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              )}
            </div>

            {isFailed && file.error && (
              <div className="mt-2 ml-7 text-xs text-red-400 bg-red-900/20 border border-red-900/30 p-2 rounded break-words font-mono">
                <span className="font-semibold select-none">Error: </span>
                {file.error}
              </div>
            )}
          </div>
        );
      })}
      
      {files.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          No files loaded.
        </div>
      )}
    </div>
  );
};