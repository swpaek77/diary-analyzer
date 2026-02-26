# Diary Analyzer

React + TailwindCSS + shadcn/ui + TypeScript(TSX) 기반의 일기 분석 앱입니다.

## 기능
- Markdown JSON 코드블록 입력 파싱
- 오늘 일기 요약/장단점/피드백/인생 도움 점수 저장
- 입력 시각(createdAt) 자동 저장
- 누적 데이터 기반 주간/월간/연간 분석
- Zustand persist + localStorage 로컬 저장
- 추후 Supabase 마이그레이션 가능한 구조

## 실행
```bash
npm install
npm run dev
```

## 빌드
```bash
npm run build
npm run preview
```

## JSON 스키마 예시
```json
{
  "date": "2026-02-27",
  "summary": "오늘의 일기 요약",
  "strengths": ["집중력 좋음"],
  "weaknesses": ["운동을 놓침"],
  "feedback": "아침 루틴을 고정해보자",
  "lifeHelpScore": 8,
  "areas": {
    "career": 8,
    "health": 6,
    "finance": 5,
    "relationships": 7,
    "selfGrowth": 9
  }
}
```

## Supabase 마이그레이션 가이드(요약)
1. `entries` 테이블 생성 (`id`, `date`, `summary`, `strengths`, `weaknesses`, `feedback`, `life_help_score`, `areas`, `created_at`)
2. Zustand store의 `persist` 레이어를 API fetch/save로 교체
3. 로그인 도입 시 user_id 컬럼 추가
