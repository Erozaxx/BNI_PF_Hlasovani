import { type TextareaHTMLAttributes, forwardRef } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const textareaId = id || props.name;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-text-main"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            min-h-[80px] px-3.5 py-2.5 rounded-lg border text-base resize-vertical
            bg-white text-text-main placeholder:text-text-muted
            focus:outline-none focus:border-primary focus:shadow-focus
            disabled:bg-background disabled:text-text-disabled disabled:cursor-not-allowed
            ${error ? "border-danger" : "border-border"}
            ${className}
          `.trim()}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error && textareaId ? `${textareaId}-error` : undefined}
          {...props}
        />
        {error && (
          <p
            id={textareaId ? `${textareaId}-error` : undefined}
            className="text-sm text-danger mt-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
export { Textarea, type TextareaProps };
