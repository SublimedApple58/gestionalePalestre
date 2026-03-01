import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { MaskedAccessCode } from "@/components/ui/masked-access-code";

describe("MaskedAccessCode", () => {
  it("nasconde il codice di default e lo mostra dopo il toggle", () => {
    render(<MaskedAccessCode code="123456" />);

    const hiddenCode = screen.getByText("******");
    expect(hiddenCode).toHaveClass("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Mostra codice" }));

    const visibleCode = screen.getByText("123456");
    expect(visibleCode).toHaveClass("visible");

    fireEvent.click(screen.getByRole("button", { name: "Nascondi codice" }));

    expect(screen.getByText("******")).toHaveClass("hidden");
  });
});
