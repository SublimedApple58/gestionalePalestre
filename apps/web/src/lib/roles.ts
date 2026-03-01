import { UserRole } from "@gestionale/db";

export function roleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN:
      return "Admin";
    case UserRole.INSTRUCTOR:
      return "Istruttore";
    case UserRole.SUBSCRIBER:
      return "Iscritto";
    default:
      return role;
  }
}

export function canManageUsers(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function canViewAssignedStudents(role: UserRole): boolean {
  return role === UserRole.INSTRUCTOR;
}
