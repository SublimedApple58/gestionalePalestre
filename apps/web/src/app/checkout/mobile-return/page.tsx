"use client";

import { useEffect, useState } from "react";

/**
 * Pagina "bounce" per il ritorno dal checkout Revolut nel flusso MOBILE.
 *
 * Revolut Hosted Checkout accetta solo `redirect_url` http/https (NON i custom
 * scheme tipo `houseofmuscle://`). Quindi l'app passa come return URL questo
 * endpoint https; al caricamento rimbalziamo sul deep link dell'app, che
 * `expo-web-browser` (openAuthSessionAsync) intercetta per chiudere lo sheet e
 * proseguire con la conferma pagamento.
 */
export default function CheckoutMobileReturn() {
  const [deepLink, setDeepLink] = useState("houseofmuscle://checkout/success");

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("pid");
    const target = pid
      ? `houseofmuscle://checkout/success?pid=${encodeURIComponent(pid)}`
      : "houseofmuscle://checkout/success";
    setDeepLink(target);
    window.location.replace(target);
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <h1 style={{ fontSize: 20, margin: 0 }}>Ritorno all&apos;app…</h1>
      <p style={{ opacity: 0.7, margin: 0 }}>
        Se non vieni reindirizzato automaticamente, tocca il pulsante qui sotto.
      </p>
      <a
        href={deepLink}
        style={{
          padding: "12px 20px",
          borderRadius: 12,
          background: "#df2531",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 600
        }}
      >
        Torna all&apos;app
      </a>
    </main>
  );
}
