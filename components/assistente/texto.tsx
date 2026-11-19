import { Fragment, type ReactNode } from "react";

/**
 * Mostra a resposta do assistente com o pouco de Markdown que os modelos usam
 * (negrito, listas, títulos e tabelas). Monta elementos do React: nada de
 * innerHTML, então texto vindo do modelo (ou dos dados) não vira HTML.
 */
function emLinha(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return <strong key={i}>{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2) {
      return (
        <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">
          {parte.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

const celulas = (linha: string) =>
  linha
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function TextoAssistente({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;

  while (i < linhas.length) {
    const linha = linhas[i];

    if (!linha.trim()) {
      i++;
      continue;
    }

    // Tabela: cabeçalho | separador |---| e linhas.
    if (linha.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] ?? "")) {
      const cab = celulas(linha);
      const corpo: string[][] = [];
      i += 2;
      while (i < linhas.length && linhas[i].trim().startsWith("|")) corpo.push(celulas(linhas[i++]));
      blocos.push(
        <div key={blocos.length} className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200">
                {cab.map((c, j) => (
                  <th key={j} className="px-2 py-1.5 font-semibold text-slate-700">
                    {emLinha(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((l, k) => (
                <tr key={k} className="border-b border-slate-100 last:border-0">
                  {l.map((c, j) => (
                    <td key={j} className="px-2 py-1.5 align-top text-slate-700">
                      {emLinha(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const lista = /^\s*([-*•]|\d+[.)])\s+/;
    if (lista.test(linha)) {
      const numerada = /^\s*\d/.test(linha);
      const itens: string[] = [];
      while (i < linhas.length && lista.test(linhas[i])) itens.push(linhas[i++].replace(lista, ""));
      const Tag = numerada ? "ol" : "ul";
      blocos.push(
        <Tag key={blocos.length} className={numerada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
          {itens.map((t, k) => (
            <li key={k}>{emLinha(t)}</li>
          ))}
        </Tag>,
      );
      continue;
    }

    const titulo = /^#{1,4}\s+(.*)$/.exec(linha);
    if (titulo) {
      blocos.push(
        <p key={blocos.length} className="font-semibold text-slate-900">
          {emLinha(titulo[1])}
        </p>,
      );
      i++;
      continue;
    }

    // A primeira linha entra sempre (uma linha solta com "|" não trava o laço).
    const paragrafo: string[] = [linhas[i++]];
    while (
      i < linhas.length &&
      linhas[i].trim() &&
      !lista.test(linhas[i]) &&
      !linhas[i].trim().startsWith("|") &&
      !/^#{1,4}\s/.test(linhas[i])
    ) {
      paragrafo.push(linhas[i++]);
    }
    blocos.push(
      <p key={blocos.length}>
        {paragrafo.map((p, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {emLinha(p)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="space-y-2.5">{blocos}</div>;
}
