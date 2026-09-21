# 后端配置（邮箱登录 + Redis 匹配联机）

达芬奇密码正式模式是：**邮箱登录 → WebSocket 入队 → Redis `queue:coda` 凑齐两人 → 服务端权威同步对局**。

前端必须能连上 API。在**项目根目录**放 `.env`（可从 `.env.example` 复制）：

```
VITE_API_URL=http://localhost:8787
```

改完后重新执行 `npm run dev`。登录页应显示 `LIVE API`，不是 `LOCAL MOCK`。

---

## 演示账号（开箱即用）

启动 `server/` 后会自动写入两个本地账号（仅本机 `server/data/users.json`）：

| 邮箱 | 密码 |
| --- | --- |
| `player1@axiom.local` | `axiom123` |
| `player2@axiom.local` | `axiom123` |

自己注册也可以：未配 SMTP 时，6 位验证码打印在运行 `npm start` 的**后端终端**。

---

## 怎么打一局匹配联机

1. 先按下面「安装 Redis + 启动 API」把 `8787` 跑起来。  
2. 项目根目录配置 `VITE_API_URL`，启动前端。  
3. 浏览器 A：打开 `/login`，用 `player1@axiom.local` / `axiom123`。  
4. 进入达芬奇 → 选黑白张数 → **匹配联机**。  
5. 浏览器 B（无痕或另一台机器）：登录 `player2@axiom.local` → 同样点匹配。  
6. Redis 弹出两人后自动开局；猜拳、摸牌、猜牌都走 WebSocket，对手牌面是掩码的。

练习人机仍可在未登录时点「练习人机」。

---

## 一、安装 Redis

Windows 任选其一：

- [Memurai](https://www.memurai.com/)（Redis 兼容）
- Docker：`docker run -d --name redis -p 6379:6379 redis:7`
- WSL：`sudo apt install redis-server`

确认：`redis-cli ping` 应返回 `PONG`。

---

## 二、启动本仓库 API

```bash
cd server
copy .env.example .env
npm install
npm start
```

默认：

- HTTP `http://localhost:8787`
- WebSocket `ws://localhost:8787/ws`
- 健康检查 `http://localhost:8787/api/health`（含 Redis `PING`）

`server/.env`：

```
PORT=8787
JWT_SECRET=请改成足够长的随机串
REDIS_URL=redis://127.0.0.1:6379
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Axiom <no-reply@yourdomain.com>
```

SMTP 留空：注册成功后，验证码会写在注册页上，并打印在本终端。生产环境务必填 SMTP 并更换 `JWT_SECRET`。

没有 Redis 时，验证码和匹配会先走内存（重启进程会清空排队）。装好 Redis 并连上 `6379` 后会自动改走 Redis。

---

## GitHub 正式登录（沿用你 TOEFL 站那套 OAuth）

流程与 TOEFL6666 相同：`/api/auth/github/start` → GitHub 授权 → `/api/auth/github/callback` → 写入用户并跳回前端。

可继续用托福站那套 GitHub OAuth App（Client ID `Ov23li2dm43mGcix56sF`）。不要用后来新建的 `Ov231ijfLsR5fwRzdTxg`：那是新应用，会强制重新登录 GitHub，容易停在 Uh oh 页。

在**托福那个** OAuth App 的 Redirect URIs 里再加（可同时保留托福域名）：

```
http://localhost:8787/api/auth/github/callback
https://math31415926.vercel.app/api/auth/github/callback
```

GitHub → Settings → Developer settings → OAuth Apps → 打开**托福正在用的那个**，Redirect URIs 加上面两条（托福原有的回调不用删）。

`server/.env`：

```
GITHUB_CLIENT_ID=Ov23li2dm43mGcix56sF
GITHUB_CLIENT_SECRET=（和托福 Vercel 里同一份，不要提交仓库）
GITHUB_CALLBACK_URL=http://localhost:8787/api/auth/github/callback
FRONTEND_ORIGIN=http://localhost:5173
```

改完重启 `npm run server`。健康检查 `github: true` 才算开通。

登录页点「使用 GitHub 登录」。首次授权会创建正式账号（`gh_<id>`），筹码 1000。若 GitHub 邮箱已在本站注册过，会绑定到同一条用户。

### 部署到 Vercel（math31415926.vercel.app）

GitHub Pages 不能跑登录回调。要用 Vercel 连 `Junyu-Ling/Math-Game`。

1. 打开托福正在用的那个 GitHub OAuth App（Client ID `Ov23li2dm43mGcix56sF`），Redirect URIs **再加一条**：  
   `https://math31415926.vercel.app/api/auth/github/callback`  
   Homepage 可以仍是托福域名，不影响。

2. Vercel（Math Game 项目）→ Settings → Environment Variables：

```
GITHUB_CLIENT_ID=Ov23li2dm43mGcix56sF
GITHUB_CLIENT_SECRET=（从托福项目 Vercel 复制同一份，不要用新建 App 的 secret）
JWT_SECRET=请换成足够长的随机串
FRONTEND_ORIGIN=https://math31415926.vercel.app
```

**不要**在 Vercel 里填 `GITHUB_CALLBACK_URL=http://localhost:8787/...`，否则线上会跳回本机。不填 CALLBACK 时会自动用当前域名。

3. 重新 Deploy。打开  
   `https://math31415926.vercel.app/api/health`  
   应看到 `"github": true`。

4. 网站 `/login` → 使用 GitHub 登录。

---

## 线上开通匹配（Vercel 不能跑 WebSocket）

`math31415926.vercel.app` 只负责页面和 GitHub 登录。匹配要对局，需要一台**一直开着的 Node**（Railway / Render / Fly）跑 `server/`，再加 Redis。

1. 部署 `server/`（启动命令 `npm start`，监听 `PORT`）。配 Redis，`REDIS_URL` 填托管 Redis。  
2. **`JWT_SECRET` 必须和 Vercel 里那份完全相同**，否则 GitHub 登录拿到的 token 无法入队。  
3. `FRONTEND_ORIGIN=https://math31415926.vercel.app`  
4. 服务起来后 WebSocket 地址类似 `wss://你的主机/ws`。  
5. Vercel 环境变量增加（Production）：

```
MATCH_WS_URL=wss://你的主机/ws
```

不必重编前端：健康检查会变成 `"match": true`，达芬奇页「匹配联机」就会连这台机。

本地现在就能匹配：开 Redis + `npm run server` + 根目录 `VITE_API_URL=http://localhost:8787`。

线上匹配联机仍需要独立 WebSocket 服务；GitHub 登录本身走 HTTPS `/api` 即可。

---

## 三、账号接口

成功 HTTP 200；失败 `{ "error": "中文原因" }`。

### `POST /api/auth/register`

```json
{ "email": "a@b.com", "password": "至少6位" }
```

返回 `{ "needCode": true }`。验证码进 Redis `verify:<email>`，TTL 600 秒。

### `POST /api/auth/verify`

```json
{ "email": "a@b.com", "code": "123456" }
```

返回 JWT + `user`（含 `chips`）。

### `POST /api/auth/login`

同上形状。演示账号直接走这一步。

### `GET /api/me`

`Authorization: Bearer <token>`

### `PATCH /api/me/chips`

```json
{ "chips": 1200 }
```

---

## 四、匹配与对局（已实现）

- Redis List `queue:coda`：登录用户入队；凑齐 2 人 `RPOP` 成桌。  
- `room:<id>`：对局快照，TTL 2 小时。  
- WebSocket `ws://<API>/ws?token=<JWT>`  

客户端消息：

```json
{ "type": "queue", "useJokers": true, "black": 2, "white": 2 }
{ "type": "leave" }
{ "type": "action", "roomId": "coda_...", "action": { "type": "draw" } }
```

`action.type`：`draw` | `select` | `guess` | `continue` | `stay` | `slot` | `rps`。

服务端下发：`queued` / `matched` / `state`（按座位掩码）/ `left` / `error`。  
整理阶段由服务端计时 5 秒后 `finishArrange`，客户端不能提前入列。

---

## 五、SMTP（真邮箱验证码）

### Resend

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_你的APIKey
SMTP_FROM=Axiom <noreply@你的域名>
```

### 163 / QQ

用授权码，不是登录密码。`SMTP_HOST=smtp.163.com` 或 `smtp.qq.com`。

---

## 六、常见问题

**登录页仍是 LOCAL MOCK**  
根目录没有 `VITE_API_URL`，或改完没重启 Vite。

**匹配提示 WebSocket 失败**  
`8787` 没开，或 Redis 挂了（`/api/health` 会失败）。

**两个人都在排队却不成局**  
必须是两个**不同账号**。同一账号第二个窗口会顶掉前一个连接。

**Redis 连不上**  
先保证 `6379`，或改 `REDIS_URL`。
