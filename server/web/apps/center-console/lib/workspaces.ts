/**
 * CON-20 작업공간이 쓰는 셈 — **화면을 모르는 것만** 여기 둔다 (`pnpm test`가 잰다).
 *
 * 탐색기가 고른 파일이 가운데에 무엇을 띄울지 정한다 ([ADR-0147](../../../../docs/decisions/0147-workspace-has-three-tabs.md)).
 * 그 판단이 페이지 안에 있으면 시험이 부르지 못해, 「`.dmn`을 눌렀는데 아무 일도 없다」가 화면에서만 드러난다.
 */

import type { FileInfo } from "@bpm/api-types/c17-file-info";

/** 파일 한 갈래. `settings`는 뿌리의 `process.json`(작업 폴더 기록)이다. */
export type FileKind = "process" | "decision" | "cases" | "lib" | "memory" | "settings" | "other";

/** 가운데에 띄울 것. `null`이면 띄울 것이 없다(탐색기에서 고를 수 없다). */
export type Opens = "canvas" | "table" | "cases" | "viewer" | null;

export function fileKind(path: string): FileKind {
  if (path === "process.json") return "settings";
  if (path.startsWith("libs/")) return "lib";
  if (path.startsWith("memory/")) return "memory";
  if (path.startsWith("cases/")) return "cases";
  if (path.startsWith("process/")) {
    if (path.endsWith(".bpmn")) return "process";
    if (path.endsWith(".dmn")) return "decision";
  }
  return "other";
}

/**
 * 고칠 수 있는가 — **`libs/`는 아니다.** 받아 둔 공유 BPM 프로세스라 설치가 넣는 것이고,
 * C17의 파일 쓰기가 그 자리를 거부한다 (경로 규칙). 화면이 먼저 알고 있어야 「저장」이 422로
 * 끝나지 않는다.
 */
export function isEditable(path: string): boolean {
  const kind = fileKind(path);
  return kind === "process" || kind === "decision" || kind === "cases";
}

/** 그 파일을 고르면 가운데에 무엇이 뜨는가 (ADR-0147 §2). */
export function opensWith(path: string): Opens {
  switch (fileKind(path)) {
    case "process":
      return "canvas";
    case "decision":
      return "table";
    case "cases":
      return "cases";
    case "lib":
      // 받아 둔 것은 **정말 못 고치는 뷰어**로 연다 (ADR-0051). `.bpmn`·`.dmn`만.
      return path.endsWith(".bpmn") || path.endsWith(".dmn") ? "viewer" : null;
    default:
      return null;
  }
}

/** 줄에 보일 이름 — 경로의 마지막 조각. id는 말풍선이 말한다 (U2). */
export function fileLabel(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export interface FileGroup {
  /** 탐색기의 묶음 이름 — 화면 글이다. */
  label: string;
  files: FileInfo[];
}

/** 묶음의 차례 — 설계하며 자주 여는 것부터. `process.json`은 탐색기에 두지 않는다(「정보」 탭이다). */
const GROUPS: Array<{ label: string; kinds: FileKind[] }> = [
  { label: "정의", kinds: ["process"] },
  { label: "결정표", kinds: ["decision"] },
  { label: "시험 케이스", kinds: ["cases"] },
  { label: "받아 둔 공유 프로세스", kinds: ["lib"] },
];

/**
 * 탐색기가 그리는 묶음들 — **빈 묶음도 남긴다.** 「결정표」 줄이 아예 없으면 결정표를 둘 수 있다는
 * 것조차 보이지 않는다 (U12 — 빈 상태가 다음에 할 일을 말한다).
 */
export function groupFiles(files: FileInfo[]): FileGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    files: files
      .filter((one) => group.kinds.includes(fileKind(one.path)))
      .sort((a, b) => a.path.localeCompare(b.path)),
  }));
}

/**
 * 처음 열 파일 — 진입 정의, 없으면 첫 정의, 그것도 없으면 아무것도 열지 않는다.
 * 빈 작업공간에서 화면이 멋대로 `libs/`의 남의 그림을 띄우지 않게 **정의에서만** 고른다.
 */
export function firstOpen(files: FileInfo[], entry: string | null | undefined): string | null {
  if (entry && files.some((one) => one.path === entry)) return entry;
  const found = files
    .filter((one) => fileKind(one.path) === "process")
    .sort((a, b) => a.path.localeCompare(b.path))[0];
  return found?.path ?? null;
}
