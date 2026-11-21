import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, ErrorBanner, MetaList, Section, StatusBadge } from "@bpm/ui";
import type { ApprovalInfo, FormField } from "@bpm/api-types/c6-approval-info";
import { CenterError, center, session } from "@/lib/center";
import { Markdown } from "@/components/Markdown";
import { Shell } from "@/components/Shell";
import { answerApproval } from "@/app/actions";
import { WithdrawApproval } from "../withdraw";
import { ConditionalFields } from "./conditions";
import { hasConditions } from "@/lib/form-conditions";
import { STATE_LABEL, WITHDRAW_LABEL, where } from "../page";
import { between, fullTime, time, took } from "@/lib/time";
import { loadNodeNames, loadProcessNames, processNamer } from "@/lib/names";

/**
 * CON-04 결재함 (상세) — 검토 자료와 답하기.
 *
 * **값이 보이는 유일한 곳이다** (C6 §`review`는 원칙 6의 예외). 그래서 접어 둔다 (U10).
 *
 * 「답하기」는 **일반 `<form>` + 서버 액션**이다 — JS 없이도 답할 수 있고, 폼과 맞지 않는
 * 답은 Center가 칸 이름과 함께 돌려주어 그 자리에 보인다 (C6 `answer_invalid`).
 *
 * **본문 + 오른쪽 요약** (ADR-0164) — 요약을 화면 폭 전체의 네 칸 격자로 흩었더니 이름과 값이 멀어지고
 * 긴 설명이 1440px로 늘어져 읽히지 않았다. 「회수...」는 제목 오른쪽의 칠하지 않은 단추다.
 */

/** 검토 자료 한 칸 — 목록은 글머리표로, 그 밖은 글자로 (CMN-01과 같은 규칙, C6). */
function Shown({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-5">
        {value.map((one, index) => (
          <li key={index}>{typeof one === "object" ? JSON.stringify(one) : String(one)}</li>
        ))}
      </ul>
    );
  }
  if (value !== null && typeof value === "object") {
    return <code className="text-body-sm">{JSON.stringify(value)}</code>;
  }
  return <>{String(value)}</>;
}

/** 선택지가 이만큼 이하면 단추 줄로 보인다 — 결재의 결정이 드롭다운 안에 숨지 않게 (CON-04). */
const BUTTON_CHOICES = 4;

/**
 * 선택지 단추 줄 — **라디오**라 JS 없이 돌고 서버 액션은 `<select>`와 같은 값을 받는다.
 * 고른 것은 `primary` 테두리 + `primary.subtle` 바탕이다. 키보드 초점은 감춘 라디오에 있으니 그 테두리를 단추에 그린다.
 */
function ChoiceButtons({
  name,
  choices,
  preset,
  bad,
}: {
  name: string;
  choices: Array<{ value: string; label: string }>;
  preset: string | null;
  bad: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-2">
      {choices.map((one) => (
        <label key={one.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={one.value}
            defaultChecked={preset === one.value}
            className="peer sr-only"
          />
          <span
            className={`inline-flex h-9 items-center rounded-md border bg-bg-surface px-4 text-body text-text-primary hover:border-primary peer-checked:border-primary peer-checked:bg-primary-subtle peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${bad ? "border-status-failed-solid" : "border-border-strong"}`}
          >
            {one.label}
          </span>
        </label>
      ))}
    </span>
  );
}

/** 폼 칸 하나 → 입력 칸 (C6 `type`). 모르는 종류는 글 칸이다. */
function Field({ field, bad }: { field: FormField; bad: boolean }) {
  const border = bad ? "border-status-failed-solid" : "border-border-strong";
  const common = `h-9 border px-2 text-body bg-bg-surface ${border}`;
  // 계약의 `default`는 아무 타입이나 올 수 있다 (C6) — 칸 종류에 맞춰 읽는다.
  const preset: unknown = field.default;
  const choices = (field.choices ?? []).map((one) => ({ value: String(one), label: String(one) }));
  if (field.type === "choice" && choices.length > 0 && choices.length <= BUTTON_CHOICES) {
    // 단추 줄은 칸이 여럿이라 `<label>`로 감싸지 않는다 — 묶음 이름은 `<legend>`다.
    return (
      <fieldset className="flex flex-col gap-1 text-body-sm">
        <legend className={`mb-1 ${bad ? "text-status-failed-fg" : "text-text-muted"}`}>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        <ChoiceButtons name={field.key} choices={choices} preset={preset == null ? null : String(preset)} bad={bad} />
      </fieldset>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-body-sm">
      <span className={bad ? "text-status-failed-fg" : "text-text-muted"}>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.type === "bool" ? (
        <input type="checkbox" name={field.key} defaultChecked={preset === true} className="size-5" />
      ) : field.type === "choice" ? (
        <select name={field.key} className={common} defaultValue={preset == null ? "" : String(preset)}>
          <option value="">(고르세요)</option>
          {(field.choices ?? []).map((one) => (
            <option key={String(one)} value={String(one)}>
              {String(one)}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          name={field.key}
          step={field.type === "number" ? "any" : undefined}
          defaultValue={preset == null ? "" : String(preset)}
          className={common}
        />
      )}
    </label>
  );
}

export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ error?: string; fields?: string; answered?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  const { requestId } = await params;
  const asked = await searchParams;
  const wanted = decodeURIComponent(requestId);
  const bad = new Set((asked.fields ?? "").split(",").filter(Boolean));

  let info: ApprovalInfo | null = null;
  let failure: string | null = null;
  try {
    info = await center.approval(wanted);
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const fields = info?.form?.fields ?? [];
  const review = Object.entries(info?.review ?? {});
  const canAnswer = found.mode === "admin" && info?.state === "open";
  // 사람은 이름으로 읽는다 — id는 말풍선에 (U2). 못 받으면 id 그대로다.
  const [processNames, nodeNames] = await Promise.all([
    loadProcessNames(),
    info ? loadNodeNames([[info.bpm_process_id, info.version]]) : Promise.resolve(new Map<string, string>()),
  ]);
  const processName = info ? processNamer(processNames)(info.bpm_process_id, info.version) : null;
  const nodeName = info ? nodeNames.get(`${info.bpm_process_id}@${info.version}#${info.node_id}`) : undefined;

  return (
    <Shell mode={found.mode} actor={found.actor} current="/approvals">
      <header>
        <h1 className="text-h2 font-bold">{info?.title ?? "결재 요청"}</h1>
        {canAnswer && info ? <WithdrawApproval requestId={info.request_id} /> : null}
      </header>

      {failure ? <ErrorBanner message={failure} /> : null}
      {asked.answered ? (
        <p className="mb-4 text-body text-status-completed-fg">
          답을 보냈습니다. 실행하는 쪽이 다음 하트비트에 받아 갑니다.
        </p>
      ) : null}

      {info ? (
        // 넓은 화면은 본문(왼쪽) + 요약(오른쪽), 좁은 화면은 요약이 먼저다 — 휴대폰 결재자가 무엇인지부터 본다.
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <aside className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--size-topbar-height)+1.5rem)] lg:order-2">
            <Section title="요약">
              <MetaList
                items={[
                  ["상태", <StatusBadge key="s" group="결재" label={STATE_LABEL[info.state] ?? info.state} />],
                  ["기다린 시간", took(between(info.created_at, info.answered_at))],
                  [
                    "BPM 프로세스",
                    <span key="p" title={`${info.bpm_process_id}@${info.version}`}>
                      {processName ? `${processName} · v${info.version}` : `${info.bpm_process_id}@${info.version}`}
                    </span>,
                  ],
                  [
                    "단계",
                    <span key="n" className={nodeName ? "" : "font-mono"} title={info.node_id}>
                      {nodeName ?? info.node_id}
                    </span>,
                  ],
                  [
                    "담당",
                    (info.assignees ?? []).length > 0
                      ? (info.assignees ?? []).join(", ")
                      : "담당자 없음 — 콘솔에서만 답합니다",
                  ],
                  ["요청 시각", time(info.created_at)],
                  ["시한", fullTime(info.expires_at)],
                  ...(info.requested_by ? ([["요청한 쪽", info.requested_by]] as Array<[string, string]>) : []),
                ]}
              />
              <Link
                className="mt-3 inline-block text-body-sm text-primary hover:underline"
                href={`/runs/${encodeURIComponent(info.run_id)}`}
              >
                실행 기록 보기 →
              </Link>
              {/* 사람이 외워 쓸 일이 없는 값 — 접어 둔다 (U2). */}
              <details className="mt-3 border-t border-border-default pt-3">
                <summary className="cursor-pointer text-body-sm text-text-muted">기술 정보</summary>
                <div className="mt-2">
                  <MetaList
                    items={[
                      ["실행하는 곳", where(info)],
                      ["노드 id", <span key="n" className="font-mono break-all">{info.node_id}</span>],
                      ["실행 id", <span key="r" className="font-mono break-all">{info.run_id}</span>],
                      ["요청 id", <span key="q" className="font-mono break-all">{info.request_id}</span>],
                      ["전달됨", info.delivered ? "실행하는 쪽이 받아 갔습니다" : "아직"],
                    ]}
                  />
                </div>
              </details>
            </Section>
          </aside>
          <div className="flex min-w-0 flex-col gap-5 lg:order-1">
          {/* 거절은 되돌림이다 — 요청은 다시 「대기」이고, 왜 거절됐는지가 위에 선다 (C6). */}
          {info.delivery_accepted === false && info.delivery_reason ? (
            <ErrorBanner
              message={`실행기가 이전 답을 거절했습니다: ${info.delivery_reason} — 고쳐서 다시 답하세요`}
            />
          ) : null}

          {/* 결재 설명은 Markdown이다 (C14 「결재 설명」, ADR-0134). 읽기 좋은 폭에서 줄을 바꾼다. */}
          {info.description ? (
            <Section title="결재 설명">
              <div className="max-w-[72ch] text-body leading-relaxed">
                <Markdown source={info.description} />
              </div>
            </Section>
          ) : null}

          {/* **값이 보이는 유일한 곳**이다 (C6). 접어 둔다 (U10). */}
          <Section title="결재에 필요한 값">
            {review.length === 0 ? (
              <p className="text-body-sm text-text-muted">올라온 검토 자료가 없습니다.</p>
            ) : (
              <details>
                <summary className="cursor-pointer text-body-sm text-text-muted">
                  업무 데이터 {review.length}개 — 펼쳐 보기
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-body">
                  {review.map(([name, value]) => (
                    <div key={name} className="contents">
                      <dt className="text-text-muted">{name}</dt>
                      <dd>
                        <Shown value={value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </Section>

          {info.state === "answered" ? (
            <Section title="답">
              <p className="text-body">
                {JSON.stringify(info.answer)}{" "}
                <span className="text-text-muted">
                  {info.answered_via
                    ? `— ${info.answered_by}, 「${info.answered_via}」 키로 대리 답 (이름은 그 키를 쓰는 쪽이 확인) · ${time(info.answered_at)}`
                    : `(${info.answered_by} · ${time(info.answered_at)})`}
                </span>
              </p>
            </Section>
          ) : null}

          {info.state === "withdrawn" ? (
            <Section title="회수">
              <p className="text-body">
                회수됨 — {WITHDRAW_LABEL[info.withdraw_reason ?? ""] ?? info.withdraw_reason ?? "사유 없음"}
              </p>
            </Section>
          ) : null}

          {canAnswer ? (
            <Section title="답하기">
              {asked.error ? <ErrorBanner message={asked.error} /> : null}
              <form action={answerApproval} className="flex max-w-xl flex-col gap-3">
                <input type="hidden" name="request_id" value={info.request_id} />
                {fields.length === 0 ? (
                  <>
                    {/* 폼이 없으면 「승인 / 반려」다 (C6 `decision`). **거절도 답이다.** */}
                    <fieldset className="flex flex-col gap-1 text-body-sm">
                      <legend className="mb-1 text-text-muted">결정 *</legend>
                      <ChoiceButtons
                        name="decision"
                        choices={[
                          { value: "approve", label: "승인" },
                          { value: "reject", label: "반려" },
                        ]}
                        preset="approve"
                        bad={false}
                      />
                    </fieldset>
                    <label className="flex flex-col gap-1 text-body-sm">
                      <span className="text-text-muted">메모</span>
                      <input
                        type="text"
                        name="comment"
                        className="h-9 rounded-md border border-border-strong bg-bg-surface px-2 text-body"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    {/* 조건부 칸은 감싸개의 `data-field`로 숨긴다 — JS가 없으면 다 보인다 (ADR-0188). */}
                    {fields.map((field) => (
                      <div key={field.key} data-field={field.key}>
                        <Field field={field} bad={bad.has(field.key)} />
                      </div>
                    ))}
                    {hasConditions(fields) ? <ConditionalFields fields={fields} bad={[...bad]} /> : null}
                  </>
                )}
                {/* 답한 사람은 **로그인한 계정**이다 (ADR-0090). 담당자가 있어도 막지 않는다 (ADR-0080). */}
                {(info.assignees ?? []).length > 0 ? (
                  // 담당이 따로 있다 — 누가 답한 것으로 남는지 **보내기 전에** 보인다 (막지는 않는다, ADR-0080).
                  <p className="rounded-md bg-primary-subtle px-3 py-2 text-body-sm text-text-primary">
                    담당은 <strong>{(info.assignees ?? []).join(", ")}</strong>입니다 — 지금 답하면 답한 사람은{" "}
                    <strong>「{found.actor}」 계정</strong>으로 남습니다.
                  </p>
                ) : (
                  <p className="text-body-sm text-text-muted">답하는 사람: {found.actor}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">
                    답 보내기
                  </Button>
                </div>
              </form>
            </Section>
          ) : found.mode !== "admin" && info.state === "open" ? (
            <p className="text-body-sm text-text-muted">
              답하려면 「관리자」 모드로 들어오세요 — 지금은 보기 전용입니다.
            </p>
          ) : null}
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
