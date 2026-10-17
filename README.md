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

State is shared through Supabase, so a change made on one device appears on
every other. It is also cached in `localStorage` under the key
`radwa-erp-demo` for an instant first paint, but the server copy is what wins
on load. The topbar indicator says which of the two you are looking at — see
section 6.

**Reset** from the user menu (top right) → *Clear all enquiries*. Reset
discards every enquiry and workflow record and keeps the people and client
lists. Like any other change it is uploaded, so it clears **every** device, not
just the one you ran it on.

If the entity shape changes, bump `SCHEMA_VERSION` in `src/data/seed.ts`;
persisted state from an older version is discarded rather than half-migrated.

---

## 4. Demo roles

Each person signs in at `/login` with their own username and the shared demo
password. To change user mid-demo, open the user menu (top right) and choose
*Switch user*.

### Usernames

All nineteen accounts use the same password: **`radwa2026`** — defined as
`DEMO_PASSWORD` in `src/data/auth.ts` and seeded by
`supabase/migrations/0001_auth_profiles.sql`. Change it in both places.

| Username | Person | Role |
| --- | --- | --- |
| `babukuttan` | Babukuttan | MD — main, mandatory final-bid approver |
| `md1` | MD1 | MD |
| `md2` | MD2 | MD |
| `layla` | Layla Haddad | CRM Manager |
| `estimator1` | Estimator 1 | Estimator |
| `estimator2` | Estimator 2 | Estimator |
| `akshai` | Akshai | MCP / Project Manager |
| `sandeep` | Sandeep | MCP / Project Manager |
| `pk` | PK | MCP / Project Manager |
| `majid` | Majid Al Balushi | Surveyor |
| `imran` | Imran Shaikh | Surveyor |
| `ahmed` | Ahmed Nasser | Department Reviewer — Technical |
| `fatima` | Fatima Zahra | Department Reviewer — Commercial |
| `vikram` | Vikram Rao | Department Reviewer — Planning |
| `salim` | Salim Al Harthy | Department Reviewer — Procurement |
| `grace` | Grace Mwangi | Department Reviewer — HSE |
| `peter` | Peter Oduya | Department Reviewer — Quality |
| `mariam` | Mariam Saleh | Department Reviewer — HR / Admin |
| `nadia` | Nadia Rahman | HR Manager |

| Role | People | Primary screens |
| --- | --- | --- |
| CRM Manager | Layla Haddad | Register, Assignments, Bid package verification, Work Orders, Handover |
| MD | **Babukuttan** (main MD), MD1, MD2 | Pursuit, Estimate Approvals, Final Bid Approval, PCP |
| Estimator | Estimator 1, Estimator 2 | BOQ & Estimates, Bid Packages |
| MCP / Project Manager | Akshai, Sandeep, PK | Surveys, Submission & Follow-up, Kickoff |
| Surveyor | Majid Al Balushi, Imran Shaikh | Site Surveys |
| Department Reviewer | Technical, Commercial, Planning, Procurement, HSE, Quality, HR/Admin | Document Reviews |
| HR Manager | Nadia Rahman | Employee Register, Employee Joining |

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

### Who can open what

| Screen | CRM | MD | MCP | Estimator | Surveyor | Reviewer | HR |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard | ● | ● | ● | ● | ● | ● | ● |
| Enquiry Register | ● | ● | | | | | |
| Pursuit Decisions | ● | ● | ● | | | | |
| Assignments | ● | ● | ● | | | | |
| Site Surveys | ● | ● | ● | ● | ● | | |
| BOQ & Estimates | ● | ● | ● | ● | | | |
| Estimate Approvals | ● | ● | ● | | | | |
| Bid Packages | ● | ● | ● | ● | | | |
| Document Reviews | ● | ● | ● | | | ● | |
| Final Bid Approval | ● | ● | ● | | | | |
| Submission & Follow-up | ● | ● | ● | | | | |
| Work Orders | ● | ● | ● | | | | |
| Kickoff & Handover | ● | ● | ● | | | | |
| Employee Register | | ◐ | | | | | ● |
| Employee Joining | | | | | | | ● |

● full access · ◐ read-only. The MD can read the employee register; only HR
can add or change a record, and the URL is guarded, not just the sidebar.

The matrix lives in one place: the `roles` allow-list on each item in
`src/components/shell/navigation.ts`. Hiding an item from the sidebar also
blocks the URL — `canAccessPath` guards the landing pages in the app layout,
and a role without access sees a short notice instead.

Individual records stay reachable: an Estimator has no Enquiry Register, but
can still open `/enquiries/<id>` for an enquiry assigned to them from their
own queues. Only the landing pages are gated.

As with the per-role record scoping, this is **presentation only**. The
backend must authorize every request.

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

**Sign-in and the workflow data are both connected to Supabase.** The data is
stored as one shared JSON document rather than 28 normalised tables — see
*How sync works* below for why, and what that costs.

### One-time setup

1. **Run both migrations, in order.** Supabase Dashboard → SQL Editor → New
   query → paste → Run. Both are safe to re-run.
   - `supabase/migrations/0001_auth_profiles.sql` — the `profiles` table, its
     row-level security policies, and the eighteen accounts.
   - `supabase/migrations/0002_workspace_sync.sql` — the shared workspace
     document and the compare-and-swap writer that guards it.
   - `supabase/migrations/0003_repair_auth_tokens.sql` — repairs rows 0001
     left unreadable, and stops them being created. Ends with a verification
     table; every row must read OK.
   - `supabase/migrations/0004_hr_role.sql` — the HR Manager role and account.
2. **Turn off email confirmation.** Dashboard → Authentication → Providers →
   Email → uncheck *Confirm email*. The seeded accounts cannot sign in while
   it is on.
3. **Check it worked.** In the SQL Editor:
   ```sql
   select username, full_name, role, department from public.profiles order by role, username;
   ```

Until step 1 is done Supabase has no accounts to match, so every sign-in falls
through to the built-in accounts in `src/data/auth.ts` — same usernames, same
password, no Supabase round-trip. **A local sign-in cannot sync**: row-level
security refuses an anonymous writer, so the topbar will read *This device
only* and changes will stay in that browser. Running the migrations is what
turns sync on.

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

### How sync works

The whole workflow database is one row in `workspace_state`, as `jsonb`.

That shape is deliberate. The app already treats its database as a single
value — `dispatch` clones it, applies one pure operation, and commits all of it
or none of it. One document mirrors that exactly, so the sync layer is a single
save/load seam rather than 28 sets of CRUD and foreign keys.

**Writes are compare-and-swap, not last-write-wins.** `save_workspace()` accepts
a write only if the caller holds the revision currently stored. A caller that
has fallen behind gets the winner's document back, **replays its own unconfirmed
operations against it**, and tries again. Because operations are pure functions
of `(db, ctx, input)`, replaying is exact: two people working on different
enquiries both keep their work. An operation that is genuinely invalid against
the newer state — approving something another device just rejected — fails on
replay and is reported in the sync indicator instead of being forced through.

**Other devices are told, not polled.** A tiny `workspace_pulse` row carries the
realtime notification; the document itself is never broadcast, because it is far
too big to push to every tab on every change.

**`localStorage` is now a cache, not the source of truth.** It still gives an
instant first paint and keeps an offline demo readable, but on every load the
server copy replaces it.

Known limits, honestly:

| Limit | Detail |
| --- | --- |
| One shared workspace | A single `'default'` row. There is no notion of separate companies or environments. |
| Whole-document writes | Every change uploads the entire database. Fine at demo scale; it would need normalising long before it held years of records. |
| Replay is bounded | Five attempts, then the change stays pending and is retried later rather than being dropped. |
| First device wins initialisation | The server row starts empty; whichever device connects first uploads its copy. **Open the app first on the device that holds your existing work.** |

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
| Supabase not configured | Local accounts; sync off, shown as *This device only* |
| Supabase unreachable / paused | Falls back to local accounts, and says so |
| Supabase rejects the credentials | Falls back to the built-in demo accounts, which require the same username and the demo password; the sign-in message says so |
| Wrong password | **Refused** by both stores — a bad password is not waved through |
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
