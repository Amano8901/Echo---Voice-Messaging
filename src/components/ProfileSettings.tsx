import React, { useState, useRef } from 'react';
import { X, Camera, Loader2, Check, User, Mail } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface ProfileSettingsProps {
  currentUser: UserProfile;
  onClose: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ currentUser, onClose }) => {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || isUpdating) return;

    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: displayName.trim(),
      });
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingImage) return;

    setUploadingImage(true);
    try {
      const storageRef = ref(storage, `profiles/${currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);

      await updateDoc(doc(db, 'users', currentUser.uid), {
        photoURL,
      });
      
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      console.error('Error uploading image:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-emerald-500 p-6 text-white flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Profile Settings</h2>
            <p className="text-emerald-100 text-sm">Customize your presence on Echo</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {/* Profile Picture */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full bg-zinc-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-16 h-16 text-zinc-300" />
                )}
                
                {uploadingImage && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2.5 bg-emerald-500 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-all active:scale-95 group-hover:scale-110"
                disabled={uploadingImage}
              >
                <Camera className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
            </div>
            <p className="mt-4 text-xs text-zinc-400 font-medium uppercase tracking-wider">
              Click the camera to change photo
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <User className="w-3 h-3" />
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-zinc-800"
                maxLength={30}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <Mail className="w-3 h-3" />
                Email Address
              </label>
              <div className="px-4 py-3 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-500 text-sm flex items-center gap-2">
                {currentUser.email}
                <span className="text-[10px] bg-zinc-200 px-1.5 py-0.5 rounded uppercase">Read Only</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isUpdating || displayName === currentUser.displayName || !displayName.trim()}
                className={cn(
                  "w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                  updateSuccess 
                    ? "bg-emerald-100 text-emerald-600 shadow-emerald-100" 
                    : "bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 shadow-emerald-200 disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
                )}
              >
                {isUpdating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : updateSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    Updated Successfully
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};
