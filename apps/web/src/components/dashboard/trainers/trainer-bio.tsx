import { parseBio } from "@/lib/trainers";

/** Render della bio con `**grassetto**` ed elenchi "• ", come in app e sul sito. */
export function TrainerBio({ bio, className }: { bio: string; className?: string }) {
  const blocks = parseBio(bio);
  const out: React.ReactNode[] = [];
  let bullets: React.ReactNode[] = [];
  const flushBullets = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="trainer-bio-list">
          {bullets}
        </ul>
      );
      bullets = [];
    }
  };
  blocks.forEach((block, i) => {
    const content = block.segments.map((s, j) =>
      s.accent ? (
        <strong key={j} className="trainer-bio-accent">
          {s.text}
        </strong>
      ) : s.bold ? (
        <strong key={j}>{s.text}</strong>
      ) : (
        <span key={j}>{s.text}</span>
      )
    );
    if (block.kind === "bullet") {
      bullets.push(<li key={i}>{content}</li>);
    } else {
      flushBullets();
      out.push(<p key={i}>{content}</p>);
    }
  });
  flushBullets();
  return <div className={className ?? "trainer-bio"}>{out}</div>;
}
