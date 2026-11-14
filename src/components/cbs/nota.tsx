import { useMemo, useState, type ReactNode } from "react";

import { NotaCtx } from "@/components/cbs/nota-contexto";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Estado } from "@/components/cbs/pecas";
import { brl, cnpjFmt, dataBR, dataHoraBR, paBR, pct } from "@/lib/cbs/formato";
import {
  useCadastros,
  useDiagnosticos,
  useDocumentos,
  useEmitidos,
  useVersoes,
} from "@/lib/cbs/consultas";
import { localFornecedor, nomeFornecedor, sinaisFornecedor } from "@/lib/cbs/fornecedor";
import {
  dias,
  descDoc,
  emitente,
  emitidaPelaEmpresa,
  itemComoRFB,
  partesChave,
  type Documento,
} from "@/lib/cbs/modelo";
import type { Versao } from "@/lib/cbs/api";

/* ------------------------------------------------------------------ contexto da gaveta */

export function NotaProvider({ children }: { children: ReactNode }) {
  const [chave, setChave] = useState<string | null>(null);
  return (
    <NotaCtx.Provider value={setChave}>
      {children}
      <Sheet open={chave !== null} onOpenChange={(aberta) => !aberta && setChave(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[620px]">
          {chave !== null && <NotaDetalhe chave={chave} />}
        </SheetContent>
      </Sheet>
    </NotaCtx.Provider>
  );
}

/* ------------------------------------------------------------------ JSON legível */

export function JsonVisor({ valor }: { valor: unknown }) {
  const texto = JSON.stringify(valor, null, 2);
  const linhas = texto.split("\n");
  return (
    <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-[family-name:var(--font-mono)] text-xs leading-relaxed text-ink-2">
      {linhas.map((l, i) => {
        const m = /^(\s*)("[^"]+")(:\s*)(.*)$/.exec(l);
        if (!m) return <div key={i}>{l}</div>;
        const [, ind, k, sep, resto] = m;
        const numero = /^-?\d+(\.\d+)?,?$/.test(resto ?? "");
        return (
          <div key={i}>
            {ind}
            <span className="json-k">{k}</span>
            {sep}
            {numero ? <span className="json-n">{resto}</span> : resto}
          </div>
        );
      })}
    </pre>
  );
}

/* ------------------------------------------------------------------ diferenças entre versões */

function achatar(obj: unknown, prefixo = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      for (const [kk, vv] of achatar(v, prefixo ? `${prefixo}.${k}` : k)) out.set(kk, vv);
    }
  } else {
    out.set(prefixo, JSON.stringify(obj));
  }
  return out;
}

interface Mudanca {
  campo: string;
  antes: string | undefined;
  depois: string | undefined;
}

function mudancas(anterior: Versao, atual: Versao): Mudanca[] {
  const a = achatar(anterior.dados);
  const b = achatar(atual.dados);
  const campos = new Set([...a.keys(), ...b.keys()]);
  const out: Mudanca[] = [];
  for (const c of campos) {
    if (c === "atualizacao") continue;
    if (a.get(c) !== b.get(c)) out.push({ campo: c, antes: a.get(c), depois: b.get(c) });
  }
  return out;
}

function VersoesDoc({ chave }: { chave: string }) {
  const versoes = useVersoes(chave);
  if (versoes.isPending) return <p className="text-sm text-ink-3">Carregando versões…</p>;
  if (versoes.error) return <p className="text-sm text-crit">Não consegui ler as versões.</p>;
  const lista = versoes.data;
  return (
    <ol className="grid">
      {lista.map((v, i) => {
        const anterior = i > 0 ? lista[i - 1] : undefined;
        const mud = anterior ? mudancas(anterior, v) : [];
        return (
          <li
            key={`${v.lado}-${v.arquivoId}-${v.atualizacao}`}
            className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 border-t py-2.5 first:border-t-0"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-2.5 rounded-full border-2 border-primary"
            />
            <div className="min-w-0">
              <p className="text-sm">
                <b>Versão {i + 1}</b> · arquivo #{v.arquivoId} · atualizada pela Receita em{" "}
                {dataHoraBR(v.atualizacao)}
              </p>
              {anterior === undefined ? (
                <p className="text-xs text-ink-3">
                  Primeira vez que a Receita entregou este documento à integração.
                </p>
              ) : mud.length === 0 ? (
                <p className="text-xs text-ink-3">
                  Reprocessada pela Receita sem mudança de valor.
                </p>
              ) : (
                <ul className="mt-1 grid gap-0.5 text-xs">
                  {mud.map((m) => (
                    <li key={m.campo}>
                      <span className="font-[family-name:var(--font-mono)]">{m.campo}</span>:{" "}
                      {m.antes ?? "—"} → <b>{m.depois ?? "—"}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ detalhe */

function Valores({ d, hoje }: { d: Documento; hoje: string }) {
  const linhas: [string, ReactNode][] =
    d.lado === "debito"
      ? [
          ["Apurado", <b key="a">{brl(d.apurado)}</b>],
          ["Extinto", brl(d.extinto)],
          ["Suspenso", brl(d.suspenso)],
          ["Saldo devedor", <b key="s">{brl(d.saldo)}</b>],
        ]
      : [
          ["Apurado", <b key="a">{brl(d.apurado)}</b>],
          [
            "A apropriar",
            `${brl(d.aApropriar)}${d.aApropriar && d.registro ? ` · ${dias(d.registro, hoje)} dias desde o registro` : ""}`,
          ],
          ["Apropriado", brl(d.apropriado)],
          ["Utilizado", brl(d.utilizado)],
          ["Saldo credor", brl(d.saldoCredor)],
        ];
  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
      {linhas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="mb-1.5 tabular sm:mb-0">{v}</dd>
        </div>
      ))}
      <dt className="text-ink-3">Emissão</dt>
      <dd className="mb-1.5 sm:mb-0">{dataBR(d.emissao)}</dd>
      <dt className="text-ink-3">Registro na Receita</dt>
      <dd className="mb-1.5 sm:mb-0">{dataHoraBR(d.registro)}</dd>
      <dt className="text-ink-3">Última atualização</dt>
      <dd>{dataHoraBR(d.atualizacao)}</dd>
    </dl>
  );
}

function NotaDetalhe({ chave }: { chave: string }) {
  const { dados, hoje } = useDocumentos();
  const emitidos = useEmitidos();
  const diags = useDiagnosticos();
  const versoes = useVersoes(chave);
  const cadastros = useCadastros();
  const docs = dados?.porChave.get(chave) ?? [];
  const principal = docs[0];
  const emitido = useMemo(
    () => emitidos.data?.find((e) => e.chave === chave),
    [emitidos.data, chave],
  );
  const diag = diags.data?.get(chave);

  if (!principal) {
    return (
      <SheetHeader>
        <SheetTitle>Documento não encontrado</SheetTitle>
        <SheetDescription className="break-all">{chave}</SheetDescription>
      </SheetHeader>
    );
  }

  const cnpj = emitente(chave);
  const ultimaVersao = versoes.data?.at(-1);
  const danfse = (emitido?.dados?.["danfse"] ?? null) as Record<string, unknown> | null;
  const ibscbs = (danfse?.["ibscbs"] ?? null) as Record<string, unknown> | null;

  return (
    <div className="grid gap-5 pb-6">
      <SheetHeader className="pr-8 text-left">
        <span className="eyebrow">
          {docs.map((d) => (d.lado === "debito" ? "Débito" : "Crédito")).join(" e ")} · PA{" "}
          {paBR(principal.pa)}
        </span>
        <SheetTitle className="text-[22px]">{descDoc(principal)}</SheetTitle>
        <SheetDescription>
          {emitidaPelaEmpresa(chave) ? (
            "Emitida pela própria empresa"
          ) : (
            <>
              Emitente <b>{nomeFornecedor(cnpj, cadastros.data?.get(cnpj))}</b>
              {cadastros.data?.get(cnpj)?.razaoSocial ? ` · ${cnpjFmt(cnpj)}` : ""}
              {localFornecedor(cadastros.data?.get(cnpj))
                ? ` · ${localFornecedor(cadastros.data?.get(cnpj)) ?? ""}`
                : ""}
              {sinaisFornecedor(cadastros.data?.get(cnpj))
                .filter((s) => s.tom !== "neutro")
                .map((s) => (
                  <span key={s.texto} className="ml-2 inline-block align-middle" title={s.dica}>
                    <Estado tom={s.tom}>{s.texto}</Estado>
                  </span>
                ))}
            </>
          )}
        </SheetDescription>
      </SheetHeader>

      {diag === "exportacao_com_cbs" && (
        <div className="grid gap-1.5 rounded-lg bg-crit-soft p-3 text-sm">
          <Estado tom="crit">Exportação com CBS apurada</Estado>
          <p>
            Tomador no ERP: <b>{emitido?.tomadorNome ?? "—"}</b> ({emitido?.tomadorPais ?? "—"}).
            Valor {brl(emitido?.valorOperacao ?? 0)}; CBS no ERP {brl(0)}; CBS na Receita{" "}
            <b>{brl(principal.apurado)}</b>
            {emitido?.valorOperacao
              ? ` (${pct((principal.apurado / 0.009 / emitido.valorOperacao) * 100, 2)} do valor como base)`
              : ""}
            .
          </p>
          {ibscbs && (
            <p className="text-ink-2">
              Na NFS-e transmitida: tomador <b>{String(danfse?.["tomador_na_nfse"] ?? "—")}</b>,
              local {String(danfse?.["local_prestacao"] ?? "—")}, CST/cClassTrib{" "}
              <b>
                {String(ibscbs["cst"] ?? "—")}/{String(ibscbs["cclasstrib"] ?? "—")}
              </b>
              .
            </p>
          )}
        </div>
      )}

      <div>
        <span className="eyebrow">Chave de acesso</span>
        <div
          className="mt-1.5 flex flex-wrap font-[family-name:var(--font-mono)] text-[13px]"
          aria-label={chave}
        >
          {partesChave(chave).map((p) => (
            <span key={p.rotulo} className="chave-seg" data-destaque={p.destaque} title={p.rotulo}>
              {p.bruto}
            </span>
          ))}
        </div>
        <dl className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-3.5 gap-y-1.5 text-xs">
          {partesChave(chave)
            .filter((p) => p.rotulo !== "Dígito")
            .map((p) => (
              <div key={p.rotulo}>
                <dt className="text-ink-3">{p.rotulo}</dt>
                <dd className="break-words font-[family-name:var(--font-mono)]">{p.legivel}</dd>
              </div>
            ))}
        </dl>
      </div>

      {docs.map((d) => (
        <div key={d.lado}>
          <span className="eyebrow">
            {d.lado === "debito" ? "Débito de CBS" : "Crédito de CBS"}
          </span>
          <div className="mt-2">
            <Valores d={d} hoje={hoje} />
          </div>
        </div>
      ))}

      <div>
        <span className="eyebrow">Versões entregues pela Receita</span>
        <div className="mt-1.5">
          <VersoesDoc chave={chave} />
        </div>
      </div>

      <div>
        <span className="eyebrow">Como veio da Receita</span>
        <div className="mt-1.5">
          <JsonVisor valor={ultimaVersao?.dados ?? itemComoRFB(principal)} />
        </div>
        <p className="mt-1.5 text-xs text-ink-3">
          {ultimaVersao
            ? `Item exato da versão mais recente (arquivo #${ultimaVersao.arquivoId}). Campos de valor zerados não vêm no JSON da Receita.`
            : "Reconstruído a partir dos campos gravados pela integração."}
        </p>
      </div>
    </div>
  );
}
