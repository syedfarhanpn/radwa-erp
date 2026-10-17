# Radwa Gulf and Co — Architecture

## 1. Layering

The codebase is deliberately layered so the demo state can be replaced with a
real API without rewriting the UI.

```
src/
├── domain/        Business meaning. No React, no store, no I/O.
│   ├── enums.ts       String-union statuses + label maps
│   ├── types.ts       Entity types (frontend's own contract)
│   ├── rules.ts       Every business rule, as pure functions
│   └── config.ts      Configurable policy (approval matrices, numbering…)
│
├── data/          Reference data.
│   ├── people.ts      Users, clients, contacts
│   ├── auth.ts        Demo sign-in accounts (username → user + role)
│   ├── boqTemplates.ts Sample BOQ lines by project type
│   └── seed.ts        Starting state: people + clients, no enquiries
│
├── services/      Operations and the backend seam.
│   ├── operations.ts  Every workflow mutation (pure: db + ctx + input)
│   ├── repository.ts  RadwaRepository interface — the contract
│   ├── mock/          Implementation over the demo store
│   └── api/           Future Laravel client + response adapters (stubs)
│
├── store/         Demo state.
│   ├── useDemoStore.ts  zustand + Supabase sync (localStorage cache), single write path
│   ├── visibility.ts    Per-role record scoping (Estimator / MCP)
│   └── selectors.ts     Read models used by every screen
│
├── components/
│   ├── ui/            Presentational primitives (no store access)
│   ├── shell/         Sidebar, topbar, role switcher, navigation map
│   └── workflow/      Workflow panels (the reusable business screens)
│
└── app/(app)/     Route composition only — pages wire panels together
```

**The dependency rule:** `domain` depends on nothing in the app. `data` and
`services` depend on `domain`. `store` depends on `services`. `components` and
`app` depend on `store` and `domain`. Nothing flows the other way.

### Why operations are pure

Each function in `services/operations.ts` has the shape:

```ts
(db: DemoDatabase, ctx: OpContext, input: I) => ActionResult
```

It validates, mutates the supplied draft, writes an activity record, recomputes
the enquiry stage, and returns a result. It never touches React or the store.

The store is the only thing that calls them, and it is the transaction
boundary:

```ts
dispatch(op, input) {
  const draft = structuredClone(db);     // clone
  const result = op(draft, ctx, input);  // mutate the clone
  if (result.ok) set({ db: draft });     // commit only on success
  return result;
}
```

A failed operation therefore cannot leave partial state behind.

### Stage is derived, never assigned

`deriveStage(db, enquiryId)` computes an enquiry's stage from its records —
handover, client response, pursuit votes, award, revision, submission, package
state, estimate state, survey, assignment — and `recomputeStage` runs after
every operation. This is why the register, the detail page, the queues and the
dashboard counts can never disagree: there is one derivation, not several.

---

## 2. Route map

| Route | Purpose | Primary role |
| --- | --- | --- |
| `/login` | Sign-in screen with a one-click demo-account list | — |
| `/dashboard` | Role-specific queues, priority tasks, workflow rollup, activity | All |
| `/enquiries` | Register: search, filters, sorting | CRM Manager, MD |
| `/enquiries/new` | Enquiry registration form (reached from the register, not the sidebar) | CRM Manager |
| `/enquiries/[id]` | Detail hub — 12 tabs, hosts every workflow panel | All |
| `/pursuit` | Pursuit decision queue | MD |
| `/assignments` | Assign / override MCP and Estimator | CRM Manager, MD |
| `/surveys` | Survey decisions, visits, checklists, exceptions | Surveyor, MCP |
| `/estimates` | Estimate list + enquiries awaiting a BOQ | Estimator |
| `/estimates/[id]` | **BOQ and estimate workspace** (full width) | Estimator |
| `/estimates/approvals` | Estimate approval queue | MD |
| `/bid-packages` | Package assembly, documents, completeness | Estimator, CRM |
| `/document-reviews` | Departmental approve / reject queue | Dept. Reviewer |
| `/final-approvals` | Final bid approval + stale-verification list | MD |
| `/submissions` | Submission, follow-ups, client response, revisions | MCP |
| `/work-orders` | Work order list + draft generation | CRM Manager |
| `/work-orders/[id]` | Work order editor, PO, handover | CRM Manager |
| `/work-orders/[id]/print` | Print-friendly work order | CRM Manager |
| `/surveys/[id]/print` | Print-friendly site survey checklist | Surveyor, MCP |
| `/handover` | Kickoff, PCP, PO, Operations handover | CRM Manager, MCP |
| `/demo` | Reset, configurable defaults, rule reference (not in the sidebar) | All |

The enquiry detail page keeps its active tab in the URL (`?tab=package`), so
queue screens and notifications deep-link straight to the right step.

---

## 3. Component map

### UI primitives — `components/ui/`

Presentational only; none reads the store.

| File | Exports |
| --- | --- |
| `primitives.tsx` | `Button`, `LinkButton`, `IconButton`, `Badge`, `Panel*`, `StatTile`, `EmptyState`, `Callout`, `Avatar`, `KeyValue`, `ProgressBar`, `Breadcrumbs`, `SimulatedTag` |
| `form.tsx` | `Field`, `Input`, `Textarea`, `Select`, `NumberInput`, `Checkbox`, `RadioGroup`, `FormSection`, `FieldGrid`, `FilePicker` |
| `table.tsx` | `TableWrap`, `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`, `TFoot` |
| `dialog.tsx` | `Dialog` (focus-trapped, Escape, scroll-locked), `ConfirmDialog` |
| `toast.tsx` | `ToastProvider`, `useToast` |
| `tabs.tsx` | `Tabs`, `TabPanel` (ARIA tabs pattern with arrow-key navigation) |

### Workflow panels — `components/workflow/`

The reusable business screens. Each is used by both the enquiry detail tabs and
the corresponding queue page, so an action behaves identically wherever it is
taken.

| File | Panels |
| --- | --- |
| `QualifyPanels.tsx` | `PursuitPanel`, `AssignmentPanel`, `TenderDocumentsPanel` |
| `SurveyPanels.tsx` | `SurveyPanel` (requirement → assignment → checklist → exceptions → acceptance) |
| `BoqWorkspace.tsx` | `BoqWorkspace`, `EstimateVersionHistory` |
| `EstimatePanels.tsx` | `EstimateSummaryPanel`, `EstimateApprovalPanel`, `BoqReadOnlyTable` |
| `BidPackagePanels.tsx` | `BidPackagePanel`, `ReviewDocumentDialog`, `CompletenessVerificationPanel` |
| `FinalApprovalPanel.tsx` | `FinalApprovalPanel` |
| `ClientPanels.tsx` | `SubmissionPanel`, `FollowUpPanel`, `ClientResponsePanel`, `RevisionPanel` |
| `AwardPanels.tsx` | `AwardPanel`, `WorkOrderPanel`, `KickoffPanel`, `ActionItemsPanel`, `PcpPanel`, `PurchaseOrderPanel`, `HandoverPanel` |
| `StatusBadges.tsx` | One mapping from every domain status to a label and tone |
| `ActivityFeed.tsx` | The only renderer of the audit trail |
| `QueueLayout.tsx` | Master/detail layout shared by the queue screens |
| `shared.tsx` | `useAction` (result → toast + field errors), `RoleGate`, `PolicyNote`, `BlockerList` |

### `useAction`

Every panel routes its repository calls through `useAction`, which turns an
`ActionResult` into a success toast, or an error toast plus per-field messages.
Because every panel uses it, a blocked action always explains itself rather than
appearing to do nothing.

---

## 4. Design tokens

Defined once in `src/app/globals.css` under Tailwind v4's `@theme`:

- **Brand** `brand-50…900` — steel blue, the single accent
- **Neutrals** `ink-50…900` — surfaces, borders, text
- **Semantic** `ok-*`, `warn-*`, `bad-*`, `info-*`, `accent-*`
- **Radii** `rounded-card`, `rounded-control`
- **Elevation** `shadow-panel`, `shadow-raised`, `shadow-overlay`
- **Type** `text-2xs` for dense metadata; `.numeric` for tabular figures

Single light theme, chosen for consistency across demo machines. Focus rings are
applied globally to every interactive element, and `prefers-reduced-motion` is
respected.

---

## 5. State model

```ts
DemoDatabase {
  schemaVersion, users, clients, contacts,
  enquiries, pursuitDecisions, assignments, tenderDocuments,
  surveys, surveyChecklistItems,
  estimates, boqLineItems, estimateApprovals,
  bidPackages, bidPackageDocuments, managementApprovals,
  clientSubmissions, followUpTasks, clientResponses, revisionRequests,
  awards, workOrders, kickoffMeetings, actionItems,
  pcpAppointments, purchaseOrders, handovers,
  activities, notifications, sequences
}
```

Three modelling decisions carry most of the workflow's weight:

**An enquiry has multiple project types.** `Enquiry.projectTypes[]` holds every
discipline the package covers, and the combination is what drives derived work:
`boqTemplateFor()` unions the starter BOQ lines, and
`buildChecklistTemplateForProject()` unions the discipline-specific survey
items. Two details the union has to get right — several project types share a
BOQ template (pipeline and fabrication both use the mechanical one), so
templates are de-duplicated by identity rather than by type; and item codes are
only unique *within* a template (civil `E-01` is painting, electrical `E-01` is
an LV panel), so a collision is suffixed (`E-01/2`) rather than dropped.

**Document versions are first-class.** `BidPackageDocument.versions[]` holds
every version with its own `reviewStatus`, reviewer and timestamps.
`currentVersionNo` points at the live one. A document's effective status *is*
the status of its current version, which is what makes selective re-approval
fall out of the model rather than being special-cased in the UI.

**Package verification stores a fingerprint.** When CRM marks "Documents
Approved", `packageFingerprint(docs)` — the id and approved version of every
required document — is stored on the package. Any later change makes the
fingerprint mismatch, which closes final approval until CRM re-verifies, while
leaving every unchanged document's approval untouched.

---

## 6. Per-role visibility

`store/visibility.ts` narrows the database an Estimator or an MCP reads to the
enquiries assigned to them, and `useDb()` applies it. Scoping once, at the
source, is why the register, the global search, every queue, the dashboards,
the activity feed and the notification bell are all consistent — there is no
screen left to forget, and no per-screen filter to drift.

`useUnscopedDb()` exists for the one case that needs the whole picture: the
enquiry detail page distinguishes "no such record" from "assigned to someone
else" so a scoped user is told why, not shown a dead end.

The scope is memoised on the database reference. The store replaces `db`
wholesale on every write, so reference equality is a sound cache key and the
scope is rebuilt once per change rather than once per reading component.

Screen access is a separate, coarser gate: the `roles` allow-list on each nav
item in `src/components/shell/navigation.ts`, enforced for direct URLs by
`canAccessPath` in the app layout. Record scoping decides *which rows* a user
sees; the allow-list decides *which pages* they can open.

**Neither is access control.** Both are presentation concerns in a client with
no authorization. The backend must filter and authorize server-side.

---

## 7. Hydration

Cached state lives in `localStorage`, which does not exist during the server
render. `useHydrated()` reads the persist middleware through
`useSyncExternalStore` — `false` on the server, `true` once rehydration
finishes — and `app/(app)/layout.tsx` renders the same placeholder on both
sides until then. That is what keeps server and client markup identical.
