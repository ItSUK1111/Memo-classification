# Vue 3 + Vite

## AI分類の設定

開発サーバー起動前に、OpenAI互換APIのキーを環境変数へ設定してください。APIキーはブラウザへ渡さず、ViteのサーバーからAI APIを呼び出します。

PowerShell:

```powershell
$env:OPENAI_API_KEY = "your-api-key"
npm run dev
```

任意で `OPENAI_MODEL`（既定値: `gpt-4o-mini`）と `OPENAI_API_URL`（既定値: OpenAI Chat Completions）も変更できます。キー未設定またはAPI障害時は、従来のキーワード分類へ自動的に切り替わります。

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
