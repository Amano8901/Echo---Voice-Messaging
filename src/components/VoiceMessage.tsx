import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import { cn } from '../lib/utils';

interface VoiceMessageProps {
  audioUrl: string;
  isMe: boolean;
}

export const VoiceMessage: React.FC<VoiceMessageProps> = ({ audioUrl, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: isMe ? 'rgba(255, 255, 255, 0.3)' : '#d1d5db',
      progressColor: isMe ? '#ffffff' : '#10b981',
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 3,
      barRadius: 3,
      height: 40,
      normalize: true,
      url: audioUrl,
    });

    wavesurfer.current = ws;

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setIsReady(true);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    
    ws.on('timeupdate', (time) => {
      setCurrentTime(time);
    });

    return () => {
      ws.destroy();
    };
  }, [audioUrl, isMe]);

  const togglePlay = () => {
    if (wavesurfer.current) {
      wavesurfer.current.playPause();
    }
  };

  const toggleMute = () => {
    if (wavesurfer.current) {
      wavesurfer.current.setMuted(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      "flex items-center gap-4 py-2 px-3 rounded-2xl min-w-[280px] max-w-full transition-all",
      isMe ? "bg-emerald-600 text-white" : "bg-white border border-zinc-200 text-zinc-800"
    )}>
      {/* Prominent Play Button */}
      <button
        onClick={togglePlay}
        disabled={!isReady}
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg shrink-0 active:scale-95 disabled:opacity-50",
          isMe 
            ? "bg-white text-emerald-600 hover:bg-zinc-100" 
            : "bg-emerald-500 text-white hover:bg-emerald-600"
        )}
      >
        {isPlaying ? (
          <Pause className="w-6 h-6 fill-current" />
        ) : (
          <Play className="w-6 h-6 fill-current ml-1" />
        )}
      </button>
      
      <div className="flex-1 flex flex-col gap-1 overflow-hidden">
        {/* Real Waveform */}
        <div 
          ref={waveformRef} 
          className="w-full cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
        
        <div className="flex justify-between items-center">
          <span className={cn(
            "text-[10px] font-bold tracking-wider uppercase",
            isMe ? "text-emerald-100" : "text-zinc-400"
          )}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          
          <button 
            onClick={toggleMute}
            className={cn(
              "p-1 rounded-md transition-colors",
              isMe ? "hover:bg-emerald-500/50" : "hover:bg-zinc-100"
            )}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
