import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  serverTimestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Maximize2, Minimize2, Settings, ShieldCheck, Zap } from 'lucide-react';
import { db } from '../firebase';
import { UserProfile, Call } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface CallOverlayProps {
  currentUser: UserProfile;
  activeCall: Call | null;
  otherUser: UserProfile | null;
  onEndCall: () => void;
}

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

export const CallOverlay: React.FC<CallOverlayProps> = ({ currentUser, activeCall, otherUser, onEndCall }) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [qualitySettings, setQualitySettings] = useState({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  });
  const [duration, setDuration] = useState(0);
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const unsubscribes = useRef<(() => void)[]>([]);

  useEffect(() => {
    let timer: number;
    if (activeCall?.status === 'ongoing') {
      timer = window.setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeCall?.status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!activeCall) return;

    const setupCall = async () => {
      try {
        pc.current = new RTCPeerConnection(servers);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: activeCall.type === 'video',
          audio: {
            echoCancellation: qualitySettings.echoCancellation,
            noiseSuppression: qualitySettings.noiseSuppression,
            autoGainControl: qualitySettings.autoGainControl,
          },
        });
        
        setLocalStream(stream);
        stream.getTracks().forEach((track) => {
          pc.current?.addTrack(track, stream);
        });

        if (pc.current) {
          pc.current.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
          };
        }

        if (activeCall.callerId === currentUser.uid) {
          // Caller logic
          const callDoc = doc(db, 'calls', activeCall.id);
          const callerCandidatesCollection = collection(callDoc, 'callerCandidates');
          const receiverCandidatesCollection = collection(callDoc, 'receiverCandidates');

          if (pc.current) {
            pc.current.onicecandidate = (event) => {
              if (event.candidate) {
                addDoc(callerCandidatesCollection, event.candidate.toJSON());
              }
            };

            const offerDescription = await pc.current.createOffer();
            await pc.current.setLocalDescription(offerDescription);

            const offer = {
              sdp: offerDescription.sdp,
              type: offerDescription.type,
            };

            await updateDoc(callDoc, { offer });
          }

          const unsubCall = onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (pc.current && !pc.current.currentRemoteDescription && data?.answer) {
              const answerDescription = new RTCSessionDescription(data.answer);
              pc.current.setRemoteDescription(answerDescription);
            }
            if (data?.status === 'ended' || data?.status === 'rejected') {
              cleanup();
            }
          });
          unsubscribes.current.push(unsubCall);

          const unsubCandidates = onSnapshot(receiverCandidatesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                pc.current?.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });
          unsubscribes.current.push(unsubCandidates);
        } else {
          // Receiver logic
          const callDoc = doc(db, 'calls', activeCall.id);
          const callerCandidatesCollection = collection(callDoc, 'callerCandidates');
          const receiverCandidatesCollection = collection(callDoc, 'receiverCandidates');

          if (pc.current) {
            pc.current.onicecandidate = (event) => {
              if (event.candidate) {
                addDoc(receiverCandidatesCollection, event.candidate.toJSON());
              }
            };

            const callSnapshot = await getDoc(callDoc);
            const callData = callSnapshot.data();
            if (callData?.offer) {
              const offerDescription = callData.offer;
              await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

              const answerDescription = await pc.current.createAnswer();
              await pc.current.setLocalDescription(answerDescription);

              const answer = {
                type: answerDescription.type,
                sdp: answerDescription.sdp,
              };

              await updateDoc(callDoc, { answer, status: 'ongoing' });
            }
          }

          const unsubCandidates = onSnapshot(callerCandidatesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const data = change.doc.data();
                pc.current?.addIceCandidate(new RTCIceCandidate(data));
              }
            });
          });
          unsubscribes.current.push(unsubCandidates);

          const unsubCall = onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (data?.status === 'ended') {
              cleanup();
            }
          });
          unsubscribes.current.push(unsubCall);
        }
    } catch (err) {
      console.error('Error setting up call:', err);
      cleanup();
    }
  };

    setupCall();

    return () => {
      cleanup();
    };
  }, [activeCall?.id]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const cleanup = () => {
    localStream?.getTracks().forEach(track => track.stop());
    unsubscribes.current.forEach(unsub => unsub());
    unsubscribes.current = [];
    if (pc.current && pc.current.signalingState !== 'closed') {
      pc.current.close();
    }
    pc.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    onEndCall();
  };

  const handleEndCall = async () => {
    if (activeCall) {
      await updateDoc(doc(db, 'calls', activeCall.id), { status: 'ended' });
    }
    cleanup();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const updateQualitySetting = async (key: keyof typeof qualitySettings) => {
    const newSettings = { ...qualitySettings, [key]: !qualitySettings[key] };
    setQualitySettings(newSettings);
    
    // Re-apply constraints to the active audio track
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        try {
          await audioTrack.applyConstraints({
            echoCancellation: newSettings.echoCancellation,
            noiseSuppression: newSettings.noiseSuppression,
            autoGainControl: newSettings.autoGainControl,
          });
        } catch (err) {
          console.error('Failed to apply audio constraints:', err);
        }
      }
    }
  };

  if (!activeCall) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-zinc-900 flex flex-col items-center justify-center text-white"
    >
      {/* Remote Video (Full Screen) */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {activeCall.type === 'video' ? (
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-6">
            <div className="w-40 h-40 rounded-full bg-zinc-800 border-4 border-zinc-700 flex items-center justify-center text-5xl font-bold overflow-hidden shadow-2xl">
              {otherUser?.photoURL ? (
                <img src={otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                otherUser?.displayName?.charAt(0) || '?'
              )}
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-semibold mb-2">{otherUser?.displayName || 'Voice Call'}</h2>
              <p className="text-emerald-500 font-mono text-xl">{formatTime(duration)}</p>
            </div>
          </div>
        )}

        {/* Local Video (Picture in Picture) */}
        {activeCall.type === 'video' && (
          <motion.div 
            drag
            dragConstraints={{ left: -200, right: 200, top: -300, bottom: 300 }}
            className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl border border-zinc-700 overflow-hidden shadow-2xl z-10"
          >
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover"
            />
            {isVideoOff && (
              <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center">
                <VideoOff className="w-6 h-6 text-zinc-500" />
              </div>
            )}
          </motion.div>
        )}

        {/* Call Info */}
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-center z-20">
          <AnimatePresence mode="wait">
            {activeCall.status === 'calling' ? (
              <motion.div
                key="calling"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <p className="text-zinc-400 text-sm uppercase tracking-widest">Calling...</p>
                </div>
                <h3 className="text-2xl font-semibold">{otherUser?.displayName}</h3>
              </motion.div>
            ) : (
              <motion.div
                key="ongoing"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex flex-col items-center gap-1"
              >
                <p className="text-zinc-400 text-xs uppercase tracking-widest">Ongoing Call</p>
                <h3 className="text-xl font-medium">{otherUser?.displayName}</h3>
                <p className="text-emerald-500 font-mono text-lg">{formatTime(duration)}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-6">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              showSettings ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            )}
          >
            <Settings className="w-5 h-5" />
          </button>

          <button 
            onClick={toggleMute}
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all",
              isMuted ? "bg-red-500" : "bg-zinc-700 hover:bg-zinc-600"
            )}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {activeCall.type === 'video' && (
            <button 
              onClick={toggleVideo}
              className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-all",
                isVideoOff ? "bg-red-500" : "bg-zinc-700 hover:bg-zinc-600"
              )}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          )}

          <button 
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-700 transition-all shadow-lg"
          >
            <PhoneOff className="w-8 h-8" />
          </button>
        </div>

        {/* Quality Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-32 bg-zinc-800/90 backdrop-blur-md border border-zinc-700 rounded-2xl p-4 w-64 shadow-2xl z-50"
            >
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Zap className="w-3 h-3" />
                Audio Quality Features
              </h4>
              
              <div className="space-y-3">
                <QualityToggle 
                  label="Echo Cancellation" 
                  active={qualitySettings.echoCancellation} 
                  onClick={() => updateQualitySetting('echoCancellation')}
                />
                <QualityToggle 
                  label="Noise Suppression" 
                  active={qualitySettings.noiseSuppression} 
                  onClick={() => updateQualitySetting('noiseSuppression')}
                />
                <QualityToggle 
                  label="Auto Gain Control" 
                  active={qualitySettings.autoGainControl} 
                  onClick={() => updateQualitySetting('autoGainControl')}
                />
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-700 flex items-center gap-2 text-[10px] text-zinc-400">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span>Hardware acceleration active</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const QualityToggle = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
  <div 
    className="flex items-center justify-between cursor-pointer group"
    onClick={onClick}
  >
    <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">{label}</span>
    <div className={cn(
      "w-8 h-4 rounded-full relative transition-colors",
      active ? "bg-emerald-500" : "bg-zinc-600"
    )}>
      <div className={cn(
        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
        active ? "right-0.5" : "left-0.5"
      )} />
    </div>
  </div>
);
