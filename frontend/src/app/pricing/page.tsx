"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, Sparkles, ArrowRight, ShieldCheck, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/lib/authContext";
import {
  fetchPlans,
  fetchBillingStatus,
  createCheckout,
  createCustomerPortal,
  type PlanItem,
  type BillingStatusResponse,
} from "@/lib/billingApi";
import styles from "./pricing.module.css";

export default function PricingPage() {
  const router = useRouter();
  const { user, status } = useAuth();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const plansData = await fetchPlans();
        if (mounted) setPlans(plansData.plans);
        if (status === "authenticated" && user) {
          try {
            const statusData = await fetchBillingStatus();
            if (mounted) setBillingStatus(statusData);
          } catch {
            // Unauthenticated or temporary status error
          }
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load plans");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [status, user]);

  const handleSelectPlan = async (planId: "creator_monthly" | "creator_yearly" | "event") => {
    setError(null);
    if (status !== "authenticated" || !user) {
      router.push(`/auth?redirect=${encodeURIComponent("/pricing")}`);
      return;
    }

    setSubmittingPlan(planId);
    try {
      const result = await createCheckout(planId);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout initiation failed. Please try again.");
      setSubmittingPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    setError(null);
    setSubmittingPlan("portal");
    try {
      const result = await createCustomerPortal();
      if (result.portalUrl) {
        window.location.href = result.portalUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setSubmittingPlan(null);
    }
  };

  const currentPlan = billingStatus?.plan || (user ? "free" : null);

  return (
    <>
      <SiteHeader />
      <main className={styles.pricingContainer}>
        <section className={styles.heroSection}>
          <span className={styles.heroEyebrow}>Simple, Transparent Pricing</span>
          <h1 className={styles.heroTitle}>Prints to keep forever.</h1>
          <p className={styles.heroSubtitle}>
            Start capturing for free, or upgrade to Creator for unbranded prints, permanent cloud storage, and all 23+ vintage formats.
          </p>
        </section>

        {error && (
          <div style={{ maxWidth: 600, margin: "0 auto 24px", padding: 12, borderRadius: 8, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", textAlign: "center", fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={32} className="animate-spin" color="#64748b" />
          </div>
        ) : (
          <>
            <div className={styles.plansGrid}>
              {/* 1. Free Member */}
              <div className={styles.planCard}>
                <h3 className={styles.planName}>Free Member</h3>
                <div className={styles.planPrice}>
                  <span className={styles.priceNumber}>$0</span>
                </div>
                <p className={styles.planDescription}>
                  Essential photo booth capturing for casual fun and sharing.
                </p>
                <ul className={styles.planFeatures}>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>4 classic strip & grid layouts</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>10 core vintage & color filters</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>7-day cloud link sharing</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Up to 10 strips per session</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Instant local PNG downloads</span>
                  </li>
                </ul>
                {currentPlan === "free" ? (
                  <button className={`${styles.ctaButton} ${styles.ctaSecondary} ${styles.ctaDisabled}`} disabled>
                    Current Plan
                  </button>
                ) : (
                  <Link href="/auth" className={`${styles.ctaButton} ${styles.ctaSecondary}`}>
                    Start Free
                  </Link>
                )}
              </div>

              {/* 2. Creator Yearly (HERO) */}
              <div className={`${styles.planCard} ${styles.heroCard}`}>
                <div className={styles.badge}>Most Popular • 7-Day Trial</div>
                <h3 className={styles.planName}>Creator Yearly</h3>
                <div className={styles.planPrice}>
                  <span className={styles.priceNumber}>$59</span>
                  <span className={styles.pricePeriod}>/ year</span>
                </div>
                <div>
                  <span className={styles.savingsPill}>$4.92/mo • 18% off • 7 days free</span>
                </div>
                <p className={styles.planDescription}>
                  Full creative freedom with unbranded high-res prints and permanent keepsakes.
                </p>
                <ul className={styles.planFeatures}>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <strong>7-day free trial included</strong>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Clean, unbranded prints (no watermark)</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Permanent cloud links (never expire)</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>All 23+ vintage, grid & ticket layouts</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>All 40+ retro filters & adjustments</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Up to 100 strips per session</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Download raw photo originals</span>
                  </li>
                </ul>
                {currentPlan === "creator_yearly" ? (
                  <button onClick={handleOpenPortal} className={`${styles.ctaButton} ${styles.ctaPrimary}`} disabled={submittingPlan === "portal"}>
                    {submittingPlan === "portal" ? <Loader2 size={16} className="animate-spin" /> : <>Manage Subscription <ExternalLink size={14} /></>}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectPlan("creator_yearly")}
                    className={`${styles.ctaButton} ${styles.ctaPrimary}`}
                    disabled={submittingPlan === "creator_yearly"}
                  >
                    {submittingPlan === "creator_yearly" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>Start 7-Day Free Trial <ArrowRight size={16} /></>
                    )}
                  </button>
                )}
              </div>

              {/* 3. Creator Monthly */}
              <div className={styles.planCard}>
                <h3 className={styles.planName}>Creator Monthly</h3>
                <div className={styles.planPrice}>
                  <span className={styles.priceNumber}>$6</span>
                  <span className={styles.pricePeriod}>/ month</span>
                </div>
                <p className={styles.planDescription}>
                  Pay as you go. Full creative capabilities with monthly flexibility.
                </p>
                <ul className={styles.planFeatures}>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Clean, unbranded prints</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Permanent cloud links</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>All 23+ layouts & 40+ filters</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Up to 100 strips per session</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Download raw photo originals</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Cancel anytime with 1 click</span>
                  </li>
                </ul>
                {currentPlan === "creator_monthly" ? (
                  <button onClick={handleOpenPortal} className={`${styles.ctaButton} ${styles.ctaSecondary}`} disabled={submittingPlan === "portal"}>
                    {submittingPlan === "portal" ? <Loader2 size={16} className="animate-spin" /> : <>Manage Subscription <ExternalLink size={14} /></>}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectPlan("creator_monthly")}
                    className={`${styles.ctaButton} ${styles.ctaSecondary}`}
                    disabled={submittingPlan === "creator_monthly"}
                  >
                    {submittingPlan === "creator_monthly" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Upgrade Monthly"
                    )}
                  </button>
                )}
              </div>

              {/* 4. Event Pass */}
              <div className={styles.planCard}>
                <h3 className={styles.planName}>Event Pass</h3>
                <div className={styles.planPrice}>
                  <span className={styles.priceNumber}>$19</span>
                  <span className={styles.pricePeriod}>/ 3 days</span>
                </div>
                <div>
                  <span className={styles.savingsPill}>One-time pass • No recurring fee</span>
                </div>
                <p className={styles.planDescription}>
                  72-hour pass for parties, weddings & popups. Custom captions and 1-year guest retention.
                </p>
                <ul className={styles.planFeatures}>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <strong>72 hours of full Creator access</strong>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Custom event header & footer captions</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>1-year cloud link retention for guests</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>All 23+ layouts & 40+ filters</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Up to 100 strips per session</span>
                  </li>
                  <li className={styles.featureItem}>
                    <Check size={16} className={styles.featureIcon} />
                    <span>Bulk download all raw guest photos</span>
                  </li>
                </ul>
                {currentPlan === "event" ? (
                  <button className={`${styles.ctaButton} ${styles.ctaSecondary} ${styles.ctaDisabled}`} disabled>
                    Pass Active
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectPlan("event")}
                    className={`${styles.ctaButton} ${styles.ctaSecondary}`}
                    disabled={submittingPlan === "event"}
                  >
                    {submittingPlan === "event" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Get 3-Day Event Pass"
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Feature Comparison Table */}
            <section className={styles.matrixSection}>
              <h2 className={styles.matrixTitle}>Compare features across plans</h2>
              <div className={styles.tableWrapper}>
                <table className={styles.matrixTable}>
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Free Member</th>
                      <th>Creator (Monthly/Yearly)</th>
                      <th>Event Pass (3 Days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Clean, unbranded exports</td>
                      <td>Bottom watermark imprint</td>
                      <td><strong>Clean (No watermark)</strong></td>
                      <td><strong>Clean (No watermark)</strong></td>
                    </tr>
                    <tr>
                      <td>Available Layouts</td>
                      <td>4 core layouts</td>
                      <td><strong>All 23+ layouts</strong></td>
                      <td><strong>All 23+ layouts</strong></td>
                    </tr>
                    <tr>
                      <td>Available Filters & Adjustments</td>
                      <td>10 vintage filters</td>
                      <td><strong>All 40+ filters & adjustments</strong></td>
                      <td><strong>All 40+ filters & adjustments</strong></td>
                    </tr>
                    <tr>
                      <td>Cloud Link Retention</td>
                      <td>7 days</td>
                      <td><strong>Permanent (Never expire)</strong></td>
                      <td><strong>1 full year</strong></td>
                    </tr>
                    <tr>
                      <td>Max Strips Per Session</td>
                      <td>10 strips</td>
                      <td><strong>100 strips</strong></td>
                      <td><strong>100 strips</strong></td>
                    </tr>
                    <tr>
                      <td>Custom Footer & Header Captions</td>
                      <td>Default branding only</td>
                      <td><strong>Full custom branding</strong></td>
                      <td><strong>Full custom event captions</strong></td>
                    </tr>
                    <tr>
                      <td>Raw Photo Originals Download</td>
                      <td>No</td>
                      <td><strong>Yes (high-res originals)</strong></td>
                      <td><strong>Yes (all guest photos)</strong></td>
                    </tr>
                    <tr>
                      <td>Free Trial</td>
                      <td>Free forever</td>
                      <td><strong>7 days on Yearly</strong></td>
                      <td>N/A (One-time pass)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* FAQ Section */}
            <section className={styles.faqSection}>
              <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
              <div className={styles.faqItem}>
                <h4 className={styles.faqQuestion}>Can I cancel my subscription at any time?</h4>
                <p className={styles.faqAnswer}>
                  Yes. You can manage or cancel your subscription in the self-service Polar Customer Portal at any time with one click. If you cancel, your Creator features remain active until the end of your billing cycle.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h4 className={styles.faqQuestion}>What payment methods do you accept?</h4>
                <p className={styles.faqAnswer}>
                  We accept all major credit and debit cards, Apple Pay, and Google Pay in USD, securely processed by Polar as Merchant of Record.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h4 className={styles.faqQuestion}>How does the 3-day Event Pass work?</h4>
                <p className={styles.faqAnswer}>
                  The Event Pass is a one-time payment of $19 designed for weddings, birthdays, and brand pop-ups. It gives you 72 hours of complete Creator access with custom event branding, and all photos captured during the event remain online for 1 full year for your guests.
                </p>
              </div>
              <div className={styles.faqItem}>
                <h4 className={styles.faqQuestion}>What happens to my photos if my subscription ends?</h4>
                <p className={styles.faqAnswer}>
                  All photos and strips you created during your Creator subscription remain accessible and permanent. After canceling, any new sessions you create will simply follow the Free Member limits.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
