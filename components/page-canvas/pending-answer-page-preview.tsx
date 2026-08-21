"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";

import type { DocumentPendingAnswerMatchEntry, PageEntity } from "@/lib/domain/entities";
import { mapNormalizedBboxToPixels } from "@/lib/services/analysis-service";

interface PendingAnswerPagePreviewProps {
  page: Pick<PageEntity, "id" | "pageNumber" | "width" | "height">;
  previewUrl: string;
  matches: DocumentPendingAnswerMatchEntry[];
  selectedMatchId: string | null;
  onSelectMatch: (matchId: string) => void;
  onUpdateMatchBBox: (
    matchId: string,
    normalizedBBox: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  ) => void;
}

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
  const width = Math.max(1, Math.round(bbox.x2 - bbox.x1));
  const height = Math.max(1, Math.round(bbox.y2 - bbox.y1));
  const x1 = clamp(Math.round(bbox.x1), 0, Math.max(0, 1000 - width));
  const y1 = clamp(Math.round(bbox.y1), 0, Math.max(0, 1000 - height));

  return {
    x1,
    y1,
    x2: x1 + width,
    y2: y1 + height
  };
}

export function PendingAnswerPagePreview(input: PendingAnswerPagePreviewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const activePointerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = null;
    },
    []
  );

  const startMoveInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    match: DocumentPendingAnswerMatchEntry
  ) => {
    if (!match.normalizedBBox) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    input.onSelectMatch(match.id);

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || input.page.width;
    const renderedHeight = rect.height || input.page.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startBBox = match.normalizedBBox;

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
      const nextBBox = clampNormalizedBBox({
        x1: startBBox.x1 + deltaX,
        y1: startBBox.y1 + deltaY,
        x2: startBBox.x2 + deltaX,
        y2: startBBox.y2 + deltaY
      });

      input.onUpdateMatchBBox(match.id, nextBBox);
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

  const startResizeInteraction = (
    event: ReactPointerEvent<HTMLButtonElement>,
    match: DocumentPendingAnswerMatchEntry
  ) => {
    if (!match.normalizedBBox) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    input.onSelectMatch(match.id);

    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || input.page.width;
    const renderedHeight = rect.height || input.page.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startBBox = match.normalizedBBox;

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
      const nextBBox = {
        x1: startBBox.x1,
        y1: startBBox.y1,
        x2: clamp(
          Math.round(startBBox.x2 + deltaX),
          startBBox.x1 + MIN_NORMALIZED_BOX_SIZE,
          1000
        ),
        y2: clamp(
          Math.round(startBBox.y2 + deltaY),
          startBBox.y1 + MIN_NORMALIZED_BOX_SIZE,
          1000
        )
      };

      input.onUpdateMatchBBox(match.id, nextBBox);
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

  return (
    <article className="rounded-lg border border-amber-200 bg-white px-3 py-3">
      <div className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-amber-700">
        Answer Page {input.page.pageNumber}
      </div>
      <div className="relative overflow-hidden rounded-lg border border-amber-100 bg-slate-50">
        <img
          alt={`pending-answer-page-${input.page.pageNumber}`}
          className="block w-full object-contain"
          src={input.previewUrl}
        />
        <div ref={surfaceRef} className="pointer-events-none absolute inset-0">
          {input.matches.map((match) => {
            if (match.pageId !== input.page.id || !match.normalizedBBox) {
              return null;
            }

            const bbox = mapNormalizedBboxToPixels(match.normalizedBBox, {
              width: input.page.width,
              height: input.page.height
            });

            return (
              <div
                key={match.id}
                aria-label={`pending-answer-box-${match.id}`}
                aria-pressed={input.selectedMatchId === match.id}
                className={[
                  "pointer-events-auto absolute rounded-lg border-2",
                  input.selectedMatchId === match.id
                    ? "border-amber-500 bg-amber-200/35 shadow-md ring-2 ring-amber-200/80"
                    : "border-amber-400 bg-amber-200/20"
                ].join(" ")}
                onClick={() => input.onSelectMatch(match.id)}
                onPointerDown={(event) => startMoveInteraction(event, match)}
                role="button"
                style={{
                  left: `${(bbox.x / input.page.width) * 100}%`,
                  top: `${(bbox.y / input.page.height) * 100}%`,
                  width: `${(bbox.width / input.page.width) * 100}%`,
                  height: `${(bbox.height / input.page.height) * 100}%`
                }}
                tabIndex={0}
              >
                <span className="absolute -top-3 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  {match.answerLabel}
                </span>
                <button
                  aria-label={`pending-answer-resize-${match.id}`}
                  className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-amber-500 bg-white shadow-sm"
                  onClick={(innerEvent) => innerEvent.stopPropagation()}
                  onPointerDown={(innerEvent) => startResizeInteraction(innerEvent, match)}
                  type="button"
                />
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

