import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

export interface NotifyEmailProps {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
}

/** One layout for every notification: short, mobile-first, one big button. */
export default function NotifyEmail({ preheader, heading, body, ctaLabel, url }: NotifyEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preheader}</Preview>
      <Body
        style={{
          backgroundColor: "#f1f5f9",
          margin: 0,
          padding: "24px 12px",
          fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 16, padding: "28px 24px" }}>
          <Text style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#4338ca", letterSpacing: "-0.5px" }}>Seen!</Text>
          <Heading as="h1" style={{ margin: "16px 0 8px", fontSize: 24, lineHeight: "30px", color: "#0f172a" }}>
            {heading}
          </Heading>
          <Text style={{ margin: "0 0 24px", fontSize: 16, lineHeight: "24px", color: "#334155" }}>{body}</Text>
          <Section style={{ textAlign: "center" }}>
            <Button
              href={url}
              style={{
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                fontSize: 18,
                fontWeight: 700,
                borderRadius: 12,
                padding: "16px 28px",
                display: "block",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              {ctaLabel}
            </Button>
          </Section>
          <Text style={{ margin: "24px 0 0", fontSize: 12, lineHeight: "18px", color: "#64748b" }}>
            You get this email because you play Seen!. Button not working? Open {url}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
