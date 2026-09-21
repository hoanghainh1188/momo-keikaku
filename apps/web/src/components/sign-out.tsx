import { signOutAction } from '@/app/sign-in/actions';

/** The sign-out control (story 1.4 slice 1): a form, so it works before any script has loaded. */
export function SignOut() {
  return (
    <form action={signOutAction} className="signout">
      <button type="submit" className="btn">
        Sign out
      </button>
    </form>
  );
}
