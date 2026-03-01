import { logoutAction } from "@/app/actions/auth-actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="button button-ghost">
        Esci
      </button>
    </form>
  );
}
