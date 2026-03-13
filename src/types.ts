export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  lastSeen?: any;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageTimestamp?: any;
  lastMessageSenderId?: string;
  lastMessageStatus?: 'sent' | 'read';
  otherUser?: UserProfile; // Joined data for UI
}

export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'calling' | 'ongoing' | 'ended' | 'missed' | 'rejected';
  offer?: any;
  answer?: any;
  timestamp: any;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  type: 'text' | 'voice';
  audioUrl?: string;
  timestamp: any;
  status?: 'sent' | 'read';
  reactions?: { [emoji: string]: string[] }; // emoji -> list of userIds
  hasPendingWrites?: boolean;
}

export interface Contact {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  status?: string;
}
