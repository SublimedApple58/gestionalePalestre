import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// La server action è irrilevante per il render: la mockiamo per evitare import server-only.
vi.mock("@/app/actions/dashboard-actions", () => ({ approveDocumentAction: vi.fn() }));

import { CertificateReviewHero, type CertReviewRow } from "@/components/dashboard/certificate-review-hero";

const row = (over: Partial<CertReviewRow>): CertReviewRow => ({
  documentId: "d1",
  userId: "u1",
  firstName: "Mara",
  lastName: "Rossi",
  uploadedAt: new Date("2026-10-10T09:00:00Z"),
  medicalCertificateExpiresAt: new Date("2027-01-01T00:00:00Z"),
  previewUrl: "https://example.test/cert.pdf",
  photoUrl: null,
  ...over
});

describe("CertificateReviewHero", () => {
  it("non renderizza nulla quando non c'è niente da controllare", () => {
    const { container } = render(<CertificateReviewHero items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra il contatore, i nomi e le azioni quando ci sono certificati", () => {
    render(
      <CertificateReviewHero
        items={[
          row({ documentId: "d1", userId: "u1", firstName: "Mara", lastName: "Rossi" }),
          row({ documentId: "d2", userId: "u2", firstName: "Luca", lastName: "Bianchi" })
        ]}
      />
    );

    expect(screen.getByText("2 certificati medici da controllare")).toBeInTheDocument();
    expect(screen.getByText("Mara Rossi")).toBeInTheDocument();
    expect(screen.getByText("Luca Bianchi")).toBeInTheDocument();
    expect(screen.getAllByText("Segna come controllato")).toHaveLength(2);
    // "Apri certificato" come link all'anteprima firmata
    const open = screen.getAllByRole("link", { name: /Apri certificato/ });
    expect(open[0]).toHaveAttribute("href", "https://example.test/cert.pdf");
  });

  it("limita le righe visibili e indica gli altri in attesa", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      row({ documentId: `d${i}`, userId: `u${i}`, firstName: `Nome${i}`, lastName: "Cognome" })
    );
    render(<CertificateReviewHero items={items} />);

    expect(screen.getByText("6 certificati medici da controllare")).toBeInTheDocument();
    // HERO_LIMIT = 4 → 4 righe + "e altri 2"
    expect(screen.getAllByText("Segna come controllato")).toHaveLength(4);
    expect(screen.getByText(/e altri 2 iscritti/)).toBeInTheDocument();
  });
});
