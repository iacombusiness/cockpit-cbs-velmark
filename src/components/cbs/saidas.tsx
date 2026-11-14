import { Estado } from "@/components/cbs/pecas";
import type { Checagem } from "@/lib/cbs/saidas";

const TOM: Record<Checagem["tom"], "crit" | "warn" | "info"> = {
  crit: "crit",
  warn: "warn",
  info: "info",
};

export function ChipsChecagem({ checagens }: { checagens: Checagem[] }) {
  if (!checagens.length) return <Estado tom="good">ok</Estado>;
  return (
    <div className="flex flex-wrap gap-1">
      {checagens.map((c) => (
        <span key={c.codigo} title={c.texto}>
          <Estado tom={TOM[c.tom]}>{c.titulo}</Estado>
        </span>
      ))}
    </div>
  );
}
