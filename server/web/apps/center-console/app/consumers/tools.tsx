"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, Dialog, ErrorBanner, Field } from "@bpm/ui";
import {
  createConsumer,
  deleteConsumer,
  reissueConsumerToken,
  updateConsumer,
  type TokenResult,
} from "@/app/actions";
import { CONSUMER_KINDS, splitTopics, type AppChoice } from "@/lib/consumers";
import { TASK_KIND } from "@/lib/summary";

/**
 * CON-17 일꾼의 손잡이들 (ADR-0137). 줄마다 「...」 하나이고 할 수 있는 일은 그 안에 있다. 토픽 모양·이름 겹침은
 * **Center가 본다** (한 자리에서만 판정한다). 토큰 원문은 서버 액션의 답으로 **이 창에만** 오고 남기지 않는다.
 */
const TOPICS_HELP =
  "서비스 앱 id나 외부 확장 id — 영문 소문자·숫자·.·-. 일꾼이 뜰 때 그 앱을 올리면 연결 앱에 나타납니다.";
const TOPICS_EFFECT =
  "다음 가져가기부터 반영됩니다. 빠진 토픽의 일감은 이 일꾼이 더 가져가지 않고, 맡을 일꾼이 없어진 외부 확장은 등록이 해제됩니다.";
const TEXTAREA = "rounded-md border border-border-strong bg-bg-surface p-2 font-mono text-body-sm";
const KINDS_HELP = "이 일꾼이 가져갈 일감의 종류입니다. 고르지 않은 종류의 일감은 같은 토픽이어도 가져가지 않습니다.";

/** 「종류」 체크박스 셋 — 하나 이상 (ADR-0139). 고른 것이 없으면 서버 액션이 막는다. */
function KindsField({ defaultValue = [] }: { defaultValue?: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1 text-body-sm">
      <legend>종류</legend>
      <div className="flex flex-wrap gap-4 py-1">
        {CONSUMER_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-1">
            <input type="checkbox" name="kinds" value={kind} defaultChecked={defaultValue.includes(kind)} />
            {TASK_KIND[kind]}
          </label>
        ))}
      </div>
      <span className="text-text-muted">{KINDS_HELP}</span>
    </fieldset>
  );
}

/**
 * 「맡을 연결 앱」 — 토픽은 곧 연결 앱 id다(CON-18). 목록에서 체크하고, 아직 목록에 없는 앱(일꾼이 처음 올릴 것)은
 * 「직접 적기」에 적는다. 맡는 토픽은 둘을 합친 것이다(`pickTopics`). `choices`가 `null`이면 목록을 못 읽었다.
 */
function AppsField({ choices, topics = [], help }: { choices: AppChoice[] | null; topics?: string[]; help: string }) {
  const { checked, other } = splitTopics(topics, choices ?? []);
  return (
    <fieldset className="flex flex-col gap-2 text-body-sm">
      <legend>맡을 연결 앱</legend>
      {choices === null ? (
        <span className="text-text-muted">연결 앱 목록을 읽지 못했습니다 — 직접 적으세요.</span>
      ) : choices.length === 0 ? (
        <span className="text-text-muted">아직 연결 앱이 없습니다 — 맡을 앱 id를 직접 적으세요.</span>
      ) : (
        <ul className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border-default">
          {choices.map((one) => (
            <li key={one.id} className="border-b border-border-default last:border-b-0">
              <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-subtle">
                <input type="checkbox" name="topics" value={one.id} defaultChecked={checked.includes(one.id)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-text-primary">
                    {one.name} <span className="font-mono text-caption text-text-muted">{one.id}</span>
                  </span>
                  <span className="text-caption text-text-muted">
                    {one.kinds} · 맡은 일꾼: {one.workers.length ? one.workers.join(", ") : "—"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        직접 적기 (목록에 없는 앱 id, 한 줄에 하나)
        <textarea name="topics_text" rows={2} defaultValue={other.join("\n")} className={TEXTAREA} />
        <span className="text-text-muted">{help}</span>
      </label>
    </fieldset>
  );
}

/** 토큰 창 — 원문 한 줄과 「복사」. 닫으면 다시 볼 수 없다. */
function TokenView({ token }: { token: string }) {
  const [said, setSaid] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setSaid("복사했습니다.");
    } catch {
      setSaid("복사하지 못했습니다 — 글자를 골라 복사하세요.");
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="break-all font-mono text-body text-text-primary" style={{ userSelect: "all" }}>
          {token}
        </span>
        <Button size="sm" variant="ghost" onClick={copy}>
          복사
        </Button>
      </p>
      {said ? <span className="text-caption text-text-muted">{said}</span> : null}
      <p className="text-body-sm text-text-secondary">
        이 창을 닫으면 다시 볼 수 없습니다. 일꾼 설정의 Center 토큰에 넣으세요.
      </p>
    </div>
  );
}

export function NewConsumer({ apps }: { apps: AppChoice[] | null }) {
  const [open, setOpen] = useState(false);
  // 원문은 이 창이 열려 있는 동안만 든다 — 닫으면 버린다.
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null);
  const router = useRouter();
  const [result, action, pending] = useActionState<TokenResult, FormData>(async (previous, form) => {
    const made = await createConsumer(previous, form);
    if (made.token) setShown({ name: made.name ?? "", token: made.token });
    return { error: made.error };
  }, {});
  const close = () => {
    setOpen(false);
    if (shown) {
      setShown(null);
      router.refresh();
    }
  };
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        새 일꾼...
      </Button>
      <Dialog open={open} title={shown ? `${shown.name} 토큰` : "새 일꾼"} onClose={close}>
        {shown ? (
          <div className="flex flex-col gap-3">
            <TokenView token={shown.token} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={close}>
                닫기
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            {result.error ? <ErrorBanner message={result.error} /> : null}
            <Field
              label="이름"
              name="name"
              required
              autoComplete="off"
              maxLength={64}
              help="로그와 실행 상세에 보이는 이름입니다. 1~64자, 다른 일꾼과 겹치지 않게."
            />
            <KindsField />
            <AppsField choices={apps} help={TOPICS_HELP} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                취소
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                만들기
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

type Ask = "edit" | "token" | "delete";

export function ConsumerMenu({
  consumerId,
  name,
  topics,
  kinds,
  apps,
}: {
  consumerId: string;
  name: string;
  topics: string[];
  kinds: string[];
  apps: AppChoice[] | null;
}) {
  // 메뉴는 화면에 고정해 띄운다 — 표 상자는 넘치는 것을 자르므로 줄이 적으면 안에 그린 메뉴가 잘린다.
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [asking, setAsking] = useState<Ask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!menu) return;
    const shut = () => setMenu(null);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    document.addEventListener("click", shut);
    return () => {
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
      document.removeEventListener("click", shut);
    };
  }, [menu]);

  const closeToken = () => {
    setToken(null);
    setAsking(null);
    router.refresh();
  };

  const done = (result: { error?: string }) => {
    setError(result.error ?? null);
    if (!result.error) {
      setAsking(null);
      router.refresh();
    }
  };

  const items: Array<{ ask: Ask; label: string; tip?: string }> = [
    { ask: "edit", label: "편집...", tip: `종류와 토픽을 바꿉니다. ${TOPICS_EFFECT}` },
    { ask: "token", label: "토큰 새로 발급...", tip: "지금 토큰은 바로 거부되고 새 토큰을 한 번만 보입니다." },
    { ask: "delete", label: "삭제...", tip: "토큰을 폐기하고 목록에서 지웁니다." },
  ];

  return (
    <div className="relative flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`${name} 일꾼 동작`}
        onClick={(event) => {
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { top: box.bottom, right: window.innerWidth - box.right });
        }}
      >
        ...
      </Button>
      {menu ? (
        <ul
          className="fixed z-20 flex min-w-[200px] flex-col border border-border-default bg-bg-surface py-1 shadow-md"
          style={{ top: menu.top, right: menu.right }}
        >
          {items.map((item) => (
            <li key={item.ask}>
              <button
                type="button"
                title={item.tip}
                className="w-full px-3 py-2 text-left text-body hover:bg-bg-subtle"
                onClick={() => {
                  setMenu(null);
                  setError(null);
                  setAsking(item.ask);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error && asking === null ? <ErrorBanner message={error} /> : null}

      <Dialog open={asking === "edit"} title={`${name} 편집`} onClose={() => setAsking(null)}>
        <form
          className="flex flex-col gap-3"
          action={(form) => start(async () => done(await updateConsumer(consumerId, form)))}
        >
          {error ? <ErrorBanner message={error} /> : null}
          <KindsField defaultValue={kinds} />
          <AppsField choices={apps} topics={topics} help={`${TOPICS_HELP} ${TOPICS_EFFECT}`} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAsking(null)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              저장
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={asking === "token" && token === null}
        title={`${name}의 토큰을 새로 발급할까요?`}
        description="지금 토큰은 바로 거부됩니다 — 일꾼은 새 토큰을 넣고 다시 띄울 때까지 일감을 가져가지 못합니다. 새 토큰은 한 번만 보입니다."
        confirmLabel="새로 발급"
        onConfirm={() =>
          start(async () => {
            const made = await reissueConsumerToken(consumerId);
            setError(made.error ?? null);
            if (made.token) setToken(made.token);
            else setAsking(null);
          })
        }
        onCancel={() => setAsking(null)}
      />
      <Dialog open={token !== null} title={`${name} 토큰`} onClose={closeToken}>
        {token ? (
          <div className="flex flex-col gap-3">
            <TokenView token={token} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={closeToken}>
                닫기
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={asking === "delete"}
        title={`${name} 일꾼을 지울까요?`}
        description="이 일꾼의 토큰을 폐기하고 목록에서 지웁니다. 쥐고 있던 일감은 잠금이 풀리면 다시 줄에 섭니다. 맡을 일꾼이 없어진 외부 확장은 등록이 해제됩니다. 되돌릴 수 없습니다."
        confirmLabel="삭제"
        onConfirm={() => start(async () => done(await deleteConsumer(consumerId)))}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}
