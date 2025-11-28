import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface DiagramViewerProps {
  code: string;
}

export const DiagramViewer: React.FC<DiagramViewerProps> = ({ code }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  // Dedicated invisible container for Mermaid to perform layout calculations in the DOM
  const renderContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      // Basic validation
      if (!code || code.trim() === '') return;
      if (!renderContainerRef.current) return;

      try {
        // Unique ID for this render attempt to avoid collisions
        const id = `mermaid-diagram-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Clear previous content in the render container manually
        renderContainerRef.current.innerHTML = '';

        // Pass the containerRef to mermaid.render. 
        // This ensures the element exists in the DOM for BBox measurements.
        const { svg } = await mermaid.render(id, code, renderContainerRef.current);
        
        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err: any) {
        console.error("Mermaid Render Error", err);
        if (mounted) {
            // Show the error message to the user (often helpful for syntax errors)
            setError(err.message || "Failed to render diagram");
        }
      }
    };

    // Debounce to prevent rapid re-renders
    const timeout = setTimeout(renderDiagram, 500); 
    
    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [code]);

  return (
    <div className="h-full w-full bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-700 flex flex-col relative">
      <div className="bg-gray-700 px-4 py-2 border-b border-gray-600 flex justify-between items-center shrink-0">
        <span className="text-gray-200 font-semibold text-sm">Live C4 Diagram</span>
        <span className="text-xs text-gray-400">Mermaid.js</span>
      </div>
      
      <div className="flex-1 overflow-auto p-4 bg-[#1e1e1e] relative">
         {error && (
           <div className="absolute top-0 left-0 right-0 bg-red-900/90 text-red-200 p-3 text-xs font-mono z-10 border-b border-red-800 backdrop-blur-sm">
             <span className="font-bold block mb-1">Render Error:</span>
             {error}
           </div>
         )}
         
         {svg ? (
           <div 
            className="w-full h-full flex justify-center items-start"
            dangerouslySetInnerHTML={{ __html: svg }} 
           />
         ) : !error && (
           <div className="flex items-center justify-center h-full text-gray-500 text-sm animate-pulse">
             Waiting for diagram data...
           </div>
         )}
      </div>

      {/* 
        Off-screen container for Mermaid calculations.
        CRITICAL FIX: 
        1. 'opacity: 0' instead of 'visibility: hidden' ensures it's in the render tree for BBox calc.
        2. 'position: fixed' prevents it from affecting layout flow.
        3. 'width/height' ensures it has dimensions for getBBox().
        4. 'pointerEvents: none' ensures it doesn't block clicks.
      */}
      <div 
        ref={renderContainerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '1024px', 
          height: '768px',
          opacity: 0,
          zIndex: -100,
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      />
    </div>
  );
};
