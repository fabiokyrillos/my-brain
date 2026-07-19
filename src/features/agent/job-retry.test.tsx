import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import * as agentForms from "./forms";
import type { AgentFormAction } from "./forms";

type JobRetryFormProps = {
  action: AgentFormAction;
  jobId: string;
  locale: "pt-BR" | "en";
};

const JobRetryForm = (agentForms as unknown as {
  JobRetryForm?: ComponentType<JobRetryFormProps>;
}).JobRetryForm;

describe("JobRetryForm", () => {
  it("submits the owned job reference with localized Portuguese copy", async () => {
    expect(JobRetryForm).toBeTypeOf("function");
    if (!JobRetryForm) return;

    const actionMock = vi.fn<AgentFormAction>(async () => ({
      status: "success" as const,
      message: "Análise concluída.",
    }));
    const action = actionMock;
    render(
      <JobRetryForm
        action={action}
        jobId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
        locale="pt-BR"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );

    await waitFor(() => expect(actionMock).toHaveBeenCalledOnce());
    const formData = actionMock.mock.calls[0]?.[1];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("jobId")).toBe("72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
    expect(formData.get("locale")).toBe("pt-BR");
  });

  it("renders the English retry label", () => {
    expect(JobRetryForm).toBeTypeOf("function");
    if (!JobRetryForm) return;

    const action = vi.fn(async () => ({
      status: "error" as const,
      message: "Could not retry.",
    })) as AgentFormAction;
    render(
      <JobRetryForm
        action={action}
        jobId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
        locale="en"
      />,
    );

    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
