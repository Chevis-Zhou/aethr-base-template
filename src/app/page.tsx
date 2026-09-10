import type { Metadata } from "next";
import { HeroSection } from "@/components/sections/hero";
import { FeatureListSection } from "@/components/sections/feature-list";
import { AboutSection } from "@/components/sections/about";
import { ServicesSection } from "@/components/sections/services";
import { StatsSection } from "@/components/sections/stats";
import { CredentialsSection } from "@/components/sections/credentials";
import { TestimonialsSection } from "@/components/sections/testimonials";
import { PricingSection } from "@/components/sections/pricing";
import { FAQSection } from "@/components/sections/faq";
import { CTABandSection } from "@/components/sections/cta-band";
import { ContactSection } from "@/components/sections/contact";

const features1 = [
  {
    title: "Every program tailored to the student",
    description: "Sessions are planned around the student's own course, pace and goals rather than a fixed curriculum.",
  },
  {
    title: "Custom worksheets & practice exams",
    description: "Practice material is written for the unit the student is actually working through.",
  },
  {
    title: "Virtual, or in a Tampa learning space",
    description: "Sessions happen online from anywhere, or in person at a learning space in Tampa.",
  },
  {
    title: "Study & time management skills",
    description: "Alongside the subject itself, sessions cover how to plan the work and keep it on schedule.",
  },
  {
    title: "Summer refreshers & final exam prep",
    description: "Summer sessions keep material from going cold. Exam weeks get their own focused preparation.",
  },
  {
    title: "SAT, ACT & Desmos support",
    description: "Test preparation covers the SAT and the ACT, along with the Desmos work those tests involve.",
  },
];

const services3 = [
  {
    title: "Algebra 1 & 2",
    description: "Equations, functions and the groundwork that every later math course leans on.",
  },
  {
    title: "Precalculus",
    description: "The bridge into calculus, taken at the pace the student needs to keep up with class.",
  },
  {
    title: "Calculus 1 & 2",
    description: "Limits, derivatives and integrals, worked through problem by problem.",
  },
  {
    title: "Geometry",
    description: "Proofs and figures, with practice built around the student's current unit.",
  },
  {
    title: "Statistics",
    description: "Distributions, inference and the reasoning behind each test.",
  },
  {
    title: "SAT/ACT/Desmos",
    description: "Timed practice, section strategy and the Desmos work the tests involve.",
  },
  {
    title: "Chemistry",
    description: "Stoichiometry, bonding and reactions, grounded in the coursework the student is assigned.",
  },
  {
    title: "Biology",
    description: "Systems and terminology, organized so that memorization has structure behind it.",
  },
  {
    title: "Physics",
    description: "Mechanics and problem setup, with the math kept alongside the concepts.",
  },
  {
    title: "Latin 1 & 2",
    description: "Grammar, vocabulary and translation practice at the student's level.",
  },
  {
    title: "Creative & Technical Writing",
    description: "Drafting, structure and revision, for personal essays and technical work alike.",
  },
  {
    title: "World & US History",
    description: "Cause and consequence rather than date lists, with essay practice built around the assigned coursework.",
  },
];

const stats4 = [
  {
    value: "12",
    label: "Topics",
  },
  {
    value: "10+",
    label: "Weekly students",
  },
  {
    value: "2022",
    label: "Tutoring since",
  },
  {
    value: "1:1",
    label: "Every session",
  },
];

const credentials5 = [
  {
    name: "Autodesk CAD certification",
  },
  {
    name: "Cum Laude Society induction",
  },
  {
    name: "Anne Frank Humanitarian Award",
  },
  {
    name: "Reddy Lab, Engineering/Research Assistant, USF Morsani College of Medicine",
  },
  {
    name: "Best Overall Research — HC STEM Fair",
  },
  {
    name: "HOBY Youth Leadership Ambassador",
  },
  {
    name: "Nonprofit tutoring affiliation (Prep & Me)",
  },
];

const testimonials6 = [
  {
    quote: "Max is an exceptional tutor… one of the best!",
    author: "Lakshmi Jayaram, Ph.D.",
    role: "Executive Director, Prep & Me",
  },
  {
    quote: "He knows all the math and helped me figure out things I was otherwise guessing at…",
    author: "Eva T.",
    role: "SAT / ACT Prep",
  },
  {
    quote: "Since starting with Max I haven’t gotten less than a 90% on any assignment…",
    author: "Ker’Varis M.",
    role: "Geometry",
  },
];

const tiers7 = [
  {
    name: "30 minutes",
    price: "$25",
    cadence: "per session",
  },
  {
    name: "60 minutes",
    price: "$40",
    cadence: "per session",
  },
  {
    name: "90 minutes",
    price: "$60",
    cadence: "per session",
  },
];

const items8 = [
  {
    question: "Are sessions virtual or in person?",
    answer: "Both. Max tutors online, or in person at a learning space in Tampa, FL.",
  },
  {
    question: "How long is a session, and what does it cost?",
    answer: "Sessions are booked by length, and the rate follows the length. The available lengths and their rates are listed under Rates.",
  },
  {
    question: "Does Max prepare students for the SAT and ACT?",
    answer: "Yes. Test preparation is part of the practice, alongside Desmos support.",
  },
  {
    question: "How does a family get started?",
    answer: "A note through the contact form is enough. Naming the subject and the goal makes the first reply more useful.",
  },
];

export const metadata: Metadata = {
  title: "Maxematics | One-on-One Tutoring in Tampa, FL",
  description: "Max Schwarzkopf tutors math, science, language and test prep in Tampa and over video. Every program is written for one student.",
};

export default function Page() {
  return (
    <>
      <div id="hero">
  <HeroSection
        eyebrow="One-On-One Tutoring"
        headline="Tutoring That Starts With The Student"
        subheadline="One-on-one sessions in math, science, language and test prep — online, or in person in Tampa."
        ctaText="Send An Inquiry"
        ctaHref="#contact"
      />
      </div>
      <div id="feature-list">
  <FeatureListSection eyebrow="What To Expect" heading="How Maxematics Works" features={features1} />
      </div>
      <div id="about">
  <AboutSection
        eyebrow="About Max"
        heading="The Tutor Behind The Practice"
        story={"Max Schwarzkopf has been tutoring since 2022, and Maxematics is the practice he built around it. He is a STEM student and a researcher, working as an engineering and research assistant in the Reddy Lab at the USF Morsani College of Medicine.\n\nEvery session is one-on-one, and it is built for the student sitting in it. The plan for a student catching up in geometry and the plan for a student chasing a test score do not look alike, and they are not meant to."}
        founderName="Max Schwarzkopf"
        founderRole="Founder & tutor; STEM student and researcher"
        pullQuote="If you think of something as ‘hard,’ it will be. But it doesn’t have to be that way."
      />
      </div>
      <div id="services">
  <ServicesSection
        eyebrow="Topics"
        heading="What Max Tutors"
        subheading="Sessions run across math, science, language and test prep. A student can move between subjects without changing tutors."
        services={services3}
      />
      </div>
      <div id="stats">
  <StatsSection eyebrow="By The Numbers" heading="The Practice So Far" stats={stats4} />
      </div>
      <div id="credentials">
  <CredentialsSection eyebrow="Credentials" heading="Awards, Certifications And Affiliations" credentials={credentials5} />
      </div>
      <div id="testimonials">
  <TestimonialsSection eyebrow="In Their Words" heading="What People Say About Working With Max" testimonials={testimonials6} />
      </div>
      <div id="pricing">
  <PricingSection
        eyebrow="Rates"
        heading="What A Session Costs"
        subheading="Sessions are booked by length, and the rate is the same whatever the topic."
        note="Zelle, check, or cash accepted."
        tiers={tiers7}
      />
      </div>
      <div id="faq">
  <FAQSection eyebrow="Good To Know" heading="Common Questions" items={items8} />
      </div>
      <div id="cta-band">
  <CTABandSection
        eyebrow="Next Step"
        heading="Tell Max About The Student"
        subheading="A short note about the subject, the goal and the schedule is enough to begin."
        ctaText="Send An Inquiry"
        ctaHref="#contact"
        variant="accent"
      />
      </div>
      <div id="contact">
  <ContactSection
        eyebrow="Contact"
        heading="Send A Note"
        subheading="Tell Max what the student is working on and what the goal is. A little detail makes the first reply more useful."
        email="maxematics@icloud.com"
        phone="813.444.6199"
        address="Tampa, FL — virtual or in person"
        showForm={true}
      />
      </div>
    </>
  );
}
