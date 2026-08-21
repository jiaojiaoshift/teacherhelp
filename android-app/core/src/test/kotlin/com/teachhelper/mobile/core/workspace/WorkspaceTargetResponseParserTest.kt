package com.teachhelper.mobile.core.workspace

import com.teachhelper.mobile.core.upload.MobileUploadKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class WorkspaceTargetResponseParserTest {
  @Test
  fun `parses workspace targets for a supported upload kind`() {
    val result =
      WorkspaceTargetResponseParser.parse(
        """
        {
          "uploadKind": "lecture_archive_pdf",
          "targetNodes": [
            {
              "id": "folder-1",
              "name": "力学专题",
              "path": ["高中物理", "力学", "力学专题"],
              "targetKind": "exam_folder"
            },
            {
              "id": "folder-2",
              "name": "电学专题",
              "path": ["高中物理", "电学", "电学专题"],
              "targetKind": "exam_folder"
            }
          ]
        }
        """.trimIndent()
      )

    val success = assertIs<WorkspaceTargetResponseParseResult.Success>(result)
    assertEquals(MobileUploadKind.LECTURE_ARCHIVE_PDF, success.response.uploadKind)
    assertEquals(2, success.response.targetNodes.size)
    assertEquals("folder-1", success.response.targetNodes.first().id)
    assertEquals(listOf("高中物理", "力学", "力学专题"), success.response.targetNodes.first().path)
  }

  @Test
  fun `rejects unsupported upload kinds in workspace target responses`() {
    val result =
      WorkspaceTargetResponseParser.parse(
        """
        {
          "uploadKind": "other_upload_kind",
          "targetNodes": []
        }
        """.trimIndent()
      )

    val failure = assertIs<WorkspaceTargetResponseParseResult.Failure>(result)
    assertEquals("Unsupported mobile upload kind", failure.message)
  }
}
