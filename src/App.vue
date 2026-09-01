<script setup>
import { computed, ref, watch } from 'vue'
import { GoogleGenerativeAI } from '@google/generative-ai'

const inputText = ref('')
const inputTags = ref('')
const notes = ref([])
const isClassifying = ref(false)
const classificationError = ref('')

const activeCategoryKeys = ref({})
watch(() => notes.value, (newNotes) => {
  const keys = { ...activeCategoryKeys.value }
  let changed = false
  newNotes.forEach(n => {
    const key = `${n.type}-${n.category.name}`
    if (!keys[key]) {
      keys[key] = true
      changed = true
    }
  })
  if (changed) {
    activeCategoryKeys.value = keys
  }
}, { deep: true, immediate: true })

const defaultCategories = [
  { name: '仕事', color: 'coral', words: ['会議', '仕事', '顧客', '上司', '資料', 'メール', '報告', '提出', 'プロジェクト', '会社'] },
  { name: '学業', color: 'blue', words: ['勉強', '宿題', '試験', 'テスト', '授業', 'レポート', '課題', '学校', '講義', '研究'] },
  { name: '買い物', color: 'yellow', words: ['買う', '購入', '買い物', 'スーパー', 'コンビニ', '注文', '食材', '牛乳', '野菜'] },
  { name: '健康', color: 'green', words: ['病院', '薬', '運動', 'ジム', '健康', '歯医者', '睡眠', '医者'] },
  { name: 'お金', color: 'orange', words: ['支払い', '請求', '振込', '家賃', '税金', 'お金', '銀行', '給料'] },
  { name: '家事', color: 'teal', words: ['掃除', '洗濯', '料理', 'ゴミ', '片付け', '家事', '皿', '洗う'] },
  { name: '遊び', color: 'violet', words: ['遊び', '友達', 'ゲーム', 'ゲーセン', '映画', '飲み会', '旅行', 'ラーメン', '趣味', 'お出かけ'] },
]
const customCategories = ref([])
const categoryName = ref('')
const categoryWords = ref('')
const isCategoryGuideOpen = ref(false)

const categories = computed(() => [...customCategories.value, ...defaultCategories])

const classify = (text) => {
  const matchedRule = categories.value.find((rule) => rule.words.some((word) => text.includes(word)))
  return matchedRule ?? { name: 'その他', color: 'gray' }
}

const colorForCategory = (name) => categories.value.find((category) => category.name === name)?.color ?? 'custom'

const addCategory = () => {
  const name = categoryName.value.trim()
  const words = categoryWords.value.split(',').map((word) => word.trim()).filter(Boolean)
  const hasSameName = categories.value.some((category) => category.name === name)

  if (!name || !words.length || hasSameName) return

  customCategories.value.push({ name, color: 'custom', words })
  categoryName.value = ''
  categoryWords.value = ''
}

const addNotes = async () => {
  const sourceText = inputText.value.trim()
  if (!sourceText || isClassifying.value) return

  isClassifying.value = true
  classificationError.value = ''

  let newNotes = []
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error('APIキーが設定されていません。ルートの .env ファイルに VITE_GEMINI_API_KEY を設定してください。')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'タスクの場合は短い行動内容。メモの場合は文脈を残した長めの文章（適宜改行\\nを含める）。' },
              category: { type: 'string', description: '指定されたカテゴリから最も適切なものを選択' },
              noteType: { type: 'string', enum: ['タスク', 'メモ'], description: '行動やタスクに該当する場合は「タスク」、感想やアイデアなど情報の場合は「メモ」' }
            },
            required: ['text', 'category', 'noteType']
          }
        }
      }
    })

    const categoryNames = categories.value.map(c => c.name).join(', ') + ', その他'
    const now = new Date().toLocaleString('ja-JP', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const prompt = `以下のテキストは、改行や空白なしで乱雑に書かれたメモです。意味のまとまりごとに分割し、分類してください。

【現在日時】
${now}

【分割と要約のルール】
・1つの文章に「具体的な行動（タスク）」と「感情や背景（メモ）」が混在している場合は、無理に1つにまとめず、タスク用の項目とメモ用の項目の2つとしてそれぞれ抽出して構いません。
・「タスク」に分類すべき内容は、具体的な行動内容に要約しつつも、必要な条件が損なわれないよう適度な長さを保ってください。「明日」などの相対的な日時は【現在日時】を基準に具体的な日付に変換してください。
・「メモ」に分類すべき内容は、ユーザーの思考や文脈が失われないよう、元のニュアンスを残した長めの文章（複数の文）で抽出してください。長くなる場合は適宜改行（\\n）を含めて読みやすくしてください。

【選択可能なカテゴリ】
${categoryNames}

【入力メモ】
${sourceText}`

    const result = await model.generateContent(prompt)
    const items = JSON.parse(result.response.text())
    
    const manualTags = inputTags.value.split(/[ ,、]+/).map(t => t.trim().replace(/^#/, '').slice(0, 10)).filter(Boolean)

    newNotes = items.map(({ text, category, noteType }) => ({
      id: crypto.randomUUID(),
      text,
      category: { name: category, color: colorForCategory(category) },
      type: noteType || 'メモ',
      tags: manualTags,
      originalTags: [...manualTags],
      completed: false,
      isPinned: false,
      parentTaskId: null,
      showLinked: false,
      createdAt: new Date().toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isEditing: false
    }))
  } catch (error) {
    console.error(error)
    classificationError.value = error.message.includes('APIキー') ? error.message : 'AI分類に失敗したため、辞書分類に切り替えました。'
    
    const manualTags = inputTags.value.split(/[ ,、]+/).map(t => t.trim().replace(/^#/, '').slice(0, 10)).filter(Boolean)
    newNotes = sourceText
    .split('\n')
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const cls = classify(text)
      return { 
        id: crypto.randomUUID(), 
        text, 
        category: cls,
        type: 'メモ',
        tags: manualTags,
        originalTags: [...manualTags],
        completed: false,
        isPinned: false,
        parentTaskId: null,
        showLinked: false,
        createdAt: new Date().toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        isEditing: false
      }
    })
  }

  if (newNotes.length) {
    notes.value.forEach(note => note.isNew = false)
    newNotes.forEach(note => note.isNew = true)
    notes.value.unshift(...newNotes)
    inputText.value = ''
    inputTags.value = ''
  }
  isClassifying.value = false
}

const removeNote = (id) => {
  notes.value = notes.value.filter((note) => note.id !== id)
}

const unlinkMemo = (id) => {
  const note = notes.value.find(n => n.id === id)
  if (note) {
    note.parentTaskId = null
    note.tags = [...(note.originalTags || [])] // タグを元に戻す
  }
}

const getLinkedMemos = (taskId) => {
  return notes.value.filter(n => n.parentTaskId === taskId)
}

const togglePin = (id) => {
  const note = notes.value.find(n => n.id === id)
  if (!note) return
  if (!note.isPinned) {
    if (notes.value.filter(n => n.isPinned).length >= 10) {
      alert('ピン留めできるメモは最大10個までです。')
      return
    }
    note.isPinned = true
  } else {
    note.isPinned = false
  }
}
const pinnedNotes = computed(() => notes.value.filter(n => n.isPinned && !n.parentTaskId))

const scrollToNote = (id) => {
  const el = document.getElementById('note-' + id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('blink-highlight')
    void el.offsetWidth // リフローを強制してアニメーションをリセット
    el.classList.add('blink-highlight')
    setTimeout(() => {
      el.classList.remove('blink-highlight')
    }, 2500)
  }
}

const onDragStart = (event, note, sourceCategoryName, sourceType) => {
  event.dataTransfer.setData('noteId', note.id)
  event.dataTransfer.effectAllowed = 'move'
}

const onDrop = (event, targetCategoryName, targetType, targetNoteId = null) => {
  const noteId = event.dataTransfer.getData('noteId')
  if (!noteId) return
  
  const noteIndex = notes.value.findIndex(n => n.id === noteId)
  if (noteIndex === -1) return
  const note = notes.value[noteIndex]

  // 紐づけ処理: メモをタスクにドロップした場合
  if (note.type === 'メモ' && targetType === 'タスク' && targetNoteId) {
    if (noteId !== targetNoteId) {
      note.parentTaskId = targetNoteId
      note.isPinned = false // 紐づけた場合はピン留めを解除
      
      const targetTask = notes.value.find(n => n.id === targetNoteId)
      if (targetTask) {
        note.tags = [...(targetTask.tags || [])] // タグを親タスクと同期
      }
    }
    return
  }

  // タスクからメモへの移動など、Typeをまたぐ移動は禁止
  if (note.type !== targetType) return

  // カテゴリの更新
  note.category = { name: targetCategoryName, color: colorForCategory(targetCategoryName) }

  // 並び替え処理 (他のアイテムの上にドロップされた場合)
  if (targetNoteId && targetNoteId !== noteId) {
    const targetIndex = notes.value.findIndex(n => n.id === targetNoteId)
    if (targetIndex !== -1) {
      notes.value.splice(noteIndex, 1) // 元の場所から削除
      notes.value.splice(targetIndex, 0, note) // ターゲットの位置に挿入
    }
  }
}

const groupedNotes = computed(() => {
  const types = [
    { id: 'タスク', title: 'タスク', icon: '☑️' },
    { id: 'メモ', title: 'メモ', icon: '📝' }
  ]
  
  return types.map(t => {
    const allCategories = categories.value
      .concat(notes.value.filter(n => n.type === t.id).map(n => n.category))
      .concat({ name: 'その他', color: 'gray' })
    
    const uniqueCategories = allCategories.filter((c, i, a) => a.findIndex((item) => item.name === c.name) === i)
    
    const typeCats = uniqueCategories.map(category => {
      const catNotes = notes.value.filter(note => note.category.name === category.name && note.type === t.id && !note.parentTaskId)
      
      const dateGroupsMap = new Map()
      catNotes.forEach(note => {
        const dateStr = note.createdAt.split(' ')[0] || '不明'
        if (!dateGroupsMap.has(dateStr)) {
          dateGroupsMap.set(dateStr, [])
        }
        dateGroupsMap.get(dateStr).push(note)
      })
      
      const dateGroups = Array.from(dateGroupsMap.entries()).map(([dateStr, groupNotes]) => ({
        dateStr,
        notes: groupNotes
      }))

      return {
        ...category,
        notes: catNotes,
        dateGroups
      }
    }).filter(category => category.notes.length > 0 || activeCategoryKeys.value[`${t.id}-${category.name}`])

    return {
      ...t,
      categories: typeCats,
      total: typeCats.reduce((acc, cat) => acc + cat.notes.length, 0)
    }
  })
})
</script>

<template>
  <main class="app-shell">
    <header class="page-header">
      <p class="eyebrow">PRISM NOTE / 01</p>
      <h1>思いつきを、<em>ちょうどいい場所</em>へ。</h1>
      <p class="lead">思いついたことをまとめて入力すると、AIがタスクとメモに分けて分類します。</p>
    </header>

    <section class="composer" aria-labelledby="composer-title">
      <div class="section-label">
        <span class="number">01</span>
        <h2 id="composer-title">思い付きを入力</h2>
        <span class="hint">AIが内容を抽出して整理</span>
      </div>
      <textarea v-model="inputText" placeholder="例：来週の会議資料を作る&#10;牛乳を買う&#10;新しいサービスのアイデア" @keydown.ctrl.enter="addNotes" @keydown.meta.enter="addNotes"></textarea>
      <div class="composer-footer">
        <input type="text" v-model="inputTags" placeholder="タグを指定 (カンマで複数可 / 省略可)" class="manual-tag-input" @keydown.enter.prevent="addNotes" />
        <span class="shortcut">Ctrl / Cmd + Enter で追加</span>
        <button type="button" class="add-button" :disabled="!inputText.trim() || isClassifying" @click="addNotes">{{ isClassifying ? 'AIが整理中...' : 'AIで分類する' }} <span>→</span></button>
      </div>
      <p v-if="classificationError" class="classification-message" role="status">{{ classificationError }}</p>
    </section>

    <section class="category-settings" aria-labelledby="category-title">
      <div class="section-label">
        <span class="number">02</span>
        <h2 id="category-title">カテゴリを作る</h2>
        <span class="hint">あなた専用の分類ルール</span>
      </div>
      <form class="category-form" @submit.prevent="addCategory">
        <input v-model="categoryName" type="text" placeholder="カテゴリ名（例：趣味）" aria-label="カテゴリ名" />
        <input v-model="categoryWords" type="text" placeholder="判定キーワード（例：映画,読書,ゲーム）" aria-label="判定キーワード" />
        <button type="submit" class="add-category-button" :disabled="!categoryName.trim() || !categoryWords.trim()">追加</button>
      </form>
      <div class="category-guide">
        <button type="button" class="guide-toggle-button" @click="isCategoryGuideOpen = !isCategoryGuideOpen">
          <span class="guide-title">AIが参考にするカテゴリ</span>
          <span class="toggle-icon">{{ isCategoryGuideOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-show="isCategoryGuideOpen" class="guide-list">
          <span v-for="category in categories" :key="category.name" class="guide-item"><strong>{{ category.name }}</strong>：{{ category.words.join('、') }}</span>
          <span class="guide-item"><strong>その他</strong>：どのキーワードにも当てはまらないメモ</span>
        </div>
      </div>
    </section>

    <section class="results" aria-labelledby="results-title">
      <div class="section-label">
        <span class="number">03</span>
        <h2 id="results-title">分類されたタスク/メモ</h2>
        <span class="count">{{ notes.length }}件</span>
      </div>
      <div v-if="!notes.length" class="empty-state">ここに分類結果が表示されます。</div>
      <div v-else>
        <div v-if="pinnedNotes.length > 0" class="pinned-section">
          <h3 class="pinned-heading">📌 ピン留めされたメモ <span class="pinned-count">{{ pinnedNotes.length }} / 10件</span></h3>
          <ul class="pinned-list">
            <li v-for="note in pinnedNotes" :key="note.id" :class="{ 'is-completed': note.completed }">
              <label class="checkbox-label" v-if="note.type === 'タスク'">
                <input type="checkbox" v-model="note.completed" class="task-checkbox" />
              </label>
              <div class="note-content">
                <div class="pinned-context" @click="scrollToNote(note.id)" style="cursor: pointer;" title="元の場所へ移動">
                  <span class="pinned-type">{{ note.type === 'タスク' ? '☑️' : '📝' }}</span>
                  <span :class="['category-dot', note.category.color]"></span>
                  <span class="pinned-cat-name">{{ note.category.name }}</span>
                </div>
                <div v-if="note.isEditing" class="edit-mode">
                  <textarea v-model="note.text" @blur="note.isEditing = false" class="edit-input" placeholder="テキストを入力..."></textarea>
                </div>
                <div v-else class="view-mode" @click="scrollToNote(note.id)" style="cursor: pointer;" title="元の場所へ移動">
                  <span class="note-text">{{ note.text }}</span>
                  <div class="note-meta">
                    <div class="note-tags" v-if="note.tags && note.tags.length">
                      <span v-for="tag in note.tags" :key="tag" class="tag">#{{ tag }}</span>
                    </div>
                    <span class="note-time">{{ note.createdAt.split(' ')[1] || note.createdAt }}</span>
                  </div>
                </div>
              </div>
              <div class="note-actions">
                <button type="button" class="action-button pin-button active" @click="togglePin(note.id)" title="ピン留めを解除">📌</button>
                <button type="button" class="action-button edit-button" @click="note.isEditing = !note.isEditing" title="編集">✏️</button>
                <button type="button" class="action-button remove-button" @click="removeNote(note.id)" title="削除">×</button>
              </div>
            </li>
          </ul>
        </div>
        <div class="type-sections">
        <div v-for="typeGroup in groupedNotes" :key="typeGroup.id" class="type-section" v-show="typeGroup.categories.length > 0">
          <h3 class="type-heading">{{ typeGroup.icon }} {{ typeGroup.title }} <span class="type-count">{{ typeGroup.total }}件</span></h3>
          <div class="category-list">
            <article v-for="category in typeGroup.categories" :key="category.name" class="category-block"
                     @dragover.prevent @dragenter.prevent @drop="onDrop($event, category.name, typeGroup.id)">
              <div class="category-heading"><span :class="['category-dot', category.color]"></span><h4>{{ category.name }}</h4><span class="category-count">{{ category.notes.length }}</span></div>
              <div class="category-body">
                <div v-if="category.dateGroups.length === 0" class="empty-drop-zone">ここにドロップして移動</div>
                <div v-for="dateGroup in category.dateGroups" :key="dateGroup.dateStr" class="date-group">
                  <div class="date-header">{{ dateGroup.dateStr }}</div>
                  <ul class="drop-zone">
                    <li v-for="note in dateGroup.notes" :key="typeGroup.id + '-' + category.name + '-' + note.id" 
                        :id="'note-' + note.id"
                        :class="{ 'is-new': note.isNew, 'is-completed': note.completed, 'is-pinned-list-item': note.isPinned }"
                        draggable="true" 
                        @dragstart="onDragStart($event, note, category.name, typeGroup.id)"
                        @dragover.prevent
                        @drop.stop="onDrop($event, category.name, typeGroup.id, note.id)">
                      <div class="drag-handle" title="ドラッグして移動">⋮⋮</div>
                      <label class="checkbox-label" v-if="typeGroup.id === 'タスク'">
                        <input type="checkbox" v-model="note.completed" class="task-checkbox" />
                      </label>
                      <div class="note-content">
                        <div v-if="note.isEditing" class="edit-mode">
                          <textarea v-model="note.text" @blur="note.isEditing = false" class="edit-input" placeholder="テキストを入力..."></textarea>
                        </div>
                        <div v-else class="view-mode">
                          <span class="note-text">{{ note.text }}</span>
                          <div class="note-meta">
                            <div class="note-tags" v-if="note.tags && note.tags.length">
                              <span v-for="tag in note.tags" :key="tag" class="tag">#{{ tag }}</span>
                            </div>
                            <span class="note-time">{{ note.createdAt.split(' ')[1] || note.createdAt }}</span>
                          </div>
                        </div>
                        <div v-if="getLinkedMemos(note.id).length > 0" class="linked-memos-section">
                          <button class="linked-memos-toggle" @click.stop="note.showLinked = !note.showLinked">
                            💬 関連メモ ({{ getLinkedMemos(note.id).length }}件)
                            <span class="toggle-icon">{{ note.showLinked ? '▲' : '▼' }}</span>
                          </button>
                          <ul v-show="note.showLinked" class="nested-memos">
                            <li v-for="memo in getLinkedMemos(note.id)" :key="memo.id" class="nested-memo-item">
                              <div class="note-content">
                                <div v-if="memo.isEditing" class="edit-mode">
                                  <textarea v-model="memo.text" @blur="memo.isEditing = false" class="edit-input" placeholder="テキストを入力..."></textarea>
                                </div>
                                <div v-else class="view-mode">
                                  <span class="note-text">{{ memo.text }}</span>
                                  <div class="note-meta">
                                    <div class="note-tags" v-if="memo.tags && memo.tags.length">
                                      <span v-for="tag in memo.tags" :key="tag" class="tag">#{{ tag }}</span>
                                    </div>
                                    <span class="note-time">{{ memo.createdAt.split(' ')[1] || memo.createdAt }}</span>
                                  </div>
                                </div>
                              </div>
                              <div class="note-actions">
                                <button type="button" class="action-button unlink-button" @click.stop="unlinkMemo(memo.id)" title="紐づけを解除">🔗❌</button>
                                <button type="button" class="action-button edit-button" @click.stop="memo.isEditing = !memo.isEditing" title="編集">✏️</button>
                                <button type="button" class="action-button remove-button" @click.stop="removeNote(memo.id)" title="削除">×</button>
                              </div>
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div class="note-actions">
                        <button type="button" class="action-button pin-button" @click="togglePin(note.id)" title="ピン留めする">📍</button>
                        <button type="button" class="action-button edit-button" @click="note.isEditing = !note.isEditing" title="編集">✏️</button>
                        <button type="button" class="action-button remove-button" @click="removeNote(note.id)" title="削除">×</button>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  </section>
  </main>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');

.app-shell { max-width: 780px; margin: 0 auto; padding: 72px 28px 96px; color: #27302d; }
.page-header { padding-bottom: 54px; border-bottom: 1px solid #cbd4ce; }
.eyebrow, .shortcut, .hint, .count { font: 500 11px/1.4 'DM Mono', monospace; letter-spacing: .08em; color: #76817b; }
h1 { margin: 18px 0 12px; font: 700 clamp(32px, 6vw, 62px)/1.18 'Zen Kaku Gothic New', sans-serif; letter-spacing: 0; color: #27302d; }
h1 em { color: #df654e; font-style: normal; }
.lead { color: #76817b; font-size: 15px; }
.composer, .category-settings, .results { padding-top: 38px; }
.section-label { display: flex; align-items: center; gap: 12px; margin-bottom: 17px; }
.number { font: 500 12px 'DM Mono', monospace; color: #df654e; }
h2 { margin: 0; font: 700 19px 'Zen Kaku Gothic New', sans-serif; color: #27302d; }
.hint { margin-left: auto; }
textarea { display: block; box-sizing: border-box; width: 100%; min-height: 148px; resize: vertical; padding: 18px 20px; border: 1px solid #b8c5bc; border-radius: 4px; background: #f7faf6; color: #27302d; font: 15px/1.8 'Zen Kaku Gothic New', sans-serif; outline: none; }
textarea:focus { border-color: #df654e; box-shadow: 0 0 0 3px #f8ded8; }
textarea::placeholder { color: #9ba69f; }
.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 12px; }
.manual-tag-input { flex: 1; max-width: 300px; padding: 11px 13px; border: 1px solid #b8c5bc; border-radius: 3px; background: #fff; color: #27302d; font: 14px 'Zen Kaku Gothic New', sans-serif; outline: none; }
.manual-tag-input:focus { border-color: #df654e; box-shadow: 0 0 0 3px #f8ded8; }
.manual-tag-input::placeholder { color: #9ba69f; }
.shortcut { margin-left: auto; color: #9ba69f; font-size: 12px; }
.add-button { border: 0; border-radius: 3px; padding: 11px 18px; background: #df654e; color: #fff; font: 700 14px 'Zen Kaku Gothic New', sans-serif; cursor: pointer; white-space: nowrap; }
.add-button span { margin-left: 12px; font-size: 18px; }
.add-button:disabled { cursor: not-allowed; opacity: .4; }
.category-form { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; }
.category-form input { min-width: 0; box-sizing: border-box; padding: 11px 13px; border: 1px solid #b8c5bc; border-radius: 3px; background: #fff; color: #27302d; font: 14px 'Zen Kaku Gothic New', sans-serif; outline: none; }
.category-form input:focus { border-color: #4d9991; box-shadow: 0 0 0 3px #dcefeb; }
.category-form input::placeholder { color: #9ba69f; }
.add-category-button { border: 1px solid #4d9991; border-radius: 3px; padding: 10px 16px; background: #fff; color: #317b74; font: 700 14px 'Zen Kaku Gothic New', sans-serif; cursor: pointer; }
.add-category-button:disabled { cursor: not-allowed; opacity: .4; }
.category-guide { margin-top: 16px; padding: 15px 18px; border-left: 3px solid #4d9991; background: #f1f7f3; }
.guide-toggle-button { width: 100%; display: flex; justify-content: space-between; align-items: center; background: none; border: none; padding: 0; cursor: pointer; outline: none; color: #5c6962; }
.guide-title { margin: 0; font-size: 12px; font-weight: 700; }
.guide-list { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 7px 18px; }
.guide-item { color: #76817b; font-size: 12px; line-height: 1.6; }
.guide-item strong { color: #27302d; }
.count { margin-left: auto; }
.empty-state { padding: 40px 20px; border: 1px dashed #cbd4ce; border-radius: 4px; text-align: center; color: #9ba69f; font-size: 14px; }
.type-sections { display: flex; flex-direction: column; gap: 45px; }
.type-heading { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; font: 700 18px 'Zen Kaku Gothic New', sans-serif; color: #27302d; padding-bottom: 8px; border-bottom: 2px solid #cbd4ce; }
.type-count { margin-left: auto; color: #76817b; font: 500 14px 'DM Mono', monospace; }
.category-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 30px 22px; }
.category-heading { display: flex; align-items: center; gap: 9px; border-bottom: 1px solid #cbd4ce; padding-bottom: 9px; margin-bottom: 8px; }
.category-body { display: flex; flex-direction: column; gap: 12px; }
.empty-drop-zone { padding: 16px; text-align: center; border: 1px dashed #cbd4ce; border-radius: 6px; color: #aab4ae; font-size: 13px; background: #fafcfa; }
.date-group { display: flex; flex-direction: column; margin-bottom: 12px; }
.date-header { align-self: flex-start; font: 700 13px 'Zen Kaku Gothic New', sans-serif; color: #317b74; background-color: #eaf3f1; padding: 4px 10px; border-radius: 12px; margin-bottom: 6px; }
.category-dot { width: 9px; height: 9px; border-radius: 50%; }
.category-dot.coral { background: #df654e; }.category-dot.blue { background: #4f83aa; }.category-dot.yellow { background: #ddb34c; }.category-dot.violet { background: #9673a8; }.category-dot.green { background: #6b9c71; }.category-dot.orange { background: #d58a4c; }.category-dot.teal, .category-dot.custom { background: #4d9991; }.category-dot.gray { background: #89938d; }
h4 { margin: 0; font: 700 15px 'Zen Kaku Gothic New', sans-serif; }.category-count { margin-left: auto; color: #89938d; font: 12px 'DM Mono', monospace; }
ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid #e4eae5; border-radius: 6px; background-color: #ffffff; font-size: 14px; transition: all 0.2s; align-items: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
li:hover { box-shadow: 0 3px 6px rgba(0,0,0,0.04); border-color: #cbd4ce; }
li.is-new { background-color: #fff2e0; border: 1px solid #df654e; }
li.is-completed { opacity: 0.6; background-color: #fafafa; box-shadow: none; }
li.is-completed .note-text { text-decoration: line-through; color: #9ba69f; }
.checkbox-label { flex: 0 0 auto; display: flex; align-items: flex-start; margin-top: 2px; }
.task-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #4d9991; }
.note-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.edit-mode { display: flex; width: 100%; }
.edit-input { width: 100%; padding: 6px 8px; border: 1px solid #4d9991; border-radius: 3px; font-family: inherit; font-size: 14px; outline: none; resize: vertical; min-height: 60px; line-height: 1.5; }
.view-mode { display: flex; flex-direction: column; gap: 2px; }
.note-text { line-height: 1.5; word-break: break-all; white-space: pre-wrap; }
.note-meta { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; width: 100%; }
.note-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { font-size: 11px; color: #df654e; background: #fff2e0; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
.note-time { font-size: 11px; color: #aab4ae; font-family: 'DM Mono', monospace; margin-left: auto; }
.note-actions { flex: 0 0 auto; display: flex; align-items: flex-start; gap: 6px; }
.action-button { background: transparent; border: none; font-size: 14px; cursor: pointer; padding: 2px; opacity: 0.5; transition: opacity 0.2s, color 0.2s; line-height: 1; }
.action-button:hover { opacity: 1; }
.edit-button:hover { color: #4d9991; }
.remove-button { font-size: 18px; color: #aab4ae; margin-top: -2px; }
.remove-button:hover { color: #df654e; }
.drop-zone { min-height: 40px; }
.drag-handle { cursor: grab; color: #cbd4ce; margin-right: 2px; margin-top: 1px; font-size: 14px; user-select: none; line-height: 1.2; letter-spacing: -2px; }
.drag-handle:active { cursor: grabbing; }

/* ピン留めセクションのスタイル */
.pinned-section { margin-bottom: 40px; padding: 20px 24px; background: #fffcf0; border: 2px solid #f2e2a7; border-radius: 8px; box-shadow: 0 4px 12px rgba(220,180,0,0.05); }
.pinned-heading { margin: 0 0 16px; font: 700 16px 'Zen Kaku Gothic New', sans-serif; display: flex; align-items: center; gap: 8px; color: #b89000; }
.pinned-count { margin-left: auto; font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; color: #c4a73e; }
.pinned-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.pinned-context { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: #5c6962; }
.pinned-type { background: #eaf3f1; padding: 2px 6px; border-radius: 4px; color: #317b74; margin-right: 4px; }
.pinned-cat-name { color: #89938d; }
.pin-button { filter: grayscale(1); opacity: 0.4; }
.pin-button:hover { filter: grayscale(0); opacity: 1; transform: scale(1.1); }
.pin-button.active { filter: grayscale(0); opacity: 1; }

li.is-pinned-list-item { border-color: #f2e2a7; background-color: #fffdf5; box-shadow: inset 3px 0 0 #f2e2a7; }

/* 関連メモのスタイル */
.linked-memos-section { margin-top: 10px; width: 100%; display: flex; flex-direction: column; align-items: flex-start; }
.linked-memos-toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4d9991; background: #eaf3f1; border: 1px solid #dcefeb; padding: 4px 10px; border-radius: 4px; cursor: pointer; transition: background 0.2s; font-weight: 700; font-family: 'Zen Kaku Gothic New', sans-serif; }
.linked-memos-toggle:hover { background: #dcefeb; }
.toggle-icon { font-size: 10px; opacity: 0.7; }
.nested-memos { list-style: none; padding: 0; margin: 8px 0 0 0; display: flex; flex-direction: column; gap: 6px; border-left: 2px solid #eaf3f1; padding-left: 12px; width: 100%; box-sizing: border-box; }
.nested-memo-item { display: flex; align-items: flex-start; gap: 8px; background: #fafcfa; padding: 8px 10px; border-radius: 4px; border: 1px solid #e4eae5; box-shadow: none; }
.nested-memo-item:hover { box-shadow: 0 2px 4px rgba(0,0,0,0.02); border-color: #cbd4ce; }
.unlink-button { font-size: 14px; opacity: 0.7; }
.unlink-button:hover { opacity: 1; filter: sepia(1) hue-rotate(-50deg) saturate(3); }

@keyframes highlight-blink {
  0% { background-color: #fffdf5; border-color: #f2e2a7; box-shadow: inset 3px 0 0 #f2e2a7; }
  15% { background-color: #fffdf5; border-color: #f2e2a7; box-shadow: inset 3px 0 0 #f2e2a7; }
  40% { background-color: #ffea99; border-color: #ffc400; box-shadow: 0 4px 12px rgba(255,200,0,0.3), inset 3px 0 0 #ffc400; transform: scale(1.01); }
  60% { background-color: #ffea99; border-color: #ffc400; box-shadow: 0 4px 12px rgba(255,200,0,0.3), inset 3px 0 0 #ffc400; transform: scale(1.01); }
  100% { background-color: #fffdf5; border-color: #f2e2a7; box-shadow: inset 3px 0 0 #f2e2a7; transform: scale(1); }
}
.blink-highlight {
  animation: highlight-blink 2.2s ease-in-out forwards !important;
}

@media (max-width: 600px) { .app-shell { padding: 42px 18px 70px; } .page-header { padding-bottom: 38px; } .composer-footer { align-items: flex-end; flex-direction: column; } .category-form { grid-template-columns: 1fr; } .category-list { grid-template-columns: 1fr; gap: 25px; } .shortcut { align-self: flex-start; } }
</style>
