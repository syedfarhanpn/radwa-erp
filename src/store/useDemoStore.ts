"use client";

/**
 * Radwa Gulf and Co — demo state store.
 *
 * Holds the entire mock database plus the current demo identity (role + acting
 * user). Persisted to `localStorage` so a demo survives a page refresh, and
 * versioned so a change to the seed shape discards stale state instead of
 * half-migrating it.
 *
 * `dispatch` is the single write path: it clones the database, runs one
 * operation from `src/services/operations.ts` against the clone, and commits
 * only if the operation succeeded. A failed operation therefore cannot leave
 * partial state behind.
 *
 * SECURITY NOTE: the role switcher is a demonstration affordance, not
 * authentication or authorization. It performs no identity verification. The
 * production backend must enforce permissions server-side for every operation.
 */

import * as React from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { DEMO_ROLES, type DemoRole } from "@/domain/enums";
import { validateManagementTeam } from "@/domain/rules";
import type { ActionResult, DemoDatabase, Id, User } from "@/domain/types";
import { createSeedDatabase, SCHEMA_VERSION } from "@/data/seed";
import { findAccount, verifyCredentials } from "@/data/auth";
import {
  isSupabaseConfigured,
  restoreSupabaseSession,
  signInWithSupabase,
  signOutOfSupabase,
} from "@/lib/supabase/auth";
import { USER_IDS } from "@/data/people";
import { recomputeAllStages, type OpContext } from "@/services/operations";
import { scopeDatabaseForViewer } from "./visibility";

/** Default acting user for each demo role. */
export const DEFAULT_USER_FOR_ROLE: Record<DemoRole, Id> = {
  CRM_MANAGER: USER_IDS.crm,
  MD: USER_IDS.md,
  ESTIMATOR: USER_IDS.estimator1,
  MCP: USER_IDS.mcpAkshai,
  SURVEYOR: USER_IDS.surveyorMajid,
  DEPARTMENT_REVIEWER: USER_IDS.revTechnical,
};

export interface DemoState {
  db: DemoDatabase;
  activeRole: DemoRole;
  /** Which person inside the active role is acting; set by signing in. */
  actingUserId: Id;
  /** False until someone signs in; the app routes to /login while false. */
  signedIn: boolean;
  /**
   * How the current session was established.
   *  - `supabase`: authenticated against the Supabase project.
   *  - `local`: the built-in demo accounts, used when Supabase is not
   *    configured or could not be reached. Surfaced in the UI so nobody
   *    mistakes an offline demo for a live sign-in.
   */
  authSource: "supabase" | "local" | null;

  /** Verify credentials against Supabase, falling back to the demo accounts. */
  signIn: (username: string, password: string) => Promise<ActionResult>;
  /** Sign in directly as a known demo account (the one-click list on /login). */
  signInAs: (username: string) => ActionResult;
  /** Re-establish a Supabase session on page load. */
  restoreSession: () => Promise<boolean>;
  signOut: () => Promise<void>;

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

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      db: freshSeed(),
      activeRole: "CRM_MANAGER",
      actingUserId: DEFAULT_USER_FOR_ROLE.CRM_MANAGER,
      signedIn: false,
      authSource: null,

      signIn: async (username, password) => {
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

          // Bad credentials are final. Only an unreachable project falls back,
          // so a wrong password can never be waved through by the local list.
          if (!outcome.unavailable) {
            return { ok: false, message: outcome.message };
          }
        }

        const local = verifyCredentials(username, password);
        if (!local.ok) return { ok: false, message: local.message };

        set({
          signedIn: true,
          authSource: "local",
          activeRole: local.account.role,
          actingUserId: local.account.userId,
        });
        return {
          ok: true,
          message: isSupabaseConfigured
            ? "Supabase was unreachable — signed in with the local demo account."
            : "Signed in.",
        };
      },

      signInAs: (username) => {
        const account = findAccount(username);
        if (!account) return { ok: false, message: "Unknown demo account." };
        set({
          signedIn: true,
          authSource: "local",
          activeRole: account.role,
          actingUserId: account.userId,
        });
        return { ok: true, message: "Signed in." };
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
        // Clear the Supabase session too, or a refresh would silently sign the
        // same person straight back in.
        if (get().authSource === "supabase") await signOutOfSupabase();
        set({ signedIn: false, authSource: null });
      },

      setRole: (role) =>
        set({
          activeRole: role,
          actingUserId: DEFAULT_USER_FOR_ROLE[role],
        }),

      setActingUser: (userId) => set({ actingUserId: userId }),

      // Clearing the records does not end the session — you stay signed in as
      // whoever you were, which is what you want mid-demo.
      resetDemo: () => set({ db: freshSeed() }),

      dispatch: (op, input) => {
        const { db, activeRole, actingUserId } = get();
        const draft = cloneDb(db);
        const ctx: OpContext = { actorId: actingUserId, actorRole: activeRole };
        const result = op(draft, ctx, input);
        if (result.ok) set({ db: draft });
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
      }),
      // A persisted state from an older seed shape is discarded, not migrated:
      // this is demo data, and a stale shape would produce misleading screens.
      migrate: () => ({
        db: freshSeed(),
        activeRole: "CRM_MANAGER" as DemoRole,
        actingUserId: DEFAULT_USER_FOR_ROLE.CRM_MANAGER,
        signedIn: false,
        authSource: null,
      }),
      /**
       * Merge runs at hydration, before any component reads the store. A
       * persisted blob missing a collection (written by an older build) is
       * discarded in favour of a fresh seed rather than rendered half-empty.
       */
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<DemoState>;
        const required: Array<keyof DemoDatabase> = [
          "enquiries",
          "users",
          "bidPackageDocuments",
          "sequences",
        ];
        const usable =
          incoming.db && required.every((key) => incoming.db?.[key] !== undefined) ? incoming.db : undefined;

        return {
          ...current,
          ...incoming,
          db: usable ?? freshSeed(),
        };
      },
    },
  ),
);

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

export function useActingUser(): User {
  const db = useDemoStore((s) => s.db);
  const actingUserId = useDemoStore((s) => s.actingUserId);
  return db.users.find((u) => u.id === actingUserId) ?? db.users[0];
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
