// `packages/app` is the application layer: use cases, ports, RequestContext,
// authorisation, audit and configuration. Inbound adapters (`apps/web`,
// `apps/worker`) may call only what this barrel exposes.
//
// Skeleton: only the configuration port exists so far. Use cases arrive with
// story 1.2 onwards.
export * from './config';
