"use client";

import React, { useRef } from "react";

type NumberFieldProps = {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
  variant?: "lux" | "plain";
  className?: string;
  inputClassName?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  name?: string;
  id?: string;
  autoFocus?: boolean;
};

export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  (
    {
      value,
      onChange,
      step = 1,
      min,
      max,
      placeholder,
      disabled,
      suffix,
      variant = "lux",
      className,
      inputClassName,
      inputMode = "decimal",
      name,
      id,
      autoFocus,
    },
    forwardedRef
  ) => {
    const internalRef = useRef<HTMLInputElement | null>(null);

    const setRef = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    };

    const rightPad = suffix ? "pr-16" : "pr-3";
    const baseInput =
      variant === "lux"
        ? `lux-input ${rightPad}`
        : `w-full bg-transparent outline-none ${rightPad}`;

    return (
      <div className={`relative ${className || ""}`}>
        <input
          ref={setRef}
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          name={name}
          id={id}
          autoFocus={autoFocus}
          className={`${baseInput} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassName || ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--muted)] font-bold">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);

NumberField.displayName = "NumberField";
