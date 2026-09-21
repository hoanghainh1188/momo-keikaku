/**
 * WHERE NEW IDS COME FROM (ARCHITECTURE-SPINE: "IDs are app-generated UUIDv7").
 *
 * A use case that creates a row asks this port for its id, so the id is known before the insert
 * — the audit record names it as its target in the same transaction — and a test can hand out
 * predictable ids instead of random ones. `packages/adapters` implements it (`uuidV7IdsOn`, on the Clock) and the
 * composition root wires it in; `packages/app` never names a UUID library.
 *
 * The existing demo rows keep their readable ids (`dep-delivery`, `prj-ec2`): the columns are
 * `text`, and nothing here assumes an id is a UUID.
 */
export interface IdGenerator {
  /** A new id, never handed out before. */
  readonly next: () => string;
}
