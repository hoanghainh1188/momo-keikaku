/**
 * Inputs for Connector write use cases (story 5.2 / FR-17).
 * Internal to `use-cases/` — not re-exported from the barrel.
 */
import { z } from 'zod';

const noNul = (value: string) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';
const id = z.string().min(1).refine(noNul, NUL_MESSAGE);
const prose = z
  .string()
  .refine((value) => value.trim().length > 0, 'must not be blank')
  .refine(noNul, NUL_MESSAGE);

/** Absolute http(s) Backlog space URL — host becomes `connector.site`. */
function parseSpaceUrl(
  raw: string,
): { ok: true; site: string; spaceLabel: string } | { ok: false; message: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, message: 'must be an absolute http(s) URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'must be an absolute http(s) URL' };
  }
  const site = url.hostname;
  if (!site) {
    return { ok: false, message: 'must include a host' };
  }
  return { ok: true, site, spaceLabel: site };
}

export const addConnectorInputSchema = z
  .object({
    projectId: id,
    spaceUrl: prose,
    apiKey: prose,
    projectKey: prose,
    approvalName: prose,
    /** ISO instant or Date; client-side approval when. */
    approvalRecordedAt: z.union([z.string().min(1), z.date()]),
  })
  .transform((value, ctx) => {
    const parsed = parseSpaceUrl(value.spaceUrl);
    if (!parsed.ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['spaceUrl'],
        message: parsed.message,
      });
      return z.NEVER;
    }
    const at =
      value.approvalRecordedAt instanceof Date
        ? value.approvalRecordedAt
        : new Date(value.approvalRecordedAt);
    if (Number.isNaN(at.getTime())) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvalRecordedAt'],
        message: 'must be an absolute ISO-8601 instant',
      });
      return z.NEVER;
    }
    return {
      projectId: value.projectId,
      spaceUrl: value.spaceUrl.trim(),
      apiKey: value.apiKey,
      projectKey: value.projectKey.trim(),
      approvalName: value.approvalName.trim(),
      approvalRecordedAt: at,
      site: parsed.site,
      spaceLabel: parsed.spaceLabel,
    };
  });

export const rotateCredentialsInputSchema = z.object({
  projectId: id,
  connectorId: id,
  apiKey: prose,
});

export const changeScopeInputSchema = z.object({
  projectId: id,
  connectorId: id,
  projectKey: prose,
});

/** Story 5.6: PM Keep (affirm owner) or Transfer (move owner_connector_id). */
export const confirmOwnershipInputSchema = z.object({
  projectId: id,
  trackerIssueId: id,
  resolution: z.enum(['keep', 'transfer']),
  /** Claimer Connector on the open overlap row being resolved. */
  claimerConnectorId: id,
});

/** Caller-facing input (pre-transform). The schema adds `site` / `spaceLabel` internally. */
export type AddConnectorInput = Readonly<z.input<typeof addConnectorInputSchema>>;
export type RotateCredentialsInput = Readonly<z.infer<typeof rotateCredentialsInputSchema>>;
export type ChangeScopeInput = Readonly<z.infer<typeof changeScopeInputSchema>>;
export type ConfirmOwnershipInput = Readonly<z.infer<typeof confirmOwnershipInputSchema>>;

/** Story 5.7: tests/API-only Resolved set writer (no PM form). */
export const appendResolvedStatusesInputSchema = z.object({
  projectId: id,
  connectorId: id,
  resolvedStatusIds: z.array(prose).min(1),
});

export type AppendResolvedStatusesInput = z.infer<typeof appendResolvedStatusesInputSchema>;
