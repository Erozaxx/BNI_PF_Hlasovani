"use client";

import { useState, useRef, useCallback } from "react";

interface CreatableSelectProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  onCreateOption: (name: string) => Promise<string>; // returns new categoryId
  placeholder?: string;
  label?: string;
  error?: string;
}

export function CreatableSelect({
  options,
  value,
  onChange,
  onCreateOption,
  placeholder = "Vyberte nebo zadejte...",
  label,
  error,
}: CreatableSelectProps) {
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [creating, setCreating] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(inputValue.toLowerCase())
  );

  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === inputValue.toLowerCase()
  );

  // Build visible list: existing matches + optional "Vytvorit" entry
  const createEntry =
    inputValue.trim() && !hasExactMatch
      ? { value: "__create__", label: `Vytvorit: ${inputValue.trim()}` }
      : null;

  const visibleOptions = createEntry ? [...filtered, createEntry] : filtered;

  function openDropdown() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
    setActiveIndex(-1);
  }

  function scheduleClose() {
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }

  const selectOption = useCallback(
    async (opt: { value: string; label: string }) => {
      setOpen(false);
      if (opt.value === "__create__") {
        const name = inputValue.trim();
        setCreating(true);
        try {
          const newId = await onCreateOption(name);
          onChange(newId);
          setInputValue(name);
        } catch {
          // Keep input so user can retry
        } finally {
          setCreating(false);
        }
      } else {
        onChange(opt.value);
        setInputValue(opt.label);
      }
    },
    [inputValue, onChange, onCreateOption]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      openDropdown();
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < visibleOptions.length) {
        selectOption(visibleOptions[activeIndex]);
      }
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    onChange(""); // clear selected value while typing
    openDropdown();
    setActiveIndex(-1);
  }

  return (
    <div className="flex flex-col gap-1 relative">
      {label && (
        <label className="text-sm font-medium text-text-main">{label}</label>
      )}
      <input
        type="text"
        value={creating ? "Vytvářím..." : inputValue}
        onChange={handleInputChange}
        onFocus={openDropdown}
        onBlur={scheduleClose}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={creating}
        aria-invalid={error ? "true" : undefined}
        className={`
          h-11 px-3.5 py-2.5 rounded-lg border text-base
          bg-white text-text-main placeholder:text-text-muted
          focus:outline-none focus:border-primary focus:shadow-focus
          disabled:bg-background disabled:text-text-disabled disabled:cursor-not-allowed
          ${error ? "border-danger" : "border-border"}
        `.trim()}
      />
      {open && visibleOptions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto"
          onMouseDown={(e) => e.preventDefault()} // prevent input blur before click
        >
          {visibleOptions.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`
                px-3.5 py-2.5 cursor-pointer text-base
                ${idx === activeIndex ? "bg-primary text-white" : "text-text-main hover:bg-background"}
                ${opt.value === "__create__" ? "italic" : ""}
              `.trim()}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={() => selectOption(opt)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-sm text-danger mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
