import type { CSSProperties } from "react";

import { buildCroppedQuestionPreviewDataUrl } from "@/lib/services/lecture-preview-service";

export function CroppedQuestionImage(props: {
  alt: string;
  bbox: { x: number; y: number; width: number; height: number };
  className?: string;
  page: { width: number; height: number };
  sourceDataUrl: string;
}) {
  if (props.sourceDataUrl.startsWith("data:image/")) {
    return (
      <img
        alt={props.alt}
        className={props.className ?? "w-full object-contain"}
        src={buildCroppedQuestionPreviewDataUrl({
          sourceDataUrl: props.sourceDataUrl,
          page: props.page,
          bbox: props.bbox
        })}
      />
    );
  }

  const imageStyle: CSSProperties = {
    height: `${(props.page.height / props.bbox.height) * 100}%`,
    left: `${(-props.bbox.x / props.bbox.width) * 100}%`,
    position: "absolute",
    top: `${(-props.bbox.y / props.bbox.height) * 100}%`,
    width: `${(props.page.width / props.bbox.width) * 100}%`
  };

  return (
    <div
      className="relative mx-auto w-full overflow-hidden"
      style={{ aspectRatio: `${props.bbox.width} / ${props.bbox.height}` }}
    >
      <img
        alt={props.alt}
        className="absolute max-h-none max-w-none"
        src={props.sourceDataUrl}
        style={imageStyle}
      />
    </div>
  );
}
