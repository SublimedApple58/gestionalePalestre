import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { CustomSelect } from "@/components/ui/custom-select";

describe("CustomSelect", () => {
  it("gestisce variante compact con label nascosta e aggiorna il valore inviato nel form", () => {
    render(
      <form>
        <CustomSelect
          name="role"
          label="Ruolo utente"
          options={[
            { value: "ADMIN", label: "Admin" },
            { value: "INSTRUCTOR", label: "Istruttore" },
            { value: "SUBSCRIBER", label: "Iscritto" }
          ]}
          defaultValue="ADMIN"
          compact
          hideLabel
          required
        />
      </form>
    );

    expect(screen.getByText("Ruolo utente")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Ruolo utente" })).toHaveTextContent("Admin");

    const hiddenInput = document.querySelector('input[name="role"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("ADMIN");

    fireEvent.click(screen.getByRole("button", { name: "Ruolo utente" }));
    fireEvent.click(screen.getByRole("button", { name: "Istruttore" }));

    expect(hiddenInput.value).toBe("INSTRUCTOR");
    expect(screen.getByRole("button", { name: "Ruolo utente" })).toHaveTextContent("Istruttore");
  });
});
