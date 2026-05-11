# FocusFlow

Productivity app with task management and AI planning.

## Structure

```
focusflow/
├── web/       → Next.js + Supabase + TailwindCSS
├── mobile/    → Flutter + Supabase
└── README.md
```

## Tech Stack

- **Backend**: Supabase (Auth + Database + Realtime)
- **Web**: Next.js 15, TailwindCSS, Framer Motion
- **Mobile**: Flutter 3.41, Material 3
- **AI**: OpenAI / Claude API via Next.js API routes

## Getting Started

### Web
```bash
cd web
npm install
npm run dev
```

### Mobile
```bash
cd mobile
flutter pub get
flutter run
```
