import { redirect } from "next/navigation";

/**
 * 첫 화면 — **대시보드다** ([ADR-0151](../../../../docs/decisions/0151-console-follows-the-lifecycle.md) §3).
 *
 * **역할로 가르지 않는다.** 전에는 쓰기 권한이면 작업공간 홈, 보기 전용이면 운영 현황으로
 * 보냈는데(ADR-0145 §2) 어느 쪽이든 **한 화면의 한 가지**만 보였다 — 실패한 실행·막힌 결재·승인
 * 기다리는 후보가 서로 다른 화면에 있어 사람이 셋을 돌아다녔다. 대시보드가 그 셋을 한자리에
 * 보이고, 거기서 제 일로 간다.
 */
export default function Home() {
  redirect("/dashboard");
}
