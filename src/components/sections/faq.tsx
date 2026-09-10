import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../ui/accordion";
import { RichText } from "../ui/rich-text";

export interface FAQProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  items: { question: string; answer: string }[];
}

export function FAQSection({ eyebrow, heading, subheading, items }: FAQProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          {eyebrow && (
            <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
          )}
          {heading && (
            <h2 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {heading}
            </h2>
          )}
          {subheading && <p className="mt-4 text-lg text-muted-foreground">{subheading}</p>}
        </div>

        <Accordion className="mt-12">
          {items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="font-heading text-base">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <RichText value={item.answer} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
