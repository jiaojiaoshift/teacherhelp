import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/shell";
import { useToastStore } from "@/lib/stores/toast-store";

describe("toast-viewport", () => {
  beforeEach(() => {
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
  });

  it("renders toast messages from the global toast store", () => {
    useToastStore.getState().pushToast({
      title: "toast success message",
      tone: "success"
    });

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.getByRole("status")).toHaveTextContent("toast success message");
  });

  it("supports toast actions and dismisses after action", () => {
    let acted = false;

    useToastStore.getState().pushToast({
      title: "toast undo message",
      tone: "success",
      actionLabel: "undo action",
      onAction: () => {
        acted = true;
      }
    });

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "undo action" }));

    expect(acted).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows queued notifications one at a time until the current item is dismissed", () => {
    const firstId = useToastStore.getState().pushToast({
      title: "first queued message",
      tone: "info"
    });
    useToastStore.getState().pushToast({
      title: "second queued message",
      tone: "error"
    });

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("first queued message");
    expect(screen.queryByText("second queued message")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `dismiss-${firstId}` }));

    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("second queued message");
  });
});
