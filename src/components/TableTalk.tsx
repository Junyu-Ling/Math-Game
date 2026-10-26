import { type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { isCpuId, type OnlinePlayer } from "../lib/lobby";
import { Avatar } from "./Avatar";

function facesOf(view: unknown): OnlinePlayer[] {
  const faces = (view as { faces?: OnlinePlayer[] } | null)?.faces;
  return Array.isArray(faces) ? faces : [];
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
  const { user } = useAuth();
  const { room, online } = useLobby();
  const cpu = isCpuId(playerId);
  const person =
    facesOf(room?.view).find((p) => p.id === playerId) ||
    online.find((p) => p.id === playerId) ||
    (user && String(user.id) === String(playerId) ? user : null);
  return (
    <div className="seat-talk">
      <Avatar src={cpu ? undefined : person?.avatar} name={name} size={28} />
      {children}
    </div>
  );
}
