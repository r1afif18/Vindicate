import { FlowStage } from "@/components/effects/flow-stage"
import { Preloader } from "@/components/effects/preloader"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"
import { JsonLd } from "@/components/seo/json-ld"

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    // Isolated, so the fixed stage sits behind the page's content and in front of its background.
    <div className="relative isolate">
      <JsonLd />
      <FlowStage />
      <Preloader />
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
