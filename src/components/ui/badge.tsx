import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-sm px-2 py-1 text-xs font-semibold shadow-sm backdrop-blur-xl", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      outline: "border border-white/55 bg-white/38 text-foreground",
      gold: "bg-brand-creme/86 text-brand-tinta ring-1 ring-brand-dourado/45",
      muted: "bg-white/45 text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
