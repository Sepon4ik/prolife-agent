import { cn } from "../utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-dark-secondary rounded-xl border border-white/5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function CardHeader({ children, action, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn("flex items-center justify-between p-5 pb-0", className)}
      {...props}
    >
      <h2 className="text-sm font-semibold text-white">{children}</h2>
      {action}
    </div>
  );
}

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}
