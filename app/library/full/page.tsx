"use client";

import { ExamLibraryFileManager } from "@/components/library/library-file-manager";
import { QuestionDrawer } from "@/components/layout/drawer";
import { AppShell } from "@/components/layout/shell";
import { SidebarPanel } from "@/components/layout/sidebar";

export default function FullLibraryPage() {
  return (
    <AppShell aside={<QuestionDrawer />} sidebar={<SidebarPanel />}>
      <ExamLibraryFileManager library="full" />
    </AppShell>
  );
}

