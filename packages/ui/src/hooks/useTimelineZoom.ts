/**
 * Custom hook for managing timeline zoom and pan state.
 */

import { useCallback, useRef, useState } from 'react';

import type { ZoomState } from '../timeline/types';

const MIN_ZOOM = 1;
const MAX_ZOOM = 20;

export interface UseTimelineZoomReturn {
  readonly zoom: ZoomState;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly setScale: (scale: number) => void;
  readonly startPan: (clientX: number) => void;
  readonly updatePan: (clientX: number) => void;
  readonly endPan: () => void;
  readonly isPanning: boolean;
}

export function useTimelineZoom(): UseTimelineZoomReturn {
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, panX: 0 });
  const panStartRef = useRef<{ x: number; startPanX: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const zoomIn = useCallback(() => {
    setZoom((prev) => ({
      ...prev,
      scale: Math.min(MAX_ZOOM, prev.scale * 1.5),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const newScale = Math.max(MIN_ZOOM, prev.scale / 1.5);
      // Clamp panX so we don't pan beyond the content
      const maxPan = 0;
      const minPan = -(newScale - 1) * 1200; // approximate content width
      const clampedPanX = Math.max(minPan, Math.min(maxPan, prev.panX));
      return { scale: newScale, panX: clampedPanX };
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom({ scale: 1, panX: 0 });
  }, []);

  const setScale = useCallback((scale: number) => {
    setZoom((prev) => ({
      ...prev,
      scale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)),
    }));
  }, []);

  const startPan = useCallback((clientX: number) => {
    setIsPanning(true);
    panStartRef.current = { x: clientX, startPanX: 0 };
    setZoom((prev) => {
      panStartRef.current = { x: clientX, startPanX: prev.panX };
      return prev;
    });
  }, []);

  const updatePan = useCallback((clientX: number) => {
    if (!panStartRef.current) return;
    const dx = clientX - panStartRef.current.x;
    const newPanX = panStartRef.current.startPanX + dx;
    setZoom((prev) => {
      const maxPan = 0;
      const minPan = -(prev.scale - 1) * 1200;
      return { ...prev, panX: Math.max(minPan, Math.min(maxPan, newPanX)) };
    });
  }, []);

  const endPan = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  return { zoom, zoomIn, zoomOut, resetZoom, setScale, startPan, updatePan, endPan, isPanning };
}
