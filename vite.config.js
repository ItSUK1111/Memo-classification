import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const categoryPrompt = (categories) => categories.length
  ? `既存カテゴリは「${categories.join('」「')}」です。内容が合う場合は必ず既存カテゴリを使い、合わない場合だけ短い新カテゴリを作ってください。`
  : '内容に合う短いカテゴリを作ってください。'

const aiClassifyPlugin = () => ({
  name: 'ai-classify-api',
  configureServer(server) {
    server.middlewares.use('/api/classify', async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405
        response.end()
        return
      }

      if (!process.env.OPENAI_API_KEY) {
        response.statusCode = 503
        response.end(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }))
        return
      }

      let body = ''
      for await (const chunk of request) body += chunk

      try {
        const { text, categories = [] } = JSON.parse(body)
        const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
        const apiResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: `日本語のメモを意味のまとまりごとに分割し、各項目を分類してください。${categoryPrompt(categories)} JSONのみで、{"items":[{"text":"抽出したメモ","category":"カテゴリ名"}]} の形式で返してください。` },
              { role: 'user', content: text },
            ],
          }),
        })

        if (!apiResponse.ok) throw new Error(`AI API returned ${apiResponse.status}`)
        const result = await apiResponse.json()
        const parsed = JSON.parse(result.choices[0].message.content)
        if (!Array.isArray(parsed.items)) throw new Error('Invalid AI response')

        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ items: parsed.items.filter((item) => item.text && item.category) }))
      } catch (error) {
        response.statusCode = 502
        response.end(JSON.stringify({ error: error.message }))
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), aiClassifyPlugin()],
})
