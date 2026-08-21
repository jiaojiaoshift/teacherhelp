"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";

import { mapNormalizedBboxToPixels } from "@/lib/services/analysis-service";

const MIN_NORMALIZED_BOX_SIZE = 24;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampNormalizedBBox(bbox: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  const width = Math.max(MIN_NORMALIZED_BOX_SIZE, Math.round(bbox.x2 - bbox.x1));
  const height = Math.max(MIN_NORMALIZED_BOX_SIZE, Math.round(bbox.y2 - bbox.y1));
  const x1 = clamp(Math.round(bbox.x1), 0, Math.max(0, 1000 - width));
  const y1 = clamp(Math.round(bbox.y1), 0, Math.max(0, 1000 - height));

  return {
    x1,
    y1,
    x2: x1 + width,
    y2: y1 + height
  };
}

interface ManualAnswerCropPreviewProps {
  imageAlt: string;
  imageUrl: string;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  pageSize: {
    width: number;
    height: number;
  };
  previewId: string;
  onChangeBBox: (bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }) => void;
}

export function ManualAnswerCropPreview(props: ManualAnswerCropPreviewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const activePointerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = null;
    },
    []
  );

  const toNormalizedPoint = (clientX: number, clientY: number) => {
    const surface = surfaceRef.current;

    if (!surface) {
      return null;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || props.pageSize.width;
    const renderedHeight = rect.height || props.pageSize.height;
    const offsetX = clamp(clientX - rect.left, 0, renderedWidth);
    const offsetY = clamp(clientY - rect.top, 0, renderedHeight);

    return {
      x: Math.round((offsetX / renderedWidth) * 1000),
      y: Math.round((offsetY / renderedHeight) * 1000)
    };
  };

  const startMoveInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || props.pageSize.width;
    const renderedHeight = rect.height || props.pageSize.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startBBox = props.normalizedBBox;

    activePointerCleanupRef.current?.();

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic test events can reject pointer capture.
    }

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();

      const deltaX = ((pointerEvent.clientX - startClientX) / renderedWidth) * 1000;
      const deltaY = ((pointerEvent.clientY - startClientY) / renderedHeight) * 1000;

      props.onChangeBBox(
        clampNormalizedBBox({
          x1: startBBox.x1 + deltaX,
          y1: startBBox.y1 + deltaY,
          x2: startBBox.x2 + deltaX,
          y2: startBBox.y2 + deltaY
        })
      );
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      activePointerCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    activePointerCleanupRef.current = cleanup;
  };

  const startResizeInteraction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || props.pageSize.width;
    const renderedHeight = rect.height || props.pageSize.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startBBox = props.normalizedBBox;

    activePointerCleanupRef.current?.();

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic test events can reject pointer capture.
    }

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();

      const deltaX = ((pointerEvent.clientX - startClientX) / renderedWidth) * 1000;
      const deltaY = ((pointerEvent.clientY - startClientY) / renderedHeight) * 1000;

      props.onChangeBBox({
        x1: startBBox.x1,
        y1: startBBox.y1,
        x2: clamp(Math.round(startBBox.x2 + deltaX), startBBox.x1 + MIN_NORMALIZED_BOX_SIZE, 1000),
        y2: clamp(Math.round(startBBox.y2 + deltaY), startBBox.y1 + MIN_NORMALIZED_BOX_SIZE, 1000)
      });
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      activePointerCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    activePointerCleanupRef.current = cleanup;
  };

  const startCreateInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();

    const startPoint = toNormalizedPoint(event.clientX, event.clientY);

    if (!startPoint) {
      return;
    }

    activePointerCleanupRef.current?.();

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();

      const currentPoint = toNormalizedPoint(pointerEvent.clientX, pointerEvent.clientY);

      if (!currentPoint) {
        return;
      }

      props.onChangeBBox(
        clampNormalizedBBox({
          x1: Math.min(startPoint.x, currentPoint.x),
          y1: Math.min(startPoint.y, currentPoint.y),
          x2: Math.max(startPoint.x, currentPoint.x),
          y2: Math.max(startPoint.y, currentPoint.y)
        })
      );
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      activePointerCleanupRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    activePointerCleanupRef.current = cleanup;
  };

  const bbox = mapNormalizedBboxToPixels(props.normalizedBBox, props.pageSize);

  return (
    <div className="relative overflow-hidden rounded-lg border border-amber-100 bg-slate-50">
      <img alt={props.imageAlt} className="block w-full object-contain" src={props.imageUrl} />
      <div
        ref={surfaceRef}
        aria-label={`pending-answer-crop-surface-${props.previewId}`}
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={startCreateInteraction}
      >
        <div
          aria-label={`pending-answer-crop-box-${props.previewId}`}
          className="absolute rounded-lg border-2 border-amber-500 bg-amber-200/20 shadow-sm"
          onPointerDown={startMoveInteraction}
          role="button"
          style={{
            left: `${(bbox.x / props.pageSize.width) * 100}%`,
            top: `${(bbox.y / props.pageSize.height) * 100}%`,
            width: `${(bbox.width / props.pageSize.width) * 100}%`,
            height: `${(bbox.height / props.pageSize.height) * 100}%`
          }}
          tabIndex={0}
        >
          <span className="absolute -top-3 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            裁切框
          </span>
          <button
            aria-label={`pending-answer-crop-resize-${props.previewId}`}
            className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-amber-500 bg-white shadow-sm"
            onClick={(innerEvent) => innerEvent.stopPropagation()}
            onPointerDown={startResizeInteraction}
            type="button"
          />
        </div>
      </div>
    </div>
  );
}

