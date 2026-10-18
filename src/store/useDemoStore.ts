"use client";

/**
 * Radwa Gulf and Co — workflow state store.
 *
 * Holds the entire database plus the current identity (role + acting user).
 *
 * WHERE THE DATA LIVES
 *   Supabase holds the shared copy — one JSON document, see
 *   `supabase/migrations/0002_workspace_sync.sql`. `localStorage` is still
 *   written, but only as a cache so a refresh paints instantly and an offline
 *   demo keeps working; on every load the server copy wins. That is what makes
 *   a change on one device show up on another.
 *
 * `dispatch` is the single write path: it clones the database, runs one
 * operation from `src/services/operations.ts` against the clone, and commits
 * only if the operation succeeded. A failed operation therefore cannot leave
 * partial state behind. Successful operations are also queued for upload, and
 * remembered until the server confirms them, so a write is never lost to a
 * race with another device — see the sync engine at the bottom of this file.
 *
 * SECURITY NOTE: the role attached to a session is a demonstration affordance,
 * not authorization. The production backend must enforce permissions
 * server-side for every operation.
 */

import * as React from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { DEMO_ROLES, ROLE_LABELS, type DemoRole } from "@/domain/enums";
import { validateManagementTeam } from "@/domain/rules";
import type { ActionResult, DemoDatabase, Id, User } from "@/domain/types";
import { createSeedDatabase, SCHEMA_VERSION } from "@/data/seed";
import { verifyCredentials } from "@/data/auth";
import {
  isSupabaseConfigured,
  restoreSupabaseSession,
  signInWithSupabase,
  signOutOfSupabase,
} from "@/lib/supabase/auth";
import {
  pullWorkspace,
  pushWorkspace,
  subscribeToWorkspace,
} from "@/lib/supabase/workspace";
import { DEMO_CLIENTS, DEMO_CONTACTS, DEMO_USERS, USER_IDS } from "@/data/people";
import { recomputeAllStages, type OpContext } from "@/services/operations";
import { scopeDatabaseForViewer } from "./visibility";

/** Default acting user for each role. */
export const DEFAULT_USER_FOR_ROLE: Record<DemoRole, Id> = {
  CRM_MANAGER: USER_IDS.crm,
  MD: USER_IDS.md,
  ESTIMATOR: USER_IDS.estimator1,
  MCP: USER_IDS.mcpAkshai,
  SURVEYOR: USER_IDS.surveyorMajid,
  DEPARTMENT_REVIEWER: USER_IDS.revTechnical,
  HR: USER_IDS.hrManager,
};

/**
 * What the sync indicator shows.
 *
 *  - `off`      — not syncing: Supabase unconfigured, or signed in with a
 *                 built-in account, which is not a Supabase session.
 *  - `synced`   — the server has everything this device has done.
 *  - `syncing`  — an upload is in flight.
 *  - `offline`  — the last attempt failed; pending changes are kept and retried.
 *  - `blocked`  — something needs fixing (migration not run, policy refused).
 */
export type SyncStatus = "off" | "synced" | "syncing" | "offline" | "blocked";

export interface DemoState {
  db: DemoDatabase;
  activeRole: DemoRole;
  /** Which person inside the active role is acting; set by signing in. */
  actingUserId: Id;
  /** False until someone signs in; the app routes to /login while false. */
  signedIn: boolean;
  /**
   * How the current session was established.
   *  - `supabase`: authenticated against the Supabase project. Only these
   *    sessions can sync, because row-level security refuses anyone else.
   *  - `local`: the built-in accounts, used when Supabase is not configured or
   *    could not be reached.
   */
  authSource: "supabase" | "local" | null;

  /** Revision of the shared document this device last agreed with. */
  revision: number;
  syncStatus: SyncStatus;
  /** Explanation for `offline` / `blocked`, shown in the UI. */
  syncMessage: string | null;
  /** Count of local changes the server has not confirmed yet. */
  pendingChanges: number;
  /**
   * Set when this device has work that predates syncing and the shared copy
   * has work too, so neither can be adopted without destroying the other.
   * The UI asks which to keep; nothing is overwritten until it is answered.
   */
  syncChoice: { local: WorkspaceSummary; server: WorkspaceSummary } | null;

  /** Verify credentials against Supabase, falling back to the local accounts. */
  signIn: (username: string, password: string) => Promise<ActionResult>;
  /** Re-establish a Supabase session on page load. */
  restoreSession: () => Promise<boolean>;
  signOut: () => Promise<void>;

  /** Start sharing: pull the server copy, then listen for other devices. */
  startSync: () => Promise<void>;
  /** Push anything still pending, now. Used by the "Retry" affordance. */
  retrySync: () => Promise<void>;
  /** Answer the "which copy?" prompt. */
  resolveSyncChoice: (keep: "local" | "server") => Promise<void>;

  setRole: (role: DemoRole) => void;
  setActingUser: (userId: Id) => void;
  resetDemo: () => void;

  /**
   * Run one workflow operation. Returns the operation's own result so the
   * calling screen can show a message or field errors.
   */
  dispatch: <I, R extends ActionResult>(
    op: (db: DemoDatabase, ctx: OpContext, input: I) => R,
    input: I,
  ) => R;
}

function freshSeed(): DemoDatabase {
  const db = createSeedDatabase();
  // The seed declares each enquiry's stage; recomputing from the records proves
  // the dataset is internally consistent and keeps one derivation path.
  recomputeAllStages(db);

  if (process.env.NODE_ENV !== "production") {
    const problems = validateManagementTeam(db.users);
    if (problems.length > 0) {
      console.warn("[Radwa Gulf and Co] Management Team seed problems:", problems);
    }
  }
  return db;
}

/** Stand-in used during server rendering, where there is no localStorage. */
const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function cloneDb(db: DemoDatabase): DemoDatabase {
  if (typeof structuredClone === "function") return structuredClone(db);
  return JSON.parse(JSON.stringify(db)) as DemoDatabase;
}

/** Collections without which a stored document is not worth rendering. */
const REQUIRED_COLLECTIONS: Array<keyof DemoDatabase> = [
  "enquiries",
  "users",
  "bidPackageDocuments",
  "sequences",
];

/**
 * Collections that hold *work*, as opposed to the people and clients every
 * seed starts with.
 *
 * Used to tell an empty workspace from one somebody has put hours into, which
 * is the difference between safely overwriting it and destroying their day.
 */
const WORK_COLLECTIONS: Array<keyof DemoDatabase> = [
  "enquiries",
  "pursuitDecisions",
  "assignments",
  "tenderDocuments",
  "surveys",
  "estimates",
  "boqLineItems",
  "estimateApprovals",
  "bidPackages",
  "bidPackageDocuments",
  "managementApprovals",
  "clientSubmissions",
  "followUpTasks",
  "clientResponses",
  "revisionRequests",
  "awards",
  "workOrders",
  "kickoffMeetings",
  "actionItems",
  "pcpAppointments",
  "purchaseOrders",
  "handovers",
  "activities",
];

function countWork(db: DemoDatabase): number {
  return WORK_COLLECTIONS.reduce(
    (total, key) => total + ((db[key] as unknown[] | undefined)?.length ?? 0),
    0,
  );
}

/** How much work a document holds, for the "which copy?" prompt. */
export interface WorkspaceSummary {
  records: number;
  enquiries: number;
}

function summarise(db: DemoDatabase): WorkspaceSummary {
  return { records: countWork(db), enquiries: db.enquiries?.length ?? 0 };
}

/**
 * Is this value a database this build can render?
 *
 * Applied to anything arriving from outside the running app — persisted state
 * written by an older build, or the shared document from Supabase. A document
 * missing a collection is rejected rather than rendered half-empty.
 */
function isUsableDb(value: unknown): value is DemoDatabase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoDatabase>;
  return REQUIRED_COLLECTIONS.every((key) => candidate[key] !== undefined);
}

/**
 * Fill in collections added after a document was written.
 *
 * Both the localStorage cache and the shared Supabase document can predate a
 * new module — the HR module's `employees` is the first such case. Without
 * this, the first screen to read `db.employees` would throw on a document
 * that is otherwise perfectly current, and bumping SCHEMA_VERSION to force a
 * reseed would throw away everyone's real work to add an empty array.
 *
 * Mutates in place: the caller owns the object, which is either freshly
 * deserialised or already a clone.
 */
function backfillCollections(db: DemoDatabase): DemoDatabase {
  db.employees ??= [];
  db.sequences ??= {};
  db.sequences.employee ??= 1000;

  // The people and client directories are *reference data owned by the build*,
  // not records anyone created in the app. A document written before a person
  // was added to `src/data/people.ts` is missing them, and the shared document
  // outlives any single deploy — so every load reconciles the directory with
  // the seed.
  //
  // This is not hypothetical tidiness. Adding the HR Manager to the seed left
  // her absent from the shared document, so signing in as her resolved to no
  // user at all and the topbar showed the first person in the list instead.
  //
  // Missing entries are added; existing ones are left alone and nothing is
  // ever removed, because older records still point at people and clients by
  // id and orphaning those would be worse than carrying a stale row.
  addMissingById(db.users, DEMO_USERS);
  addMissingById(db.clients, DEMO_CLIENTS);
  addMissingById(db.contacts, DEMO_CONTACTS);

  return db;
}

/** Append any seed entries the collection does not already have, by id. */
function addMissingById<T extends { id: Id }>(existing: T[] | undefined, seed: readonly T[]): void {
  if (!existing) return;
  const present = new Set(existing.map((row) => row.id));
  for (const row of seed) {
    if (!present.has(row.id)) existing.push({ ...row });
  }
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      db: freshSeed(),
      activeRole: "CRM_MANAGER",
      actingUserId: DEFAULT_USER_FOR_ROLE.CRM_MANAGER,
      signedIn: false,
      authSource: null,
      revision: 0,
      syncStatus: "off",
      syncMessage: null,
      pendingChanges: 0,
      syncChoice: null,

      signIn: async (username, password) => {
        // Why Supabase refused, kept so the fallback can say something true.
        // Reporting a broken auth service as "signed in locally" is how a
        // server fault gets mistaken for a wrong password.
        let supabaseFailure: string | null = null;

        if (isSupabaseConfigured) {
          const outcome = await signInWithSupabase(username, password);

          if (outcome.ok) {
            set({
              signedIn: true,
              authSource: "supabase",
              activeRole: outcome.profile.role,
              actingUserId: outcome.profile.directoryUserId,
            });
            return { ok: true, message: `Signed in as ${outcome.profile.fullName}.` };
          }

          // Supabase could not authenticate. Fall through to the built-in
          // accounts, which still require the correct demo password — a wrong
          // password is not waved through, it simply fails in both stores.
          //
          // TRADE-OFF: this means an account whose password was changed in
          // Supabase can still be opened with its original demo password. It
          // exists so the app stays usable before the migrations in
          // `supabase/migrations` have been run, when no Supabase accounts
          // exist at all. Delete this fallback once the real accounts are the
          // only ones that should work.
          supabaseFailure = outcome.unavailable ? outcome.message : null;
        }

        const local = verifyCredentials(username, password);
        if (!local.ok) return { ok: false, message: local.message };

        set({
          signedIn: true,
          authSource: "local",
          activeRole: local.account.role,
          actingUserId: local.account.userId,
        });
        if (supabaseFailure) {
          // Supabase is configured and broken, not merely unfamiliar with this
          // account. Say what is wrong, and say that nothing will sync until
          // it is fixed — the sign-in itself succeeded, so nothing else will.
          set({ syncStatus: "blocked", syncMessage: supabaseFailure });
          return { ok: true, message: `Signed in locally — this device will not sync. ${supabaseFailure}` };
        }

        return {
          ok: true,
          message: isSupabaseConfigured
            ? "Supabase did not recognise that account — signed in locally, so this device will not sync."
            : "Signed in.",
        };
      },

      restoreSession: async () => {
        if (!isSupabaseConfigured) return false;
        const profile = await restoreSupabaseSession();
        if (!profile) return false;
        set({
          signedIn: true,
          authSource: "supabase",
          activeRole: profile.role,
          actingUserId: profile.directoryUserId,
        });
        return true;
      },

      signOut: async () => {
        // Anything not yet uploaded would be stranded on this device, so give
        // it a last chance to land before the session goes away.
        await flushNow();
        stopSync();
        // Clear the Supabase session too, or a refresh would silently sign the
        // same person straight back in.
        if (get().authSource === "supabase") await signOutOfSupabase();
        set({ signedIn: false, authSource: null, syncStatus: "off", syncMessage: null });
      },

      startSync: startSync,
      // "Try again" must actually re-evaluate. Calling flush alone did nothing
      // when sync had never started — the common case, since the usual reason
      // to press it is that starting failed.
      retrySync: retrySync,
      resolveSyncChoice: resolveSyncChoice,

      setRole: (role) =>
        set({
          activeRole: role,
          actingUserId: DEFAULT_USER_FOR_ROLE[role],
        }),

      setActingUser: (userId) => set({ actingUserId: userId }),

      // Clearing the records does not end the session — you stay signed in as
      // whoever you were, which is what you want mid-demo. The empty database
      // is uploaded like any other change, so it clears on every device.
      resetDemo: () => {
        pending.length = 0;
        // Replaces the database outright, so there is no operation to replay —
        // the flag is what tells `flush` there is still something to upload.
        wholesaleChange = true;
        set({ db: freshSeed(), pendingChanges: 0 });
        void flushNow();
      },

      dispatch: (op, input) => {
        const { db, activeRole, actingUserId } = get();
        const draft = cloneDb(db);
        const ctx: OpContext = { actorId: actingUserId, actorRole: activeRole };
        const result = op(draft, ctx, input);
        if (!result.ok) return result;

        set({ db: draft });

        // Remembered, not just sent: if another device wrote first, this exact
        // operation is replayed against their version rather than overwriting
        // it. See `flush` below.
        //
        // Only worth remembering when there is somewhere to send it. Without a
        // Supabase session nothing will ever drain this queue, so recording
        // into it would grow without bound and show a pending count that can
        // never reach zero.
        if (canSync()) {
          pending.push({ op: op as PendingOp["op"], input, ctx });
          set({ pendingChanges: pending.length });
          scheduleFlush();
        }

        return result;
      },
    }),
    {
      name: "radwa-erp-demo",
      version: SCHEMA_VERSION,
      // Guarded so importing the store during a server render is harmless.
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.localStorage,
      ),
      partialize: (state) => ({
        db: state.db,
        activeRole: state.activeRole,
        actingUserId: state.actingUserId,
        signedIn: state.signedIn,
        authSource: state.authSource,
        // Stored so a refresh resumes the conversation with the server at the
        // right revision instead of pushing a stale one and bouncing.
        revision: state.revision,
      }),
      // A persisted state from an older seed shape is discarded, not migrated:
      // a stale shape would produce misleading screens.
      migrate: () => ({
        db: freshSeed(),
        activeRole: "CRM_MANAGER" as DemoRole,
        actingUserId: DEFAULT_USER_FOR_ROLE.CRM_MANAGER,
        signedIn: false,
        authSource: null,
        revision: 0,
      }),
      /**
       * Merge runs at hydration, before any component reads the store. A
       * persisted blob missing a collection (written by an older build) is
       * discarded in favour of a fresh seed rather than rendered half-empty.
       */
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<DemoState>;
        return {
          ...current,
          ...incoming,
          db: isUsableDb(incoming.db) ? backfillCollections(incoming.db) : freshSeed(),
        };
      },
    },
  ),
);

/* ========================================================== sync engine === */

/**
 * The engine below turns "one device's localStorage" into "one shared
 * document". Three jobs:
 *
 *   1. On start, adopt the server's copy — or upload ours if the server has
 *      never been initialised.
 *   2. After every successful operation, upload. Uploads are serialized and
 *      debounced, so a burst of edits becomes one request.
 *   3. When another device writes, pull their version and replay anything of
 *      ours that has not landed yet.
 *
 * The replay in (3) is what makes this safe rather than last-write-wins.
 * Operations are pure functions of `(db, ctx, input)`, so an operation that
 * lost the race can simply be re-run against the winner's document. Two people
 * working on different enquiries both keep their work; an operation that is
 * genuinely invalid against the newer state (approving something already
 * rejected elsewhere) fails on replay and is reported rather than forced
 * through.
 */

interface PendingOp {
  op: (db: DemoDatabase, ctx: OpContext, input: unknown) => ActionResult;
  input: unknown;
  ctx: OpContext;
}

/** Operations applied locally but not yet confirmed by the server. */
const pending: PendingOp[] = [];

/**
 * Set when the local database was replaced wholesale rather than changed by an
 * operation — "Clear all enquiries" is the only case today.
 *
 * Such a change has no pending operation to carry it, so without this flag
 * `flush` would see an empty queue and upload nothing: the reset would apply
 * on this device and silently leave every other device untouched.
 */
let wholesaleChange = false;

/** Serializes uploads: two pushes must never be in flight at once. */
let chain: Promise<void> = Promise.resolve();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let started = false;
/** Server copy held unapplied while the "which copy?" prompt is unanswered. */
let heldServerSnapshot: { db: DemoDatabase; revision: number } | null = null;

/** Syncing needs a real Supabase session; a local sign-in cannot write. */
function canSync(): boolean {
  const { authSource } = useDemoStore.getState();
  return isSupabaseConfigured && authSource === "supabase";
}

function enqueue(task: () => Promise<void>): Promise<void> {
  chain = chain.then(task, task);
  return chain;
}

function scheduleFlush(): void {
  if (!canSync()) return;
  if (flushTimer) clearTimeout(flushTimer);
  // Coalesce a burst of edits — filling in a BOQ is many dispatches a second —
  // into a single upload.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void enqueue(flush);
  }, 400);
}

/** Upload now, skipping the debounce. */
async function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!canSync()) return;
  await enqueue(flush);
}

async function flush(): Promise<void> {
  if (!canSync()) return;
  if (pending.length === 0 && !wholesaleChange) return;

  const set = useDemoStore.setState;
  set({ syncStatus: "syncing" });

  // Bounded so a permanently losing race cannot spin forever.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { db, revision } = useDemoStore.getState();
    const outcome = await pushWorkspace(db, revision);

    if (outcome.status === "saved") {
      // Everything applied locally is now on the server.
      pending.length = 0;
      wholesaleChange = false;
      set({
        revision: outcome.revision,
        syncStatus: "synced",
        syncMessage: null,
        pendingChanges: 0,
      });
      return;
    }

    if (outcome.status === "unavailable") {
      // Changes stay in `pending` and go up on the next successful attempt.
      set({
        syncStatus: /migration|not set up|Supabase sign-in/i.test(outcome.message) ? "blocked" : "offline",
        syncMessage: outcome.message,
      });
      return;
    }

    if (wholesaleChange && pending.length === 0) {
      // A reset is an explicit instruction to discard what was there, so a
      // write that landed first does not survive it. Take the new revision and
      // push our document again rather than rebasing onto what we are clearing.
      set({ revision: outcome.revision });
      continue;
    }

    // Another device wrote first. Rebuild on top of their document.
    const replayed = rebaseOnto(outcome.db, outcome.revision);
    if (!replayed) return;
  }

  set({
    syncStatus: "offline",
    syncMessage: "Could not save after several attempts — still trying.",
  });
}

/**
 * Adopt the server's document and re-apply our unconfirmed operations to it.
 *
 * Returns false when nothing of ours survived and the caller should stop.
 */
function rebaseOnto(serverDb: DemoDatabase, serverRevision: number): boolean {
  const set = useDemoStore.setState;

  if (!isUsableDb(serverDb)) {
    set({
      syncStatus: "blocked",
      syncMessage: "The shared workspace holds data this version cannot read.",
    });
    return false;
  }

  // The shared document may have been written by a build without the HR
  // module, so it is brought up to the current shape before anything reads it.
  const draft = backfillCollections(cloneDb(serverDb));
  const survived: PendingOp[] = [];
  const lost: string[] = [];

  for (const item of pending) {
    const result = item.op(draft, item.ctx, item.input);
    if (result.ok) survived.push(item);
    else lost.push(result.message ?? "A change could not be re-applied.");
  }

  pending.length = 0;
  pending.push(...survived);

  set({
    db: draft,
    revision: serverRevision,
    pendingChanges: pending.length,
    ...(lost.length > 0
      ? {
          syncStatus: "blocked" as SyncStatus,
          // Only the first: a list of five variations on the same cause is
          // noise, and the screen behind the indicator shows the real state.
          syncMessage: `Someone else changed this first. ${lost[0]}`,
        }
      : {}),
  });

  return true;
}

/**
 * Begin sharing this workspace.
 *
 * Called once the app knows who is signed in. Idempotent: calling it again
 * while already running does nothing.
 */
async function startSync(): Promise<void> {
  const set = useDemoStore.setState;

  if (!canSync()) {
    // `signIn` may already have recorded *why* Supabase was unusable — a
    // server fault, say. That is a far more useful thing to show than the
    // generic "built-in account" line, so it is not overwritten.
    if (useDemoStore.getState().syncStatus === "blocked") return;
    set({
      syncStatus: "off",
      syncMessage: isSupabaseConfigured
        ? "Signed in with a built-in account — changes stay on this device."
        : "Supabase is not configured — changes stay on this device.",
    });
    return;
  }
  if (started) return;
  started = true;

  set({ syncStatus: "syncing" });

  const snapshot = await pullWorkspace();

  if (!snapshot) {
    set({
      syncStatus: "blocked",
      syncMessage: "Could not read the shared workspace — run supabase/migrations/0002_workspace_sync.sql.",
    });
    started = false;
    return;
  }

  if (snapshot.db === null) {
    // Nobody has initialised the shared copy yet. Seed it from this device,
    // which is how existing work gets up from whichever browser holds it.
    useDemoStore.setState({ revision: snapshot.revision });
    const outcome = await pushWorkspace(useDemoStore.getState().db, snapshot.revision);
    if (outcome.status === "saved") {
      set({ revision: outcome.revision, syncStatus: "synced", syncMessage: null });
    } else if (outcome.status === "stale") {
      rebaseOnto(outcome.db, outcome.revision);
      set({ syncStatus: "synced", syncMessage: null });
    } else {
      set({ syncStatus: "blocked", syncMessage: outcome.message });
      started = false;
      return;
    }
  } else {
    const state = useDemoStore.getState();
    const local = summarise(state.db);
    const server = summarise(snapshot.db);

    // A device that has never synced holds work nobody recorded as a pending
    // operation — it was done before syncing existed. Adopting the server copy
    // would delete it with no way back, so the two cases where that could
    // happen are handled before the normal "server wins" rule.
    const firstContact = state.revision === 0 && pending.length === 0;

    if (firstContact && local.records > 0 && server.records === 0) {
      // The shared copy is an empty shell — someone opened the app on a fresh
      // browser and initialised it. This device's work is the only work there
      // is, so it goes up rather than being wiped.
      const outcome = await pushWorkspace(state.db, snapshot.revision);
      if (outcome.status === "saved") {
        set({
          revision: outcome.revision,
          syncStatus: "synced",
          syncMessage: `Uploaded this device's ${local.records} records to the empty shared workspace.`,
        });
      } else if (outcome.status === "stale") {
        rebaseOnto(outcome.db, outcome.revision);
      } else {
        set({ syncStatus: "blocked", syncMessage: outcome.message });
        started = false;
        return;
      }
    } else if (firstContact && local.records > 0 && server.records > 0) {
      // Both hold real work and neither is derived from the other. There is no
      // correct automatic answer, and guessing wrong is unrecoverable, so the
      // person decides. Nothing is written until they do.
      heldServerSnapshot = { db: snapshot.db, revision: snapshot.revision };
      set({
        syncStatus: "blocked",
        syncMessage: "This device and the shared workspace both hold work. Choose which to keep.",
        syncChoice: { local, server },
      });
      started = false;
      return;
    } else {
      // The ordinary case: the server copy wins over whatever this browser
      // cached. Anything this device did while offline is still in `pending`
      // and is replayed on top.
      rebaseOnto(snapshot.db, snapshot.revision);
      if (pending.length > 0) await flush();
      else set({ syncStatus: "synced", syncMessage: null });
    }
  }

  unsubscribe?.();
  unsubscribe = subscribeToWorkspace(() => {
    void enqueue(async () => {
      const incoming = await pullWorkspace();
      if (!incoming?.db) return;
      if (incoming.revision <= useDemoStore.getState().revision) return;
      rebaseOnto(incoming.db, incoming.revision);
      if (pending.length > 0) await flush();
    });
  });
}

function stopSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  started = false;
  heldServerSnapshot = null;
}

/** Re-attempt whatever failed, whether that was starting or uploading. */
async function retrySync(): Promise<void> {
  if (!started) {
    await startSync();
    return;
  }
  await flushNow();
}

/**
 * Answer the "this device and the server both hold work" prompt.
 *
 * `local` uploads this device's copy over the shared one; `server` adopts the
 * shared copy and discards this device's. Both are destructive in one
 * direction, which is exactly why neither happens without being asked.
 */
async function resolveSyncChoice(keep: "local" | "server"): Promise<void> {
  const held = heldServerSnapshot;
  if (!held) return;
  heldServerSnapshot = null;

  const set = useDemoStore.setState;
  set({ syncChoice: null, syncStatus: "syncing", syncMessage: null });

  if (keep === "server") {
    rebaseOnto(held.db, held.revision);
    set({ syncStatus: "synced", syncMessage: "Using the shared copy." });
  } else {
    set({ revision: held.revision });
    const outcome = await pushWorkspace(useDemoStore.getState().db, held.revision);
    if (outcome.status === "saved") {
      set({
        revision: outcome.revision,
        syncStatus: "synced",
        syncMessage: "This device's copy is now the shared one.",
      });
    } else if (outcome.status === "stale") {
      rebaseOnto(outcome.db, outcome.revision);
    } else {
      set({ syncStatus: "blocked", syncMessage: outcome.message });
      return;
    }
  }

  started = true;
  unsubscribe?.();
  unsubscribe = subscribeToWorkspace(() => {
    void enqueue(async () => {
      const incoming = await pullWorkspace();
      if (!incoming?.db) return;
      if (incoming.revision <= useDemoStore.getState().revision) return;
      rebaseOnto(incoming.db, incoming.revision);
      if (pending.length > 0) await flush();
    });
  });
}

/* ------------------------------------------------------------- helpers --- */

/**
 * True once persisted state has been read on the client.
 *
 * Derived from the persist middleware rather than kept in state, so nothing
 * touches the store before it finishes constructing. It is deliberately false
 * during the server render: the layout renders the same placeholder on both
 * sides, which is what keeps hydration consistent.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(subscribeToHydration, getHydrationSnapshot, getServerHydrationSnapshot);
}

function subscribeToHydration(onStoreChange: () => void): () => void {
  return useDemoStore.persist.onFinishHydration(onStoreChange);
}

function getHydrationSnapshot(): boolean {
  return useDemoStore.persist.hasHydrated();
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

/**
 * The database as the current viewer sees it.
 *
 * For an Estimator or an MCP this is narrowed to the enquiries assigned to
 * them — see `src/store/visibility.ts`. Writes are unaffected: `dispatch`
 * always operates on the full database.
 */
export function useDb(): DemoDatabase {
  const db = useDemoStore((s) => s.db);
  const role = useDemoStore((s) => s.activeRole);
  const actingUserId = useDemoStore((s) => s.actingUserId);
  return scopeDatabaseForViewer(db, role, actingUserId);
}

/**
 * The complete database, ignoring per-role scoping.
 *
 * Only for the few places that must distinguish "does not exist" from "exists
 * but is not yours" — the enquiry detail page uses it to explain an enquiry
 * that is assigned to someone else rather than claiming it was not found.
 */
export function useUnscopedDb(): DemoDatabase {
  return useDemoStore((s) => s.db);
}

export function useActiveRole(): DemoRole {
  return useDemoStore((s) => s.activeRole);
}

/**
 * The person currently acting.
 *
 * When the id resolves to nobody, this returns a clearly-unknown placeholder
 * rather than the first person in the directory. Falling back to `users[0]`
 * meant a missing record silently displayed someone else's name and initials
 * in the topbar — the signed-in HR Manager appeared as the MD, which is a
 * worse failure than an obviously empty one, because nothing looks wrong.
 *
 * With the directory reconciled on load (see `backfillCollections`) this
 * should not happen; it is here so that if it does, it is visible.
 */
export function useActingUser(): User {
  const db = useDemoStore((s) => s.db);
  const actingUserId = useDemoStore((s) => s.actingUserId);
  const role = useDemoStore((s) => s.activeRole);
  const found = db.users.find((u) => u.id === actingUserId);
  if (found) return found;

  return {
    id: actingUserId,
    name: "Unknown user",
    initials: "??",
    jobTitle: ROLE_LABELS[role],
    email: "",
    roles: [role],
  };
}

/** Everyone who can act as the given role, for the in-role person picker. */
export function usersForRole(db: DemoDatabase, role: DemoRole): User[] {
  if (role === "MD") {
    // All three Management Team members act through the MD role in the demo so
    // every individual pursuit and bid decision can be recorded.
    return db.users.filter((u) => u.isManagementTeam);
  }
  return db.users.filter((u) => u.roles.includes(role));
}

export const ALL_ROLES = DEMO_ROLES;
