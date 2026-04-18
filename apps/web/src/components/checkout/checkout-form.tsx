"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, Info, Lock, Sparkles } from "lucide-react";

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

/**
 * Copy onesta per ogni tier: SOLO fatti veri sul prodotto — durata + accesso.
 * Nessun claim di servizi inventati (niente "corsi di gruppo", "personal trainer",
 * "schede personalizzate"): quelle cose le aggiunge l'admin o l'istruttore, non
 * dipendono dal tipo di abbonamento.
 */
const TIER_COPY: Record<CheckoutTier, { durationLabel: string; unitLabel: string }> = {
  MONTHLY: { durationLabel: "Durata 1 mese", unitLabel: "al mese" },
  YEARLY: { durationLabel: "Durata 12 mesi", unitLabel: "all'anno" },
  BIENNIAL: { durationLabel: "Durata 24 mesi", unitLabel: "per 24 mesi" }
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

  const summaryAmountLabel =
    effectivePayMode === "installments" && selectedTierData.installments
      ? `${selectedTierData.installments.count} × ${formatEuroCents(
          selectedTierData.installments.amountCents
        )}`
      : formatEuroCents(selectedTierData.oneShotCents);

  return (
    <div className="checkout-container">
      {/* ── Hero / intro ─────────────────────────────────────────── */}
      <header className="checkout-hero">
        <p className="checkout-hero-kicker">Abbonamento</p>
        <h1 className="checkout-hero-title">Scegli il tuo piano</h1>
        <p className="checkout-hero-sub">
          Paga una volta, rinnova quando ti pare. Nessun rinnovo automatico.
        </p>
      </header>

      {/* ── Banner abbonamento già attivo (rinnovo) ──────────────── */}
      {activeSubscription && activeEndsAtLabel ? (
        <div className="checkout-active-banner" role="status">
          <Info size={16} aria-hidden="true" className="checkout-active-banner-icon" />
          <p className="checkout-active-banner-text">
            Hai un abbonamento <strong>{tierLabel(activeSubscription.tier as CheckoutTier)}</strong>{" "}
            attivo fino al <strong>{activeEndsAtLabel}</strong>. Rinnovando ora il nuovo
            periodo partirà alla scadenza.
          </p>
        </div>
      ) : null}

      {/* ── Tier cards ───────────────────────────────────────────── */}
      <div className="checkout-tiers" role="radiogroup" aria-label="Scegli un piano">
        {tiers.map((t) => {
          const isSelected = t.tier === selectedTier;
          const isPopular = t.tier === POPULAR_TIER;
          const installmentsPreview = t.installments
            ? `${t.installments.count} × ${formatEuroCents(t.installments.amountCents)}`
            : null;
          const savingsPct =
            t.tier !== "MONTHLY"
              ? computeSavingsPct(t.oneShotCents, monthlyPriceCents, t.tier)
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

              <div className="checkout-tier-head">
                <p className="checkout-tier-kicker">{tierLabel(t.tier).toUpperCase()}</p>
                {savingsPct ? (
                  <span className="checkout-tier-savings-chip">−{savingsPct}%</span>
                ) : null}
              </div>

              <div className="checkout-tier-price">
                <span className="checkout-tier-price-value">
                  {formatEuroCents(t.oneShotCents)}
                </span>
                <span className="checkout-tier-price-unit">{TIER_COPY[t.tier].unitLabel}</span>
              </div>

              {installmentsPreview ? (
                <p className="checkout-tier-installments-label">
                  oppure {installmentsPreview}
                </p>
              ) : (
                <p className="checkout-tier-installments-label-empty">&nbsp;</p>
              )}

              <ul className="checkout-tier-features">
                <li>
                  <span className="checkout-tier-feature-icon" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span>Accesso illimitato alla palestra</span>
                </li>
                <li>
                  <span className="checkout-tier-feature-icon" aria-hidden="true">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span>{TIER_COPY[t.tier].durationLabel}</span>
                </li>
              </ul>

              <span className="checkout-tier-select-hint">
                {isSelected ? "Selezionato" : "Seleziona"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Summary + toggle rate + CTA ──────────────────────────── */}
      <section className="checkout-summary" aria-label="Riepilogo e pagamento">
        <div className="checkout-summary-row">
          <div className="checkout-summary-info">
            <p className="checkout-summary-label">Stai acquistando</p>
            <p className="checkout-summary-value">
              {tierLabel(selectedTier)} · {summaryAmountLabel}
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
            {isPending ? "Reindirizzamento al pagamento…" : "Vai al pagamento"}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>

        <p className="checkout-trust">
          <Lock size={12} aria-hidden="true" />
          Pagamento sicuro gestito da SumUp.
        </p>
      </section>
    </div>
  );
}

/**
 * Calcola la percentuale di sconto rispetto al costo mensile equivalente.
 * Esempio: YEARLY = 450€ vs 12×70€ = 840€ → −46%.
 * Usata come "chip" visivo sulle card annuale/biennale.
 */
function computeSavingsPct(
  tierCents: number,
  monthlyCents: number,
  tier: CheckoutTier
): number | null {
  const months = tier === "YEARLY" ? 12 : tier === "BIENNIAL" ? 24 : 0;
  if (months === 0) return null;
  const monthlyEquivalent = months * monthlyCents;
  if (monthlyEquivalent <= 0) return null;
  const savings = monthlyEquivalent - tierCents;
  if (savings <= 0) return null;
  return Math.round((savings / monthlyEquivalent) * 100);
}
