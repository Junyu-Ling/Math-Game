import { type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { isCpuId, type OnlinePlayer } from "../lib/lobby";
import { Avatar } from "./Avatar";

type Face = {
  id?: string;
  name?: string;
  login?: string;
  avatar?: string;
  email?: string;
};

function facesOf(view: unknown): Face[] {
  const faces = (view as { faces?: Face[] } | null)?.faces;
  return Array.isArray(faces) ? faces : [];
}

export function accountId(person: Face | null | undefined, fallback = "PLAYER") {
  if (!person) return fallback;
  const login = String(person.login || "").trim();
  if (login) return login;
  const email = String(person.email || "").trim();
  const local = email.includes("@") ? email.slice(0, email.indexOf("@")) : email;
  if (local) return local;
  const name = String(person.name || "").trim();
  if (name && name !== "YOU" && name !== "PLAYER") return name;
  return name || fallback;
}

function isSelfId(playerId: string, userId?: string) {
  const id = String(playerId);
  if (id === "you") return true;
  return Boolean(userId && id === String(userId));
}

export function useSeatFace(playerId: string, fallbackName: string) {
  const { user } = useAuth();
  const { room, online } = useLobby();
  const cpu = isCpuId(playerId);
  if (cpu) return { cpu: true, avatar: undefined as string | undefined, label: fallbackName };
  const fromRoom = facesOf(room?.view).find((p) => String(p.id) === String(playerId));
  const fromOnline = online.find((p: OnlinePlayer) => p.id === playerId);
  const self = isSelfId(playerId, user?.id) ? user : null;
  const person = fromRoom || fromOnline || self;
  return {
    cpu: false,
    avatar: person?.avatar,
    label: accountId(person, fallbackName),
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
  const face = useSeatFace(playerId, name);
  return (
    <div className="seat-talk">
      <Avatar src={face.cpu ? undefined : face.avatar} name={face.label} size={28} />
      <b className="seat-talk-id">{face.label}</b>
      {children != null && children !== false && children !== "" ? (
        <span className="seat-talk-meta">{children}</span>
      ) : null}
    </div>
  );
}
