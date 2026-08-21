import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as classifyDocumentQuestionsPost } from "@/app/api/ai/classify-document-questions/route";
import { POST as detectCrossPagePost } from "@/app/api/ai/detect-cross-page/route";
import { POST as detectQuestionBoxesPost } from "@/app/api/ai/detect-question-boxes/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

describe("ai routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
  });

  it("returns no placeholder detections when a model provider is not selected", async () => {
    const response = await detectQuestionBoxesPost(
      new Request("http://localhost/api/ai/detect-question-boxes", {
        method: "POST",
        body: JSON.stringify({
          pageId: "page-1",
          imageDataUrl: "data:image/png;base64,page-1"
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      pageId: "page-1",
      mode: "ocr_guided_geometry",
      source: {
        provider: "local_fallback",
        reason: "api_provider_not_selected"
      }
    });
    expect(payload.detections).toEqual([]);
  });

  it("returns no placeholder cross-page merges when a model provider is not selected", async () => {
    const response = await detectCrossPagePost(
      new Request("http://localhost/api/ai/detect-cross-page", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          leftPage: "page-1",
          rightPage: "page-2",
          leftImageDataUrl: "data:image/png;base64,left",
          rightImageDataUrl: "data:image/png;base64,right",
          candidates: [
            {
              id: "q-1",
              pageId: "page-1",
              localOrder: 3,
              normalizedBBox: { x1: 80, y1: 720, x2: 920, y2: 990 }
            },
            {
              id: "q-2",
              pageId: "page-2",
              localOrder: 1,
              normalizedBBox: { x1: 80, y1: 20, x2: 920, y2: 260 }
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "local_fallback",
      reason: "api_provider_not_selected"
    });
    expect(payload.mergeCandidates).toEqual([]);
  });

  it("keeps local fallback classification when ark env is not configured", async () => {
    const response = await classifyDocumentQuestionsPost(
      new Request("http://localhost/api/ai/classify-document-questions", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          subjectScope: "高中数学",
          directoryPaths: [["高中数学", "函数", "二次函数"]],
          pages: [
            {
              id: "page-1",
              reviewStatus: "reviewed",
              imageDataUrl: "data:image/png;base64,page-1",
              questionIds: ["q-1"]
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "local_fallback",
      reason: "api_provider_not_selected"
    });
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      questionId: "q-1",
      classificationStatus: "matched",
      chapterTag: "二次函数",
      knowledgeTags: ["二次函数示例考点 1"]
    });
  });

  it("uses the configured model API for question box detection when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const fetchSpy = vi.spyOn(global, "fetch");
    const detections = [
      {
        id: "draft-1",
        localOrder: 1,
        confidence: 0.94,
        normalizedBBox: {
          x1: 100,
          y1: 120,
          x2: 900,
          y2: 320
        }
      }
    ];
    const textLines = [
      {
        text: "12. 如图所示",
        normalizedBBox: { x1: 100, y1: 120, x2: 900, y2: 160 }
      }
    ];
    const legacySpy = vi
      .spyOn(codexAgent, "detectQuestionBoxesWithCodex")
      .mockResolvedValue(detections);
    const codexSpy = vi
      .spyOn(codexAgent, "detectQuestionBoxesWithTextLayout")
      .mockResolvedValue({ detections, textLines });

    const response = await detectQuestionBoxesPost(
      new Request("http://localhost/api/ai/detect-question-boxes", {
        method: "POST",
        body: JSON.stringify({
          pageId: "page-1",
          imageDataUrl: "data:image/png;base64,page-1",
          subjectScope: "高中数学",
          questionPageLayoutMode: "double_column"
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "openai_compatible"
    });
    expect(payload.detections).toHaveLength(1);
    expect(payload.textLines).toEqual(textLines);
    expect(codexSpy).toHaveBeenCalledWith({
      imageDataUrl: "data:image/png;base64,page-1",
      subjectScope: "高中数学",
      textLines: undefined,
      questionPageLayoutMode: "double_column"
    });
    expect(payload.prompt).toContain("双栏版式约束");
    expect(legacySpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the configured model API for cross-page detection when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const codexSpy = vi.spyOn(codexAgent, "detectCrossPageWithCodex").mockResolvedValue([
      {
        id: "merge-1",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.88
      }
    ]);

    const response = await detectCrossPagePost(
      new Request("http://localhost/api/ai/detect-cross-page", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          leftPage: "page-1",
          rightPage: "page-2",
          leftImageDataUrl: "data:image/png;base64,left",
          rightImageDataUrl: "data:image/png;base64,right",
          candidates: [
            {
              id: "q-1",
              pageId: "page-1",
              localOrder: 3,
              normalizedBBox: { x1: 80, y1: 720, x2: 920, y2: 990 }
            },
            {
              id: "q-2",
              pageId: "page-2",
              localOrder: 1,
              normalizedBBox: { x1: 80, y1: 20, x2: 920, y2: 260 }
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "openai_compatible"
    });
    expect(payload.mergeCandidates).toHaveLength(1);
    expect(payload.mergeCandidates[0]).toMatchObject({
      id: "merge-1",
      leftPageId: "page-1",
      rightPageId: "page-2",
      documentId: "doc-1"
    });
    expect(codexSpy).toHaveBeenCalledWith({
      leftImageDataUrl: "data:image/png;base64,left",
      rightImageDataUrl: "data:image/png;base64,right",
      leftPageId: "page-1",
      rightPageId: "page-2",
      leftTextLines: undefined,
      rightTextLines: undefined,
      candidates: [
        {
          id: "q-1",
          pageId: "page-1",
          localOrder: 3,
          normalizedBBox: { x1: 80, y1: 720, x2: 920, y2: 990 }
        },
        {
          id: "q-2",
          pageId: "page-2",
          localOrder: 1,
          normalizedBBox: { x1: 80, y1: 20, x2: 920, y2: 260 }
        }
      ]
    });
  });

  it("returns a safe diagnostic id and no merge when configured cross-page AI fails", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";
    vi.spyOn(codexAgent, "detectCrossPageWithCodex").mockRejectedValue(
      Object.assign(new Error("sensitive upstream response must not escape"), {
        status: 503,
        code: "upstream_unavailable",
        diagnosticId: "aierr-test-cross-page"
      })
    );

    const response = await detectCrossPagePost(
      new Request("http://localhost/api/ai/detect-cross-page", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          leftPage: "page-1",
          rightPage: "page-2",
          leftImageDataUrl: "data:image/png;base64,left",
          rightImageDataUrl: "data:image/png;base64,right",
          candidates: []
        })
      })
    );
    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "local_fallback",
      reason: "api_request_failed",
      diagnosticId: "aierr-test-cross-page",
      diagnostic: {
        kind: "upstream_http",
        status: 503,
        code: "upstream_unavailable"
      }
    });
    expect(payload.mergeCandidates).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("sensitive upstream response");
  });

  it("uses the configured model API for classification when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const codexSpy = vi.spyOn(codexAgent, "classifyDocumentQuestionsWithCodex").mockResolvedValue([
      {
        questionId: "q-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中数学", "函数", "函数图像"],
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"],
          ["高中数学", "函数", "函数性质"],
          ["高中数学", "解析几何", "直线与圆"]
        ],
        chapterTag: "函数",
        knowledgeTags: ["函数图像", "数形结合"],
        ocrText: "已识别题干"
      }
    ]);

    const response = await classifyDocumentQuestionsPost(
      new Request("http://localhost/api/ai/classify-document-questions", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          subjectScope: "高中数学",
          directoryPaths: [["高中数学", "函数", "函数图像"]],
          pages: [
            {
              id: "page-1",
              reviewStatus: "reviewed",
              imageDataUrl: "data:image/png;base64,page-1",
              questionIds: ["q-1"]
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "openai_compatible"
    });
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]).toMatchObject({
      questionId: "q-1",
      classificationStatus: "matched",
      chapterTag: "函数",
      knowledgeTags: ["函数图像", "数形结合"],
      ocrText: "已识别题干"
    });
    expect(codexSpy).toHaveBeenCalledWith({
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-1",
          questionIds: ["q-1"]
        }
      ],
      directoryPaths: [["高中数学", "函数", "函数图像"]],
      subjectScope: "高中数学"
    });
  });

  it("returns only a safe diagnostic when configured classification fails", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";
    vi.spyOn(codexAgent, "classifyDocumentQuestionsWithCodex").mockRejectedValue(
      Object.assign(new Error("sensitive upstream response"), {
        status: 400,
        code: "invalid_request_error",
        diagnosticId: "aierr-test-classification"
      })
    );

    const response = await classifyDocumentQuestionsPost(
      new Request("http://localhost/api/ai/classify-document-questions", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          subjectScope: "高中数学",
          directoryPaths: [["高中数学", "函数", "函数图像"]],
          pages: [
            {
              id: "page-1",
              reviewStatus: "reviewed",
              imageDataUrl: "data:image/png;base64,page-1",
              questionIds: ["q-1"]
            }
          ]
        })
      })
    );
    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "local_fallback",
      reason: "api_request_failed",
      diagnosticId: "aierr-test-classification",
      diagnostic: {
        kind: "upstream_http",
        status: 400,
        code: "invalid_request_error"
      }
    });
    expect(JSON.stringify(payload)).not.toContain("sensitive upstream response");
  });
});
