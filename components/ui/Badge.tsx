type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "category";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-success-light text-success border-success",
  warning: "bg-warning-light text-warning border-warning",
  danger: "bg-danger-light text-danger border-danger",
  info: "bg-info-light text-info border-info",
  neutral: "bg-background text-text-muted border-border",
  category: "bg-navy-light text-navy border-navy",
};

function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full
        text-xs font-medium border
        ${variantStyles[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </span>
  );
}

export { Badge, type BadgeProps, type BadgeVariant };
