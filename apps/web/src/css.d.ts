// TypeScript 6 defaults `noUncheckedSideEffectImports: true`, and Next's own types
// declare no module for `*.css`. `apps/web/src/app/layout.tsx` imports `./globals.css`
// for its side effect only, so without this declaration typecheck fails on TS2882.
// Declaring the module is preferred over relaxing the compiler flag: the flag still
// catches every *other* unresolvable side-effect import in the tree.
//
// The body is empty ON PURPOSE, and `{}` is not the same as the `declare module '*.css';`
// shorthand. The shorthand types the module as implicit `any`, which would let
// `import styles from './x.css'` through and assign it to anything — the precision this
// file exists to preserve, thrown away. An empty body keeps the side-effect import legal
// while making any *value* import an error. If CSS Modules ever arrive here, give this a
// real typed export rather than reaching for the shorthand.
declare module '*.css' {}
