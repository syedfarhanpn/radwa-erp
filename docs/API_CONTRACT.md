# Radwa Gulf and Co — Proposed API Contract

> **This is a proposal for coordination, not an implemented API.** Nothing in
> the frontend demo makes a network request. This document describes the
> resources and operations the existing UI needs, so the backend can be designed
> against a known consumer.

Base: `/api/v1`. JSON throughout. Laravel conventions assumed
(`{ data: … }` envelopes, `snake_case` keys, 422 validation payloads) — the
frontend maps all of that in `src/services/api/adapters.ts`, so these choices
are not binding on the UI.

---

## 1. General

### Authentication

The demo has a sign-in screen (`/login`), but it is a demonstration only:
fictional credentials in `src/data/auth.ts`, compared in the browser.
Production needs real authentication and **server-side authorization on every
endpoint below**.

Proposed:

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/login` | `{ username, password }` to a session token plus the signed-in user and their roles |
| `POST` | `/auth/logout` | Invalidate the session |
| `GET` | `/auth/me` | Current user and roles, for restoring a session on refresh |

Passwords must be hashed, failures must stay generic so the response does not
reveal whether a username exists, and attempts should be rate-limited. The
frontend already shows one generic failure message for exactly that reason.

Each operation below names the role that may call it. Those are requirements
for the backend to enforce — the frontend cannot.

### Errors

```jsonc
// 422
{ "message": "A rejection reason is required.",
  "errors": { "reason": ["A rejection reason is required."] } }
```

The frontend flattens `errors` to one message per field and renders them against
the control. Returning the same field names the request used keeps that working.

### Response of a workflow action

Workflow endpoints should return the affected aggregate so the UI can refresh
without a second round trip:

```jsonc
{ "data": { "enquiry": { … }, "affected": { "bid_package": { … } } },
  "message": "HSE Plan v2 created. The previous approval applies only to v1." }
```

The `message` is shown to the user verbatim, so it should explain the
*consequence*, as the demo's messages do.

---

## 2. Reference data

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/configuration` | Approval matrices, numbering patterns, handover policy, bid-document catalogue, survey checklist template. Replaces `src/domain/config.ts`. |
| `GET` | `/users` | Includes `roles[]`, `department`, `is_management_team`, `is_md` |
| `GET` | `/clients` | `?include=contacts` |
| `POST` | `/clients` | Inline client creation from the enquiry form |
| `GET` | `/clients/{id}/contacts` | |

---

## 3. Enquiries

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/enquiries` | any | Filters: `stage`, `phase`, `client_id`, `project_type`, `priority`, `assigned_mcp_id`, `assigned_estimator_id`, `q`, `include_closed`. Paginated. `project_type` matches an enquiry that *contains* that discipline. |
| `GET` | `/enquiries/{id}` | any | `?include=` the aggregate the detail page needs (see §10) |
| `POST` | `/enquiries` | CRM | Returns the generated `reference` |
| `PATCH` | `/enquiries/{id}` | CRM | Metadata only; stage is **never** client-supplied |

**The stage is server-derived.** The frontend computes it with
`deriveStage()` from the records; the backend should do the same and return it.
Accepting a client-supplied stage would let the UI drift out of the rules.

**`project_types` is an array, not a scalar.** An enquiry covers one or more
disciplines, and the combination drives both the starter BOQ template and the
project-specific survey checklist. Model it as a join table
(`enquiry_project_types`) or a typed array column; at least one entry is
required. The frontend rejects an empty selection, and the backend should too.

### Tender documents

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/enquiries/{id}/tender-documents` | any |
| `POST` | `/enquiries/{id}/tender-documents` | CRM — multipart once storage exists |
| `POST` | `/tender-documents/{id}/mark-reviewed` | MCP, Estimator — body `{ "as": "MCP" \| "ESTIMATOR" }` |

---

## 4. Pursuit and assignment

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `GET` | `/enquiries/{id}/pursuit-decisions` | any | |
| `POST` | `/enquiries/{id}/pursuit-decisions` | Management Team | `{ vote, reason? }` — **reason required when `vote=REJECT`** |
| `POST` | `/enquiries/{id}/assignments` | CRM, MD | `{ mcp_id, estimator_id, responsible_manager_id, override_reason? }` |
| `GET` | `/enquiries/{id}/assignments` | any | History, newest first |

The backend owns rule 2: void the enquiry only when all three members have
rejected.

---

## 5. Site survey

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `PUT` | `/enquiries/{id}/survey/requirement` | Estimator | `{ required: bool, reason }` — reason required either way |
| `PUT` | `/enquiries/{id}/survey/assignment` | MCP | `{ surveyor_id, scheduled_date }` — creates the project-specific checklist |
| `GET` | `/enquiries/{id}/survey` | any | `?include=checklist_items` |
| `PATCH` | `/survey-checklist-items/{id}` | Surveyor | `{ status, findings?, incomplete_reason? }` — **reason required when `INCOMPLETE`** |
| `POST` | `/enquiries/{id}/survey/submit` | Surveyor | `{ summary }` — 422 while any item is `PENDING` |
| `POST` | `/survey-checklist-items/{id}/ruling` | MCP | `{ ruling: ACCEPTED\|RETURNED, note }` |
| `POST` | `/enquiries/{id}/survey/accept` | MCP | 422 while any exception is unresolved |

---

## 6. Estimates and BOQ

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `GET` | `/enquiries/{id}/estimates` | any | `?include=lines` |
| `POST` | `/enquiries/{id}/estimates` | Estimator | Creates revision 1 |
| `POST` | `/estimates/{id}/revisions` | Estimator | `{ revision_note, revision_request_id? }` — copies the BOQ |
| `PATCH` | `/estimates/{id}` | Estimator | Percentages, notes, assumptions. 409 unless `DRAFT` or `REJECTED` |
| `POST` | `/estimates/{id}/lines` | Estimator | |
| `PATCH` | `/boq-lines/{id}` | Estimator | `{ item_code?, description?, unit?, estimator_quantity?, estimator_unit_rate?, note? }` |
| `DELETE` | `/boq-lines/{id}` | Estimator | |
| `POST` | `/estimates/{id}/submit` | Estimator | Creates the approval rows; 422 if any line is unpriced |
| `POST` | `/estimates/{id}/approvals` | Approver | `{ decision, reason? }` — **reason required on `REJECTED`** |

### Totals

Amounts and variances are computed in `src/domain/rules.ts`
(`computeBoqLine`, `computeEstimateTotals`). **The backend should compute them
too and treat its own values as authoritative**, so a stored quotation total can
never diverge from the saved lines. Variance denominators must be guarded: a
missing or zero AI baseline yields `null`, never `Infinity` or `NaN`.

### AI suggestions (FastAPI)

`ai_quantity` / `ai_unit_rate` are **suggestions only** and must never be
written by the estimator's own edits. Proposed:

```
POST {AI_BASE_URL}/boq/suggestions
→ { enquiry_id, generated_at, model_label,
    lines: [{ item_code, description, unit,
              suggested_quantity, suggested_unit_rate, confidence }] }
```

The shape is already typed as `AiBoqSuggestionResponse` in
`src/services/api/adapters.ts`.

---

## 7. Bid package and departmental review

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `POST` | `/enquiries/{id}/bid-package` | Estimator | 422 unless an estimate is approved |
| `GET` | `/bid-packages/{id}/documents` | any | **Must eager-load versions** — see below |
| `POST` | `/bid-packages/{id}/documents` | Estimator | `{ catalog_key, is_required, custom_name? }` |
| `PATCH` | `/bid-documents/{id}` | Estimator | `{ is_required }` |
| `DELETE` | `/bid-documents/{id}` | Estimator | 409 if any version is approved |
| `POST` | `/bid-documents/{id}/submit` | Estimator | `{ file_name, file_size_label?, change_summary? }` — submits the current draft version |
| `POST` | `/bid-documents/{id}/versions` | Estimator | `{ file_name, change_summary, submit_now }` — **creates a new version** |
| `POST` | `/bid-document-versions/{id}/review` | Dept. Reviewer | `{ decision, rejection_reason?, corrective_instructions? }` — **both required on reject** |
| `POST` | `/bid-packages/{id}/verify-documents` | CRM | Records the fingerprint, opens the next approval round |
| `POST` | `/bid-packages/{id}/final-approvals` | Management Team | `{ decision, reason? }` — 409 while the verification gate is closed |

### Critical: versions must be eager-loaded

The selective re-approval rule depends on knowing the review status of **every**
version, not just the latest. A flattened "document has a status" response would
break it.

### Critical: the review targets a version, not a document

Reviewing by document id invites a race where a reviewer approves a version the
Estimator has already replaced. The endpoint takes a **version id** and should
409 if it is no longer the current version.

### Verification fingerprint

`verify-documents` should store a fingerprint of the approved required versions,
exactly as `rules.packageFingerprint` does:

```
<doc_id>@v<version_no>:<status>  (sorted, joined by "|")
```

Any later change makes it mismatch, which closes final approval until CRM
re-verifies — while every unchanged document keeps its approval.

---

## 8. Client submission, response and revisions

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `POST` | `/enquiries/{id}/submissions` | MCP | `{ submitted_on, client_contact_id, acknowledgement_ref?, notes?, next_follow_up_date? }` — server decides on-time vs delayed against the deadline |
| `GET`/`POST` | `/enquiries/{id}/follow-up-tasks` | MCP | |
| `POST` | `/follow-up-tasks/{id}/complete` | MCP | `{ completion_note? }` |
| `POST` | `/follow-up-tasks/{id}/reopen` | MCP | |
| `POST` | `/enquiries/{id}/client-responses` | MCP | `{ response, detail, reference?, revision_class?, awarded_value?, awarded_scope?, award_letter_file_name? }` |

`revision_class` is required when `response=REVISION_REQUESTED`; the awarded
fields are required when `response=AWARDED`. An `AWARDED` response creates the
award record in the same transaction.

**Email is out of scope for this contract.** If the business later wants real
delivery, it should be a separate, explicitly triggered endpoint — not a side
effect of recording a submission.

---

## 9. Award, work order and handover

| Method | Path | Role | Body |
| --- | --- | --- | --- |
| `POST` | `/enquiries/{id}/work-order` | CRM | Generates the draft from the award + approved quotation. **Must not require a PO.** |
| `PATCH` | `/work-orders/{id}` | CRM | Scope, commercial summary, terms, dates, retention. 409 unless `DRAFT` |
| `POST` | `/work-orders/{id}/finalize` | CRM | |
| `POST` | `/enquiries/{id}/kickoff` | MCP | `{ meeting_date, location, attendee_ids[], external_attendees?, minutes, decisions }` |
| `GET`/`POST` | `/enquiries/{id}/action-items` | MCP, CRM | |
| `PATCH` | `/action-items/{id}` | MCP, CRM | `{ status }` |
| `POST` | `/enquiries/{id}/pcp-appointment` | Management Team | `{ appointee_id, appointment_date, notes? }` |
| `PUT` | `/enquiries/{id}/purchase-order` | CRM | `{ po_number, po_date, expiry_date?, status, value?, document_file_name?, notes? }` |
| `GET` | `/enquiries/{id}/handover-checklist` | any | Server-derived rows: `{ key, label, satisfied, required, detail }` |
| `POST` | `/enquiries/{id}/handover/acknowledge` | CRM | `{ key, acknowledged }` |
| `POST` | `/enquiries/{id}/handover/complete` | CRM | `{ operations_owner_id, notes? }` — **422 while any required row is unsatisfied** |

Work-order numbering must read its pattern from configuration, not a constant.

---

## 10. The detail aggregate

`/enquiries/{id}` backs a twelve-tab screen. Rather than a dozen round trips,
an `include` parameter covering the aggregate is preferable:

```
GET /api/v1/enquiries/{id}?include=client,contacts,assignments,tender_documents,
    survey.checklist_items,estimates.lines,estimate_approvals,
    bid_package.documents.versions,management_approvals,
    submissions,follow_up_tasks,client_responses,revision_requests,
    award,work_order,kickoff,action_items,pcp_appointment,purchase_order,
    handover,activities
```

`src/store/selectors.ts#enquiryDetail` is the exact read model the UI consumes,
and is the best specification of what this response needs to contain.

---

## 11. Activity and notifications

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/enquiries/{id}/activities` | Actor, role, action, detail, reason, timestamp, entity reference |
| `GET` | `/activities` | Global feed for the dashboard |
| `GET` | `/notifications` | Scoped to the authenticated user |
| `POST` | `/notifications/mark-read` | |

**Every consequential operation must write an activity record** with the actor,
the action, the timestamp and — where the rule requires one — the reason or
corrective instruction. The demo does this inside each operation; the backend
should do it inside the same transaction so the trail cannot be lost on a
partial failure.
