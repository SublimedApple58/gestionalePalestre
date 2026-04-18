"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, CreditCard, Info, Lock, Sparkles } from "lucide-react";

import { initiateCheckoutAction } from "@/app/actions/payment-actions";
import {
  type CheckoutTier,
  formatEuroCents,
  tierLabel
} from "@/lib/subscription";

type TierSummary = {
  tier: CheckoutTier;
  oneShotCents: number;
  installments: {
    count: number;
    amountCents: number;
  } | null;
};

type ActiveSubscription = {
  tier: string;
  /** ISO string dell'endsAt per essere serializzabile dal server component. */
  endsAt: string;
};

type CheckoutFormProps = {
  tiers: TierSummary[];
  klarnaEnabled: boolean;
  activeSubscription: ActiveSubscription | null;
};

/** Sottotitolo + feature list per ogni tier — single source of truth lato client. */
const TIER_COPY: Record<
  CheckoutTier,
  { tagline: string; features: string[] }
> = {
  MONTHLY: {
    tagline: "Flessibilità totale, senza vincoli di durata.",
    features: [
      "Accesso sala pesi e cardio",
      "Corsi di gruppo inclusi",
      "Nessun vincolo di durata"
    ]
  },
  YEARLY: {
    tagline: "Il miglior equilibrio tra prezzo e costanza.",
    features: [
      "Tutto del piano mensile",
      "Accesso ai corsi speciali",
      "Blocco del prezzo per 12 mesi"
    ]
  },
  BIENNIAL: {
    tagline: "Il risparmio massimo per chi fa sul serio.",
    features: [
      "Tutto del piano annuale",
      "Piano di allenamento personalizzato",
      "Massimo risparmio totale"
    ]
  }
};

const POPULAR_TIER: CheckoutTier = "YEARLY";

export function CheckoutForm({ tiers, klarnaEnabled, activeSubscription }: CheckoutFormProps) {
  const [selectedTier, setSelectedTier] = useState<CheckoutTier>("YEARLY");
  const [payInInstallments, setPayInInstallments] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const selectedTierData = useMemo(
    () => tiers.find((t) => t.tier === selectedTier)!,
    [tiers, selectedTier]
  );

  const canUseInstallmentsForSelection = useMemo(
    () => klarnaEnabled && Boolean(selectedTierData.installments),
    [klarnaEnabled, selectedTierData]
  );

  const effectivePayMode: "one-shot" | "installments" =
    canUseInstallmentsForSelection && payInInstallments ? "installments" : "one-shot";

  const monthlyPriceCents = tiers.find((t) => t.tier === "MONTHLY")!.oneShotCents;

  function handleTierSelect(tier: CheckoutTier) {
    setSelectedTier(tier);
    // Se il nuovo tier non supporta le rate, ripiega a unica soluzione.
    const tierData = tiers.find((t) => t.tier === tier);
    if (!tierData?.installments) {
      setPayInInstallments(false);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("tier", selectedTier);
    formData.set("installments", effectivePayMode === "installments" ? "true" : "false");
    startTransition(async () => {
      await initiateCheckoutAction(formData);
    });
  }

  const activeEndsAtLabel = activeSubscription
    ? new Date(activeSubscription.endsAt).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      })
    : null;

  return (
    <div className="checkout-container">
      {/* ── Hero / intro ──────────────────────────────────────── */}
      <header className="checkout-hero">
        <p className="checkout-hero-kicker">Abbonamenti</p>
        <h1 className="checkout-hero-title">Scegli il tuo abbonamento</h1>
        <p className="checkout-hero-sub">
          Attiva subito l&apos;accesso alla palestra. Pagamento sicuro con carta,
          {" "}
          {klarnaEnabled
            ? "rate disponibili con Klarna sui piani annuale e biennale."
            : "rate Klarna in arrivo per i piani annuale e biennale."}
        </p>
      </header>

      {/* ── Subscription attuale (opzionale) ──────────────────── */}
      {activeSubscription && activeEndsAtLabel ? (
        <div className="checkout-active-banner" role="status">
          <Info size={16} aria-hidden="true" className="checkout-active-banner-icon" />
          <p className="checkout-active-banner-text">
            Hai già un abbonamento <strong>{tierLabel(activeSubscription.tier as CheckoutTier)}</strong>{" "}
            attivo fino al <strong>{activeEndsAtLabel}</strong>. Rinnovando ora il nuovo
            periodo partirà alla scadenza.
          </p>
        </div>
      ) : null}

      {/* ── Tier cards ────────────────────────────────────────── */}
      <div className="checkout-tiers" role="radiogroup" aria-label="Scegli un piano">
        {tiers.map((t) => {
          const isSelected = t.tier === selectedTier;
          const isPopular = t.tier === POPULAR_TIER;
          const canInstallments = klarnaEnabled && Boolean(t.installments);
          const installmentsPreview = t.installments
            ? `${t.installments.count} × ${formatEuroCents(t.installments.amountCents)}`
            : null;

          const savingsVsMonthly =
            t.tier !== "MONTHLY"
              ? computeSavings(t.oneShotCents, monthlyPriceCents, t.tier)
              : null;

          return (
            <button
              key={t.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`checkout-tier-card ${isSelected ? "selected" : ""} ${
                isPopular ? "popular" : ""
              }`}
              onClick={() => handleTierSelect(t.tier)}
            >
              {isPopular ? (
                <span className="checkout-tier-badge">
                  <Sparkles size={10} aria-hidden="true" />
                  Più scelto
                </span>
              ) : null}

              <p className="checkout-tier-kicker">{tierLabel(t.tier).toUpperCase()}</p>

              <div className="checkout-tier-price">
                <span className="checkout-tier-price-value">
                  {formatEuroCents(t.oneShotCents)}
                </span>
                <span className="checkout-tier-price-unit">
                  {t.tier === "MONTHLY"
                    ? "/ al mese"
                    : t.tier === "YEARLY"
                    ? "/ all'anno"
                    : "/ per 24 mesi"}
                </span>
              </div>

              {savingsVsMonthly ? (
                <p className="checkout-tier-savings">Risparmi {savingsVsMonthly}</p>
              ) : null}

              <p className="checkout-tier-tagline">{TIER_COPY[t.tier].tagline}</p>

              <p className="checkout-tier-installments-label">
                {t.installments
                  ? canInstallments
                    ? `Oppure ${installmentsPreview} con Klarna`
                    : `Rate ${installmentsPreview} — in arrivo con Klarna`
                  : "Rate non disponibili"}
              </p>

              <ul className="checkout-tier-features">
                {TIER_COPY[t.tier].features.map((f) => (
                  <li key={f}>
                    <span className="checkout-tier-feature-icon" aria-hidden="true">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* ── Summary + toggle rate + CTA ───────────────────────── */}
      <section className="checkout-summary" aria-label="Riepilogo e pagamento">
        <div className="checkout-summary-row">
          <div className="checkout-summary-info">
            <p className="checkout-summary-label">Piano selezionato</p>
            <p className="checkout-summary-value">
              {tierLabel(selectedTier)} ·{" "}
              {effectivePayMode === "installments" && selectedTierData.installments
                ? `${selectedTierData.installments.count} × ${formatEuroCents(
                    selectedTierData.installments.amountCents
                  )}`
                : formatEuroCents(selectedTierData.oneShotCents)}
            </p>
          </div>

          {selectedTierData.installments ? (
            <div
              className={`checkout-pay-toggle ${
                canUseInstallmentsForSelection ? "" : "disabled"
              }`}
              role="group"
              aria-label="Modalità di pagamento"
            >
              <button
                type="button"
                className={`checkout-pay-toggle-option ${
                  effectivePayMode === "one-shot" ? "active" : ""
                }`}
                onClick={() => setPayInInstallments(false)}
                aria-pressed={effectivePayMode === "one-shot"}
              >
                Unica soluzione
              </button>
              <button
                type="button"
                className={`checkout-pay-toggle-option ${
                  effectivePayMode === "installments" ? "active" : ""
                }`}
                onClick={() => canUseInstallmentsForSelection && setPayInInstallments(true)}
                disabled={!canUseInstallmentsForSelection}
                aria-pressed={effectivePayMode === "installments"}
                aria-disabled={!canUseInstallmentsForSelection}
              >
                Paga a rate
                {!klarnaEnabled ? (
                  <span className="checkout-pay-toggle-hint">Presto disponibile</span>
                ) : null}
              </button>
            </div>
          ) : null}
        </div>

        <form action={handleSubmit} className="checkout-summary-form">
          <input type="hidden" name="tier" value={selectedTier} />
          <input
            type="hidden"
            name="installments"
            value={effectivePayMode === "installments" ? "true" : "false"}
          />
          <button
            type="submit"
            className="button button-primary checkout-cta"
            disabled={isPending}
          >
            <CreditCard size={16} aria-hidden="true" />
            {isPending ? "Reindirizzamento al pagamento…" : "Vai al pagamento"}
          </button>
        </form>

        <p className="checkout-trust">
          <Lock size={12} aria-hidden="true" />
          Pagamento sicuro — carta tramite SumUp
          {klarnaEnabled ? ", rate con Klarna" : ""}.
        </p>
      </section>
    </div>
  );
}

/**
 * Calcola un risparmio "indicativo" rispetto al piano mensile, utile come badge UX.
 * Non è un claim contrattuale: arrotondiamo per eccesso sui centesimi.
 */
function computeSavings(
  tierCents: number,
  monthlyCents: number,
  tier: CheckoutTier
): string | null {
  const months = tier === "YEARLY" ? 12 : tier === "BIENNIAL" ? 24 : 0;
  if (months === 0) return null;
  const monthlyEquivalent = months * monthlyCents;
  const savings = monthlyEquivalent - tierCents;
  if (savings <= 0) return null;
  return formatEuroCents(savings);
}
