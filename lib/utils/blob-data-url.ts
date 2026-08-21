function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(arrayBuffer).toString("base64");
  }

  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("无法读取图片数据"));
          return;
        }

        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(new Error("无法读取图片数据"));
      };

      reader.readAsDataURL(blob);
    });
  }

  const base64Data = arrayBufferToBase64(await blob.arrayBuffer());

  return `data:${blob.type || "application/octet-stream"};base64,${base64Data}`;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";

  try {
    if (!isBase64) {
      return new Blob([decodeURIComponent(payload)], { type: mimeType });
    }

    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}
