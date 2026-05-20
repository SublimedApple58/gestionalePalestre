import { db, UserRole } from "@gestionale/db";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { requireRole } from "@/lib/session";
import { CHECKOUT_TIERS, TIER_CATALOG, isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * Pagina self-service per sottoscrivere/rinnovare l'abbonamento.
 * Solo SUBSCRIBER. Mostra:
 *  - stato abbonamento attuale (se c'è uno attivo, invita al rinnovo)
 *  - listino TIER_CATALOG (5 card: Giornaliero / Mensile / Trimestrale / Annuale / Biennale)
 *  - toggle unica soluzione vs rate (rate disponibili su Annuale/Biennale via SumUp recurring)
 *  - CTA → server action `initiateCheckoutAction` che redireziona all'hosted checkout.
 */
export default async function CheckoutPage() {
  const sessionUser = await requireRole([UserRole.SUBSCRIBER]);

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      firstName: true,
      role: true,
      subscription: true
    }
  });

  if (!user) {
    redirect("/login");
  }

  const subscription = user.subscription ?? null;
  const hasActiveSubscription = isSubscriptionActive(subscription);

  const tiers = CHECKOUT_TIERS.map((tier) => ({
    tier,
    oneShotCents: TIER_CATALOG[tier].oneShotCents,
    installments: TIER_CATALOG[tier].installments
  }));

  return (
    <AuthenticatedShell
      currentPath="/checkout"
      user={{
        firstName: user.firstName,
        role: user.role
      }}
    >
      <main className="checkout-page">
        <CheckoutForm
          tiers={tiers}
          activeSubscription={
            hasActiveSubscription && subscription
              ? {
                  tier: subscription.tier,
                  endsAt: subscription.endsAt.toISOString()
                }
              : null
          }
        />
      </main>
    </AuthenticatedShell>
  );
}
