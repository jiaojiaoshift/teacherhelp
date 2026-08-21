package com.teachhelper.mobile.core.workspace

data class WorkspaceTargetTreeRow(
  val label: String,
  val depth: Int,
  val selectable: Boolean,
  val targetNode: WorkspaceTargetNode?
)

object WorkspaceTargetTreeBuilder {
  fun build(targetNodes: List<WorkspaceTargetNode>): List<WorkspaceTargetTreeRow> {
    val rows = mutableListOf<WorkspaceTargetTreeRow>()
    val emittedPathKeys = linkedSetOf<String>()

    for (targetNode in targetNodes) {
      targetNode.path.forEachIndexed { index, segment ->
        val pathKey = targetNode.path.take(index + 1).joinToString(separator = "\u0000")

        if (emittedPathKeys.add(pathKey)) {
          rows +=
            WorkspaceTargetTreeRow(
              label = segment,
              depth = index,
              selectable = false,
              targetNode = null
            )
        }
      }

      if (targetNode.targetKind == WorkspaceTargetKind.EXAM_DOCUMENT) {
        rows +=
          WorkspaceTargetTreeRow(
            label = targetNode.name,
            depth = targetNode.path.size,
            selectable = true,
            targetNode = targetNode
          )
        continue
      }

      if (rows.isNotEmpty()) {
        rows[rows.lastIndex] =
          rows.last().copy(
            selectable = true,
            targetNode = targetNode
          )
      }
    }

    return rows
  }
}
