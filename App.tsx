import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, Save, Upload as UploadIcon, FileJson, Settings, AlertCircle, Trash2, Layout, FolderOpen } from 'lucide-react';
import { ProcessingStatus, ProjectState, LogEntry, SavedState, FileEntry, LLMConfig } from './types';
import { generateC4Update, FileInput, C4UpdateResult } from './services/llmService';
import { Terminal } from './components/Terminal';
import { DiagramViewer } from './components/DiagramViewer';
import { FileUploader } from './components/FileUploader';
import { FileList } from './components/FileList';
import { SettingsModal } from './components/SettingsModal';
import { OVERVIEW_DIAGRAM_KEY, INITIAL_OVERVIEW_MERMAID, MAX_FILE_SIZE_BYTES, DEFAULT_BATCH_COUNT, DEFAULT_BATCH_SIZE_KB } from './constants';

const AUTOSAVE_KEY = 'codemapper_autosave_v1';

const App: React.FC = () => {
  // --- State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'google',
    apiKey: process.env.API_KEY || '',
    modelName: 'gemini-2.5-flash',
    batchCount: DEFAULT_BATCH_COUNT,
    batchSizeKB: DEFAULT_BATCH_SIZE_KB
  });

  const [state, setState] = useState<ProjectState>({
    projectName: 'New Project',
    files: [],
    processedCount: 0,
    totalCount: 0,
    currentFileIndex: 0,
    isProcessing: false,
    diagrams: { [OVERVIEW_DIAGRAM_KEY]: INITIAL_OVERVIEW_MERMAID },
    activeDiagramId: OVERVIEW_DIAGRAM_KEY,
    logs: [],
    startTime: null
  });

  // Ref to hold current state for async loop access to avoid closure staleness
  const stateRef = useRef(state);
  const configRef = useRef(llmConfig);
  
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { configRef.current = llmConfig; }, [llmConfig]);

  // --- Auto-Save Logic ---
  useEffect(() => {
    // Only auto-save if we have actual progress
    if (state.processedCount > 0 && state.projectName !== 'New Project') {
      const saved: SavedState = {
        projectName: state.projectName,
        processedCount: state.processedCount,
        currentFileIndex: state.currentFileIndex,
        diagrams: state.diagrams,
        logs: state.logs.slice(-50), // Keep last 50 logs to save space
        filePathsProcessed: state.files
          .filter(f => f.status === ProcessingStatus.COMPLETED || f.status === ProcessingStatus.SKIPPED)
          .map(f => f.path)
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saved));
    }
  }, [state.processedCount, state.diagrams, state.projectName]);

  // --- Helpers ---

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { timestamp: Date.now(), level, message }]
    }));
  };

  /**
   * Generates a simple ASCII tree representation of the current file list
   */
  const buildFileTree = useCallback((files: FileEntry[]): string => {
    const paths = files.map(f => f.path);
    const root: any = {};
    
    paths.forEach(path => {
      const parts = path.split('/');
      let current = root;
      parts.forEach((part, i) => {
        if (!current[part]) {
          current[part] = i === parts.length - 1 ? null : {};
        }
        current = current[part];
      });
    });

    const lines: string[] = [];
    const printNode = (node: any, prefix: string = '', isLast: boolean = true) => {
      const keys = Object.keys(node).sort();
      keys.forEach((key, index) => {
        const isLastItem = index === keys.length - 1;
        const connector = isLastItem ? '└── ' : '├── ';
        lines.push(`${prefix}${connector}${key}`);
        
        if (node[key] !== null) {
          const childPrefix = prefix + (isLastItem ? '    ' : '│   ');
          printNode(node[key], childPrefix, isLastItem);
        }
      });
    };

    printNode(root);
    return lines.join('\n');
  }, []);

  const handleFilesSelected = (selectedFiles: File[]) => {
    // 1. Convert to FileEntries
    const fileEntries: FileEntry[] = selectedFiles.map(f => ({
      path: f.webkitRelativePath || f.name,
      name: f.name,
      extension: f.name.substring(f.name.lastIndexOf('.')),
      size: f.size,
      handle: f,
      status: ProcessingStatus.PENDING
    }));

    // Sort by path so files in the same directory are processed sequentially
    fileEntries.sort((a, b) => a.path.localeCompare(b.path));
    const projectName = fileEntries[0]?.path.split('/')[0] || 'Project';

    // 2. Check for Auto-Save
    let restoredState: Partial<ProjectState> = {};
    let logs: LogEntry[] = [{ timestamp: Date.now(), level: 'info', message: `Loaded ${fileEntries.length} supported files.` }];

    try {
      const savedRaw = localStorage.getItem(AUTOSAVE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw) as SavedState;
        
        // If it looks like the same project
        if (saved.projectName === projectName) {
           console.log("Restoring from Auto-save...");
           logs.push({ timestamp: Date.now(), level: 'success', message: 'Restored previous session from browser storage.' });
           
           // Restore status
           fileEntries.forEach(f => {
             if (saved.filePathsProcessed.includes(f.path)) {
               f.status = ProcessingStatus.COMPLETED;
             }
           });
           
           const nextIndex = fileEntries.findIndex(f => f.status === ProcessingStatus.PENDING);
           
           restoredState = {
             diagrams: saved.diagrams, // Restore multiple diagrams
             processedCount: saved.processedCount,
             currentFileIndex: nextIndex === -1 ? fileEntries.length : nextIndex, 
             activeDiagramId: OVERVIEW_DIAGRAM_KEY
           };
        }
      }
    } catch (e) {
      console.error("Failed to restore auto-save", e);
    }

    // 3. Set State
    setState(prev => ({
      ...prev,
      projectName,
      files: fileEntries,
      totalCount: fileEntries.length,
      processedCount: 0,
      currentFileIndex: 0,
      diagrams: { [OVERVIEW_DIAGRAM_KEY]: INITIAL_OVERVIEW_MERMAID },
      activeDiagramId: OVERVIEW_DIAGRAM_KEY,
      logs: logs,
      ...restoredState 
    }));
  };

  const handleRetry = (index: number) => {
    setState(prev => {
      const newFiles = [...prev.files];
      newFiles[index] = { ...newFiles[index], status: ProcessingStatus.PENDING, error: undefined };
      const newIndex = Math.min(prev.currentFileIndex, index);
      return {
        ...prev,
        files: newFiles,
        currentFileIndex: newIndex,
        processedCount: prev.processedCount > 0 ? prev.processedCount - 1 : 0
      };
    });
    addLog(`Reset file for retry: ${state.files[index].name}`, 'info');
  };

  const handleSaveState = () => {
    const saved: SavedState = {
      projectName: state.projectName,
      processedCount: state.processedCount,
      currentFileIndex: state.currentFileIndex,
      diagrams: state.diagrams,
      logs: state.logs,
      filePathsProcessed: state.files.slice(0, state.currentFileIndex).map(f => f.path)
    };
    
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codemapper-${state.projectName}-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('State saved manually.', 'success');
  };

  const handleClearData = () => {
    if(confirm("Are you sure you want to clear saved browser data?")) {
        localStorage.removeItem(AUTOSAVE_KEY);
        addLog('Browser auto-save cleared.', 'warn');
    }
  };

  const handleLoadState = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as SavedState;
        
        setState(prev => {
           let updatedFiles = [...prev.files];
           if (updatedFiles.length > 0) {
             updatedFiles = updatedFiles.map(f => {
               if (json.filePathsProcessed.includes(f.path)) {
                 return { ...f, status: ProcessingStatus.COMPLETED };
               }
               return f;
             });
           }

           return {
             ...prev,
             projectName: json.projectName,
             diagrams: json.diagrams, // Load diagrams map
             logs: [...json.logs, { timestamp: Date.now(), level: 'warn', message: 'State loaded.' }],
             processedCount: json.processedCount,
             currentFileIndex: json.currentFileIndex, 
             activeDiagramId: OVERVIEW_DIAGRAM_KEY
           };
        });
      } catch (err) {
        addLog('Failed to load state file.', 'error');
      }
    };
    reader.readAsText(file);
  };

  // --- Core Processing Loop (Batched & Directory Aware) ---

  const processNextFile = useCallback(async () => {
    const current = stateRef.current;
    const config = configRef.current;
    
    const batchSizeLimitBytes = (config.batchSizeKB || DEFAULT_BATCH_SIZE_KB) * 1024;
    const batchCountLimit = config.batchCount || DEFAULT_BATCH_COUNT;

    if (!current.isProcessing) return;
    if (current.currentFileIndex >= current.files.length) {
      setState(prev => ({ ...prev, isProcessing: false }));
      addLog('All files processed!', 'success');
      return;
    }

    // 1. Identify valid batch
    const batchIndices: number[] = [];
    let currentBatchSize = 0;
    let idx = current.currentFileIndex;
    let currentBatchDir: string | null = null; // Enforce batch per folder

    while (
      idx < current.files.length && 
      batchIndices.length < batchCountLimit
    ) {
      const file = current.files[idx];
      
      if (file.status === ProcessingStatus.SKIPPED || file.status === ProcessingStatus.COMPLETED) {
        idx++;
        continue;
      }
      
      // Directory Consistency Check: Break batch if folder changes
      const fileDir = file.path.substring(0, file.path.lastIndexOf('/'));
      if (currentBatchDir === null) {
          currentBatchDir = fileDir;
      } else if (currentBatchDir !== fileDir && batchIndices.length > 0) {
          // Break batch here so we send a coherent module to LLM
          break; 
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        if (batchIndices.length === 0) {
           batchIndices.push(idx); // Single large file, skip logic handled below
           break;
        } else {
           break;
        }
      }

      if (currentBatchSize + file.size > batchSizeLimitBytes) {
        if (batchIndices.length === 0) batchIndices.push(idx);
        break;
      }

      batchIndices.push(idx);
      currentBatchSize += file.size;
      idx++;
    }

    if (batchIndices.length === 0) {
      setState(prev => ({ ...prev, currentFileIndex: idx }));
      setTimeout(processNextFile, 0);
      return;
    }

    // 2. Prepare Batch
    const filesToProcess = batchIndices.map(i => current.files[i]);
    const batchDirName = currentBatchDir || 'root';
    
    // Large file skip check
    if (filesToProcess.length === 1 && filesToProcess[0].size > MAX_FILE_SIZE_BYTES) {
       const fileEntry = filesToProcess[0];
       addLog(`Skipped large file: ${fileEntry.name}`, 'warn');
       setState(prev => {
          const newFiles = [...prev.files];
          newFiles[batchIndices[0]].status = ProcessingStatus.SKIPPED;
          return { 
            ...prev, 
            files: newFiles, 
            currentFileIndex: batchIndices[0] + 1,
            processedCount: prev.processedCount + 1
          };
       });
       setTimeout(processNextFile, 10);
       return;
    }

    // 3. Process Batch
    try {
      addLog(`Analyzing ${filesToProcess.length} files in '${batchDirName}'...`, 'info');
      
      setState(prev => {
        const newFiles = [...prev.files];
        batchIndices.forEach(i => newFiles[i].status = ProcessingStatus.PROCESSING);
        return { ...prev, files: newFiles };
      });

      const fileInputs: FileInput[] = [];
      for (const f of filesToProcess) {
        const text = await f.handle.text();
        fileInputs.push({ name: f.path, content: text });
      }
      
      const projectTree = buildFileTree(current.files);
      const currentOverview = current.diagrams[OVERVIEW_DIAGRAM_KEY];
      const currentModule = current.diagrams[batchDirName] || null;

      // CALL LLM
      const result: C4UpdateResult = await generateC4Update(
        currentOverview,
        currentModule,
        fileInputs,
        projectTree,
        configRef.current
      );

      // Success Update
      setState(prev => {
        const newFiles = [...prev.files];
        batchIndices.forEach(i => newFiles[i].status = ProcessingStatus.COMPLETED);
        const nextIndex = Math.max(...batchIndices) + 1;

        return {
          ...prev,
          files: newFiles,
          diagrams: {
            ...prev.diagrams,
            [OVERVIEW_DIAGRAM_KEY]: result.overviewDiagram,
            [batchDirName]: result.moduleDiagram
          },
          currentFileIndex: nextIndex,
          processedCount: prev.processedCount + batchIndices.length
        };
      });

      addLog(`Updated diagrams for '${batchDirName}'`, 'success');
      setTimeout(processNextFile, 500);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error processing batch: ${errorMessage}`, 'error');
      
      setState(prev => {
        const newFiles = [...prev.files];
        batchIndices.forEach(i => {
            newFiles[i].status = ProcessingStatus.FAILED;
            newFiles[i].error = errorMessage;
        });
        return { 
          ...prev, 
          files: newFiles, 
          isProcessing: false 
        };
      });
    }
  }, [buildFileTree]); 

  useEffect(() => {
    if (state.isProcessing) {
      processNextFile();
    }
  }, [state.isProcessing, processNextFile]);


  // --- API Key / Config Handling ---
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && window.aistudio.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
            setLlmConfig(prev => ({...prev, apiKey: 'IDX_MANAGED', provider: 'google'}));
        }
      }
    };
    checkKey();
  }, []);


  // --- Render ---
  const activeDiagramCode = state.diagrams[state.activeDiagramId] || '';
  const diagramKeys = Object.keys(state.diagrams).sort((a,b) => {
    if (a === OVERVIEW_DIAGRAM_KEY) return -1;
    if (b === OVERVIEW_DIAGRAM_KEY) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        config={llmConfig}
        onSave={(newConfig) => {
            setLlmConfig(newConfig);
            addLog(`Configuration updated: Provider set to ${newConfig.provider}`, 'info');
        }}
      />

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 h-16 shrink-0 flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <FileJson className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">CodeMapper <span className="text-gray-500 font-normal">C4 Multi-View</span></h1>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded-md text-sm transition-colors border border-gray-600"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <div className="h-6 w-px bg-gray-700"></div>
          <label className="cursor-pointer text-gray-400 hover:text-white transition-colors">
             <UploadIcon className="w-5 h-5" />
             <input type="file" onChange={handleLoadState} accept=".json" className="hidden" />
          </label>
          <button onClick={handleSaveState} disabled={state.processedCount === 0} className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
            <Save className="w-5 h-5" />
          </button>
          <button onClick={handleClearData} className="text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left: Files */}
        <div className="w-1/4 min-w-[300px] flex flex-col border-r border-gray-700 bg-[#1e1e1e]">
          <div className="p-4 border-b border-gray-700 bg-gray-800/50 shrink-0">
            {state.files.length === 0 ? (
              <FileUploader onFilesSelected={handleFilesSelected} disabled={!llmConfig.apiKey && llmConfig.provider === 'google'} />
            ) : (
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-4">
                  <h2 className="font-semibold text-white truncate text-sm mb-1">{state.projectName}</h2>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="shrink-0">{state.processedCount} / {state.totalCount}</span>
                    <div className="h-1.5 w-full max-w-[120px] bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${(state.processedCount / (state.totalCount || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setState(prev => ({...prev, isProcessing: !prev.isProcessing}))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-medium text-xs sm:text-sm transition-all shadow-lg shrink-0 ${
                    state.isProcessing ? 'bg-yellow-500/90 text-black' : 'bg-green-600/90 text-white'
                  }`}
                >
                  {state.isProcessing ? <><Pause className="w-3 h-3 fill-current" /> Pause</> : <><Play className="w-3 h-3 fill-current" /> Start</>}
                </button>
              </div>
            )}
          </div>
          {state.files.length > 0 && <FileList files={state.files} currentIndex={state.currentFileIndex} onRetry={handleRetry} />}
          <div className="h-48 border-t border-gray-700 flex flex-col shrink-0"><Terminal logs={state.logs} /></div>
        </div>

        {/* Center: Diagram */}
        <div className="flex-1 bg-gray-900 p-4 relative flex flex-col">
          <DiagramViewer code={activeDiagramCode} />
        </div>

        {/* Right: Diagram Navigator */}
        {state.files.length > 0 && (
            <div className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
                <div className="p-3 border-b border-gray-700 font-semibold text-gray-400 text-xs uppercase tracking-wider flex items-center gap-2">
                    <Layout className="w-4 h-4" /> Diagrams
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {diagramKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => setState(prev => ({...prev, activeDiagramId: key}))}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm truncate flex items-center gap-2 transition-colors ${
                                state.activeDiagramId === key 
                                    ? 'bg-blue-600 text-white' 
                                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                            }`}
                        >
                            {key === OVERVIEW_DIAGRAM_KEY ? <Layout className="w-4 h-4 shrink-0" /> : <FolderOpen className="w-4 h-4 shrink-0 text-yellow-500" />}
                            <span className="truncate" title={key}>{key}</span>
                        </button>
                    ))}
                </div>
            </div>
        )}

      </main>
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4 text-xs text-gray-500 shrink-0">
         <span>Model: {llmConfig.modelName}</span>
      </div>
    </div>
  );
};

export default App;