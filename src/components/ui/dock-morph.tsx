"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckSquare, FileText, Home, ReceiptText, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DockMorphProps {
  className?: string;
  items?: DockMorphItem[];
  position?: "bottom" | "top" | "left";
}

type DockMorphItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

export default function DockMorph({ items, className, position = "bottom" }: DockMorphProps) {
  const [hovered, setHovered] = React.useState<number | null>(null);

  const defaultItems: DockMorphItem[] = [
    { icon: Home, label: "Início" },
    { icon: CheckSquare, label: "Tarefas" },
    { icon: Utensils, label: "Almoço" },
    { icon: Bell, label: "Mural" },
    { icon: FileText, label: "POPs" },
    { icon: ReceiptText, label: "Comprovantes" },
  ];

  const dockItems: DockMorphItem[] =
    items && items.length > 0
      ? items
      : defaultItems;

  const positionClasses = {
    bottom: "fixed bottom-4 left-1/2 -translate-x-1/2",
    top: "fixed top-4 left-1/2 -translate-x-1/2",
    left: "fixed left-6 top-1/2 -translate-y-1/2 flex-col",
  };

  return (
    <div className={cn("z-50 flex items-center justify-center", positionClasses[position], className)}>
      <TooltipProvider delayDuration={120}>
        <div
          className={cn(
            "relative flex items-center rounded-lg border border-brand-oliva/25 bg-brand-papel/88 p-2 shadow-calm backdrop-blur-xl",
            position === "left" ? "flex-col gap-3 px-3 py-5" : "flex-row gap-2",
          )}
        >
          {dockItems.map((item, index) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <div
                  className="relative flex items-center justify-center"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <AnimatePresence>
                    {(hovered === index || item.active) && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: item.active ? 1.1 : 1.35, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 24 }}
                        className={cn(
                          "absolute inset-0 -z-10 rounded-full",
                          item.active
                            ? "bg-brand-musgo"
                            : "bg-gradient-to-tr from-brand-dourado/35 via-brand-creme/65 to-transparent",
                          "shadow-md",
                        )}
                      />
                    )}
                  </AnimatePresence>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "relative z-10 h-11 w-11 rounded-full transition-transform duration-200 hover:scale-105",
                      item.active ? "text-brand-papel hover:bg-transparent hover:text-brand-papel" : "text-brand-musgo",
                      item.disabled && "cursor-not-allowed opacity-45 hover:scale-100",
                    )}
                    onClick={item.disabled ? undefined : item.onClick}
                    aria-label={item.label}
                    aria-current={item.active ? "page" : undefined}
                    disabled={item.disabled}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent side={position === "left" ? "right" : "top"} className="text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
