export type BirthdayActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
};

export const idleBirthdayState: BirthdayActionState = { status: "idle", message: "" };

export type BirthdayAction = (previous: BirthdayActionState, formData: FormData) => Promise<BirthdayActionState>;
