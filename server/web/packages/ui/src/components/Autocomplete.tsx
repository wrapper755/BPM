"use client";

import { useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cn } from "../cn";

/**
 * 자동 완성 칸 (스타일 가이드 §3, [ADR-0165](../../../../../../docs/decisions/0165-lists-filter-as-you-go-and-page.md)).
 *
 * 치는 동안 **글자가 든 후보**가 아래에 펴지고 `↑`·`↓`·`Enter`로 고른다(`Esc`면 닫힌다). 모르는 값도 칠 수 있다.
 * 고르면 칸을 채우고 **그 폼을 낸다**(`requestSubmit`) — 거르기 칸(`AutoFilter`)이면 곧바로 목록이 바뀐다.
 * 이름(`name`)으로 폼에 실리는 평범한 `<input>`이라 JS가 없어도 GET 폼으로 돈다.
 */
export interface AutocompleteProps {
  name: string;
  options: string[];
  defaultValue?: string;
  placeholder?: string;
  /** 보조기기가 읽을 이름 — 라벨이 바깥에 있으면 그 글자. */
  label?: string;
  className?: string;
}

const MAX = 8;

export function Autocomplete({ name, options, defaultValue = "", placeholder, label, className }: AutocompleteProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const wanted = value.trim().toLowerCase();
  const shown = options
    .filter((one) => one.toLowerCase().includes(wanted) && one !== value)
    .slice(0, MAX);

  const pick = (one: string) => {
    flushSync(() => {
      setValue(one);
      setOpen(false);
    });
    input.current?.form?.requestSubmit();
  };

  return (
    <span className={cn("relative block", className)}>
      <input
        ref={input}
        type="text"
        name={name}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[at] ? `${id}-${at}` : undefined}
        autoComplete="off"
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
          setAt(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setAt((now) => Math.min(now + 1, shown.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setAt((now) => Math.max(now - 1, 0));
          } else if (event.key === "Enter" && open && shown[at]) {
            event.preventDefault();
            pick(shown[at]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-md border border-border-strong bg-bg-surface px-3 text-body text-text-primary"
        style={{ height: "var(--size-control-md)" }}
      />
      {open && shown.length > 0 ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute top-full right-0 left-0 z-40 m-0 mt-1 max-h-64 list-none overflow-y-auto rounded-lg border border-border-default bg-bg-surface p-1 shadow-md"
        >
          {shown.map((one, index) => (
            <li
              key={one}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === at}
              // 칸이 포커스를 잃기 전에 고른다 (`onBlur`가 목록을 닫는다).
              onMouseDown={(event) => {
                event.preventDefault();
                pick(one);
              }}
              onMouseEnter={() => setAt(index)}
              className={cn(
                "cursor-pointer rounded-md px-3 py-2 text-body-sm",
                index === at ? "bg-bg-subtle text-text-primary" : "text-text-secondary",
              )}
            >
              {one}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
