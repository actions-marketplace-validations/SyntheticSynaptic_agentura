import { FeaturesSection } from "../components/landing/FeaturesSection";
import { FooterSection } from "../components/landing/FooterSection";
import { HeroSection } from "../components/landing/HeroSection";
import { HowItWorksSection } from "../components/landing/HowItWorksSection";
import { NavBar } from "../components/landing/NavBar";
import { PricingSection } from "../components/landing/PricingSection";
import { PrCommentMockupSection } from "../components/landing/PrCommentMockupSection";
import { SocialProofBar } from "../components/landing/SocialProofBar";
import { WaitlistForm } from "../components/landing/WaitlistForm";

export default function HomePage() {
  return (
    <div className="bg-slate-950 text-slate-100">
      <NavBar />
      <main>
        <HeroSection />
        <SocialProofBar />
        <HowItWorksSection />
        <PrCommentMockupSection />
        <FeaturesSection />
        <PricingSection />
        <section id="waitlist" className="px-6 py-20">
          <div className="mx-auto w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900/70 p-8">
            <h2 className="text-3xl font-semibold tracking-tight text-white">Get early access</h2>
            <p className="mt-3 text-slate-300">
              We&apos;re onboarding developers one by one. Drop your email and we&apos;ll reach out
              when you&apos;re up.
            </p>
            <div className="mt-6">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>
      <FooterSection />
    </div>
  );
}
