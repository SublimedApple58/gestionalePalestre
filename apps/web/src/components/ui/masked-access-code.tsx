"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

type MaskedAccessCodeProps = {
  code: string;
  title?: string;
};

export function MaskedAccessCode({ code, title = "Codice ingresso" }: MaskedAccessCodeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const hiddenCode = useMemo(() => "*".repeat(code.length), [code]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  return (
    <section className="panel access-panel">
      <div>
        <p className="panel-kicker">{title}</p>
        <h3 className="panel-title">Accesso palestra</h3>
      </div>

      <div className="access-code-row">
        <code className={`access-code ${isVisible ? "visible" : "hidden"}`} aria-label="Codice di accesso">
          {isVisible ? code : hiddenCode}
        </code>

        <button
          type="button"
          className="icon-button"
          aria-label={isVisible ? "Nascondi codice" : "Mostra codice"}
          onClick={() => setIsVisible((v) => !v)}
        >
          {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        <button
          type="button"
          className="icon-button"
          aria-label="Copia codice"
          onClick={handleCopy}
        >
          <Copy size={18} />
        </button>
      </div>

      {copied ? <p className="copy-success">Codice copiato!</p> : null}
    </section>
  );
}
