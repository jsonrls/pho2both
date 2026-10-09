"use client";

import { Activity, Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Maximize, Minimize } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Dialog } from "@/components/Dialog";
import { AccountDropdown } from "@/components/AccountDropdown";
import { PlanBanner } from "@/components/PlanBanner";
import { LandingPage, type StartBoothOptions } from "@/components/LandingPage";
import { PhotoPreviewScreen } from "@/components/PhotoPreviewScreen";
import { FormatSelectionScreen } from "@/components/FormatSelectionScreen";
import { FRAME_COLORS, LAYOUTS } from "@/lib/constants";
import { useAuth } from "@/lib/authContext";
import { isFilterUnlocked, isLayoutUnlocked } from "@/lib/planAccess";
import type { CapturedShot, FilterType, FlowStep, FrameColorOption, LayoutType, OutputFormat } from "@/types/booth";

function LoadingStudio() {
  return <div className="screen-loading" role="status"><Loader2 size={28} aria-hidden="true" /><span>Opening your little studio…</span></div>;
}

const CameraView = dynamic(() => import("@/components/CameraView").then((module) => module.CameraView), { loading: LoadingStudio });
const StripCustomizer = dynamic(() => import("@/components/StripCustomizer").then((module) => module.StripCustomizer), { loading: LoadingStudio });
const SinglePhotoStudio = dynamic(() => import("@/components/SinglePhotoStudio").then((module) => module.SinglePhotoStudio), { loading: LoadingStudio });
const BoomerangStudio = dynamic(() => import("@/components/BoomerangStudio").then((module) => module.BoomerangStudio), { loading: LoadingStudio });
const VideoReelStudio = dynamic(() => import("@/components/VideoReelStudio").then((module) => module.VideoReelStudio), { loading: LoadingStudio });
const AiEffectStudio = dynamic(() => import("@/components/AiEffectStudio").then((module) => module.AiEffectStudio), { loading: LoadingStudio });

function HomeExperience() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const plan = user?.plan ?? null;
  const [flowStep, setFlowStep] = useState<FlowStep>(searchParams.get("booth") === "1" ? "camera" : "landing");
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>("strip");
  const [visitedFormats, setVisitedFormats] = useState<OutputFormat[]>([]);
  const [captureVersion, setCaptureVersion] = useState(0);
  const [selectedHeroIndex, setSelectedHeroIndex] = useState(0);
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [targetCount, setTargetCount] = useState(4);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [activeFilter, setActiveFilter] = useState<FilterType>("none");
  const [selectedFrame, setSelectedFrame] = useState<FrameColorOption>(FRAME_COLORS[1]);
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>("strip-4");
  const [eventName, setEventName] = useState("The good times club");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [pendingAction, setPendingAction] = useState<"exit" | "retake" | null>(null);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreen);
    };
  }, []);

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setFullscreenError("Fullscreen is unavailable in this browser.");
    } catch {
      setFullscreenError("Fullscreen couldn’t open. You can keep using the booth here.");
    }
  };

  const goToStep = (step: FlowStep) => {
    setFlowStep(step);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const startBooth = (options?: StartBoothOptions) => {
    setShots([]);
    setVisitedFormats([]);
    setCaptureVersion((version) => version + 1);
    setSelectedHeroIndex(0);
    // Defense-in-depth: never let a landing preset force a premium layout or
    // filter onto a free/guest visitor. Premium picks fall back to free-tier.
    if (options?.layout) {
      const layout = isLayoutUnlocked(plan, options.layout) ? options.layout : "strip-4";
      setSelectedLayout(layout);
      setTargetCount(Math.max(2, LAYOUTS.find((item) => item.id === layout)?.count || 4));
    }
    if (options?.frame) setSelectedFrame(options.frame);
    if (options?.eventName) setEventName(options.eventName);
    if (options?.filter) setActiveFilter(isFilterUnlocked(plan, options.filter) ? options.filter : "original");
    if (options?.format) setSelectedFormat(options.format);
    goToStep("camera");
  };

  const finishCapture = (capturedShots: CapturedShot[]) => {
    if (!capturedShots.length) return;
    setShots(capturedShots);
    setVisitedFormats([]);
    setSelectedHeroIndex(0);
    goToStep("preview");
  };

  const completePendingAction = () => {
    const action = pendingAction;
    setPendingAction(null);
    setShots([]);
    setVisitedFormats([]);
    setSelectedHeroIndex(0);
    setCaptureVersion((version) => version + 1);
    if (action === "exit") {
      router.replace("/", { scroll: false });
      goToStep("landing");
    } else goToStep("camera");
  };

  const requestExit = () => {
    if (shots.length) setPendingAction("exit");
    else {
      router.replace("/", { scroll: false });
      goToStep("landing");
    }
  };

  const chooseFormat = (format: OutputFormat) => {
    setSelectedFormat(format);
    setVisitedFormats((formats) => formats.includes(format) ? formats : [...formats, format]);
    if (format === "collage" && !selectedLayout.startsWith("grid")) setSelectedLayout("grid-2x2");
    if (format === "strip" && LAYOUTS.find((layout) => layout.id === selectedLayout)?.category === "grids") setSelectedLayout("strip-4");
    goToStep("studio");
  };

  if (flowStep === "landing") return <LandingPage onStartBooth={startBooth} />;

  const heroShot = shots[selectedHeroIndex] || shots[0];
  const activeStep = flowStep === "camera" ? 0 : flowStep === "preview" ? 1 : 2;
  const backToFormats = () => goToStep("format-select");

  return (
    <div className="session-shell">
      <header className="session-header">
        <div className="session-header-inner page-container">
          <Brand onClick={requestExit} />
          <ol className="session-progress" aria-label="Photo booth progress">
            {["Capture", "Review", "Create"].map((step, index) => <li className="session-step" key={step} data-active={activeStep === index} data-done={activeStep > index} aria-current={activeStep === index ? "step" : undefined}><span>{activeStep > index ? <Check size={12} aria-hidden="true" /> : `0${index + 1}`}</span>{step}</li>)}
          </ol>
          <div className="session-actions">
            <button className="icon-button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>
            <AccountDropdown onBackHome={requestExit} />
          </div>
        </div>
      </header>
      <PlanBanner />
      <main id="main-content" className="page-container" tabIndex={-1}>
        {fullscreenError && <p className="status-note" role="status">{fullscreenError}</p>}
        {flowStep === "camera" && <CameraView key={captureVersion} targetCount={targetCount} onTargetCountChange={setTargetCount} countdownSeconds={countdownSeconds} onCountdownChange={setCountdownSeconds} activeFilter={activeFilter} onFilterChange={setActiveFilter} selectedFrame={selectedFrame} onFrameChange={setSelectedFrame} selectedLayout={selectedLayout} onLayoutChange={setSelectedLayout} onCaptureComplete={finishCapture} eventName={eventName} onEventNameChange={setEventName} />}
        {flowStep === "preview" && <PhotoPreviewScreen shots={shots} onRetake={() => setPendingAction("retake")} onUsePhoto={(index) => { setSelectedHeroIndex(index); goToStep("format-select"); }} />}
        {flowStep === "format-select" && <FormatSelectionScreen onSelectFormat={chooseFormat} onBack={() => goToStep("preview")} />}
        {shots.length > 0 && visitedFormats.map((format) => <Activity key={`${captureVersion}-${format}`} mode={flowStep === "studio" && selectedFormat === format ? "visible" : "hidden"}>
          {(format === "strip" || format === "collage") && <StripCustomizer shots={shots} defaultLayout={format === "collage" ? "grid-2x2" : selectedLayout} defaultFrame={selectedFrame} defaultHeader={eventName} onRetake={() => setPendingAction("retake")} onBack={backToFormats} />}
          {format === "single" && heroShot && <SinglePhotoStudio shot={heroShot} onBack={backToFormats} />}
          {format === "gif" && <BoomerangStudio shots={shots} onBack={backToFormats} />}
          {format === "video" && <VideoReelStudio shots={shots} onBack={backToFormats} />}
          {format === "ai" && heroShot && <AiEffectStudio shot={heroShot} onBack={backToFormats} />}
        </Activity>)}
      </main>
      <footer className="session-footer page-container"><span>A little booth for your best moments.</span><span>Made for the moments in between. ✳</span></footer>
      {pendingAction && <Dialog title={pendingAction === "retake" ? "A fresh round of photos?" : "Leave this little session?"} onClose={() => setPendingAction(null)}><p>{pendingAction === "retake" ? "Your current photos and edits will be cleared. Download any keepsakes you want to keep first." : "Your photos and edits are kept in this session until you leave. Download your favorites before heading home."}</p><div className="control-actions"><button className="button button-secondary" onClick={() => setPendingAction(null)}>Keep creating</button><button className="button button-primary" onClick={completePendingAction}>{pendingAction === "retake" ? "Retake photos" : "Leave session"}</button></div></Dialog>}
    </div>
  );
}

export default function Home() {
  return <Suspense fallback={<LoadingStudio />}><HomeExperience /></Suspense>;
}
