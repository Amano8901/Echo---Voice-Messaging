import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  doc,
  getDoc,
  collectionGroup
} from 'firebase/firestore';
import { Search, MessageSquarePlus, MoreVertical, LogOut, Check, CheckCheck, MessageSquare, Users, UserPlus, Phone, Video, User, PanelLeftClose, PanelLeftOpen, Lock } from 'lucide-react';
import { db, logout } from '../firebase';
import { Chat, UserProfile, Message, Contact, Call } from '../types';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '../lib/utils';
import { ProfileSettings } from './ProfileSettings';
import { AnimatePresence } from 'motion/react';

const formatLastMessageTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  if (isToday(date)) {
    return format(date, 'HH:mm');
  } else if (isYesterday(date)) {
    return 'Yesterday';
  } else {
    return format(date, 'dd/MM/yy');
  }
};

interface ChatSidebarProps {
  currentUser: UserProfile;
  onSelectChat: (chat: Chat) => void;
  onStartCall: (call: Call) => void;
  selectedChatId?: string;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ 
  currentUser, 
  onSelectChat, 
  onStartCall, 
  selectedChatId,
  isMinimized = false,
  onToggleMinimize
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');
  const [chats, setChats] = useState<Chat[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [messageResults, setMessageResults] = useState<(Message & { chat?: Chat })[]>([]);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatList = await Promise.all(snapshot.docs.map(async (chatDoc) => {
        const data = chatDoc.data() as Chat;
        const otherUserId = data.participants.find(id => id !== currentUser.uid);
        
        let otherUser: UserProfile | undefined;
        if (otherUserId) {
          const userDoc = await getDoc(doc(db, 'users', otherUserId));
          if (userDoc.exists()) {
            otherUser = userDoc.data() as UserProfile;
          }
        }

        return {
          id: chatDoc.id,
          ...data,
          otherUser
        };
      }));

      setChats(chatList.sort((a, b) => {
        const timeA = a.lastMessageTimestamp?.toDate?.() || 0;
        const timeB = b.lastMessageTimestamp?.toDate?.() || 0;
        return timeB - timeA;
      }));
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  useEffect(() => {
    // Fetch all users as contacts for now
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(user => user.uid !== currentUser.uid);
      setContacts(userList);
    });

    return () => unsubscribe();
  }, [currentUser.uid]);

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (val.length > 2) {
      setIsSearching(true);
      
      // Search users
      const userQuery = query(
        collection(db, 'users'),
        where('email', '>=', val),
        where('email', '<=', val + '\uf8ff')
      );
      
      // Search messages
      const messageQuery = query(
        collectionGroup(db, 'messages'),
        where('participantIds', 'array-contains', currentUser.uid),
        where('text', '>=', val),
        where('text', '<=', val + '\uf8ff')
      );

      const [userSnapshot, messageSnapshot] = await Promise.all([
        getDocs(userQuery),
        getDocs(messageQuery)
      ]);

      setSearchResults(userSnapshot.docs
        .map(d => d.data() as UserProfile)
        .filter(u => u.uid !== currentUser.uid)
      );

      const msgResults = messageSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      
      // Filter messages to only those in user's chats and attach chat info
      const filteredMsgs = msgResults
        .map(msg => {
          const chat = chats.find(c => c.id === msg.chatId);
          return { ...msg, chat };
        })
        .filter(msg => msg.chat !== undefined);

      setMessageResults(filteredMsgs as (Message & { chat: Chat })[]);
    } else {
      setIsSearching(false);
      setSearchResults([]);
      setMessageResults([]);
    }
  };

  const startChat = async (otherUser: UserProfile) => {
    // Check if chat already exists
    const existingChat = chats.find(c => c.participants.includes(otherUser.uid));
    if (existingChat) {
      onSelectChat(existingChat);
      setIsSearching(false);
      setSearchTerm('');
      return;
    }

    try {
      const newChatData = {
        participants: [currentUser.uid, otherUser.uid],
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'chats'), newChatData);
      onSelectChat({ id: docRef.id, ...newChatData, otherUser });
      setIsSearching(false);
      setSearchTerm('');
    } catch (err) {
      console.error('Error starting chat:', err);
    }
  };

  const initiateCall = async (otherUser: UserProfile, type: 'audio' | 'video') => {
    // First ensure chat exists
    let chatId = chats.find(c => c.participants.includes(otherUser.uid))?.id;
    
    if (!chatId) {
      try {
        const newChatData = {
          participants: [currentUser.uid, otherUser.uid],
          lastMessage: '',
          lastMessageTimestamp: serverTimestamp(),
        };
        const docRef = await addDoc(collection(db, 'chats'), newChatData);
        chatId = docRef.id;
        onSelectChat({ id: chatId, ...newChatData, otherUser });
      } catch (err) {
        console.error('Error creating chat for call:', err);
        return;
      }
    } else {
      const chat = chats.find(c => c.id === chatId);
      if (chat) onSelectChat(chat);
    }

    // Now start the call
    try {
      const callData = {
        callerId: currentUser.uid,
        receiverId: otherUser.uid,
        type,
        status: 'calling',
        timestamp: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'calls'), callData);
      onStartCall({ id: docRef.id, ...callData } as Call);
    } catch (err) {
      console.error('Error starting call from sidebar:', err);
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full bg-white border-r border-zinc-200 transition-all duration-300 ease-in-out relative",
      isMinimized ? "w-[80px] min-w-[80px]" : "w-[350px] min-w-[350px]"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center bg-zinc-50 border-b border-zinc-200 px-4 py-3",
        isMinimized ? "flex-col gap-4" : "justify-between"
      )}>
        <div 
          className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500 transition-all shrink-0 relative group"
          onClick={() => setShowProfile(true)}
        >
          {currentUser.photoURL ? (
            <img src={currentUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
              {currentUser.displayName.charAt(0)}
            </div>
          )}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Lock className="w-4 h-4 text-white" />
          </div>
        </div>
        
        {!isMinimized ? (
          <div className="flex items-center gap-4 text-zinc-500">
            <MessageSquarePlus className="w-5 h-5 cursor-pointer hover:text-zinc-800" />
            <button onClick={logout} title="Logout">
              <LogOut className="w-5 h-5 cursor-pointer hover:text-zinc-800" />
            </button>
            <button onClick={onToggleMinimize} title="Minimize Sidebar">
              <PanelLeftClose className="w-5 h-5 cursor-pointer hover:text-zinc-800" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-zinc-500">
            <button onClick={onToggleMinimize} title="Expand Sidebar">
              <PanelLeftOpen className="w-5 h-5 cursor-pointer hover:text-zinc-800" />
            </button>
            <button onClick={logout} title="Logout">
              <LogOut className="w-5 h-5 cursor-pointer hover:text-zinc-800" />
            </button>
          </div>
        )}
      </div>

      {/* Profile Settings Modal */}
      <AnimatePresence>
        {showProfile && (
          <ProfileSettings 
            currentUser={currentUser} 
            onClose={() => setShowProfile(false)} 
          />
        )}
      </AnimatePresence>

      {/* Tabs */}
      {!isMinimized && (
        <div className="flex border-b border-zinc-100">
          <button
            onClick={() => setActiveTab('chats')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === 'chats' ? "border-emerald-500 text-emerald-600" : "border-transparent text-zinc-500 hover:text-zinc-700"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>Chats</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === 'contacts' ? "border-emerald-500 text-emerald-600" : "border-transparent text-zinc-500 hover:text-zinc-700"
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <Users className="w-4 h-4" />
              <span>Contacts</span>
            </div>
          </button>
        </div>
      )}

      {/* Search */}
      {!isMinimized && (
        <div className="p-2">
          <div className="flex items-center gap-3 bg-zinc-100 rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchTerm}
              onChange={handleSearch}
              className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-zinc-400"
            />
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="space-y-4 pb-4">
            {/* User Results */}
            {searchResults.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">People</p>
                {searchResults.map(user => (
                  <div
                    key={user.uid}
                    onClick={() => startChat(user)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden">
                      {user.photoURL && <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
                    </div>
                    <div className="flex-1 border-b border-zinc-100 pb-3">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-zinc-800">{user.displayName}</h3>
                        <Lock className="w-2.5 h-2.5 text-emerald-500" />
                      </div>
                      <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Message Results */}
            {messageResults.length > 0 && (
              <div>
                <p className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Messages</p>
                {messageResults.map(msg => (
                  <div
                    key={msg.id}
                    onClick={() => {
                      if (msg.chat) {
                        onSelectChat(msg.chat);
                        setIsSearching(false);
                        setSearchTerm('');
                      }
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0 border-b border-zinc-100 pb-3">
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h3 className="font-medium text-sm text-zinc-800 truncate">
                            {msg.chat?.otherUser?.displayName}
                          </h3>
                          <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'MMM d') : ''}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate italic">
                        "{msg.text}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchResults.length === 0 && messageResults.length === 0 && searchTerm.length > 2 && (
              <p className="px-4 py-8 text-sm text-zinc-500 text-center">No results found for "{searchTerm}"</p>
            )}
          </div>
        ) : activeTab === 'chats' ? (
          <div className="divide-y divide-zinc-50">
            {chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                  selectedChatId === chat.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                )}
              >
                <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden flex-shrink-0">
                  {chat.otherUser?.photoURL ? (
                    <img src={chat.otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                      {chat.otherUser?.displayName?.charAt(0)}
                    </div>
                  )}
                </div>
                {!isMinimized && (
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <div className="flex items-center gap-1 min-w-0">
                        <h3 className="font-medium text-zinc-800 truncate">{chat.otherUser?.displayName}</h3>
                        <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {formatLastMessageTime(chat.lastMessageTimestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {chat.lastMessageSenderId === currentUser.uid && chat.lastMessage && (
                        chat.lastMessageStatus === 'read' ? (
                          <CheckCheck className="w-4 h-4 text-sky-500" />
                        ) : (
                          <Check className="w-4 h-4 text-zinc-400" />
                        )
                      )}
                      <p className="text-xs text-zinc-500 truncate">
                        {chat.lastMessage || 'Start a conversation'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <MessageSquarePlus className="w-12 h-12 text-zinc-200 mb-4" />
                <p className="text-sm text-zinc-500">Search for a user by email to start chatting</p>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-zinc-50">
            {contacts.map(contact => (
              <div
                key={contact.uid}
                onClick={() => startChat(contact)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 cursor-pointer transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-200 overflow-hidden flex-shrink-0">
                  {contact.photoURL ? (
                    <img src={contact.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 font-bold">
                      {contact.displayName?.charAt(0)}
                    </div>
                  )}
                </div>
                {!isMinimized && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-zinc-800 truncate">{contact.displayName}</h3>
                        <Lock className="w-2.5 h-2.5 text-emerald-500" />
                      </div>
                      <p className="text-xs text-zinc-400 truncate">{contact.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          startChat(contact);
                        }}
                        className="p-2 hover:bg-zinc-100 rounded-full text-emerald-500 transition-colors"
                        title="Message"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          initiateCall(contact, 'audio');
                        }}
                        className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-emerald-500 transition-colors"
                        title="Voice Call"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          initiateCall(contact, 'video');
                        }}
                        className="p-2 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-emerald-500 transition-colors"
                        title="Video Call"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {contacts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <UserPlus className="w-12 h-12 text-zinc-200 mb-4" />
                <p className="text-sm text-zinc-500">No contacts found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
