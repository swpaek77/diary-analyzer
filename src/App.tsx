import { useMemo, useState } from 'react'
import { format, getISOWeek, isValid, parseISO } from 'date-fns'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type DiaryPayload = {
  date: string
  summary: string
  strengths: string[]
  weaknesses: string[]
  feedback: string
  lifeHelpScore: number
  areas: Record<string, number>
}

type DiaryEntry = DiaryPayload & {
  id: string
  createdAt: string
}

type DiaryStore = {
  entries: DiaryEntry[]
  addEntry: (payload: DiaryPayload) => void
  clearAll: () => void
}

const useDiaryStore = create<DiaryStore>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (payload) =>
        set((state) => ({
          entries: [
            {
              ...payload,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
            },
            ...state.entries,
          ],
        })),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: 'diary-analyzer-storage',
    },
  ),
)

const defaultPrompt = `아래 형식의 Markdown JSON 코드블록으로만 응답해줘.

\`\`\`json
{
  "date": "YYYY-MM-DD",
  "summary": "오늘 일기 3~5문장 요약",
  "strengths": ["오늘 잘한 점 1", "오늘 잘한 점 2"],
  "weaknesses": ["보완점 1", "보완점 2"],
  "feedback": "내일 더 좋아지기 위한 실전 피드백",
  "lifeHelpScore": 1,
  "areas": {
    "career": 0,
    "health": 0,
    "finance": 0,
    "relationships": 0,
    "selfGrowth": 0
  }
}
\`\`\`

규칙:
- lifeHelpScore: 1~10 정수
- areas: 각 분야 0~10 정수
- 추가 설명 텍스트 없이 JSON 코드블록만 출력`

function sanitizeJson(raw: string) {
  const match = raw.match(/```json\s*([\s\S]*?)```/i)
  return (match ? match[1] : raw).trim()
}

function parsePayload(raw: string): DiaryPayload {
  const parsed = JSON.parse(sanitizeJson(raw))

  if (!parsed.date || !isValid(parseISO(parsed.date))) {
    throw new Error('date는 YYYY-MM-DD 형식이어야 합니다.')
  }

  const toArray = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  const score = Number(parsed.lifeHelpScore)
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error('lifeHelpScore는 1~10 정수여야 합니다.')
  }

  const areas: Record<string, number> = {}
  if (parsed.areas && typeof parsed.areas === 'object') {
    Object.entries(parsed.areas).forEach(([key, value]) => {
      const n = Number(value)
      if (Number.isInteger(n) && n >= 0 && n <= 10) {
        areas[key] = n
      }
    })
  }

  if (!Object.keys(areas).length) {
    throw new Error('areas는 1개 이상의 분야 점수를 포함해야 합니다.')
  }

  return {
    date: parsed.date,
    summary: String(parsed.summary ?? ''),
    strengths: toArray(parsed.strengths),
    weaknesses: toArray(parsed.weaknesses),
    feedback: String(parsed.feedback ?? ''),
    lifeHelpScore: score,
    areas,
  }
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function App() {
  const { entries, addEntry, clearAll } = useDiaryStore()
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [rawInput, setRawInput] = useState('')
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState('')

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [entries],
  )

  const filtered = useMemo(() => sorted.filter((entry) => entry.date === filterDate), [sorted, filterDate])

  const weekly = useMemo(() => {
    const now = new Date()
    const thisWeek = getISOWeek(now)
    const thisYear = Number(format(now, 'yyyy'))
    const target = entries.filter((e) => {
      const d = parseISO(e.date)
      return Number(format(d, 'yyyy')) === thisYear && getISOWeek(d) === thisWeek
    })
    return target
  }, [entries])

  const monthly = useMemo(() => {
    const ym = format(new Date(), 'yyyy-MM')
    return entries.filter((e) => e.date.startsWith(ym))
  }, [entries])

  const yearly = useMemo(() => {
    const y = format(new Date(), 'yyyy')
    return entries.filter((e) => e.date.startsWith(y))
  }, [entries])

  const areaAverages = (list: DiaryEntry[]) => {
    const map: Record<string, number[]> = {}
    list.forEach((entry) => {
      Object.entries(entry.areas).forEach(([k, v]) => {
        if (!map[k]) map[k] = []
        map[k].push(v)
      })
    })
    return Object.fromEntries(Object.entries(map).map(([k, vals]) => [k, avg(vals)]))
  }

  const submit = () => {
    try {
      const payload = parsePayload(rawInput)
      addEntry(payload)
      setRawInput('')
      setError('')
      setFilterDate(payload.date)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'JSON 파싱에 실패했습니다.')
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl font-bold">Diary Analyzer (React + Tailwind + shadcn + TSX)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        로컬 저장(zustand persist/localStorage). 추후 Supabase 마이그레이션 가능 구조.
      </p>

      <Tabs defaultValue="input" className="mt-6">
        <TabsList>
          <TabsTrigger value="input">입력</TabsTrigger>
          <TabsTrigger value="history">기록/분석</TabsTrigger>
          <TabsTrigger value="prompt">LLM 프롬프트</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>일기 JSON 입력</CardTitle>
              <CardDescription>Markdown 코드블록(json) 그대로 붙여넣으면 됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="```json ... ```"
                className="min-h-64"
              />
              {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
              <div className="mt-3 flex gap-2">
                <Button onClick={submit}>저장</Button>
                <Button variant="outline" onClick={() => setRawInput('')}>초기화</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>일별 기록 확인</CardTitle>
            </CardHeader>
            <CardContent>
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="max-w-60" />
              <div className="mt-4 space-y-3">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">해당 날짜 데이터가 없습니다.</p>
                ) : (
                  filtered.map((entry) => (
                    <div key={entry.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{entry.date}</Badge>
                        <Badge variant="outline">입력시각: {format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}</Badge>
                      </div>
                      <p className="mt-2 text-sm">{entry.summary}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {[
            { label: '주간', items: weekly },
            { label: '월간', items: monthly },
            { label: '연간', items: yearly },
          ].map(({ label, items }) => {
            const areas = areaAverages(items)
            return (
              <Card key={label}>
                <CardHeader>
                  <CardTitle>{label} 분석</CardTitle>
                  <CardDescription>총 {items.length}건 · 평균 lifeHelpScore {avg(items.map((i) => i.lifeHelpScore)).toFixed(2)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(areas).length === 0 ? (
                    <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(areas).map(([k, v]) => (
                        <Badge key={k} variant="secondary">{k}: {v.toFixed(2)}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          <Separator />
          <Button variant="destructive" onClick={clearAll}>로컬 데이터 전체 삭제</Button>
        </TabsContent>

        <TabsContent value="prompt" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>음성 입력용 LLM 프리픽스 프롬프트</CardTitle>
              <CardDescription>복사해서 ChatGPT/Claude/Gemini에 붙이고 다음 메시지에 일기 내용을 말하면 됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-80" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

export default App
