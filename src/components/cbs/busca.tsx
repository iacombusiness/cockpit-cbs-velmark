import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, FileCheck2, FileText, HeartPulse, Landmark } from "lucide-react";
import { useMemo } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAbrirNota } from "@/components/cbs/nota-contexto";
import { brl, cnpjFmt, paBR } from "@/lib/cbs/formato";
import { useCadastros, useDocumentos } from "@/lib/cbs/consultas";
import { descDoc, emitente } from "@/lib/cbs/modelo";

/** Busca global (Ctrl K): telas, períodos e qualquer documento por número, chave ou CNPJ. */
export function BuscaGlobal({
  aberta,
  aoMudar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
}) {
  const navegar = useNavigate();
  const abrirNota = useAbrirNota();
  const { dados } = useDocumentos();
  const cadastros = useCadastros().data;

  const pas = useMemo(
    () => [...new Set((dados?.todos ?? []).map((d) => d.pa))].sort().reverse(),
    [dados],
  );
  const docs = useMemo(() => {
    const vistos = new Set<string>();
    return (dados?.todos ?? []).filter((d) =>
      vistos.has(d.chave) ? false : (vistos.add(d.chave), true),
    );
  }, [dados]);

  const ir = (fazer: () => void) => {
    aoMudar(false);
    fazer();
  };

  return (
    <CommandDialog open={aberta} onOpenChange={aoMudar}>
      <CommandInput placeholder="Número da nota, chave, CNPJ, período (10/2026) ou tela" />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>
          Nada encontrado. Tente o número da nota, parte da chave ou do CNPJ, ou um período.
        </CommandEmpty>
        <CommandGroup heading="Telas">
          <CommandItem
            value="tela periodo cockpit prazos decisoes"
            onSelect={() => ir(() => void navegar({ to: "/periodo" }))}
          >
            <CalendarDays /> Período
          </CommandItem>
          <CommandItem
            value="tela notas de saida checagem erp"
            onSelect={() => ir(() => void navegar({ to: "/saidas" }))}
          >
            <FileCheck2 /> Notas de saída
          </CommandItem>
          <CommandItem
            value="tela creditos fornecedores aging"
            onSelect={() => ir(() => void navegar({ to: "/creditos" }))}
          >
            <Landmark /> Créditos
          </CommandItem>
          <CommandItem
            value="tela conexao receita api consulta arquivos notas explorador"
            onSelect={() => ir(() => void navegar({ to: "/saude" }))}
          >
            <HeartPulse /> Conexão e notas
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Períodos">
          {pas.map((pa) => (
            <CommandItem
              key={pa}
              value={`periodo pa ${paBR(pa)} ${pa}`}
              onSelect={() => ir(() => void navegar({ to: "/periodo", search: { pa } }))}
            >
              <CalendarDays /> PA {paBR(pa)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Documentos">
          {docs.map((d) => (
            <CommandItem
              key={d.chave}
              value={`${descDoc(d)} ${d.chave} ${emitente(d.chave)} ${cnpjFmt(emitente(d.chave))} ${cadastros?.get(emitente(d.chave))?.razaoSocial ?? ""} ${cadastros?.get(emitente(d.chave))?.nomeFantasia ?? ""}`}
              onSelect={() => ir(() => abrirNota(d.chave))}
            >
              <FileText />
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">
                  {descDoc(d)}{" "}
                  <span className="text-ink-3">
                    {cadastros?.get(emitente(d.chave))?.razaoSocial
                      ? `· ${cadastros.get(emitente(d.chave))?.razaoSocial ?? ""} `
                      : ""}
                    · {d.lado === "debito" ? "débito" : "crédito"} · PA {paBR(d.pa)}
                  </span>
                </span>
                <span className="tabular text-ink-2">{brl(d.apurado)}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
