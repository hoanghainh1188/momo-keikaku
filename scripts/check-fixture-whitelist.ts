/**
 * AD-24 / AR-41 CI gate (story 5.1): reject any committed Backlog fixture file that
 * carries a field outside the FR-19 whitelist (plus page metadata).
 *
 * Exit 0 on clean fixtures; non-zero naming the first offending path and field.
 *
 * Run: `pnpm fixtures:check-whitelist`
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'fixtures', 'backlog');

/** Page-level metadata keys (not TicketObservation fields). */
const PAGE_KEYS = new Set([
  'scenario',
  'page',
  'observedAtOffsetHours',
  'recordedObservedAt',
  'hoursFieldPresent',
  'complete',
  'tickets',
  'accounts',
]);

/** FR-19 whitelist + AD-6 observation fields. */
const TICKET_KEYS = new Set([
  'trackerIssueId',
  'key',
  'title',
  'statusId',
  'estimateMh',
  'actualMh',
  'assigneeAccountId',
  'createdAt',
  'parentIssueId',
  'issueTypeId',
  'trackerProjectId',
  'attributes',
]);

const ATTRIBUTE_KEYS = new Set(['kind', 'id', 'label']);

const ACCOUNT_KEYS = new Set(['accountId', 'displayName', 'email']);

/** Explicitly banned names — fail even if somehow added to a future allow-list by mistake. */
const BANNED = new Set([
  'description',
  'comment',
  'comments',
  'body',
  'resolved',
  'categoryIds',
  'milestoneIds',
  'raw',
  'payload',
]);

function walkJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkJsonFiles(path));
    else if (name.endsWith('.json')) out.push(path);
  }
  return out;
}

function fail(path: string, message: string): never {
  const rel = relative(ROOT, path);
  console.error(`fixture whitelist: ${rel}: ${message}`);
  process.exit(1);
}

function checkObjectKeys(
  path: string,
  where: string,
  obj: Record<string, unknown>,
  allowed: Set<string>,
): void {
  for (const key of Object.keys(obj)) {
    if (BANNED.has(key)) fail(path, `${where} has banned field "${key}"`);
    if (!allowed.has(key)) fail(path, `${where} has out-of-whitelist field "${key}"`);
  }
}

function checkFile(path: string): void {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(path, `is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(path, 'root must be a JSON object');
  }
  const page = raw as Record<string, unknown>;
  checkObjectKeys(path, 'page', page, PAGE_KEYS);

  if (!Array.isArray(page.tickets)) fail(path, 'tickets must be an array');
  for (let i = 0; i < page.tickets.length; i += 1) {
    const t = page.tickets[i];
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      fail(path, `tickets[${i}] must be an object`);
    }
    const ticket = t as Record<string, unknown>;
    checkObjectKeys(path, `tickets[${i}]`, ticket, TICKET_KEYS);
    if (!Array.isArray(ticket.attributes)) {
      fail(path, `tickets[${i}].attributes must be an array`);
    }
    for (let j = 0; j < ticket.attributes.length; j += 1) {
      const a = ticket.attributes[j];
      if (a === null || typeof a !== 'object' || Array.isArray(a)) {
        fail(path, `tickets[${i}].attributes[${j}] must be an object`);
      }
      checkObjectKeys(path, `tickets[${i}].attributes[${j}]`, a as Record<string, unknown>, ATTRIBUTE_KEYS);
    }
  }

  if (page.accounts !== undefined) {
    if (!Array.isArray(page.accounts)) fail(path, 'accounts must be an array when present');
    for (let i = 0; i < page.accounts.length; i += 1) {
      const a = page.accounts[i];
      if (a === null || typeof a !== 'object' || Array.isArray(a)) {
        fail(path, `accounts[${i}] must be an object`);
      }
      checkObjectKeys(path, `accounts[${i}]`, a as Record<string, unknown>, ACCOUNT_KEYS);
    }
  }
}

const files = walkJsonFiles(FIXTURES);
if (files.length === 0) {
  console.error(`fixture whitelist: no JSON under ${relative(ROOT, FIXTURES)}`);
  process.exit(1);
}

for (const file of files) checkFile(file);
console.log(`fixture whitelist: ok (${files.length} files)`);
