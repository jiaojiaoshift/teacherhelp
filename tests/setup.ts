import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

afterEach(() => {
  cleanup();
  useToastStore.getState().clearToasts();
  useWorkbenchStore.getState().resetTransientProgress();
});
