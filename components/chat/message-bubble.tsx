"use client";

interface MessageBubbleProps {
  text: string;
}

/**
 * Right-aligned user message bubble với gradient primary warm tone.
 * Plain text — no dangerouslySetInnerHTML. Entrance: fade-up.
 */
export function MessageBubble({ text }: MessageBubbleProps) {
  return (
    <div className="flex justify-end px-4 py-1.5 animate-fade-up">
      <div className="max-w-[82%] rounded-3xl rounded-br-md bg-gradient-to-br from-primary to-primary-glow px-4 py-2.5 text-primary-foreground shadow-soft">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
