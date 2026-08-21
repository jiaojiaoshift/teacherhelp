interface NotebookDetailPageProps {
  params: {
    id: string;
  };
}

export default function NotebookDetailPage({ params }: NotebookDetailPageProps) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">笔记本 {params.id}</h1>
      <p className="mt-3 text-sm text-slate-500">阶段三实现。</p>
    </div>
  );
}
