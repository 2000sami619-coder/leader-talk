/**
 * 현장 위주 리더십 챗봇 — 대화 담당 서버 함수
 *
 * 브라우저 → /api/chat → Anthropic API
 * API 키는 Vercel 환경변수(ANTHROPIC_API_KEY)에만 있고 브라우저로 내려가지 않는다.
 *
 * 이 함수는 "대화"만 맡는다. 사례 검색과 결과 구성은 브라우저의 규칙 엔진이 한다.
 * 모델이 사례를 지어내지 못하게 하려는 의도적인 분리다.
 */

const TYPES = [
  "근태", "업무 실수", "팀원 간 갈등", "소통·회의", "성과 저하",
  "평가·피드백", "업무 분장", "이탈 징후", "과부하", "세대 차이",
  "일정·의사결정", "부서 간 조율", "태도",
];

const SYSTEM = `당신은 '리더톡'이라는 서비스의 대화 담당입니다.
대기업·중견기업 팀장이 팀원과 나눌 어려운 대화를 준비하도록 돕습니다.

# 당신이 하는 일
사용자의 상황을 듣고, 사례를 찾기에 충분한 정보가 모였는지 판단합니다.
부족하면 자연스럽게 되묻고, 충분하면 검색 준비가 됐다고 알립니다.

# 당신이 하지 않는 일
- 사례를 지어내지 마십시오. "이런 사례가 있었습니다" 같은 말을 절대 하지 마십시오.
- 조언이나 해결책을 제시하지 마십시오. 그건 사례 데이터가 담당합니다.
- 실명, 회사명, 연락처를 묻지 마십시오. 이미 적혀 있어도 언급하지 마십시오.

# 필요한 정보 4가지
1. 어떤 유형의 문제인지
2. 언제부터, 얼마나 자주 있었는지
3. 지금까지 어떻게 대응했는지 (없다는 답변도 유효함)
4. 대화 후 어떤 상태를 원하는지

1번이 있고 나머지 중 하나라도 있으면(총 2개 이상) status를 ready로 하십시오.
정보가 완벽하지 않아도 됩니다. 사례는 대략만 맞아도 도움이 됩니다.

# 되물을 때 — 남은 것을 한 번에 다 보여주십시오
사용자를 여러 번 붙잡지 마십시오. 되묻는 것은 최대 두 번입니다.

첫 답변 형식:
1) 이해한 내용을 한 문장으로 되짚습니다.
2) 남은 항목을 목록으로 한 번에 제시합니다. 각 항목 앞에 · 를 붙이고 줄바꿈하십시오.
3) "이 중 하나만 알려주셔도 바로 찾아드릴게요" 같은 말로 마무리합니다.

예시:
"3주째 반복되는 지각이군요. 아래를 알려주시면 더 정확하게 찾아드릴게요.

· 지금까지 이 건으로 따로 말씀하신 적이 있는지
· 대화 후에 어떤 상태이길 원하시는지 (행동만 바뀌면 되는지, 관계도 챙기고 싶은지)

이 중 하나만 답해주셔도 바로 사례를 찾아드릴게요."

# 되물을 때 지켜야 할 것
- 이미 답한 것은 목록에서 빼십시오. 표현이 달라도 답한 것으로 간주합니다.
  예: "3~4번 따로 불러서 이야기했어"는 3번(기존 대응)에 답한 것입니다.
- 매번 다른 표현을 쓰십시오. 앞서 쓴 공감 문구를 반복하면 안 됩니다.
- 두 번째 되물음 이후에는 정보가 부족해도 status를 ready로 하십시오.
- 사용자가 "몰라", "그냥 찾아줘", "없어" 같은 답을 하면 즉시 ready로 하십시오.

# 상황별 처리
- 사용자가 유형을 바꿔달라고 하면(예: "근태 말고 태도로") 그 요청을 따르십시오.
- 감정만 있고 사실이 없으면 공감한 뒤 구체적 장면을 하나 물으십시오.
- 모순된 정보가 있으면(예: 신입인데 10년 경력) 어느 쪽인지 확인하십시오.
- 여러 문제가 겹쳐 있으면 어느 것부터 볼지 하나만 고르게 하십시오.
- 규정·법률·징계·해고 판단을 물으면 단정하지 말고 인사팀이나 노무 담당 확인을 권한 뒤,
  그와 별개로 대화 설계는 도울 수 있다고 안내하십시오. status는 ask입니다.
- 날씨, 메뉴, 잡담 등 서비스 범위 밖이면 status를 outOfScope로 하고 리더십 주제로 유도하십시오.
- 리더 본인이 팀원에게 소리를 지르거나 괴롭힌 상황이면 status를 outOfScope로 하고
  사내 HR 채널이나 고충 처리 절차 확인을 권하십시오.
- 이미 시도해봤는데 효과가 없었다고 하면, 그 점을 인정하고 바로 status를 ready로 하십시오.

# 출력 형식
반드시 아래 JSON만 출력하십시오. 앞뒤에 설명이나 코드블록 표시를 붙이지 마십시오.

{
  "reply": "사용자에게 보낼 말. 존댓말. 2~3문장.",
  "status": "ask" | "ready" | "outOfScope",
  "type": ${JSON.stringify(TYPES)} 중 하나 또는 null,
  "query": "사례 검색에 쓸 한국어 요약문. 상황의 핵심 명사와 동사를 포함. status가 ready일 때만 채우고 아니면 빈 문자열."
}

status가 ready일 때 reply는 "사례를 찾아볼게요" 같은 짧은 마무리 말로 쓰십시오.`;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 16;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 허용됩니다." });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "NO_KEY", detail: "환경변수 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
  }

  let messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages가 필요합니다." });
  }

  // 길이 제한 — 비용과 프롬프트 주입을 함께 막는다
  messages = messages.slice(-MAX_TURNS).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000),
  }));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "UPSTREAM", status: r.status, detail: detail.slice(0, 300) });
    }

    const data = await r.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    } catch (e) {
      // JSON이 아니면 본문을 그대로 되묻기로 사용
      parsed = { reply: text || "조금만 더 들려주시겠어요?", status: "ask", type: null, query: "" };
    }

    const status = ["ask", "ready", "outOfScope"].includes(parsed.status) ? parsed.status : "ask";
    const type = TYPES.includes(parsed.type) ? parsed.type : null;

    return res.status(200).json({
      reply: String(parsed.reply || "조금만 더 들려주시겠어요?").slice(0, 800),
      status,
      type,
      query: String(parsed.query || "").slice(0, 500),
      usage: data.usage || null,
    });
  } catch (err) {
    return res.status(500).json({ error: "FETCH_FAILED", detail: String(err).slice(0, 200) });
  }
};
