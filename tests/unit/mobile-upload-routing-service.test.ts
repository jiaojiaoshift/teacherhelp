import { describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { resolveMobileUploadRoute } from "@/lib/services/mobile-upload-routing-service";

describe("mobile-upload-routing-service", () => {
  it("routes one question-bank pdf upload to the selected question-folder target", () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find((folder) => folder.subjectScope === "高中数学");

    expect(targetFolder).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-1",
          deviceId: "device-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          targetNodePath: targetFolder!.path,
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    ).toEqual({
      ok: true,
      route: {
        operation: "question_bank_ingestion",
        targetKind: "question_folder",
        targetNodeId: targetFolder!.id,
        targetNodePath: targetFolder!.path,
        normalizedFileName: "math.pdf"
      }
    });
  });

  it("routes one full-paper pdf upload to one full-library folder target", () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const fullFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );

    expect(fullFolder).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-2",
          deviceId: "device-a",
          uploadKind: "full_paper_pdf",
          targetNodeId: fullFolder!.id,
          targetNodePath: fullFolder!.path,
          originalFileName: "suite.pdf",
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    ).toEqual({
      ok: true,
      route: {
        operation: "full_paper_split",
        targetKind: "exam_folder",
        targetFolderId: fullFolder!.id,
        targetFolderPath: fullFolder!.path,
        normalizedFileName: "suite.pdf"
      }
    });
  });

  it("routes one lecture-archive upload only to a lecture-archive folder target", () => {
    const questionFolders = buildInitialFolderTree();
    const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

    expect(physics).toBeTruthy();

    const chapter = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const leaf = createCustomFolder({
      name: "牛顿定律",
      parent: chapter
    });
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, leaf));
    const archiveFolder = examLibraryFolders.find(
      (folder) => folder.role === "lecture_archive" && folder.parentId === `specialized--${leaf.id}`
    );

    expect(archiveFolder).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-3",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: archiveFolder!.id,
          targetNodePath: archiveFolder!.path,
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    ).toEqual({
      ok: true,
      route: {
        operation: "archive_only",
        targetKind: "exam_folder",
        targetFolderId: archiveFolder!.id,
        targetFolderPath: archiveFolder!.path,
        normalizedFileName: "张三_高一_26_06_03.pdf"
      }
    });
  });

  it("routes one lecture-archive upload from one specialized third-level folder into its archive folder", () => {
    const questionFolders = buildInitialFolderTree();
    const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

    expect(physics).toBeTruthy();

    const chapter = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const leaf = createCustomFolder({
      name: "牛顿定律",
      parent: chapter
    });
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, leaf));
    const specializedLeaf = examLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );
    const archiveFolder = examLibraryFolders.find(
      (folder) => folder.role === "lecture_archive" && folder.parentId === specializedLeaf?.id
    );

    expect(specializedLeaf).toBeTruthy();
    expect(archiveFolder).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-3b",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: specializedLeaf!.id,
          targetNodePath: specializedLeaf!.path,
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    ).toEqual({
      ok: true,
      route: {
        operation: "archive_only",
        targetKind: "exam_folder",
        targetFolderId: archiveFolder!.id,
        targetFolderPath: archiveFolder!.path,
        normalizedFileName: "张三_高一_26_06_03.pdf"
      }
    });
  });

  it("routes one primary-lecture upload to the target primary lecture and normalizes its file name", () => {
    const questionFolders = buildInitialFolderTree();
    const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

    expect(physics).toBeTruthy();

    const chapter = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const leaf = createCustomFolder({
      name: "牛顿定律",
      parent: chapter
    });
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, leaf));
    const specializedLeaf = examLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );
    const documents = createDefaultSpecializedDocuments({
      folder: specializedLeaf!,
      subjectScope: specializedLeaf!.subjectScope
    });
    const primaryLecture = documents.find((document) => document.lectureVariant === "primary");

    expect(primaryLecture).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-4",
          deviceId: "device-a",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: primaryLecture!.id,
          targetNodePath: specializedLeaf!.path,
          originalFileName: "随手命名.pdf",
          normalizedFileName: "随手命名.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: documents
      })
    ).toEqual({
      ok: true,
      route: {
        operation: "primary_lecture_update",
        targetKind: "exam_document",
        targetDocumentId: primaryLecture!.id,
        targetFolderId: specializedLeaf!.id,
        normalizedFileName: "牛顿定律主讲义.pdf"
      }
    });
  });

  it("rejects one lecture-archive upload that points to a non-archive folder", () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const nonArchiveFolder = examLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.depth === 1
    );

    expect(nonArchiveFolder).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-5",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: nonArchiveFolder!.id,
          targetNodePath: nonArchiveFolder!.path,
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    ).toEqual({
      ok: false,
      errorMessage: "讲义归档上传只能投递到讲义归档目录"
    });
  });

  it("rejects one primary-lecture upload that points to a non-primary document", () => {
    const questionFolders = buildInitialFolderTree();
    const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

    expect(physics).toBeTruthy();

    const chapter = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const leaf = createCustomFolder({
      name: "牛顿定律",
      parent: chapter
    });
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, leaf));
    const specializedLeaf = examLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );
    const documents = createDefaultSpecializedDocuments({
      folder: specializedLeaf!,
      subjectScope: specializedLeaf!.subjectScope
    });
    const blankLecture = documents.find((document) => document.lectureVariant === "blank");

    expect(blankLecture).toBeTruthy();

    expect(
      resolveMobileUploadRoute({
        task: {
          id: "task-6",
          deviceId: "device-a",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: blankLecture!.id,
          targetNodePath: specializedLeaf!.path,
          originalFileName: "随手命名.pdf",
          normalizedFileName: "随手命名.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: documents
      })
    ).toEqual({
      ok: false,
      errorMessage: "主讲义上传必须指向一个主讲义文档"
    });
  });
});
