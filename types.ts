export enum ProcessingStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED'
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  handle: File; // Browser File object
  status: ProcessingStatus;
  error?: string;
}

export interface ProjectState {
  projectName: string;
  files: FileEntry[];
  processedCount: number;
  totalCount: number;
  currentFileIndex: number;
  isProcessing: boolean;
  generatedMermaid: string;
  logs: LogEntry[];
  startTime: number | null;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface SavedState {
  projectName: string;
  processedCount: number;
  currentFileIndex: number;
  generatedMermaid: string;
  logs: LogEntry[];
  // We cannot save File objects to JSON, so on resume, we map by path
  filePathsProcessed: string[]; 
}

export interface LLMConfig {
  provider: string;
  apiKey: string;
  modelName: string;
  baseUrl?: string;
  // Batch settings
  batchCount: number;
  batchSizeKB: number;
}

export const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', // Javascript/Typescript
  '.py', // Python
  '.php', // PHP
  '.go', // Golang
  '.java', // Java
];