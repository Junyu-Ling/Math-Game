# AXIOM · 数理牌桌

四个本地可玩的数学桌游桌面：达芬奇密码、Flip 7、21 点、24 点。
邮箱登录前端已接好；不接 Supabase。账号与筹码以后走你自己的 API + Redis。

## 启动前端

```bash
npm install
npm run dev
```

浏览器打开终端里给出的地址（默认 `http://localhost:5173`）。

未配置 `VITE_API_URL` 时，注册/登录走浏览器 localStorage（验证码 `000000`），达芬奇只能练人机。

## 匹配联机（达芬奇）

1. 启动 Redis，再 `cd server && npm start`  
2. 项目根 `.env`：`VITE_API_URL=http://localhost:8787`，重启 `npm run dev`  
3. 用自己的邮箱或 GitHub 登录后点「匹配联机」

完整步骤见 [docs/BACKEND.md](docs/BACKEND.md)。线上站点目前只开 GitHub 登录；匹配需要另外部署 `server/` 后在 Vercel 填 `MATCH_WS_URL`。

## 当前范围

- 达芬奇：登录 + Redis 匹配 + WebSocket 联机（人机练习仍可用）
- Flip 7 / 21 点 / 24 点：本地规则
- 邮箱注册 / 验证码 / 账号与筹码
