import { createFileRoute } from "@tanstack/react-router";
import { Clock, Mail, MapPin, Phone, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader, SectionHeading } from "@/components/common/PageHeader";
import { PublicLayout } from "@/components/site/PublicLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { setCmsState, uid, useCms } from "@/lib/cms/store";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — Civil Craft: Bridge Edition" },
      {
        name: "description",
        content:
          "Contact the Civil Craft: Bridge Edition team with questions, feedback or technical issues.",
      },
      { property: "og:title", content: "Contact the Civil Craft team" },
      {
        property: "og:description",
        content: "Questions, feedback and technical support for Civil Craft.",
      },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  subject: z.string().trim().min(3, "Please enter a subject").max(150),
  inquiryType: z.string().min(1, "Choose an inquiry type"),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(1000),
});

const inquiryTypes = [
  "General",
  "Technical Support",
  "Bug Report",
  "Feedback",
  "Partnership",
  "Educational",
];

import { isRealText } from "@/lib/cms/content-types";

function ContactPage() {
  const settings = useCms((s) => s.settings);
  const socials = (["facebook", "youtube", "discord"] as const).filter(
    (k) => isRealText(settings.social[k]) && /^https?:\/\//.test(settings.social[k]),
  );
  const faq = useCms((s) =>
    s.faq
      .filter((f) => f.published)
      .sort((a, b) => a.order - b.order)
      .slice(0, 6),
  );
  const [values, setValues] = useState({
    name: "",
    email: "",
    subject: "",
    inquiryType: "General",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setCmsState((prev) => ({
      ...prev,
      messages: [
        {
          id: uid(),
          ...parsed.data,
          createdAt: new Date().toISOString(),
          status: "New" as const,
        },
        ...prev.messages,
      ],
    }));
    setValues({ name: "", email: "", subject: "", inquiryType: "General", message: "" });
    toast.success("Message sent", { description: "The team will get back to you soon." });
  };

  const cards = [
    { icon: MapPin, title: "Address", value: settings.address },
    { icon: Mail, title: "Email", value: settings.supportEmail },
    { icon: Phone, title: "Phone", value: settings.phone },
    { icon: Clock, title: "Office Hours", value: settings.officeHours },
  ].filter((c) => isRealText(c.value));

  return (
    <PublicLayout>
      <PageHeader
        eyebrow="Contact"
        title="Contact Us"
        description="Contact the Civil Craft team with questions, feedback or technical issues. To report a bug, choose Bug Report below."
      />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.title} className="panel p-5">
              <c.icon className="h-5 w-5 text-gold" aria-hidden="true" />
              <h2 className="mt-3 font-display text-lg">{c.title}</h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">{c.value}</p>
            </li>
          ))}
        </ul>

        <div
          className={`mt-10 grid gap-6 ${socials.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]" : "mx-auto max-w-3xl"}`}
        >
          <form onSubmit={submit} noValidate className="panel space-y-4 p-6">
            <SectionHeading title="Send us a message" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={values.name}
                  maxLength={100}
                  onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                />
                {errors["name"] ? (
                  <p className="text-xs text-destructive">{errors["name"]}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={values.email}
                  maxLength={255}
                  onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                />
                {errors["email"] ? (
                  <p className="text-xs text-destructive">{errors["email"]}</p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={values.subject}
                  maxLength={150}
                  onChange={(e) => setValues((v) => ({ ...v, subject: e.target.value }))}
                />
                {errors["subject"] ? (
                  <p className="text-xs text-destructive">{errors["subject"]}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inquiryType">Inquiry type</Label>
                <Select
                  value={values.inquiryType}
                  onValueChange={(val) => setValues((v) => ({ ...v, inquiryType: val }))}
                >
                  <SelectTrigger id="inquiryType">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {inquiryTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                rows={6}
                maxLength={1000}
                value={values.message}
                onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
              />
              {errors["message"] ? (
                <p className="text-xs text-destructive">{errors["message"]}</p>
              ) : null}
            </div>
            <Button type="submit" variant="gold" size="lg">
              Send Message
            </Button>
          </form>

          {socials.length ? (
            <aside className="panel self-start p-6">
              <Share2 className="h-5 w-5 text-gold" aria-hidden="true" />
              <h2 className="mt-3 font-display text-lg">Social Media</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {socials.map((k) => (
                  <li key={k}>
                    <a
                      href={settings.social[k]}
                      className="capitalize text-gold hover:underline"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {k}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>

      {faq.length ? (
        <section className="border-t border-border bg-card/60">
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
            <SectionHeading title="Frequently Asked Questions" />
            <Accordion type="single" collapsible className="panel px-4">
              {faq.map((f) => (
                <AccordionItem key={f.id} value={f.id}>
                  <AccordionTrigger>{f.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      ) : null}
    </PublicLayout>
  );
}
