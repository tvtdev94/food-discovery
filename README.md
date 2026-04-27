<div align="center">

![Food Discovery Hero](public/readme/readme-hero-banner.png)

# 🍜 Food Discovery Assistant

### *"Hôm nay ăn gì?" — Trả lời trong 3 giây.*

**Trợ lý AI gợi ý ăn uống Việt Nam đầu tiên hiểu bạn thật sự.**
Nói tâm trạng — chọn ngân sách — nhận về 5 quán thật, gần bạn, kèm lý do tại sao phù hợp.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-Responses_API-412991?style=for-the-badge&logo=openai&logoColor=white)](https://platform.openai.com)
[![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

[Demo](#-demo) • [Tính năng](#-tính-năng-nổi-bật) • [Kiến trúc](#-kiến-trúc) • [Cài đặt](#-cài-đặt-nhanh) • [API](#-api-routes) • [Roadmap](#-roadmap)

</div>

---

## ✨ Tại sao có app này?

> *"Trưa nay ăn gì?" — câu hỏi tốn nhiều năng lượng nhất trong ngày.*

Google Maps cho bạn **danh sách quán**. Food Discovery cho bạn **một quyết định**.

| Vấn đề cũ | Cách của chúng tôi |
|---|---|
| Quá nhiều quán → tê liệt | **5 gợi ý** đã được AI lọc theo bối cảnh |
| Review chung chung | **Lý do cá nhân hoá**: trời mưa → gợi ý quán có mái che |
| Không biết quán nào còn mở | Tích hợp **giờ mở thực tế** từ Google Places |
| Tiếng Việt rời rạc | **VI-first**: hiểu "đói lắm rồi", "chán cơm", "ăn nhẹ" |

<div align="center">

![Features Showcase](public/readme/readme-features.png)

</div>

---

## 🌟 Tính năng nổi bật

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Hiểu bạn theo bối cảnh
Pass-1 dispatch tools đọc **vị trí + thời tiết + giờ trong ngày** trước khi gợi ý. Trời mưa? Đói? Buổi sáng? Mỗi gợi ý đều có *signal* riêng.

### ⚡ Streaming SSE thời gian thực
Server-Sent Events đẩy từng token ra UI. Không chờ — nhìn AI suy nghĩ live như ChatGPT.

### 📍 Vị trí chính xác đa nguồn
- HTML5 Geolocation (chính xác nhất)
- Reverse geocode qua Nominatim
- IP fallback qua ipapi.co
- Text search → tìm theo tên quận/đường

</td>
<td width="50%" valign="top">

### 💾 Persistent + Guest mode
Chat khách → đăng nhập → **merge tự động** lịch sử qua `device_id`. Không mất dữ liệu.

### 🛡️ Production-grade guardrails
- Rate limit per-device (Upstash sliding window)
- Daily budget cap cho Google Places API
- Webhook alerts khi sắp cháy túi
- Sentry + OpenTelemetry tracing

### 🇻🇳 VI-first DNA
Tone của bot ấm áp, hiểu slang Việt: "ăn cho đỡ rầu", "chiên cho đã đời". Không dịch máy — viết tay.

</td>
</tr>
</table>

---

## 🎯 Demo

<div align="center">

<img src="public/readme/readme-mascot.png" alt="Mascot" width="300"/>

> **User:** *"Đói lắm, gần Bách Khoa, dưới 50k thôi"*
>
> **Bot:** *"Hiểu rồi 🍜 5 quán mình chọn — đều dưới 50k, đi bộ 5 phút từ cổng Parabol:
> 1. **Phở Thìn — 38k** — đông sinh viên giờ này, nước trong
> 2. **Bún chả Tuyết — 45k** — mở 11h-14h, ăn lẹ
> 3. ..."*

</div>

---

## 🏗️ Kiến trúc

```mermaid
flowchart LR
    U[User] -->|SSE stream| API[/api/chat]
    API --> P1[Pass-1: Dispatch tools]
    P1 --> Tools{{location · weather · places}}
    Tools --> P2[Pass-2: Responses API]
    P2 -->|tokens| U
    API --> SB[(Supabase Postgres)]
    API --> R[(Upstash Redis)]
    Tools --> GP[Google Places New]
    Tools --> OM[Open-Meteo]
    Tools --> NM[Nominatim]
```

### Stack chi tiết

| Layer | Tech | Lý do |
|---|---|---|
| **Frontend** | Next.js 15 App Router · React 19 · Tailwind · shadcn/ui · Zustand | RSC + streaming + DX top |
| **Auth** | Supabase Auth (OAuth + device_id guest) | Free tier + RLS sẵn |
| **DB** | Supabase Postgres (6 tables, RLS, indexes) | SQL > NoSQL cho relational data |
| **Cache & RL** | Upstash Redis (sliding window) | Edge-native, REST API |
| **AI** | OpenAI Responses API (`gpt-4o-mini`) | Function calling + structured output |
| **Places** | Google Places (New) Text Search | Chất lượng dữ liệu VN tốt nhất |
| **Weather** | Open-Meteo (free, no key) | Đủ chính xác cho gợi ý |
| **Geocode** | Nominatim (OSM) | Free, có ToS — phải set User-Agent |
| **Observability** | Sentry + OpenTelemetry | Production-ready từ ngày đầu |
| **Deploy** | Vercel (Edge + Node runtimes) | Zero-config Next.js |

---

## 🚀 Cài đặt nhanh

### Yêu cầu
- Node.js **>= 20**
- pnpm **>= 9** (`npm i -g pnpm`)
- Tài khoản: [Supabase](https://supabase.com) · [Upstash](https://upstash.com) · [OpenAI](https://platform.openai.com) · [Google Cloud](https://console.cloud.google.com) (Places API New)

### 1. Clone & install

```bash
git clone https://github.com/tvtdev94/food-discovery.git
cd food-discovery
pnpm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Điền `.env.local`:

| Variable | Lấy ở đâu |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (giữ bí mật!) |
| `UPSTASH_REDIS_REST_URL` | Upstash console → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | same page |
| `OPENAI_API_KEY` | platform.openai.com |
| `OPENAI_MODEL` | mặc định: `gpt-4o-mini` |
| `GOOGLE_PLACES_API_KEY` | Google Cloud → Places API (New) |
| `NOMINATIM_USER_AGENT` | bất kỳ chuỗi: `food-discovery/1.0 your@email.com` |
| `PLACES_DAILY_BUDGET_USD` | mặc định `5` (~250 calls/day) |
| `ADMIN_KEY` | random string >= 8 ký tự |

### 3. Supabase migration

**Cách A — Supabase CLI (khuyên dùng):**

```bash
pnpm supabase login
pnpm supabase link --project-ref <your-project-ref>
pnpm supabase db push
```

**Cách B — SQL Editor:**

Mở Supabase Dashboard → SQL Editor → paste nội dung từ:
- `supabase/migrations/20260421000000_init.sql`
- `supabase/migrations/20260428000000_usage_log.sql`

Migration tạo **6 tables** (`conversations`, `messages`, `recommendations`, `favorites`, `preferences`, `places_cache`) + `usage_log` với RLS bật sẵn và indexes tối ưu.

### 4. Chạy dev

```bash
pnpm dev
# → http://localhost:3000
```

### 5. Health check

```bash
curl localhost:3000/api/health
# {"ok":true,"supabase":"ok","redis":"ok"}
```

---

## 📜 Commands

| Command | Mô tả |
|---|---|
| `pnpm dev` | Dev server (`localhost:3000`) |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (single run) |
| `pnpm test:watch` | Vitest watch mode |

---

## 🛣️ API Routes

### Chat
- `POST /api/chat` — **SSE stream**. `{ messages, location?, context? }` → pipeline: resolve-identity → persist-conv → dispatch-tools (pass-1) → responses-runner (pass-2) → emit SSE events.
- `POST /api/chat/prewarm` — Pre-warm cache khi location ready.

### Location
- `GET /api/location/active` — Active location từ conversation context.
- `GET /api/location/ip` — IP geolocation (ipapi.co).
- `GET /api/location/search?q=` — Text search + geocode (Nominatim).
- `GET /api/location/reverse?lat=&lng=` — Reverse geocode.

### Auth
- `GET /api/auth/callback` — Supabase OAuth callback.
- `GET|POST /api/auth/merge-guest` — Merge guest data sang authenticated user.

### History & Favorites
- `GET|POST /api/conversations` — List/create conversations.
- `GET /api/conversations/[id]/messages` — Messages + recs cho conversation.
- `GET|POST /api/favorites` — List / toggle favorite.

### Admin & Health
- `GET /api/admin/stats` — Usage stats 24h (cần `x-admin-key`).
- `GET /api/health` — Supabase + Redis connectivity.

---

## 🗂️ Cấu trúc thư mục

```
food-discovery/
├── app/                    # Next.js 15 App Router
│   ├── api/                # Route handlers
│   ├── auth/               # OAuth flows
│   ├── favorites/          # Favorites page
│   ├── history/            # History page
│   ├── login/              # Login page
│   ├── layout.tsx
│   └── page.tsx            # Home / chat
├── components/             # React UI
│   ├── chat/               # Chat shell, composer, cards
│   ├── auth/ · brand/ · location/ · history/ · favorites/
│   ├── empty-states/ · error-states/
│   └── ui/                 # shadcn primitives
├── hooks/                  # use-chat-stream, use-session, ...
├── lib/
│   ├── auth/               # Device-id + Supabase server client
│   ├── chat/               # Dispatch tools, runner, SSE emitter
│   ├── tools/              # places, weather, cache, rule-filter
│   ├── location/           # Geocoding helpers
│   ├── supabase/           # Server + client factories
│   └── observability/      # Sentry, OTel
├── supabase/migrations/    # DB schema (init + usage_log)
├── evals/                  # 30 VI eval queries
├── tests/                  # Vitest
├── docs/                   # PDR, code-standards, architecture, ...
└── plans/                  # Phase plans + reports
```

---

## 📊 Roadmap

- [x] **MVP** — Chat + 5 recs + favorites + history + auth
- [x] **Production guardrails** — Rate limit, budget cap, alerts, Sentry
- [x] **Pre-warm cache** — Hit cache thay vì call Places API mỗi request
- [x] **Eval suite** — 30 VI queries, kiểm tra regression
- [ ] **Personalization** — Học từ favorites + history → bias rec engine
- [ ] **Group orders** — "4 người ăn gì cùng?"
- [ ] **Reservation** — Tích hợp đặt bàn qua Foody/Now/Loship
- [ ] **PWA + offline** — Lưu favorites đọc được không mạng
- [ ] **Multilang** — EN/JA cho khách du lịch

Xem `docs/development-roadmap.md` để biết chi tiết.

---

## 📚 Documentation

| Doc | Nội dung |
|---|---|
| [`docs/project-overview-pdr.md`](docs/project-overview-pdr.md) | Product Design Requirements |
| [`docs/system-architecture.md`](docs/system-architecture.md) | Kiến trúc hệ thống chi tiết |
| [`docs/codebase-summary.md`](docs/codebase-summary.md) | Tóm tắt code structure |
| [`docs/code-standards.md`](docs/code-standards.md) | Coding conventions |
| [`docs/ops-runbook.md`](docs/ops-runbook.md) | Operations playbook |
| [`docs/project-changelog.md`](docs/project-changelog.md) | Changelog |
| [`docs/development-roadmap.md`](docs/development-roadmap.md) | Roadmap chi tiết |

---

## 🤝 Đóng góp

PRs welcome! Trước khi gửi:

1. Fork repo
2. Tạo branch: `git checkout -b feat/your-feature`
3. Commit: theo [Conventional Commits](https://www.conventionalcommits.org/)
4. Chạy: `pnpm typecheck && pnpm lint && pnpm test`
5. Push & mở PR

---

## 📝 License

MIT © [tvtdev94](https://github.com/tvtdev94)

---

<div align="center">

**Built with ❤️ in Vietnam — for everyone tired of saying "ăn gì cũng được"**

[⬆ Lên đầu trang](#-food-discovery-assistant)

</div>
