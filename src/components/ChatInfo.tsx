import React, { useState, useEffect } from 'react';
import { X, Bell, BellOff, Image as ImageIcon, Users, ChevronRight, LogOut, Trash2, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Chat, UserProfile, Message } from '../types';
import { cn } from '../lib/utils';
import { VoiceMessage } from './VoiceMessage';

interface ChatInfoProps {
  chat: Chat;
  currentUser: UserProfile;
  messages: Message[];
  onClose: () => void;
  onLeaveChat: () => void;
  onClearChat: () => void;
}

export const ChatInfo: React.FC<ChatInfoProps> = ({ chat, currentUser, messages, onClose, onLeaveChat, onClearChat }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const voiceNotes = messages.filter(m => m.type === 'voice');
  
  const otherUser = chat.otherUser;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await onLeaveChat();
    } catch (err) {
      console.error('Error leaving chat:', err);
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await onClearChat();
    } catch (err) {
      console.error('Error clearing chat:', err);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="w-[400px] h-full bg-white border-l border-zinc-200 flex flex-col z-30 shadow-xl"
    >
      {/* Header */}
      <div className="h-[60px] flex items-center px-4 border-b border-zinc-100 bg-zinc-50">
        <button onClick={onClose} className="p-2 hover:bg-zinc-200 rounded-full transition-colors mr-2">
          <X className="w-5 h-5 text-zinc-500" />
        </button>
        <h2 className="font-semibold text-zinc-800">Chat Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50">
        {/* Profile Section */}
        <div className="bg-white p-8 flex flex-col items-center text-center mb-2 shadow-sm">
          <div className="w-32 h-32 rounded-full bg-zinc-200 overflow-hidden mb-4 shadow-md">
            {otherUser?.photoURL ? (
              <img src={otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-4xl font-bold">
                {otherUser?.displayName?.charAt(0)}
              </div>
            )}
          </div>
          <h3 className="text-xl font-semibold text-zinc-800">{otherUser?.displayName}</h3>
          <p className="text-zinc-500 text-sm">{otherUser?.email}</p>
        </div>

        {/* Encryption Section */}
        <div className="bg-white mb-2 shadow-sm p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Lock className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-zinc-800 mb-0.5">Encryption</h4>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Messages and calls are end-to-end encrypted. No one outside of this chat, not even the app, can read or listen to them. Click to learn more.
              </p>
            </div>
          </div>
        </div>

        {/* Media Section */}
        <div className="bg-white mb-2 shadow-sm">
          <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50">
            <div className="flex items-center gap-3 text-zinc-600">
              <ImageIcon className="w-5 h-5" />
              <span className="text-sm font-medium">Media, links and docs</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400">
              <span className="text-xs">{voiceNotes.length}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
          {voiceNotes.length > 0 && (
            <div className="px-4 pb-4 flex gap-2 overflow-x-auto scrollbar-hide">
              {voiceNotes.slice(0, 5).map((vn, i) => (
                <div key={vn.id} className="w-20 h-20 bg-zinc-100 rounded-lg flex-shrink-0 flex items-center justify-center border border-zinc-200">
                   <Play className="w-6 h-6 text-emerald-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Section */}
        <div className="bg-white mb-2 shadow-sm">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50"
            onClick={() => setIsMuted(!isMuted)}
          >
            <div className="flex items-center gap-3 text-zinc-600">
              {isMuted ? <BellOff className="w-5 h-5 text-zinc-400" /> : <Bell className="w-5 h-5" />}
              <span className="text-sm font-medium">Mute notifications</span>
            </div>
            <div className={cn(
              "w-10 h-5 rounded-full relative transition-colors",
              isMuted ? "bg-emerald-500" : "bg-zinc-300"
            )}>
              <div className={cn(
                "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                isMuted ? "right-1" : "left-1"
              )} />
            </div>
          </div>
        </div>

        {/* Participants Section */}
        <div className="bg-white mb-2 shadow-sm">
          <div className="p-4 border-b border-zinc-50">
            <div className="flex items-center gap-3 text-zinc-600 mb-4">
              <Users className="w-5 h-5" />
              <span className="text-sm font-medium">Participants</span>
            </div>
            <div className="space-y-4">
              <ParticipantItem user={currentUser} isMe />
              {otherUser && <ParticipantItem user={otherUser} />}
            </div>
          </div>
        </div>

        {/* Actions Section */}
        <div className="bg-white mb-8 shadow-sm">
          <button 
            onClick={() => setShowClearConfirm(true)}
            disabled={isClearing}
            className="w-full p-4 flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Trash2 className="w-5 h-5" />
            {isClearing ? 'Clearing...' : 'Clear Chat'}
          </button>
          <button 
            onClick={() => setShowLeaveConfirm(true)}
            disabled={isLeaving}
            className="w-full p-4 flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <LogOut className="w-5 h-5" />
            {isLeaving ? 'Leaving...' : 'Leave Chat'}
          </button>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Clear Chat?</h3>
              <p className="text-zinc-500 text-sm mb-6">
                Are you sure you want to clear all messages in this chat? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClear}
                  disabled={isClearing}
                  className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {isClearing ? 'Clearing...' : 'Clear'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Leave Confirmation Modal */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Leave Chat?</h3>
              <p className="text-zinc-500 text-sm mb-6">
                Are you sure you want to leave this chat? You won't be able to see messages unless you are added back.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeave}
                  disabled={isLeaving}
                  className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
                >
                  {isLeaving ? 'Leaving...' : 'Leave'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ParticipantItem = ({ user, isMe }: { user: UserProfile, isMe?: boolean }) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden">
      {user.photoURL ? (
        <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-400 font-bold">
          {user.displayName?.charAt(0)}
        </div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-zinc-800 truncate">
        {user.displayName} {isMe && <span className="text-zinc-400 font-normal">(You)</span>}
      </p>
      <p className="text-xs text-zinc-500 truncate">{user.email}</p>
    </div>
  </div>
);

const Play = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);
