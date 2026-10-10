import { configDefaults, defineConfig } from 'vitest/config';
import base, { NFR_TESTS } from './vitest.config';
/**
 * `pnpm test:nfr`: the wall-clock NFR suites only, one file at a time, so each budget measures
 * the code under test rather than whatever else the run is doing. See `NFR_TESTS`.
 *
 * Spread rather than `mergeConfig`, which concatenates arrays and would bring the base `include`
 * (and its NFR `exclude`) along.
 */
export default defineConfig({
    ...base,
    test: {
        ...base.test,
        include: NFR_TESTS,
        exclude: configDefaults.exclude,
        fileParallelism: false,
    },
});
