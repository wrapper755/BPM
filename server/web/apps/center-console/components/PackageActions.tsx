"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu, Button, ConfirmDialog, ErrorBanner } from "@bpm/ui";
import { approvePackage, deletePackage, deprecatePackage, revokePackage, type ActionResult } from "@/app/actions";

/**
 * 패키지 한 판의 승인 단추 (CON-02 줄·CON-06 상세). **서명은 Center가 한다** (ADR-0090) —
 * 여기서는 누르기만 한다. 상태마다 할 수 있는 것만 보인다:
 *
 * | 상태 | 단추 |
 * | --- | --- |
 * | 후보 | 「승인...」 |
 * | 승인됨 | 「승인 철회...」·「지원 종료...」 |
 * | 지원 종료 | 「승인...」(새 배포를 다시 연다)·「승인 철회...」 |
 * | 철회 | 없다 — 되살아나지 않는다 |
 *
 * 모두 확인 창을 거치고 기본은 「취소」다 (U9).
 *
 * `deletable`이면 메뉴 맨 아래에 「삭제...」가 붙는다(상태와 상관없다 — CON-02 줄, 표 아래 따로 서던 폼을 걷었다).
 */
type Ask = "approve" | "revoke" | "deprecate" | "delete";

const ASK: Record<Ask, { label: string; title: string; description: string; confirm: string; danger?: boolean }> = {
  approve: {
    label: "승인...",
    title: "승인할까요?",
    description: "승인하면 이 판을 배포할 수 있습니다. 승인한 사람으로 이 계정이 남습니다.",
    confirm: "승인",
  },
  revoke: {
    label: "승인 철회...",
    title: "승인을 철회할까요?",
    description: "이 판의 배포가 모두 무효가 되고 현장에서 실행 불가가 됩니다. 되돌릴 수 없습니다.",
    confirm: "철회",
    danger: true,
  },
  deprecate: {
    label: "지원 종료...",
    title: "지원을 종료할까요?",
    description: "새 배포만 막습니다. 이미 배포된 것은 그대로 돕니다. 다시 승인하면 풀립니다.",
    confirm: "지원 종료",
  },
  delete: {
    label: "삭제...",
    title: "지울까요?",
    // C5 `DELETE /packages` — 참조되면 409 `in_use`라 아무것도 지우지 않는다(막은 쪽은 창 안에 보인다).
    description: "되돌릴 수 없습니다. 살아 있는 배포나 다른 패키지가 참조하면 지워지지 않습니다.",
    confirm: "삭제",
    danger: true,
  },
};

const ACTIONS: Record<Ask, (id: string, version: string) => Promise<ActionResult>> = {
  approve: approvePackage,
  revoke: revokePackage,
  deprecate: deprecatePackage,
  delete: deletePackage,
};

export function asksFor(status: string): Array<Exclude<Ask, "delete">> {
  if (status === "candidate") return ["approve"];
  if (status === "approved") return ["revoke", "deprecate"];
  if (status === "deprecated") return ["approve", "revoke"];
  return [];
}

export function PackageActions({
  packageId,
  version,
  status,
  place,
  onDone,
  compact,
  deletable,
}: {
  packageId: string;
  version: string;
  status: string;
  /**
   * 「회사: … · 업무 자리: …」 — 승인 창에 **보여 주기만** 한다 (ADR-0127). 자리는 Studio가 올릴 때
   * 골라 매니페스트에 실었고, 틀렸으면 승인하지 않고 Studio에서 다시 올린다.
   */
  place?: string;
  /** 확인 창이 닫힌 뒤 — 메뉴를 닫는 데 쓴다. */
  onDone?: () => void;
  /**
   * **표의 줄**에서는 단추 대신 「⋯」 메뉴 하나다 (ADR-0164 — 줄마다 빨간 「승인 철회...」가 열다섯 번
   * 서면 그것이 화면에서 가장 큰 소리였다). 상세 화면은 단추 그대로다(영역에 하나라서다).
   */
  compact?: boolean;
  /** 「삭제...」도 메뉴에 둔다 (`compact`일 때만 — 상세 화면은 「관리」 영역에 따로 있다). */
  deletable?: boolean;
}) {
  const [asking, setAsking] = useState<Ask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const asks: Ask[] = [...asksFor(status), ...(compact && deletable ? (["delete"] as const) : [])];
  if (asks.length === 0) return compact ? null : <span className="text-text-muted">—</span>;
  const shown = asking ? ASK[asking] : null;

  return (
    <div className="flex flex-col gap-1">
      {compact ? (
        <ActionMenu
          label={`${packageId} ${version} 동작`}
          disabled={pending}
          items={asks.map((one) => ({ label: ASK[one].label, danger: ASK[one].danger, onSelect: () => setAsking(one) }))}
        />
      ) : (
      <div className="flex gap-2 whitespace-nowrap">
        {asks.map((one) => (
          <Button
            key={one}
            size="sm"
            variant={one === "approve" ? "primary" : one === "revoke" ? "danger" : "secondary"}
            disabled={pending}
            onClick={() => setAsking(one)}
          >
            {ASK[one].label}
          </Button>
        ))}
      </div>
      )}
      {error && !compact ? <ErrorBanner message={error} /> : null}
      <ConfirmDialog
        open={shown !== null}
        title={`${packageId} ${version} — ${shown?.title ?? ""}`}
        description={
          asking === "approve" && place
            ? `${shown?.description ?? ""} ${place}. 자리가 틀렸으면 승인하지 말고 Studio에서 다시 올리세요.`
            : shown?.description
        }
        confirmLabel={shown?.confirm ?? ""}
        danger={shown?.danger}
        onConfirm={() =>
          start(async () => {
            const result = await ACTIONS[asking!](packageId, version);
            setError(result.error ?? null);
            // 표의 줄에서는 까닭(409 `in_use`의 막은 배포·패키지 등)을 **창 안에** 보인다 — 3rem 칸에는 펼 자리가 없다.
            if (result.error && compact) return;
            setAsking(null);
            if (!result.error) {
              router.refresh();
              onDone?.();
            }
          })
        }
        onCancel={() => {
          setAsking(null);
          if (compact) setError(null);
          onDone?.();
        }}
      >
        {compact && error ? <ErrorBanner message={error} /> : null}
      </ConfirmDialog>
    </div>
  );
}
