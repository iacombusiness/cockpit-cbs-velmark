import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import { useAbrirNota } from "@/components/cbs/nota-contexto";
import {
  Cabecalho,
  Carregando,
  ErroCarga,
  Estado,
  Kpi,
  KpiGrade,
  Painel,
} from "@/components/cbs/pecas";
import { ChipsChecagem } from "@/components/cbs/saidas";
import type { ImportacaoSaida, ImportacoesSaida } from "@/lib/cbs/api";
import { useImportacoesSaida, useNotasSaida } from "@/lib/cbs/consultas";
import { brl, dataBR, dataHoraBR, inteiro, paBR } from "@/lib/cbs/formato";
import { hojeSP } from "@/lib/cbs/modelo";
import {
  checarNota,
  ehExterior,
  INICIO_BASE_RECEITA,
  situacaoReceita,
  type Checagem,
  type NotaSaida,
} from "@/lib/cbs/saidas";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_cockpit/saidas")({
  head: () => ({ meta: [{ title: "Notas de saída · Cockpit CBS" }] }),
  component: TelaSaidas,
});

function TelaSaidas() {
  const notas = useNotasSaida();
  const importacoes = useImportacoesSaida();
  const erro = notas.error ?? importacoes.error;
  if (erro) return <ErroCarga erro={erro} />;
  if (!notas.data || !importacoes.data) return <Carregando />;
  return <Conteudo notas={notas.data} importacoes={importacoes.data} />;
}

interface Linha {
  nota: NotaSaida;
  checagens: Checagem[];
  pior: Checagem["tom"] | "ok";
}

const SELECT =
  "h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Conteudo({ notas, importacoes }: { notas: NotaSaida[]; importacoes: ImportacoesSaida }) {
  const abrirNota = useAbrirNota();
  const hoje = hojeSP();
  const [mes, setMes] = useState("");
  const [modelo, setModelo] = useState("");
  const [soApontamentos, setSoApontamentos] = useState(true);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());

  const linhas: Linha[] = useMemo(
    () =>
      notas.map((nota) => {
        const checagens = checarNota(nota, hoje);
        return { nota, checagens, pior: checagens[0]?.tom ?? "ok" };
      }),
    [notas, hoje],
  );
  const meses = [...new Set(notas.flatMap((n) => (n.emissao ? [n.emissao.slice(0, 7)] : [])))]
    .sort()
    .reverse();
  const modelos = [...new Set(notas.map((n) => n.modelo))].sort();

  const doRecorte = linhas.filter(
    (l) => (!mes || l.nota.emissao?.startsWith(mes)) && (!modelo || l.nota.modelo === modelo),
  );
  const visiveis = soApontamentos ? doRecorte.filter((l) => l.pior !== "ok") : doRecorte;
  const crit = doRecorte.filter((l) => l.pior === "crit");
  const warn = doRecorte.filter((l) => l.pior === "warn");
  const exterior = doRecorte.filter((l) => ehExterior(l.nota) && !l.nota.cancelada);
  const erpFeita = importacoes.erp.find((i) => i.situacao === "concluida") ?? null;

  const titulo = !notas.length
    ? "Buscando as notas de saída no ERP"
    : crit.length
      ? `${crit.length} ${crit.length === 1 ? "nota de saída pede" : "notas de saída pedem"} correção`
      : warn.length
        ? `${warn.length} ${warn.length === 1 ? "nota de saída a conferir" : "notas de saída a conferir"}`
        : "Nenhum problema nas notas de saída";

  const chaveLinha = (n: NotaSaida) => `${n.modelo}-${n.serie}-${n.numero}`;
  const alternar = (k: string) =>
    setAbertas((a) => {
      const novo = new Set(a);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });

  return (
    <>
      <Cabecalho
        sobretitulo="Checagem das notas de saída"
        titulo={titulo}
        texto="As notas de saída do ERP chegam sozinhas pela integração e são cruzadas com o que a Receita apurou: nota cancelada com débito, ERP e Receita divergindo, venda que a Receita não apurou, NFS-e sem retorno, exportação tributada."
      />

      <Fonte erp={importacoes.erp} erpFeita={erpFeita} />

      {!notas.length ? (
        <Painel titulo="Como as notas chegam">
          <p className="text-[13.5px] text-ink-2">
            A integração lê as notas de saída do ERP de hora em hora e cruza cada uma com o que a
            Receita apurou. A primeira leitura aparece aqui em até uma hora.
          </p>
        </Painel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <label className="flex items-center gap-2">
              Mês
              <select className={SELECT} value={mes} onChange={(e) => setMes(e.target.value)}>
                <option value="">Todos</option>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {paBR(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Modelo
              <select className={SELECT} value={modelo} onChange={(e) => setModelo(e.target.value)}>
                <option value="">Todos</option>
                {modelos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={soApontamentos}
                onChange={(e) => setSoApontamentos(e.target.checked)}
              />
              Só notas com apontamento
            </label>
          </div>

          <KpiGrade>
            <Kpi rotulo="Notas" valor={inteiro(doRecorte.length)} sub="no recorte" />
            <Kpi
              rotulo="Para corrigir"
              valor={inteiro(crit.length)}
              sub="exportação tributada e afins"
              apagado={!crit.length}
            />
            <Kpi
              rotulo="A conferir"
              valor={inteiro(warn.length)}
              sub="sem retorno, divergência, ISS"
              apagado={!warn.length}
            />
            <Kpi
              rotulo="Para o exterior"
              valor={brl(exterior.reduce((a, l) => a + l.nota.valorTotal, 0))}
              sub={`${inteiro(exterior.length)} ${exterior.length === 1 ? "nota" : "notas"}`}
              apagado={!exterior.length}
            />
            <Kpi
              rotulo="CBS na Receita"
              valor={brl(doRecorte.reduce((a, l) => a + (l.nota.apuradoReceita ?? 0), 0))}
              sub={`no ERP: ${brl(doRecorte.reduce((a, l) => a + l.nota.valorCbs, 0))}`}
            />
          </KpiGrade>

          <Painel
            titulo="Nota a nota"
            subtitulo={`A Receita só tem o que mudou desde ${dataBR(INICIO_BASE_RECEITA)}: notas anteriores aparecem como “fora da base”.`}
          >
            {visiveis.length ? (
              <div className="relative -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                <table className="w-full min-w-[900px] border-collapse text-[13px] tabular">
                  <thead>
                    <tr className="border-b border-rule-2 text-left text-[11.5px] uppercase tracking-wide text-ink-3">
                      <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Nota</th>
                      <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Emissão</th>
                      <th className="px-2.5 py-2 font-semibold">Cliente e destino</th>
                      <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Natureza</th>
                      <th className="whitespace-nowrap px-2.5 py-2 text-right font-semibold">
                        Valor
                      </th>
                      <th className="whitespace-nowrap px-2.5 py-2 text-right font-semibold">
                        CBS ERP
                      </th>
                      <th className="whitespace-nowrap px-2.5 py-2 text-right font-semibold">
                        CBS Receita
                      </th>
                      <th className="px-2.5 py-2 font-semibold">Apontamentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map(({ nota: n, checagens }) => {
                      const k = chaveLinha(n);
                      const aberta = abertas.has(k);
                      return (
                        <Fragment key={k}>
                          <tr
                            tabIndex={0}
                            onClick={() => (n.chave ? abrirNota(n.chave) : alternar(k))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (n.chave) abrirNota(n.chave);
                                else alternar(k);
                              }
                            }}
                            className={cn(
                              "cursor-pointer border-b align-top hover:bg-background focus-visible:outline-2 focus-visible:outline-ring",
                              n.cancelada && "text-ink-3",
                            )}
                          >
                            <td className="whitespace-nowrap px-2.5 py-2">
                              {!n.chave && checagens.length > 0 && (
                                <ChevronRight
                                  aria-hidden="true"
                                  className={cn(
                                    "mr-1 inline size-3.5 text-ink-3 transition-transform",
                                    aberta && "rotate-90",
                                  )}
                                />
                              )}
                              <b>
                                {n.modelo} {inteiro(n.numero)}
                              </b>
                              {n.cancelada && <span className="ml-1.5 text-xs">(cancelada)</span>}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2">{dataBR(n.emissao)}</td>
                            <td className="px-2.5 py-2">
                              <span
                                className="block max-w-[240px] truncate"
                                title={n.clienteNome ?? ""}
                              >
                                {n.clienteNome ?? "—"}
                              </span>
                              <span className="text-xs text-ink-3">
                                {ehExterior(n)
                                  ? `${n.paisNome ?? n.pais ?? "exterior"} · exportação`
                                  : [n.cidade, n.uf].filter(Boolean).join("/")}
                              </span>
                            </td>
                            <td
                              className="whitespace-nowrap px-2.5 py-2"
                              title={n.naturezaDescricao ?? ""}
                            >
                              {n.natureza ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right">
                              {brl(n.valorTotal)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right">
                              {brl(n.valorCbs)}
                            </td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-right">
                              <b>{situacaoReceita(n)}</b>
                              {n.paReceita && (
                                <span className="block text-xs text-ink-3">
                                  PA {paBR(n.paReceita)}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2">
                              <ChipsChecagem checagens={checagens} />
                            </td>
                          </tr>
                          {aberta && checagens.length > 0 && (
                            <tr className="border-b bg-background">
                              <td colSpan={8} className="px-2.5 py-2.5">
                                <ul className="grid gap-1.5 pl-5 text-[13px]">
                                  {checagens.map((c) => (
                                    <li key={c.codigo}>
                                      <b>{c.titulo}.</b>{" "}
                                      <span className="text-ink-2">{c.texto}</span>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-3">
                {soApontamentos
                  ? "Nenhuma nota com apontamento neste recorte."
                  : "Nenhuma nota neste recorte."}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-3">
              Clique na nota para ver os detalhes: as que já estão na Receita abrem a gaveta com a
              chave, os valores e as versões.
            </p>
          </Painel>

          <Painel titulo="O que cada apontamento verifica">
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
              <Regra tom="crit" titulo="Exportação com CBS na Receita">
                Nota para o exterior com CBS apurada. Exportação é imune (LC 214, arts. 79 e 80).
              </Regra>
              <Regra tom="crit" titulo="CBS destacada numa exportação">
                O próprio ERP calculou CBS numa nota para o exterior.
              </Regra>
              <Regra tom="crit" titulo="Cancelada com débito">
                Cancelada no ERP, com débito na Receita: o cancelamento não chegou lá.
              </Regra>
              <Regra tom="warn" titulo="ERP e Receita divergem">
                Venda no Brasil com CBS diferente nos dois lados (mais de 1%).
              </Regra>
              <Regra tom="warn" titulo="Sem número de retorno">
                O ERP não registrou a autorização da NFS-e depois de 2 dias.
              </Regra>
              <Regra tom="warn" titulo="Exportação com ISS">
                NFS-e para o exterior com ISS destacado: pode haver ISS indevido (LC 116/2003, art.
                2º, I).
              </Regra>
              <Regra tom="warn" titulo="Receita não apurou">
                Venda no Brasil com CBS, emitida há 5 dias ou mais, sem débito na Receita.
              </Regra>
            </dl>
          </Painel>
        </>
      )}
    </>
  );
}

function Regra({
  tom,
  titulo,
  children,
}: {
  tom: "crit" | "warn";
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt>
        <Estado tom={tom}>{titulo}</Estado>
      </dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}

/** De onde vieram as notas e quando: a última leitura do ERP pela integração. */
function Fonte({ erp, erpFeita }: { erp: ImportacaoSaida[]; erpFeita: ImportacaoSaida | null }) {
  const ultima = erp[0] ?? null;
  const falhou = ultima?.situacao === "erro";
  if (!erpFeita) return null;
  return (
    <div className="-mt-2 grid gap-1.5 text-xs text-ink-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Estado tom={falhou ? "warn" : "good"}>ERP</Estado>
        <span>
          Atualizado em {dataHoraBR(erpFeita.concluidaEm)}: {inteiro(erpFeita.notas)} notas emitidas
          de {dataBR(erpFeita.de)} a {dataBR(erpFeita.ate)}
          {erpFeita.erpLidoEm
            ? `. A integração leu o ERP em ${dataHoraBR(erpFeita.erpLidoEm)}`
            : ""}
          .
        </span>
      </p>
    </div>
  );
}
