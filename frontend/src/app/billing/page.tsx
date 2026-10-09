"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useAuth } from "@/lib/authContext";
import {
  createCustomerPortal,
  fetchBillingStatus,
  syncSubscription,
  type BillingStatusResponse,
} from "@/lib/billingApi";
import styles from "./billing.module.css";

function formatDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, status, refresh } = useAuth();

  const [billing, setBilling] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const isSuccess = searchParams.get("checkout") === "success";
    if (isSuccess) setCheckoutSuccess(true);

    async function loadData() {
      if (status !== "authenticated" || !user) {
        if (status === "guest") setLoading(false);
        return;
      }

      try {
        setError(null);
        if (isSuccess || searchParams.get("sync") === "1") {
          setSyncing(true);
          const synced = await syncSubscription();
          if (mounted) {
            setBilling(synced);
            await refresh();
          }
        } else {
          const data = await fetchBillingStatus();
          if (mounted) setBilling(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Could not load billing details.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setSyncing(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [status, user, searchParams, refresh]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await syncSubscription();
      setBilling(data);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync subscription status.");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const portal = await createCustomerPortal();
      if (portal.portalUrl) {
        window.location.href = portal.portalUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setPortalLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <>
        <SiteHeader />
        <main className={styles.container}>
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
            <Loader2 size={36} className="animate-spin" color="var(--light-red, #ea6c58)" />
          </div>
        </main>
      </>
    );
  }

  if (status !== "authenticated" || !user) {
    return (
      <>
        <SiteHeader />
        <main className={styles.container}>
          <div className={styles.currentPlanCard} style={{ textAlign: "center", padding: "48px 24px" }}>
            <div className={styles.eyebrow}>Account Required</div>
            <h1 className={styles.title} style={{ fontSize: 28 }}>Sign in to manage your billing</h1>
            <p className={styles.subtitle} style={{ marginBottom: 24 }}>
              Sign in with your registered email to view active plans, change billing methods, or download tax invoices.
            </p>
            <Link className={styles.upgradeButton} href="/auth?redirect=/billing">
              Sign In to Your Account
            </Link>
          </div>
        </main>
      </>
    );
  }

  const currentPlan = billing?.plan || (user.plan as "creator_yearly" | "creator_monthly" | "event" | "free") || "free";
  const subscription = billing?.subscription;
  const isPaid = currentPlan === "creator_yearly" || currentPlan === "creator_monthly" || currentPlan === "event";
  const isTrial = subscription?.status === "trialing";
  const isCanceled = Boolean(subscription?.cancelAtPeriodEnd);
  const formattedPeriodEnd = formatDate(subscription?.currentPeriodEnd);

  const planTitles: Record<string, string> = {
    creator_yearly: "Creator Yearly Plan",
    creator_monthly: "Creator Monthly Plan",
    event: "Event Pass (72-Hour)",
    free: "Free Member Plan",
  };

  const planPrices: Record<string, string> = {
    creator_yearly: "$59.00 / year ($4.92/mo)",
    creator_monthly: "$6.00 / month",
    event: "$19.00 one-time pass",
    free: "$0.00 / free forever",
  };

  const planDescriptions: Record<string, string> = {
    creator_yearly: "Our best value plan. Unbranded prints, permanent cloud library, and all 23+ vintage formats.",
    creator_monthly: "Flexible month-to-month access to all creator features and unbranded high-res prints.",
    event: "72 hours of complete creator access with custom captions and 1-year guest link retention.",
    free: "Essential photo booth capturing with 4 classic layouts and 7-day cloud sharing.",
  };

  const badgeClass = isTrial
    ? `${styles.statusBadge} ${styles.badgeTrial}`
    : currentPlan === "event"
      ? `${styles.statusBadge} ${styles.badgeEvent}`
      : isPaid
        ? `${styles.statusBadge} ${styles.badgeActive}`
        : `${styles.statusBadge} ${styles.badgeFree}`;

  const badgeText = isTrial
    ? "Trial Active • 7 Days Free"
    : isCanceled
      ? `Canceling on ${formattedPeriodEnd || "End of Period"}`
      : isPaid
        ? "Active Subscription"
        : "Standard Free Tier";

  return (
    <>
      <SiteHeader />
      <main className={styles.container}>
        <Link href="/auth" className={styles.backLink}>
          <ArrowLeft size={16} /> Back to Account Settings
        </Link>

        <section className={styles.header}>
          <span className={styles.eyebrow}>Billing & Invoicing</span>
          <h1 className={styles.title}>Manage your subscription</h1>
          <p className={styles.subtitle}>
            View your active membership, billing interval, renewal dates, and payment history.
          </p>
        </section>

        {error && (
          <div className={`${styles.alertBanner} ${styles.alertCanceled}`} role="alert">
            <div>
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {checkoutSuccess && (
          <div className={`${styles.alertBanner} ${styles.alertActive}`} role="status">
            <CheckCircle2 size={18} style={{ color: "#059669", flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Subscription activated successfully!</strong>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                Your {planTitles[currentPlan] || "Creator Plan"} is stored in the database and active across all photo booth studios and downloads.
              </div>
            </div>
          </div>
        )}

        {isTrial && (
          <div className={`${styles.alertBanner} ${styles.alertTrial}`}>
            <Clock size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>7-Day Free Trial Active</strong>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                You have full unbranded Creator access during your trial until {formattedPeriodEnd || "the end of your trial"}. You will not be charged if you cancel before this date.
              </div>
            </div>
          </div>
        )}

        {isCanceled && (
          <div className={`${styles.alertBanner} ${styles.alertCanceled}`}>
            <Clock size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Subscription Scheduled for Cancellation</strong>
              <div style={{ fontSize: 13, marginTop: 2 }}>
                Your plan is active until {formattedPeriodEnd || "the end of your current cycle"}. It will not renew afterwards and you will retain all keepsakes already created.
              </div>
            </div>
          </div>
        )}

        {/* Hero Current Plan Card */}
        <section className={styles.currentPlanCard}>
          <div className={styles.cardHeader}>
            <div className={styles.planNameGroup}>
              <h2>
                <Sparkles size={20} color="var(--light-red, #ea6c58)" />
                {planTitles[currentPlan] || "Plan"}
              </h2>
              <p className={styles.planDescription}>{planDescriptions[currentPlan]}</p>
            </div>
            <span className={badgeClass}>{badgeText}</span>
          </div>

          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>
                <CreditCard size={14} /> Price & Interval
              </div>
              <div className={styles.detailValue}>{planPrices[currentPlan]}</div>
              <div className={styles.detailSubtext}>
                {currentPlan === "creator_yearly" ? "Billed annually" : currentPlan === "creator_monthly" ? "Billed monthly" : "Processed via Polar"}
              </div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>
                <Calendar size={14} />
                {isTrial ? "Trial Ends" : isCanceled ? "Access Ends" : currentPlan === "event" ? "Expires On" : "Next Renewal"}
              </div>
              <div className={styles.detailValue}>{formattedPeriodEnd || (isPaid ? "Active" : "Never")}</div>
              <div className={styles.detailSubtext}>
                {isTrial ? "Converts to yearly" : isCanceled ? "Will not renew" : isPaid ? "Automatic renewal" : "Standard free tier"}
              </div>
            </div>

            <div className={styles.detailItem}>
              <div className={styles.detailLabel}>
                <ShieldCheck size={14} /> Account Email
              </div>
              <div className={styles.detailValue} style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.email}
              </div>
              <div className={styles.detailSubtext}>Linked customer ID stored</div>
            </div>
          </div>

          <div className={styles.actionsBar}>
            {isPaid ? (
              <>
                <button
                  type="button"
                  className={styles.portalButton}
                  onClick={handleOpenPortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Opening Customer Portal…
                    </>
                  ) : (
                    <>
                      Manage Subscription in Polar Portal <ExternalLink size={14} />
                    </>
                  )}
                </button>

                {currentPlan === "creator_monthly" && (
                  <Link href="/pricing" className={styles.upgradeButton}>
                    Switch to Yearly (Save 18%)
                  </Link>
                )}

                <button
                  type="button"
                  className={styles.syncButton}
                  onClick={handleSync}
                  disabled={syncing}
                  title="Query Polar directly and refresh database status"
                >
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing…" : "Sync Status"}
                </button>
              </>
            ) : (
              <>
                <Link href="/pricing" className={styles.upgradeButton}>
                  <Sparkles size={16} /> Upgrade to Creator Plan (7-Day Trial)
                </Link>

                <button
                  type="button"
                  className={styles.syncButton}
                  onClick={handleSync}
                  disabled={syncing}
                >
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Checking…" : "Check for Active Subscription"}
                </button>
              </>
            )}
          </div>
        </section>

        {/* Entitlements & Included Features */}
        <section className={styles.entitlementsSection}>
          <h3 className={styles.sectionTitle}>
            <CheckCircle2 size={18} color="var(--light-red, #ea6c58)" />
            Features included with your {planTitles[currentPlan]}
          </h3>

          <div className={styles.featuresGrid}>
            <div className={styles.featureItem}>
              {isPaid ? (
                <Check size={18} className={styles.featureIconActive} />
              ) : (
                <Lock size={18} className={styles.featureIconLocked} />
              )}
              <div>
                <strong>Unbranded High-Res Prints</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Watermark imprint completely removed." : "Includes bottom watermark."}
                </p>
              </div>
            </div>

            <div className={styles.featureItem}>
              <Check size={18} className={styles.featureIconActive} />
              <div>
                <strong>Cloud Sharing & Retention</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Permanent cloud links (never expire)." : "7-day cloud sharing links."}
                </p>
              </div>
            </div>

            <div className={styles.featureItem}>
              {isPaid ? (
                <Check size={18} className={styles.featureIconActive} />
              ) : (
                <Lock size={18} className={styles.featureIconLocked} />
              )}
              <div>
                <strong>All 23+ Formats & Layouts</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Polaroids, grids, bookmarks, and tickets." : "4 classic strip & grid formats."}
                </p>
              </div>
            </div>

            <div className={styles.featureItem}>
              {isPaid ? (
                <Check size={18} className={styles.featureIconActive} />
              ) : (
                <Lock size={18} className={styles.featureIconLocked} />
              )}
              <div>
                <strong>All 40+ Retro & Vintage Filters</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Every tone, grain, sepia, and cinematic LUT." : "10 core vintage & color filters."}
                </p>
              </div>
            </div>

            <div className={styles.featureItem}>
              {isPaid ? (
                <Check size={18} className={styles.featureIconActive} />
              ) : (
                <Lock size={18} className={styles.featureIconLocked} />
              )}
              <div>
                <strong>Download Original Raw Shots</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Download camera frames individually." : "Finished keepsake PNG only."}
                </p>
              </div>
            </div>

            <div className={styles.featureItem}>
              <Check size={18} className={styles.featureIconActive} />
              <div>
                <strong>High Strip Capacity</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {isPaid ? "Up to 100 strips saved per session." : "Up to 10 strips saved per session."}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Invoices & Receipts Security Card */}
        <section className={styles.securityCard}>
          <div className={styles.securityInfo}>
            <div className={styles.securityIcon}>
              <FileText size={20} />
            </div>
            <div className={styles.securityText}>
              <h4>Invoices, Receipts & Payment Methods</h4>
              <p>
                Polar acts as our Merchant of Record with PCI-compliant payment handling. Download official tax invoices and update credit cards directly in the portal.
              </p>
            </div>
          </div>
          {isPaid && (
            <button
              type="button"
              className={styles.syncButton}
              onClick={handleOpenPortal}
              disabled={portalLoading}
            >
              View Invoices & Receipts <ExternalLink size={13} />
            </button>
          )}
        </section>

        {/* Billing FAQs */}
        <section className={styles.faqSection}>
          <h3>Billing Frequently Asked Questions</h3>
          <div className={styles.faqGrid}>
            <div className={styles.faqCard}>
              <div className={styles.faqQuestion}>How do I cancel my subscription?</div>
              <div className={styles.faqAnswer}>
                Click the "Manage Subscription in Polar Portal" button above at any time. You can cancel with a single click. Your Creator privileges remain active until the end of your prepaid period.
              </div>
            </div>

            <div className={styles.faqCard}>
              <div className={styles.faqQuestion}>Can I switch between Yearly and Monthly?</div>
              <div className={styles.faqAnswer}>
                Yes. If you are on Creator Monthly, you can upgrade to Yearly at any time to save 18%. Any remaining balance on your monthly billing cycle is prorated automatically.
              </div>
            </div>

            <div className={styles.faqCard}>
              <div className={styles.faqQuestion}>What happens to my past photos if I cancel?</div>
              <div className={styles.faqAnswer}>
                All photos and keepsakes you created during your Creator subscription remain permanently saved and accessible in your library forever.
              </div>
            </div>

            <div className={styles.faqCard}>
              <div className={styles.faqQuestion}>Where can I download PDF receipts for taxes?</div>
              <div className={styles.faqAnswer}>
                Open the Polar Customer Portal using the button above. The portal lists all past charges with downloadable PDF receipts and tax invoices.
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="screen-loading" role="status">
          <Loader2 size={28} className="animate-spin" />
          <span>Opening billing settings…</span>
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}
