import { Card, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { resolveIcon } from "./icon-map";
import { mark, markItem, markList, within, type EditProps } from "../../lib/edit/markers";

export interface ServicesProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  services: { title: string; description: string; icon?: string }[];
}

export function ServicesSection({
  eyebrow,
  heading,
  subheading,
  services,
  edit,
}: ServicesProps & EditProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <p
              className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase"
              {...mark(edit, "eyebrow")}
            >
              {eyebrow}
            </p>
          )}
          {heading && (
            <h2
              className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              {...mark(edit, "heading")}
            >
              {heading}
            </h2>
          )}
          {subheading && (
            <p className="mt-4 text-lg text-muted-foreground" {...mark(edit, "subheading", "textarea")}>
              {subheading}
            </p>
          )}
        </div>

        <div
          className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
          {...markList(edit, "services")}
        >
          {services.map((service, index) => {
            const Icon = resolveIcon(service.icon);
            const item = within(edit, `services[${index}]`);
            return (
              <Card
                key={service.title}
                className="transition-shadow hover:shadow-lg"
                {...markItem(edit, index)}
              >
                <CardHeader>
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    {...mark(item, "icon", "icon")}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="mt-4 text-lg" {...mark(item, "title")}>
                    {service.title}
                  </CardTitle>
                  {service.description && (
                    <CardDescription {...mark(item, "description", "textarea")}>
                      {service.description}
                    </CardDescription>
                  )}
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
