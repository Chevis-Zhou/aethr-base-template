import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "../ui/accordion";
import { RichText } from "../ui/rich-text";
import { mark, markItem, markList, within, type EditProps } from "../../lib/edit/markers";

export interface FAQProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  items: { question: string; answer: string }[];
}

export function FAQSection({ eyebrow, heading, subheading, items, edit }: FAQProps & EditProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
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

        <Accordion className="mt-12" {...markList(edit, "items")}>
          {items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} {...markItem(edit, i)}>
              <AccordionTrigger
                className="font-heading text-base"
                {...mark(within(edit, `items[${i}]`), "question")}
              >
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                <RichText
                  value={item.answer}
                  {...mark(within(edit, `items[${i}]`), "answer", "richtext")}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
