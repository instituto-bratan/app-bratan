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
    bottom: "fixed bottom-[calc(0.8rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2",
    top: "fixed top-[calc(0.8rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2",
    left: "fixed left-4 top-1/2 -translate-y-1/2 flex-col",
  };

  return (
    <div className={cn("z-50 flex max-w-[calc(100vw-1rem)] items-center justify-center", positionClasses[position], className)}>
      <TooltipProvider delayDuration={120}>
        <div
          className={cn(
            "ios-glass mobile-scrollbar-none relative flex max-w-[calc(100vw-1rem)] items-center overflow-x-auto rounded-[28px] border p-2 shadow-ios-dock",
            position === "left" ? "flex-col gap-3 px-3 py-5" : "flex-row gap-1.5 sm:gap-2",
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
                        animate={{
                          scale: item.active ? 1.08 : 1.28,
                          opacity: 1,
                          rotate: hovered === index && !item.active ? 4 : 0,
                        }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 24 }}
                        className={cn(
                          "absolute inset-0 -z-10 rounded-full blur-[0.2px]",
                          item.active
                            ? "bg-gradient-to-br from-brand-musgo via-brand-oliva to-brand-musgo"
                            : "bg-gradient-to-tr from-brand-dourado/34 via-white/72 to-brand-creme/36",
                          "shadow-md ring-1 ring-white/55",
                        )}
                      />
                    )}
                  </AnimatePresence>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "ios-pressable relative z-10 h-12 w-12 shrink-0 rounded-full transition-transform duration-200 hover:scale-105 sm:h-11 sm:w-11",
                      item.active ? "text-brand-papel hover:bg-transparent hover:text-brand-papel" : "text-brand-musgo hover:bg-white/54",
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
