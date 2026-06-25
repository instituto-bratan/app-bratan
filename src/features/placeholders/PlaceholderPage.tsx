import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  status: string;
};

export function PlaceholderPage({ eyebrow, title, status }: PlaceholderPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Button asChild variant="ghost" className="mb-5 pl-0">
        <Link to="/">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          Início
        </Link>
      </Button>

      <Card className="border-brand-oliva/20 bg-white/65">
        <CardHeader>
          <Badge variant={eyebrow === "Fase 1" ? "gold" : "muted"} className="w-fit">
            {eyebrow}
          </Badge>
          <CardTitle className="text-3xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-brand-oliva/45 bg-brand-papel p-6">
            <p className="text-sm font-semibold text-brand-musgo">{status}</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Esta área está reservada para o próximo passo da construção aprovada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
