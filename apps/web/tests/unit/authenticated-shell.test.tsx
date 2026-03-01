import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("espone controllo drawer mobile con toggle checkbox", () => {
    render(
      <AuthenticatedShell
        currentPath="/dashboard"
        user={{ firstName: "Mario", role: "ADMIN" }}
      >
        <div>Contenuto pagina</div>
      </AuthenticatedShell>
    );

    const toggle = document.getElementById("sidebar-toggle") as HTMLInputElement;
    expect(toggle).not.toBeChecked();

    fireEvent.click(screen.getByLabelText("Apri menu laterale"));
    expect(toggle).toBeChecked();

    fireEvent.click(screen.getByLabelText("Chiudi menu laterale"));
    expect(toggle).not.toBeChecked();
  });
});
