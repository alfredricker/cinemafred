import React from 'react';
import { BufferInfo } from '../../hooks/useBufferManager';

interface BufferVisualizationProps {
  bufferInfo: BufferInfo;
  formatTime: (seconds: number) => string;
}

export const BufferVisualization: React.FC<BufferVisualizationProps> = ({ 
  bufferInfo, 
  formatTime 
}) => {
  const { ranges, current, duration } = bufferInfo;
  
  if (!duration) return null;
  
  return (
    <div className="mt-2 relative w-full h-6 bg-gray-800 rounded overflow-hidden">
      {/* Buffer ranges */}
      {ranges.map((range, index) => {
        const startPercent = (range.start / duration) * 100;
        const widthPercent = ((range.end - range.start) / duration) * 100;
        
        return (
          <div 
            key={index}
            className="absolute h-full bg-blue-600 opacity-70"
            style={{ 
              left: `${startPercent}%`, 
              width: `${widthPercent}%`
            }}
          />
        );
      })}
      
      {/* Current position */}
      <div 
        className="absolute w-1 h-full bg-white"
        style={{ left: `${(current / duration) * 100}%` }}
      />
      
      {/* Time markers */}
      <div className="absolute inset-0 flex justify-between px-2 text-xs text-white">
        <span>{formatTime(0)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};

