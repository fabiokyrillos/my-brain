# BYOK G-0.2 — crypto interop proof

**Pre-code gate G-0.2** of [`BYOK_IMPLEMENTATION_PLAN.md`](../BYOK_IMPLEMENTATION_PLAN.md):
*"An executed demonstration that a payload encrypted in Node 22 decrypts in Deno and vice
versa, with identical AAD composition."*

**Executed 2026-08-01.** Node `v22.18.0`, Deno `2.9.4`. Both runtimes present on the
machine, so this is a real cross-runtime execution rather than a simulation.

---

## 1. The run

```
$ npm run byok:interop

BYOK G-0.2 — crypto interop proof

  ok    Node -> Deno round trip
  ok    Deno refuses a Node ciphertext under another user's AAD
  ok    Deno -> Node round trip
  ok    two encryptions of one plaintext differ in IV and ciphertext
  ok    Node refuses a Deno ciphertext under another user's AAD
  ok    a flipped byte fails, with the same word
  ok    the failure carries one word and no byte echo

G-0.2 PASSED — Node and Deno agree on the envelope format, both directions.
```

The script generates a 32-byte master key in memory for the run and hands it to the Deno
child through an environment variable scoped to that process. **No key material is written
to disk, committed, or printed.** The plaintext is a shaped literal — `sk-interop-proof-
not-a-real-credential` — and has never been a credential.

---

## 2. The format the two runtimes agree on

| Field | Size | Notes |
| --- | --- | --- |
| `iv` | 12 bytes | 96-bit, the nominal GCM size, random per encryption |
| `ciphertext` | n bytes | stored base64 |
| tag | 16 bytes | 128-bit, appended by WebCrypto, never truncated |
| AAD | — | `user_id ‖ 0x1f ‖ key_version ‖ 0x1f ‖ provider` |

**Both halves call WebCrypto**, not `node:crypto`'s classic API. Deno has only WebCrypto,
and `node:crypto` exposes the same one — so using `createCipheriv` on the Node side would
have produced two implementations with two tag conventions (`node:crypto` splits the tag
off; WebCrypto appends it), two failure vocabularies, and two chances to disagree about
AAD. One API, one format.

**The separator is `0x1f`**, ASCII unit separator. It cannot occur in a uuid, in an
integer rendered as text, or in a provider slug — so `("ab","c")` and `("a","bc")` cannot
compose to the same AAD. A printable separator would be harmless right up until one of
those fields accepted a wider alphabet.

---

## 3. What the proof establishes beyond "it round-trips"

**AAD binding is real.** A ciphertext sealed for one `user_id` fails to decrypt under
another's AAD — proven in *both* directions, so neither runtime is silently ignoring the
additional data. This is the property `BYOK-CRYPTO`'s cross-user test will depend on, and
it is established here before anything depends on it.

**IVs are fresh.** Two encryptions of the same plaintext under the same master key produce
different IVs and different ciphertexts. A derived or counter IV would be catastrophic
under GCM, and the assertion is executed rather than assumed.

**Failure says one word.** A tampered byte, a wrong key and a wrong user all produce
`credential_unreadable` and nothing else. The `catch` in both implementations is total on
purpose: the difference between those three is information an attacker would like and an
owner cannot act on.

---

## 4. Why the code is duplicated, and what keeps it honest

`src/lib/byok/crypto.ts` imports `server-only`, which throws under Deno. That is the same
constraint that already forces `process-jobs/entry.ts` to carry its own copy of the
extraction prompt and response schema, and the repository's established answer is not
*share the file* but **prove the two agree** — the shape `extraction-parity.test.ts` uses.

So there are two instruments, catching different things:

| Instrument | Catches | Runs |
| --- | --- | --- |
| `scripts/byok-crypto-interop.mjs` | a genuine format divergence, behaviourally | `npm run byok:interop`, and CI |
| `src/lib/byok/parity.test.ts` | the *edit* that would cause one | every `vitest` invocation |

The parity test digests the AAD composition, compares the two `composeAad` bodies
character for character after whitespace normalisation, asserts both files carry the
single-word failure and a total catch, and asserts **neither crypto core reads the
environment** except in its one sanctioned `requireMasterKey`. A module that found its own
key could encrypt under one the caller did not intend.

---

## 5. What this gate does *not* establish

- **It says nothing about key provisioning.** That is G-0.3, and it is partly blocked —
  see `AUTONOMOUS_LOOP_HANDOFF.md` §4.
- **It says nothing about the resolvers**, which do not exist yet (BYOK.2).
- **It does not make the worker's decryption safe by itself.** The security definition is
  explicit that the unattended `pg_cron` drain requires the operator's worker to decrypt
  user keys, and that four specific claims are therefore forbidden in product copy. This
  gate proves the format works; it does not change what the architecture can promise.
