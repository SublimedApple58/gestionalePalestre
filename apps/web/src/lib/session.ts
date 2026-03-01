import { UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export async function getSessionUser(): Promise<AuthenticatedUser | null> {
  const session = await auth();
  const sessionUser = session?.user;

  if (!sessionUser?.id || !sessionUser.email) {
    return null;
  }

  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.name ?? sessionUser.email,
    role: sessionUser.role ?? UserRole.SUBSCRIBER
  };
}

export async function requireSessionUser(): Promise<AuthenticatedUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(roles: UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireSessionUser();

  if (!roles.includes(user.role)) {
    redirect("/unauthorized");
  }

  return user;
}
