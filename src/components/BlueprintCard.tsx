import type { ReactNode } from 'react';

interface BlueprintCardProps {
  children: ReactNode;
  className?: string;
  corners?: boolean;
}

export default function BlueprintCard({ children, className = '', corners = true }: BlueprintCardProps) {
  return (
    <div className={`relative bg-white/90 backdrop-blur-sm border border-earth-200/80 rounded-[4px] ${className}`}>
      {corners && (
        <>
          {/* Top-left corner */}
          <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-earth-300/50 rounded-tl-[4px]" />
          {/* Top-right corner */}
          <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-earth-300/50 rounded-tr-[4px]" />
          {/* Bottom-left corner */}
          <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-earth-300/50 rounded-bl-[4px]" />
          {/* Bottom-right corner */}
          <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-earth-300/50 rounded-br-[4px]" />
        </>
      )}
      {children}
    </div>
  );
}
