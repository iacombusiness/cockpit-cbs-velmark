import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Bloco de trabalho com título, subtítulo opcional e ação à direita. */
export function Painel({
  titulo,
  subtitulo,
  acao,
  children,
  className,
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-4 sm:p-5", className)}>
      {(titulo ?? subtitulo ?? acao) !== undefined && (
        <header className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            {titulo !== undefined && (
              <h2 className="text-[19px] font-semibold leading-tight">{titulo}</h2>
            )}
          </div>
          <div className="flex items-center gap-3">
            {subtitulo !== undefined && <p className="text-[12.5px] text-ink-3">{subtitulo}</p>}
            {acao}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function KpiGrade({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-lg border bg-card">
      {children}
    </div>
  );
}

export function Kpi({
  rotulo,
  valor,
  sub,
  apagado = false,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  apagado?: boolean;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1 px-4 py-3.5 shadow-[1px_1px_0_0_var(--border)]">
      <span className="eyebrow">{rotulo}</span>
      <span
        className={cn(
          "font-[family-name:var(--font-display)] text-lg font-semibold leading-tight tabular sm:text-2xl",
          apagado && "text-ink-3",
        )}
      >
        {valor}
      </span>
      {sub !== undefined && <span className="text-xs text-ink-3">{sub}</span>}
    </div>
  );
}

export type Tom = "neutro" | "crit" | "warn" | "good" | "info";

const TOM_FUNDO: Record<Tom, string> = {
  neutro: "border border-rule-2 bg-card",
  crit: "bg-crit-soft",
  warn: "bg-warn-soft",
  good: "bg-good-soft",
  info: "bg-info-soft",
};
const TOM_PONTO: Record<Tom, string> = {
  neutro: "bg-ink-3",
  crit: "bg-crit",
  warn: "bg-warn",
  good: "bg-good",
  info: "bg-s1",
};

/** Estado com ponto colorido + texto: a cor nunca carrega o significado sozinha. */
export function Estado({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-semibold text-foreground",
        TOM_FUNDO[tom],
      )}
    >
      <i aria-hidden="true" className={cn("inline-block size-2 rounded-full", TOM_PONTO[tom])} />
      {children}
    </span>
  );
}

/** Linha de pendência com faixa de severidade à esquerda. */
export function Pendencia({
  tom,
  titulo,
  texto,
  acao,
}: {
  tom: Tom;
  titulo: string;
  texto: string;
  acao?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4px_minmax(0,1fr)_auto] items-start gap-3 border-t py-3 first:border-t-0 first:pt-0">
      <span aria-hidden="true" className={cn("self-stretch rounded-sm", TOM_PONTO[tom])} />
      <div className="min-w-0">
        <p className="font-semibold">{titulo}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">{texto}</p>
      </div>
      <div>{acao}</div>
    </div>
  );
}

export function Legenda({ itens }: { itens: { serie: "s1" | "s2"; rotulo: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className={cn("inline-block size-2.5 rounded-sm", i.serie === "s1" ? "bg-s1" : "bg-s2")}
          />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

export function Cabecalho({
  sobretitulo,
  titulo,
  texto,
  lado,
}: {
  sobretitulo: string;
  titulo: string;
  texto?: string;
  lado?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="eyebrow">{sobretitulo}</span>
        <h1 className="text-[23px] font-bold leading-tight sm:text-[28px]">{titulo}</h1>
        {texto !== undefined && <p className="mt-1.5 max-w-[68ch] text-ink-2">{texto}</p>}
      </div>
      {lado}
    </div>
  );
}

export function Carregando({ texto = "Carregando os dados…" }: { texto?: string }) {
  return (
    <div role="status" className="grid gap-3">
      <div className="h-8 w-2/3 animate-pulse rounded bg-secondary" />
      <div className="h-24 animate-pulse rounded-lg bg-secondary" />
      <div className="h-64 animate-pulse rounded-lg bg-secondary" />
      <span className="sr-only">{texto}</span>
    </div>
  );
}

export function ErroCarga({ erro }: { erro: unknown }) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  return (
    <div role="alert" className="rounded-lg border border-crit bg-crit-soft p-4">
      <p className="font-semibold">Não consegui ler os dados.</p>
      <p className="mt-1 text-[13px] text-ink-2">
        {msg}. Recarregue a página; se continuar, confira se a sua sessão não expirou (Sair e entrar
        de novo).
      </p>
    </div>
  );
}
