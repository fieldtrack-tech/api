import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Layout
          "flex h-9 w-full rounded-lg",
          // Surface & border
          "border border-input bg-background",
          // Spacing & typography
          "px-3 py-2 text-sm text-foreground",
          // Placeholder
          "placeholder:text-muted-foreground",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          // Focus — brand ring, no offset (cleaner)
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          "focus-visible:border-primary/60",
          // Transition
          "transition-colors duration-150",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
