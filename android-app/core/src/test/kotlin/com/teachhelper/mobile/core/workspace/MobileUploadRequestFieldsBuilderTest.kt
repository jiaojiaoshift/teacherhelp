package com.teachhelper.mobile.core.workspace

import com.teachhelper.mobile.core.upload.MobileUploadKind
import kotlin.test.Test
import kotlin.test.assertEquals

class MobileUploadRequestFieldsBuilderTest {
  @Test
  fun `builds receive request fields with serialized target path`() {
    val fields =
      MobileUploadRequestFieldsBuilder.build(
        uploadKind = MobileUploadKind.LECTURE_ARCHIVE_PDF,
        targetNode =
          WorkspaceTargetNode(
            id = "folder-1",
            name = "力学专题",
            path = listOf("高中物理", "力学", "力学专题"),
            targetKind = WorkspaceTargetKind.EXAM_FOLDER
          ),
        fileName = "朱姐_高二_26_06_04.pdf",
        deviceId = "device-1",
        pairedSessionId = "pairing-session-1"
      )

    assertEquals("lecture_archive_pdf", fields["uploadKind"])
    assertEquals("folder-1", fields["targetNodeId"])
    assertEquals("[\"高中物理\",\"力学\",\"力学专题\"]", fields["targetNodePath"])
    assertEquals("朱姐_高二_26_06_04.pdf", fields["fileName"])
    assertEquals("device-1", fields["deviceId"])
    assertEquals("pairing-session-1", fields["pairedSessionId"])
  }
}
