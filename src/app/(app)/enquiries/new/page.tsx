"use client";

/**
 * Enquiry registration form.
 *
 * Required fields are limited to what the business genuinely needs to open an
 * enquiry — client, contact, project title, location, scope, deadline. No
 * speculative mandatory fields are invented.
 *
 * On success the enquiry is added to the demo store with a readable reference
 * (ENQ-YYYY-NNNN) continuing the seeded sequence, and appears immediately in
 * the register, the pursuit queue and the dashboards.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Paperclip, Trash2 } from "lucide-react";

import {
  BID_SUBMISSION_TYPES,
  BID_SUBMISSION_TYPE_LABELS,
  ENQUIRY_SOURCES,
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  SOURCE_LABELS,
  TENDER_DOC_CATEGORIES,
  TENDER_DOC_CATEGORY_LABELS,
  type BidSubmissionType,
  type EnquirySource,
  type Priority,
  type ProjectType,
  type TenderDocCategory,
} from "@/domain/enums";
import { parseNumericInput } from "@/lib/money";
import { addDays, todayIso } from "@/lib/dates";
import { useRepository } from "@/services/mock/mockRepository";
import { useDb } from "@/store/useDemoStore";
import { contactsForClient } from "@/store/selectors";
import {
  Badge,
  Button,
  Callout,
  IconButton,
  Panel,
  PanelFooter,
  PanelHeader,
} from "@/components/ui/primitives";
import {
  Checkbox,
  Field,
  FieldGrid,
  FilePicker,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR, TableEmptyRow, TableWrap } from "@/components/ui/table";
import { RoleGate, useAction } from "@/components/workflow/shared";

interface DraftDocument {
  key: string;
  name: string;
  category: TenderDocCategory;
  fileName: string;
  fileSizeLabel: string;
}

export default function NewEnquiryPage() {
  const db = useDb();
  const repo = useRepository();
  const router = useRouter();
  const { run, busy, errors } = useAction();

  const [clientId, setClientId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [newClientName, setNewClientName] = React.useState("");
  const [newContactName, setNewContactName] = React.useState("");
  const [newContactJobTitle, setNewContactJobTitle] = React.useState("");
  const [newContactEmail, setNewContactEmail] = React.useState("");
  const [newContactPhone, setNewContactPhone] = React.useState("");

  const [projectTitle, setProjectTitle] = React.useState("");
  const [projectTypes, setProjectTypes] = React.useState<ProjectType[]>(["CIVIL_CONSTRUCTION"]);
  const [projectLocation, setProjectLocation] = React.useState("");
  const [scopeOfWork, setScopeOfWork] = React.useState("");

  const [source, setSource] = React.useState<EnquirySource>("DIRECT_INVITATION");
  const [sourceReference, setSourceReference] = React.useState("");

  const [bidSubmissionType, setBidSubmissionType] = React.useState<BidSubmissionType>("EMAIL");
  const [submissionDeadline, setSubmissionDeadline] = React.useState(addDays(todayIso(), 21));
  const [estimatedValue, setEstimatedValue] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [notes, setNotes] = React.useState("");

  const [documents, setDocuments] = React.useState<DraftDocument[]>([]);
  const [docName, setDocName] = React.useState("");
  const [docCategory, setDocCategory] = React.useState<TenderDocCategory>("INVITATION");
  const [docFileName, setDocFileName] = React.useState("");
  const [docFileSize, setDocFileSize] = React.useState("—");

  const contacts = contactsForClient(db, clientId);
  const isNewClient = clientId === "__new__";

  // Default to the client's first contact without an effect: the value is
  // derived here and reset in the client select's own handler.
  const effectiveContactId =
    contactId && contacts.some((contact) => contact.id === contactId) ? contactId : (contacts[0]?.id ?? "");

  function addDocument() {
    const name = docName.trim() || docFileName.trim();
    if (!name) return;
    setDocuments((current) => [
      ...current,
      {
        key: `${name}-${current.length}`,
        name,
        category: docCategory,
        fileName: docFileName.trim() || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`,
        fileSizeLabel: docFileSize,
      },
    ]);
    setDocName("");
    setDocFileName("");
    setDocFileSize("—");
  }

  async function submit() {
    const result = await run(() =>
      repo.createEnquiry({
        clientId,
        contactId: effectiveContactId,
        newClientName,
        newContactName,
        newContactJobTitle,
        newContactEmail,
        newContactPhone,
        projectTitle,
        projectTypes,
        projectLocation,
        scopeOfWork,
        source,
        sourceReference,
        bidSubmissionType,
        submissionDeadline,
        estimatedValue: estimatedValue ? parseNumericInput(estimatedValue) : undefined,
        priority,
        notes,
        documents: documents.map(({ name, category, fileName, fileSizeLabel }) => ({
          name,
          category,
          fileName,
          fileSizeLabel,
        })),
      }),
    );
    if (result.ok && "enquiryId" in result && result.enquiryId) {
      router.push(`/enquiries/${result.enquiryId}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <RoleGate allow={["CRM_MANAGER", "MCP", "MD", "ESTIMATOR"]} what="Enquiry registration">
        <Panel>
          <PanelHeader
            icon={<FilePlus2 />}
            title="Register a new enquiry"
            description="The enquiry reference is generated automatically and continues the existing numbering sequence."
            actions={<Badge tone="neutral">Shared across devices</Badge>}
          />

          <FormSection
            title="Client and contact"
            description="Choose an existing client, or register a new one inline."
          >
            <FieldGrid>
              <Field label="Client" htmlFor="client" required error={errors.clientId || errors.newClientName}>
                <Select
                  id="client"
                  value={clientId}
                  invalid={Boolean(errors.clientId || errors.newClientName)}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Select a client…</option>
                  {db.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                  <option value="__new__">+ New client…</option>
                </Select>
              </Field>

              {isNewClient ? (
                <Field label="New client name" htmlFor="new-client" required error={errors.newClientName}>
                  <Input
                    id="new-client"
                    value={newClientName}
                    invalid={Boolean(errors.newClientName)}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Registered company name"
                  />
                </Field>
              ) : (
                <Field label="Contact" htmlFor="contact" required error={errors.contactId}>
                  <Select
                    id="contact"
                    value={effectiveContactId}
                    invalid={Boolean(errors.contactId)}
                    disabled={!clientId}
                    onChange={(event) => setContactId(event.target.value)}
                  >
                    <option value="">Select a contact…</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name} — {contact.jobTitle}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </FieldGrid>

            {isNewClient ? (
              <FieldGrid cols={2} >
                <Field label="Contact name" htmlFor="new-contact" required error={errors.newContactName}>
                  <Input
                    id="new-contact"
                    value={newContactName}
                    invalid={Boolean(errors.newContactName)}
                    onChange={(event) => setNewContactName(event.target.value)}
                  />
                </Field>
                <Field label="Job title" htmlFor="new-contact-title">
                  <Input
                    id="new-contact-title"
                    value={newContactJobTitle}
                    onChange={(event) => setNewContactJobTitle(event.target.value)}
                  />
                </Field>
                <Field label="Email" htmlFor="new-contact-email">
                  <Input
                    id="new-contact-email"
                    type="email"
                    value={newContactEmail}
                    onChange={(event) => setNewContactEmail(event.target.value)}
                  />
                </Field>
                <Field label="Phone" htmlFor="new-contact-phone">
                  <Input
                    id="new-contact-phone"
                    value={newContactPhone}
                    onChange={(event) => setNewContactPhone(event.target.value)}
                  />
                </Field>
              </FieldGrid>
            ) : null}
          </FormSection>

          <FormSection title="Project information">
            <FieldGrid>
              <Field label="Project title" htmlFor="title" required error={errors.projectTitle}>
                <Input
                  id="title"
                  value={projectTitle}
                  invalid={Boolean(errors.projectTitle)}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  placeholder="e.g. Warehouse 7 — Electrical Upgrade"
                />
              </Field>
              <Field
                label="Project type"
                required
                error={errors.projectTypes}
                hint="Select every discipline the package covers. The starter BOQ and the survey checklist are built from the combination."
              >
                <div
                  role="group"
                  aria-label="Project type"
                  className="grid gap-x-4 gap-y-1.5 rounded-control border border-ink-300 bg-white p-2.5 sm:grid-cols-2"
                >
                  {PROJECT_TYPES.map((item) => (
                    <Checkbox
                      key={item}
                      id={`type-${item}`}
                      label={PROJECT_TYPE_LABELS[item]}
                      checked={projectTypes.includes(item)}
                      onChange={(checked) =>
                        setProjectTypes((current) =>
                          checked
                            ? // Keep the canonical order so the label reads the
                              // same however the boxes were ticked.
                              PROJECT_TYPES.filter((type) => type === item || current.includes(type))
                            : current.filter((type) => type !== item),
                        )
                      }
                    />
                  ))}
                </div>
              </Field>
              <Field label="Project location" htmlFor="location" required error={errors.projectLocation}>
                <Input
                  id="location"
                  value={projectLocation}
                  invalid={Boolean(errors.projectLocation)}
                  onChange={(event) => setProjectLocation(event.target.value)}
                  placeholder="Area, city"
                />
              </Field>
              <Field
                label="Expected value"
                htmlFor="value"
                hint="Optional. Used for pipeline reporting until the BOQ is priced."
              >
                <Input
                  id="value"
                  inputMode="decimal"
                  value={estimatedValue}
                  onChange={(event) => setEstimatedValue(event.target.value)}
                  placeholder="AED"
                />
              </Field>
            </FieldGrid>

            <div className="mt-3.5">
              <Field label="Scope of work" htmlFor="scope" required error={errors.scopeOfWork}>
                <Textarea
                  id="scope"
                  rows={4}
                  value={scopeOfWork}
                  invalid={Boolean(errors.scopeOfWork)}
                  onChange={(event) => setScopeOfWork(event.target.value)}
                  placeholder="What the client is asking for, in enough detail for the Management Team to take a pursuit decision."
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Enquiry source and submission">
            <FieldGrid>
              <Field label="Source" htmlFor="source" required>
                <Select id="source" value={source} onChange={(event) => setSource(event.target.value as EnquirySource)}>
                  {ENQUIRY_SOURCES.map((item) => (
                    <option key={item} value={item}>
                      {SOURCE_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source reference" htmlFor="source-ref" hint="Tender number or client reference.">
                <Input
                  id="source-ref"
                  value={sourceReference}
                  onChange={(event) => setSourceReference(event.target.value)}
                  placeholder="e.g. EWPU/T/2026/0442"
                />
              </Field>
              <Field label="Bid submission type" htmlFor="submission-type" required>
                <Select
                  id="submission-type"
                  value={bidSubmissionType}
                  onChange={(event) => setBidSubmissionType(event.target.value as BidSubmissionType)}
                >
                  {BID_SUBMISSION_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {BID_SUBMISSION_TYPE_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Submission deadline" htmlFor="deadline" required error={errors.submissionDeadline}>
                <Input
                  id="deadline"
                  type="date"
                  value={submissionDeadline}
                  invalid={Boolean(errors.submissionDeadline)}
                  onChange={(event) => setSubmissionDeadline(event.target.value)}
                />
              </Field>
              <Field label="Initial priority" htmlFor="priority" required>
                <Select id="priority" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                  {PRIORITIES.map((item) => (
                    <option key={item} value={item}>
                      {PRIORITY_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection
            title="Tender documents"
            description="List the documents received. Metadata only — this demo does not upload or store files."
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
              <Field label="Document name" htmlFor="doc-name">
                <Input
                  id="doc-name"
                  value={docName}
                  onChange={(event) => setDocName(event.target.value)}
                  placeholder="e.g. Invitation to Tender"
                />
              </Field>
              <Field label="Category" htmlFor="doc-category">
                <Select
                  id="doc-category"
                  value={docCategory}
                  onChange={(event) => setDocCategory(event.target.value as TenderDocCategory)}
                >
                  {TENDER_DOC_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {TENDER_DOC_CATEGORY_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="secondary" icon={<Paperclip />} onClick={addDocument} disabled={!docName.trim() && !docFileName.trim()}>
                Add to list
              </Button>
            </div>

            <div className="mt-2.5">
              <FilePicker
                id="tender-doc-file"
                label={docFileName ? `Selected: ${docFileName}` : "Select a file (optional)"}
                onPick={({ fileName, fileSizeLabel }) => {
                  setDocFileName(fileName);
                  setDocFileSize(fileSizeLabel);
                  if (!docName.trim()) setDocName(fileName.replace(/\.[^.]+$/, ""));
                }}
              />
            </div>

            <div className="mt-3">
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>Document</TH>
                      <TH width="12rem">Category</TH>
                      <TH width="16rem">File</TH>
                      <TH width="4rem" align="right" />
                    </TR>
                  </THead>
                  <TBody>
                    {documents.length === 0 ? (
                      <TableEmptyRow colSpan={4}>
                        No documents listed yet. An enquiry can be registered without them.
                      </TableEmptyRow>
                    ) : null}
                    {documents.map((doc, index) => (
                      <TR key={doc.key}>
                        <TD className="font-medium text-ink-800">{doc.name}</TD>
                        <TD>{TENDER_DOC_CATEGORY_LABELS[doc.category]}</TD>
                        <TD>
                          <span className="block truncate font-mono text-2xs text-ink-500">{doc.fileName}</span>
                          <span className="text-2xs text-ink-400">{doc.fileSizeLabel}</span>
                        </TD>
                        <TD align="right">
                          <IconButton
                            label={`Remove ${doc.name}`}
                            onClick={() => setDocuments((current) => current.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="text-bad-600" />
                          </IconButton>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            </div>
          </FormSection>

          <FormSection title="Notes">
            <Field label="Internal notes" htmlFor="notes" hint="Anything the Management Team should know before the pursuit decision.">
              <Textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </FormSection>

          <PanelFooter className="justify-between">
            <p className="text-2xs text-ink-500">
              The enquiry will enter the <span className="font-medium">Pursuit Decision</span> stage for the
              Management Team.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => router.push("/enquiries")} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" icon={<FilePlus2 />} onClick={submit} disabled={busy}>
                Register enquiry
              </Button>
            </div>
          </PanelFooter>
        </Panel>
      </RoleGate>

      <Callout tone="neutral">
        Records you create are saved to the shared workspace, so they appear on every signed-in device. Clearing
        them from the user menu clears them everywhere, not just here.
      </Callout>
    </div>
  );
}
