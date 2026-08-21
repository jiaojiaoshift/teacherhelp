"use client";

import { QuestionLibraryFileManager } from "@/components/library/library-file-manager";
import { QuestionDrawer } from "@/components/layout/drawer";
import { AppShell } from "@/components/layout/shell";
import { SidebarPanel } from "@/components/layout/sidebar";

export default function QuestionsLibraryPage() {
  return (
    <AppShell aside={<QuestionDrawer />} sidebar={<SidebarPanel />}>
      <QuestionLibraryFileManager />
    </AppShell>
  );
}

