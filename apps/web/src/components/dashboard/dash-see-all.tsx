import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Footer "Vedi tutti" per le card-anteprima della home admin. Mostrato quando un
 * elenco è troncato (limit): a sinistra quanti altri elementi ci sono, a destra
 * il link alla pagina completa. Non renderizza nulla se non c'è nulla in più.
 */
export function DashSeeAll({
  total,
  shown,
  href
}: {
  total: number;
  shown: number;
  href: string;
}) {
  const remaining = total - shown;
  if (remaining <= 0) return null;

  return (
    <Link href={href} className="dash-see-all">
      <span className="dash-see-all-more">
        {remaining === 1 ? "1 altro" : `Altri ${remaining}`}
      </span>
      <span className="dash-see-all-link">
        Vedi tutti ({total})
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}
