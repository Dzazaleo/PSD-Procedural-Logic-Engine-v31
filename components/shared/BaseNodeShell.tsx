
import React, { useEffect } from 'react';
import { useUpdateNodeInternals } from 'reactflow';
import { Minus, X, Maximize2 } from 'lucide-react';

interface BaseNodeShellProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  isMinimized?: boolean;
  onMinimize: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  headerColorClass?: string;
  className?: string;
  statusBadge?: React.ReactNode;
}

export const BaseNodeShell: React.FC<BaseNodeShellProps> = ({
  id,
  title,
  icon,
  isMinimized,
  onMinimize,
  onDelete,
  children,
  headerColorClass = 'bg-slate-900 border-slate-700',
  className = '',
  statusBadge
}) => {
  const updateNodeInternals = useUpdateNodeInternals();

  // Edge Sync: Trigger React Flow recalculation when height changes via minimization
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, isMinimized, updateNodeInternals]);

  return (
    <div 
      className={`
        relative rounded-lg shadow-2xl border font-sans transition-all duration-300
        ${isMinimized ? 'w-64 border-slate-600 bg-slate-800' : `bg-slate-800 border-slate-600 ${className}`}
        ${isMinimized ? 'is-minimized' : ''}
      `}
    >
      {/* Dynamic Handle Coalescing Styles */}
      <style>{`
        .is-minimized .react-flow__handle {
          top: 18px !important;
          transform: translateY(-50%) !important;
          z-index: 100 !important;
          opacity: 0.9;
        }
        .is-minimized .react-flow__handle-left {
          left: -4px !important;
        }
        .is-minimized .react-flow__handle-right {
          right: -4px !important;
        }
      `}</style>

      {/* Header */}
      <div 
        className={`
          flex items-center justify-between p-2 border-b rounded-t-lg transition-colors
          ${headerColorClass}
        `}
      >
        <div className="flex items-center space-x-2 overflow-hidden mr-2">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="flex flex-col leading-none overflow-hidden">
            <span className="text-xs font-bold text-slate-100 truncate tracking-tight">{title}</span>
            {!isMinimized && statusBadge}
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); onMinimize(); }}
            className="nodrag nopan p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="nodrag nopan p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-colors"
            title="Delete Node"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div 
        className={`
          transition-all duration-300 ease-in-out origin-top
          ${isMinimized ? 'h-0 opacity-0 overflow-hidden pointer-events-none' : 'h-auto opacity-100 p-4'}
        `}
      >
        {children}
      </div>
    </div>
  );
};
