"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

type MaskedAccessCodeProps = {
  code: string;
  title?: string;
};

export function MaskedAccessCode({ code, title = "Codice ingresso" }: MaskedAccessCodeProps) {
  const [isVisible, setIsVisible] = useState(false);

  const hiddenCode = useMemo(() => "*".repeat(code.length), [code]);

  return (
    <section className="panel access-panel">
      <div>
        <p className="panel-kicker">{title}</p>
        <h3 className="panel-title">Accesso palestra</h3>
      </div>

      <div className="access-code-row">
        <code className={`access-code ${isVisible ? "visible" : "hidden"}`}>
          {isVisible ? code : hiddenCode}
        </code>

        <button
          type="button"
          className="icon-button"
          aria-label={isVisible ? "Nascondi codice" : "Mostra codice"}
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </section>
  );
}
