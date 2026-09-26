import { motion } from "framer-motion";
import { Bot, LoaderCircle, MessagesSquare, SendHorizontal, Sparkles, X } from "lucide-react";
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { useI18n } from "../i18n";
import { api, type AnalysisResult, type ChatMessage } from "../lib/api";
import { Drawer } from "./ui";

const BREAK = /<br\s*\/?>/gi;
// "-", "*", "•", en and em dashes, "1." and "1)" start a list item.
const BULLET = /^\s*([-*•–—]|\d+[.)])\s+/;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Minimal, safe rendering of the assistant's markdown: paragraphs, bullets, tables and **bold**. */
function RichText({ text }: { text: string }) {
  const inline = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
    );
  const cell = (value: string) => value.split(BREAK).map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.trim())}</Fragment>);
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const rows = block.split("\n").filter((l) => l.trim());
        if (rows.length >= 2 && rows.every((l) => l.trim().startsWith("|"))) {
          const [head, ...rest] = rows.filter((l) => !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).map(cells);
          return (
            <div key={i} className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>{head.map((c, j) => <th key={j} className="px-3 py-2 font-semibold">{cell(c)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rest.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="px-3 py-2 align-top">{cell(c)}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          );
        }
        // A block may mix a heading line with the list below it: consecutive list lines form one list.
        const groups: { list: boolean; lines: string[] }[] = [];
        for (const line of block.replace(BREAK, "\n").split("\n").filter((l) => l.trim())) {
          const list = BULLET.test(line);
          const last = groups[groups.length - 1];
          if (last?.list === list) last.lines.push(line);
          else groups.push({ list, lines: [line] });
        }
        return (
          <Fragment key={i}>
            {groups.map((group, j) =>
              group.list ? (
                <ul key={j} className="space-y-1">
                  {group.lines.map((l, k) => (
                    <li key={k} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-500" /><span>{inline(l.replace(BULLET, ""))}</span></li>
                  ))}
                </ul>
              ) : (
                <p key={j}>{group.lines.map((l, k) => <Fragment key={k}>{k > 0 && <br />}{inline(l.replace(/^#+\s*/, ""))}</Fragment>)}</p>
              ),
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export interface ChatHandle {
  /** Sends a question, e.g. a suggestion picked outside the panel. */
  ask: (question: string) => void;
}

/** `patient` switches to plain-language copy and patient suggestions (the backend picks the matching prompt by role). */
export function ChatPanel({ result, open, onClose, patient = false, ref }: {
  result: AnalysisResult;
  open: boolean;
  onClose: () => void;
  patient?: boolean;
  ref?: Ref<ChatHandle>;
}) {
  const { t, list, language } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || messages) return;
    // A question sent before the history arrived already holds the history: keep it.
    api.chatHistory(result.case_id).then(
      (history) => setMessages((current) => current ?? history),
      () => setMessages((current) => current ?? []),
    );
  }, [open, messages, result.case_id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 300);
  }, [open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || streaming !== null) return;
    setDraft("");
    setError(null);
    setStreaming("");
    const history = messages ?? (await api.chatHistory(result.case_id).catch((): ChatMessage[] => []));
    const now = new Date().toISOString();
    setMessages((all) => [...(all ?? history), { id: -Date.now(), role: "user", content: message, language, author: null, created_at: now }]);
    let answer = "";
    try {
      await api.chat(result.case_id, message, language, (token) => {
        answer += token;
        setStreaming(answer);
      });
      setMessages((all) => [...(all ?? []), { id: Date.now(), role: "assistant", content: answer, language, author: null, created_at: new Date().toISOString() }]);
    } catch (e) {
      setError((e as Error).message || t("chat.unavailable"));
    } finally {
      setStreaming(null);
    }
  };

  useImperativeHandle(ref, () => ({ ask: (question: string) => void send(question) }));

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  };

  const empty = messages !== null && messages.length === 0 && streaming === null;

  return (
    <Drawer open={open} onClose={onClose} label={t(patient ? "chat.patientTitle" : "chat.title")}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-glow"><MessagesSquare className="size-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-ink">{t(patient ? "chat.patientTitle" : "chat.title")}</h2>
            <p className="text-xs text-slate-500">{t(patient ? "chat.patientSubtitle" : "chat.subtitle")}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label={t("common.close")}><X className="size-5" /></button>
      </div>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-6 py-5" aria-live="polite">
        {messages === null && <div className="flex justify-center py-10 text-slate-400"><LoaderCircle className="size-6 animate-spin" /></div>}
        {empty && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Sparkles className="size-8 text-emerald-500" />
            <p className="max-w-sm text-sm text-slate-500">{t(patient ? "chat.patientEmpty" : "chat.empty")}</p>
          </div>
        )}
        {messages?.map((m) => (
          <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white shadow-sm">{m.content}</div>
            ) : (
              <div className="flex max-w-[92%] gap-2">
                <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-slate-200"><Bot className="size-4" /></div>
                <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200/70"><RichText text={m.content} /></div>
              </div>
            )}
          </motion.div>
        ))}
        {streaming !== null && (
          <div className="flex max-w-[92%] gap-2">
            <div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-slate-200"><Bot className="size-4" /></div>
            <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-200/70">
              {streaming ? <RichText text={streaming} /> : <span className="flex items-center gap-2 text-slate-400"><LoaderCircle className="size-4 animate-spin" /> {t("chat.thinking")}</span>}
            </div>
          </div>
        )}
        {error && <div role="alert" className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
      </div>

      <div className="border-t border-slate-200/70 bg-white/70 px-6 py-4">
        {(empty || (messages?.length ?? 0) < 2) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {list<string>(patient ? "chat.patientSuggestions" : "chat.suggestions").map((s) => (
              <button key={s} type="button" disabled={streaming !== null} onClick={() => send(s)} className="chip bg-emerald-50 py-1.5 text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t(patient ? "chat.patientPlaceholder" : "chat.placeholder")}
            className="field resize-none"
            aria-label={t(patient ? "chat.patientPlaceholder" : "chat.placeholder")}
          />
          <button type="button" onClick={() => send(draft)} disabled={!draft.trim() || streaming !== null} className="btn-primary h-11 w-11 shrink-0 rounded-xl p-0" aria-label={t("chat.send")}>
            {streaming !== null ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t(patient ? "chat.patientNote" : "chat.note")}</p>
      </div>
    </Drawer>
  );
}
