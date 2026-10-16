# Radwa Gulf and Co — Business Rules

Every rule below is implemented once, in the domain layer, and called from both
the operations layer and the screens. No screen re-implements a rule locally.

**The backend must enforce all of these server-side.** The frontend's
enforcement is a usability feature, not a security boundary — the role switcher
performs no identity check.

---

## The twenty confirmed rules

### 1. The Management Team is exactly three members, including the MD

The MD is one of the three, never a fourth.

- `rules.getManagementTeam` / `rules.validateManagementTeam`
- `config.managementConfig.managementTeamSize`
- The seed is validated at load in development, and the result is shown on
  **Demo Controls**.

### 2. An enquiry is rejected only when all three members reject it

One or two rejections leave the enquiry open while another member has not
voted. A single "pursue" vote means the remaining rejections can never void it.

- `rules.evaluatePursuit` → `outcome: "PENDING" | "PURSUE" | "REJECTED"`
- To demonstrate: record two rejections and leave the third member undecided —
  the enquiry stays live until all three have rejected.

### 3. CRM assigns the MCP and Estimator; the MD can override

An MD override requires a recorded reason, kept in the assignment history.

- `rules.canAssignTeam`, `rules.canOverrideAssignment`, `rules.validateAssignment`
- `operations.assignTeam`

### 4. MCP and Estimator receive the documents in parallel

Not sequentially. `TenderDocument` carries independent read receipts —
`reviewedByMcpAt` and `reviewedByEstimatorAt` — and both are shown side by side.

### 5. Incomplete survey checklist items require reasons

- `rules.validateChecklistItem` — blocks saving an `INCOMPLETE` item with no
  `incompleteReason`.

### 6. The MCP must review incomplete items before accepting the report

Each incomplete item must be ruled on: exception approved, or returned to the
surveyor for clarification. Acceptance is blocked while any is unresolved.

- `rules.evaluateSurveyProgress`, `rules.canAcceptSurveyReport`
- To demonstrate: mark an item Incomplete with a reason, then try to accept the
  report — acceptance is refused until the MCP rules on it.

A survey that is *not required* never blocks the Estimator
(`rules.surveyBlocksEstimate` returns false by design).

**Taking the checklist to site.** `/surveys/[id]/print` renders the checklist as
a site-ready sheet — tick boxes per item and ruled lines for findings and the
incomplete reason. The surveyor fills it in on site, then attaches the completed
sheet (metadata only in this demo) and submits it with remarks.

**Demo shortcut.** `operations.completeAndSubmitSurvey` marks every outstanding
item complete and submits in one action, so the survey stage can be shown
quickly. It is labelled as a shortcut in the UI and in the activity record, and
must not be carried into production — a real surveyor records each item from
what they saw on site.

### 7. The MD must approve the estimate

The approval list is derived, not hard-coded: the MD, plus the Management Team
member responsible for the enquiry. If the MD *is* the responsible manager the
list collapses to one entry rather than demanding two votes from one person.

- `rules.requiredEstimateApprovers`
- `config.estimateApprovalPolicy`

### 8. Estimate rejection requires a reason

Any rejection returns the estimate to the Estimator; it cannot be approved
around. A changed estimate starts a fresh approval cycle.

- `operations.decideEstimateApproval`, `rules.validateRejectionReason`

### 9. Document rejection requires a reason **and** corrective instructions

Submission is blocked if either field is empty after trimming.

- `rules.validateDocumentRejection`

### 10. Approvals are tied to document versions

A document's effective status is the status of its *current version*. A document
whose v1 was approved and whose v2 is pending is a pending document — the old
approval does not carry forward.

- `rules.currentVersion`, `rules.documentStatus`, `rules.isDocumentApproved`
- To demonstrate: approve a document, then create a new version of it — v1 keeps
  its approval in the history while v2 is pending.

### 11. Only changed documents need renewed departmental approval

Creating a new version leaves that document unapproved while every other
document keeps its approval untouched. A newly added required document must
complete its own review. A revised document returns to its existing responsible
department.

- `operations.createDocumentVersion`, `operations.addBidDocument`
- `rules.packageFingerprint`, `rules.isVerificationStale`

### 12. Required current-version documents must be approved before CRM marks Documents Approved

- `rules.evaluatePackageCompleteness`, `rules.canMarkDocumentsApproved`
- The blockers are listed by name in the UI when verification is not possible.

### 13. Final bid approval happens after document completeness verification, and the main MD is the sole approver

**Only the main MD (Babukuttan) approves the final bid**, whichever Management
Team member the enquiry is assigned to. MD1 and MD2 take part in the pursuit
decision, and the responsible member approves the *estimate*, but neither votes
at this stage.

- `rules.finalBidApprovers` derives the list from
  `config.finalBidApprovalPolicy.approvers`. Switch it to
  `"MAIN_MD_AND_RESPONSIBLE_MANAGER"` or `"MANAGEMENT_TEAM"` to widen it; that
  function is the only reader, so nothing else has to change.

The approval is gated on CRM's verification. If a document changes after
verification, the gate closes again until CRM re-verifies — and re-verification
opens a **new approval round**, so stale votes are never reused.

- `rules.evaluateFinalBidApproval` (`gateOpen`, `gateMessage`)
- `operations.markDocumentsApproved` (increments the round)

### 14. Major commercial or scope revisions require management approval

### 15. Minor administrative-only revisions do not require MD approval

The MCP classifies the revision when recording the client request; the
classification drives the requirement. **No numeric threshold is invented** —
the business has not defined one.

- `rules.revisionRequiresManagementApproval`, `rules.describeRevisionRequirement`
- `config.revisionPolicy.classesRequiringManagementApproval`

### 16. Client rejection ends the enquiry as lost

- `operations.deriveStage` → `LOST`, with the client's stated reason recorded as
  the closure reason.

### 17. An award can generate a work-order draft without a PO

A purchase order is not required to draft the work order. An award letter may be
attached but is not mandatory.

- `rules.canGenerateWorkOrder`

### 18. Work-order finalization and Operations handover are separate stages

Finalizing locks the work order. Handover is a separate step with its own
checklist.

- `rules.canFinalizeWorkOrder`, `rules.canCompleteHandover`

### 19. The PO must be recorded before Operations handover is completed

- `rules.buildHandoverChecklist` → the `PO_RECORDED` row is `required`
- To demonstrate: reach handover without recording a PO — the Complete button
  stays disabled and the missing item is named.

### 20. The handover checklist and revision history must be visible

The checklist shows every item with its status and what satisfies it. Estimate
revisions and document version histories are visible on the enquiry record.

---

## Configurable decisions

These live in `src/domain/config.ts` and are surfaced in the UI so a reviewer
can see what was assumed.

| Decision | Status | Default in the demo |
| --- | --- | --- |
| Management Team size | **Confirmed** | 3 — Babukuttan (MD), MD1 and MD2 |
| Estimate approvers | **Confirmed** | MD + responsible Management Team member; all must approve |
| Final bid approvers | **Confirmed** | The main MD (Babukuttan) alone, regardless of who the enquiry is assigned to. Widen via `finalBidApprovalPolicy.approvers`. |
| Revision approval trigger | **Confirmed (no threshold)** | By revision class, not by price. Major commercial / scope / material require approval; minor administrative does not. |
| Work-order numbering | **Illustrative** | `WO-{YYYY}-{SEQ}`, annual reset. Must be administrator-configurable in production. |
| Handover blocking items | **Confirmed** | 8 required rows; outstanding kickoff actions are advisory, since the business did not state that every action must close first. |
| Department routing | **Predefined** | Fixed department → reviewer map. The department-configuration module is out of scope for this phase. |
| PCP | **Unconfirmed acronym** | Used verbatim; the demo does not guess at an expansion. |

---

## Rules deliberately *not* implemented

- **No global AI accuracy metric.** The BOQ shows per-line variance against a
  simulated suggestion. No model-performance figure is invented.
- **No numeric revision threshold.** See rules 14/15.
- **No additional handover prerequisites** beyond the confirmed list. Items the
  system cannot derive — confirming the client contact list, reviewing the
  revision history — are explicit CRM confirmations, clearly marked as such.
- **No approval matrix beyond the confirmed approvers.** See rules 7 and 13.
