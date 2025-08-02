import React, { useEffect, useRef, useCallback } from 'react';

interface UV {
  x: number;
  y: number;
}

interface TextureResult {
  type: string;
  x: number;
  y: number;
}

type FragmentShader = (uv: UV) => TextureResult;

interface LiquidGlassProps {
  width?: number;
  height?: number;
  fragment?: FragmentShader;
}

// Utility functions
const smoothStep = (a: number, b: number, t: number): number => {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const length = (x: number, y: number): number => {
  return Math.sqrt(x * x + y * y);
};

const roundedRectSDF = (x: number, y: number, width: number, height: number, radius: number): number => {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius;
};

const texture = (x: number, y: number): TextureResult => {
  return { type: 't', x, y };
};

// Generate unique ID
const generateId = (): string => {
  return 'liquid-glass-' + Math.random().toString(36).substring(2, 11);
};

// Default fragment shader equivalent to the original
const defaultFragment: FragmentShader = (uv) => {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;
  const distanceToEdge = roundedRectSDF(
    ix,
    iy,
    0.3,
    0.2,
    0.6
  );
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
  const scaled = smoothStep(0, 1, displacement);
  return texture(ix * scaled + 0.5, iy * scaled + 0.5);
};

const LiquidGlass: React.FC<LiquidGlassProps> = ({ 
  width = 300, 
  height = 200, 
  fragment = defaultFragment 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const feDisplacementMapRef = useRef<SVGFEDisplacementMapElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const idRef = useRef(generateId());
  const canvasDPI = 1;

  const updateShader = useCallback(() => {
    if (!canvasRef.current || !contextRef.current || !feImageRef.current || !feDisplacementMapRef.current) return;

    const w = width * canvasDPI;
    const h = height * canvasDPI;
    const data = new Uint8ClampedArray(w * h * 4);

    let maxScale = 0;
    const rawValues = [];

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const pos = fragment({ x: x / w, y: y / h });
      const dx = pos.x * w - x;
      const dy = pos.y * h - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      rawValues.push(dx, dy);
    }

    maxScale *= 0.5;

    let index = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = rawValues[index++] / maxScale + 0.5;
      const g = rawValues[index++] / maxScale + 0.5;
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }

    contextRef.current.putImageData(new ImageData(data, w, h), 0, 0);
    feImageRef.current.setAttributeNS('http://www.w3.org/1999/xlink', 'href', canvasRef.current.toDataURL());
    feDisplacementMapRef.current.setAttribute('scale', (maxScale / canvasDPI).toString());
  }, [width, height, fragment, canvasDPI]);

  useEffect(() => {
    // Initialize canvas context
    if (canvasRef.current) {
      contextRef.current = canvasRef.current.getContext('2d');
    }

    // Append SVG and container to document.body like the original
    if (svgRef.current && containerRef.current) {
      // Apply the correct styles
      Object.assign(svgRef.current.style, svgStyle);
      Object.assign(containerRef.current.style, containerStyle);
      
      document.body.appendChild(svgRef.current);
      document.body.appendChild(containerRef.current);
    }

    // Use setTimeout to ensure DOM elements are fully rendered
    const timer = setTimeout(() => {
      updateShader();
    }, 0);

    return () => {
      clearTimeout(timer);
      // Cleanup: remove elements from document.body
      if (svgRef.current && document.body.contains(svgRef.current)) {
        document.body.removeChild(svgRef.current);
      }
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }
    };
  }, [updateShader]);

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: `${width}px`,
    height: `${height}px`,
    overflow: 'hidden',
    borderRadius: '150px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15)',
    backdropFilter: `url(#${idRef.current}_filter) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`,
    zIndex: 9999,
    pointerEvents: 'none'
  };

  const svgStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 9998
  };

  return (
    <>
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width="0"
        height="0"
        style={{ display: 'none' }}
      >
        <defs>
          <filter
            id={`${idRef.current}_filter`}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
            x="0"
            y="0"
            width={width.toString()}
            height={height.toString()}
          >
            <feImage
              ref={feImageRef}
              id={`${idRef.current}_map`}
              width={width.toString()}
              height={height.toString()}
            />
            <feDisplacementMap
              ref={feDisplacementMapRef}
              in="SourceGraphic"
              in2={`${idRef.current}_map`}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      
      <div ref={containerRef} style={{ display: 'none' }} />
      
      <canvas
        ref={canvasRef}
        width={width * canvasDPI}
        height={height * canvasDPI}
        style={{ display: 'none' }}
      />
    </>
  );
};

// Export both the component and default fragment for convenience
export { LiquidGlass as default, defaultFragment };