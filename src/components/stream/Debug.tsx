import React from 'react';
import { X } from 'lucide-react';
import { BufferInfo } from '../../hooks/useBufferManager';
import { BufferVisualization } from './Buffer';

interface DebugProps {
  isOpen: boolean;
  onClose: () => void;
  bufferInfo: BufferInfo;
  debugLog: string[];
  formatTime: (seconds: number) => string;
  onClearDebug: () => void;
  onResetBuffer: () => void;
  onForceRebuffer: () => void;
}

export const Debug: React.FC<DebugProps> = ({
  isOpen,
  onClose,
  bufferInfo,
  debugLog,
  formatTime,
  onClearDebug,
  onResetBuffer,
  onForceRebuffer
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-4xl max-h-[80vh] overflow-y-auto w-[90vw]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-white">Player Debug Information</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-1">Playback</h4>
            <div className="space-y-1 text-sm text-gray-400">
              <p>Time: {bufferInfo.current.toFixed(2)}s / {bufferInfo.duration.toFixed(2)}s</p>
              <p>State: {['NOTHING', 'METADATA', 'CURRENT', 'FUTURE', 'ENOUGH'][bufferInfo.readyState] || 'UNKNOWN'}</p>
              <p>Rate: {bufferInfo.playbackRate}x</p>
              <p>Buffering: {bufferInfo.isBuffering ? `Yes (${bufferInfo.bufferingCount}x)` : 'No'}</p>
              <p>Total Buffer Time: {(bufferInfo.totalBufferingTime / 1000).toFixed(1)}s</p>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer</h4>
            <div className="space-y-1 text-sm text-gray-400">
              <p>Loaded: {bufferInfo.loadedPercentage.toFixed(1)}%</p>
              <p>Ranges: {bufferInfo.ranges.length}</p>
              {bufferInfo.ranges.slice(0, 3).map((range, i) => (
                <p key={i} className="text-xs">
                  {i+1}: {range.start.toFixed(1)}s-{range.end.toFixed(1)}s ({(range.end - range.start).toFixed(1)}s)
                </p>
              ))}
              {bufferInfo.ranges.length > 3 && <p className="text-xs">...and {bufferInfo.ranges.length - 3} more</p>}
              {bufferInfo.lastError && (
                <p className="text-red-400 text-xs">Error: {bufferInfo.lastError}</p>
              )}
            </div>
          </div>
        </div>
        
        <h4 className="text-sm font-medium text-gray-300 mb-1">Buffer Visualization</h4>
        <BufferVisualization bufferInfo={bufferInfo} formatTime={formatTime} />
        
        <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Network Activity</h4>
        <div className="grid grid-cols-4 gap-1 mb-2 max-h-20 overflow-y-auto">
          {Array.from(bufferInfo.requestStatus).slice(-12).map(([range, status], i) => (
            <div 
              key={i} 
              className={`text-xs px-1 py-0.5 rounded text-center ${
                status === 'completed' ? 'bg-green-900 text-green-300' : 
                status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                status === 'skipped' ? 'bg-gray-700 text-gray-400' :
                'bg-red-900 text-red-300'
              }`}
              title={`${range}: ${status}`}
            >
              {status === 'skipped' ? 'S' : status[0].toUpperCase()}
            </div>
          ))}
        </div>
        
        <h4 className="text-sm font-medium text-gray-300 mt-4 mb-1">Debug Log</h4>
        <div className="bg-gray-950 p-2 rounded-lg h-32 overflow-y-auto font-mono text-xs">
          {debugLog.slice(0, 20).map((log, i) => (
            <div key={i} className="text-gray-300 leading-tight">
              {log}
            </div>
          ))}
        </div>
        
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center">
            <button
              onClick={onClearDebug}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded"
            >
              Clear Debug Data
            </button>
            
            <button
              onClick={onResetBuffer}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-sm rounded"
            >
              Reset Buffer
            </button>
            
            <button
              onClick={onForceRebuffer}
              className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded"
            >
              Force Rebuffer
            </button>
          </div>
          
          <div className="text-xs text-gray-400 text-center">
            Active Requests: {Array.from(bufferInfo.requestStatus).filter(([, status]) => status === 'pending').length} | 
            Completed: {Array.from(bufferInfo.requestStatus).filter(([, status]) => status === 'completed').length} | 
            Skipped: {Array.from(bufferInfo.requestStatus).filter(([, status]) => status === 'skipped').length}
          </div>
        </div>
      </div>
    </div>
  );
};
