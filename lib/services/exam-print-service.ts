import type { UploadedPdfLecturePreviewResult } from "@/lib/services/lecture-preview-service";
import type { PaperPreviewResult } from "@/lib/services/paper-preview-service";

interface PrintableAnswerPreviewEntry {
  questionId: string;
  displayNumber: string;
  assets: Array<{
    dataUrl?: string | null;
  }>;
}

interface PrintableAnswerPreview {
  placeholder: boolean;
  entries: PrintableAnswerPreviewEntry[];
}

interface PrintableUploadedPagePreview {
  heading: string;
  pages: Array<{
    pageNumber: number;
    dataUrl: string;
  }>;
}

export interface PrintableExamDocumentResult {
  fileNameBase: string;
  html: string;
}

export interface PrintableExamPdfResult {
  fileName: string;
  blob: Blob;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintStyles() {
  return `
    <style>
      @page {
        size: A4;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #0f172a;
        background: #ffffff;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }

      .print-shell {
        padding: 16px 0 0;
      }

      .print-title {
        margin: 0 0 18px;
        font-size: 24px;
        font-weight: 700;
      }

      .section-title {
        margin: 24px 0 12px;
        font-size: 18px;
        font-weight: 700;
      }

      .section-note,
      .empty-note {
        margin: 0 0 12px;
        color: #475569;
        font-size: 13px;
        line-height: 1.6;
      }

      .preview-section {
        margin: 0 0 18px;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .preview-label {
        margin: 0 0 10px;
        font-size: 16px;
        font-weight: 600;
      }

      .question-card,
      .lecture-card,
      .answer-card,
      .uploaded-page-card {
        margin: 0 0 14px;
        padding: 14px;
        border: 1px solid #cbd5e1;
        border-radius: 14px;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .question-label {
        margin: 0 0 10px;
        font-size: 14px;
        font-weight: 700;
      }

      .question-summary {
        margin: 0;
        color: #334155;
        font-size: 14px;
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .image-stack {
        display: grid;
        gap: 12px;
      }

      .print-image {
        display: block;
        width: 100%;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
      }

      .page-title {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 700;
      }

      .page-break {
        page-break-before: always;
        break-before: page;
      }
    </style>
  `;
}

function buildTextPreviewBody(input: {
  preview: PaperPreviewResult | null | undefined;
  documentKind: "paper" | "lecture";
}) {
  const sections = input.preview?.sections ?? [];
  const heading = input.documentKind === "lecture" ? "Lecture Preview" : "Paper Preview";
  const description =
    input.documentKind === "lecture"
      ? "Text-card lecture preview follows the current question order."
      : "Text-card paper preview follows the current question order.";

  if (sections.length === 0) {
    return `
      <section>
        <h2 class="section-title">${heading}</h2>
        <p class="section-note">${description}</p>
        <p class="empty-note">No questions are available in the current document.</p>
      </section>
    `;
  }

  return `
    <section>
      <h2 class="section-title">${heading}</h2>
      <p class="section-note">${description}</p>
      ${sections
        .map(
          (section) => `
            <div class="preview-section">
              <h3 class="preview-label">${escapeHtml(section.label)}</h3>
              ${section.items
                .map(
                  (item) => `
                    <article class="question-card">
                      <div class="question-label">Q${escapeHtml(item.displayNumber)}</div>
                      <p class="question-summary">${escapeHtml(item.summaryText)}</p>
                      <p class="section-note">Gap after: ${item.gapAfter}</p>
                    </article>
                  `
                )
                .join("")}
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function buildLectureBody(preview: UploadedPdfLecturePreviewResult | null | undefined) {
  const pages = preview?.pages ?? [];

  if (pages.length === 0) {
    return `
      <section>
        <h2 class="section-title">Lecture Preview</h2>
        <p class="section-note">No lecture pages are available in the current document.</p>
      </section>
    `;
  }

  return `
    <section>
      <h2 class="section-title">Lecture Preview</h2>
      ${pages
        .map(
          (page, pageIndex) => `
            <div class="${pageIndex > 0 ? "page-break" : ""}">
              <div class="page-title">Preview Page ${page.index}</div>
              ${page.items
                .map(
                  (item) => `
                    <article class="lecture-card">
                      <div class="question-label">Q${escapeHtml(item.displayNumber)}</div>
                      <img
                        alt="Lecture question ${escapeHtml(item.displayNumber)}"
                        class="print-image"
                        src="${item.previewDataUrl}"
                      />
                    </article>
                  `
                )
                .join("")}
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

function buildAnswerBody(preview: PrintableAnswerPreview | null | undefined) {
  if (!preview || (preview.placeholder && preview.entries.length === 0)) {
    return `
      <section>
        <h2 class="section-title">Answer Sheet Preview</h2>
        <p class="section-note">The current answer sheet is still a placeholder.</p>
      </section>
    `;
  }

  return `
    <section>
      <h2 class="section-title">Answer Sheet Preview</h2>
      ${preview.entries
        .map(
          (entry) => `
            <article class="answer-card">
              <div class="question-label">Q${escapeHtml(entry.displayNumber)}</div>
              ${
                entry.assets.length
                  ? `
                    <div class="image-stack">
                      ${entry.assets
                        .filter((asset) => Boolean(asset.dataUrl))
                        .map(
                          (asset) => `
                            <img
                              alt="Answer ${escapeHtml(entry.displayNumber)}"
                              class="print-image"
                              src="${asset.dataUrl}"
                            />
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : `<p class="empty-note">No answer image is attached yet.</p>`
              }
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function buildUploadedPageBody(preview: PrintableUploadedPagePreview | null | undefined) {
  const pages = preview?.pages ?? [];

  if (!preview || pages.length === 0) {
    return `
      <section>
        <h2 class="section-title">Uploaded Pages</h2>
        <p class="section-note">No uploaded pages are available in the current document.</p>
      </section>
    `;
  }

  return `
    <section>
      <h2 class="section-title">${escapeHtml(preview.heading)}</h2>
      ${pages
        .map(
          (page, pageIndex) => `
            <article class="uploaded-page-card ${pageIndex > 0 ? "page-break" : ""}">
              <div class="page-title">Page ${page.pageNumber}</div>
              <img
                alt="${escapeHtml(preview.heading)} page ${page.pageNumber}"
                class="print-image"
                src="${page.dataUrl}"
              />
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function sanitizeFileNameBase(title: string) {
  const sanitized = title.trim().replace(/[\\/:*?"<>|]/g, "_");

  return sanitized || "printable-document";
}

function buildDateToken(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function wrapTextLine(value: string, maxLength: number) {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  const lines: string[] = [];

  for (let index = 0; index < normalized.length; index += maxLength) {
    lines.push(normalized.slice(index, index + maxLength));
  }

  return lines;
}

function extractPdfLines(html: string, title: string) {
  const withoutStyles = html.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withImageMarkers = withoutStyles.replace(
    /<img\b[^>]*alt="([^"]*)"[^>]*>/gi,
    (_, altText: string) => ` [Image: ${altText || "Preview"}] `
  );
  const normalizedBlocks = withImageMarkers
    .replace(/<\/(h1|h2|h3|p|div|article|section|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const rawLines = decodeHtmlEntities(normalizedBlocks)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return [title, ...rawLines].flatMap((line) => wrapTextLine(line, 36));
}

function toUtf16BeHex(input: string) {
  return Array.from(input)
    .map((character) => character.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")
    .toUpperCase();
}

function buildPdfContentStream(lines: string[]) {
  const startY = 790;
  const lineHeight = 20;
  const renderedLines = lines.length > 0 ? lines : ["Printable document"];
  const commands = [
    "BT",
    "/F1 14 Tf",
    `40 ${startY} Td`,
    `<${toUtf16BeHex(renderedLines[0])}> Tj`
  ];

  renderedLines.slice(1).forEach((line) => {
    commands.push(`0 -${lineHeight} Td`);
    commands.push(`<${toUtf16BeHex(line)}> Tj`);
  });
  commands.push("ET");

  return commands.join("\n");
}

function buildMinimalPdfDocument(input: {
  title: string;
  html: string;
}) {
  const allLines = extractPdfLines(input.html, input.title);
  const linesPerPage = 36;
  const pageLineGroups =
    allLines.length > 0
      ? Array.from({ length: Math.ceil(allLines.length / linesPerPage) }, (_, index) =>
          allLines.slice(index * linesPerPage, (index + 1) * linesPerPage)
        )
      : [[input.title]];
  const objects: string[] = [];
  const fontObjectNumber = 3;

  const pageObjectNumbers = pageLineGroups.map((_, index) => 4 + index * 2);
  const contentObjectNumbers = pageLineGroups.map((_, index) => 5 + index * 2);

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;
  objects[2] = [
    "<< /Type /Font",
    "/Subtype /Type0",
    "/BaseFont /STSong-Light",
    "/Encoding /UniGB-UCS2-H",
    ">>"
  ].join("\n");

  pageLineGroups.forEach((lines, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = contentObjectNumbers[index];
    const stream = buildPdfContentStream(lines);

    objects[pageObjectNumber - 1] = [
      "<< /Type /Page",
      "/Parent 2 0 R",
      "/MediaBox [0 0 595 842]",
      ` /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >>`,
      ` /Contents ${contentObjectNumber} 0 R`,
      ">>"
    ].join("\n");
    objects[contentObjectNumber - 1] = [
      `<< /Length ${stream.length} >>`,
      "stream",
      stream,
      "endstream"
    ].join("\n");
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  offsets.slice(1).forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });

  pdf += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF"
  ].join("\n");

  return pdf;
}

export function buildPrintableExamDocument(input: {
  title: string;
  documentKind: "paper" | "lecture" | "answer_sheet";
  sourceMode: "question_bank" | "uploaded_pdf" | "freeform";
  paperPreview?: PaperPreviewResult | null;
  lecturePreview?: UploadedPdfLecturePreviewResult | null;
  answerPreview?: PrintableAnswerPreview | null;
  uploadedPagePreview?: PrintableUploadedPagePreview | null;
}): PrintableExamDocumentResult {
  const fileNameBase = sanitizeFileNameBase(input.title);
  let body = "";

  if (input.uploadedPagePreview?.pages.length) {
    body = buildUploadedPageBody(input.uploadedPagePreview);
  } else if (input.documentKind === "answer_sheet") {
    body = buildAnswerBody(input.answerPreview);
  } else if (input.lecturePreview) {
    body = buildLectureBody(input.lecturePreview);
  } else {
    body = buildTextPreviewBody({
      preview: input.paperPreview,
      documentKind: input.documentKind
    });
  }

  return {
    fileNameBase,
    html: [
      "<!DOCTYPE html>",
      '<html lang="zh-CN">',
      "<head>",
      '<meta charSet="utf-8" />',
      `<title>${escapeHtml(input.title)}</title>`,
      buildPrintStyles(),
      "</head>",
      "<body>",
      '<main class="print-shell">',
      `<h1 class="print-title">${escapeHtml(input.title)}</h1>`,
      body,
      "</main>",
      "</body>",
      "</html>"
    ].join("")
  };
}

export async function buildPrintableExamPdf(input: {
  title: string;
  html: string;
}): Promise<PrintableExamPdfResult> {
  const fileName = `${sanitizeFileNameBase(input.title)}_${buildDateToken(new Date())}.pdf`;
  const pdfSource = buildMinimalPdfDocument(input);
  const blob = new Blob([new TextEncoder().encode(pdfSource)], {
    type: "application/pdf"
  });

  return {
    fileName,
    blob
  };
}
