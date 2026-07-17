// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/VideoPlayer.tsx
// Description: Embedded YouTube video player primitive extracted verbatim from App.tsx.
//   Parses a YouTube URL into an embed iframe. TB-16: an unparseable/empty URL used to render
//   NOTHING (return null), so a dead/mis-seeded link made the whole video section silently vanish
//   ("the videos are gone"). It now surfaces an explicit "video unavailable" placeholder instead of
//   a blank, so a broken link is visible (and reportable) rather than invisible. Live-but-dead
//   YouTube IDs (geo-blocked/removed) still render YouTube's own in-iframe error — the data-liveness
//   audit + legacy-vs-pack source convergence are the tracked TB-16/FE3 follow-ups.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

import { VideoOff } from 'lucide-react';

const getYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

export const VideoPlayer = ({ url }: { url: string }) => {
  const videoId = getYoutubeId(url);

  // TB-16: never render a silent blank — an unrecognisable/missing video link gets an explicit,
  // labelled "unavailable" state so the section is visibly present, not mysteriously gone.
  if (!videoId) {
    return (
      <div
        data-testid="video-unavailable"
        role="status"
        className="relative w-full aspect-video rounded-2xl overflow-hidden border border-ios-blue/10 bg-ios-bg flex flex-col items-center justify-center text-center gap-2 p-4"
      >
        <VideoOff className="w-8 h-8 text-ios-gray" aria-hidden="true" />
        <p className="text-sm font-semibold text-text">Video unavailable</p>
        <p className="text-xs text-ios-gray max-w-xs">
          This video link couldn’t be loaded. It may have been moved or removed — please report it so we can fix it.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-lg border border-ios-blue/10">
      <iframe
        className="absolute inset-0 w-full h-full"
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      ></iframe>
    </div>
  );
};
