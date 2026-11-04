/** Life Brain C.3 (ADR-152): the client-safe states of the event actions. */
export type EventActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly undoId: string | null;
};

export const idleEventActionState: EventActionState = { status: "idle", message: "", undoId: null };

export type EventAction = (state: EventActionState, formData: FormData) => Promise<EventActionState>;
