import { redirect } from "next/navigation";
import { Button, ErrorBanner } from "@bpm/ui";
import type { DeploymentInfo } from "@bpm/api-types/c5-deployment-info";
import type { ManifestInput } from "@bpm/api-types/c5-package-info";
import { fromCaller } from "@/lib/inputs";
import { serverLimit, serverVersions } from "@/lib/jobs";
import { CenterError, center, session } from "@/lib/center";
import { Shell } from "@/components/Shell";
import { createJob } from "@/app/actions";

/**
 * CON-05 「새 작업」 — 관리자 모드만.
 *
 * **두 걸음이고 둘 다 JS 없이 돈다.** 먼저 GET 폼으로 BPM 프로세스 → 버전을 고르면(주소에 남는다),
 * 그 버전의 매니페스트(C1 `inputs`)로 입력 칸을 그린 POST 폼이 나온다.
 *
 * - **고를 실행기 칸이 없다** (자리가 하나다 — ADR-0144) — 「서버 실행기에서 실행 — 동시 실행 상한
 *   <n>」이고 실행기는 Center가 빈자리로 고른다(`target.id = "*"`, C5 `JobTarget`).
 * - 그 BPM 프로세스의 배포가 둘 이상이면 **버전을 고르게 한다** (`version_ambiguous`).
 *   하나면 비워 보낸다 — Center가 배포된 버전으로 채운다 (C5).
 * - 배포가 없으면 「이 프로세스에 유효한 배포가 없습니다」 — 만들어 봐야 422 `no_deployment`다.
 */

const FIELD = "h-9 border border-border-strong bg-bg-surface px-2 text-body";

/** 입력 칸 하나 — 매니페스트의 타입대로 (C14 `VALUE_TYPES`). 모르는 타입은 글 칸이다. */
function InputField({ input }: { input: ManifestInput }) {
  const name = `input:${input.name}`;
  const preset = input.default as unknown;
  const hint = preset == null ? undefined : `기본값 ${typeof preset === "string" ? preset : JSON.stringify(preset)}`;
  return (
    <label className="flex flex-col gap-1 text-body-sm">
      <span className="text-text-muted">
        {input.name}
        {input.required ? " *" : ""} <span className="font-mono">({input.type})</span>
      </span>
      {input.type === "bool" ? (
        <select name={name} className={FIELD} defaultValue="">
          <option value="">(주지 않음)</option>
          <option value="true">참</option>
          <option value="false">거짓</option>
        </select>
      ) : input.type === "list" || input.type === "dict" ? (
        <textarea
          name={name}
          rows={3}
          placeholder={input.type === "list" ? "[...] (JSON)" : "{...} (JSON)"}
          className="rounded-md border border-border-strong bg-bg-surface p-2 font-mono text-body-sm"
        />
      ) : (
        <input
          name={name}
          type={input.type === "int" || input.type === "number" ? "number" : input.type === "date" ? "date" : "text"}
          step={input.type === "number" ? "any" : undefined}
          placeholder={hint}
          className={FIELD}
        />
      )}
      {input.description ? <span className="text-text-muted">{input.description}</span> : null}
    </label>
  );
}

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ bot?: string; version?: string; error?: string }>;
}) {
  const found = await session();
  if (!found) redirect("/login");
  if (found.mode !== "admin") redirect("/jobs");
  const asked = await searchParams;
  const bot = asked.bot ?? "";

  let deployments: DeploymentInfo[] = [];
  let failure: string | null = asked.error ?? null;
  try {
    deployments = await center.deployments({ active: true });
  } catch (cause) {
    failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
  }

  const bots = [...new Set(deployments.map((one) => one.bpm_process_id))].sort();
  const versions = bot ? serverVersions(deployments, bot) : [];
  const mustPick = versions.length > 1;
  const pickedVersion = asked.version ?? "";
  const version = mustPick && versions.includes(pickedVersion) ? pickedVersion : "";
  // 입력 칸은 이 버전의 매니페스트로 그린다 (배포가 하나면 그것).
  const shown = version || (versions.length === 1 ? (versions[0] ?? "") : "");
  const ready = Boolean(bot && shown);

  let inputs: ManifestInput[] = [];
  if (ready) {
    try {
      // 값 출처가 있는 입력은 Center가 넣는다 — 칸을 그리지 않는다 (C1 `inputs[].source`, ADR-0099).
      inputs = fromCaller((await center.packageInfo(bot, shown)).manifest?.inputs ?? []);
    } catch (cause) {
      failure = cause instanceof CenterError ? cause.message : "알 수 없는 오류가 생겼습니다";
    }
  }

  return (
    <Shell mode={found.mode} actor={found.actor} current="/jobs">
      <header className="mb-4">
        <h1 className="text-h2 font-bold">새 작업</h1>
      </header>

      {failure ? <ErrorBanner message={failure} /> : null}

      {/* 1. 고르기 — GET이라 주소에 남고 JS가 없어도 돈다. */}
      <form className="filter-card flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-body-sm">
          <span className="text-text-muted">프로세스</span>
          <select name="bot" defaultValue={bot} className={FIELD}>
            <option value="">(고르세요)</option>
            {bots.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
        </label>
        {bot ? (
          <p className="flex h-9 items-center text-body">
            {/* 상한은 판의 배포가 정한다 — 판을 아직 고르지 않았으면 말하지 않는다. */}
            서버 실행기에서 실행{shown ? ` — 동시 실행 상한 ${serverLimit(deployments, bot, shown)}` : ""}
          </p>
        ) : null}
        {mustPick ? (
          <label className="flex flex-col gap-1 text-body-sm">
            <span className="text-text-muted">버전 (배포가 둘 이상입니다)</span>
            <select name="version" defaultValue={version} className={FIELD}>
              <option value="">(고르세요)</option>
              {versions.map((one) => (
                <option key={one} value={one}>
                  {one}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button type="submit" variant="secondary">
          고르기
        </Button>
      </form>

      {bots.length === 0 && !failure ? (
        <p className="text-body text-text-secondary">
          배포된 프로세스가 없습니다. 「배포」에서 배포한 뒤 만드세요.
        </p>
      ) : null}
      {bot && versions.length === 0 ? (
        <ErrorBanner message="이 프로세스에 유효한 배포가 없습니다 — 「배포」에서 배포한 뒤 만드세요." />
      ) : null}

      {/* 2. 만들기 — 서버 액션. 입력 칸의 타입은 서버가 매니페스트를 다시 읽어 맞춘다. */}
      {ready ? (
        <form action={createJob} className="flex max-w-2xl flex-col gap-4">
          <input type="hidden" name="bot" value={bot} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="inputs_from" value={shown} />
          <p className="text-body">
            <span className="text-text-muted">버전 </span>
            {version || `(배포된 버전) ${shown}`}
          </p>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-3">
            <legend className="px-1 text-body font-medium">입력 변수</legend>
            {inputs.length === 0 ? (
              <p className="text-body-sm text-text-muted">이 프로세스는 받는 입력을 적어 두지 않았습니다.</p>
            ) : (
              inputs.map((one) => <InputField key={one.name} input={one} />)
            )}
            <label className="flex flex-col gap-1 text-body-sm">
              <span className="text-text-muted">그 밖의 입력 (한 줄에 하나, 이름 = 값)</span>
              <textarea
                name="extra"
                rows={2}
                className="rounded-md border border-border-strong bg-bg-surface p-2 font-mono text-body-sm"
              />
            </label>
          </fieldset>

          <label className="flex flex-col gap-1 text-body-sm">
            <span className="text-text-muted">만료 (비우면 없음)</span>
            <input type="datetime-local" name="expires_at" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-body-sm">
            <span className="text-text-muted">메모</span>
            <input type="text" name="note" maxLength={500} className={FIELD} />
          </label>
          <div>
            <Button type="submit" variant="primary">
              작업 만들기
            </Button>
          </div>
        </form>
      ) : null}
    </Shell>
  );
}
