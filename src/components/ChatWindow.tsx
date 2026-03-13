import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  updateDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Send, Mic, Phone, Video, MoreVertical, Paperclip, Smile, Play, Check, CheckCheck, WifiOff, Clock, Trash2, Lock } from 'lucide-react';
import { db, storage } from '../firebase';
import { Message, UserProfile, Chat, Call } from '../types';
import { VoiceRecorder, VoiceRecorderHandle } from './VoiceRecorder';
import { VoiceMessage } from './VoiceMessage';
import { ChatInfo } from './ChatInfo';
import { format, isToday, isYesterday } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const formatMessageTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return format(date, 'HH:mm');
};

const DateSeparator = ({ date }: { date: Date }) => {
  let label = '';
  if (isToday(date)) label = 'Today';
  else if (isYesterday(date)) label = 'Yesterday';
  else label = format(date, 'MMMM d, yyyy');

  return (
    <div className="flex justify-center my-6 sticky top-2 z-10">
      <span className="bg-white/90 backdrop-blur-sm text-zinc-500 text-[10px] font-bold px-3 py-1 rounded-full shadow-sm border border-zinc-100 uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
};

interface ChatWindowProps {
  chat: Chat;
  currentUser: UserProfile;
  onStartCall: (call: Call) => void;
  onLeaveChat: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat, currentUser, onStartCall, onLeaveChat }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isHoldMode, setIsHoldMode] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingVoiceNotes, setPendingVoiceNotes] = useState<{ blob: Blob, chatId: string }[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<VoiceRecorderHandle>(null);

  const handleLeaveChat = async () => {
    if (!chat.id) return;
    try {
      const chatRef = doc(db, 'chats', chat.id);
      await updateDoc(chatRef, {
        participants: arrayRemove(currentUser.uid)
      });
      onLeaveChat();
    } catch (err) {
      console.error('Error leaving chat:', err);
      throw err;
    }
  };

  const handleClearChat = async () => {
    if (!chat.id) return;
    try {
      const messagesRef = collection(db, 'chats', chat.id, 'messages');
      const snapshot = await getDocs(messagesRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      // Update last message in chat doc
      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error clearing chat:', err);
      throw err;
    }
  };

  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [showDeleteToast, setShowDeleteToast] = useState(false);

  const handleDeleteClick = (messageId: string) => {
    setMessageToDelete(messageId);
  };

  const confirmDelete = async () => {
    if (!chat.id || !messageToDelete) return;
    try {
      await deleteDoc(doc(db, 'chats', chat.id, 'messages', messageToDelete));
      setMessageToDelete(null);
      setShowDeleteToast(true);
      setTimeout(() => setShowDeleteToast(false), 3000);
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  useEffect(() => {
    if (!chat.id) return;

    const q = query(
      collection(db, 'chats', chat.id, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        hasPendingWrites: doc.metadata.hasPendingWrites 
      } as Message));
      setMessages(msgs);

      // Mark unread messages from other user as read
      const unreadMessages = snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.senderId !== currentUser.uid && data.status !== 'read';
      });

      if (unreadMessages.length > 0) {
        const batch = writeBatch(db);
        unreadMessages.forEach(msgDoc => {
          batch.update(msgDoc.ref, { status: 'read' });
        });
        
        // Also update the chat's lastMessageStatus if the last message was from the other user
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.senderId !== currentUser.uid) {
          batch.update(doc(db, 'chats', chat.id), { lastMessageStatus: 'read' });
        }

        batch.commit().catch(err => console.error('Error marking messages as read:', err));
      }
    });

    return () => unsubscribe();
  }, [chat.id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingVoiceNotes.length > 0) {
      const processQueue = async () => {
        const notes = [...pendingVoiceNotes];
        setPendingVoiceNotes([]); 
        for (const note of notes) {
          await sendVoiceNote(note.blob, note.chatId);
        }
      };
      processQueue();
    }
  }, [isOnline, pendingVoiceNotes]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !chat.id) return;

    const text = inputText;
    setInputText('');

    try {
      const msgData = {
        chatId: chat.id,
        senderId: currentUser.uid,
        participantIds: chat.participants,
        text,
        type: 'text',
        status: 'sent',
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'chats', chat.id, 'messages'), msgData);
      await updateDoc(doc(db, 'chats', chat.id), {
        lastMessage: text,
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSenderId: currentUser.uid,
        lastMessageStatus: 'sent',
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const sendVoiceNote = async (blob: Blob, targetChatId?: string) => {
    const activeChatId = targetChatId || chat.id;
    if (!activeChatId) return;
    setIsRecording(false);

    if (!isOnline) {
      setPendingVoiceNotes(prev => [...prev, { blob, chatId: activeChatId }]);
      // Still add a "placeholder" or just wait? 
      // The user wants it to be sent automatically once connectivity is restored.
      // For now, we'll just queue it.
      return;
    }

    try {
      const fileName = `voice_${Date.now()}.webm`;
      const storageRef = ref(storage, `chats/${activeChatId}/${fileName}`);
      await uploadBytes(storageRef, blob);
      const audioUrl = await getDownloadURL(storageRef);

      const msgData = {
        chatId: activeChatId,
        senderId: currentUser.uid,
        participantIds: chat.participants,
        type: 'voice',
        audioUrl,
        status: 'sent',
        timestamp: serverTimestamp(),
      };

      await addDoc(collection(db, 'chats', activeChatId, 'messages'), msgData);
      await updateDoc(doc(db, 'chats', activeChatId), {
        lastMessage: '🎤 Voice note',
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSenderId: currentUser.uid,
        lastMessageStatus: 'sent',
      });
    } catch (err) {
      console.error('Error sending voice note:', err);
      // If it failed due to network, add to queue
      if (!navigator.onLine) {
        setPendingVoiceNotes(prev => [...prev, { blob, chatId: activeChatId }]);
      }
    }
  };

  const startRecording = (hold: boolean) => {
    setIsHoldMode(hold);
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (isHoldMode && recorderRef.current) {
      recorderRef.current.stopAndSend();
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!chat.otherUser) return;

    try {
      const callData = {
        callerId: currentUser.uid,
        receiverId: chat.otherUser.uid,
        type,
        status: 'calling',
        timestamp: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'calls'), callData);
      onStartCall({ id: docRef.id, ...callData } as Call);
    } catch (err) {
      console.error('Error starting call:', err);
    }
  };

  const toggleReaction = async (messageId: string, emoji: string, currentReactions?: { [key: string]: string[] }) => {
    if (!chat.id) return;
    const messageRef = doc(db, 'chats', chat.id, 'messages', messageId);
    const userHasReacted = currentReactions?.[emoji]?.includes(currentUser.uid);

    try {
      if (userHasReacted) {
        await updateDoc(messageRef, {
          [`reactions.${emoji}`]: arrayRemove(currentUser.uid)
        });
      } else {
        await updateDoc(messageRef, {
          [`reactions.${emoji}`]: arrayUnion(currentUser.uid)
        });
      }
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  };

  const commonEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col h-full bg-[#efeae2] relative min-w-0">
        {/* Background Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.06] pointer-events-none z-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M50 50c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10-10-4.477-10-10zM10 10c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10-10-4.477-10-10zM30 30c0-5.523 4.477-10 10-10s10 4.477 10 10-4.477 10-10 10-10-4.477-10-10z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '100px 100px'
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-zinc-200 z-10 shadow-sm">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setShowInfo(true)}
          >
            <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden">
            {chat.otherUser?.photoURL ? (
              <img src={chat.otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                {chat.otherUser?.displayName?.charAt(0)}
              </div>
            )}
          </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold text-zinc-800 leading-tight">{chat.otherUser?.displayName}</h2>
                <Lock className="w-3 h-3 text-emerald-500" />
              </div>
              <p className="text-xs text-zinc-500">Click for chat settings</p>
            </div>
        </div>
        <div className="flex items-center gap-5 text-zinc-500">
          {!isOnline && (
            <div className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded text-xs font-medium">
              <WifiOff className="w-3 h-3" />
              <span>Offline</span>
            </div>
          )}
          <Video 
            className="w-5 h-5 cursor-pointer hover:text-zinc-800" 
            onClick={() => startCall('video')}
          />
          <Phone 
            className="w-5 h-5 cursor-pointer hover:text-zinc-800" 
            onClick={() => startCall('audio')}
          />
          <div className="w-[1px] h-6 bg-zinc-200" />
          <MoreVertical 
            className="w-5 h-5 cursor-pointer hover:text-zinc-800" 
            onClick={() => setShowInfo(!showInfo)}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-hide relative z-0">
        {/* E2EE Banner */}
        <div className="flex justify-center mb-6">
          <div className="bg-amber-50/80 backdrop-blur-sm border border-amber-100/50 rounded-xl px-4 py-3 max-w-xs text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 text-amber-700 mb-1">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-wider">End-to-end encrypted</span>
            </div>
            <p className="text-[11px] text-amber-600/90 leading-relaxed">
              Messages and calls are secured with end-to-end encryption. No one outside of this chat can read or listen to them.
            </p>
          </div>
        </div>

        {messages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.uid;
          const date = msg.timestamp?.toDate ? msg.timestamp.toDate() : (msg.timestamp ? new Date(msg.timestamp) : new Date());
          const prevMsg = messages[index - 1];
          const prevDate = prevMsg?.timestamp?.toDate ? prevMsg.timestamp.toDate() : (prevMsg?.timestamp ? new Date(prevMsg.timestamp) : null);
          
          const showDateSeparator = !prevDate || date.toDateString() !== prevDate.toDateString();
          const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId || showDateSeparator;

          return (
            <React.Fragment key={msg.id}>
              {showDateSeparator && <DateSeparator date={date} />}
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={cn(
                  "flex w-full group relative",
                  isMe ? "justify-end" : "justify-start",
                  isFirstInGroup ? "mt-4" : "mt-1"
                )}
              >
                {!isMe && isFirstInGroup && (
                  <div className="absolute -left-12 top-0 w-9 h-9 rounded-full bg-zinc-200 overflow-hidden border-2 border-white shadow-md hidden md:block">
                    {chat.otherUser?.photoURL ? (
                      <img src={chat.otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                        {chat.otherUser?.displayName.charAt(0)}
                      </div>
                    )}
                  </div>
                )}

                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm relative transition-all",
                  isMe 
                    ? "bg-emerald-500 text-white rounded-tr-none" 
                    : "bg-white text-zinc-800 rounded-tl-none border border-zinc-100",
                  !isFirstInGroup && (isMe ? "rounded-tr-2xl" : "rounded-tl-2xl")
                )}>
                  {!isMe && isFirstInGroup && (
                    <div className="text-[11px] font-bold text-emerald-600 mb-1 leading-none">
                      {chat.otherUser?.displayName}
                    </div>
                  )}
                  {/* Reaction Picker (appears on hover) */}
                  <div className={cn(
                    "absolute -top-10 opacity-0 group-hover:opacity-100 transition-all bg-white shadow-xl rounded-full px-2 py-1.5 flex gap-1.5 z-20 border border-zinc-100 scale-90 group-hover:scale-100 items-center",
                    isMe ? "right-0" : "left-0"
                  )}>
                    {commonEmojis.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                        className="hover:scale-150 transition-transform text-lg leading-none"
                      >
                        {emoji}
                      </button>
                    ))}
                    {isMe && (
                      <>
                        <div className="w-[1px] h-4 bg-zinc-200 mx-1" />
                        <button
                          onClick={() => handleDeleteClick(msg.id)}
                          className="p-1.5 hover:bg-red-50 text-red-500 rounded-full transition-colors"
                          title="Delete message"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>

                  {msg.type === 'text' ? (
                    <div className="relative pb-4 pr-4">
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                        {msg.text}
                      </p>
                    </div>
                  ) : (
                    <div className="pb-4">
                      <VoiceMessage audioUrl={msg.audioUrl!} isMe={isMe} />
                    </div>
                  )}

                  {/* Reactions Display */}
                  {msg.reactions && Object.entries(msg.reactions).some(([_, uids]) => (uids as string[]).length > 0) && (
                    <div className={cn(
                      "flex flex-wrap gap-1 mt-1 mb-1",
                      isMe ? "justify-end" : "justify-start"
                    )}>
                      {Object.entries(msg.reactions).map(([emoji, uids]) => {
                        const userIds = uids as string[];
                        if (userIds.length === 0) return null;
                        const hasReacted = userIds.includes(currentUser.uid);
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji, msg.reactions)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border shadow-sm transition-all active:scale-90",
                              hasReacted 
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                : isMe 
                                  ? "bg-emerald-600/20 border-emerald-400/30 text-emerald-100 hover:bg-emerald-600/30"
                                  : "bg-zinc-50 border-zinc-100 text-zinc-500 hover:bg-zinc-100"
                            )}
                          >
                            <span>{emoji}</span>
                            <span className="font-bold">{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Meta Info */}
                  <div className={cn(
                    "flex items-center gap-1.5 absolute bottom-1.5 right-2.5",
                    isMe ? "text-emerald-100" : "text-zinc-400"
                  )}>
                    <Lock className="w-2.5 h-2.5 opacity-60" />
                    <span className="text-[10px] font-medium opacity-80">
                      {formatMessageTime(msg.timestamp)}
                    </span>
                    {msg.hasPendingWrites ? (
                      <Clock className="w-3 h-3 animate-pulse" />
                    ) : isMe && (
                      <div className="flex items-center">
                        {msg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </React.Fragment>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-50 border-t border-zinc-200 z-10">
        <AnimatePresence mode="wait">
          {isRecording ? (
            <motion.div
              key="recorder"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl p-2 shadow-lg border border-zinc-100"
            >
              <VoiceRecorder 
                ref={recorderRef}
                onSend={sendVoiceNote} 
                onCancel={() => setIsRecording(false)} 
                isHoldMode={isHoldMode}
              />
            </motion.div>
          ) : (
            <motion.form
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={sendMessage}
              className="flex items-center gap-2"
            >
              <div className="flex items-center gap-1 text-zinc-400">
                <button type="button" className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
                  <Smile className="w-6 h-6" />
                </button>
                <button type="button" className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
                  <Paperclip className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a message"
                  className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-[15px] focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none placeholder:text-zinc-400 transition-all shadow-sm"
                />
              </div>
              {inputText.trim() ? (
                <button 
                  type="submit" 
                  className="bg-emerald-500 text-white p-2.5 rounded-xl hover:bg-emerald-600 transition-all active:scale-90 shadow-md shadow-emerald-200"
                >
                  <Send className="w-6 h-6" />
                </button>
              ) : (
                <button 
                  type="button" 
                  onMouseDown={() => startRecording(true)}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    startRecording(true);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    stopRecording();
                  }}
                  onClick={() => startRecording(false)}
                  className="bg-zinc-200 text-zinc-600 p-2.5 rounded-xl hover:bg-zinc-300 transition-all active:scale-90 shadow-sm"
                >
                  <Mic className="w-6 h-6" />
                </button>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showInfo && (
          <ChatInfo 
            chat={chat} 
            currentUser={currentUser} 
            messages={messages}
            onClose={() => setShowInfo(false)} 
            onLeaveChat={handleLeaveChat}
            onClearChat={handleClearChat}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {messageToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-lg font-bold text-zinc-800 mb-2">Delete Message?</h3>
              <p className="text-zinc-500 text-sm mb-6">
                Are you sure you want to delete this message? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setMessageToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showDeleteToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-zinc-700">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium">Message deleted</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
};
