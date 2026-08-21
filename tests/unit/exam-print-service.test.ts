import { describe, expect, it } from "vitest";

import { buildPrintableExamDocument, buildPrintableExamPdf } from "@/lib/services/exam-print-service";

describe("exam-print-service", () => {
  it("builds one printable paper document from grouped paper preview sections", () => {
    const result = buildPrintableExamDocument({
      title: "专题卷A",
      documentKind: "paper",
      sourceMode: "question_bank",
      paperPreview: {
        sections: [
          {
            key: "mechanics",
            label: "力学",
            items: [
              {
                questionId: "q-1",
                displayNumber: "1",
                summaryText: "牛顿第二定律"
              }
            ]
          }
        ]
      }
    });

    expect(result.fileNameBase).toBe("专题卷A");
    expect(result.html).toContain("专题卷A");
    expect(result.html).toContain("力学");
    expect(result.html).toContain("Q1");
    expect(result.html).toContain("牛顿第二定律");
    expect(result.html).toContain("@page");
  });

  it("builds one printable uploaded-pdf lecture document without splitting one question across pages", () => {
    const result = buildPrintableExamDocument({
      title: "套卷讲义A",
      documentKind: "lecture",
      sourceMode: "uploaded_pdf",
      lecturePreview: {
        layout: {
          pageWidth: 720,
          pageHeight: 960,
          padding: 40,
          gap: 24,
          labelHeight: 32
        },
        pages: [
          {
            index: 1,
            items: [
              {
                questionId: "q-1",
                displayNumber: "12",
                sourceDataUrl: "data:image/png;base64,AAA",
                previewDataUrl: "data:image/svg+xml;charset=utf-8,BBB",
                crop: {
                  x: 10,
                  y: 20,
                  width: 100,
                  height: 120
                },
                frame: {
                  x: 40,
                  y: 72,
                  width: 640,
                  height: 300
                }
              }
            ]
          }
        ]
      }
    });

    expect(result.fileNameBase).toBe("套卷讲义A");
    expect(result.html).toContain("套卷讲义A");
    expect(result.html).toContain("Preview Page 1");
    expect(result.html).toContain("Q12");
    expect(result.html).toContain("page-break-inside: avoid");
    expect(result.html).toContain("data:image/svg+xml");
  });

  it("builds one printable answer-sheet document with answer images", () => {
    const result = buildPrintableExamDocument({
      title: "答案稿A",
      documentKind: "answer_sheet",
      sourceMode: "question_bank",
      answerPreview: {
        placeholder: false,
        entries: [
          {
            questionId: "q-1",
            displayNumber: "12",
            assets: [
              {
                dataUrl: "data:image/png;base64,AAA"
              }
            ]
          }
        ]
      }
    });

    expect(result.html).toContain("答案稿A");
    expect(result.html).toContain("Q12");
    expect(result.html).toContain("data:image/png;base64,AAA");
  });

  it("builds one printable uploaded-pdf whole-page document", () => {
    const result = buildPrintableExamDocument({
      title: "整页试卷A",
      documentKind: "paper",
      sourceMode: "uploaded_pdf",
      uploadedPagePreview: {
        heading: "Uploaded Question Pages",
        pages: [
          {
            pageNumber: 1,
            dataUrl: "data:image/png;base64,BBB"
          }
        ]
      }
    });

    expect(result.html).toContain("整页试卷A");
    expect(result.html).toContain("Uploaded Question Pages");
    expect(result.html).toContain("Page 1");
    expect(result.html).toContain("data:image/png;base64,BBB");
  });

  it("builds one real pdf blob from printable html", async () => {
    const pdf = await buildPrintableExamPdf({
      title: "试卷PDF",
      html: "<html><body><h1>试卷PDF</h1><p>内容</p></body></html>"
    });

    expect(pdf.fileName).toMatch(/^试卷PDF_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(pdf.blob.type).toBe("application/pdf");
    expect(pdf.blob.size).toBeGreaterThan(100);
  });

  it("prints lecture gap values from text-card preview items", () => {
    const result = buildPrintableExamDocument({
      title: "lecture-gap-preview",
      documentKind: "lecture",
      sourceMode: "question_bank",
      paperPreview: {
        sections: [
          {
            key: "current-order",
            label: "Current Order",
            items: [
              {
                questionId: "q-1",
                displayNumber: "1",
                summaryText: "first question",
                gapAfter: 96
              },
              {
                questionId: "q-2",
                displayNumber: "2",
                summaryText: "second question",
                gapAfter: 48
              }
            ]
          }
        ]
      }
    });

    expect(result.html).toContain("Lecture Preview");
    expect(result.html).toContain("Gap after: 96");
    expect(result.html).toContain("Gap after: 48");
  });
});
