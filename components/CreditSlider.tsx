"use client";

import { useState, useRef, useEffect } from "react";

interface CreditSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  plans: Array<{ price: number; credits: number; label: string }>;
  className?: string;
}

export default function CreditSlider({ 
  value, 
  onChange, 
  min, 
  max, 
  step, 
  plans,
  className = "" 
}: CreditSliderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    updateValue(e);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updateValue = (e: MouseEvent | React.MouseEvent) => {
    if (!sliderRef.current) return;
    
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    
    // Calculate which plan segment the mouse is closest to
    const totalSegments = max - min;
    const segmentWidth = 1 / totalSegments;
    const segmentIndex = Math.round(percentage / segmentWidth);
    const newValue = Math.min(max, Math.max(min, segmentIndex));
    
    if (newValue !== value) {
      onChange(newValue);
    }
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Slider Track */}
      <div className="px-1">
        <div
          ref={sliderRef}
          className="relative w-full h-2 bg-white/20 rounded-full cursor-pointer group"
          onMouseDown={handleMouseDown}
          onClick={(e) => {
            e.stopPropagation();
            updateValue(e);
          }}
        >
          {/* Progress Fill */}
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-full transition-all duration-200 ease-out"
            style={{ width: `${percentage}%` }}
          />
          
          {/* Thumb */}
          <div
            className="absolute top-1/2 w-5 h-5 bg-white rounded-full shadow-lg transform -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing transition-all duration-200 ease-out group-hover:scale-110"
            style={{ left: `${percentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500 to-indigo-500 rounded-full scale-75" />
            <div className="absolute inset-0 bg-white rounded-full scale-50" />
          </div>
          
          {/* Hover Effect */}
          <div
            className="absolute top-1/2 w-8 h-8 bg-fuchsia-500/20 rounded-full transform -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ left: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Price Indicators - Perfectly aligned with slider positions */}
      <div className="relative px-1">
        {plans.map((plan, index) => {
          const position = (index / (plans.length - 1)) * 100;
          return (
            <div 
              key={index} 
              className="absolute text-center transform -translate-x-1/2"
              style={{ left: `${position}%` }}
            >
              <div 
                className={`w-3 h-3 rounded-full mx-auto mb-2 transition-all duration-200 cursor-pointer ${
                  index === value 
                    ? 'bg-fuchsia-500 scale-110 shadow-lg shadow-fuchsia-500/30' 
                    : 'bg-white/40 hover:bg-white/60'
                }`}
                onClick={() => onChange(index)}
              />
              <div 
                className={`text-xs font-medium transition-colors duration-200 cursor-pointer whitespace-nowrap ${
                  index === value ? 'text-fuchsia-400' : 'text-white/60'
                }`}
                onClick={() => onChange(index)}
              >
                ${plan.price}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
