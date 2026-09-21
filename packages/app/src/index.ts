// `packages/app` is the application layer: use cases, ports, RequestContext,
// authorisation, audit and configuration. Inbound adapters (`apps/web`,
// `apps/worker`) may call only what this barrel exposes.
//
// Story 1.2 slice 3 brings the first use cases: the two project reads, the port they depend
// on, and the `Result` they return. Authorisation (1.5), audit (1.3) and the RequestContext
// (1.4) attach to this layer later; none of them exists yet.
//
// `./use-cases` does not import `./config`, so code that needs the use cases and not the
// configuration can import `packages/app/src/use-cases` directly. `config` is lazy (a getter
// per key), so importing this barrel reads no environment either.
//
// The result and port modules cross this barrel as TYPES only. Their runtime helpers — `ok`,
// `fail`, `isProjectNotFound`, the message-key table — are how a use case builds its answer,
// and an inbound adapter that could call them could fabricate one.
export * from './config';
export type { AppError, AppErrorCode, AppErrorMessageKey, Result } from './result';
export type {
  ProjectBundle,
  ProjectReadDeps,
  ProjectReadPort,
  ProjectReview,
} from './ports/project-read';
export * from './use-cases';
export type { UseCaseContext } from './use-cases/context';
export type { ProjectInput } from './use-cases/project-input';
