import type { ReactNode } from 'react';
import { SignOut } from '@/components/sign-out';
import { signInState } from '@/server/composition';
import './globals.css';

export const metadata = {
  title: 'momo-keikaku',
  description: 'Plan, work done and the numbers, in agreement.',
};

/**
 * EVERY PAGE IS RENDERED ON DEMAND, stated here rather than inferred. This layout wraps all of
 * them and reads the session, so none can be prerendered — and Next agrees: the build marks every
 * route `ƒ (Dynamic)` on its own. But it only learns that by RENDERING the layout during the
 * build, and this layout reaches the composition root's configuration getters first, so without
 * `APP_DATABASE_URL` in the environment `next build` fails on `/_not-found` instead of bailing out
 * to dynamic. That made the composition root's own promise — importing it reads no configuration,
 * so `next build` needs no database and no secret — false in the one place it is supposed to hold.
 * Declaring it up front means the build never attempts the prerender that reads config.
 */
export const dynamic = 'force-dynamic';

/**
 * The root layout. It reads the NON-redirecting sign-in state (story 1.4 slice 1) — only to show
 * the sign-out control — and never the redirecting resolver: it wraps `/sign-in` and `/no-access`
 * too, and a redirect from here would loop. The resolution is shared with the page through React
 * `cache()`, so the request still resolves once.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  // A rejected read must not take the app down. This layout wraps `/sign-in` too, so letting the
  // rejection through would 500 the one page that could get the user back in — a session store
  // that blinks would lock everybody out rather than sign them out. The control simply does not
  // render; the middleware and `requestContext()` remain the authority on who is signed in.
  const signedIn = await signInState().then((state) => state !== 'signed_out', () => false);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        {children}
        {/* AFTER the content in DOM order, though `position: fixed` puts it top-right either way.
            Rendered first it was the first focusable element on every signed-in page, so a
            keyboard or screen-reader user met a destructive action before any content. */}
        {signedIn ? <SignOut /> : null}
      </body>
    </html>
  );
}
