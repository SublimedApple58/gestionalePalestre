"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Check, Crown, FileText, Info, Lock } from "lucide-react";

import { initiateCheckoutAction } from "@/app/actions/payment-actions";
import {
  type CheckoutTier,
  formatEuroCents,
  tierLabel
} from "@/lib/subscription";

/**
 * Informativa mandato SEPA Direct Debit (SDD): presa visione OBBLIGATORIA prima
 * di acquistare un abbonamento con addebito ricorrente automatico (rate).
 */
const SDD_DISCLOSURE_TEXT =
  "Il/la sottoscritto/a conferma di essere consapevole che avendo optato per la scelta di eseguire il pagamento dell'abbonamento tramite mandato SEPA Direct Debit – SDD autorizza la palestra ad addebitare automaticamente sul conto corrente le quote dell'abbonamento e che in caso di revoca mandato SEPA/RID alla banca, mentre risulta ancora un abbonamento attivo con la palestra, è previsto a carico dell'utente l'obbligo del pagamento immediato dell'importo corrispondente alle rate residue in favore della palestra, oltre al pagamento di una penale per recesso anticipato, pari al valore del residuo ancora insoluto, oltre al pagamento delle spese per il recupero insoluti o mancati addebiti.";

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

  // Default: annuale a rate (la formula promossa)
  const [selectedTier, setSelectedTier] = useState<SubscriptionTierKey>("YEARLY");
  const [payInInstallments, setPayInInstallments] = useState(true);
  // Presa visione mandato SEPA SDD (richiesta solo per gli acquisti a rate).
  const [sddAck, setSddAck] = useState(false);
  const [isPending, startTransition] = useTransition();

  const yearlyData = useMemo(
    () => subscriptionTiers.find((t) => t.tier === "YEARLY")!,
    [subscriptionTiers]
  );
  // Tutti i piani in lista (Annuale incluso come "unica soluzione"); l'hero sopra e' Annuale a rate.
  const otherTiers = subscriptionTiers;

  const selectedData = useMemo(
    () => subscriptionTiers.find((t) => t.tier === selectedTier)!,
    [subscriptionTiers, selectedTier]
  );

  const hasInstallments = Boolean(selectedData.installments);
  const effectivePayMode: "one-shot" | "installments" =
    hasInstallments && payInInstallments ? "installments" : "one-shot";

  const monthlyPrice = tiers.find((t) => t.tier === "MONTHLY")!.oneShotCents;

  const yearlyMonthly = yearlyData.installments!.amountCents;
  const yearlyInstallmentSavingsPct = Math.round(
    ((monthlyPrice - yearlyMonthly) / monthlyPrice) * 100
  );
  const isYearlyInstallments = selectedTier === "YEARLY" && payInInstallments;

  function handleSelect(tier: SubscriptionTierKey) {
    setSelectedTier(tier);
    setPayInInstallments(false);
    setSddAck(false);
  }

  function selectYearlyInstallments() {
    setSelectedTier("YEARLY");
    setPayInInstallments(true);
    setSddAck(false);
  }

  function handleSubmit(formData: FormData) {
    formData.set("tier", selectedTier);
    formData.set("installments", effectivePayMode === "installments" ? "true" : "false");
    formData.set("sddAck", effectivePayMode === "installments" && sddAck ? "true" : "false");
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

      {/* ── Featured: Annuale a rate ──────────────────────────── */}
      <button
        type="button"
        role="radio"
        aria-checked={isYearlyInstallments}
        className={`ck-featured ${isYearlyInstallments ? "ck-featured--selected" : ""}`}
        onClick={selectYearlyInstallments}
      >
        <span className="ck-featured-badge">
          <Crown size={11} aria-hidden="true" />
          La scelta n.1
        </span>
        <span className="ck-featured-body">
          <span className="ck-plan-radio ck-featured-radio">
            {isYearlyInstallments && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="ck-featured-info">
            <span className="ck-featured-name">Annuale · a rate</span>
            <span className="ck-featured-detail">
              {yearlyData.installments!.count} rate mensili · un anno intero di accesso
            </span>
          </span>
          <span className="ck-featured-pricing">
            <span className="ck-featured-price">{formatEuroCents(yearlyMonthly)}</span>
            <span className="ck-featured-unit">/ mese</span>
          </span>
        </span>
        <span className="ck-featured-foot">
          Solo {formatEuroCents(yearlyMonthly)} al mese invece di {formatEuroCents(monthlyPrice)} · risparmi il {yearlyInstallmentSavingsPct}%
        </span>
      </button>

      <p className="ck-alt-label">Oppure scegli un altro piano</p>

      {/* ── Subscription tiers ────────────────────────────────── */}
      <div className="ck-plans" role="radiogroup" aria-label="Scegli un piano">
        {otherTiers.map((t) => {
          const isSelected = t.tier === selectedTier && !payInInstallments;
          const savingsPct = computeSavingsPct(t.oneShotCents, monthlyPrice, t.tier);

          return (
            <button
              key={t.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`ck-plan ${isSelected ? "ck-plan--selected" : ""}`}
              onClick={() => handleSelect(t.tier)}
            >
              <span className="ck-plan-radio">
                {isSelected && <Check size={12} strokeWidth={3} />}
              </span>

              <span className="ck-plan-info">
                <span className="ck-plan-name">
                  {tierLabel(t.tier)}
                  {t.tier === "YEARLY" && <span className="ck-plan-tag-quiet">unica soluzione</span>}
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

      {/* ── Installments toggle (solo per Biennale) ───────────── */}
      {selectedTier === "BIENNIAL" && selectedData.installments ? (
        <div className="ck-installments-row">
          <div className="ck-toggle-pill">
            <button
              type="button"
              className={`ck-toggle-opt ${effectivePayMode === "one-shot" ? "ck-toggle-opt--active" : ""}`}
              onClick={() => {
                setPayInInstallments(false);
                setSddAck(false);
              }}
            >
              Unica soluzione
            </button>
            <button
              type="button"
              className={`ck-toggle-opt ${effectivePayMode === "installments" ? "ck-toggle-opt--active" : ""}`}
              onClick={() => {
                setPayInInstallments(true);
                setSddAck(false);
              }}
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

      {/* ── Mandato SEPA SDD (solo acquisti a rate / addebito ricorrente) ── */}
      {effectivePayMode === "installments" ? (
        <div className="sdd-box">
          <div className="sdd-head">
            <FileText size={14} aria-hidden="true" />
            Mandato SEPA Direct Debit (SDD)
          </div>
          <p className="sdd-text">{SDD_DISCLOSURE_TEXT}</p>
          <label className="terms-check sdd-check">
            <input
              type="checkbox"
              checked={sddAck}
              onChange={(e) => setSddAck(e.target.checked)}
            />
            <span>Dichiaro di aver letto e preso visione delle condizioni del mandato SEPA SDD.</span>
          </label>
        </div>
      ) : null}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <form action={handleSubmit} className="ck-cta-form">
        <input type="hidden" name="tier" value={selectedTier} />
        <input type="hidden" name="installments" value={effectivePayMode === "installments" ? "true" : "false"} />
        <input type="hidden" name="sddAck" value={effectivePayMode === "installments" && sddAck ? "true" : "false"} />

        <button
          type="submit"
          className="button button-primary ck-cta"
          disabled={isPending || (effectivePayMode === "installments" && !sddAck)}
        >
          {isPending ? (
            "Reindirizzamento…"
          ) : (
            <>
              Abbonati — {effectivePayMode === "installments" && selectedData.installments
                ? `${formatEuroCents(selectedData.installments.amountCents)}/mese`
                : formatEuroCents(selectedData.oneShotCents)}
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="ck-trust">
          <Lock size={11} />
          {effectivePayMode === "installments"
            ? "Pagamento sicuro · Addebito ricorrente automatico (SEPA SDD)"
            : "Pagamento sicuro · Nessun rinnovo automatico"}
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
