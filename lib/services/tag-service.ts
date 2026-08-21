import type { QuestionDraftEntity, TagEntity } from "@/lib/domain/entities";

function createTagId(type: TagEntity["type"], name: string) {
  return `${type}:${name}`;
}

function uniqueTagNames(tagNames: string[]): string[] {
  return Array.from(new Set(tagNames.map((tagName) => tagName.trim()).filter(Boolean)));
}

export function collectTagsFromQuestions(questions: QuestionDraftEntity[]): TagEntity[] {
  const counts = new Map<string, TagEntity>();

  const upsert = (type: TagEntity["type"], name: string | null | undefined) => {
    const normalizedName = name?.trim();
    if (!normalizedName) {
      return;
    }

    const id = createTagId(type, normalizedName);
    const current = counts.get(id);

    if (current) {
      current.usageCount += 1;
      return;
    }

    counts.set(id, {
      id,
      name: normalizedName,
      type,
      usageCount: 1
    });
  };

  questions.forEach((question) => {
    upsert("chapter", question.chapterTag);
    (question.knowledgeTags ?? []).forEach((tagName) => upsert("knowledge", tagName));
    (question.customTags ?? []).forEach((tagName) => upsert("custom", tagName));
  });

  return Array.from(counts.values()).sort((left, right) => {
    if (right.usageCount !== left.usageCount) {
      return right.usageCount - left.usageCount;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function renameTagInQuestions(
  questions: QuestionDraftEntity[],
  input: {
    type: TagEntity["type"];
    from: string;
    to: string;
  }
): QuestionDraftEntity[] {
  const nextName = input.to.trim();
  if (!nextName) {
    return questions;
  }

  return questions.map((question) => {
    if (input.type === "chapter") {
      return question.chapterTag === input.from
        ? {
            ...question,
            chapterTag: nextName
          }
        : question;
    }

    if (input.type === "knowledge") {
      const knowledgeTags = (question.knowledgeTags ?? []).map((tagName) =>
        tagName === input.from ? nextName : tagName
      );

      return {
        ...question,
        knowledgeTags
      };
    }

    const customTags = (question.customTags ?? []).map((tagName) =>
      tagName === input.from ? nextName : tagName
    );

    return {
      ...question,
      customTags
    };
  });
}

export function removeTagFromQuestions(
  questions: QuestionDraftEntity[],
  input: {
    type: TagEntity["type"];
    name: string;
  }
): QuestionDraftEntity[] {
  return questions.map((question) => {
    if (input.type === "chapter") {
      return question.chapterTag === input.name
        ? {
            ...question,
            chapterTag: null
          }
        : question;
    }

    if (input.type === "knowledge") {
      return {
        ...question,
        knowledgeTags: (question.knowledgeTags ?? []).filter((tagName) => tagName !== input.name)
      };
    }

    return {
      ...question,
      customTags: (question.customTags ?? []).filter((tagName) => tagName !== input.name)
    };
  });
}

export function mergeTagInQuestions(
  questions: QuestionDraftEntity[],
  input: {
    type: TagEntity["type"];
    from: string;
    to: string;
  }
): QuestionDraftEntity[] {
  const nextName = input.to.trim();

  if (!nextName || input.from === nextName) {
    return questions;
  }

  return questions.map((question) => {
    if (input.type === "chapter") {
      return question.chapterTag === input.from
        ? {
            ...question,
            chapterTag: nextName
          }
        : question;
    }

    if (input.type === "knowledge") {
      return {
        ...question,
        knowledgeTags: uniqueTagNames(
          (question.knowledgeTags ?? []).map((tagName) =>
            tagName === input.from ? nextName : tagName
          )
        )
      };
    }

    return {
      ...question,
      customTags: uniqueTagNames(
        (question.customTags ?? []).map((tagName) =>
          tagName === input.from ? nextName : tagName
        )
      )
    };
  });
}
