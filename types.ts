export interface FileWithHandle {
  file: File;
  handle: FileSystemFileHandle;
  path: string;
}

export interface ProcessedFile extends FileWithHandle {
  id: string;
  detectedYear: number | 'Unknown';
  detectedDate: string | null; // Format YYYY-MM-DD
  summary: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface ProcessingStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
}

export type SortStatus = 'idle' | 'scanning' | 'analyzing' | 'organizing' | 'done';

// Gemini Response Schema
export interface DateExtractionResponse {
  year: number | null;
  fullDate: string | null;
  summary: string;
}
