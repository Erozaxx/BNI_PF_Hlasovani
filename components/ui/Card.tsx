type CardVariant = "default" | "interactive" | "highlighted" | "dimmed";

interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface border border-border shadow-card",
  interactive:
    "bg-surface border border-border shadow-card hover:shadow-lg hover:-translate-y-px transition-all cursor-pointer",
  highlighted:
    "bg-surface border border-border shadow-card border-l-4 border-l-primary",
  dimmed: "bg-surface border border-border shadow-card opacity-60",
};

function Card({ variant = "default", children, className = "" }: CardProps) {
  return (
    <div
      className={`
        rounded-card p-6
        ${variantStyles[variant]}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export { Card, type CardProps, type CardVariant };
