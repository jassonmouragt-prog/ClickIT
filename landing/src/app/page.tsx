import type { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { PainSection } from '@/components/PainSection';
import { HowItWorks } from '@/components/HowItWorks';
import { ClickITPicks } from '@/components/ClickITPicks';
import { DetectionFeatures } from '@/components/DetectionFeatures';
import { HumanReview } from '@/components/HumanReview';
import { LocalProcessing } from '@/components/LocalProcessing';
import { ScaleSection } from '@/components/ScaleSection';
import { EditingPreview } from '@/components/EditingPreview';
import { Trial } from '@/components/Trial';
import { Comparison } from '@/components/Comparison';
import { ValidationProof } from '@/components/ValidationProof';
import { RawSupport } from '@/components/RawSupport';
import { Audience } from '@/components/Audience';
import { Offer } from '@/components/Offer';
import { Faq } from '@/components/Faq';
import { FinalCta } from '@/components/FinalCta';
import { Footer } from '@/components/Footer';

export default function Page(): ReactNode {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <PainSection />
        <HowItWorks />
        <ClickITPicks />
        <DetectionFeatures />
        <HumanReview />
        <LocalProcessing />
        <ScaleSection />
        <EditingPreview />
        <Trial />
        <Comparison />
        <ValidationProof />
        <RawSupport />
        <Audience />
        <Offer />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
