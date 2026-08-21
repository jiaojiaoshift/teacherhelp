import type {
  CrossPageCandidateEntity,
  PageEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";
import { buildCroppedQuestionPreviewDataUrl } from "@/lib/services/lecture-preview-service";
import { buildCrossPageCandidateReviewDisplay } from "@/lib/services/review-service";

export function CrossPageReviewDialog(props: {
  candidate: CrossPageCandidateEntity | null;
  current: number;
  total: number;
  pages: PageEntity[];
  questions: QuestionDraftEntity[];
  previewDataUrls: Record<string, string>;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  if (!props.candidate) {
    return null;
  }

  const display = buildCrossPageCandidateReviewDisplay({
    candidate: props.candidate,
    pages: props.pages,
    questions: props.questions
  });
  const questionById = new Map(props.questions.map((question) => [question.id, question]));
  const pageById = new Map(props.pages.map((page) => [page.id, page]));
  const previews = props.candidate.sourceQuestionIds.map((questionId, index) => {
    const question = questionById.get(questionId);
    const fallbackPageId =
      index === 0 ? props.candidate!.leftPageId : props.candidate!.rightPageId;
    const pageId = question?.primaryPageId ?? fallbackPageId;
    const page = pageById.get(pageId) ?? null;
    const bbox = question?.bboxByPage[pageId] ?? null;
    const sourceDataUrl = props.previewDataUrls[pageId] ?? null;

    return {
      id: questionId,
      label: display.sourceLabels[index] ?? questionId,
      previewDataUrl:
        page && bbox && sourceDataUrl
          ? buildCroppedQuestionPreviewDataUrl({
              sourceDataUrl,
              page,
              bbox
            })
          : null
    };
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm md:p-6">
      <section
        aria-labelledby="cross-page-review-title"
        aria-modal="true"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl md:max-h-[calc(100vh-3rem)]"
        role="dialog"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-4 md:px-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-50" id="cross-page-review-title">
              跨页候选复核
            </h2>
            <p className="mt-1 text-sm text-zinc-400">{display.pageRange}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-zinc-300">
              {props.current} / {props.total}
            </span>
            <span className="rounded-md border border-teal-700/70 bg-teal-950 px-2.5 py-1.5 text-teal-300">
              {Math.round(props.candidate.confidence * 100)}%
            </span>
          </div>
        </header>

        <div className="px-4 py-4 md:px-5">
          <h3 className="text-sm font-semibold text-zinc-100">{display.title}</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {previews.map((preview) => (
              <figure
                className="overflow-hidden rounded-lg border border-zinc-800 bg-white"
                key={preview.id}
              >
                <figcaption className="border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700">
                  {preview.label}
                </figcaption>
                <div className="flex h-64 items-center justify-center overflow-auto p-2">
                  {preview.previewDataUrl ? (
                    <img
                      alt={`跨页候选片段-${preview.label}`}
                      className="max-h-full w-full object-contain"
                      src={preview.previewDataUrl}
                    />
                  ) : (
                    <span className="text-sm text-zinc-500">暂无片段预览</span>
                  )}
                </div>
              </figure>
            ))}
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-zinc-800 px-4 py-4 sm:flex-row sm:justify-end md:px-5">
          <button
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
            onClick={props.onDismiss}
            type="button"
          >
            不是跨页题
          </button>
          <button
            className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            onClick={props.onAccept}
            type="button"
          >
            合并为一道跨页题
          </button>
        </footer>
      </section>
    </div>
  );
}

