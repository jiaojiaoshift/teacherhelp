import type { SourcePurgeDecisionInput } from "@/lib/domain/entities";

export function canMarkDocumentImportReady(input: {
  pages: Array<{ id: string; reviewStatus: "reviewed" | "unreviewed" }>;
  questions: Array<{
    id: string;
    classificationStatus?: "unclassified" | "matched" | "needs_choice" | "pending_bucket" | "confirmed";
  }>;
}): boolean {
  if (input.pages.length === 0 || input.questions.length === 0) {
    return false;
  }

  return (
    input.pages.every((page) => page.reviewStatus === "reviewed") &&
    input.questions.every(
      (question) =>
        question.classificationStatus === "confirmed" ||
        question.classificationStatus === "pending_bucket"
    )
  );
}

export function canPurgeSourceAsset(input: SourcePurgeDecisionInput): boolean {
  return (
    input.documentStatus === "import_ready" &&
    input.userConfirmedPurge &&
    !input.hasUnsavedChanges &&
    input.hasDurableQuestionImages
  );
}
