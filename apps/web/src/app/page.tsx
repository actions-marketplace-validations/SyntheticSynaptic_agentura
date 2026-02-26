export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)"
      }}
    >
      <section style={{ maxWidth: 720, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Agentura
        </p>
        <h1 style={{ margin: "0.75rem 0", fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
          AI agent eval CI/CD for regression-safe shipping.
        </h1>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>
          Monorepo scaffold is live. Milestone 1 starts here.
        </p>
      </section>
    </main>
  );
}
