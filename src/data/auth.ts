/**
 * Demo sign-in accounts.
 *
 * One account per person in the directory, each mapped to the role they sign in
 * as. The password is a single shared demo value so the sign-in screen can list
 * the accounts and let you click straight in.
 *
 * SECURITY NOTE: this is a demonstration sign-in, not authentication. The
 * credentials are fictional, they are compared in the browser, and the whole
 * check can be bypassed by anyone who opens the developer tools. The production
 * system must authenticate server-side, store password hashes, and issue a real
 * session — see `docs/API_CONTRACT.md`.
 */

import type { DemoRole } from "@/domain/enums";
import type { Id } from "@/domain/types";
import { USER_IDS } from "./people";

/** Shared across every demo account, and shown on the sign-in screen. */
export const DEMO_PASSWORD = "radwa2026";

export interface DemoAccount {
  username: string;
  userId: Id;
  role: DemoRole;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // Management Team
  { username: "babukuttan", userId: USER_IDS.md, role: "MD" },
  { username: "md1", userId: USER_IDS.md1, role: "MD" },
  { username: "md2", userId: USER_IDS.md2, role: "MD" },

  // CRM
  { username: "layla", userId: USER_IDS.crm, role: "CRM_MANAGER" },

  // Estimators
  { username: "estimator1", userId: USER_IDS.estimator1, role: "ESTIMATOR" },
  { username: "estimator2", userId: USER_IDS.estimator2, role: "ESTIMATOR" },

  // MCP / Project Managers
  { username: "akshai", userId: USER_IDS.mcpAkshai, role: "MCP" },
  { username: "sandeep", userId: USER_IDS.mcpSandeep, role: "MCP" },
  { username: "pk", userId: USER_IDS.mcpPk, role: "MCP" },

  // Surveyors
  { username: "majid", userId: USER_IDS.surveyorMajid, role: "SURVEYOR" },
  { username: "imran", userId: USER_IDS.surveyorImran, role: "SURVEYOR" },

  // Departmental reviewers
  { username: "ahmed", userId: USER_IDS.revTechnical, role: "DEPARTMENT_REVIEWER" },
  { username: "fatima", userId: USER_IDS.revCommercial, role: "DEPARTMENT_REVIEWER" },
  { username: "vikram", userId: USER_IDS.revPlanning, role: "DEPARTMENT_REVIEWER" },
  { username: "salim", userId: USER_IDS.revProcurement, role: "DEPARTMENT_REVIEWER" },
  { username: "grace", userId: USER_IDS.revHse, role: "DEPARTMENT_REVIEWER" },
  { username: "peter", userId: USER_IDS.revQuality, role: "DEPARTMENT_REVIEWER" },
  { username: "mariam", userId: USER_IDS.revHrAdmin, role: "DEPARTMENT_REVIEWER" },
];

export function findAccount(username: string): DemoAccount | undefined {
  const needle = username.trim().toLowerCase();
  return DEMO_ACCOUNTS.find((account) => account.username === needle);
}

/**
 * Check a username and password.
 *
 * Returns a single generic message on failure rather than saying which field
 * was wrong — the habit a real sign-in screen needs, so it is the habit this
 * one demonstrates.
 */
export function verifyCredentials(
  username: string,
  password: string,
): { ok: true; account: DemoAccount } | { ok: false; message: string } {
  const account = findAccount(username);
  if (!account || password !== DEMO_PASSWORD) {
    return { ok: false, message: "That username and password do not match an account." };
  }
  return { ok: true, account };
}
