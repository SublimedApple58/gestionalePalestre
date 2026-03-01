import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Esci</button>
}));

describe("AuthenticatedShell", () => {
  it("mostra HOUSE OF MUSCLE e non mostra greeting/ruolo nella sidebar", () => {
    render(
      <AuthenticatedShell
        currentPath="/dashboard"
        user={{ firstName: "Mario", role: "ADMIN" }}
      >
        <div>Contenuto pagina</div>
      </AuthenticatedShell>
    );

    expect(screen.getByRole("heading", { name: "HOUSE OF MUSCLE" })).toBeVisible();
    expect(screen.queryByText(/Ciao/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Contenuto pagina")).toBeVisible();
  });
});
