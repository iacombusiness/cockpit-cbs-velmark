import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  CalendarDays,
  FileCheck2,
  FlaskConical,
  HeartPulse,
  Landmark,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BuscaGlobal } from "@/components/cbs/busca";
import { NotaProvider } from "@/components/cbs/nota";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useNotasSaida } from "@/lib/cbs/consultas";
import { hojeSP } from "@/lib/cbs/modelo";
import { checarNota } from "@/lib/cbs/saidas";

/*
 * Layout de todas as telas do cockpit. Não renderiza no servidor: os dados vivem no navegador.
 * Nesta demonstração não há login nem banco: os dados são fictícios (Velmark) e as respostas da
 * Receita vêm do simulador da API.
 */
export const Route = createFileRoute("/_cockpit")({
  ssr: false,
  component: Cockpit,
});

function Cockpit() {
  return (
    <TooltipProvider delayDuration={150}>
      <NotaProvider>
        <Casca />
      </NotaProvider>
    </TooltipProvider>
  );
}

const MENU = [
  { to: "/periodo", rotulo: "Período", Icone: CalendarDays },
  { to: "/saidas", rotulo: "Notas de saída", Icone: FileCheck2 },
  { to: "/creditos", rotulo: "Créditos", Icone: Landmark },
  { to: "/saude", rotulo: "Conexão e notas", Icone: HeartPulse },
] as const;

function TemaBotao() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => setEscuro(document.documentElement.classList.contains("dark")), []);
  const alternar = () => {
    const novo = !escuro;
    document.documentElement.classList.toggle("dark", novo);
    try {
      localStorage.setItem("tema", novo ? "escuro" : "claro");
    } catch {
      /* armazenamento bloqueado: o tema vale só nesta aba */
    }
    setEscuro(novo);
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={alternar}
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
    >
      {escuro ? <Sun /> : <Moon />}
    </Button>
  );
}

function Casca() {
  const [buscaAberta, setBuscaAberta] = useState(false);
  const notasSaida = useNotasSaida();
  const saidasCriticas = useMemo(() => {
    const hoje = hojeSP();
    return (notasSaida.data ?? []).filter((n) => checarNota(n, hoje)[0]?.tom === "crit").length;
  }, [notasSaida.data]);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscaAberta((a) => !a);
      }
    };
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  return (
    <div className="min-h-screen px-4 pb-8 sm:px-6">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Link to="/periodo" className="font-[family-name:var(--font-display)] text-xl font-bold">
            Cockpit CBS
          </Link>
          <span className="hidden whitespace-nowrap font-[family-name:var(--font-mono)] text-[11.5px] text-ink-3 sm:inline">
            simulador · dados fictícios
          </span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setBuscaAberta(true)}
          className="flex min-w-0 items-center gap-2.5 rounded-md border border-rule-2 bg-card px-2.5 py-1.5 text-ink-3 hover:border-ink-3"
          aria-label="Buscar nota, CNPJ, período ou tela"
        >
          <Search className="size-4" />
          <span className="hidden truncate sm:inline">Nota, CNPJ, período…</span>
          <kbd className="rounded border border-rule-2 bg-background px-1.5 font-[family-name:var(--font-mono)] text-[11px] text-ink-2">
            Ctrl K
          </kbd>
        </button>
        <TemaBotao />
      </header>

      <p
        role="note"
        className="mt-3 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-foreground"
      >
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <b>Dados fictícios · Velmark, empresa de demonstração.</b> Resposta da Receita simulada no
          formato da API oficial de Apuração Assistida da CBS.
        </span>
      </p>

      <div className="grid gap-4 pt-4 md:grid-cols-[200px_minmax(0,1fr)] md:gap-7 md:pt-5">
        <nav
          aria-label="Telas"
          className="flex gap-1.5 overflow-x-auto pb-1 md:sticky md:top-[72px] md:grid md:content-start md:gap-1 md:self-start md:overflow-visible"
        >
          {MENU.map(({ to, rotulo, Icone }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-2 font-medium text-ink-2 hover:bg-card hover:text-foreground md:border-transparent"
              activeProps={{
                className: "!border-primary !bg-primary !text-primary-foreground",
                "aria-current": "page",
              }}
            >
              <Icone className="size-[18px]" aria-hidden="true" />
              <span className="flex-1">{rotulo}</span>
              {to === "/saidas" && saidasCriticas > 0 && (
                <span className="rounded-full bg-crit px-1.5 font-[family-name:var(--font-mono)] text-[11px] text-white">
                  {saidasCriticas}
                </span>
              )}
            </Link>
          ))}
          <p className="mt-4 hidden border-t pt-3 text-xs text-ink-3 md:block">
            Demonstração: a consulta à Receita roda todo dia às 06:10 e pode ser simulada na tela
            Conexão e notas.
          </p>
        </nav>
        <main className="grid min-w-0 content-start gap-5">
          <Outlet />
        </main>
      </div>
      <BuscaGlobal aberta={buscaAberta} aoMudar={setBuscaAberta} />
    </div>
  );
}
