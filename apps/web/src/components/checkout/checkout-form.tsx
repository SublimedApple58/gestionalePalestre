"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, Info, Lock } from "lucide-react";

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
  endsAt: string;
};

type CheckoutFormProps = {
  tiers: TierSummary[];
  activeSubscription: ActiveSubscription | null;
};

const TIER_DURATION: Record<Exclude<CheckoutTier, "DAILY">, string> = {
  MONTHLY: "1 mese",
  QUARTERLY: "3 mesi",
  YEARLY: "12 mesi",
  BIENNIAL: "24 mesi"
};

type SubscriptionTierKey = Exclude<CheckoutTier, "DAILY">;

export function CheckoutForm({ tiers, activeSubscription }: CheckoutFormProps) {
  const subscriptionTiers = useMemo(
    () => tiers.filter((t): t is TierSummary & { tier: SubscriptionTierKey } => t.tier !== "DAILY"),
    [tiers]
  );
  const dailyTier = useMemo(() => tiers.find((t) => t.tier === "DAILY")!, [tiers]);

  const [selectedTier, setSelectedTier] = useState<SubscriptionTierKey>("YEARLY");
  const [payInInstallments, setPayInInstallments] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedData = useMemo(
    () => subscriptionTiers.find((t) => t.tier === selectedTier)!,
    [subscriptionTiers, selectedTier]
  );

  const hasInstallments = Boolean(selectedData.installments);
  const effectivePayMode: "one-shot" | "installments" =
    hasInstallments && payInInstallments ? "installments" : "one-shot";

  const monthlyPrice = tiers.find((t) => t.tier === "MONTHLY")!.oneShotCents;

  function handleSelect(tier: SubscriptionTierKey) {
    setSelectedTier(tier);
    const data = subscriptionTiers.find((t) => t.tier === tier);
    if (!data?.installments) setPayInInstallments(false);
  }

  function handleSubmit(formData: FormData) {
    formData.set("tier", selectedTier);
    formData.set("installments", effectivePayMode === "installments" ? "true" : "false");
    startTransition(async () => {
      await initiateCheckoutAction(formData);
    });
  }

  function handleDailySubmit(formData: FormData) {
    formData.set("tier", "DAILY");
    formData.set("installments", "false");
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
    <div className="ck">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="ck-header">
        <h1 className="ck-title">Scegli il tuo piano</h1>
        <p className="ck-subtitle">Accesso completo alla palestra. Senza vincoli.</p>
      </header>

      {/* ── Active subscription banner ────────────────────────── */}
      {activeSubscription && activeEndsAtLabel ? (
        <div className="ck-banner">
          <Info size={14} />
          <p>
            Hai un abbonamento <strong>{tierLabel(activeSubscription.tier as CheckoutTier)}</strong>{" "}
            attivo fino al <strong>{activeEndsAtLabel}</strong>. Il nuovo periodo partirà alla scadenza.
          </p>
        </div>
      ) : null}

      {/* ── Subscription tiers ────────────────────────────────── */}
      <div className="ck-plans" role="radiogroup" aria-label="Scegli un piano">
        {subscriptionTiers.map((t) => {
          const isSelected = t.tier === selectedTier;
          const isPopular = t.tier === "YEARLY";
          const savingsPct = computeSavingsPct(t.oneShotCents, monthlyPrice, t.tier);

          return (
            <button
              key={t.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`ck-plan ${isSelected ? "ck-plan--selected" : ""} ${isPopular ? "ck-plan--popular" : ""}`}
              onClick={() => handleSelect(t.tier)}
            >
              <span className="ck-plan-radio">
                {isSelected && <Check size={12} strokeWidth={3} />}
              </span>

              <span className="ck-plan-info">
                <span className="ck-plan-name">
                  {tierLabel(t.tier)}
                  {isPopular && <span className="ck-plan-tag">Consigliato</span>}
                </span>
                <span className="ck-plan-duration">{TIER_DURATION[t.tier]}</span>
              </span>

              <span className="ck-plan-pricing">
                <span className="ck-plan-price">{formatEuroCents(t.oneShotCents)}</span>
                {savingsPct ? (
                  <span className="ck-plan-savings">−{savingsPct}%</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Installments toggle (when available) ──────────────── */}
      {selectedData.installments ? (
        <div className="ck-installments-row">
          <div className="ck-toggle-pill">
            <button
              type="button"
              className={`ck-toggle-opt ${effectivePayMode === "one-shot" ? "ck-toggle-opt--active" : ""}`}
              onClick={() => setPayInInstallments(false)}
            >
              Unica soluzione
            </button>
            <button
              type="button"
              className={`ck-toggle-opt ${effectivePayMode === "installments" ? "ck-toggle-opt--active" : ""}`}
              onClick={() => setPayInInstallments(true)}
            >
              {selectedData.installments.count} rate da {formatEuroCents(selectedData.installments.amountCents)}
            </button>
          </div>
          {effectivePayMode === "installments" && (
            <p className="ck-installments-note">
              Prima rata addebitata subito. Le successive ogni mese in automatico.
            </p>
          )}
        </div>
      ) : null}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <form action={handleSubmit} className="ck-cta-form">
        <input type="hidden" name="tier" value={selectedTier} />
        <input type="hidden" name="installments" value={effectivePayMode === "installments" ? "true" : "false"} />

        <button type="submit" className="button button-primary ck-cta" disabled={isPending}>
          {isPending ? (
            "Reindirizzamento…"
          ) : (
            <>
              Abbonati — {effectivePayMode === "installments" && selectedData.installments
                ? formatEuroCents(selectedData.installments.amountCents)
                : formatEuroCents(selectedData.oneShotCents)}
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="ck-trust">
          <Lock size={11} />
          Pagamento sicuro via SumUp · Nessun rinnovo automatico
        </p>
      </form>

      {/* ── Daily pass (separate) ─────────────────────────────── */}
      <div className="ck-daily">
        <div className="ck-daily-info">
          <span className="ck-daily-label">Pass giornaliero</span>
          <span className="ck-daily-price">{formatEuroCents(dailyTier.oneShotCents)}</span>
        </div>
        <form action={handleDailySubmit}>
          <input type="hidden" name="tier" value="DAILY" />
          <input type="hidden" name="installments" value="false" />
          <button type="submit" className="ck-daily-btn" disabled={isPending}>
            Acquista
          </button>
        </form>
      </div>
    </div>
  );
}

function computeSavingsPct(
  tierCents: number,
  monthlyCents: number,
  tier: SubscriptionTierKey
): number | null {
  const months =
    tier === "QUARTERLY" ? 3 : tier === "YEARLY" ? 12 : tier === "BIENNIAL" ? 24 : 0;
  if (months <= 1) return null;
  const equivalent = months * monthlyCents;
  if (equivalent <= 0) return null;
  const savings = equivalent - tierCents;
  if (savings <= 0) return null;
  return Math.round((savings / equivalent) * 100);
}
