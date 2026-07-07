"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { AlertCircle, Check, Lock } from "lucide-react";

import { logoutAction } from "@/app/actions/auth-actions";
import { acceptPolicyAction, getPendingPoliciesAction } from "@/app/actions/policy-actions";
import type { PolicyBlock, PolicyDefinition } from "@/lib/policies";

const BRAND = "#df2531";
const BRAND_DEEP = "#9c1420";
const AMBER = "#f59e0b";

/**
 * Gate BLOCCANTE web generico multi-step. Reso una sola volta dentro
 * `AuthenticatedShell` (ogni pagina autenticata, tutti i ruoli): mostra come step
 * tutte le policy obbligatorie non ancora accettate, con contatore. L'utente deve
 * scorrere il testo, spuntare e accettare ogni step per sbloccare l'app.
 */
export function PolicyGate() {
  const [policies, setPolicies] = useState<PolicyDefinition[] | null>(null);
  const [index, setIndex] = useState(0);
  const [readToEnd, setReadToEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void getPendingPoliciesAction()
      .then((r) => {
        if (active) setPolicies(r);
      })
      .catch(() => {
        // In caso di errore non blocchiamo l'app.
        if (active) setPolicies([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset dello stato di lettura/spunta a ogni cambio step.
  useEffect(() => {
    setReadToEnd(false);
    setChecked(false);
    setError(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [index]);

  if (!policies || policies.length === 0) return null;
  const total = policies.length;
  const policy = policies[index];
  if (!policy) return null;
  const remaining = total - index - 1;

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 12) setReadToEnd(true);
  }

  function handleAccept() {
    // Il narrowing esterno di `policy` non è preservato in questa funzione
    // annidata (noUncheckedIndexedAccess): lo ri-affermiamo qui.
    if (!policy) return;
    if (!readToEnd) return;
    if (!checked) {
      setError("Spunta la casella per continuare.");
      return;
    }
    setError(null);
    const key = policy.key;
    const isLast = index + 1 >= total;
    startTransition(async () => {
      try {
        await acceptPolicyAction(key);
        if (isLast) {
          setPolicies([]); // tutte accettate → sblocca l'app
        } else {
          setIndex((i) => i + 1);
        }
      } catch {
        setError("Errore durante il salvataggio. Riprova.");
      }
    });
  }

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label={policy.title}>
      <div style={S.card}>
        {/* Stepper */}
        <div style={S.stepTop}>
          <span style={S.stepCount}>
            Passaggio <span style={{ color: BRAND }}>{index + 1}</span> di {total}
          </span>
          <span style={S.stepRemaining}>
            {remaining > 0
              ? `Manca ancora ${remaining} passaggio${remaining === 1 ? "" : "i"}`
              : "Ultimo passaggio"}
          </span>
        </div>
        <div style={S.segBar}>
          {policies.map((_, i) => (
            <div
              key={i}
              style={{
                ...S.seg,
                background: i < index ? BRAND : i === index ? "rgba(223,37,49,0.28)" : "rgba(255,255,255,0.1)"
              }}
            >
              {i === index ? <div style={S.segFill} /> : null}
            </div>
          ))}
        </div>

        {/* Header policy */}
        <div style={S.head}>
          {policy.eyebrow ? (
            <span style={S.eyebrow}>
              <Lock size={11} /> {policy.eyebrow}
            </span>
          ) : null}
          <h2 style={S.title}>{policy.title}</h2>
        </div>

        {/* Corpo scrollabile */}
        <div style={S.scroll} ref={scrollRef} onScroll={onScroll}>
          {policy.blocks.map((block, i) => (
            <PolicyBlockView key={i} block={block} />
          ))}
        </div>

        {/* Footer accettazione */}
        <label style={{ ...S.acceptRow, ...(checked ? S.acceptRowOn : null), ...(readToEnd ? null : S.acceptRowLocked) }}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!readToEnd}
            onChange={(e) => {
              setChecked(e.target.checked);
              if (error) setError(null);
            }}
            style={S.checkboxInput}
          />
          <span style={{ ...S.cbox, ...(checked ? S.cboxOn : null) }}>
            {checked ? <Check size={13} color="#fff" /> : null}
          </span>
          <span style={S.acceptTxt}>
            Ho letto e accetto integralmente il contenuto.
          </span>
        </label>

        {error ? (
          <p style={S.error}>
            <AlertCircle size={13} /> {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleAccept}
          disabled={pending || !readToEnd || !checked}
          style={{
            ...S.btn,
            ...(pending || !readToEnd || !checked ? S.btnDisabled : null)
          }}
        >
          {pending ? "Salvataggio…" : index + 1 >= total ? "Accetto e continuo" : "Accetto e prosegui"}
        </button>

        {!readToEnd ? <p style={S.hint}>↓ Scorri fino in fondo per accettare</p> : null}

        <form action={logoutAction} style={{ marginTop: 8 }}>
          <button type="submit" style={S.logout}>Esci</button>
        </form>

        <p style={S.foot}>
          <Lock size={11} /> Passaggio obbligatorio · non puoi saltarlo
        </p>
      </div>
    </div>
  );
}

function PolicyBlockView({ block }: { block: PolicyBlock }) {
  if (block.type === "paragraph") {
    return <p style={S.paragraph}>{block.text}</p>;
  }
  if (block.type === "list") {
    return (
      <div style={{ marginBottom: 14 }}>
        {block.intro ? <p style={{ ...S.paragraph, marginBottom: 8 }}>{block.intro}</p> : null}
        <div style={S.features}>
          {block.items.map((item, i) => (
            <div key={i} style={S.feat}>
              <span style={S.featDot} />
              <span style={S.featTxt}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // callout
  return (
    <div style={S.callout}>
      {block.highlight ? <div style={S.calloutNum}>{block.highlight}</div> : null}
      <p style={S.calloutTxt}>{block.text}</p>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background:
      "radial-gradient(ellipse at 15% -10%, rgba(223,37,49,0.16), transparent 42%)," +
      "radial-gradient(ellipse at 90% 110%, rgba(80,10,20,0.20), transparent 45%)," +
      "rgba(6,6,10,0.94)",
    backdropFilter: "blur(6px)"
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(18,18,26,0.99), rgba(9,9,14,1))",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 20,
    boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset, 0 40px 90px rgba(0,0,0,0.6)",
    padding: 22,
    color: "#f6f6f8",
    fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  stepTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 },
  stepCount: { fontSize: 13, fontWeight: 700 },
  stepRemaining: { fontSize: 11.5, color: "rgba(255,255,255,0.52)" },
  segBar: { display: "flex", gap: 6, marginBottom: 18 },
  seg: { flex: 1, height: 5, borderRadius: 4, position: "relative", overflow: "hidden" },
  segFill: { position: "absolute", inset: 0, width: "55%", background: BRAND },
  head: { marginBottom: 12 },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: BRAND,
    marginBottom: 8
  },
  title: { fontSize: 19, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.01em" },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "4px 2px 4px 0",
    margin: "6px 0 14px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  paragraph: { fontSize: 13, lineHeight: 1.62, color: "rgba(255,255,255,0.74)", marginBottom: 12, paddingTop: 12 },
  features: { display: "flex", flexDirection: "column", gap: 8 },
  feat: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)"
  },
  featDot: { width: 7, height: 7, borderRadius: "50%", background: BRAND, flexShrink: 0 },
  featTxt: { fontSize: 12.5, lineHeight: 1.3, color: "rgba(255,255,255,0.85)" },
  callout: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    margin: "4px 0 14px",
    background: "rgba(245,158,11,0.10)",
    border: "1px solid rgba(245,158,11,0.35)"
  },
  calloutNum: { fontSize: 22, fontWeight: 800, color: AMBER, flexShrink: 0, letterSpacing: "0.02em" },
  calloutTxt: { fontSize: 11.5, lineHeight: 1.42, color: "rgba(255,255,255,0.8)" },
  acceptRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 13px",
    borderRadius: 13,
    marginBottom: 10,
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(255,255,255,0.09)",
    cursor: "pointer",
    position: "relative"
  },
  acceptRowOn: { borderColor: "rgba(223,37,49,0.35)", background: "rgba(223,37,49,0.07)" },
  acceptRowLocked: { opacity: 0.5, cursor: "not-allowed" },
  checkboxInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
  cbox: {
    width: 20,
    height: 20,
    flexShrink: 0,
    borderRadius: 6,
    marginTop: 1,
    border: "1.5px solid rgba(255,255,255,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  cboxOn: { background: BRAND, borderColor: BRAND },
  acceptTxt: { fontSize: 12.5, lineHeight: 1.4, color: "rgba(255,255,255,0.82)" },
  error: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#f87171", marginBottom: 8 },
  btn: {
    width: "100%",
    border: "none",
    borderRadius: 13,
    padding: 15,
    fontFamily: "inherit",
    fontSize: 14.5,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
    background: `linear-gradient(180deg, ${BRAND}, ${BRAND_DEEP})`,
    boxShadow: "0 8px 22px rgba(223,37,49,0.32)"
  },
  btnDisabled: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.35)",
    boxShadow: "none",
    cursor: "not-allowed"
  },
  hint: { textAlign: "center", fontSize: 10.5, color: AMBER, marginTop: 9 },
  logout: {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    padding: 12,
    background: "transparent",
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer"
  },
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.38)",
    marginTop: 10
  }
};
