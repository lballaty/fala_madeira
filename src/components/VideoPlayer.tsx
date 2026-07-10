// File: /Users/liborballaty/LocalProjects/GitHubProjectsDocuments/fala_madeira/src/components/VideoPlayer.tsx
// Description: Embedded YouTube video player primitive extracted verbatim from App.tsx.
//   Parses a YouTube URL into an embed iframe; renders nothing for non-YouTube URLs.
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-09

export const VideoPlayer = ({ url }: { url: string }) => {
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getYoutubeId(url);

  if (!videoId) return null;

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
