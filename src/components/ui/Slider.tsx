import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueChange: (val: number) => void;
  ariaLabel: string;
  ariaValueText: string;
  formatTooltip?: (val: number) => string;
  disabled?: boolean;
}

export function Slider({
  value,
  min,
  max,
  step,
  onValueChange,
  ariaLabel,
  ariaValueText,
  formatTooltip,
  disabled = false,
}: SliderProps) {
  const [dragging, setDragging] = React.useState(false);

  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(vals) => {
        if (typeof vals[0] === 'number') onValueChange(vals[0]);
      }}
      onPointerDown={() => setDragging(true)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onBlur={() => setDragging(false)}
      aria-label={ariaLabel}
      className="relative flex items-center select-none touch-none w-full min-h-[44px] cursor-pointer disabled:opacity-50"
    >
      <SliderPrimitive.Track className="relative grow h-1 rounded-[var(--r-full)] bg-[var(--border)]">
        <SliderPrimitive.Range className="absolute h-full rounded-[var(--r-full)] bg-[var(--accent)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-valuetext={ariaValueText}
        className="relative block w-5 h-5 rounded-[var(--r-full)] bg-[var(--surface)] border-2 border-[var(--accent)] shadow-[var(--shadow-1)] transition-transform duration-[var(--dur-fast)] hover:scale-110 focus-visible:outline-[3px] focus-visible:outline-[var(--focus)]"
      >
        {/* Invisible 44px hit area around 20px visual thumb */}
        <span className="absolute -inset-3" aria-hidden="true" />
        {dragging && (
          <span
            role="presentation"
            className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--text)] text-[var(--bg)] text-[12px] font-medium tabular-nums whitespace-nowrap shadow-[var(--shadow-2)] pointer-events-none"
          >
            {formatTooltip ? formatTooltip(value) : String(value)}
          </span>
        )}
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );
}
