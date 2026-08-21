package com.teachhelper.mobile.core.workspace

import kotlin.test.Test
import kotlin.test.assertEquals

class WorkspaceTargetTreeBuilderTest {
  @Test
  fun `builds deduplicated tree rows from shared folder paths`() {
    val rows =
      WorkspaceTargetTreeBuilder.build(
        listOf(
          WorkspaceTargetNode(
            id = "folder-1",
            name = "力学专题",
            path = listOf("高中物理", "力学", "力学专题"),
            targetKind = WorkspaceTargetKind.EXAM_FOLDER
          ),
          WorkspaceTargetNode(
            id = "folder-2",
            name = "电学专题",
            path = listOf("高中物理", "电学", "电学专题"),
            targetKind = WorkspaceTargetKind.EXAM_FOLDER
          )
        )
      )

    assertEquals(
      listOf(
        "高中物理|0|false",
        "力学|1|false",
        "力学专题|2|true",
        "电学|1|false",
        "电学专题|2|true"
      ),
      rows.map { "${it.label}|${it.depth}|${it.selectable}" }
    )
  }

  @Test
  fun `appends primary lecture documents under their folder path`() {
    val rows =
      WorkspaceTargetTreeBuilder.build(
        listOf(
          WorkspaceTargetNode(
            id = "doc-1",
            name = "主讲义",
            path = listOf("专题卷库", "力学", "牛顿定律"),
            targetKind = WorkspaceTargetKind.EXAM_DOCUMENT
          )
        )
      )

    assertEquals(
      listOf(
        "专题卷库|0|false",
        "力学|1|false",
        "牛顿定律|2|false",
        "主讲义|3|true"
      ),
      rows.map { "${it.label}|${it.depth}|${it.selectable}" }
    )
  }
}
