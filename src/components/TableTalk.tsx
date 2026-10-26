import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { isGameOver, useLobby } from "../context/LobbyContext";
import { isCpuId, type ChatLine } from "../lib/lobby";
import { Avatar } from "./Avatar";

const LIFE_MS = 5000;
const FADE_MS = 900;

export type TalkLine = { id: string; text: string; fading: boolean };

function asChat(view: unknown): ChatLine[] {
  const chat = (view as { chat?: ChatLine[] } | null)?.chat;
  return Array.isArray(chat) ? chat : [];
}

export function useTableTalk(playerId?: string | null) {
  const { room, sendAction } = useLobby();
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState("");
  const live = Boolean(room && !isGameOver(room));
  const chat = live ? asChat(room?.view) : [];

  useEffect(() => {
    if (!live || !chat.length) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [live, chat.length]);

  const line = useMemo(() => {
    if (!playerId) return null;
    const last = [...chat].reverse().find((m) => m.fromId === playerId);
    if (!last) return null;
    const age = now - last.at;
    if (age >= LIFE_MS + FADE_MS) return null;
    return { id: last.id, text: last.text, fading: age >= LIFE_MS };
  }, [chat, playerId, now]);

  function send() {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text || !live) return;
    void sendAction({ type: "chat", text });
    setDraft("");
  }

  return {
    live,
    line,
    draft,
    setDraft,
    send,
    onSubmit(event: FormEvent) {
      event.preventDefault();
      send();
    },
  };
}

export function SeatTalk({
  playerId,
  name,
  children,
}: {
  playerId: string;
  name: string;
  children?: ReactNode;
}) {
  const { line } = useTableTalk(playerId);
  const { online } = useLobby();
  const person = online.find((p) => p.id === playerId);
  const cpu = isCpuId(playerId);
  return (
    <div className="seat-talk">
      <Avatar src={cpu ? undefined : person?.avatar} name={name} size={28} />
      {children}
      {line ? (
        <span className={`seat-bubble${line.fading ? " fading" : ""}`} key={line.id}>
          {line.text}
        </span>
      ) : null}
    </div>
  );
}

export function TableChatBar() {
  const talk = useTableTalk();
  if (!talk.live) return null;
  return (
    <form className="table-chat" onSubmit={talk.onSubmit}>
      <input
        value={talk.draft}
        maxLength={80}
        placeholder="Say something…"
        onChange={(event) => talk.setDraft(event.target.value)}
        aria-label="Table chat"
      />
      <button className="btn btn-ghost" type="submit" disabled={!talk.draft.trim()}>
        Send
      </button>
    </form>
  );
}
