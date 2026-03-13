import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Mic, Square, Send, X, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export interface VoiceRecorderHandle {
  stopAndSend: () => void;
  stop: () => void;
  cancel: () => void;
}

interface VoiceRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
  isHoldMode?: boolean;
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(({ onSend, onCancel, isHoldMode }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    stopAndSend: () => stopRecording(true),
    stop: () => stopRecording(false),
    cancel: onCancel
  }));

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      onCancel();
    }
  };

  const stopRecording = (shouldSend = false) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (shouldSend) {
          onSend(blob);
        } else {
          const url = URL.createObjectURL(blob);
          setAudioBlob(blob);
          setAudioUrl(url);
        }
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob);
    }
  };

  return (
    <div className="flex items-center gap-4 bg-zinc-100 p-3 rounded-full w-full">
      <div className="flex items-center gap-2 flex-1">
        {isRecording ? (
          <motion.div 
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="w-3 h-3 bg-red-500 rounded-full"
          />
        ) : (
          <Square className="w-4 h-4 text-zinc-500" />
        )}
        <span className="text-sm font-mono text-zinc-600">{formatDuration(duration)}</span>
        
        <div className="flex-1 h-1 bg-zinc-200 rounded-full overflow-hidden">
          {isRecording && (
            <motion.div 
              className="h-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 60, ease: "linear" }} // Max 1 min for demo
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isHoldMode && (
          <button 
            onClick={onCancel}
            className="p-2 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        {isRecording ? (
          !isHoldMode && (
            <button 
              onClick={() => stopRecording(false)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-full hover:bg-zinc-700 transition-colors shadow-md"
            >
              <Square className="w-4 h-4 fill-current" />
              <span className="text-xs font-bold uppercase tracking-wider">Stop</span>
            </button>
          )
        ) : (
          <button 
            onClick={handleSend}
            className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
});
