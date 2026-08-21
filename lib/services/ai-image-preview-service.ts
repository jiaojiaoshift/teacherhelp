interface PrepareAiPreviewOptions {
  maxDimension?: number;
  maxDataUrlLength?: number;
  maxBlobBytes?: number;
  quality?: number;
  loadTimeoutMs?: number;
}

function loadImage(dataUrl: string, loadTimeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while loading AI preview image"));
    }, loadTimeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("Failed to load AI preview image"));
    };
    image.src = dataUrl;
  });
}

export async function prepareAiPreviewDataUrl(
  dataUrl: string,
  options?: PrepareAiPreviewOptions
): Promise<string> {
  const maxDimension = options?.maxDimension ?? 600;
  const maxDataUrlLength = options?.maxDataUrlLength ?? 200_000;
  const quality = options?.quality ?? 0.82;
  // A failed decode must not hold a large, sequential import for seconds per page.
  const loadTimeoutMs = options?.loadTimeoutMs ?? 80;

  if (typeof document === "undefined" || typeof Image === "undefined" || !dataUrl.startsWith("data:image/")) {
    return dataUrl;
  }

  try {
    const image = await loadImage(dataUrl, loadTimeoutMs);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);

    if (dataUrl.length <= maxDataUrlLength && longestSide <= maxDimension) {
      return dataUrl;
    }

    const scale = Math.min(1, maxDimension / longestSide);
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      return dataUrl;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}

function canvasToPreviewBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function prepareAiPreviewBlob(
  blob: Blob,
  options?: PrepareAiPreviewOptions
): Promise<Blob> {
  const maxDimension = options?.maxDimension ?? 600;
  const maxBlobBytes = options?.maxBlobBytes ?? 300_000;
  const quality = options?.quality ?? 0.82;
  // A failed decode must not hold a large, sequential import for seconds per page.
  const loadTimeoutMs = options?.loadTimeoutMs ?? 80;

  if (
    !blob.type.startsWith("image/") ||
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return blob;
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImage(objectUrl, loadTimeoutMs);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);

    if (blob.size <= maxBlobBytes && longestSide <= maxDimension) {
      return blob;
    }

    const scale = Math.min(1, maxDimension / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      return blob;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return (await canvasToPreviewBlob(canvas, quality)) ?? blob;
  } catch {
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
