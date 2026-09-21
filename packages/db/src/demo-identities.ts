/**
 * THE DEMO TENANT'S PEOPLE (story 1.4 slice 1, founder decision 2026-09-21): the PM `linh` and
 * the Tenant Admin `hoang`, with fixed UUIDv7 ids so the seeded audit history can name them —
 * `user:<id>`, the same actor form every audited write stamps from its `RequestContext`.
 *
 * Plain data, no Drizzle: the fixture builder (`fixtures.ts`) reads the actor from here, and the
 * seed (`seed.ts`) writes the users, their credential accounts and their memberships from it.
 * There is no provisioning script yet; these two are the only people until slice 2's membership
 * writes exist. Their password comes from the required `SEED_DEMO_PASSWORD`, hashed by
 * `scripts/seed.ts` through `@momo/db-auth` — never stored here.
 *
 * The ids are valid UUIDv7s (version nibble 7, variant 8) minted once for 2026-01-01T00:00Z, so
 * they sort before anything the id port mints at run time.
 */
export interface DemoUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** The membership role in the demo Tenant. */
  readonly role: 'pm' | 'tenant_admin';
  /** True when the membership names the demo Project (a PM's); a Tenant Admin's names none. */
  readonly onDemoProject: boolean;
}

export const DEMO_USERS = {
  linh: {
    id: '019b76da-a800-7000-8000-051111111111',
    email: 'linh@momo-digital.example',
    name: 'Nguyen Thi Linh',
    role: 'pm',
    onDemoProject: true,
  },
  hoang: {
    id: '019b76da-a800-7000-8000-0a2222222222',
    email: 'hoang@momo-digital.example',
    name: 'Hoang Hai',
    role: 'tenant_admin',
    onDemoProject: false,
  },
} as const satisfies Record<string, DemoUser>;

/** The audit actor for a user id — the one form, shared with `packages/app`'s audited writes. */
export function actorOf(userId: string): string {
  return `user:${userId}`;
}
