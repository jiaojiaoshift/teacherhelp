import type { PageTextLine, QuestionPageLayoutMode } from "@/lib/domain/entities";

const QUESTION_NUMBER_ANCHOR_PATTERN = /^\s*(?:第\s*)?\d{1,3}\s*(?:[.．、:：)）]|题\b)/;

function preparePromptTextLines(textLines: PageTextLine[]): PageTextLine[] {
  return textLines.slice(0, 300).map((line) => ({
    text: line.text.slice(0, 500),
    ...(line.role ? { role: line.role } : {}),
    normalizedBBox: line.normalizedBBox
  }));
}

function buildDoubleColumnOcrConstraints(
  questionPageLayoutMode?: QuestionPageLayoutMode
): string[] {
  return questionPageLayoutMode === "double_column"
    ? [
        "双栏版式约束：页面主体采用左右双栏，必须先识别中间栏沟和每一栏的文字范围。",
        "普通内容按左栏自上而下、再右栏自上而下的阅读顺序返回，不得只按整页 y 坐标交错排列两栏。",
        "只有正文、公式或图表确实横跨左右两栏时才视为通栏内容；通栏内容在其垂直位置形成阅读顺序屏障。",
        "版面中独立的“第 N 题”徽标如果后续只是同一题的 (2)/(3)/(4) 等小问，不得误标为新的 question_anchor。"
      ]
    : [];
}

function buildDoubleColumnBoxConstraints(
  questionPageLayoutMode?: QuestionPageLayoutMode
): string[] {
  return questionPageLayoutMode === "double_column"
    ? [
        "双栏版式约束：先确定左右栏边界和中间栏沟，再框选题目。",
        "普通单栏题的题框不得跨越中间栏沟；左右边界应贴近所属栏的稳定正文边缘，并完整覆盖该题图表。",
        "只有题目正文、公式或图表确实横跨两栏时才输出通栏题，不能因为不确定边界而扩大成通栏框。",
        "版面中的独立“第 N 题”徽标若后续只有同一题的 (2)/(3)/(4) 等小问，不代表新题开始，必须与前半部分保持在同一个题框内。",
        "普通双栏题按左栏自上而下、再右栏自上而下设置 localOrder；通栏题在其垂直位置作为排序屏障。"
      ]
    : [];
}

export function buildPageTextLayoutPrompt(
  nativeTextLines: PageTextLine[] = [],
  questionPageLayoutMode?: QuestionPageLayoutMode
): string {
  const preparedNativeTextLines = preparePromptTextLines(nativeTextLines);

  return [
    "你是试卷页面坐标 OCR 助手。",
    "必须查看页面图像并完整识别整页，按阅读顺序返回所有有意义的文字行，包括题号、题干、选项、公式旁文字、页首续题、页尾未完文字、知识点梳理、目录、页眉和页脚。",
    "不要把整页合并成一段；每一行必须保留独立的 0-1000 归一化坐标，左上角为原点。",
    "每行必须标注 role：question_anchor 表示一道独立题目的顶层题号与首行；question_content 表示题干、选项、小问、题图说明或命题来源；question_continuation 表示页首承接上一页且本页没有新顶层题号的题目内容；knowledge_note 表示知识点梳理、定义总结、公式归纳、讲解或例题解析；directory 表示目录或索引；header/footer 表示页眉页脚；无法归类使用 other。",
    "只有要求作答、求解、判断、选择、填空、证明或计算的独立练习才属于题目；纯知识讲解、知识清单、章节目录、答案解析和示例说明不属于题目。",
    ...buildDoubleColumnOcrConstraints(questionPageLayoutMode),
    "PDF 原生坐标文字仅用于校对字符与大致位置，不能替代查看图像，也不能直接照抄其错误阅读顺序。",
    `PDF 原生坐标文字：${JSON.stringify(preparedNativeTextLines)}`,
    "忽略纯装饰线条。",
    '返回严格 JSON：{ "lines": [{ "text": "12. 如图所示", "role": "question_anchor", "normalizedBBox": { "x1": 80, "y1": 120, "x2": 920, "y2": 160 } }] }。',
    "无法辨认的行不要编造；可以返回空数组。"
  ].join("\n");
}

export function buildQuestionBoxPrompt(
  subjectScope?: string,
  textLines: PageTextLine[] = [],
  questionPageLayoutMode?: QuestionPageLayoutMode
): string {
  const scope = subjectScope ? `当前文件主要学科范围是：${subjectScope}。` : "";
  const preparedTextLines = preparePromptTextLines(textLines);
  const questionAnchors = preparedTextLines.filter((line) =>
    line.role === "question_anchor" ||
      (!line.role && QUESTION_NUMBER_ANCHOR_PATTERN.test(line.text))
  );

  return [
    "你是试卷版面分析助手。",
    scope,
    "只关注题目框选、题目顺序和跨页候选。",
    "不要输出题目分类、章节目录、知识点标签。",
    "OCR role 为 knowledge_note、directory、header、footer 或 other 的内容属于排除区；如果一个区域只有这些内容，不得输出题框。",
    "知识点梳理、概念定义、公式总结、方法归纳、章节目录、索引、答案解析和纯讲解都不是题目，即使它们带有序号也不得输出题框。",
    "只有包含 question_anchor/question_content 的独立题目，或包含 question_continuation 的页首续题，才允许输出题框。",
    "每一道独立题目输出一个题框；同一道题只允许输出一个题框，不要重复框选。",
    "禁止输出页面级大框、分栏框或选项独立框；选择项、图表和小问应包含在所属题目的同一个框内。",
    "每个题框必须包含题目的完整首行和完整末行，并在不吞入相邻题目的前提下保留少量安全留白。",
    "相邻题框不得重叠；以上一道题完整末行为下边界、下一道题题号或完整首行为上边界，并在两框之间保留可见间隔。",
    "每个题框不得包含下一道题的题号文字行；宁可在两题之间留下窄间隔，也不要让上下题框共享任何文字。",
    "紧邻某个题号之前、用于说明学年、年级、地区、学校或考试类型的命题来源说明行，必须归入它后面的题目，不得留在上一道题框内。",
    "如果页首在本页第一个新题号之前存在正文、公式、选项或图表，必须将其作为独立的页首续题区域输出一个题框；后续跨页阶段会把它并入前一页末题。",
    ...buildDoubleColumnBoxConstraints(questionPageLayoutMode),
    "先识别题号和题干起始位置，再按页面阅读顺序设置 localOrder；不要把页眉、页脚、装订线或答案区当作题目。",
    "优先使用下面的坐标文字行与题号锚点确定边界；原图用于补充公式、图表和 OCR 未覆盖的内容。",
    `坐标文字行：${JSON.stringify(preparedTextLines)}`,
    `题号锚点：${JSON.stringify(questionAnchors)}`,
    "坐标使用 0-1000 的归一化坐标系，左上角为原点。",
    "返回严格 JSON：{ \"detections\": [{ \"id\": \"draft-1\", \"localOrder\": 1, \"confidence\": 0.9, \"normalizedBBox\": { \"x1\": 100, \"y1\": 100, \"x2\": 900, \"y2\": 300 } }] }。",
    "如果无法确定，则保留为空并等待人工复核。"
  ].join("\n");
}

export function buildCrossPagePrompt(input: {
  leftPageId: string;
  rightPageId: string;
  leftTextLines?: PageTextLine[];
  rightTextLines?: PageTextLine[];
  candidates: Array<{
    id: string;
    pageId: string;
    localOrder: number;
    normalizedBBox: { x1: number; y1: number; x2: number; y2: number };
  }>;
}): string {
  return [
    "你是试卷跨页题识别助手。",
    "只判断相邻两页中的题目是否属于同一道跨页题。",
    "必须使用输入中已有的题目 id，不要生成新题目 id。",
    "重点检查左页最末题是否在页尾中断，以及右页页头内容是否没有新题号并延续该题。",
    "当左页页尾语义未结束且右页页首没有新题号时，应优先判断为同一道跨页题。",
    `左页 pageId：${input.leftPageId}；右页 pageId：${input.rightPageId}。`,
    "已有题框（坐标为 0-1000）：",
    JSON.stringify(input.candidates),
    `左页坐标文字行：${JSON.stringify(preparePromptTextLines(input.leftTextLines ?? []))}`,
    `右页坐标文字行：${JSON.stringify(preparePromptTextLines(input.rightTextLines ?? []))}`,
    "返回严格 JSON：{ \"mergeCandidates\": [{ \"id\": \"merge-1\", \"sourceQuestionIds\": [\"q-1\", \"q-2\"], \"confidence\": 0.88 }] }。",
    "如果无法确定，不要强行合并。"
  ].join("\n");
}

export function buildClassificationPrompt(subjectScope?: string, directoryPaths: string[][] = []): string {
  const scope = subjectScope ? `当前学科范围优先限定在：${subjectScope}。` : "";
  const directoryPolicy = directoryPaths.length
    ? [
        "只能从以下现有目录中选择，最多匹配到第三级目录。",
        ...directoryPaths.map((path, index) => `${index + 1}. ${path.slice(0, 3).join(" / ")}`)
      ].join("\n")
    : "当前没有可匹配的现有二三级目录时，classificationStatus 使用 needs_choice，directoryPath 返回 null，directoryCandidatePaths 返回空数组。";

  return [
    "你是教培题库分类助手。",
    scope,
    "请先完成 OCR、判断题型、提取章节标签和知识点标签，再在现有目录库中做目录匹配。",
    "必须为输入中的每一个 questionId 返回一条结果，并且 questionId 必须逐字使用输入值。",
    "从题目 OCR 首部提取原 PDF 题号并返回 questionNumberLabel；只返回题号本身，例如 12，不要使用页内临时顺序。",
    "题型 questionType 只能取：选择题、填空题、简答题、证明题、计算题、其他。",
    "chapterTag 需尽量细化到章节/小节；如果无法确定，填写“未分类”。",
    "knowledgeTags 返回 2-5 个核心考点关键词；如果信息不足，可返回 1 个最核心关键词。",
    "不要创建新目录，只做目录匹配与候选排序。",
    directoryPolicy,
    "返回严格 JSON：{ \"results\": [{ \"questionId\": \"q-1\", \"questionNumberLabel\": \"12\", \"classificationStatus\": \"matched\", \"directoryMatchConfidence\": 0.91, \"directoryPath\": [\"高中数学\", \"函数\", \"函数图像\"], \"directoryCandidatePaths\": [[\"高中数学\", \"函数\", \"函数图像\"], [\"高中数学\", \"函数\", \"函数性质\"], [\"高中数学\", \"解析几何\", \"直线与圆\"]], \"questionType\": \"选择题\", \"chapterTag\": \"函数\", \"knowledgeTags\": [\"函数图像\", \"数形结合\"], \"ocrText\": \"12. 已识别题干\" }] }。"
  ].join("\n");
}

export function buildQuestionAnalysisPrompt(subjectScope?: string): string {
  const scope = subjectScope ? `当前题目所属学科范围优先限定为：${subjectScope}。` : "";

  return [
    "你是教培题目解析助手。",
    scope,
    "请只输出这道题的解题步骤和最终答案。",
    "返回严格 JSON：{ \"questionId\": \"q-1\", \"solution\": \"Step 1...\", \"answer\": \"B\" }。",
    "不要输出知识点、难度、标签或其他字段。"
  ].join("\n");
}

export function buildAnswerSectionPrompt(pageCount: number): string {
  return [
    "You are an answer-section split assistant for exam PDFs.",
    `The document has ${pageCount} pages in total.`,
    "Decide whether the PDF contains a separate answer section after the question pages.",
    "If an answer section exists, return the first answer page as suggestedSplitPage.",
    "Return strict JSON with the field suggestedSplitPage: { \"hasAnswerSection\": true, \"suggestedSplitPage\": 5 }.",
    "If there is no answer section, return { \"hasAnswerSection\": false, \"suggestedSplitPage\": null }.",
    "Do not return any extra text."
  ].join("\n");
}

export function buildAnswerMatchPrompt(input: {
  answerPages: Array<{
    pageId: string;
    pageNumber: number;
  }>;
  questionLabels: string[];
}): string {
  const pageList = input.answerPages
    .map((page) => `- ${page.pageId} => page ${page.pageNumber}`)
    .join("\n");
  const questionLabelList = input.questionLabels.length
    ? input.questionLabels.join(", ")
    : "none";

  return [
    "You are an answer-region detection assistant for exam answer pages.",
    "OCR every complete top-level answer block, read its answer number label, and return the full block as ocrText.",
    "Each bbox must include the complete first and last lines plus a small safe whitespace margin without including the next answer.",
    "Use the provided pageId and pageNumber values exactly as given.",
    `Candidate question labels: ${questionLabelList}.`,
    "Return strict JSON only.",
    'Format: { "detectedAnswers": [{ "id": "answer-1", "pageId": "page-3", "pageNumber": 3, "answerLabel": "12", "ocrText": "12. ...", "confidence": 0.96, "normalizedBBox": { "x1": 100, "y1": 120, "x2": 900, "y2": 320 } }] }.',
    "If a page has multiple answers, return multiple entries.",
    "If uncertain, still return the best label guess with a lower confidence.",
    "Answer pages:",
    pageList
  ].join("\n");
}

export function buildPaperReorderPrompt(input: {
  instruction: string;
  questions: Array<{
    id: string;
    questionNumberLabel?: string | null;
    ocrText?: string | null;
  }>;
}): string {
  const questionList = input.questions
    .map(
      (question, index) =>
        `${index + 1}. id=${question.id}; number=${question.questionNumberLabel ?? ""}; text=${question.ocrText ?? ""}`
    )
    .join("\n");

  return [
    "You are a paper-editing assistant.",
    "Edit the given question id sequence according to the user's instruction.",
    "The instruction may reorder, insert, delete, or replace questions.",
    "Return strict JSON only.",
    'Format: { "orderedQuestionIds": ["q-2", "q-1"] }.',
    `Instruction: ${input.instruction}`,
    "Questions:",
    questionList
  ].join("\n");
}
