# Radwa Gulf and Co — Tender & Work Order Management

_Frontend demonstration build._

Construction enquiry, tender management and work-order preparation system.

This repository contains **the frontend only**. There is no backend, database,
authentication, email delivery, document storage or AI service connected, and
none is required to run or demonstrate the application. All workflow state
lives in the browser.

---

## 1. Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. The app redirects to `/dashboard` and loads
the sample dataset automatically — there is no setup step and nothing to seed.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` | Production build — must pass before handover |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint, including the React Compiler rules |
| `npx tsc --noEmit` | Type-check without emitting |

Requires Node 20 or newer (developed on Node 25, npm 11).

---

## 2. What this demo is and is not

**It is** a working, interactive simulation of the pre-award tender workflow,
from enquiry registration through to handover to Operations. Buttons perform
real state changes, business rules are enforced, and every list, detail page and
dashboard figure is derived from the same data.

**Sign-in is connected to Supabase** (see section 6). Everything else is still
frontend-only.

**It is not** a production system. Specifically:

- Sign-in authenticates against Supabase, but the **demo accounts share one
  well-known password** and authorization is still not enforced anywhere.
  Row-level security protects `profiles`; nothing else is protected, because
  nothing else is in the database yet.
- **No email is ever sent.** Proposal submission records what was sent, to whom
  and when; it does not transmit anything.
- **No file is uploaded or stored.** File pickers read a file's *name and size*
  only, to populate document metadata.
- The **AI columns in the BOQ are simulated demo values** carried in the seed
  data. No AI model produced them, and the demo makes no claim about model
  accuracy.
- **Work-order numbering is illustrative** (`WO-2026-0007`). A production system
  must make the pattern administrator-configurable.

A persistent "DEMO MODE — Sample Data" strip is shown at the top of every page.

---
## 3. Starting state and reset

**The system starts with no enquiries.** Only the reference data needed to
register one is pre-loaded:

- the **people directory** — Management Team, CRM, MCPs, Estimators, Surveyors
  and the seven departmental reviewers;
- the **client and contact list**, so an enquiry can be registered in a few
  clicks rather than retyping a client every time.

Everything else — enquiries, BOQs, bid packages, surveys, work orders and the
activity trail — is created through the UI as you demonstrate. Enquiry
numbering starts at `ENQ-<year>-0001` and work orders at `WO-<year>-0001`.

State is persisted to `localStorage` under the key `radwa-erp-demo`, so a demo
survives a page refresh.

**Reset** from the role menu (top right) → *Clear all enquiries*, or from
**Demo Controls** in the sidebar. Reset discards every enquiry and workflow
record created in the browser and keeps the people and client lists.

If the entity shape changes, bump `SCHEMA_VERSION` in `src/data/seed.ts`;
persisted state from an older version is discarded rather than half-migrated.

---

## 4. Demo roles

Each person signs in at `/login` with their own username. The sign-in screen
lists every demo account — **click any person to sign straight in**, no typing.
To change user mid-demo, open the user menu (top right) and choose *Switch
user*.

The shared demo password is shown on the sign-in screen and defined in
`src/data/auth.ts`.

| Role | People | Primary screens |
| --- | --- | --- |
| CRM Manager | Layla Haddad | Register, Assignments, Bid package verification, Work Orders, Handover |
| MD | **Babukuttan** (main MD), MD1, MD2 | Pursuit, Estimate Approvals, Final Bid Approval, PCP |
| Estimator | Estimator 1, Estimator 2 | BOQ & Estimates, Bid Packages |
| MCP / Project Manager | Akshai, Sandeep, PK | Surveys, Submission & Follow-up, Kickoff |
| Surveyor | Majid Al Balushi, Imran Shaikh | Site Surveys |
| Department Reviewer | Technical, Commercial, Planning, Procurement, HSE, Quality, HR/Admin | Document Reviews |

Within a role you can also switch *which person* is acting — essential for
Department Reviewer (seven departments), for MCP and Estimator (whose views are
scoped, below), and for MD, where all three Management Team members act through
that role so every pursuit decision can be recorded.

### Who sees what

**Estimators and MCPs see only the enquiries assigned to them.** The register,
global search, every queue, the dashboards, the activity feed and the
notification bell are all narrowed; opening someone else’s enquiry by URL shows
“Not assigned to you” rather than the record. CRM, the Management Team,
Surveyors and Departmental Reviewers see the full register.

This is **presentation scoping in a demo with no authentication** — it keeps
screens relevant, it is not access control. The production backend must filter
and authorize server-side (`src/store/visibility.ts` has the detail).

### Where each MD is involved

| Stage | Who decides |
| --- | --- |
| Pursuit decision | All three — Babukuttan, MD1 and MD2 each record an individual decision |
| Estimate approval | Babukuttan (as MD) **and** the Management Team member responsible for the enquiry |
| **Final bid approval** | **Babukuttan alone**, whichever member the enquiry is assigned to |
| PCP appointment | Management Team |

---

## 5. Suggested demo path

Starting from an empty system:

1. **CRM Manager → Enquiry Register → Register enquiry.** Fill in the client, project title,
   location and scope; tick one or more disciplines under *Project type*. The
   enquiry gets the next reference and enters Pursuit Decision.
2. **MD → Pursuit Decisions.** Record a decision for each of Babukuttan, MD1 and
   MD2. Try rejecting with no reason — it is refused. Record two rejections and
   leave the third undecided: the enquiry stays live, because it is only void
   when all three reject.
3. **CRM Manager → Assignments.** Assign an MCP (Akshai, Sandeep or PK), an
   Estimator, and the responsible Management Team member. Pick **MD1** here —
   it shows that final bid approval still goes to Babukuttan.
4. **Estimator → Site Surveys.** Mark a survey required with a justification.
5. **MCP → Site Surveys.** Assign a surveyor and a visit date. The
   project-specific checklist is generated from the disciplines chosen in step 1.
6. **Print the checklist.** *Print checklist* on the survey panel opens a
   site-ready sheet with tick boxes and ruled lines. This is what the surveyor
   takes to site.
7. **Surveyor → Site Surveys.** Either record items one by one (mark one
   *Incomplete* to show that a reason is mandatory), or press
   **“Demo: complete all & submit”** to fill the whole checklist and submit in a
   single click. Attach the completed sheet and add remarks before submitting.
8. **MCP.** If anything was marked incomplete, rule on each exception — the
   report cannot be accepted while one is unresolved. Then accept it.
9. **Estimator → BOQ & Estimates.** Start the BOQ from the project template.
   Edit a quantity and watch the totals and variances recalculate as you type.
   Add a line: it has no AI suggestion, so variance shows “—” rather than a
   false 100%. Submit for approval.
10. **MD → Estimate Approvals.** Approve as Babukuttan, then switch the acting
    person to MD1 and approve again — both are required.
11. **Estimator → Bid Packages.** Create the package, submit each document, then
    switch to **Department Reviewer** and approve them. Try rejecting one with
    only a reason — corrective instructions are mandatory too.
12. **Selective re-approval.** Once everything is approved, create a *new
    version* of one document. Only that document loses its approval; the rest
    stay approved, and CRM's verification goes stale so final approval closes.
13. **CRM Manager.** Mark *Documents Approved*.
14. **MD → Final Bid Approval.** Only **Babukuttan** appears as approver, even
    though the enquiry is assigned to MD1. One approval releases the bid.
15. **MCP → Submission & Follow-up.** Record the submission, add follow-up
    tasks, then record the client response as *Awarded*.
16. **CRM Manager → Work Orders.** Generate the draft — note it needs no PO —
    then finalize it and use the print view.
17. **MCP → Kickoff & Handover.** Record kickoff minutes and action items.
18. **MD.** Appoint the PCP.
19. **CRM Manager → Kickoff & Handover.** Handover is blocked until the PO is
    recorded. Record it, confirm the client-contact item, and complete the
    handover.

---
## 6. Supabase

**Sign-in is connected to Supabase.** The workflow data is not — enquiries,
BOQs, bid packages and the rest still live in `localStorage`. Migrating those
28 collections to Postgres is the next piece of work, and the repository seam
in `src/services/repository.ts` is where it plugs in.

### One-time setup

1. **Run the migration.** Supabase Dashboard → SQL Editor → New query → paste
   `supabase/migrations/0001_auth_profiles.sql` → Run. It creates the
   `profiles` table, its row-level security policies, and the eighteen demo
   accounts. It is safe to re-run.
2. **Turn off email confirmation.** Dashboard → Authentication → Providers →
   Email → uncheck *Confirm email*. The seeded accounts cannot sign in while
   it is on.
3. **Check it worked.** In the SQL Editor:
   ```sql
   select username, full_name, role, department from public.profiles order by role, username;
   ```

Until step 1 is done, Supabase will reject every sign-in — the accounts do not
exist yet. Use the one-click demo accounts in the meantime; they sign in
locally and skip Supabase entirely.

### Environment

`.env.local` (gitignored; `.env.example` is the committed template):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Restart `npm run dev` after changing these — Next.js reads env files at boot.

Both values are browser-safe by design: the publishable key is meant to ship
to the client, and row-level security is what protects the data. **Never put
the database password or a service-role key in this app** — anything prefixed
`NEXT_PUBLIC_` is compiled into the JavaScript bundle and is readable by
anyone who opens it.

### How sign-in resolves a user

1. `auth.signInWithPassword` establishes the Supabase session.
2. The `profiles` row for that auth user gives the role and the
   `directory_user_id` — which person in `src/data/people.ts` they are.

The role lives in the database, not in token claims the client could edit, and
`profiles` is read-only from the browser except for a user's own row, with the
role and identity columns frozen.

### Fallback behaviour

| Situation | What happens |
| --- | --- |
| Supabase not configured | Local demo accounts, stated on the sign-in screen |
| Supabase unreachable / paused | Falls back to local accounts, and says so |
| Wrong password | **Refused.** Never falls back — a bad password cannot be waved through |
| Signed in, no `profiles` row | Refused, telling you to run the migration |

A stale session is re-checked against Supabase whenever the app loads, so a
revoked or expired session signs you out rather than being trusted from
`localStorage`.

---
## 7. Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, route map, component map, state model |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | The twenty rules and where each is enforced |
| [docs/API_CONTRACT.md](docs/API_CONTRACT.md) | **Proposed** Laravel endpoint contract for the backend developer |
| [docs/TESTING.md](docs/TESTING.md) | Manual test checklist and known limitations |

---

## 8. Notes for the backend developer

The frontend is written against its own domain types
(`src/domain/types.ts`), never against a Laravel response shape. To connect a
real backend:

1. Set `NEXT_PUBLIC_RADWA_API_BASE_URL` (and `NEXT_PUBLIC_RADWA_AI_BASE_URL`).
2. Implement `createApiRepository()` in `src/services/api/apiClient.ts` against
   the `RadwaRepository` interface in `src/services/repository.ts`.
3. Return it from `useRepository()` in
   `src/services/mock/mockRepository.ts`.

No screen imports the store or the operations directly — they all call
`useRepository()`, and every method is already `async`. Response mapping belongs
in `src/services/api/adapters.ts`, which contains worked examples.

`docs/API_CONTRACT.md` proposes the resources and operations the frontend needs.
It is a **proposal for coordination**, not an implemented API.
