import type { ReactNode } from 'react';
import { SignOut } from '@/components/sign-out';
import { signInState } from '@/server/composition';
import './globals.css';

export const metadata = {
  title: 'momo-keikaku',
  description: 'Plan, work done and the numbers, in agreement.',
};

/**
 * The root layout. It reads the NON-redirecting sign-in state (story 1.4 slice 1) — only to show
 * the sign-out control — and never the redirecting resolver: it wraps `/sign-in` and `/no-access`
 * too, and a redirect from here would loop. The resolution is shared with the page through React
 * `cache()`, so the request still resolves once.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = (await signInState()) !== 'signed_out';

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
        {signedIn ? <SignOut /> : null}
        {children}
      </body>
    </html>
  );
}
