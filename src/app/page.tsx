import { clientConfig } from "@/lib/client-config";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-primary md:text-5xl lg:text-6xl">
          {clientConfig.name}
        </h1>
        <p className="mt-6 text-lg text-muted-foreground md:text-xl">
          {clientConfig.tagline}
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg">Get Started</Button>
          <Button variant="outline" size="lg" className="border-accent text-accent-foreground">
            Learn More
          </Button>
        </div>

        {/* Token system visual QA */}
        <div className="mt-16 grid grid-cols-3 gap-4 md:grid-cols-6">
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-primary" />
            <span className="text-xs text-muted-foreground">Primary</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-secondary" />
            <span className="text-xs text-muted-foreground">Secondary</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-accent" />
            <span className="text-xs text-muted-foreground">Accent</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-muted" />
            <span className="text-xs text-muted-foreground">Muted</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-background border border-border" />
            <span className="text-xs text-muted-foreground">Background</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-lg bg-foreground" />
            <span className="text-xs text-muted-foreground">Foreground</span>
          </div>
        </div>
      </div>
    </div>
  );
}
