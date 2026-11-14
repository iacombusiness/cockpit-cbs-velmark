import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { Amostra, BarrasH, type LinhaBarra } from "@/components/cbs/graficos";
import { useAbrirNota } from "@/components/cbs/nota-contexto";
import {
  Cabecalho,
  Carregando,
  ErroCarga,
  Estado,
  Kpi,
  KpiGrade,
  Legenda,
  Painel,
} from "@/components/cbs/pecas";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CadastroFornecedor } from "@/lib/cbs/api";
import { useCadastros, useDocumentos } from "@/lib/cbs/consultas";
import { localFornecedor, nomeFornecedor, sinaisFornecedor } from "@/lib/cbs/fornecedor";
import { brl, cnpjFmt, dataBR, inteiro, paBR, pct } from "@/lib/cbs/formato";
import {
  agingAApropriar,
  CNPJ_RAIZ_EMPRESA,
  descDoc,
  dias,
  fornecedoresAApropriar,
  resumoPA,
  type Credito,
} from "@/lib/cbs/modelo";
import { cn } from "@/lib/utils";

const PA_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

export const Route = createFileRoute("/_cockpit/creditos")({
  validateSearch: (s: Record<string, unknown>): { pa?: string } =>
    typeof s["pa"] === "string" && PA_VALIDO.test(s["pa"]) ? { pa: s["pa"] } : {},
  head: () => ({ meta: [{ title: "Créditos · Cockpit CBS" }] }),
  component: TelaCreditos,
});

function TelaCreditos() {
  const docs = useDocumentos();
  if (docs.erro) return <ErroCarga erro={docs.erro} />;
  if (!docs.dados) return <Carregando />;
  return <Conteudo creditos={docs.dados.creditos} hoje={docs.hoje} />;
}

const soma = (cs: readonly Credito[], f: (c: Credito) => number) =>
  Math.round(cs.reduce((a, c) => a + f(c), 0) * 100) / 100;

function Conteudo({ creditos, hoje }: { creditos: Credito[]; hoje: string }) {
  const { pa } = Route.useSearch();
  const navegar = useNavigate({ from: Route.fullPath });
  const pas = useMemo(() => [...new Set(creditos.map((c) => c.pa))].sort(), [creditos]);
  const filtrados = useMemo(
    () => (pa ? creditos.filter((c) => c.pa === pa) : creditos),
    [creditos, pa],
  );
  const fornecedores = useMemo(() => fornecedoresAApropriar(filtrados, hoje), [filtrados, hoje]);
  const cadastros = useCadastros().data;
  const aging = useMemo(() => agingAApropriar(filtrados, hoje), [filtrados, hoje]);

  const tot = {
    apurado: soma(filtrados, (c) => c.apurado),
    aApropriar: soma(filtrados, (c) => c.aApropriar),
    apropriado: soma(filtrados, (c) => c.apropriado),
    utilizado: soma(filtrados, (c) => c.utilizado),
    saldoCredor: soma(filtrados, (c) => c.saldoCredor),
  };
  const topo = fornecedores[0];
  const parteParada = tot.apurado ? (tot.aApropriar / tot.apurado) * 100 : 0;

  const ciclo: LinhaBarra[] = pas.map((m) => {
    const r = resumoPA([], creditos, m);
    return {
      chave: m,
      rotulo: paBR(m),
      valor: brl(r.creditoApurado),
      forte: m === pa,
      segs: [
        { v: r.apropriado, serie: "s1" },
        { v: r.aApropriar, serie: "s2" },
      ],
      dica: (
        <>
          <b>PA {paBR(m)}</b>
          <br />
          <Amostra serie="s1" />
          Apropriado {brl(r.apropriado)} (utilizado {brl(r.utilizado)})
          <br />
          <Amostra serie="s2" />A apropriar {brl(r.aApropriar)}
          <br />
          {inteiro(r.nCreditos)} notas
        </>
      ),
    };
  });
  const faixas: LinhaBarra[] = aging.map((f) => ({
    chave: f.nome,
    rotulo: f.nome,
    valor: f.notas
      ? `${brl(f.valor)} · ${f.notas} ${f.notas === 1 ? "nota" : "notas"}`
      : "nenhuma nota",
    forte: f.notas > 0,
    segs: [{ v: f.valor, serie: "s2" }],
    dica: (
      <>
        <b>{f.nome}</b> desde o registro na Receita
        <br />
        {brl(f.valor)} a apropriar em {f.notas} {f.notas === 1 ? "nota" : "notas"}
      </>
    ),
  }));

  const titulo = !tot.apurado
    ? "Nenhum crédito apurado neste recorte"
    : tot.aApropriar > 0
      ? `${pct(parteParada, 0)} do crédito ainda depende dos fornecedores`
      : "Todo o crédito apurado já foi apropriado";

  return (
    <>
      <Cabecalho
        sobretitulo="Créditos e fornecedores"
        titulo={titulo}
        texto={
          "Pela regra da reforma, o crédito só é liberado quando o fornecedor quita o débito dele. Até lá, fica “a apropriar”." +
          (topo && fornecedores.length > 1
            ? ` O fornecedor ${nomeFornecedor(topo.cnpj, cadastros?.get(topo.cnpj))} concentra ${pct(topo.pct)} do que está parado.`
            : "")
        }
        lado={
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Período
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={pa ?? ""}
              onChange={(e) =>
                void navegar({ search: e.target.value ? { pa: e.target.value } : {} })
              }
            >
              <option value="">Todos</option>
              {pas.map((m) => (
                <option key={m} value={m}>
                  {paBR(m)}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <KpiGrade>
        <Kpi
          rotulo="Crédito apurado"
          valor={brl(tot.apurado)}
          sub={`${inteiro(filtrados.length)} documentos`}
          apagado={!tot.apurado}
        />
        <Kpi
          rotulo="A apropriar"
          valor={brl(tot.aApropriar)}
          sub="aguarda o fornecedor"
          apagado={!tot.aApropriar}
        />
        <Kpi
          rotulo="Apropriado"
          valor={brl(tot.apropriado)}
          sub="liberado"
          apagado={!tot.apropriado}
        />
        <Kpi
          rotulo="Utilizado"
          valor={brl(tot.utilizado)}
          sub="abateu débito"
          apagado={!tot.utilizado}
        />
        <Kpi
          rotulo="Saldo credor"
          valor={brl(tot.saldoCredor)}
          sub="disponível"
          apagado={!tot.saldoCredor}
        />
      </KpiGrade>

      <div className="grid gap-5 xl:grid-cols-2">
        <Painel
          titulo="Ciclo do crédito por período"
          acao={
            <Legenda
              itens={[
                { serie: "s1", rotulo: "Apropriado" },
                { serie: "s2", rotulo: "A apropriar" },
              ]}
            />
          }
        >
          <BarrasH linhas={ciclo} aria="Crédito por período: apropriado e a apropriar" />
        </Painel>
        <Painel titulo="Há quanto tempo está parado" subtitulo="Dias desde o registro na Receita">
          <BarrasH linhas={faixas} aria="Crédito a apropriar por tempo desde o registro" />
        </Painel>
      </div>

      <Painel
        titulo="Fornecedores com crédito a apropriar"
        subtitulo="Cadastro dos fornecedores (fictício) · clique para ver as notas"
      >
        {fornecedores.length ? (
          <TabelaFornecedores fornecedores={fornecedores} hoje={hoje} cadastros={cadastros} />
        ) : (
          <p className="text-sm text-ink-3">Nenhum crédito a apropriar neste recorte.</p>
        )}
      </Painel>
    </>
  );
}

function ResumoCadastros({
  fornecedores,
  cadastros,
}: {
  fornecedores: ReturnType<typeof fornecedoresAApropriar>;
  cadastros: Map<string, CadastroFornecedor> | undefined;
}) {
  const sinais = fornecedores.flatMap((f) =>
    sinaisFornecedor(cadastros?.get(f.cnpj)).map((s) => ({ ...s, valor: f.aApropriar })),
  );
  const grupo = (texto: (t: string) => boolean) => {
    const itens = sinais.filter((s) => texto(s.texto));
    return { n: itens.length, valor: itens.reduce((a, s) => a + s.valor, 0) };
  };
  const inativos = grupo((t) => t.startsWith("CNPJ ") && t !== "CNPJ não encontrado");
  const simples = grupo((t) => t === "Simples Nacional" || t === "MEI");
  const pendentes = grupo((t) => t === "cadastro em busca");
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <Estado tom={inativos.n ? "crit" : "good"}>
        {inativos.n
          ? `${inativos.n} com CNPJ não ativo · ${brl(inativos.valor)}`
          : "Todos com CNPJ ativo"}
      </Estado>
      <Estado tom="info">
        {simples.n} do Simples ou MEI · {brl(simples.valor)}
      </Estado>
      {pendentes.n > 0 && <Estado>{pendentes.n} com cadastro em busca</Estado>}
    </div>
  );
}

function TabelaFornecedores({
  fornecedores,
  hoje,
  cadastros,
}: {
  fornecedores: ReturnType<typeof fornecedoresAApropriar>;
  hoje: string;
  cadastros: Map<string, CadastroFornecedor> | undefined;
}) {
  const abrirNota = useAbrirNota();
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [todos, setTodos] = useState(false);
  const visiveis = todos ? fornecedores : fornecedores.slice(0, 15);
  const max = fornecedores[0]?.aApropriar ?? 1;
  const alternar = (cnpj: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(cnpj)) n.delete(cnpj);
      else n.add(cnpj);
      return n;
    });
  const th = "whitespace-nowrap px-2.5 py-2 font-semibold";

  return (
    <>
      <ResumoCadastros fornecedores={fornecedores} cadastros={cadastros} />
      <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[820px] border-collapse text-[13px] tabular">
          <thead>
            <tr className="border-b border-rule-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3">
              <th className={th}>Fornecedor</th>
              <th className={cn(th, "text-right")}>Notas</th>
              <th className={cn(th, "text-right")}>A apropriar</th>
              <th className={cn(th, "w-[110px]")}>
                <span className="sr-only">Barra do valor a apropriar</span>
              </th>
              <th className={cn(th, "text-right")}>% do total</th>
              <th className={cn(th, "text-right")}>Acumulado</th>
              <th className={cn(th, "text-right")}>Mais antigo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((f) => {
              const aberto = abertos.has(f.cnpj);
              const cad = cadastros?.get(f.cnpj);
              const local = localFornecedor(cad);
              return (
                <Fragment key={f.cnpj}>
                  <tr
                    className="cursor-pointer border-b hover:bg-background"
                    onClick={() => alternar(f.cnpj)}
                  >
                    <td className="px-2.5 py-2">
                      <button
                        type="button"
                        aria-expanded={aberto}
                        onClick={(e) => {
                          e.stopPropagation();
                          alternar(f.cnpj);
                        }}
                        title={
                          [cad?.nomeFantasia, cad?.cnae, cad?.porte].filter(Boolean).join(" · ") ||
                          undefined
                        }
                        className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 size-3.5 text-ink-3 transition-transform",
                            aberto && "rotate-90",
                          )}
                        />
                        <span className="font-semibold">{nomeFornecedor(f.cnpj, cad)}</span>
                        <span className="col-start-2 font-[family-name:var(--font-mono)] text-[11.5px] text-ink-3">
                          {[cad?.razaoSocial ? cnpjFmt(f.cnpj) : null, local]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1 pl-5">
                        {sinaisFornecedor(cad).map((sinal) => (
                          <span key={sinal.texto} title={sinal.dica}>
                            <Estado tom={sinal.tom}>{sinal.texto}</Estado>
                          </span>
                        ))}
                        {f.cnpj.startsWith(CNPJ_RAIZ_EMPRESA) && (
                          <Estado tom="info">a própria empresa</Estado>
                        )}
                        {f.diasMaisAntigo > 90 && (
                          <Estado tom="warn">parado há mais de 90 dias</Estado>
                        )}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-right">{f.notas.length}</td>
                    <td className="px-2.5 py-2 text-right">
                      <b>{brl(f.aApropriar)}</b>
                    </td>
                    <td className="px-2.5 py-2.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="h-2 rounded-r bg-s2"
                            style={{
                              width: `${Math.max(0.6, (f.aApropriar / max) * 100).toFixed(1)}%`,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="tabular">
                          <b>{nomeFornecedor(f.cnpj, cad)}</b>
                          <br />
                          {brl(f.aApropriar)} a apropriar
                          <br />
                          {f.notas.length} {f.notas.length === 1 ? "nota" : "notas"}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-2.5 py-2 text-right">{pct(f.pct)}</td>
                    <td className="px-2.5 py-2 text-right">{pct(f.acumulado)}</td>
                    <td className="px-2.5 py-2 text-right">{f.diasMaisAntigo} d</td>
                  </tr>
                  {aberto &&
                    [...f.notas]
                      .sort((a, b) => b.aApropriar - a.aApropriar)
                      .map((n) => (
                        <tr
                          key={n.chave}
                          tabIndex={0}
                          onClick={() => abrirNota(n.chave)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") abrirNota(n.chave);
                          }}
                          className="cursor-pointer border-b bg-background text-[12.5px] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <td className="py-1.5 pl-8 pr-2.5">
                            ↳ {descDoc(n)} · PA {paBR(n.pa)}
                          </td>
                          <td />
                          <td className="px-2.5 py-1.5 text-right">{brl(n.aApropriar)}</td>
                          <td />
                          <td colSpan={2} className="px-2.5 py-1.5 text-ink-3">
                            registrada em {dataBR(n.registro)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right">
                            {n.registro ? `${dias(n.registro, hoje)} d` : "—"}
                          </td>
                        </tr>
                      ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {fornecedores.length > 15 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setTodos((t) => !t)}>
          {todos ? "Mostrar só os 15 maiores" : `Ver todos os ${fornecedores.length} fornecedores`}
        </Button>
      )}
    </>
  );
}
