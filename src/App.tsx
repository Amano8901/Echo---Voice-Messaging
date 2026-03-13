import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { signInWithGoogle, db } from './firebase';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatWindow } from './components/ChatWindow';
import { CallOverlay } from './components/CallOverlay';
import { Chat, UserProfile, Call } from './types';
import { MessageSquare, Mic, Shield, Zap, Lock, Phone, Video, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callUser, setCallUser] = useState<UserProfile | null>(null);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);

  const currentUser = profile || (user ? {
    uid: user.uid,
    displayName: user.displayName || 'Anonymous',
    email: user.email || '',
    photoURL: user.photoURL || undefined,
  } : null);

  useEffect(() => {
    if (!user) return;

    // Listen for incoming calls
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'calling')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const callData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Call;
        setIncomingCall(callData);
        
        // Fetch caller info
        const userDoc = await getDoc(doc(db, 'users', callData.callerId));
        if (userDoc.exists()) {
          setCallUser(userDoc.data() as UserProfile);
        }
      } else {
        setIncomingCall(null);
        if (!activeCall) setCallUser(null);
      }
    });

    return () => unsubscribe();
  }, [user?.uid, activeCall]);

  useEffect(() => {
    if (!user || !activeCall) return;

    // Listen for call status changes (for both caller and receiver)
    const unsubscribe = onSnapshot(doc(db, 'calls', activeCall.id), async (snapshot) => {
      if (!snapshot.exists()) {
        setActiveCall(null);
        setCallUser(null);
        return;
      }
      
      const data = { id: snapshot.id, ...snapshot.data() } as Call;
      if (data.status === 'rejected' || data.status === 'ended') {
        setActiveCall(null);
        setCallUser(null);
      } else if (data.status !== activeCall.status) {
        setActiveCall(data);
      }
    });

    return () => unsubscribe();
  }, [activeCall?.id, user?.uid]);

  const handleStartCall = async (call: Call) => {
    setActiveCall(call);
    // Fetch receiver info
    const userDoc = await getDoc(doc(db, 'users', call.receiverId));
    if (userDoc.exists()) {
      setCallUser(userDoc.data() as UserProfile);
    }
  };

  const handleAcceptCall = async () => {
    if (incomingCall) {
      setActiveCall(incomingCall);
      setIncomingCall(null);
    }
  };

  const handleRejectCall = async () => {
    if (incomingCall) {
      await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
      setIncomingCall(null);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-emerald-500"
        >
          <MessageSquare className="w-12 h-12 fill-emerald-500" />
        </motion.div>
      </div>
    );
  }

  if (!user || !currentUser) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f0f2f5] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-emerald-500 p-8 text-white text-center">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="inline-block p-4 bg-white/20 rounded-full mb-4"
            >
              <MessageSquare className="w-12 h-12 fill-white" />
            </motion.div>
            <h1 className="text-3xl font-bold mb-2">Echo</h1>
            <p className="text-emerald-100">Real-time messaging with voice notes</p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <Feature icon={<Zap className="w-5 h-5" />} text="Instant real-time messaging" />
              <Feature icon={<Mic className="w-5 h-5" />} text="High-quality voice notes" />
              <Feature icon={<Lock className="w-5 h-5" />} text="End-to-end encrypted chats" />
              <Feature icon={<Lock className="w-5 h-5" />} text="Secure Google authentication" />
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-zinc-900 text-white py-3 rounded-xl font-semibold hover:bg-zinc-800 transition-all active:scale-95 shadow-lg shadow-zinc-200"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
              Sign in with Google
            </button>
            
            <p className="text-center text-xs text-zinc-400">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#f0f2f5] flex items-center justify-center p-0 md:p-4">
      <div className="w-full h-full max-w-[1600px] bg-white shadow-2xl rounded-none md:rounded-lg overflow-hidden flex">
        <ChatSidebar 
          currentUser={currentUser} 
          onSelectChat={setSelectedChat} 
          onStartCall={handleStartCall}
          selectedChatId={selectedChat?.id}
          isMinimized={isSidebarMinimized}
          onToggleMinimize={() => setIsSidebarMinimized(!isSidebarMinimized)}
        />
        
        <div className="flex-1 h-full">
          {selectedChat ? (
            <ChatWindow 
              chat={selectedChat} 
              currentUser={currentUser} 
              onStartCall={handleStartCall}
              onLeaveChat={() => setSelectedChat(null)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-[#f8f9fa] border-b-4 border-emerald-500">
              <div className="text-center max-w-sm px-6">
                <div className="w-24 h-24 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="w-12 h-12 text-zinc-300" />
                </div>
                <h2 className="text-2xl font-light text-zinc-600 mb-2">Echo Web</h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Send and receive messages without keeping your phone online. 
                  Use Echo on up to 4 linked devices and 1 phone at the same time.
                </p>
              </div>
              <div className="absolute bottom-10 flex items-center gap-2 text-zinc-300 text-xs">
                <Shield className="w-3 h-3" />
                End-to-end encrypted
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call UI */}
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 right-8 z-[110] bg-white rounded-2xl shadow-2xl p-6 border border-zinc-200 flex items-center gap-6 min-w-[320px]"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 overflow-hidden">
              {callUser?.photoURL ? (
                <img src={callUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                incomingCall.type === 'video' ? <Video className="w-8 h-8" /> : <Phone className="w-8 h-8" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Incoming {incomingCall.type} call</p>
              <h3 className="font-semibold text-zinc-800">{callUser?.displayName || 'New Call'}</h3>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleRejectCall}
                className="p-3 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <button 
                onClick={handleAcceptCall}
                className="p-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200"
              >
                <Phone className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}

        {activeCall && (
          <CallOverlay 
            currentUser={currentUser}
            activeCall={activeCall}
            otherUser={callUser}
            onEndCall={() => {
              setActiveCall(null);
              setCallUser(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 text-zinc-600">
      <div className="text-emerald-500">{icon}</div>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
