# Radwa Gulf and Co — Testing and Known Limitations

## 1. Automated checks

| Check | Command | Status |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | Passes, no errors |
| Lint (incl. React Compiler rules) | `npm run lint` | Passes, no errors or warnings |
| Production build | `npm run build` | Passes, all 21 routes compile |

There is **no automated test suite** in this phase — see §4.

## 2. Manual test checklist

Everything below was executed against the running application. Reset the demo
data first so the seeded state matches.

### Sign in

- [x] Requesting a protected route while signed out redirects to `/login`
- [x] A wrong password is refused with one generic message, naming neither field
- [x] Correct credentials sign in and land on that role’s dashboard
- [x] Clicking a demo account signs in with one click
- [x] A refresh keeps the session; *Switch user* and *Sign out* return to `/login`
- [x] Clearing the records does not sign you out

### Shell and roles

- [x] App boots at `/dashboard` with no runtime errors
- [x] All six roles are selectable; the dashboard, sidebar emphasis and queue
      contents change with the role
- [x] Acting user can be switched within a role (7 department reviewers, 3
      Management Team members, 2 MCPs, 2 Estimators, 2 Surveyors)
- [x] Role and acting user survive a page refresh
- [x] Global search finds enquiries by reference, title, client and location
- [x] Notification bell is scoped to the active role; "mark all read" works
- [x] "DEMO MODE — Sample Data" is visible on every page

### Per-role visibility

- [x] Estimator 1 sees only the enquiry assigned to them; Estimator 2’s enquiry
      is absent from the register and the count reads “1 of 1”
- [x] MCP Sandeep sees only their own enquiry
- [x] Global search finds nothing for an enquiry assigned to someone else
- [x] Opening another user’s enquiry by URL shows “Not assigned to you”, not
      “not found”
- [x] A scope notice explains the narrowing on the register and the queues
- [x] CRM Manager still sees every enquiry, with no scope notice

### Enquiry register and registration

- [x] Search, phase/stage/client/priority/project-type filters, and
      include-closed toggle all narrow the list
- [x] Sorting by reference, stage, value, deadline and last-updated
- [x] Submitting the registration form empty shows four field errors plus a toast
- [x] On an empty system a valid submission creates `ENQ-<year>-0001`,
      redirects to the detail page, and the record appears in the register, the
      pursuit queue and the dashboard counts
- [x] New records are badged "Created in this session"

### Pursuit decision (rules 1, 2)

- [x] Two rejections with the third member undecided leaves the enquiry live
- [x] Rejecting without a reason is blocked (field error + toast); no decision
      is recorded
- [x] Recording the third rejection moves the enquiry to **Void** with the
      closure reason stored
- [x] Three pursue votes move the enquiry to Awaiting Assignment

### Assignment (rules 3, 4)

- [x] CRM can assign MCP + Estimator + responsible manager
- [x] Assignment is blocked while the pursuit decision is incomplete
- [x] MD override requires a reason and is kept in the assignment history
- [x] Tender documents show independent MCP and Estimator read receipts

### Site survey (rules 5, 6)

- [x] Estimator records survey required / not required with a justification
- [x] "Not required" does not block estimation
- [x] MCP assigns a surveyor and date; the project-specific checklist is created
- [x] An incomplete checklist item cannot be saved without a reason
- [x] Submitting is blocked while any item is still pending
- [x] Acceptance is blocked while an incomplete item is unresolved; the Accept
      button is disabled and the blocker is named
- [x] After the MCP rules on every exception, acceptance succeeds and the
      Estimator is notified
- [x] **Printable checklist**: /surveys/[id]/print renders a site-ready sheet —
      project header, per-item Complete/Incomplete tick boxes, ruled lines for
      findings and the incomplete reason, and surveyor/site-rep signature blocks
- [x] Items already recorded in the app print with their findings; outstanding
      items print as blank lines
- [x] The surveyor can attach the completed checklist (name and size only) and
      submit it with remarks; the attachment is shown to the MCP
- [x] **"Demo: complete all & submit"** fills every pending item and submits in
      one click, and says in the toast that it is a shortcut

### BOQ and estimate

- [x] Quantities and rates are editable; line amounts, the quotation summary and
      the grand total recalculate **as you type**
- [x] Values persist on blur and on "Save draft"
- [x] Variance percentages recalculate (verified: +106.0% qty, +115.9% amount)
- [x] A manually added line has no AI baseline, so all three variance cells show
      "—" rather than a misleading 100% or `Infinity`
- [x] Overhead/profit/contingency/VAT percentages are editable and flow through
- [x] Submitting with an unpriced line is blocked, naming the count
- [x] The submit dialog names the derived approvers (MD + responsible manager)
- [x] Lines can be removed behind a confirmation dialog
- [x] Creating a revision copies the BOQ and preserves the previous revision

### Estimate approval (rules 7, 8)

- [x] Approver list is derived, not hard-coded
- [x] Rejection without a reason is blocked
- [x] Any rejection returns the estimate to the Estimator
- [x] Approval by all required approvers marks the estimate approved and
      supersedes earlier revisions

### Bid package and departmental review (rules 9–12)

- [x] Documents route to the correct department; a reviewer sees only their own
      department's queue
- [x] Rejecting with a reason but no corrective instructions is blocked
      ("Corrective instructions are required so the Estimator knows what to fix")
- [x] Approving binds to the version: `v2:APPROVED` with `v1:APPROVED` retained
      in history, and the dialog states the approval applies to that version only
- [x] **Selective re-approval**: creating v2 of an approved document left that
      document `PENDING_REVIEW` and every other required document `APPROVED`
- [x] The package dropped from `PENDING_FINAL_APPROVAL` to
      `IN_DEPARTMENTAL_REVIEW`, and the stage from Final Bid Approval to
      Departmental Review
- [x] CRM verification is blocked while any required document is unapproved, and
      the blockers are listed by name

### Final bid approval (rule 13)

- [x] The gate is closed until CRM verifies: "Documents changed after CRM
      verification. The CRM Manager must re-verify package completeness before
      final approval."
- [x] Re-verification opens a **new** approval round; earlier votes are not reused
- [x] **Babukuttan is the sole approver** — with the enquiry assigned to MD1,
      the approval round still contains only Babukuttan, and his single approval
      releases the bid
- [x] Rejection requires a reason and returns the package for correction

### Client submission and revisions (rules 14–16)

- [x] Submission is blocked until the package is approved for submission
- [x] On-time vs delayed is derived from the date against the deadline
- [x] Follow-up tasks can be created, completed with a note, and reopened
- [x] Revision class drives the management-approval requirement, and the UI
      states which applies
- [x] A client rejection closes the enquiry as Lost

### Award, work order and handover (rules 17–20)

- [x] A work-order draft is generated from an award **with no PO on file**
- [x] Draft fields are editable; finalization is behind a confirmation dialog
      that states finalizing is not handover
- [x] Print view renders a clean document and is marked as illustrative
- [x] Handover blocked — "Outstanding required items: Purchase order recorded;
      Client contacts confirmed for Operations"; the Complete button is disabled
- [x] Recording the PO clears that row; confirming the client-contact row moves
      the enquiry to Ready for Handover
- [x] Completing handover (behind a confirmation dialog) sets the enquiry to
      Handed Over and the work order to Handed Over

### Data integrity

- [x] Reset clears every enquiry and workflow record and keeps the people and
      client lists; enquiry numbering restarts at 0001
- [x] The money chain is consistent: BOQ → quotation → award → work order → PO
      all derive from the same estimate
- [x] Management Team structure validated at load (3 members, exactly one MD,
      MD inside the team)

### Responsive and accessibility

- [x] Desktop (1440×900), tablet and mobile (375×812) layouts all usable;
      filters stack, tables scroll horizontally, nav collapses to a drawer
- [x] Dialogs trap focus, close on Escape, restore focus, and lock background
      scroll
- [x] Tabs implement the ARIA pattern with arrow-key navigation
- [x] All form controls are label-associated with `aria-invalid` and
      `aria-describedby` on error
- [x] Visible focus ring on every interactive element
- [x] Toasts announce through an `aria-live` region
- [x] `prefers-reduced-motion` is respected

---

## 3. Known limitations

These are deliberate scope boundaries, not defects.

1. **No backend.** No database, API, authentication, authorization, email,
   document storage or AI service. All state is in the browser.
2. **The sign-in is not security.** Credentials are fictional, compared in the
   browser, and bypassable from the developer tools. The
   backend must enforce permissions on every operation. The Estimator/MCP
   visibility scoping is presentation only, for the same reason — a client-side
   scope can always be bypassed.
3. **No file is stored.** File pickers read name and size only. Selected files
   do not survive a refresh, and no file content is retained anywhere.
4. **AI columns are simulated seed values.** No model produced them, and no
   accuracy claim is made.
5. **State is per-browser.** `localStorage` only — not shared between users,
   devices or browsers, and cleared by a reset or by clearing site data.
6. **Concurrency is not modelled.** Single-user demo; no locking, no conflict
   resolution, no real-time updates.
7. **Work-order numbering is illustrative.** The configurable pattern exists but
   the administration UI to change it does not.
8. **Department configuration is out of scope.** Departments and reviewers are
   predefined, as specified for this phase.
9. **The Operations execution module is out of scope.** Handover is the terminal
   state in this system.
10. **Print styling is tuned for the work order only.** Other screens print
    legibly but are not designed as documents.
11. **No pagination.** The enquiry register renders every record; a real
    dataset will need server-side pagination, which the API contract assumes.
12. **`npm audit` reports 5 high-severity advisories** in `eslint-config-next`'s
    transitive `braces`/`micromatch` chain. These are **dev-only lint
    dependencies**, not shipped in the build, and the suggested `--force` fix
    downgrades `eslint-config-next` to v14, which is incompatible with Next 16.
    Left as-is deliberately; revisit when upstream updates.

---

## 4. Not done

- **No automated tests.** The brief scoped this phase to a working frontend
  demo, and the time went into the workflow and the rules. The domain layer is
  pure and side-effect free, so it is the natural place to start:
  `evaluatePursuit`, `evaluatePackageCompleteness`, `packageFingerprint`,
  `buildHandoverChecklist`, `computeEstimateTotals` and `computeBoqLine` are all
  directly unit-testable with no mocking. `deriveStage` is worth a table-driven
  test per stage.
- **No Storybook or visual regression setup.**
- **No i18n.** All copy is hard-coded English.
