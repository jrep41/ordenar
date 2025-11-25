import React, { useState, useCallback, useRef } from 'react';
import { getFilesRecursively, organizeFilesToDestination } from './services/fileSystem';
import { analyzeFileDate } from './services/geminiService';
import { ProcessedFile, ProcessingStats, SortStatus } from './types';
import { FolderOpen, FileText, ImageIcon, Loader2, Save, ArrowRight, FolderInput, FileCheck, AlertCircle } from './components/Icons';

// Add type definition for showDirectoryPicker
declare global {
  interface Window {
    showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

const MAX_CONCURRENT_REQUESTS = 3;

export default function App() {
  const [sourceHandle, setSourceHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [status, setStatus] = useState<SortStatus>('idle');
  const [stats, setStats] = useState<ProcessingStats>({ total: 0, processed: 0, success: 0, failed: 0 });
  const [currentAction, setCurrentAction] = useState<string>('');
  
  // Ref for cancellation (optional, simplified here)
  const isProcessingRef = useRef(false);

  // 1. Select Source Directory
  const handleSelectSource = async () => {
    try {
      const handle = await window.showDirectoryPicker({
        id: 'source-folder',
        mode: 'read',
      });
      setSourceHandle(handle);
      setStatus('scanning');
      setCurrentAction('Scanning directory...');
      
      const rawFiles = await getFilesRecursively(handle);
      
      const initialProcessedFiles: ProcessedFile[] = rawFiles.map((f, i) => ({
        ...f,
        id: `file-${i}`,
        detectedYear: 'Unknown',
        detectedDate: null,
        summary: 'Pending analysis...',
        status: 'pending'
      }));

      setFiles(initialProcessedFiles);
      setStats({ total: initialProcessedFiles.length, processed: 0, success: 0, failed: 0 });
      setStatus('idle');
      setCurrentAction(`${initialProcessedFiles.length} files found.`);
      
    } catch (err) {
      console.error("Error selecting folder:", err);
      // User likely cancelled
    }
  };

  // 2. Analyze Files (OCR/AI)
  const handleAnalyze = async () => {
    if (files.length === 0) return;
    
    setStatus('analyzing');
    isProcessingRef.current = true;
    
    // We need to process files in chunks to avoid rate limits
    const pendingFiles = files.filter(f => f.status === 'pending');
    let processedCount = 0;
    
    // Helper to process a single file
    const processSingleFile = async (fileId: string) => {
       const fileIndex = files.findIndex(f => f.id === fileId);
       if (fileIndex === -1) return;

       const fileItem = files[fileIndex];
       
       // Update status to processing
       setFiles(prev => {
         const newFiles = [...prev];
         newFiles[fileIndex] = { ...newFiles[fileIndex], status: 'processing' };
         return newFiles;
       });

       try {
         const result = await analyzeFileDate(fileItem.file);
         
         setFiles(prev => {
            const newFiles = [...prev];
            const idx = newFiles.findIndex(f => f.id === fileId);
            if (idx !== -1) {
              newFiles[idx] = {
                ...newFiles[idx],
                status: 'completed',
                detectedYear: result.year || 'Unknown',
                detectedDate: result.fullDate,
                summary: result.summary
              };
            }
            return newFiles;
         });
         
         setStats(prev => ({ ...prev, processed: prev.processed + 1, success: prev.success + 1 }));

       } catch (error) {
         setFiles(prev => {
            const newFiles = [...prev];
            const idx = newFiles.findIndex(f => f.id === fileId);
            if (idx !== -1) {
              newFiles[idx] = { ...newFiles[idx], status: 'error', error: 'Analysis failed' };
            }
            return newFiles;
         });
         setStats(prev => ({ ...prev, processed: prev.processed + 1, failed: prev.failed + 1 }));
       }
    };

    // Execution Queue
    for (let i = 0; i < pendingFiles.length; i += MAX_CONCURRENT_REQUESTS) {
      if (!isProcessingRef.current) break;
      
      const chunk = pendingFiles.slice(i, i + MAX_CONCURRENT_REQUESTS);
      await Promise.all(chunk.map(f => processSingleFile(f.id)));
      
      setCurrentAction(`Analyzed ${Math.min(i + MAX_CONCURRENT_REQUESTS, pendingFiles.length)} / ${pendingFiles.length} files...`);
    }

    setStatus('done');
    setCurrentAction('Analysis complete. Ready to organize.');
    isProcessingRef.current = false;
  };

  // 3. Save / Organize
  const handleOrganize = async () => {
    try {
      const destHandle = await window.showDirectoryPicker({
        id: 'dest-folder',
        mode: 'readwrite',
      });
      
      setStatus('organizing');
      
      await organizeFilesToDestination(files, destHandle, (current, total, name) => {
        setCurrentAction(`Copying (${current}/${total}): ${name}`);
        setStats(prev => ({ ...prev, processed: current })); // Reuse stats for progress bar
      });

      setStatus('done');
      setCurrentAction('All files successfully organized!');
      alert("Organization Complete!");
      
    } catch (err) {
      console.error("Error organizing:", err);
      setStatus('done'); // Revert to done state if cancelled
    }
  };

  // Render Helpers
  const renderFileIcon = (mime: string) => {
    if (mime.includes('pdf')) return <FileText className="w-8 h-8 text-red-400" />;
    if (mime.includes('image')) return <ImageIcon className="w-8 h-8 text-blue-400" />;
    return <FileText className="w-8 h-8 text-slate-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-6 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Chronos DocOrganizer
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sort PDFs and Images by internal dates using Gemini AI
          </p>
        </div>
        <div className="flex gap-4 items-center">
            {/* Stats */}
            <div className="flex gap-4 text-xs font-mono mr-4 bg-slate-800 p-2 rounded-lg border border-slate-700">
               <span className="text-blue-300">Total: {stats.total}</span>
               <span className="text-green-400">Success: {stats.success}</span>
               <span className="text-red-400">Failed: {stats.failed}</span>
            </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar / Controls */}
        <aside className="w-80 bg-slate-900 border-r border-slate-800 p-6 flex flex-col gap-6 z-10">
          
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">1. Select Source</h2>
            <button 
              onClick={handleSelectSource}
              disabled={status !== 'idle' && status !== 'done'}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800 transition-all text-slate-300 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FolderOpen className="w-6 h-6 group-hover:text-blue-400 transition-colors" />
              <span>{sourceHandle ? sourceHandle.name : 'Choose Folder'}</span>
            </button>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">2. Analyze Dates</h2>
            <button 
              onClick={handleAnalyze}
              disabled={files.length === 0 || status === 'analyzing' || status === 'organizing' || files.every(f => f.status === 'completed')}
              className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition-all shadow-lg
                ${status === 'analyzing' ? 'bg-blue-600/50 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 text-white'}
                disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none
              `}
            >
              {status === 'analyzing' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileCheck className="w-5 h-5" />}
              <span>{status === 'analyzing' ? 'Analyzing...' : 'Start Analysis'}</span>
            </button>
            <p className="text-xs text-slate-500 leading-relaxed">
              Uses Gemini 2.5 Flash to read dates inside documents/images.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">3. Export</h2>
            <button 
              onClick={handleOrganize}
              disabled={status !== 'done' || stats.success === 0}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
            >
              <Save className="w-5 h-5" />
              <span>Organize & Save</span>
            </button>
            <p className="text-xs text-slate-500 leading-relaxed">
              Creates folders (e.g., /2024, /2025) in destination and copies files.
            </p>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-800">
             <div className="text-xs text-slate-500 mb-1">Status Log:</div>
             <div className="text-sm text-blue-300 truncate animate-pulse">
                {currentAction || 'Ready'}
             </div>
          </div>
        </aside>

        {/* File Grid */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-950">
          
          {files.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                <FolderInput className="w-16 h-16 opacity-20" />
                <p className="text-lg">Select a source folder to begin.</p>
             </div>
          ) : (
            <>
              <div className="flex justify-between items-end mb-6">
                <h2 className="text-xl font-semibold text-slate-200">
                  Files Found ({files.length})
                </h2>
                {status === 'analyzing' && (
                  <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(stats.processed / stats.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {files.map((file) => (
                  <div 
                    key={file.id} 
                    className={`
                      relative p-4 rounded-xl border transition-all duration-200 group
                      ${file.status === 'processing' ? 'border-blue-500 bg-blue-900/10' : ''}
                      ${file.status === 'completed' ? 'border-emerald-500/30 bg-emerald-900/5 hover:bg-emerald-900/10' : ''}
                      ${file.status === 'error' ? 'border-red-500/30 bg-red-900/5' : ''}
                      ${file.status === 'pending' ? 'border-slate-800 bg-slate-900 hover:border-slate-700' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between mb-3">
                      {renderFileIcon(file.file.type)}
                      <div className={`px-2 py-1 rounded text-xs font-bold
                        ${file.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}
                      `}>
                        {file.detectedYear}
                      </div>
                    </div>
                    
                    <h3 className="font-medium text-sm text-slate-200 truncate mb-1" title={file.file.name}>
                      {file.file.name}
                    </h3>
                    
                    <p className="text-xs text-slate-500 truncate mb-2">
                      {file.path}
                    </p>

                    <div className="h-12 text-xs text-slate-400 bg-slate-950/50 rounded p-2 overflow-hidden text-ellipsis leading-tight">
                       {file.status === 'processing' ? (
                         <span className="flex items-center gap-2 text-blue-400">
                           <Loader2 className="w-3 h-3 animate-spin" /> Scanning...
                         </span>
                       ) : (
                         file.summary
                       )}
                       {file.status === 'error' && <span className="text-red-400">{file.error}</span>}
                    </div>

                    {file.detectedDate && (
                      <div className="absolute bottom-4 right-4 text-[10px] text-slate-600 font-mono">
                        {file.detectedDate}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}