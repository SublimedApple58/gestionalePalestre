import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

// Tagliamo la catena di import server-only (next-auth) non pertinente al badge.
vi.mock("@/app/actions/auth-actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/policies/policy-gate", () => ({ PolicyGate: () => null }));
vi.mock("@/components/sdd/sdd-mandate-gate", () => ({ SddMandateGate: () => null }));

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

describe("AuthenticatedShell · badge Dashboard", () => {
  it("mostra il badge col numero quando dashboardBadge > 0", () => {
    const { container } = render(
      <AuthenticatedShell currentPath="/dashboard" dashboardBadge={3} user={{ firstName: "Mario", role: "ADMIN" }}>
        <div>contenuto</div>
      </AuthenticatedShell>
    );
    const badges = Array.from(container.querySelectorAll(".nav-badge"));
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.some((b) => b.textContent === "3")).toBe(true);
  });

  it("non mostra alcun badge quando dashboardBadge = 0", () => {
    const { container } = render(
      <AuthenticatedShell currentPath="/dashboard" dashboardBadge={0} user={{ firstName: "Mario", role: "ADMIN" }}>
        <div>contenuto</div>
      </AuthenticatedShell>
    );
    expect(container.querySelectorAll(".nav-badge").length).toBe(0);
  });
});
