import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { WorkspaceHydrator } from "@/components/app/workspace-hydrator";
import { AppSettingsHydrator } from "@/components/app/app-settings-hydrator";
import { CrossPageReviewHost } from "@/components/workbench/cross-page-review-host";
import { buildTeachHelperMetadata } from "@/lib/config/public-origin";

export const metadata: Metadata = buildTeachHelperMetadata();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html data-theme="dark" lang="zh-CN">
      <body>
        <AppSettingsHydrator />
        <WorkspaceHydrator />
        <CrossPageReviewHost />
        {children}
      </body>
    </html>
  );
}

