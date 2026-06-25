import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MoveRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

type HeroAction = {
  label: string;
  onClick?: () => void;
};

type HeroProps = {
  eyebrow?: string;
  titleLead?: string;
  rotatingWords?: string[];
  description?: string;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
};

function Hero({
  eyebrow = "APP BRATAN",
  titleLead = "Operação interna",
  rotatingWords,
  description = "Rotina, cobertura e comunicação em uma experiência interna confiável, nobre e ética.",
  primaryAction,
  secondaryAction,
}: HeroProps) {
  const [titleNumber, setTitleNumber] = useState(0);
  const titles = useMemo(
    () => rotatingWords ?? ["confiável", "serena", "precisa", "premium", "ética"],
    [rotatingWords],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTitleNumber((current) => (current === titles.length - 1 ? 0 : current + 1));
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [titleNumber, titles]);

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-center gap-7 py-2">
        <div>
          <Button variant="secondary" size="sm" className="gap-3">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {eyebrow}
          </Button>
        </div>

        <div className="flex max-w-4xl flex-col gap-5">
          <h1 className="text-5xl leading-[1.03] text-brand-tinta sm:text-6xl lg:text-7xl">
            <span>{titleLead}</span>
            <span className="relative flex min-h-[1.05em] w-full overflow-hidden pb-1 pt-1 text-brand-musgo">
              {titles.map((title, index) => (
                <motion.span
                  key={title}
                  className="absolute font-semibold"
                  initial={{ opacity: 0, y: "-100%" }}
                  transition={{ type: "spring", stiffness: 50 }}
                  animate={
                    titleNumber === index
                      ? {
                          y: 0,
                          opacity: 1,
                        }
                      : {
                          y: titleNumber > index ? "-150%" : "150%",
                          opacity: 0,
                        }
                  }
                >
                  {title}
                </motion.span>
              ))}
            </span>
          </h1>

          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {primaryAction ? (
            <LiquidButton type="button" size="xl" onClick={primaryAction.onClick}>
              {primaryAction.label}
              <MoveRight className="h-4 w-4" aria-hidden="true" />
            </LiquidButton>
          ) : null}
          {secondaryAction ? (
            <Button type="button" size="lg" variant="outline" className="gap-3" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
              <MoveRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { Hero };
