
import React, { memo, useCallback, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { useProceduralStore } from '../store/ProceduralContext';
import { PSDNodeData, VisualAnchor, KnowledgeContext } from '../types';
import { BookOpen, Image as ImageIcon, FileText, Trash2, UploadCloud, BrainCircuit, Loader2, CheckCircle2, AlertCircle, X, Layers, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI } from "@google/genai";
import { BaseNodeShell } from './shared/BaseNodeShell';

// Initialize PDF Worker from CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

interface StagedFile {
  id: string;
  file?: File;
  type: 'pdf' | 'image';
  preview?: string;
  status: 'idle' | 'parsing' | 'complete' | 'error';
  extractedText?: string;
  visualAnchor?: VisualAnchor;
  errorMsg?: string;
}

const extractTextFromPdf = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        const CHAR_LIMIT = 10000;
        for (let i = 1; i <= pdf.numPages; i++) {
            if (fullText.length >= CHAR_LIMIT) break;
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        fullText = fullText.replace(/\s+/g, ' ').trim();
        if (fullText.length > CHAR_LIMIT) fullText = fullText.substring(0, CHAR_LIMIT) + '... [TRUNCATED]';
        return fullText;
    } catch (error) {
        throw new Error("Failed to parse PDF content.");
    }
};

const optimizeImage = (file: File): Promise<VisualAnchor> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX_DIM = 512;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } }
                else { if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; } }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) { reject(new Error("Canvas context failed")); return; }
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1] });
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    });
};

export const KnowledgeNode = memo(({ id, data }: NodeProps<PSDNodeData>) => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDistilling, setIsDistilling] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { registerKnowledge, unregisterNode } = useProceduralStore();
  const { setNodes, setEdges } = useReactFlow();

  useEffect(() => {
    if (data.knowledgeContext && !lastSynced) {
        registerKnowledge(id, data.knowledgeContext);
        setLastSynced(Date.now());
    }
  }, [data.knowledgeContext, id, registerKnowledge, lastSynced]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newStaged: StagedFile[] = [];
    Array.from(files).forEach((file) => {
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');
      if (isPdf || isImage) {
        const stagedId = `${file.name}-${Date.now()}`;
        const staged: StagedFile = { id: stagedId, file, type: isPdf ? 'pdf' : 'image', preview: isImage ? URL.createObjectURL(file) : undefined, status: 'parsing' };
        newStaged.push(staged);
        (async () => {
            try {
                if (isPdf) {
                    const text = await extractTextFromPdf(file);
                    setStagedFiles(prev => prev.map(f => f.id === stagedId ? { ...f, status: 'complete', extractedText: text } : f));
                } else {
                    const anchor = await optimizeImage(file);
                    setStagedFiles(prev => prev.map(f => f.id === stagedId ? { ...f, status: 'complete', visualAnchor: anchor } : f));
                }
            } catch (err) {
                setStagedFiles(prev => prev.map(f => f.id === stagedId ? { ...f, status: 'error' } : f));
            }
        })();
      }
    });
    setStagedFiles(prev => [...prev, ...newStaged]);
  }, []);

  const removeFile = (fileId: string) => {
    setStagedFiles(prev => {
        const target = prev.find(f => f.id === fileId);
        if (target?.preview) URL.revokeObjectURL(target.preview);
        return prev.filter(f => f.id !== fileId);
    });
    setLastSynced(null);
  };

  const distillKnowledge = async () => {
    setIsDistilling(true);
    try {
        const rawText = stagedFiles.filter(f => f.type === 'pdf' && f.extractedText).map(f => f.extractedText).join('\n\n');
        const visualAnchors = stagedFiles.filter(f => f.type === 'image' && f.visualAnchor).map(f => f.visualAnchor!);
        let finalRules = rawText.length > 0 ? "Processed brand manual content." : "Visual anchors active.";
        const context: KnowledgeContext = { sourceNodeId: id, rules: finalRules, visualAnchors: visualAnchors };
        registerKnowledge(id, context);
        setLastSynced(Date.now());
        setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, knowledgeContext: context } } : n));
    } finally { setIsDistilling(false); }
  };

  const displayAnchors = stagedFiles.length > 0 
    ? stagedFiles.filter(f => f.type === 'image' && f.status === 'complete' && f.preview).map(f => ({ id: f.id, preview: f.preview!, isPersisted: false }))
    : (data.knowledgeContext?.visualAnchors || []).map((anchor, i) => ({ id: `p-${i}`, preview: `data:${anchor.mimeType};base64,${anchor.data}`, isPersisted: true }));

  const handleMinimize = () => setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, isMinimized: !n.data.isMinimized } } : n));
  const handleDelete = () => {
      unregisterNode(id);
      setNodes(nds => nds.filter(n => n.id !== id));
      setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  };

  return (
    <BaseNodeShell
      id={id}
      title="Project Brain"
      icon={<BrainCircuit className="w-4 h-4 text-teal-400" />}
      isMinimized={data.isMinimized}
      onMinimize={handleMinimize}
      onDelete={handleDelete}
      headerColorClass="bg-teal-950 border-teal-800"
      className="w-[300px]"
    >
      <div className="space-y-3">
        <div 
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center transition-all cursor-pointer ${isDragging ? 'border-teal-400 bg-teal-900/20' : 'border-slate-600 hover:border-teal-500/50 hover:bg-slate-700/50'}`}
        >
          <input type="file" multiple accept=".pdf,image/*" ref={fileInputRef} className="hidden" onChange={(e) => processFiles(e.target.files)} />
          <UploadCloud className="w-8 h-8 mb-2 text-slate-500" />
          <span className="text-[10px] text-slate-400 text-center uppercase tracking-wider font-bold">Drop Guidelines</span>
        </div>

        {displayAnchors.length > 0 && (
          <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar">
            {displayAnchors.map(file => (
              <div key={file.id} className="relative w-12 h-12 rounded border border-slate-700 overflow-hidden shrink-0">
                <img src={file.preview} className="w-full h-full object-cover" />
                {!file.isPersisted && <button onClick={() => removeFile(file.id)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"><X className="w-4 h-4 text-white" /></button>}
              </div>
            ))}
          </div>
        )}

        <button onClick={distillKnowledge} disabled={stagedFiles.length === 0 || isDistilling} className={`w-full py-2 text-[10px] font-bold uppercase tracking-wider rounded transition-all ${isDistilling ? 'bg-slate-700 text-slate-500' : 'bg-teal-600 hover:bg-teal-500 text-white'}`}>
          {isDistilling ? 'Processing...' : 'Distill & Sync'}
        </button>
      </div>
      <Handle type="source" position={Position.Right} id="source-out-knowledge" className={`!w-3 !h-3 !border-2 ${lastSynced ? '!bg-teal-500 !border-white' : '!bg-slate-600 !border-slate-400'}`} />
    </BaseNodeShell>
  );
});
