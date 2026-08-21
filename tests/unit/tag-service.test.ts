import { describe, expect, it } from "vitest";

import {
  collectTagsFromQuestions,
  mergeTagInQuestions,
  removeTagFromQuestions,
  renameTagInQuestions
} from "@/lib/services/tag-service";

describe("tag-service", () => {
  it("collects chapter, knowledge and custom tags from questions", () => {
    const tags = collectTagsFromQuestions([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        chapterTag: "二次函数",
        knowledgeTags: ["顶点公式", "最值"],
        customTags: ["易错"]
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "reviewed",
        source: "manual",
        confidence: 1,
        crossPageGroupId: null,
        chapterTag: "二次函数",
        knowledgeTags: ["最值"],
        customTags: ["压轴"]
      }
    ]);

    expect(tags).toEqual([
      { id: "chapter:二次函数", name: "二次函数", type: "chapter", usageCount: 2 },
      { id: "knowledge:最值", name: "最值", type: "knowledge", usageCount: 2 },
      { id: "knowledge:顶点公式", name: "顶点公式", type: "knowledge", usageCount: 1 },
      { id: "custom:压轴", name: "压轴", type: "custom", usageCount: 1 },
      { id: "custom:易错", name: "易错", type: "custom", usageCount: 1 }
    ]);
  });

  it("renames one tag across matching questions", () => {
    const questions = renameTagInQuestions(
      [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {},
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          chapterTag: "二次函数",
          knowledgeTags: ["顶点公式"],
          customTags: ["易错"]
        }
      ],
      {
        type: "knowledge",
        from: "顶点公式",
        to: "顶点坐标公式"
      }
    );

    expect(questions[0].knowledgeTags).toEqual(["顶点坐标公式"]);
  });

  it("removes one tag from matching questions", () => {
    const questions = removeTagFromQuestions(
      [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {},
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          chapterTag: "二次函数",
          knowledgeTags: ["顶点公式", "最值"],
          customTags: ["易错"]
        }
      ],
      {
        type: "chapter",
        name: "二次函数"
      }
    );

    expect(questions[0].chapterTag).toBeNull();
  });

  it("merges one array tag into another and removes duplicates", () => {
    const questions = mergeTagInQuestions(
      [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {},
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          knowledgeTags: ["tag-a", "tag-b"]
        },
        {
          id: "q-2",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {},
          status: "reviewed",
          source: "manual",
          confidence: 1,
          crossPageGroupId: null,
          knowledgeTags: ["tag-b"]
        }
      ],
      {
        type: "knowledge",
        from: "tag-a",
        to: "tag-b"
      }
    );

    expect(questions[0].knowledgeTags).toEqual(["tag-b"]);
    expect(questions[1].knowledgeTags).toEqual(["tag-b"]);
  });
});
