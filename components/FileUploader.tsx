import React, { useRef } from 'react';
import { Upload, Folder } from 'lucide-react';
import { SUPPORTED_EXTENSIONS } from '../types';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFilesSelected, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // Cast to File[] to avoid 'unknown' type error
      const allFiles = Array.from(e.target.files) as File[];
      // Filter for supported languages
      const filteredFiles = allFiles.filter(f => 
        SUPPORTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext))
      );
      onFilesSelected(filteredFiles);
    }
  };

  const handleUploadClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        ref={inputRef}
        onChange={handleChange}
        className="hidden"
        // @ts-ignore: webkitdirectory is non-standard but supported in most modern browsers
        webkitdirectory="" 
        directory="" 
        multiple
      />
      <button
        onClick={handleUploadClick}
        disabled={disabled}
        className={`flex items-center justify-center gap-2 px-6 py-8 border-2 border-dashed rounded-lg transition-colors ${
          disabled 
            ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed' 
            : 'border-blue-500 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer hover:border-blue-400'
        }`}
      >
        <Folder className="w-8 h-8" />
        <div className="text-left">
          <div className="font-semibold">Open Project Directory</div>
          <div className="text-xs opacity-70">Supports JS, TS, Python, Go, PHP, Java</div>
        </div>
      </button>
    </div>
  );
};