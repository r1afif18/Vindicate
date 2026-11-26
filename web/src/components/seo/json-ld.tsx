const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vindicate.app"

/** Organization + WebApplication + SoftwareApplication + FAQPage structured data for AEO/SEO. */
export function JsonLd() {
  const faqEntries = [
    {
      question: "Is it safe to paste my private key?",
      answer:
        "Only paste a key that has already leaked. It signs in your browser and is never sent anywhere. If you prefer, run Vindicate from the source code on your own machine.",
    },
    {
      question: "What does it cost?",
      answer:
        "10% of the tokens and BNB you move. Revoking approvals, moving NFTs and clearing the delegation are free. Network gas is usually a few cents on BNB Chain.",
    },
    {
      question: "Can a bot still beat me?",
      answer:
        "Yes, it still can. No BNB is ever sent to the drained wallet, so a bot has nothing to react to until the rescue itself is broadcast. From that moment a bot holding your key can race it, and if it wins, the rescue does nothing and you try again. A private-transaction RPC narrows that window.",
    },
    {
      question: "My seed phrase leaked, not a private key.",
      answer:
        "Export the private key of the affected account from any wallet app first. Vindicate only accepts a 64-character private key.",
    },
    {
      question: "What about the wallet afterwards?",
      answer: "Treat it as burned. If more tokens or an airdrop arrive later, run another rescue.",
    },
  ]

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Vindicate",
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "Move what is left in a compromised BNB Chain wallet to a safe one in a single transaction, before a drainer or sweeper bot takes it.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description:
          "No upfront price. A 10% fee is taken from swept tokens and BNB; revokes and NFT moves carry no fee.",
      },
      featureList: [
        "EIP-7702 signed wallet recovery",
        "Atomic multi-asset sweep in one transaction",
        "Drainer approval revocation",
        "Keys never leave the browser",
        "Optional AI copilot that receives addresses and a note, never a key",
        "BNB Chain testnet preview; mainnet not live yet",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntries.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.answer,
        },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "How to rescue a drained BNB Chain wallet with Vindicate",
      description:
        "Use Vindicate to move remaining assets from a compromised wallet to a safe one before a sweeper bot takes them.",
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Scan the drained wallet",
          text: "The app reads BNB, well-known tokens and any existing EIP-7702 delegation straight from the chain. Other tokens, NFTs and approvals are added by hand or found by the copilot.",
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Choose what to save",
          text: "Select tokens, BNB, NFTs and approvals to cut off. The compromised key signs an EIP-7702 authorization and one EIP-712 instruction locally.",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Send one transaction",
          text: "The gas wallet submits the transaction. Revokes, calls, NFT transfers and sweeps run in order, and either all land or none do.",
        },
      ],
    },
  ]

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}
