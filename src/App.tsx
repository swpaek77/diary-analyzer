import { useMemo, useState } from 'react'
import { format, getISOWeek, isValid, parseISO, subDays } from 'date-fns'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type DecagonScores = {
  career: number
  health: number
  finance: number
  relationships: number
  selfGrowth: number
  productivity: number
  emotional: number
  discipline: number
  creativity: number
  leisure: number
}

type DiaryPayload = {
  date: string
  summary: string
  encouragement: string
  strengths: string[]
  weaknesses: string[]
  feedback: string
  overallWrapUp: string
  lifeHelpScore: number
  decagonScores: DecagonScores
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

const scoreKeys: (keyof DecagonScores)[] = [
  'career',
  'health',
  'finance',
  'relationships',
  'selfGrowth',
  'productivity',
  'emotional',
  'discipline',
  'creativity',
  'leisure',
]

const defaultScores: DecagonScores = {
  career: 0,
  health: 0,
  finance: 0,
  relationships: 0,
  selfGrowth: 0,
  productivity: 0,
  emotional: 0,
  discipline: 0,
  creativity: 0,
  leisure: 0,
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

const defaultInputPrompt = `역할: 일기 구조화 도우미

중요: 지금 이 메시지(프롬프트)를 받으면 첫 응답은 아래 문장으로만 출력해.
알겠습니다. 다음 메시지에 일기를 쓰면 됩니다.

그 다음부터 사용자가 일기 텍스트(음성인식 결과 포함)를 보내면,
반드시 아래 형식의 Markdown JSON 코드블록으로만 응답해.

\`\`\`json
{
  "date": "YYYY-MM-DD",
  "summary": "오늘 일기의 맥락이 드러나는 6~10문장 요약",
  "encouragement": "따뜻한 오구오구 톤의 공감/격려 3~5문장",
  "strengths": ["오늘 잘한 점 1", "오늘 잘한 점 2", "오늘 잘한 점 3"],
  "weaknesses": ["보완점 1", "보완점 2"],
  "feedback": "내일 더 좋아지기 위한 구체적이고 실행 가능한 피드백",
  "overallWrapUp": "오늘 하루 총정리 세션(상황/감정/행동/의사결정/배운점/다음실행)으로 18~30줄 내외",
  "lifeHelpScore": 1,
  "decagonScores": {
    "career": 0,
    "health": 0,
    "finance": 0,
    "relationships": 0,
    "selfGrowth": 0,
    "productivity": 0,
    "emotional": 0,
    "discipline": 0,
    "creativity": 0,
    "leisure": 0
  },
  "needsUserProfile": false,
  "profileQuestions": []
}
\`\`\`

규칙:
- lifeHelpScore: 1~10 정수
- decagonScores: 10개 분야 각각 0~10 정수
- date는 사용자가 말한 날짜가 있으면 반영, 없으면 오늘 날짜 사용
- summary는 너무 짧게 쓰지 말고 6~10문장
- encouragement는 반드시 공감 + 칭찬 + 응원 포함
- overallWrapUp은 '요약'보다 '총정리 세션' 톤으로 작성 (권장 18~30줄, 일기 길이가 길면 최대 30줄 근접)
- overallWrapUp에는 오늘의 상황/감정/행동/판단/배운점/내일 핵심 실행을 반드시 포함
- strengths는 최소 3개, weaknesses는 최소 2개
- 기본 전제: 너(LLM)는 이미 사용자 정보를 알고 있다고 가정하고 더 정밀하게 분석
- 단, 사용자 맥락 정보가 부족하면 needsUserProfile=true 로 바꾸고 profileQuestions 배열에 필요한 질문 3개 이내 작성
- JSON 코드블록 외 텍스트 금지`


function sanitizeJson(raw: string) {
  const match = raw.match(/```json\s*([\s\S]*?)```/i)
  return (match ? match[1] : raw).trim()
}

function toScore(value: unknown) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 0
}

function parsePayload(raw: string): DiaryPayload {
  const parsed = JSON.parse(sanitizeJson(raw))

  if (!parsed.date || !isValid(parseISO(parsed.date))) {
    throw new Error('date는 YYYY-MM-DD 형식이어야 합니다.')
  }

  const score = Number(parsed.lifeHelpScore)
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error('lifeHelpScore는 1~10 정수여야 합니다.')
  }

  const source = parsed.decagonScores ?? parsed.areas ?? {}
  const decagonScores: DecagonScores = {
    career: toScore(source.career),
    health: toScore(source.health),
    finance: toScore(source.finance),
    relationships: toScore(source.relationships),
    selfGrowth: toScore(source.selfGrowth),
    productivity: toScore(source.productivity),
    emotional: toScore(source.emotional),
    discipline: toScore(source.discipline),
    creativity: toScore(source.creativity),
    leisure: toScore(source.leisure),
  }

  return {
    date: parsed.date,
    summary: String(parsed.summary ?? ''),
    encouragement: String(parsed.encouragement ?? ''),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String) : [],
    feedback: String(parsed.feedback ?? ''),
    overallWrapUp: String(parsed.overallWrapUp ?? ''),
    lifeHelpScore: score,
    decagonScores,
  }
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function averageDecagon(list: DiaryEntry[]): DecagonScores {
  if (!list.length) return defaultScores
  return scoreKeys.reduce((acc, key) => {
    acc[key] = avg(list.map((item) => item.decagonScores[key]))
    return acc
  }, { ...defaultScores })
}

function RadarDecagon({ scores }: { scores: DecagonScores }) {
  const center = 120
  const radius = 90
  const points = scoreKeys.map((key, i) => {
    const angle = (Math.PI * 2 * i) / scoreKeys.length - Math.PI / 2
    const r = (scores[key] / 10) * radius
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`
  })

  const axis = scoreKeys.map((key, i) => {
    const angle = (Math.PI * 2 * i) / scoreKeys.length - Math.PI / 2
    const x = center + Math.cos(angle) * radius
    const y = center + Math.sin(angle) * radius
    const lx = center + Math.cos(angle) * (radius + 16)
    const ly = center + Math.sin(angle) * (radius + 16)
    return { key, x, y, lx, ly }
  })

  return (
    <svg viewBox="0 0 240 240" className="h-64 w-64 max-w-full rounded-md border bg-muted/20 p-1">
      {[2, 4, 6, 8, 10].map((level) => {
        const ring = scoreKeys
          .map((_, i) => {
            const angle = (Math.PI * 2 * i) / scoreKeys.length - Math.PI / 2
            const r = (level / 10) * radius
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`
          })
          .join(' ')
        return <polygon key={level} points={ring} fill="none" stroke="currentColor" opacity={0.15} />
      })}

      {axis.map((a) => (
        <line key={a.key} x1={center} y1={center} x2={a.x} y2={a.y} stroke="currentColor" opacity={0.2} />
      ))}

      <polygon points={points.join(' ')} fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth="2" />

      {axis.map((a) => (
        <text key={`${a.key}-label`} x={a.lx} y={a.ly} fontSize="9" textAnchor="middle" fill="currentColor">
          {a.key}
        </text>
      ))}
    </svg>
  )
}

function App() {
  const { entries, addEntry, clearAll } = useDiaryStore()
  const [inputPrompt, setInputPrompt] = useState(defaultInputPrompt)
  const [rawInput, setRawInput] = useState('')
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [weeklyCount, setWeeklyCount] = useState(7)

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [entries],
  )

  const filtered = useMemo(() => sorted.filter((entry) => entry.date === filterDate), [sorted, filterDate])

  const weekly = useMemo(() => {
    const now = new Date()
    const thisWeek = getISOWeek(now)
    const thisYear = Number(format(now, 'yyyy'))
    return entries.filter((e) => {
      const d = parseISO(e.date)
      return Number(format(d, 'yyyy')) === thisYear && getISOWeek(d) === thisWeek
    })
  }, [entries])

  const monthly = useMemo(() => {
    const ym = format(new Date(), 'yyyy-MM')
    return entries.filter((e) => e.date.startsWith(ym))
  }, [entries])

  const yearly = useMemo(() => {
    const y = format(new Date(), 'yyyy')
    return entries.filter((e) => e.date.startsWith(y))
  }, [entries])

  const selectedWeeklyForPrompt = useMemo(
    () => sorted.filter((e) => parseISO(e.date) >= subDays(new Date(), weeklyCount - 1)).slice(0, weeklyCount),
    [sorted, weeklyCount],
  )

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

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1200)
    } catch {
      setError('클립보드 복사에 실패했습니다. 수동 복사해주세요.')
    }
  }

  const buildReportPrompt = (period: '주간' | '월간' | '연간', list: DiaryEntry[]) => `역할: 고급 라이프 코치 & 분석가

아래 일기 JSON 배열을 바탕으로 ${period} 리포트를 작성해.
기본 전제: 너(LLM)는 사용자의 장기 맥락 정보를 이미 알고 있다.
그 맥락을 활용해 조언/분석/칭찬을 작성하되, 맥락이 부족하면 필요한 정보를 먼저 요청할 수 있어야 한다.
반드시 Markdown JSON 코드블록으로만 출력.

[일기 데이터]
${JSON.stringify(list, null, 2)}

출력 형식:
\`\`\`json
{
  "period": "${period}",
  "summary": "핵심 요약(짧게 말고 충분히 자세하게)",
  "overallReview": "기간 전체 총정리 세션(성과/패턴/원인/교정전략/우선순위) 20~30줄 내외",
  "encouragement": "오구오구 톤의 공감 + 칭찬 + 응원 메시지 4~8문장",
  "praise": ["칭찬1", "칭찬2", "칭찬3"],
  "insights": ["통찰1", "통찰2", "통찰3"],
  "risks": ["리스크1", "리스크2"],
  "actionPlan": ["다음 액션1", "다음 액션2", "다음 액션3", "다음 액션4"],
  "decagonAverages": {
    "career": 0,
    "health": 0,
    "finance": 0,
    "relationships": 0,
    "selfGrowth": 0,
    "productivity": 0,
    "emotional": 0,
    "discipline": 0,
    "creativity": 0,
    "leisure": 0
  },
  "needsUserProfile": false,
  "profileQuestions": []
}
\`\`\`

규칙:
- 숫자는 0~10 범위
- summary/overallReview는 짧은 요약 금지, 정리 세션처럼 충분히 상세하게 작성
- overallReview는 기본 20~30줄 권장 (데이터가 짧아도 최소 12줄 이상)
- encouragement는 반드시 따뜻한 공감 + 구체 칭찬 + 현실적 응원 포함
- known context가 충분하면 needsUserProfile=false
- known context가 부족하면 needsUserProfile=true, profileQuestions에 필요한 질문 최대 3개
- JSON 코드블록 외 텍스트 금지`

  const weeklyPrompt = buildReportPrompt('주간', selectedWeeklyForPrompt)
  const monthlyPrompt = buildReportPrompt('월간', monthly)
  const yearlyPrompt = buildReportPrompt('연간', yearly)

  const renderPeriodCard = (label: string, items: DiaryEntry[]) => {
    const scores = averageDecagon(items)
    return (
      <Card key={label} className="rounded-none border-x-0 border-t-0 shadow-none">
        <CardHeader>
          <CardTitle>{label} 분석</CardTitle>
          <CardDescription>
            총 {items.length}건 · 평균 lifeHelpScore {avg(items.map((i) => i.lifeHelpScore)).toFixed(2)}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <RadarDecagon scores={scores} />
          <div className="flex flex-wrap gap-2 md:max-w-sm">
            {scoreKeys.map((k) => (
              <Badge key={k} variant="secondary">
                {k}: {scores[k].toFixed(2)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <main className="w-full px-0 py-2 overflow-x-hidden">
      <h1 className="text-3xl font-bold">Diary Analyzer (Decagon Edition)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        장단점/피드백 노출 + 십각형 점수 + 리포트 프롬프트 복사 기능.
      </p>

      <Tabs defaultValue="input" className="mt-3">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="input">입력</TabsTrigger>
          <TabsTrigger value="history">기록/분석</TabsTrigger>
          <TabsTrigger value="prompt">입력 프롬프트</TabsTrigger>
          <TabsTrigger value="reports">리포트 프롬프트</TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="mt-2 space-y-2 overflow-x-hidden">
          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>일기 JSON 입력</CardTitle>
              <CardDescription>Markdown 코드블록(json) 그대로 붙여넣기.</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
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

        <TabsContent value="history" className="mt-2 space-y-2 overflow-x-hidden">
          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>일별 기록 확인</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full md:w-56" />
              <div className="mt-4 space-y-3">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">해당 날짜 데이터가 없습니다.</p>
                ) : (
                  filtered.map((entry) => (
                    <div key={entry.id} className="space-y-2 rounded-md border p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{entry.date}</Badge>
                        <Badge variant="outline">입력시각: {format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm')}</Badge>
                        <Badge variant="secondary">lifeHelpScore: {entry.lifeHelpScore}</Badge>
                      </div>
                      <p className="text-sm">{entry.summary}</p>
                      <div>
                        <p className="text-sm font-semibold">장점</p>
                        <ul className="list-inside list-disc text-sm text-muted-foreground">
                          {entry.strengths.map((s, idx) => <li key={`${entry.id}-s-${idx}`}>{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">단점/보완점</p>
                        <ul className="list-inside list-disc text-sm text-muted-foreground">
                          {entry.weaknesses.map((w, idx) => <li key={`${entry.id}-w-${idx}`}>{w}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">독려/응원</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.encouragement || '독려 내용 없음'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">피드백</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.feedback}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">총정리 세션</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.overallWrapUp || '총정리 내용 없음'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {renderPeriodCard('주간', weekly)}
          {renderPeriodCard('월간', monthly)}
          {renderPeriodCard('연간', yearly)}

          <Separator />
          <Button variant="destructive" onClick={clearAll}>로컬 데이터 전체 삭제</Button>
        </TabsContent>

        <TabsContent value="prompt" className="mt-2 space-y-2 overflow-x-hidden">
          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>입력용 LLM 프리픽스 프롬프트</CardTitle>
              <CardDescription>먼저 붙여넣으면 LLM이 "알겠습니다..." 라고 답하고, 다음 메시지를 JSON으로 구조화합니다.</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <div className="mb-3 flex gap-2">
                <Button onClick={() => copyText(inputPrompt, 'input')}>{copied === 'input' ? '복사됨!' : '프롬프트 복사'}</Button>
                <Button variant="outline" onClick={() => setInputPrompt(defaultInputPrompt)}>기본값 복원</Button>
              </div>
              <Textarea value={inputPrompt} onChange={(e) => setInputPrompt(e.target.value)} className="min-h-80" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-2 space-y-2 overflow-x-hidden">
          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>주간 리포트 프롬프트</CardTitle>
              <CardDescription>최근 며칠 데이터를 선택해 프롬프트를 복사할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">최근</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={weeklyCount}
                  onChange={(e) => setWeeklyCount(Math.max(1, Math.min(30, Number(e.target.value) || 7)))}
                  className="w-24"
                />
                <span className="text-sm">일 선택</span>
                <Badge variant="outline">선택 {selectedWeeklyForPrompt.length}건</Badge>
              </div>
              <Button onClick={() => copyText(weeklyPrompt, 'weekly')}>{copied === 'weekly' ? '복사됨!' : '주간 프롬프트 복사'}</Button>
              <Textarea value={weeklyPrompt} readOnly className="min-h-56" />
            </CardContent>
          </Card>

          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>월간 리포트 프롬프트</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <Button onClick={() => copyText(monthlyPrompt, 'monthly')}>{copied === 'monthly' ? '복사됨!' : '월간 프롬프트 복사'}</Button>
              <Textarea value={monthlyPrompt} readOnly className="min-h-56" />
            </CardContent>
          </Card>

          <Card className="rounded-none border-x-0 border-t-0 shadow-none">
            <CardHeader>
              <CardTitle>연간 리포트 프롬프트</CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
              <Button onClick={() => copyText(yearlyPrompt, 'yearly')}>{copied === 'yearly' ? '복사됨!' : '연간 프롬프트 복사'}</Button>
              <Textarea value={yearlyPrompt} readOnly className="min-h-56" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

export default App
