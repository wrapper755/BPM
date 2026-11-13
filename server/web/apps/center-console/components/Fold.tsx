"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/**
 * CON-00 레일 맨 아래 — **펼침 패널을 접는다** (ADR-0145 §1). 접으면 본문이 224 넓어진다.
 *
 * 접힘은 `<html data-panel>` 하나이고 **자리는 CSS가 잡는다**(`styles.css`) — 레일·패널·위 막대·
 * 본문 넷이 같은 값을 보아야 해서, 넷에 각각 상태를 내려보내는 대신 변수 하나를 바꾼다.
 *
 * **지금 보이는 것을 재서 뒤집는다** — 좁은 화면에서는 CSS가 **기본으로 접어** 두므로(결재함은
 * 휴대폰에서도 답할 수 있어야 한다, CON-00) 제 상태만 들고 있으면 첫 번째 누름이 아무 일도 하지
 * 않는 것처럼 보인다.
 *
 * **기억하지 않는다** — 보는 자리를 넓히는 일이라 새로 열면 그 화면 폭의 기본값이다.
 */
export function Fold() {
  const [shown, setShown] = useState(true);

  // 패널의 **실제 폭**을 따라간다 — 창 크기가 바뀌면 CSS가 먼저 접고 펴기 때문이다.
  useEffect(() => {
    const panel = document.querySelector(".console-panel");
    if (!panel) return;
    const look = () => setShown(panel.getBoundingClientRect().width > 0);
    look();
    const watch = new ResizeObserver(look);
    watch.observe(panel);
    return () => watch.disconnect();
  }, []);

  const label = shown ? "메뉴 접기" : "메뉴 펼치기";
  const Glyph = shown ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      onClick={() => {
        document.documentElement.dataset.panel = shown ? "folded" : "open";
      }}
      title={label}
      aria-label={label}
      aria-expanded={shown}
      className="mt-auto flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
    >
      <Glyph size={20} aria-hidden />
    </button>
  );
}
