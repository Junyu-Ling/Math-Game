import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import type { User } from "../lib/api";
import { GAME_LABEL, lobbyApi, type HistoryRow } from "../lib/lobby";
import { cancelQueuedRecording, queueRecording } from "../lib/recording";
import { Avatar } from "../components/Avatar";

type Tab = "profile" | "records";
type Gender = NonNullable<User["gender"]> | "";

function readPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 96;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that photo"));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.fillStyle = "#e7e2da";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo"));
    };
    img.src = url;
  });
}

export function Account() {
  const { user, loading, token, updateProfile } = useAuth();
  const { openReplay } = useLobby();
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [gender, setGender] = useState<Gender>("private");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [histErr, setHistErr] = useState("");

  useEffect(() => {
    if (!user) return;
    setName(user.name || user.login || user.email.split("@")[0] || "");
    setAvatar(user.avatar || "");
    setGender(user.gender === "male" || user.gender === "female" ? user.gender : "private");
  }, [user]);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    lobbyApi
      .history(token)
      .then((res) => {
        if (stop) return;
        const rows = (res as { history?: HistoryRow[] }).history;
        setHistory(Array.isArray(rows) ? rows.slice(0, 100) : []);
      })
      .catch((err: Error) => {
        if (!stop) setHistErr(err.message);
      });
    return () => {
      stop = true;
    };
  }, [token]);

  if (loading && !user) {
    return (
      <div className="page">
        <p className="kicker">Account</p>
        <h1>…</h1>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="page">
        <p className="kicker">Account</p>
        <h1>Not signed in</h1>
        <p className="lede">Log in to edit your profile and open your records.</p>
        <div className="row-actions">
          <Link className="btn" to="/login">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  async function saveProfile() {
    setSaving(true);
    setNotice("");
    try {
      await updateProfile({
        name: name.trim(),
        avatar,
        gender: gender === "male" || gender === "female" ? gender : "private",
      });
      setNotice("Saved");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function saveFile(row: HistoryRow) {
    setHistErr("");
    queueRecording(row.id);
    try {
      await openReplay(row.id);
    } catch (err) {
      cancelQueuedRecording();
      setHistErr(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <div className="page account-page">
      <p className="kicker">Account</p>
      <h1>{name || user.email}</h1>
      <div className="account-tabs" role="tablist" aria-label="Account">
        <button className={tab === "profile" ? "is-on" : ""} type="button" role="tab" aria-selected={tab === "profile"} onClick={() => setTab("profile")}>
          Profile
        </button>
        <button className={tab === "records" ? "is-on" : ""} type="button" role="tab" aria-selected={tab === "records"} onClick={() => setTab("records")}>
          Records
        </button>
      </div>

      {tab === "profile" ? (
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="profile-photo">
            <Avatar src={avatar} name={name || user.email} size={72} />
            <label className="btn btn-ghost">
              Change photo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void readPhoto(file)
                    .then(setAvatar)
                    .catch((err: Error) => setNotice(err.message));
                }}
              />
            </label>
            {avatar ? (
              <button className="btn btn-ghost" type="button" onClick={() => setAvatar("")}>
                Remove
              </button>
            ) : null}
          </div>
          <label className="profile-field">
            <span>Username</span>
            <input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset className="profile-gender">
            <legend>Gender</legend>
            {(
              [
                ["male", "Male"],
                ["female", "Female"],
                ["private", "Private"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`btn${gender === value ? "" : " btn-ghost"}`}
                type="button"
                aria-pressed={gender === value}
                onClick={() => setGender(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>
          <div className="row-actions">
            <button className="btn" type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {notice ? <p className={notice === "Saved" ? "msg" : "msg err"}>{notice}</p> : null}
        </form>
      ) : (
        <div className="profile-records">
          <p className="lede">The last 100 games. Watch one here, or save it to this computer as an MP4.</p>
          {histErr ? <p className="msg err">{histErr}</p> : null}
          {history.length === 0 ? <p>No saved games yet.</p> : null}
          <div className="record-list">
            {history.map((row) => {
              const won = row.winnerId && row.winnerId === row.you;
              const draw = !row.winnerId;
              const result = draw ? "Draw" : won ? "Win" : "Loss";
              const when = new Date(row.at).toLocaleString();
              return (
                <div key={row.id} className="record-row">
                  <div>
                    <strong>{GAME_LABEL[row.game] || row.game}</strong>
                    <span>{result}</span>
                    <em>{when}</em>
                    {row.names?.length ? <em>{row.names.join(" · ")}</em> : null}
                  </div>
                  <div className="record-actions">
                    <button className="btn" type="button" onClick={() => void openReplay(row.id).catch((err: Error) => setHistErr(err.message))}>
                      Watch
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => void saveFile(row)}>
                      Save MP4
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
