import { Button, type ButtonProps } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type GetStartedButtonProps = Omit<ButtonProps, "asChild"> & {
  label?: string;
};

export function GetStartedButton({ className, label = "Começar", children, ...props }: GetStartedButtonProps) {
  return (
    <Button className={cn("group relative overflow-hidden", className)} size="lg" {...props}>
      <span className="mr-8 transition-opacity duration-500 group-hover:opacity-0">
        {children ?? label}
      </span>
      <i className="absolute bottom-1 right-1 top-1 z-10 grid w-1/4 place-items-center rounded-sm bg-primary-foreground/15 text-primary-foreground transition-all duration-500 group-hover:w-[calc(100%-0.5rem)] group-active:scale-95">
        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
      </i>
    </Button>
  );
}
