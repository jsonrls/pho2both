"use client";
import { CapturedShot } from '@/types/booth';
import { MotionStudio } from './BoomerangStudio';
export function VideoReelStudio(props: { shots: CapturedShot[]; onBack: () => void }) {
  return <MotionStudio {...props} reel />;
}
