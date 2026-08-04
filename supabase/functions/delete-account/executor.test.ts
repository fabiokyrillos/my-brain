import { assert, assertEquals } from "jsr:@std/assert@1";

import { executeDeletion, findCrossOwnerReference, listOwnedObjects } from "./executor.ts";

/**
 * SH-DELETE-004..008, and the adversarial floor for SH.2 (T-01, T-04, T-07,
 * T-08, T-09, T-32).
 *
 * The double below is a recording fake, not a mock library: every call is
 * observable, and the assertions are about **what was destroyed** rather than
 * about what was returned. A test that only checked return values would pass
 * for an executor that deleted the wrong prefix and reported success.
 *
 * `deno test` runs with no `--allow-*` flags (CI, by design), so nothing here
 * can reach a network or an environment variable; the whole state machine is
 * driven through the injected client.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REQUESTED_AT = "2026-08-04T12:00:00.000Z";

type Row = Record<string, unknown> | null;

type FakeOptions = {
  lifecycleStatus?: string | null;
  lifecycleError?: boolean;
  census?: Record<string, number>;
  censusAfter?: Record<string, number>;
  censusError?: boolean;
  objects?: Record<string, { name: string; size: number }[]>;
  objectsAfterRemoval?: Record<string, { name: string; size: number }[]>;
  listError?: boolean;
  removeError?: boolean;
  crossOwnerPaths?: string[];
  authDeleteError?: boolean;
  lifecycleRowSurvivesAuthDelete?: boolean;
  /**
   * A second invocation deleted the account between this run's gate check and
   * its own `auth.users` delete: the first lifecycle read sees `deleting`, and
   * every later read finds the row cascaded away.
   */
  concurrentRunDeletedUser?: boolean;
};

type Recorder = {
  removedPaths: string[][];
  deletedUsers: string[];
  recorded: Record<string, unknown>[];
  listedPrefixes: string[];
};

function fakeService(options: FakeOptions) {
  const recorder: Recorder = {
    removedPaths: [],
    deletedUsers: [],
    recorded: [],
    listedPrefixes: [],
  };
  let removalHappened = false;
  let lifecycleReads = 0;
  let censusCalls = 0;

  const objects = options.objects ?? {};
  const objectsAfter = options.objectsAfterRemoval ?? {};

  const service = {
    from(table: string) {
      if (table === "account_lifecycle") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => {
                if (options.lifecycleError) return { data: null, error: { message: "boom" } };
                lifecycleReads += 1;
                if (options.concurrentRunDeletedUser && lifecycleReads > 1) {
                  return { data: null, error: null };
                }
                // After the auth delete, the row is gone unless the test says
                // otherwise (the crash-resume vs. genuine-failure distinction).
                if (recorder.deletedUsers.includes(value) && !options.lifecycleRowSurvivesAuthDelete) {
                  return { data: null, error: null };
                }
                if (options.lifecycleStatus === null) return { data: null, error: null };
                return {
                  data: { status: options.lifecycleStatus ?? "deleting", user_id: value },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === "attachments") {
        return {
          select: () => ({
            in: (_column: string, paths: string[]) => ({
              neq: async () => {
                const crossOwner = (options.crossOwnerPaths ?? []).filter((path) =>
                  paths.includes(path),
                );
                return {
                  data: crossOwner.map((path) => ({ storage_path: path, user_id: OTHER })),
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === "user_ai_credentials") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { status: "removed" }, error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },

    storage: {
      from(bucket: string) {
        assertEquals(bucket, "user-files");
        return {
          list: async (prefix: string, _opts: { limit: number; offset: number }) => {
            recorder.listedPrefixes.push(prefix);
            if (options.listError) return { data: null, error: { message: "boom" } };
            const source = removalHappened ? objectsAfter : objects;
            const entries = (source[prefix] ?? []).map((entry) => ({
              name: entry.name,
              metadata: { size: entry.size },
            }));
            // One page is enough for these fixtures; the loop exits on a short
            // page, which every fixture here produces.
            return { data: _opts.offset === 0 ? entries : [], error: null };
          },
          remove: async (paths: string[]) => {
            recorder.removedPaths.push(paths);
            if (options.removeError) return { data: null, error: { message: "boom" } };
            removalHappened = true;
            return { data: paths.map((path) => ({ name: path })), error: null };
          },
        };
      },
    },

    auth: {
      admin: {
        deleteUser: async (userId: string) => {
          if (options.authDeleteError) return { data: null, error: { message: "boom" } };
          recorder.deletedUsers.push(userId);
          return { data: { user: { id: userId } }, error: null };
        },
      },
    },

    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "account_owned_row_counts") {
        if (options.censusError) return { data: null, error: { message: "boom" } };
        // The executor calls this exactly twice — before the cascade for the
        // log's counts, and after it as the zero-residue check. Keying on the
        // call number models that directly, rather than on who performed the
        // delete (which a concurrent run makes ambiguous).
        censusCalls += 1;
        return {
          data: censusCalls === 1 ? options.census ?? {} : options.censusAfter ?? {},
          error: null,
        };
      }
      if (name === "record_account_deletion") {
        recorder.recorded.push(args);
        return { data: "00000000-0000-4000-8000-000000000001", error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };

  // deno-lint-ignore no-explicit-any
  return { service: service as any, recorder };
}

const happyPath: FakeOptions = {
  lifecycleStatus: "deleting",
  census: { entries: 3, tasks: 1 },
  censusAfter: {},
  objects: { [OWNER]: [{ name: "a-file.pdf", size: 100 }, { name: "b-file.png", size: 200 }] },
  objectsAfterRemoval: { [OWNER]: [] },
};

Deno.test("completes: storage removed by exact prefix, account deleted, log recorded", async () => {
  const { service, recorder } = fakeService(happyPath);

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "completed");
  assertEquals(recorder.removedPaths, [[`${OWNER}/a-file.pdf`, `${OWNER}/b-file.png`]]);
  assertEquals(recorder.deletedUsers, [OWNER]);
  assertEquals(recorder.recorded.length, 1);
  assertEquals(recorder.recorded[0].p_outcome, "completed");
  assertEquals(recorder.recorded[0].p_storage_objects_removed, 2);
  assertEquals(recorder.recorded[0].p_storage_bytes_removed, 300);
});

Deno.test("every listed prefix is exactly the owner's id -- ownership is structural", async () => {
  const { service, recorder } = fakeService(happyPath);

  await executeDeletion(service, OWNER, REQUESTED_AT, null);

  for (const prefix of recorder.listedPrefixes) {
    assertEquals(prefix, OWNER);
  }
  assert(recorder.listedPrefixes.length > 0, "the executor must actually enumerate storage");
});

Deno.test("stops when the account never asked: lifecycle is not deleting", async () => {
  const { service, recorder } = fakeService({ ...happyPath, lifecycleStatus: "active" });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "stopped");
  assert(result.outcome === "stopped" && result.stopReason === "lifecycle_not_deleting");
  assertEquals(recorder.removedPaths, [], "nothing may be deleted before the gate passes");
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("stops on an unscannable table rather than forcing (T-32)", async () => {
  const { service, recorder } = fakeService({
    ...happyPath,
    census: { entries: 3, some_future_table: -1 },
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assert(result.outcome === "stopped" && result.stopReason === "unknown_owned_table");
  assertEquals(recorder.removedPaths, [], "unknown residue must halt before any destruction");
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("stops on a cross-owner reference and deletes NOTHING (T-07)", async () => {
  const { service, recorder } = fakeService({
    ...happyPath,
    crossOwnerPaths: [`${OWNER}/b-file.png`],
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assert(result.outcome === "stopped" && result.stopReason === "cross_owner_reference");
  assertEquals(recorder.removedPaths, []);
  assertEquals(recorder.deletedUsers, []);
  assertEquals(recorder.recorded[0].p_outcome, "stopped");
});

Deno.test("stops when storage still lists objects after removal", async () => {
  const { service, recorder } = fakeService({
    ...happyPath,
    objectsAfterRemoval: { [OWNER]: [{ name: "a-file.pdf", size: 100 }] },
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assert(result.outcome === "stopped" && result.stopReason === "storage_residue_remains");
  assertEquals(recorder.deletedUsers, [], "the account survives while its bytes do");
});

Deno.test("stops when rows survive the cascade (the zero-residue assertion)", async () => {
  const { service } = fakeService({ ...happyPath, censusAfter: { entries: 3 } });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assert(result.outcome === "stopped" && result.stopReason === "unknown_owned_table");
});

Deno.test("a genuine auth-delete failure stops; it never reports success", async () => {
  const { service, recorder } = fakeService({
    ...happyPath,
    authDeleteError: true,
    lifecycleRowSurvivesAuthDelete: true,
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assert(result.outcome === "stopped" && result.stopReason === "auth_delete_failed");
  assertEquals(recorder.deletedUsers, []);
});

Deno.test("a concurrent run that already deleted the account does not turn this one into a failure", async () => {
  // Two invocations for the same account (a retry, or a double submit). The
  // other one wins the `auth.users` delete, so this one's delete errors with
  // the user already gone. The distinction that matters: the lifecycle row is
  // absent, which means the deletion *happened* — reporting `auth_delete_failed`
  // here would file a successful deletion as a failure and leave the operator
  // chasing a ghost. A genuine failure (row still present) is the test above.
  const { service, recorder } = fakeService({
    ...happyPath,
    authDeleteError: true,
    concurrentRunDeletedUser: true,
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "completed");
  assertEquals(recorder.recorded[0].p_outcome, "completed");
  assertEquals(recorder.deletedUsers, [], "this run destroyed nothing; the other one did");
});

Deno.test("resume before the account delete: storage already emptied by a crashed run", async () => {
  // The reachable resume case. A run that crashed after step 3 leaves the
  // prefix empty and the account still `deleting`; re-entering finds nothing to
  // remove, verifies, and finishes. (After the `auth.users` delete there is no
  // resume to test: the Bearer token cannot authenticate an account that no
  // longer exists, so the machine is never re-entered — stated in the acceptance
  // record rather than simulated with a fixture that cannot occur.)
  const { service, recorder } = fakeService({
    ...happyPath,
    objects: { [OWNER]: [] },
    objectsAfterRemoval: { [OWNER]: [] },
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "completed");
  assertEquals(recorder.removedPaths, []);
  assertEquals(recorder.deletedUsers, [OWNER]);
});

Deno.test("re-running after storage is already empty is harmless", async () => {
  const { service, recorder } = fakeService({
    ...happyPath,
    objects: { [OWNER]: [] },
    objectsAfterRemoval: { [OWNER]: [] },
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "completed");
  assertEquals(recorder.removedPaths, [], "no remove call is issued for an empty prefix");
  assertEquals(recorder.recorded[0].p_storage_objects_removed, 0);
});

Deno.test("the session hash reaches the log only in its declared shape", async () => {
  const { service, recorder } = fakeService(happyPath);
  const hash = "a".repeat(64);

  await executeDeletion(service, OWNER, REQUESTED_AT, hash);

  assertEquals(recorder.recorded[0].p_requester_session_hash, hash);
});

Deno.test("listOwnedObjects returns only paths under the owner's prefix", async () => {
  const { service } = fakeService({
    objects: {
      [OWNER]: [{ name: "mine.pdf", size: 10 }],
      [OTHER]: [{ name: "mine.pdf", size: 10 }],
    },
  });

  const listed = await listOwnedObjects(service, OWNER);

  assert(!("error" in listed));
  assertEquals(listed.paths, [`${OWNER}/mine.pdf`]);
});

Deno.test("colliding names across owners are distinguished by prefix alone (T-09)", async () => {
  // The two accounts hold files with identical names. Deletion must take one
  // and leave the other, and the only thing that separates them is the prefix
  // -- never the name, which is the misclassification the repository already
  // learned from.
  const { service, recorder } = fakeService({
    ...happyPath,
    objects: {
      [OWNER]: [{ name: "invoice.pdf", size: 10 }],
      [OTHER]: [{ name: "invoice.pdf", size: 10 }],
    },
    objectsAfterRemoval: { [OWNER]: [], [OTHER]: [{ name: "invoice.pdf", size: 10 }] },
  });

  const result = await executeDeletion(service, OWNER, REQUESTED_AT, null);

  assertEquals(result.outcome, "completed");
  assertEquals(recorder.removedPaths, [[`${OWNER}/invoice.pdf`]]);
  const removedEverything = recorder.removedPaths.flat();
  assert(
    !removedEverything.some((path) => path.startsWith(OTHER)),
    "no path belonging to another owner may appear in any remove call",
  );
});

Deno.test("findCrossOwnerReference is silent on an empty list and finds a real collision", async () => {
  const { service } = fakeService({ crossOwnerPaths: [`${OWNER}/shared.pdf`] });

  const empty = await findCrossOwnerReference(service, OWNER, []);
  assert(!("error" in empty) && empty.found === false);

  const collision = await findCrossOwnerReference(service, OWNER, [`${OWNER}/shared.pdf`]);
  assert(!("error" in collision) && collision.found === true);
});
