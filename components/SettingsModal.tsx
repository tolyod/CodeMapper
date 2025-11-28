import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Layers } from 'lucide-react';
import { LLMConfig } from '../types';
import { DEFAULT_BATCH_COUNT, DEFAULT_BATCH_SIZE_KB } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSave: (config: LLMConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [localConfig, setLocalConfig] = useState<LLMConfig>(config);

  useEffect(() => {
    // Ensure we have defaults if upgrading from old state or initializing
    setLocalConfig({
        ...config,
        batchCount: config.batchCount || DEFAULT_BATCH_COUNT,
        batchSizeKB: config.batchSizeKB || DEFAULT_BATCH_SIZE_KB
    });
  }, [config, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800 shrink-0">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            LLM Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Model Provider</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer bg-gray-900/50 p-3 rounded border border-gray-700 hover:border-blue-500/50 transition-colors flex-1">
                <input 
                  type="radio" 
                  name="provider" 
                  value="google"
                  checked={localConfig.provider === 'google'}
                  onChange={() => setLocalConfig(prev => ({ ...prev, provider: 'google', baseUrl: '', modelName: 'gemini-2.5-flash' }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-200">Google Gemini</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-gray-900/50 p-3 rounded border border-gray-700 hover:border-blue-500/50 transition-colors flex-1">
                <input 
                  type="radio" 
                  name="provider" 
                  value="openai"
                  checked={localConfig.provider === 'openai'}
                  onChange={() => setLocalConfig(prev => ({ ...prev, provider: 'openai', baseUrl: 'http://localhost:11434/v1', modelName: 'llama3' }))}
                  className="accent-blue-500"
                />
                <span className="text-sm text-gray-200">OpenAI / Local</span>
              </label>
            </div>
          </div>

          <div className="space-y-4">
             {/* Model Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Model Name</label>
              <input 
                type="text" 
                value={localConfig.modelName}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, modelName: e.target.value }))}
                placeholder={localConfig.provider === 'google' ? "gemini-2.5-flash" : "llama3"}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Base URL (OpenAI Only) */}
            {localConfig.provider === 'openai' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Base URL</label>
                <input 
                  type="text" 
                  value={localConfig.baseUrl || ''}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">For Ollama default: http://localhost:11434/v1</p>
              </div>
            )}

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                API Key {localConfig.provider === 'openai' && <span className="text-gray-500 font-normal">(Optional for Local)</span>}
              </label>
              <input 
                type="password" 
                value={localConfig.apiKey}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Start typing..."
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="border-t border-gray-700 pt-6">
             <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <Layers className="w-3 h-3" />
                Batch Processing Optimization
             </label>
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Files per Batch</label>
                  <input 
                    type="number" 
                    min="1"
                    max="20"
                    value={localConfig.batchCount}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, batchCount: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max files to send in one prompt.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Max Batch Size (KB)</label>
                  <input 
                    type="number" 
                    min="10"
                    max="500"
                    value={localConfig.batchSizeKB}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, batchSizeKB: parseInt(e.target.value) || 10 }))}
                    className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Max content size per request.</p>
                </div>
             </div>
          </div>

        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              onSave(localConfig);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
        </div>

      </div>
    </div>
  );
};